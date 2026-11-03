import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const digest = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const historicalReceiptPath = 'scripts/harmony/tests/sheet-geometry-20261103-source-receipt.json';
const historicalReceiptSha = '9018356eda3ae58554fc289ca78e0e06382ecf978a01775b529fa517382eaf1d';
if (digest(historicalReceiptPath) !== historicalReceiptSha) throw new Error('Original receipt changed');

const prefix = 'scripts/harmony/tests/sheet-surface-p2-prefix-20261103';
const prefixManifest = JSON.parse(readFileSync(resolve(root, prefix, 'manifest.json'), 'utf8'));
for (const entry of prefixManifest.entries) {
  if (digest(`${prefix}/${entry.snapshotRelativePath}`) !== entry.sha256)
    throw new Error(`Historical snapshot changed: ${entry.originalPath}`);
}
const regressions = 'scripts/harmony/tests/sheet-surface-p2-regression-frozen-20261103';
const regressionManifest = JSON.parse(readFileSync(resolve(root, regressions, 'manifest.json'), 'utf8'));
for (const entry of regressionManifest.entries) {
  if (digest(entry.path) !== entry.sha256 || digest(`${regressions}/${entry.path}`) !== entry.sha256)
    throw new Error(`Identical regression source changed: ${entry.path}`);
}

// Node only: the delegated child is never allowed to spend the native slot.
const result = spawnSync(process.execPath, ['scripts/harmony/tests/sheet-geometry-check.mjs'], {
  cwd: root, encoding: 'utf8',
});
if (result.status !== 0 || result.error) {
  process.stderr.write(result.stderr || result.stdout || String(result.error));
  process.exit(result.status || 1);
}
const scalar = JSON.parse(result.stdout);
const sources = [
  ...scalar.sources.map(entry => entry.path),
  'scripts/harmony/tests/sheet-surface-p2-native.cpp',
  'scripts/harmony/tests/sheet-surface-p2-boundary.hpp',
  'scripts/harmony/tests/sheet-surface-p2.md',
  'scripts/harmony/tests/sheet-surface-p2-check.mjs',
  'scripts/harmony/tests/sheet-surface-p2-20261103.patch',
];
const receipt = {
  recordedAt: new Date().toISOString(),
  workspace: root,
  change: 'Preserve original terminal intent across collapsed layout restart; expose explicit interactionNode',
  historicalReceipt: { path: historicalReceiptPath, sha256: historicalReceiptSha, verifiedUnchanged: true },
  prefixSnapshotManifest: { path: `${prefix}/manifest.json`, sha256: digest(`${prefix}/manifest.json`), verified: true },
  regressionSnapshotManifest: { path: `${regressions}/manifest.json`, sha256: digest(`${regressions}/manifest.json`), verified: true },
  originalHelperSources: prefixManifest.entries.filter(entry => entry.originalPath.startsWith('harmony/')),
  helperSources: scalar.sources.filter(entry => entry.path.startsWith('harmony/')),
  sources: sources.map(path => ({ path, sha256: digest(path) })),
  identicalRegressionSources: regressionManifest.entries,
  baselineHeaderSelector: 'SHEET_SURFACE_HEADER',
  baselineAccessorOnlyGate: 'SHEET_SURFACE_TEST_INTERACTION_NODE=0',
  fixedAccessorOnlyGate: 'SHEET_SURFACE_TEST_INTERACTION_NODE=1 (default)',
  javaScriptGeometry: { command: scalar.command, nodeVersion: scalar.nodeVersion, validationKind: scalar.validationKind,
    status: scalar.status, stdout: scalar.stdout, stderr: scalar.stderr },
  sdkDeclarations: scalar.sdkDeclarations,
  nativeCompilerInvoked: false,
  nativeFixtureExecuted: false,
  nativeRedGreen: 'pending-parent-serial-slot',
  independentRoundTwoReview: 'parent-owned-pending-after-freeze',
  cppSdkCompile: 'pending-parent-serial-slot',
  integratedBuildAndDevice: 'not-run',
  historicalNative14Media14Receipts: 'untouched',
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
