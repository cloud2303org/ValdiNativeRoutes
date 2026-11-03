import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Pure Node driver: never invokes a native compiler, build tool, SDK executable,
// device, packaging command or historical receipt updater.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const sdk = '/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native/sysroot/usr/include/arkui';
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sources = [
  'harmony/entry/src/main/cpp/host/HarmonySheetGeometry.hpp',
  'harmony/entry/src/main/cpp/host/HarmonySheetSurface.hpp',
  'harmony/entry/src/main/cpp/host/HarmonySheetSurface.cpp',
  'scripts/harmony/tests/sheet-geometry-extract.mjs',
  'scripts/harmony/tests/sheet-geometry.test.mjs',
  'scripts/harmony/tests/sheet-geometry-check.mjs',
  'scripts/harmony/tests/sheet-surface-native.cpp',
  'scripts/harmony/tests/sheet-surface.md',
];
const declarations = [
  'native_node.h', 'native_animate.h', 'native_interface.h', 'common_type.h',
  'node_attributes/common_attributes.h', 'node_attributes/layout.h',
];
const result = spawnSync(process.execPath, ['--test', 'scripts/harmony/tests/sheet-geometry.test.mjs'], {
  cwd: root, encoding: 'utf8',
});
const receipt = {
  recordedAt: new Date().toISOString(),
  workspace: root,
  command: [process.execPath, '--test', 'scripts/harmony/tests/sheet-geometry.test.mjs'],
  nodeVersion: process.version,
  validationKind: 'production-scalar-statements-translated-to-JavaScript',
  status: result.status,
  stdout: result.stdout,
  stderr: result.stderr,
  processError: result.error?.message ?? null,
  sources: sources.map(path => ({ path, sha256: digest(resolve(root, path)) })),
  sdkDeclarations: declarations.map(path => ({ path: resolve(sdk, path), sha256: digest(resolve(sdk, path)) })),
  nativeCompilerInvoked: false,
  nativeFixture: 'source-only-uncompiled-unexecuted',
  cppSdkCompile: 'pending-parent-slot',
  arkuiRendering: 'unverified',
  sdkCallbackOrdering: 'unverified',
  integratedBuildAndDevice: 'not-run',
  historicalNative14Media14Receipts: 'untouched',
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
process.exitCode = result.status === 0 && !result.error ? 0 : 1;
