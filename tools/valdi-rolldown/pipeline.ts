// What build.ts (one build) and dev.ts (the dev server) share: the modules, and building them with rolldown.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { rolldown, RolldownMagicString, type Plugin, type PreRenderedChunk } from 'rolldown';
import type { ArchiveEntries } from './archive';
import { sourceFiles, type ValdiModule, type ValdiTsPlugin } from './valdiTs';

const run = promisify(execFile);

export const root = path.resolve(import.meta.dirname, '../..');
const valdi = path.join(root, 'valdi');
/** app_pages' last Bazel build, which build.ts --compare reads (the Valdi compiler's web output). */
export const bin = path.join(valdi, 'bazel-out/darwin_arm64-fastbuild/bin/modules/app_pages');

/** Where the modules' generated sources go (res.ts, src/sqlgen), one directory per module. */
const genRoot = path.join(import.meta.dirname, '.gen');
export const genDir = (name: string) => path.join(genRoot, name);

/** The app's Valdi modules: each directory of valdi/modules with a src/ (new-module.ts makes one). */
export const modulesDir = path.join(valdi, 'modules');

export function appModule(name: string): ValdiModule {
  return {
    name,
    dir: path.join(modulesDir, name),
    generatedDirs: [genDir(name)],
    // The npm packages its sources import (valdi/package.json, pinned by valdi/pnpm-lock.yaml) are bundled into it.
    nodeModules: path.join(valdi, 'node_modules'),
  };
}

export function appModules(): ValdiModule[] {
  return readdirSync(modulesDir)
    .filter(name => existsSync(path.join(modulesDir, name, 'src')))
    .sort()
    .map(appModule);
}

/**
 * Valdi's own modules the exported runtime carries (//:valdi_runtime's deps and theirs): the only ones a module can
 * import, as the app has no other.
 */
const RUNTIME_MODULES = ['client_sql', 'coreutils', 'jasmine', 'source_map', 'valdi_core', 'valdi_tsx'];

/**
 * Writes `module`'s tsconfig.json, as `valdi projectsync` did from Bazel: Valdi's base config and globals, the
 * runtime's modules, and every app module (`<module>/…`), each also found in its generated sources (res.ts, sqlgen),
 * which rootDirs merges into the module's own tree for relative imports (`./sqlgen/AppDb`). Returns whether it
 * changed. Valdi's sources are read through the bazel-valdi link the exports leave.
 */
export function writeTsconfig(module: ValdiModule, modules: ValdiModule[]): boolean {
  const relative = (to: string) => path.relative(module.dir, to).split(path.sep).join('/');
  const valdiSources = path.join(valdi, 'bazel-valdi/external/valdi+');
  const paths: Record<string, string[]> = {};
  for (const other of modules) {
    paths[`${other.name}/*`] = [other === module ? './*' : `${relative(other.dir)}/*`, `${relative(genDir(other.name))}/*`];
  }
  for (const name of RUNTIME_MODULES) {
    paths[`${name}/*`] = [`${relative(path.join(valdiSources, 'src/valdi_modules/src/valdi', name))}/*`];
  }
  paths.tslib = [relative(path.join(valdiSources, 'src/valdi_modules/src/valdi/valdi_core/src/tslib'))];
  const config = {
    extends: relative(path.join(valdiSources, 'modules/_configs/base.tsconfig.json')),
    compilerOptions: {
      paths,
      types: [relative(path.join(valdiSources, 'modules/types/Long')), relative(path.join(valdiSources, 'modules/types/globals'))],
      rootDirs: ['..', relative(genRoot)],
    },
  };
  const file = path.join(module.dir, 'tsconfig.json');
  const content = `${JSON.stringify(config, null, 4)}\n`;
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  writeFileSync(file, content);
  return true;
}

/** A module's JavaScript by archive entry (`src/routes.js`), and each file's source map. */
export interface Built {
  entries: ArchiveEntries;
  maps: Map<string, string>;
}

/**
 * Source paths as Valdi's maps name them: `//app_pages/src/api.ts`, `//npm/valibot/dist/index.js`. rolldown gives
 * them relative to the map, which sits where the file would be written.
 */
function sourcePath(module: ValdiModule) {
  return (relative: string, map: string) => {
    const source = path.resolve(path.dirname(map), relative);
    if (!path.relative(module.dir, source).startsWith('..')) {
      return `//${module.name}/${path.relative(module.dir, source).split(path.sep).join('/')}`;
    }
    const npm = source.lastIndexOf(`node_modules${path.sep}`);
    return npm >= 0 ? `//npm/${source.slice(npm + 'node_modules/'.length).split(path.sep).join('/')}` : relative;
  };
}

/**
 * A shared chunk's name, the same from build to build. Every source file is an entry, so shared chunks hold the npm
 * code several files import, named after its packages (`npm/dayjs`, `npm/@tanstack/query-core`); or the files of an
 * import cycle, which rolldown puts together (each file's own then re-exports from it): `chunks/src/nfc/NfcHost`, after
 * its first file.
 */
function chunkName(module: ValdiModule) {
  return (chunk: PreRenderedChunk): string => {
    const own = chunk.moduleIds.map(id => path.relative(module.dir, id)).find(file => !file.startsWith('..'));
    if (own) return `chunks/${own.replace(/\.tsx?$/, '').split(path.sep).join('/')}`;
    const packages = new Set<string>();
    for (const id of chunk.moduleIds) {
      const at = id.lastIndexOf(`node_modules${path.sep}`);
      if (at < 0) continue;
      const parts = id.slice(at + 'node_modules/'.length).split(path.sep);
      packages.add(parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/'));
    }
    return packages.size ? `npm/${[...packages].sort().join('+')}` : `chunks/${chunk.name}`;
  };
}

/**
 * Valdi's require() returns a lazy proxy that loads the module on its first property read, so a bare `require("x");`
 * (an `import 'x'` for its side effects, or one rolldown keeps to run a chunk's side effects in order) would never
 * load it: these become `require("x", true)`, which loads it at once.
 */
const eagerSideEffectRequires: Plugin = {
  name: 'eager-side-effect-requires',
  renderChunk(code) {
    let edited: RolldownMagicString | undefined;
    for (const statement of this.parse(code).body) {
      if (statement.type !== 'ExpressionStatement') continue;
      const call = statement.expression;
      if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'require') continue;
      const [specifier, ...rest] = call.arguments;
      if (rest.length || specifier?.type !== 'Literal' || typeof specifier.value !== 'string') continue;
      edited ??= new RolldownMagicString(code);
      edited.appendLeft(specifier.end, ', true');
    }
    return edited ?? null;
  },
};

/**
 * The module's JavaScript, named as in its archive: a CommonJS file per source file (`src/routes.js`), and the npm
 * code they import split as rolldown splits code between entries: what one file alone imports is bundled into it,
 * what several import goes into a shared chunk (`npm/dayjs.js`) they require.
 */
export async function buildModule(module: ValdiModule, plugin: ValdiTsPlugin, minify: boolean): Promise<Built> {
  const input = Object.fromEntries(sourceFiles(module).map(file => [path.relative(module.dir, file).replace(/\.tsx?$/, ''), file]));
  const bundle = await rolldown({
    input,
    plugins: [plugin],
    // Pages are required by path at run time, so every file keeps its exports.
    preserveEntrySignatures: 'strict',
  });
  const { output } = await bundle.generate({
    format: 'cjs',
    // Named as Valdi requires them, without extension (its loader adds .js, Bundle.cpp), so rolldown writes
    // `require("./routes")`; the archive entries get the .js back.
    entryFileNames: '[name]',
    chunkFileNames: chunkName(module),
    plugins: [eagerSideEffectRequires],
    // As TypeScript's CommonJS: Valdi modules default-import each other through it, and a default export is
    // exports.default even when it is the only export (res.js).
    esModule: true,
    exports: 'named',
    // TypeScript's CommonJS starts with it; rolldown would only keep directives the sources have, and ES modules
    // have none.
    strict: true,
    // No sourceMappingURL comment: the maps go inline or into map.json (below).
    sourcemap: 'hidden',
    sourcemapExcludeSources: true,
    sourcemapPathTransform: sourcePath(module),
    minify,
  });
  await bundle.close();
  const built: Built = { entries: new Map(), maps: new Map() };
  for (const chunk of output) {
    if (chunk.type !== 'chunk') continue;
    built.entries.set(`${chunk.fileName}.js`, Buffer.from(chunk.code));
    if (chunk.map) built.maps.set(`${chunk.fileName}.js`, chunk.map.toString());
  }
  return built;
}

/**
 * Debug builds: each file carries its map, as Valdi's runtime reads it from JavaScript source (getSourceMap). Hot
 * reloaded files then bring theirs.
 */
export function inlineSourceMaps({ entries, maps }: Built): void {
  for (const [name, map] of maps) {
    const comment = `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString('base64')}\n`;
    entries.set(name, Buffer.concat([entries.get(name)!, Buffer.from(comment)]));
  }
}

/**
 * Release builds: bytecode has no room for a map, so they go into <module>.map.json next to the archive, which the
 * runtime loads with the module (ResourceManager::populateSourceMap): {"<module>/<file>.js": "<map JSON>"}.
 */
export function sourceMapJson(name: string, { maps }: Built): string {
  return JSON.stringify(Object.fromEntries([...maps].map(([file, map]) => [`${name}/${file}`, map])));
}

/** Valdi's precompiled-module header (JavaScriptUtils.cpp, kPreCompiledJsModuleMagic), before the bytecode. */
const isPrecompiled = (content: Buffer) => content.length >= 4 && content.readUInt32LE(0) === 0x0100c634;

/**
 * Valdi's host toolbox (the one its compiler runs for release builds), built by Bazel with the runtime: its Hermes
 * is the app's, so the bytecode version matches. Accept an export's exec-tool build or a standalone host-tool build.
 */
export function toolbox(): string {
  const out = path.join(valdi, 'bazel-out');
  const found = (existsSync(out) ? readdirSync(out) : [])
    .map(name => path.join(out, name, 'bin/external/valdi+/valdi/compiler/toolbox/valdi_compiler_toolbox'))
    .filter(file => existsSync(file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!found.length) throw new Error('No valdi_compiler_toolbox: in valdi/, run bazel build @valdi//valdi/compiler/toolbox:valdi_compiler_toolbox');
  return found[0];
}

/**
 * Release builds ship Hermes bytecode, on iOS too (its release runtime can't compile source): each .js entry becomes
 * the toolbox's output, Valdi's precompiled-module header and the bytecode, under the same name.
 */
export async function precompile(entries: ArchiveEntries): Promise<void> {
  const tool = toolbox();
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hbc-'));
  try {
    await Promise.all(
      [...entries].filter(([name, content]) => name.endsWith('.js') && !isPrecompiled(content)).map(async ([name, content], i) => {
        const input = path.join(dir, `${i}.js`);
        const output = path.join(dir, `${i}.bin`);
        writeFileSync(input, content);
        // -f: the module path as the stack traces show it, without .js, as Valdi's JavaScriptPreCompiler passes it.
        await run(tool, ['precompile', '-i', input, '-o', output, '-f', name.slice(0, -3), '-e', 'hermes']);
        entries.set(name, readFileSync(output));
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
