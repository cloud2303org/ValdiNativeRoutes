import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSources, runPnpm } from './prerequisites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  prepareSources(root);
  runPnpm(['--dir', 'tools/valdi-rolldown', 'tsconfig'], root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
