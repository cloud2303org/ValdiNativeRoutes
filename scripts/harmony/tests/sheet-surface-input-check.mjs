import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bytes = path => readFileSync(resolve(root, path));
const hashBytes = value => createHash('sha256').update(value).digest('hex');
const digest = path => hashBytes(bytes(path));
const json = path => JSON.parse(bytes(path).toString('utf8'));
const originals = [
  { path: 'scripts/harmony/tests/sheet-geometry-20261103-source-receipt.json',
    sha256: '9018356eda3ae58554fc289ca78e0e06382ecf978a01775b529fa517382eaf1d' },
  { path: 'scripts/harmony/tests/sheet-surface-p2-20261103-source-receipt.json',
    sha256: 'a412dc50e0f8c470002f6ba596d3915ac9a063c5e3635080a62c054818a84d11' },
];
for (const entry of originals) if (digest(entry.path) !== entry.sha256) throw new Error(`Historical receipt changed: ${entry.path}`);
const snapshots = [
  'scripts/harmony/tests/sheet-surface-p2-prefix-20261103',
  'scripts/harmony/tests/sheet-surface-input-prefix-20261103',
];
for (const directory of snapshots) {
  for (const entry of json(`${directory}/manifest.json`).entries) {
    if (digest(`${directory}/${entry.snapshotRelativePath}`) !== entry.sha256)
      throw new Error(`Historical snapshot changed: ${entry.originalPath}`);
  }
}
const regressionDirectory = 'scripts/harmony/tests/sheet-surface-p2-regression-frozen-20261103';
for (const entry of json(`${regressionDirectory}/manifest.json`).entries) {
  if (digest(entry.path) !== entry.sha256 || digest(`${regressionDirectory}/${entry.path}`) !== entry.sha256)
    throw new Error(`Original P2 regression changed: ${entry.path}`);
}

const auditPath = '/tmp/valdi-sheets-20261103/resume-20261103-partial-audit/receipt.json';
const audit = json(auditPath);
const helpers = ['HarmonySheetGeometry.hpp', 'HarmonySheetSurface.hpp', 'HarmonySheetSurface.cpp']
  .map(name => `harmony/entry/src/main/cpp/host/${name}`);
for (const path of helpers.slice(1)) {
  const entry = audit.sources[resolve(root, path)];
  if (!entry || digest(path) !== entry.sha256 || digest(entry.snapshot) !== entry.sha256)
    throw new Error(`Helper changed since paused audit: ${path}`);
}

const manifestPaths = [
  'scripts/harmony/tests/sheet-surface-navigation-baseline-source.json',
  'scripts/harmony/tests/sheet-surface-navigation-resumed-source.json',
];
const extractions = manifestPaths.map(path => {
  const manifest = json(path);
  if (digest(manifest.source) !== manifest.sourceSha256 ||
      digest(manifest.extractor) !== manifest.extractorSha256 ||
      digest(manifest.output) !== manifest.outputSha256)
    throw new Error(`Extraction input/output changed: ${path}`);
  const lines = bytes(manifest.source).toString('utf8').split('\n');
  const bodies = manifest.methods.map(method => {
    // Independent line/byte check of the extractor's unchanged method output.
    const body = lines.slice(method.startLine - 1, method.endLine).join('\n');
    if (hashBytes(body) !== method.sha256 || method.transformation !== 'none')
      throw new Error(`Production method bytes changed: ${method.name}`);
    return body;
  });
  const rebuilt = '// Unchanged production definitions; collaborators are declared in\n' +
    '// sheet-surface-navigation-boundary.hpp. No surface substitutions.\n\n' +
    bodies.join('\n\n') + '\n';
  if (rebuilt !== bytes(manifest.output).toString('utf8'))
    throw new Error(`Generated definitions are not exact production bytes: ${path}`);
  return { path, sha256: digest(path), ...manifest };
});
const changedMethods = extractions[0].methods.filter(before =>
  extractions[1].methods.find(after => after.name === before.name)?.sha256 !== before.sha256).map(entry => entry.name);
if (JSON.stringify(changedMethods) !== JSON.stringify(['closeSheet', 'reconcileSheet']))
  throw new Error(`Unexpected host method delta: ${changedMethods.join(',')}`);

// Preserve the first live extraction as historical metadata. Its full mutable
// host source changed outside these six methods; the resumed immutable snapshot
// must still produce the exact same generated definitions.
const firstLivePath = 'scripts/harmony/tests/sheet-surface-navigation-live-source.json';
const firstLive = json(firstLivePath);
if (digest(firstLive.output) !== firstLive.outputSha256 ||
    firstLive.outputSha256 !== extractions[1].outputSha256 ||
    JSON.stringify(firstLive.methods.map(entry => [entry.name, entry.sha256])) !==
    JSON.stringify(extractions[1].methods.map(entry => [entry.name, entry.sha256])))
  throw new Error('Out-of-method host change altered tested method identity');

// Read-only attribution of the controller's already completed native runs.
// No command recorded in these receipts is executed by this checker.
const coreNativeSources = [
  ...helpers,
  'scripts/harmony/tests/sheet-surface-navigation-native.cpp',
  'scripts/harmony/tests/sheet-surface-navigation-boundary.hpp',
  'scripts/harmony/tests/sheet-surface-p2-boundary.hpp',
];
const controllerNative = ['baseline', 'fixed'].map((mode, index) => {
  const directory = `/tmp/valdi-sheets-20261103/surface-navigation-integration/${mode}`;
  const path = `${directory}/receipt.json`;
  const record = json(path);
  for (const source of coreNativeSources) {
    if (record.inputSHA256[resolve(root, source)] !== digest(source))
      throw new Error(`Controller ${mode} input differs from freeze: ${source}`);
  }
  const generatedPath = Object.keys(record.inputSHA256).find(entry => entry.endsWith(`/${mode}.inc`));
  if (!generatedPath || digest(generatedPath) !== record.inputSHA256[generatedPath] ||
      digest(generatedPath) !== extractions[index].outputSha256)
    throw new Error(`Controller ${mode} did not compile the selected exact host bodies`);
  const terminal = record.commands.at(-1);
  if (terminal.exit !== (mode === 'baseline' ? -6 : 0) ||
      record.commands.slice(0, -1).some(entry => entry.exit !== 0))
    throw new Error(`Unexpected controller ${mode} command outcome`);
  const log = bytes(terminal.log).toString('utf8');
  if (mode === 'baseline' ? !log.includes('Foreground closing carrier must remain natively VISIBLE') :
      !log.includes('PASS actual surface + unchanged Navigator bodies'))
    throw new Error(`Controller ${mode} result log does not substantiate the expected boundary`);
  return { mode, path, sha256: digest(path), terminalExit: terminal.exit,
    runLog: { path: terminal.log, sha256: digest(terminal.log), text: log },
    sameFixtureAndHelperInputsVerified: coreNativeSources.map(path => ({ path, sha256: digest(path) })),
    generatedBodies: { path: generatedPath, sha256: digest(generatedPath) },
    executionOwner: 'parent exclusive serial controller',
    serialNativeInvocations: record.serialNativeInvocations, maxJobs: record.maxJobs,
    applicationOrFullRuntimeLinked: record.applicationOrFullRuntimeLinked,
    HAP: record.HAP, device: record.device };
});

// Only a Node scalar test process is started. No native tool is invoked.
const result = spawnSync(process.execPath, ['scripts/harmony/tests/sheet-geometry-check.mjs'], { cwd: root, encoding: 'utf8' });
if (result.status !== 0 || result.error) {
  process.stderr.write(result.stderr || result.stdout || String(result.error));
  process.exit(result.status || 1);
}
const scalar = JSON.parse(result.stdout);
const sources = [
  ...scalar.sources.map(entry => entry.path),
  'scripts/harmony/tests/sheet-surface-p2-native.cpp',
  'scripts/harmony/tests/sheet-surface-p2-boundary.hpp',
  'scripts/harmony/tests/sheet-surface-input-native.cpp',
  'scripts/harmony/tests/sheet-surface-navigation-extract.py',
  'scripts/harmony/tests/sheet-surface-navigation-boundary.hpp',
  'scripts/harmony/tests/sheet-surface-navigation-native.cpp',
  'scripts/harmony/tests/sheet-surface-navigation-baseline-bodies.inc',
  'scripts/harmony/tests/sheet-surface-navigation-bodies.inc',
  'scripts/harmony/tests/sheet-surface-navigation-resumed-bodies.inc',
  firstLivePath,
  ...manifestPaths,
  'scripts/harmony/tests/sheet-surface-input-navigation.md',
  'scripts/harmony/tests/sheet-surface-input-check.mjs',
  'scripts/harmony/tests/sheet-surface-input-source-check-attempt1.json',
  'scripts/harmony/tests/sheet-surface-input-20261103.patch',
];
const receipt = {
  recordedAt: new Date().toISOString(), workspace: root,
  change: 'Independent sheet input gate and actual surface plus unchanged Navigator visibility fixture',
  originalReceipts: originals.map(entry => ({ ...entry, verifiedUnchanged: true })),
  snapshots: snapshots.map(directory => ({ path: `${directory}/manifest.json`, sha256: digest(`${directory}/manifest.json`), verified: true })),
  pauseAudit: { path: auditPath, sha256: digest(auditPath), helperSourcesUnchangedSinceAudit: true,
    inputFixtureAdjustment: 'one .2 to .1 sample before resized re-enabled scrim assertion' },
  helperSources: helpers.map(path => ({ path, sha256: digest(path) })),
  sources: sources.map(path => ({ path, sha256: digest(path) })),
  hostExtractions: extractions, changedHostMethods: changedMethods,
  historicalLiveExtraction: { path: firstLivePath, sha256: digest(firstLivePath),
    originalFullHostSha256: firstLive.sourceSha256, currentSnapshotFullHostSha256: extractions[1].sourceSha256,
    generatedMethodIdentityUnchanged: true },
  fixedHostHeader: { path: 'harmony/entry/src/main/cpp/host/HarmonyNavigator.hpp', sha256: digest('harmony/entry/src/main/cpp/host/HarmonyNavigator.hpp') },
  reference: { path: 'ios/ValdiRoutes/SheetHostView.swift', sha256: digest('ios/ValdiRoutes/SheetHostView.swift'),
    scope: 'interaction and ownership reference, no platform physics equivalence' },
  sourceVerification: 'historical hashes, pause audit, generated method bytes and bounded host delta',
  javaScriptGeometry: { command: scalar.command, nodeVersion: scalar.nodeVersion, validationKind: scalar.validationKind,
    status: scalar.status, stdout: scalar.stdout, stderr: scalar.stderr },
  sdkDeclarations: scalar.sdkDeclarations,
  controllerNative,
  childNativeCompilerInvoked: false, childNativeFixtureExecuted: false,
  integratedNativeVisibility: 'parent baseline native VISIBLE assertion RED -6 and fixed GREEN 0; exact inputs verified read-only',
  arkuiSiblingHitTestingAndOrdering: 'unverified-device-behavior',
  fullRuntimeBackendAndJsVmIntegration: 'not-executed-by-this-bounded-fixture',
  historicalNative14Media14AndNative566458: 'untouched-by-child',
  independentReview: 'parent-owned', heavyBuildHapAndDevice: 'not-run',
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
