// Keep each existing lockfile and the patched Valdi CLI in its own package directory.
// Installation prepares JS dependencies and editor paths; native compilation is explicit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from './prerequisites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const directory of ['valdi', 'tools/valdi-rolldown']) {
  console.log(`Installing ${directory} from its lockfile…`);
  runPnpm(['--dir', directory, 'install', '--frozen-lockfile'], root);
}
runPnpm(['--dir', 'tools/valdi-rolldown', 'tsconfig'], root);
console.log('JS dependencies and editor paths are ready.');
console.log('First native build: prepare the runtime with scripts/export-android.sh or scripts/export-ios.sh.');
