// Independent real-business build. Never writes the active Harmony smoke tree,
// original business sources/configs, or pinned upstream sources.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { pack, unpack, type ArchiveEntries } from './archive';
import { VALDI_PROJECT_CONFIG, generateNativeCode, nativeSourceFiles, type CodegenModule } from './codegen/index';
import { appModules, buildModule, inlineSourceMaps, moduleConfig, precompile, root, sourceMapJson, type Built } from './pipeline';
import { addFontEntries, assetCatalog, findFonts, findImages, writeResTs } from './resources';
import { compileRuntimeModule, type RuntimeModuleSpec } from './runtime-module';
import { valdiTs, type ValdiModule, type ValdiTsPlugin } from './valdiTs';

export const runtimeNames = ['coreutils', 'jasmine', 'source_map', 'valdi_tsx', 'valdi_core', 'client_sql', 'valdi_http'];
export const defaultBusinessOut = path.join(root, '.tools/harmony/business-rawfile');
export const defaultBusinessStage = path.join(root, '.tools/harmony/business-stage');
export const defaultBusinessBindings = path.join(root, '.tools/harmony/business-bindings');

export interface BusinessBuildOptions {
  source?: string;
  out?: string;
  stage?: string;
  bindings?: string;
  gitSource?: string;
  /** Source-mapped JavaScript for a development runtime; release remains the default. */
  development?: boolean;
}

function files(directory: string, accept: (file: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '.gen' || entry.name === 'node_modules' ? [] : files(file, accept);
    return accept(file) ? [file] : [];
  });
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const inside = (parent: string, file: string) => {
  const relative = path.relative(parent, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

type FilesystemAncestry = Map<string, Set<string>>;

/** Existing directory identities plus the suffix still to be created below each.
 * realpath resolves symlinks, but macOS volume aliases still need dev/ino comparison.
 * Retain lexical ancestors too: removing a symlink inside sources changes sources
 * even when its resolved target is an otherwise safe output directory.
 */
function filesystemAncestry(directory: string): FilesystemAncestry {
  const locations: FilesystemAncestry = new Map();
  let current = path.resolve(directory);
  let suffix: string[] = [];
  try {
    // lstat distinguishes an absent component from a dangling link. Only ENOENT
    // permits an unresolved suffix; permissions, loops and ENOTDIR fail closed.
    for (;;) {
      try {
        lstatSync(current);
        break;
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(current) === current) throw cause;
        suffix.unshift(path.basename(current));
        current = path.dirname(current);
      }
    }
    for (;;) {
      let physical = realpathSync(current);
      const remaining = [...suffix];
      for (;;) {
        const stats = statSync(physical, { bigint: true });
        if (!stats.isDirectory()) throw new Error(`Not a directory: ${physical}`);
        const identity = `${stats.dev}:${stats.ino}`;
        const tails = locations.get(identity) ?? new Set<string>();
        // Be conservative for missing names on case-insensitive/normalizing
        // filesystems too, without creating probe files to detect their rules.
        tails.add(remaining.map(part => part.normalize('NFC').toLowerCase()).join('/'));
        locations.set(identity, tails);
        const parent = path.dirname(physical);
        if (parent === physical) break;
        remaining.unshift(path.basename(physical));
        physical = parent;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  } catch (cause) {
    throw new Error(`Cannot safely inspect business path ${directory}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  return locations;
}

function filesystemOverlap(left: FilesystemAncestry, right: FilesystemAncestry): boolean {
  for (const [identity, leftTails] of left) {
    for (const rightTail of right.get(identity) ?? []) {
      for (const leftTail of leftTails) {
        if (leftTail === rightTail || leftTail === '' || rightTail === ''
          || leftTail.startsWith(rightTail + '/') || rightTail.startsWith(leftTail + '/')) return true;
      }
    }
  }
  return false;
}

/** These directories are dedicated build outputs. Refuse source/smoke overlap before removing anything. */
export function validateOutputs(outputs: string[], source: string): void {
  outputs = outputs.map(output => path.resolve(output));
  source = path.resolve(source);
  const protectedPaths = [
    path.join(root, 'harmony'), path.join(root, 'valdi'), path.join(root, 'tools'),
    path.join(root, 'scripts'), source,
  ];
  for (const output of outputs) {
    if (output === root || protectedPaths.some(protectedPath => inside(output, protectedPath) || inside(protectedPath, output))) {
      throw new Error(`Business output overlaps sources or active smoke: ${output}`);
    }
    for (const other of outputs) {
      if (other !== output && (inside(output, other) || inside(other, output))) {
        throw new Error(`Business output directories must be disjoint: ${output}, ${other}`);
      }
    }
  }
  if (new Set(outputs).size !== outputs.length) throw new Error('Business output directories must be distinct');
  const protectedLocations = protectedPaths.map(filesystemAncestry);
  const outputLocations = outputs.map(filesystemAncestry);
  for (let index = 0; index < outputs.length; index++) {
    if (protectedLocations.some(protectedLocation => filesystemOverlap(outputLocations[index], protectedLocation))) {
      throw new Error(`Business output overlaps sources or active smoke: ${outputs[index]}`);
    }
    for (let other = 0; other < index; other++) {
      if (filesystemOverlap(outputLocations[index], outputLocations[other])) {
        throw new Error(`Business output directories must be disjoint: ${outputs[index]}, ${outputs[other]}`);
      }
    }
  }
}

/** Verify consumed TS/config inputs against the local immutable git object. No network or upstream edits. */
export function pinnedInputs(source: string, gitSource: string, pin: string, inputs: string[]): Record<string, string> {
  const tree = execFileSync('git', ['-C', gitSource, 'ls-tree', '-rz', pin, '--',
    'src/valdi_modules/src/valdi', 'modules/_configs', 'modules/types', 'MODULE.bazel',
  ], { maxBuffer: 16 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
  const blobs = new Map(tree.map(entry => {
    const match = /^100(?:644|755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    return match ? [match[2], match[1]] : ['', ''];
  }));
  const verified: Record<string, string> = {};
  const changed: string[] = [];
  for (const file of inputs) {
    const relative = path.relative(source, file).split(path.sep).join('/');
    const data = readFileSync(file);
    const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    if (blobs.get(relative) !== blob) changed.push(relative);
    verified[relative] = sha256(data);
  }
  if (changed.length) {
    // Existing prepare-runtime applies a platform overlay to the staged pin.
    // Reproduce it on pristine temporary inputs instead of exempting filenames
    // from verification or editing the shared upstream tree.
    const temporary = mkdtempSync(path.join(tmpdir(), 'verify-'));
    try {
      const core = 'src/valdi_modules/src/valdi/valdi_core';
      const overlayInputs = [
        'valdi_core/src/valdi_core/cpp/Context/PlatformType.hpp',
        'valdi_core/valdi_core.djinni', 'valdi_core/generated-src/cpp/valdi_core/Platform.hpp',
        'valdi_core/generated-src/cpp/valdi_core/AssetOutputType.hpp',
        'valdi/src/valdi/runtime/JavaScript/JavaScriptRuntime.cpp',
        'valdi/src/valdi/runtime/RuntimeManager.cpp', 'valdi/src/valdi/runtime/Attributes/DefaultAttributes.cpp',
        ...['JSXBootstrap.ts', 'ValdiRuntime.d.ts', 'Asset.ts', 'DeviceBridge.d.ts', 'Device.ts']
          .map(name => `${core}/src/${name}`),
        `${core}/src/utils/PropertyList.ts`,
        'src/valdi_modules/src/valdi/valdi_tsx/src/JSX.ts', `${core}/test/JSXPlatformTest.cjs`,
      ];
      const archive = execFileSync('git', ['-C', gitSource, 'archive', pin, '--',
        'valdi/src/valdi/runtime', 'valdi_core',
        ...overlayInputs.filter(file => file.startsWith('src/')),
      ], { maxBuffer: 64 * 1024 * 1024 });
      execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
      const script = path.join(root, 'scripts/harmony/apply-platform.mjs');
      execFileSync(process.execPath, [script, temporary], { stdio: 'pipe' });
      for (const relative of changed) {
        if (!overlayInputs.includes(relative) || !readFileSync(path.join(source, relative))
          .equals(readFileSync(path.join(temporary, relative)))) {
          throw new Error(`Business input does not match ${pin} plus Harmony overlay: ${relative}`);
        }
      }
      verified['scripts/harmony/apply-platform.mjs'] = sha256(readFileSync(script));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  return verified;
}

function literalRequires(entries: ArchiveEntries): string[] {
  const imports = new Set<string>();
  for (const [name, bytes] of entries) {
    if (!name.endsWith('.js')) continue;
    const file = ts.createSourceFile(name, bytes.toString(), ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require'
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...imports].sort();
}

function checkArchive(name: string, archive: Buffer, development: boolean): number {
  const entries = unpack(archive);
  let count = 0;
  for (const [file, bytes] of entries) {
    if (!file.endsWith('.js')) continue;
    if (development) {
      if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x0100c634) {
        throw new Error(`Unexpected bytecode in development archive: ${name}/${file}`);
      }
      count++;
      continue;
    }
    if (bytes.length < 16 || bytes.readUInt32LE(0) !== 0x0100c634
      || bytes.readBigUInt64LE(4) !== 0x1f1903c103bc1fc6n || bytes.readUInt32LE(12) !== 99) {
      throw new Error(`Not a pinned HBC99 entry: ${name}/${file}`);
    }
    count++;
  }
  return count;
}

/** Keep release metadata unchanged; JavaScript does not have an HBC version. */
export function businessPackagingInfo(development = false) {
  return development
    ? { compilationMode: 'js' as const, minified: false, sourceMaps: 'inline' as const }
    : { hbcVersion: 99 };
}

export function businessArchiveProof(name: string, archive: Buffer, development = false) {
  const count = checkArchive(name, archive, development);
  return {
    sha256: sha256(archive),
    ...(development ? { javascriptEntries: count } : { hbcEntries: count }),
    diagnostics: 0,
  };
}

/** The same compiler/map path as dev.ts; do not rewrite map URLs or sourcesContent. */
export async function buildBusinessModule(module: ValdiModule, plugin: ValdiTsPlugin, development = false): Promise<Built> {
  const built = await buildModule(module, plugin, !development);
  if (development) inlineSourceMaps(built);
  return built;
}

/** Finalize only after resources have been added; the existing release hash contract is shared. */
export async function packageBusinessModule(built: Built, development = false): Promise<Buffer> {
  if (!development) await precompile(built.entries);
  const hash = createHash('sha256');
  for (const [name, bytes] of [...built.entries].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update(bytes);
  built.entries.set('hash', Buffer.from(hash.digest('hex')));
  return pack(built.entries);
}

export function businessRuntimeSpec(
  name: string, source: string, outputModules: string, sources: string[], development = false,
): RuntimeModuleSpec {
  const upstreamModules = path.join(source, 'src/valdi_modules/src/valdi');
  return {
    name, moduleDirectory: path.join(upstreamModules, name), sources,
    dependencies: runtimeNames.filter(dep => dep !== name).map(dep => ({
      module_name: dep, module_path: path.join(upstreamModules, dep), module_content: '',
    })),
    outputs: ['valdimodule', 'map.json'].map(extension => ({
      path: path.join(outputModules, `${name}.${extension}`),
      relative: `cpp/${development ? 'debug' : 'release'}/assets/${name}.${extension}`, directory: false,
    })),
    iosModuleName: name, iosClassPrefix: '__valdi_unset_ios_class_prefix__', androidClassPath: '',
    disableAnnotations: true, asyncStrictMode: false, compilationMode: development ? 'js' : 'js_bytecode',
  };
}

export async function buildBusiness(options: BusinessBuildOptions = {}): Promise<void> {
  const development = options.development ?? false;
  if (typeof development !== 'boolean') throw new Error('development must be a boolean');
  const source = path.resolve(options.source ?? path.join(root, '.tools/harmony/upstream'));
  const out = path.resolve(options.out ?? defaultBusinessOut);
  const stage = path.resolve(options.stage ?? defaultBusinessStage);
  const bindings = path.resolve(options.bindings ?? defaultBusinessBindings);
  const gitSource = path.resolve(options.gitSource ?? process.env.VALDI_FORK_SOURCE ?? path.join(root, '../Valdi-node-only'));
  validateOutputs([out, stage, bindings], source);
  const pin = readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8').match(/VALDI_COMMIT = "([a-f0-9]+)"/)?.[1];
  if (!pin) throw new Error('Missing immutable VALDI_COMMIT');
  const upstreamModules = path.join(source, 'src/valdi_modules/src/valdi');
  const runtimeSources = new Map(runtimeNames.map(name => [
    name, files(path.join(upstreamModules, name, 'src'), file => /\.(tsx?|js)$/.test(file)),
  ]));
  // Include declarations of transitive runtime dependencies as well as actual emit inputs.
  const upstreamInputs = [
    path.join(source, 'MODULE.bazel'),
    ...files(path.join(source, 'modules/_configs'), file => file.endsWith('.json')),
    ...files(path.join(source, 'modules/types'), file => file.endsWith('.ts')),
    ...files(upstreamModules, file => /\.(tsx?|js)$/.test(file)),
  ];
  const pinned = pinnedInputs(source, gitSource, pin, upstreamInputs);
  const originals = appModules();
  if (!originals.some(module => module.name === 'app_pages')) throw new Error('Business build requires enabled app_pages');
  process.env.VALDI_SOURCE_ROOT = source;
  // Source verification can take time; inspect ancestry again before removal.
  validateOutputs([out, stage, bindings], source);
  for (const directory of [out, stage, bindings]) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
  }
  const outputModules = path.join(out, 'modules');
  mkdirSync(outputModules, { recursive: true });
  writeFileSync(path.join(outputModules, 'valdi_api_version'), '0\n');

  const moduleProof: Record<string, unknown> = {};
  for (const name of runtimeNames) {
    const spec = businessRuntimeSpec(name, source, outputModules, runtimeSources.get(name)!, development);
    await compileRuntimeModule(spec, root);
    const archive = readFileSync(path.join(outputModules, `${name}.valdimodule`));
    moduleProof[name] = businessArchiveProof(name, archive, development);
  }

  const localInputs: Record<string, string> = {};
  const modules: ValdiModule[] = [];
  for (const original of [...originals, {
    name: 'harmony_business', dir: path.join(root, 'harmony/business'), generatedDirs: [],
    nodeModules: path.join(root, 'valdi/node_modules'),
  }]) {
    const dir = path.join(stage, original.name);
    mkdirSync(dir, { recursive: true });
    for (const name of ['src', 'res']) {
      if (!existsSync(path.join(original.dir, name))) continue;
      cpSync(path.join(original.dir, name), path.join(dir, name), { recursive: true });
      for (const file of files(path.join(original.dir, name), () => true)) {
        localInputs[path.relative(root, file)] = sha256(readFileSync(file));
      }
    }
    for (const name of ['module.json', 'BUILD.bazel']) {
      const file = path.join(original.dir, name);
      if (existsSync(file)) localInputs[path.relative(root, file)] = sha256(readFileSync(file));
    }
    const module = { ...original, dir, generatedDirs: [path.join(dir, '.gen')] };
    symlinkSync(original.nodeModules!, path.join(dir, 'node_modules'), 'junction');
    modules.push(module);
  }
  // Resources/configs for every dependency must exist before any TS Program is opened.
  const resources = new Map(await Promise.all(modules.map(async module => {
    const images = await findImages(module);
    const fonts = findFonts(module) ?? [];
    writeResTs(module, images, module.generatedDirs[0], fonts);
    return [module.name, { images, fonts }] as const;
  })));
  for (const module of modules) {
    writeFileSync(path.join(module.dir, 'tsconfig.json'), JSON.stringify({
      extends: path.join(source, 'modules/_configs/base.tsconfig.json'),
      compilerOptions: {
        paths: Object.fromEntries([
          ...runtimeNames.map(name => [`${name}/*`, [path.join(upstreamModules, name, '*')]]),
          ...modules.map(other => [`${other.name}/*`, [path.join(other.dir, '*'), ...other.generatedDirs.map(dir => path.join(dir, '*'))]]),
          ['tslib', [path.join(upstreamModules, 'valdi_core/src/tslib')]],
          ['Valdi', [path.join(upstreamModules, 'valdi_core/src/Valdi')]],
        ]),
        types: [path.join(source, 'modules/types/Long'), path.join(source, 'modules/types/globals')],
      },
      include: ['src/**/*.ts', 'src/**/*.tsx', '.gen/**/*.ts'],
    }, null, 2) + '\n');
  }
  const targets: CodegenModule[] = modules.map(module => {
    const config = moduleConfig(module.name);
    return {
      module, bundleInfo: {
        ...VALDI_PROJECT_CONFIG, name: module.name, iosModuleName: config.iosModuleName ?? module.name,
        iosLanguage: config.iosLanguage ?? 'objc', asyncStrictMode: false,
      },
    };
  });
  for (const target of targets) {
    target.nativeDependencies = targets.filter(other => other !== target).map(({ module, bundleInfo }) => ({ module, bundleInfo }));
  }
  for (const target of targets) {
    const { module } = target;
    const plugin = valdiTs(module, undefined, true);
    const diagnostics = plugin.diagnostics();
    if (diagnostics) throw new Error(diagnostics);
    target.program = () => plugin.program();
    const built = await buildBusinessModule(module, plugin, development);
    const requires = literalRequires(built.entries);
    const native = generateNativeCode(target, message => { throw new Error(message); });
    const nativeFiles: string[] = [];
    for (const [relative, content] of nativeSourceFiles(target, native, 'cpp')) {
      const file = path.join(bindings, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
      nativeFiles.push(relative);
    }
    const { images, fonts } = resources.get(module.name)!;
    if (images || fonts.length) built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
    addFontEntries(built.entries, fonts);
    for (const image of images ?? []) {
      const assets = path.join(out, 'assets', module.name);
      mkdirSync(assets, { recursive: true });
      cpSync(image.file, path.join(assets, `${image.name}.${image.extension}`));
      if (module.name === 'app_pages' && image.name.startsWith('tab_')) {
        mkdirSync(path.join(out, 'tab-icons'), { recursive: true });
        cpSync(image.file, path.join(out, 'tab-icons', `${image.name}.${image.extension}`));
      }
    }
    writeFileSync(path.join(outputModules, `${module.name}.map.json`), sourceMapJson(module.name, built));
    const archive = await packageBusinessModule(built, development);
    writeFileSync(path.join(outputModules, `${module.name}.valdimodule`), archive);
    moduleProof[module.name] = {
      ...businessArchiveProof(module.name, archive, development),
      requires, cppBindings: nativeFiles,
    };
    console.log(`Harmony business ${development ? 'JavaScript' : 'HBC'}: ${module.name}, ${built.entries.size} entries`);
  }
  const buildInfo = {
    schemaVersion: 1, profile: 'business',
    valdiCommit: pin, engine: 'hermes-260318099.0.4', ...businessPackagingInfo(development), platform: 6,
    modules: [...runtimeNames, ...modules.map(module => module.name)],
    bootstrap: {
      module: 'harmony_business/src/app', export: 'start',
      arguments: [], payloadGlobal: '__harmonyBusinessBootstrap',
      returns: 'RouteDeclaration',
      injects: ['__valdiRoutesTokenStore', '__valdiRoutesAppUIHost', '__valdiRoutesPermissionHost',
        '__valdiRoutesWifiHost', '__valdiRoutesNfcHost'],
      publication: 'updateRoutes receives exactly the unmodified typed app.startApp return once',
    },
    routing: { abi: 'typed-v1', declaration: 'RouteDeclaration', routes: 'RouteEntry[]',
      params: 'any (UNTYPED_MAP)', results: 'any (UNTYPED_MAP)', currentPages: 'StackPage[]' },
    stage, bindings, moduleProof, localInputs, pinnedInputs: pinned,
    backend: 'pending; existing LoginPage is a demo, not a verified backend login',
    runtimeExecuted: false,
  };
  const metadata = JSON.stringify(buildInfo, null, 2) + '\n';
  writeFileSync(path.join(out, 'build-info.json'), metadata);
  mkdirSync(path.join(out, 'valdi'), { recursive: true });
  const { schemaVersion, profile, valdiCommit, engine, platform, modules: includedModules, bootstrap, routing } = buildInfo;
  writeFileSync(path.join(out, 'valdi/build-info.json'), JSON.stringify({
    schemaVersion, profile, valdiCommit, engine, ...businessPackagingInfo(development), platform, modules: includedModules, bootstrap, routing,
  }, null, 2) + '\n');
  console.log(`Business rawfile: ${out}\nC++ bindings: ${bindings}`);
}

export function parseBusinessArgs(args: string[]): BusinessBuildOptions {
  const options: BusinessBuildOptions = {};
  for (let i = 0; i < args.length;) {
    const name = args[i++];
    if (name === '--development') {
      options.development = true;
      continue;
    }
    const key = ({ '--source': 'source', '--out': 'out', '--stage': 'stage',
      '--bindings': 'bindings', '--git-source': 'gitSource' } as const)[name];
    if (!key || !args[i] || args[i].startsWith('--')) {
      throw new Error('Usage: harmony-business.ts [--development] [--source DIR] [--out RAWFILE_DIR] [--stage DIR] [--bindings DIR] [--git-source DIR]');
    }
    options[key] = args[i++];
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildBusiness(parseBusinessArgs(process.argv.slice(2)));
}
