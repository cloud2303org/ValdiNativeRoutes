// Small CI adapter; builds and runtime validation use the same local entry points.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { checkRuntime } from './prerequisites.mjs';
import { root } from './upstream.mjs';

function output(name, value) {
  console.log(`${name}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

const [command, platform] = process.argv.slice(2);
if (command === 'toolchain') {
  const capture = (executable, args) => execFileSync(executable, args, { encoding: 'utf8' }).trim();
  const versions = [process.platform, process.arch, capture('sw_vers', ['-productVersion']),
    capture('xcodebuild', ['-version']), capture('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-version']),
    capture('cmake', ['--version']), capture('ninja', ['--version'])].join('\n');
  console.log(versions);
  output('key', createHash('sha256').update(versions).digest('hex'));
} else if (['runtime-key', 'runtime-valid'].includes(command) && ['android', 'ios'].includes(platform)) {
  if (command === 'runtime-key') {
    const stamp = JSON.parse(execFileSync(process.execPath, ['scripts/ota.mjs', 'valdi-hash', platform, 'debug'], { cwd: root, encoding: 'utf8' }));
    output('key', stamp.valdi);
  } else {
    try {
      checkRuntime(root, platform);
      output('valid', 'true');
    } catch (error) {
      console.log(error.message);
      output('valid', 'false');
    }
  }
} else throw new Error('Usage: node scripts/ci.mjs toolchain | runtime-key PLATFORM | runtime-valid PLATFORM');
