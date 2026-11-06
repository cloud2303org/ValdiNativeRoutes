import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'check';

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Database ${command} failed (${result.status ?? result.signal})`);
}

try {
  if (!['check', 'generate', 'test-native'].includes(command) || process.argv.length > 3) {
    throw new Error('Usage: node scripts/database.mjs check|generate|test-native');
  }
  const patch = readFileSync(path.join(root, 'valdi/bzl/patches/clientsql-drizzle.patch'));
  const modulePatch = readFileSync(path.join(root, 'module-build/bzl/patches/clientsql-drizzle.patch'));
  if (!patch.equals(modulePatch)) throw new Error('Both Bazel workspaces must apply the same database native contract.');
  if (command === 'test-native') {
    run(['scripts/prepare-valdi.mjs']);
    const result = spawnSync(process.env.BAZEL_BIN ?? 'bazel', [
      '--max_idle_secs=60', 'test',
      '@valdi//src/valdi_modules/src/valdi/client_sql:client_sql_native_tests',
      '--jobs=4', '--test_output=errors', '--nocache_test_results',
      ...(process.platform === 'darwin' ? ['--repo_env=VALDI_PLATFORM_DEPENDENCIES=ios'] : []),
    ], { cwd: path.join(root, 'valdi'), stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ClientSQL native tests failed (${result.status ?? result.signal})`);
  } else {
    if (command === 'generate') {
      run(['node_modules/drizzle-kit/bin.cjs', 'generate', '--config', 'drizzle.config.ts'], path.join(root, 'valdi'));
    }
    run(['scripts/generate-drizzle-migrations.mjs', ...(command === 'check' ? ['--check'] : [])]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
