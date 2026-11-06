import { existsSync } from 'node:fs';
import path from 'node:path';
import { enabledModuleNames } from '../tools/valdi-rolldown/modules.mjs';

/** Native C++ inputs, excluding application TS so UI-only updates remain possible. */
export function nativeCppInputs(root) {
  return [
    'valdi/BUILD.bazel',
    'valdi/bzl/module_cpp',
    'valdi/modules/runtime-packages.bazelrc',
    'valdi/modules/runtime-cpp.bzl',
    ...enabledModuleNames(root)
      .map(name => `valdi/modules/${name}/cpp`)
      .filter(directory => existsSync(path.join(root, directory))),
  ];
}
