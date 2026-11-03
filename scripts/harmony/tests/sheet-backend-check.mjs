// SOURCE INTEGRITY ONLY. Never imports child_process or invokes a compiler.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = resolve(root, 'harmony/entry/src/main/cpp/backend');
const fork = process.env.SHEET_BACKEND_FORK ??
  '/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102/valdi/harmony/arkui';
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const baselinePath = '/tmp/valdi-sheets-20261103/backend-wheel31-baseline/receipt.json';
const priorPath = '/tmp/valdi-sheets-20261103/backend-after-wheel-fix-relationship-prior/receipt.json';
const freezePath = '/tmp/valdi-wheel-20261103/freeze-receipt.json';
const historicalSHA = 'e8f0a5fc48542959e0364edce28368095cd2ad76289bc54a3645d640cb28b925';
if (digest(freezePath) !== historicalSHA) throw new Error('Immutable wheel31 freeze changed');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const prior = JSON.parse(readFileSync(priorPath, 'utf8'));
const ownedExisting = new Set(['ArkUIViewManager.cpp', 'ArkUIViewManager.hpp',
  'NativeScroll.inc', 'CMakeLists.txt', 'gesture.hpp', 'gesture.cpp', 'SheetInteraction.hpp',
  'tests/verify-scroll-dismiss-keyboard.py', 'tests/verify-refresh-native.py',
  'tests/verify-wheel-native.py', 'tests/verify-component-dispatch.py', 'tests/verify-mount-reentry.py']);
const retiredExisting = new Set(['NativeGestures.inc']);
for (const directory of [app, fork]) for (const name of retiredExisting)
  if (existsSync(resolve(directory, name))) throw new Error(`Retired gesture include still exists: ${directory}/${name}`);
const wheelP2 = new Map([
  ['WheelState.hpp', 'b74239bd80eeb5a4c8e3b5c1e832547f0d00a6c0c987c090996f28a64cdaeb7c'],
  ['tests/wheel-native.cpp', '92a70d9988d7a54251b1417b598bf7f809d64cfd63c53dd0366491fb5051b548'],
]);
// Separately authorized object-props migration. Keep the immutable historical
// receipts above intact; only these reviewed wheel inputs have new baselines.
const wheelObjectProps = new Map();
for (const directory of [app, fork]) {
  for (const [name, sha] of [
    ['NativeWheel.inc', '2d66fbae4902f54bdf820b871aa76224d300a383708de94461013bcb32455d8f'],
    ['NativeWheel.hpp', '6159b30b89864d079a78e5bf4a8bd984ad07a15bb568726267b4707d1f4298ce'],
    ['WheelState.hpp', 'c4b088877697c75f3e13e80fb5ed80121c846b6bc1d47177fc467a5b868ec836'],
  ]) wheelObjectProps.set(resolve(directory, name), sha);
}
wheelObjectProps.set(resolve(app, 'tests/wheel-native.cpp'),
  'e821c0aeea4176c551ddcbcb6908d6ec8b0bb7cbb4dccc8c2b42953ab5d307fe');
const protectedSources = [];
// The extracted inputEnabled dependency now includes the retained mounted-root
// parent lookup. These are layout-only additions to the old SDK boundaries;
// normalize exactly those fields so every old test assertion remains guarded
// by its original hash.
const originalBoundary = (relative, path) => {
  let text = readFileSync(path, 'utf8');
  if (relative === 'tests/wheel-native.cpp') {
    text = text.replace('    std::vector<Node*> nodes;\n', '')
      .replace('struct Inactive { ArkUI_NodeHandle handle = nullptr, content = nullptr; };',
        'struct Inactive { ArkUI_NodeHandle handle = nullptr; };');
  } else if (relative === 'tests/scroll-dismiss-keyboard.cpp') {
    text = text.replace('    std::vector<Node*> nodes;\n', '')
      .replace('    struct RefreshBoundary { ArkUI_NodeHandle handle = nullptr; };\n    std::shared_ptr<RefreshBoundary> refresh;',
        '    bool refresh = false;');
  }
  return createHash('sha256').update(text).digest('hex');
};
for (const [path, original] of Object.entries(baseline.sources)) {
  const directory = path.startsWith(`${app}/`) ? app : fork;
  const relative = path.slice(directory.length + 1);
  if (ownedExisting.has(relative) || retiredExisting.has(relative)) continue;
  const expected = wheelObjectProps.get(path) ?? wheelP2.get(relative) ?? original.sha256;
  const current = digest(path);
  if (current !== expected && originalBoundary(relative, path) !== expected)
    throw new Error(`Protected source changed: ${path}`);
  if (!wheelObjectProps.has(path) && wheelP2.has(relative) && prior.sources[path]?.sha256 !== expected)
    throw new Error(`Wheel P2 relationship prior differs: ${path}`);
  protectedSources.push({ path, sha256: current,
    layoutOnlyGestureConsumerMigration: current !== expected,
    reference: wheelObjectProps.has(path) ? 'authorized-wheel-object-props'
      : wheelP2.has(relative) ? 'authorized-wheel-P2-prior' : 'original-wheel31-baseline' });
}
const mirrored = ['ArkUIViewManager.hpp', 'NativeScroll.inc', 'gesture.hpp', 'gesture.cpp',
  'NativeWheel.inc', 'NativeWheel.hpp', 'WheelState.hpp',
  ...readdirSync(app).filter(name => /^SheetInteraction.*\.(hpp|inc)$/.test(name))];
for (const name of mirrored) if (digest(resolve(app, name)) !== digest(resolve(fork, name)))
  throw new Error(`Backend mirror differs: ${name}`);
const sources = [];
for (const directory of [app, fork]) for (const name of new Set([...ownedExisting, ...mirrored])) {
  const path = resolve(directory, name);
  if (existsSync(path)) sources.push({ path, sha256: digest(path) });
}
for (const name of readdirSync(resolve(root, 'scripts/harmony/tests')).filter(name => name.startsWith('sheet-backend'))) {
  const path = resolve(root, 'scripts/harmony/tests', name);
  sources.push({ path, sha256: digest(path) });
}
console.log(JSON.stringify({
  captured: new Date().toISOString(),
  validationKind: 'source-integrity-only',
  nativeCompilerInvoked: false, nativeFixtureExecuted: false,
  sourceFixture: 'scripts/harmony/tests/sheet-backend-native.cpp',
  fixtureBodies: ['SheetInteraction.inc', 'SheetInteractionMount.inc', 'SheetInteractionInput.inc',
    'SheetInteractionState.hpp', 'WheelArbitration.inc'],
  historicalWheel31: { path: freezePath, sha256: historicalSHA, unchanged: true },
  originalBaseline: { path: baselinePath, sha256: digest(baselinePath) },
  wheelP2RelationshipPrior: { path: priorPath, sha256: digest(priorPath) },
  sources, protectedSources, identicalMirrors: mirrored,
  pending: ['parent-owned SDK26 x86_64 and arm64 manager compilation',
    'parent-owned actual-body backend fixture compilation and execution',
    'parent-owned independent review after full source freeze',
    'instrumented real-device native event order and nested-budget acceptance',
    'full current-source link/package/device validation'],
}, null, 2));
