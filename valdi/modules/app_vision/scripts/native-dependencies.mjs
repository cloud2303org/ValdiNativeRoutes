import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { checkVision } from './check-dependencies.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const [action, platform] = process.argv.slice(2);
try {
  if (!['android', 'ios'].includes(platform)) throw new Error('Expected android or ios');
  if (action === 'prepare') {
    const target = platform === 'android' ? 'android-arm64' : 'ios';
    const result = spawnSync(process.execPath, ['vision/scripts/prepare-native.cjs', '--target', target, '--linkage', 'static'], { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`Vision preparation failed: ${result.error?.message ?? result.status}`);
  } else if (action !== 'check') throw new Error('Expected check or prepare');
  checkVision(root, platform);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
