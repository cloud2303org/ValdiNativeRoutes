// Inspect a real `bazel aquery --output=jsonproto` graph with artifacts and command lines.
// Usage: node scripts/verify-node-compiler-actions.mjs actions.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const graph = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const fragments = new Map(graph.pathFragments.map(fragment => [fragment.id, fragment]));
const artifacts = new Map(graph.artifacts.map(artifact => [artifact.id, artifact]));
const sets = new Map(graph.depSetOfFiles.map(set => [set.id, set]));
function artifactPath(id) {
  const parts = [];
  for (let fragment = fragments.get(artifacts.get(id).pathFragmentId); fragment; fragment = fragments.get(fragment.parentId)) {
    parts.unshift(fragment.label);
  }
  return parts.join('/');
}
function inputPaths(ids, visited = new Set()) {
  const files = new Set();
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    const set = sets.get(id);
    for (const file of set.directArtifactIds ?? []) files.add(artifactPath(file));
    for (const file of inputPaths(set.transitiveDepSetIds ?? [], visited)) files.add(file);
  }
  return files;
}

const actions = graph.actions.filter(action => action.mnemonic === 'NodeValdiRuntimeModule');
assert.ok(actions.length, 'No Node runtime module actions found');
for (const action of actions) {
  const execution = new Map((action.executionInfo ?? []).map(entry => [entry.key, entry.value]));
  for (const flag of ['local', 'no-cache', 'no-sandbox', 'no-remote-cache']) {
    assert.ok(!execution.has(flag), `Node compiler action forbids isolation/cache: ${flag}`);
  }
  assert.ok(action.arguments.every(argument => !path.posix.isAbsolute(argument) && !path.win32.isAbsolute(argument)),
    'Node compiler action uses a machine-absolute tool/source path');
  const inputs = inputPaths(action.inputDepSetIds);
  assert.ok(inputs.has(action.arguments[0]), 'Node executable is not a declared action input');
  for (const suffix of [
    '/modules/_configs/base.tsconfig.json',
    '/modules/types/Long.d.ts',
    '/modules/types/globals.d.ts',
    '/third-party/hermes_v1/hermes.BUILD',
    '/valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp',
  ]) {
    assert.ok([...inputs].some(file => file.endsWith(suffix)), `Missing compiler context: ${suffix}`);
  }
  for (const dependency of ['typescript', 'tsx', 'hermes-compiler', 'rolldown', 'sharp']) {
    assert.ok([...inputs].some(file => file.includes(`/node_modules/${dependency}`)),
      `Missing npm dependency closure: ${dependency}`);
  }
  assert.ok(!action.arguments.some(argument => /\/Users\/|\/home\/|[A-Z]:[\\/]/.test(argument)),
    'Node compiler action leaks the developer checkout');
}
console.log(JSON.stringify({ nodeCompilerActions: actions.length, declaredToolsAndDependencies: true, cacheAllowed: true }));
