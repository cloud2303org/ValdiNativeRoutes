// Keep each existing lockfile and the patched Valdi CLI in its own package directory.
// Installation prepares JS dependencies and editor paths; native compilation is explicit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from './lib/prerequisites.mjs';
import { syncNativeModuleRegistration } from './lib/native-modules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockfileFlag = process.env.CI ? '--frozen-lockfile' : '--prefer-frozen-lockfile';
for (const directory of ['valdi', 'tools/valdi-rolldown']) {
  console.log(`Installing ${directory} (${lockfileFlag})…`);
  runPnpm(['--dir', directory, 'install', lockfileFlag], root);
}
runPnpm(['--dir', 'tools/valdi-rolldown', 'tsconfig'], root);
syncNativeModuleRegistration(root);
console.log('JS dependencies installed; editor config preparation status is reported above.');
console.log('First native build: prepare the runtime with scripts/maintainer/export-android.sh or scripts/maintainer/export-ios.sh.');
