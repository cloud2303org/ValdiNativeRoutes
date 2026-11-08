import path from 'node:path';
import type { ValdiModule } from './valdiTs';

/** Builtin declaration aliases, including optional modules not linked into every runtime. */
const RUNTIME_MODULES = ['client_sql', 'coreutils', 'jasmine', 'native_web', 'source_map', 'valdi_core', 'valdi_tsx'];

export interface EditorConfigSources {
  frameworkSources?: string;
  bootstrapBase: string;
  generatedRoot: string;
}

/**
 * These ignored configs are local to a checkout. Absolute paths let TypeScript
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
    aliases[`${other.name}/*`] = [other.dir, ...other.generatedDirs].map(dir => absolute(paths.join(dir, '*')));
  }
  const framework = sources.frameworkSources;
  if (framework) {
    for (const name of RUNTIME_MODULES) {
      aliases[`${name}/*`] = [absolute(paths.join(framework, 'src/valdi_modules/src/valdi', name, '*'))];
    }
    aliases.tslib = [absolute(paths.join(framework, 'src/valdi_modules/src/valdi/valdi_core/src/tslib'))];
  }
  // A logical module-build entry has no valdi/node_modules ancestor. Exact and
  // module-specific aliases win over this fallback; ordinary npm types still
  // resolve from the declared package root without adding npm files as roots.
  if (module.nodeModules) aliases['*'] = [absolute(paths.join(module.nodeModules, '*'))];
  return {
    // Prepared compilation keeps the authoritative upstream diagnostics/options.
    // It does not depend on the bootstrap JSON being present in a Bazel sandbox.
    extends: absolute(framework
      ? paths.join(framework, 'modules/_configs/base.tsconfig.json')
      : sources.bootstrapBase),
    compilerOptions: {
      // Match the Valdi TypeScript compiler's treatment of export= npm packages.
      allowSyntheticDefaultImports: true,
      paths: aliases,
      types: framework
        ? ['Long', 'globals'].map(name => absolute(paths.join(framework, 'modules/types', name)))
        : [],
      rootDirs: [absolute(paths.dirname(module.dir)), absolute(sources.generatedRoot)],
    },
  };
}
