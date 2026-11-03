// One App selection, shared by the Node pipeline, native registration and Gradle.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

export function availableModuleNames(root) {
  const directory = path.join(root, 'valdi/modules');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name =>
    existsSync(path.join(directory, name, 'src'))).sort();
}

export function enabledModuleNames(root) {
  const file = path.join(root, 'package.json');
  const names = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).valdi?.modules : undefined;
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))) {
    throw new Error('Declare enabled module IDs in package.json "valdi.modules" (an array, which may be empty).');
  }
  if (new Set(names).size !== names.length) throw new Error('package.json valdi.modules contains duplicate module IDs.');
  const available = new Set(availableModuleNames(root));
  for (const name of names) {
    if (!available.has(name)) throw new Error(`Enabled module "${name}" has no valdi/modules/${name}/src directory.`);
    const build = path.join(root, 'valdi/modules', name, 'BUILD.bazel');
    if (!existsSync(build)) continue;
    const source = readFileSync(build, 'utf8').replace(/#[^\n]*/g, '');
    for (const match of source.matchAll(/["']\/\/modules\/([a-z][a-z0-9_]*)(?=[:/'"])/g)) {
      if (available.has(match[1]) && !names.includes(match[1])) {
        throw new Error(`Module "${name}" references disabled module "${match[1]}" in BUILD.bazel; enable it in package.json valdi.modules.`);
      }
    }
  }
  return [...names].sort();
}

/** Remove previously staged outputs for modules still present but no longer enabled. */
export function pruneDisabledModuleOutputs(directory, available, enabled) {
  const selected = new Set(enabled);
  for (const name of available) {
    if (selected.has(name)) continue;
    for (const suffix of ['', '.valdimodule', '.map.json', '.bundle']) {
      rmSync(path.join(directory, name + suffix), { recursive: true, force: true });
    }
  }
}
