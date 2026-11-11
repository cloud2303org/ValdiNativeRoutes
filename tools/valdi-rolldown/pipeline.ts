// What build.ts (one build) and dev.ts (the dev server) share: the modules, and building them with rolldown.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { rolldown, RolldownMagicString, type Plugin, type PreRenderedChunk } from 'rolldown';
import ts from 'typescript';
import type { ArchiveEntries } from './archive';
import { sourceFiles, type ValdiModule, type ValdiTsPlugin } from './valdiTs';
import { availableModuleNames, enabledModuleNames, findValdiSourceRoot } from './modules.mjs';
import { assertEnabledImports } from './module-selection';
import { createEditorConfig } from './editor-config';
import { addStringEntries, prepareStrings } from './localization';
import { findFonts, findImages, writeResTs } from './resources';


export const root = path.resolve(import.meta.dirname, '../..');
const valdi = path.join(root, 'valdi');
/** Where the modules' generated sources go (res.ts), one directory per module. */
const genRoot = path.join(import.meta.dirname, '.gen');
export const genDir = (name: string) => path.join(genRoot, name);

/** The app's Valdi modules: each directory of valdi/modules with a src/ (new-module.ts makes one). */
export const modulesDir = path.join(valdi, 'modules');

export interface ModuleConfig {
  nativeBuild?: 'bazel' | 'host' | 'cpp';
  /** Module-relative TS entry files for --cpp-modules-out only; imports remain part of the program. */
  cppSourceRoots?: string[];
  nativeDependencies?: { script: string; inputs: string[] };
  nativeInputs?: string[];
  iosModuleName?: string;
  iosLanguage?: 'objc' | 'swift' | 'both';
  iosProjectSpec?: string;
  androidClassPath?: string;
  androidModuleFactory?: string;
  androidModuleFactoryContext?: boolean;
  androidDependencies?: string[];
  androidPlatforms?: string[];
  androidPermissions?: { name: string; maxSdkVersion?: number; usesPermissionFlags?: 'neverForLocation'; removeMaxSdkVersion?: true }[];
  androidFeatures?: { name: string; required?: boolean }[];
  iosInfoPlist?: Record<string, string>;
  iosPackages?: { name: string; url: string; revision?: string; from?: string; product?: string }[];
  iosEntitlements?: Record<string, boolean>;
  iosFrameworks?: string[];
  androidViewBinder?: string;
  iosModuleFactory?: string;
  iosModuleFactoryClass?: string;
  template?: string;
}

export function moduleConfig(name: string): ModuleConfig {
  const file = path.join(modulesDir, name, 'module.json');
  if (!existsSync(file)) return {};
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (config.nativeBuild !== undefined && !['bazel', 'host', 'cpp'].includes(config.nativeBuild)) throw new Error(`${file}: unsupported nativeBuild`);
  // Keep the cpp ownership contract aligned with scripts/module-native-config.mjs.
  if (config.nativeBuild === 'cpp') {
    const contribution = Object.keys(config).find(field => /^(android|ios)/.test(field) &&
      !['androidClassPath', 'iosModuleName', 'iosLanguage'].includes(field));
    if (contribution) throw new Error(`${file}: nativeBuild cpp cannot declare platform contribution ${contribution}`);
  }
  if (config.iosModuleName !== undefined && !/^[A-Za-z][A-Za-z0-9_]*$/.test(config.iosModuleName)) {
    throw new Error(`${file}: invalid iosModuleName`);
  }
  if (config.iosLanguage !== undefined && !['objc', 'swift', 'both'].includes(config.iosLanguage))
    throw new Error(`${file}: invalid iosLanguage`);
  if (config.androidClassPath !== undefined &&
      (typeof config.androidClassPath !== 'string' ||
       !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(config.androidClassPath))) {
    throw new Error(`${file}: invalid androidClassPath`);
  }
  return config;
}

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
  const modules = enabledModuleNames(root).map(appModule);
  for (const module of modules) {
    assertEnabledImports(tsSourceFiles(module), modulesDir, availableModuleNames(root), modules.map(value => value.name));
  }
  return modules;
}

function tsSourceFiles(module: ValdiModule): string[] {
  // Include .d.ts: a type-only dependency is still part of the module contract.
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.tsx?$/.test(entry.name)) files.push(file);
    }
  };
  visit(path.join(module.dir, 'src'));
  return files;
}

/** Find prepared Valdi sources; a bootstrap editor config does not establish readiness. */
export function valdiSourceRoot(): string | undefined {
  return findValdiSourceRoot(root);
}

/**
 * Write machine-local editor paths that work through physical or symlink module
 * entries. Before source preparation, use only the tracked bootstrap base and
 * local aliases. The boolean means changed; it does not indicate build readiness.
 */
export function writeTsconfig(module: ValdiModule, modules: ValdiModule[]): boolean {
  // `pnpm tsconfig` also prepares Strings for editor completion before a build.
  if (module.generatedDirs[0]) prepareStrings(module, module.generatedDirs[0]);
  const canonical = (file: string) => existsSync(file) ? realpathSync(file) : path.resolve(file);
  const canonicalModule = (value: ValdiModule): ValdiModule => ({
    ...value,
    dir: canonical(value.dir),
    generatedDirs: value.generatedDirs.map(canonical),
    nodeModules: value.nodeModules && canonical(value.nodeModules),
  });
  const framework = valdiSourceRoot();
  const bootstrapBase = path.join(valdi, 'tsconfig.editor-base.json');
  if (!framework && !existsSync(bootstrapBase)) {
    throw new Error(`Missing editor bootstrap base: ${bootstrapBase}`);
  }
  const config = createEditorConfig(canonicalModule(module), modules.map(canonicalModule), {
    frameworkSources: framework && canonical(framework),
    bootstrapBase: canonical(bootstrapBase),
  });
  const file = path.join(module.dir, 'tsconfig.json');
  const content = `${JSON.stringify(config, null, 4)}\n`;
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  writeFileSync(file, content);
  return true;
}

/** Prepare every generated editor input before a consumer TypeScript program starts. */
export async function prepareEditorProject(module: ValdiModule, modules: ValdiModule[]): Promise<boolean> {
  if (module.generatedDirs[0]) {
    writeResTs(module, await findImages(module), module.generatedDirs[0], findFonts(module) ?? []);
  }
  return writeTsconfig(module, modules);
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
    // Packages may physically live inside the module (not only in an external
    // pnpm store). They still belong to npm/, rather than local source chunks.
    const own = chunk.moduleIds.map(id => path.relative(module.dir, id))
      .find(file => !file.startsWith('..') && !file.split(path.sep).includes('node_modules'));
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
 * Resolves bare package imports with Node's resolver. Rolldown's own resolver needs the
 * module tsconfig for that and fails with "Tsconfig not found: Could not resolve 'valibot'"
 * when the tsconfig's `extends` target is not reachable from the bundling process; Node
 * finds the same pnpm-linked package, and the resolved paths keep their `npm/<pkg>`
 * archive names (sourcePath/chunkName). Valdi's own `valdi_core/…` imports are not
 * resolvable here, so they still go through the plugin and the tsconfig paths.
 */
const nodePackageResolver = (): Plugin => ({
  name: 'valdi-node-package-resolver',
  resolveId(source, importer) {
    if (!importer || !/^[A-Za-z@]/.test(source) || source.startsWith('node:')) return null;
    try {
      return createRequire(importer).resolve(source);
    } catch {
      return null;
    }
  },
});

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

/** Star reexports enumerate an external module before reading any of its properties. */
function eagerStarReexports(plugin: ValdiTsPlugin): Plugin {
  return {
    name: 'eager-star-reexports',
    renderChunk(code, chunk) {
      const sources = new Set([...chunk.moduleIds, ...(chunk.facadeModuleId ? [chunk.facadeModuleId] : [])]);
      const reexports = new Set<string>();
      for (const id of sources) {
        const source = plugin.program().getSourceFile(id);
        for (const statement of source?.statements ?? []) {
          if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && !statement.exportClause &&
              statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
            reexports.add(statement.moduleSpecifier.text);
          }
        }
      }
      if (!reexports.size) return null;
      let edited: RolldownMagicString | undefined;
      const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' &&
            node.arguments.length === 1 && node.arguments[0].type === 'Literal' &&
            reexports.has(node.arguments[0].value)) {
          edited ??= new RolldownMagicString(code);
          edited.appendLeft(node.arguments[0].end, ', true');
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object') visit(value);
        }
      };
      visit(this.parse(code));
      return edited ?? null;
    },
  };
}

/**
 * The module's JavaScript, named as in its archive: a CommonJS file per source file (`src/routes.js`), and the npm
 * code they import split as rolldown splits code between entries: what one file alone imports is bundled into it,
 * what several import goes into a shared chunk (`npm/dayjs.js`) they require.
 */
export async function buildModule(module: ValdiModule, plugin: ValdiTsPlugin, minify: boolean): Promise<Built> {
  const diagnostics = plugin.diagnostics();
  if (diagnostics) throw new Error(diagnostics);
  // Archive and require names are Valdi's (`src/routes`), so they stay forward-slashed on
  // Windows: rolldown writes every file name and inter-file require from this entry name.
  const input = Object.fromEntries(
    sourceFiles(module).map(file => [path.relative(module.dir, file).split(path.sep).join('/').replace(/\.(tsx?|js)$/, ''), file]),
  );
  // A native-only bridge (the official calculator template) has just .d.ts.
  if (!Object.keys(input).length) return { entries: new Map(), maps: new Map() };
  const bundle = await rolldown({
    input,
    plugins: [nodePackageResolver(), plugin],
    // Pages are required by path at run time, so every file keeps its exports.
    preserveEntrySignatures: 'strict',
  });
  const { output } = await bundle.generate({
    format: 'cjs',
    // Named as Valdi requires them, without extension (its loader adds .js, Bundle.cpp), so rolldown writes
    // `require("./routes")`; the archive entries get the .js back.
    entryFileNames: '[name]',
    chunkFileNames: chunkName(module),
    plugins: [eagerSideEffectRequires, eagerStarReexports(plugin)],
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
  addStringEntries(built.entries, module.generatedDirs[0] ? prepareStrings(module, module.generatedDirs[0]) : undefined);
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

// Kept as a pipeline export for the build entry point.
export { precompile } from './hermes';
