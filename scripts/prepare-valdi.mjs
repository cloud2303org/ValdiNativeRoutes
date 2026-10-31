import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSources, runPnpm } from './prerequisites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  args.splice(index, 2);
  return value;
}
try {
  const bazel = option('--bazel');
  const outputBase = option('--output-base');
  const repositoryCache = option('--repository-cache');
  if (args.length) throw new Error(`Unknown option: ${args[0]}`);
  if (bazel) {
    if (!path.isAbsolute(bazel)) throw new Error('--bazel needs an absolute path');
    process.env.BAZEL_BIN = bazel;
  }
  // Both options keep an isolated build from touching a shared Bazel server or cache.
  prepareSources(root, {
    startupArgs: outputBase ? [`--output_user_root=${path.resolve(outputBase).replace(/\\/g, '/')}`] : [],
    bazelArgs: repositoryCache ? [`--repository_cache=${path.resolve(repositoryCache).replace(/\\/g, '/')}`] : [],
  });
  runPnpm(['--dir', 'tools/valdi-rolldown', 'tsconfig'], root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
