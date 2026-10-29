// Audit an aquery JSON graph, not a build log: cached legacy actions must fail too.
// bazel aquery 'deps(//:valdi_runtime_ios)' --config=stable_exec \
//   --repo_env=VALDI_PLATFORM_DEPENDENCIES=ios --output=jsonproto \
//   --noinclude_artifacts --noinclude_commandline > actions.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const graph = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const labels = new Map(graph.targets.map(target => [String(target.id), target.label]));
const actions = graph.actions.map(action => ({ mnemonic: action.mnemonic, label: labels.get(String(action.targetId)) }));
// valdi.proto is a runtime wire format defined under compiler/compiler. Its C++
// protobuf target is required by the runtime and is not the Swift compiler.
const isRuntimeProtocol = (label) => /\/\/compiler\/compiler:valdi_proto(?:_cc)?$/.test(label);
const legacy = actions.filter(action => (/\/\/compiler\/(compiler|companion)(?:\/|:)/.test(action.label ?? '')
    && !isRuntimeProtocol(action.label)) || /^ValdiCompile/.test(action.mnemonic));
assert.equal(legacy.length, 0, 'The runtime graph still contains legacy compiler actions: ' +
  [...new Set(legacy.map(action => `${action.mnemonic} ${action.label}`))].slice(0, 10).join(', '));
const modules = [...new Set(actions.filter(action => action.mnemonic === 'NodeValdiRuntimeModule')
  .map(action => action.label?.split(':').pop()))].sort();
for (const module of ['client_sql', 'coreutils', 'jasmine', 'source_map', 'valdi_core', 'valdi_tsx']) {
  assert.ok(modules.includes(module), `Missing Node runtime module ${module}`);
}
const cppHeaderToolboxActions = actions.filter(action => /\/\/valdi\/compiler\/toolbox:/.test(action.label ?? '')).length;
assert.equal(cppHeaderToolboxActions, 0, 'The runtime graph still contains the removed C++ compiler toolbox');
const nodeHeaderActions = actions.filter(action => action.mnemonic === 'NodeValdiRewriteHeader').length;
if (actions.some(action => action.label?.endsWith(':valdi_runtime_ios'))) {
  assert.ok(nodeHeaderActions > 0, 'The iOS runtime graph is missing Node header rewriting');
}
console.log(JSON.stringify({ actions: actions.length, nodeModules: modules, legacyCompilerActions: legacy.length, cppHeaderToolboxActions, nodeHeaderActions }, null, 2));
