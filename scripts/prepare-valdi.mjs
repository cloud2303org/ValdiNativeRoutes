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
  // Explicit flags beat every rc file, including a user-level ~/.bazelrc that could redirect an
  // isolated fetch to a shared output base or repository cache.
  const envStartup = (process.env.VALDI_BAZEL_STARTUP_ARGS ?? '').split(/\s+/).filter(Boolean);
  const envBazel = (process.env.VALDI_BAZEL_ARGS ?? '').split(/\s+/).filter(Boolean);
  // Both options keep an isolated build from touching a shared Bazel server or cache.
  const isolatedRoot = outputBase ? path.resolve(outputBase).replace(/\\/g, '/') : undefined;
  prepareSources(root, {
    // A host-level `startup --output_base` in ~/.bazelrc overrides --output_user_root, so pass both.
    startupArgs: isolatedRoot ? [`--output_user_root=${isolatedRoot}`, `--output_base=${isolatedRoot}/base`] : envStartup,
    bazelArgs: repositoryCache ? [`--repository_cache=${path.resolve(repositoryCache).replace(/\\/g, '/')}`] : envBazel,
  });
  runPnpm(['--dir', 'tools/valdi-rolldown', 'tsconfig'], root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
