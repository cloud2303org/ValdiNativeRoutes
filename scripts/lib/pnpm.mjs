// Run pnpm through the same version-aware launcher used by the Node build scripts.
import { spawnSync } from 'node:child_process';
import { pnpmInvocation } from './prerequisites.mjs';

const invocation = pnpmInvocation(process.argv.slice(2));
const result = spawnSync(invocation.command, invocation.args, { cwd: process.cwd(), stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
