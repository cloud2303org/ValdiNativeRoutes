import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import ts from 'typescript';
import { createSourceCompiler, moduleGraph, nativeMappings, sources } from './compiler';

const OWN = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUTPUT = path.join(OWN, '.local');

export function allowedOutput(output: string): string {
  const absolute = path.resolve(output);
  const roots = [DEFAULT_OUTPUT];
  const allowed = roots.flatMap(root => existsSync(root) ? [root, realpathSync(root)] : [root]);
  const temporary = [path.resolve(tmpdir()), realpathSync(tmpdir()), '/tmp', '/private/tmp'];
  if (!allowed.some(root => absolute === root || absolute.startsWith(`${root}${path.sep}`)) &&
      !temporary.some(root => absolute.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Web output must be under ${DEFAULT_OUTPUT} or a temporary subdirectory`);
  }
  return absolute;
}

function write(file: string, content: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const quote = JSON.stringify;
const slash = (value: string) => value.split(path.sep).join('/');
const jsPath = (value: string) => value.replace(/\.(tsx?|jsx?)$/, '.js');
const EXCLUDED = new Set([
  'web_renderer/src/ValdiWebRenderer', 'web_renderer/src/ValdiWebRuntime',
  'valdi_core/src/Init', 'valdi_core/src/ModuleLoader',
]);

/** Node equivalent of PrependWebJSProcessor, using an AST instead of sentinels. */
export function webJavaScript(code: string, id: string): string {
  if (EXCLUDED.has(id)) return code;
  const source = ts.createSourceFile(`${id}.js`, code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const transformed = ts.transform(source, [context => file => {
    const visit: ts.Visitor = node => {
      const visited = ts.visitEachChild(node, visit, context);
      if (ts.isCallExpression(visited) && ts.isIdentifier(visited.expression) &&
          visited.expression.text === 'require' && visited.arguments.length) {
        const arg = visited.arguments[0];
        if (ts.isStringLiteralLike(arg)) {
          const name = arg.text;
          const relative = name.startsWith('.') && !path.extname(name) ? `${name}.js` : name;
          return context.factory.updateCallExpression(visited, visited.expression, undefined, [context.factory.createStringLiteral(relative)]);
        }
        return context.factory.updateCallExpression(visited,
          context.factory.createPropertyAccessExpression(
            context.factory.createPropertyAccessExpression(context.factory.createIdentifier('globalThis'), 'moduleLoader'), 'load'),
          undefined, visited.arguments);
      }
      return visited;
    };
    return ts.visitNode(file, visit) as ts.SourceFile;
  }]);
  try {
    return `module.path = ${quote(id)};\n${ts.createPrinter().printFile(transformed.transformed[0])}`;
  } finally { transformed.dispose(); }
}

export async function buildWeb(framework: string, output = DEFAULT_OUTPUT, apiVersion = 0) {
  framework = realpathSync(framework);
  output = allowedOutput(output);
  // macOS /tmp is a symlink to /private/tmp. A plugin-provided /tmp ID and
  // Rolldown's realpath-resolved relative ID otherwise instantiate the same
  // Renderer twice, splitting its current-renderer state.
  mkdirSync(output, { recursive: true });
  output = allowedOutput(realpathSync(output));
  if (!Number.isSafeInteger(apiVersion) || apiVersion < 0 || apiVersion > 0x7fffffff) throw new Error('Invalid API version');
  const modules = moduleGraph(framework);
  if (modules.some(module => module.workers.length)) throw new Error('Browser worker chunk assembly is outside this HelloWorld entry');
  const mapping = nativeMappings(modules);
  const compiler = createSourceCompiler(framework, modules);
  const pkg = path.join(output, 'package');
  rmSync(pkg, { recursive: true, force: true });
  rmSync(path.join(output, 'dist'), { recursive: true, force: true });
  const sourceRoot = path.join(pkg, 'src');
  const emitted = new Map<string, string>();
  const manifest: { source: string; destination: string; sha256: string }[] = [];
  const imageRegistry: string[] = ['var r = globalThis.__valdiImageRegistry = globalThis.__valdiImageRegistry || {};'];
  const entryRegistry: string[] = ['var r = globalThis.__valdiModuleEntryRegistry = globalThis.__valdiModuleEntryRegistry || {};'];
  const copyInput = (source: string, destination: string) => {
    const data = readFileSync(source);
    write(destination, data);
    manifest.push({ source, destination: slash(path.relative(pkg, destination)), sha256: createHash('sha256').update(data).digest('hex') });
  };
  for (const module of modules) {
    const files = [...sources(path.join(module.dir, 'src')), ...sources(path.join(module.dir, 'types')), ...sources(path.join(module.dir, 'web'))];
    for (const file of files) {
      const relative = slash(path.relative(module.dir, file));
      const native = relative.startsWith('web/');
      const dest = path.join(pkg, native ? 'native' : 'src', module.name, jsPath(relative));
      if (file.endsWith('.d.ts')) {
        copyInput(file, dest.replace(/\.d\.js$/, '.d.ts'));
      } else {
        const id = `${module.name}/${jsPath(relative).slice(0, -3)}`;
        const code = webJavaScript(compiler.emit(file), id);
        write(dest, code);
        emitted.set(slash(path.relative(sourceRoot, dest)), code);
        manifest.push({ source: file, destination: slash(path.relative(pkg, dest)), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
      }
    }
    // Module srcs can carry byte-exact data. Keep the original bytes and
    // generate the explicit lazy registry consumed by ValdiWebRuntime.
    const entries = ts.sys.readDirectory(path.join(module.dir, 'src'), ['.bin', '.protodecl']);
    if (entries.length) entryRegistry.push(`r[${quote(module.name)}] = r[${quote(module.name)}] || {};`);
    for (const file of entries) {
      const relative = slash(path.relative(module.dir, file));
      const dest = path.join(sourceRoot, module.name, relative);
      copyInput(file, dest);
      const from = slash(path.relative(path.join(sourceRoot, 'web_renderer/src'), dest));
      entryRegistry.push(`r[${quote(module.name)}][${quote(relative)}] = () => require(${quote(from.startsWith('.') ? from : `./${from}`)});`);
    }
    const resDir = path.join(module.dir, 'res');
    if (existsSync(resDir)) {
      const images = new Map<string, { file: string; scale: number }>();
      for (const filename of readdirSync(resDir).sort()) {
        const match = /^(.+?)(?:@(\d+(?:\.\d+)?)x)?\.(png|jpe?g|webp|svg|gif)$/.exec(filename);
        if (!match) throw new Error(`Unsupported resource in minimal Web entry: ${module.name}/res/${filename}`);
        const scale = Number(match[2] || 1);
        const key = match[1].replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
        if (!images.has(key) || images.get(key)!.scale < scale) images.set(key, { file: filename, scale });
      }
      const imageEntries: string[] = [];
      for (const [key, image] of images) {
        const dest = path.join(sourceRoot, module.name, 'res', image.file);
        copyInput(path.join(resDir, image.file), dest);
        imageEntries.push(`${quote(key)}: require(${quote(`./${module.name}/res/${image.file}`)})`);
      }
      imageRegistry.push(`r[${quote(`${module.name}/res`)}] = { ${imageEntries.join(', ')} };`);
      write(path.join(sourceRoot, module.name, 'res.js'),
        `exports.default = require("valdi_core/src/AssetCatalog").loadCatalog(${quote(`${module.name}/res`)});\n`);
      write(path.join(sourceRoot, module.name, 'res.d.ts'),
        compiler.program.getSourceFile(path.join(module.dir, 'res.d.ts'))!.text);
    }
  }
  const register = [
    'var callbacks = globalThis.__valdiWebViewClassRegistryCallbacks = globalThis.__valdiWebViewClassRegistryCallbacks || [];',
    'function registerViews(views) {',
    '  var registry = globalThis.__valdiWebViewClassRegistry;',
    '  if (!(registry instanceof Map)) {',
    '    registry = globalThis.__valdiWebViewClassRegistry = new Map();',
    '    callbacks.splice(0).forEach(callback => callback(registry));',
    '  }',
    '  Object.entries(views).forEach(([name, factory]) => registry.set(name, factory));',
    '}',
  ];
  const implementations = new Map<string, string>();
  for (const module of modules) {
    // The upstream registrar evaluates all web_deps JS, even a file with no
    // overridden IDs: such files may export webPolyglotViews.
    const webImplementations = sources(path.join(module.dir, 'web'))
      .filter(file => !file.endsWith('.d.ts'))
      .map(file => `${module.name}/${jsPath(slash(path.relative(module.dir, file)))}`);
    for (const implementation of webImplementations) {
      const variable = `n${implementations.size}`;
      implementations.set(implementation, variable);
      register.push(`var ${variable} = require(${quote(`../native/${implementation}`)});`);
      for (const id of (module.nativeModules[implementation] || '').split(',').map(value => value.trim()).filter(Boolean)) {
        register.push(`globalThis.moduleLoader.registerModule(${quote(id)}, () => ${variable});`);
        const wrapper = path.join(sourceRoot, `${id}.js`);
        const requirePath = slash(path.relative(path.dirname(wrapper), path.join(pkg, 'native', implementation)));
        write(wrapper, `module.exports = require(${quote(requirePath.startsWith('.') ? requirePath : `./${requirePath}`)});\n`);
      }
      register.push(`if (${variable}.webPolyglotViews) registerViews(${variable}.webPolyglotViews);`);
    }
  }
  write(path.join(sourceRoot, 'RegisterNativeModules.js'), register.join('\n'));
  write(path.join(sourceRoot, 'valdi_api_version.json'), `${apiVersion}\n`);
  write(path.join(sourceRoot, '_image_registry.js'), imageRegistry.join('\n'));
  write(path.join(sourceRoot, 'web_renderer/src/_module_entry_registry.js'), entryRegistry.join('\n'));
  const category = (filename: string, global: string, marker: string) => {
    const lines = [`var r = globalThis.${global} = globalThis.${global} || {};`];
    for (const [file, code] of emitted) {
      if (file.startsWith('../') || !code.includes(marker)) continue;
      const id = file.slice(0, -3);
      lines.push(`r[${quote(id)}] = () => require(${quote(`./${file}`)});`);
    }
    write(path.join(sourceRoot, filename), lines.join('\n'));
  };
  category('_navigation_registry.js', '__valdiNavigationPages', 'NavigationPage)(module)');
  category('_worker_registry.js', '__valdiWorkerModules', 'workerService');
  write(path.join(sourceRoot, '_web_worker_factories.js'),
    '// This source graph declares no web_workers. Nonempty declarations fail assembly.\n');
  const templateDir = path.join(framework, 'bzl/valdi/app_templates');
  const packageName = 'valdi-node-web-hello-world';
  write(path.join(pkg, 'package.json'), JSON.stringify({
    name: packageName, version: '0.0.0', type: 'commonjs',
    exports: { './*': './*.js', './package.json': './package.json' },
  }, null, 2));
  const entry = readFileSync(path.join(templateDir, 'web_index.js.tpl'), 'utf8')
    .replaceAll('@VALDI_PACKAGE_NAME@', packageName)
    .replaceAll('@VALDI_COMPONENT_NAME@', 'App')
    .replaceAll('@VALDI_ROOT_MODULE_PATH@', 'hello_world/src/HelloWorldApp');
  write(path.join(output, 'entry.cjs'), entry);
  copyInput(path.join(templateDir, 'web_path_browserify_shim.js.tpl'), path.join(pkg, 'path-browserify.cjs'));
  const diagnostics = compiler.diagnostics();
  write(path.join(output, 'diagnostics.txt'), diagnostics);
  if (diagnostics) throw new Error(`Web source typecheck failed; see ${path.join(output, 'diagnostics.txt')}`);
  const inputs = new Set<string>();
  const bundle = await rolldown({
    input: path.join(output, 'entry.cjs'), platform: 'browser',
    transform: { define: { __VALDI_API_VERSION__: String(apiVersion) } },
    onLog(level, log, handler) {
      if (log.code === 'UNRESOLVED_IMPORT' || log.code === 'EVAL' || log.code === 'DYNAMIC_REQUIRE') {
        throw new Error(`${log.code}: ${log.message}`);
      }
      handler(level, log);
    },
    plugins: [{
      name: 'official-valdi-web-package',
      async resolveId(id, importer) {
        if (id === 'path-browserify') return realpathSync(path.join(pkg, 'path-browserify.cjs'));
        if (id === 'tslib') return realpathSync(path.join(sourceRoot, 'valdi_core/src/tslib.js'));
        if (id === 'Valdi') return realpathSync(path.join(sourceRoot, 'valdi_core/src/Valdi.js'));
        if (id.startsWith(`${packageName}/`)) return realpathSync(path.join(pkg, `${id.slice(packageName.length + 1)}.js`));
        if (!id.startsWith('.') && !path.isAbsolute(id)) {
          const candidate = path.join(sourceRoot, id.endsWith('.js') ? id : `${id}.js`);
          if (!existsSync(candidate)) throw new Error(`Missing Web runtime dependency ${id} from ${importer}`);
          return realpathSync(candidate);
        }
        // Canonicalize normal entry/relative imports too, including generated
        // native-module forwarders. Returning null delegates resolution but
        // cannot enforce one identity across all resolver paths.
        const resolved = await this.resolve(id, importer, { skipSelf: true });
        if (!resolved || resolved.external) throw new Error(`Unresolved Web input ${id} from ${importer}`);
        return { ...resolved, id: realpathSync(resolved.id) };
      },
      load(id) {
        if (id !== realpathSync(id)) throw new Error(`Noncanonical Web module identity: ${id}`);
        inputs.add(id);
        if (/\.(bin|protodecl)$/.test(id)) return `module.exports = new Uint8Array(${quote([...readFileSync(id)])});`;
        const image = /\.(png|jpe?g|svg|webp|gif)$/.exec(id);
        if (image) {
          const type = image[1] === 'svg' ? 'svg+xml' : image[1] === 'jpg' ? 'jpeg' : image[1];
          return `module.exports = ${quote(`data:image/${type};base64,${readFileSync(id).toString('base64')}`)};`;
        }
        return null;
      },
    }],
  });
  try {
    const result = await bundle.write({ dir: path.join(output, 'dist'), entryFileNames: 'bundle.js', format: 'iife', sourcemap: true });
    for (const chunk of result.output) {
      if (chunk.type === 'chunk' && (chunk.imports.length || chunk.dynamicImports.length)) {
        throw new Error(`Standalone Web bundle has external imports: ${chunk.fileName}`);
      }
    }
  } finally { await bundle.close(); }
  const html = readFileSync(path.join(templateDir, 'web_index.html.tpl'), 'utf8').replaceAll('@VALDI_TITLE@', 'Valdi HelloWorld — Node Web');
  write(path.join(output, 'dist/index.html'), html);
  const summary = {
    framework, apiVersion, modules: modules.map(module => ({ name: module.name, buildFile: module.buildFile })),
    nativeMappings: Object.fromEntries(mapping), manifest, bundledInputs: [...inputs].sort(),
    moduleIdentity: {
      canonical: true,
      inputCount: inputs.size,
      realpathCount: new Set([...inputs].map(id => realpathSync(id))).size,
    },
    semanticDiagnostics: path.join(output, 'diagnostics.txt'),
    bundle: path.join(output, 'dist/bundle.js'),
  };
  if (summary.moduleIdentity.inputCount !== summary.moduleIdentity.realpathCount) {
    throw new Error('Duplicate realpath module identities in Web bundle');
  }
  write(path.join(output, 'build.json'), JSON.stringify(summary, null, 2));
  console.log(`Web HelloWorld: ${inputs.size} bundled inputs, ${mapping.size} official native mappings\n${summary.bundle}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const framework = process.argv[2] ?? path.resolve(OWN, '../../../valdi/.valdi-sources/external/valdi+');
  if (!existsSync(path.join(framework, 'modules/_configs/base.tsconfig.json'))) {
    throw new Error('Prepare the pinned framework first: node scripts/prepare-valdi.mjs. Alternatively pass FRAMEWORK_ROOT [OUTPUT] [API_VERSION].');
  }
  await buildWeb(framework, process.argv[3], process.argv[4] === undefined ? 0 : Number(process.argv[4]));
}
