import path from 'node:path';
import type { ValdiModule } from './valdiTs';
import { moduleImportPaths, RUNTIME_SOURCE_PATTERNS } from './typescript-project';

/** Builtin declaration aliases, including optional modules not linked into every runtime. */
const RUNTIME_MODULES = ['coreutils', 'jasmine', 'native_web', 'source_map', 'valdi_core', 'valdi_tsx'];

export interface EditorConfigSources {
  frameworkSources?: string;
  bootstrapBase: string;
}

/**
 * These ignored configs are local to a checkout. Absolute aliases let TypeScript
 * read one through either valdi/modules or the module-build/modules symlink.
 * Accept a path implementation so cross-platform callers can generate configs
 * for Windows too, including framework caches on another drive or UNC share.
 */
export function createEditorConfig(
  module: ValdiModule,
  modules: ValdiModule[],
  sources: EditorConfigSources,
  paths: typeof path = path,
) {
  const absolute = (file: string) => paths.resolve(file).split(paths.sep).join('/');
  const aliases: Record<string, string[]> = {};
  for (const other of modules) {
    aliases[`${other.name}/*`] = moduleImportPaths(other, paths);
  }
  const framework = sources.frameworkSources;
  if (framework) {
    for (const name of RUNTIME_MODULES) {
      aliases[`${name}/*`] = [absolute(paths.join(framework, 'src/valdi_modules/src/valdi', name, '*'))];
    }
    aliases.tslib = [absolute(paths.join(framework, 'src/valdi_modules/src/valdi/valdi_core/src/tslib'))];
  }
  const solidNative = modules.find(candidate => candidate.name === 'solid_native');
  const solidJsxDecl = module.jsxBackend === 'solid' && solidNative && module.name !== 'solid_native'
    ? [absolute(paths.join(solidNative.dir, 'src/jsx.d.ts'))]
    : [];
  // npm packages use normal node_modules lookup. A wildcard paths mapping to
  // node_modules would bypass package exports, including private subpaths.
  return {
    // Prepared compilation keeps the authoritative upstream diagnostics/options.
    // It does not depend on the bootstrap JSON being present in a Bazel sandbox.
    extends: absolute(framework
      ? paths.join(framework, 'modules/_configs/base.tsconfig.json')
      : sources.bootstrapBase),
    compilerOptions: {
      // Check both ESM and framework import=/export= syntax while resolving
      // modern package exports with the same import conditions as Rolldown.
      allowSyntheticDefaultImports: true,
      module: 'preserve',
      moduleResolution: 'bundler',
      paths: aliases,
      types: framework
        ? ['Long', 'globals'].map(name => absolute(paths.join(framework, 'modules/types', name)))
        : [],
    },
    include: [
      ...RUNTIME_SOURCE_PATTERNS,
      ...solidJsxDecl,
      ...module.generatedDirs.map(directory => absolute(paths.join(directory, '**/*.ts'))),
    ],
  };
}
