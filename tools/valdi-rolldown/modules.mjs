// @ts-check
// One App selection, shared by the Node pipeline, native registration and Gradle.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Find prepared framework sources using the same selection for runtime and Node projects.
 * @param {string} root Repository root.
 * @returns {string | undefined}
 */
export function findValdiSourceRoot(root) {
  const valdi = path.join(root, 'valdi');
  // prepare-valdi's output-base link is stable while Bazel repoints convenience links.
  const candidates = [
    process.env.VALDI_SOURCE_ROOT,
    path.join(valdi, '.valdi-sources/external/valdi+'),
    path.join(valdi, 'bazel-valdi/external/valdi+'),
  ].filter((candidate) => Boolean(candidate));
  // Other workspace names can also hold the fetched sources.
  if (existsSync(valdi)) {
    for (const entry of readdirSync(valdi)) {
      if (entry.startsWith('bazel-')) candidates.push(path.join(valdi, entry, 'external/valdi+'));
    }
  }
  const selected = candidates.find(candidate =>
    candidate && existsSync(path.join(candidate, 'modules/_configs/base.tsconfig.json')));
  return selected ? path.resolve(selected) : undefined;
}

/**
 * Write the ignored, machine-local framework mapping inherited by Node tests.
 * An empty paths object keeps bootstrap configs valid without hiding missing imports.
 * @param {string} root Repository root.
 * @returns {boolean} Whether the config changed.
 */
export function writeNodeFrameworkConfig(root) {
  const framework = findValdiSourceRoot(root);
  const file = path.join(root, 'tools/valdi-rolldown/.gen/tsconfig.framework.json');
  const content = `${JSON.stringify({
    compilerOptions: {
      paths: framework ? {
        'valdi_core/*': [path.join(framework, 'src/valdi_modules/src/valdi/valdi_core/*').split(path.sep).join('/')],
      } : {},
    },
  }, null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function availableModuleNames(root) {
  const directory = path.join(root, 'valdi/modules');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name =>
    existsSync(path.join(directory, name, 'src'))).sort();
}

/**
 * @param {unknown} name
 * @returns {name is string}
 */
function isModuleName(name) {
  return typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name);
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function enabledModuleNames(root) {
  const file = path.join(root, 'package.json');
  /** @type {unknown} */
  const metadata = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  const valdi = typeof metadata === 'object' && metadata !== null && 'valdi' in metadata ? metadata.valdi : undefined;
  const names = typeof valdi === 'object' && valdi !== null && 'modules' in valdi ? valdi.modules : undefined;
  if (!Array.isArray(names) || !names.every(isModuleName)) {
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

/**
 * Remove previously staged outputs for modules still present but no longer enabled.
 * @param {string} directory
 * @param {Iterable<string>} available
 * @param {Iterable<string>} enabled
 * @returns {void}
 */
export function pruneDisabledModuleOutputs(directory, available, enabled) {
  const selected = new Set(enabled);
  for (const name of available) {
    if (selected.has(name)) continue;
    for (const suffix of ['', '.valdimodule', '.map.json', '.bundle']) {
      rmSync(path.join(directory, name + suffix), { recursive: true, force: true });
    }
  }
}
