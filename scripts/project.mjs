// Root build commands only build; installing/launching an app belongs to the device workflow.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDependencies, checkRuntime, checkSources, checkVision, run, runPnpm } from './prerequisites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, ...forwarded] = process.argv.slice(2);
if (forwarded[0] === '--') forwarded.shift();

function main() {
  if (platform === 'modules' || platform === 'test') {
    checkDependencies(root);
    const sourceOption = forwarded.indexOf('--valdi');
    if (sourceOption >= 0 && !forwarded[sourceOption + 1]) throw new Error('--valdi requires a source directory.');
    if (platform === 'test' && sourceOption >= 0) forwarded[sourceOption + 1] = path.resolve(forwarded[sourceOption + 1]);
    checkSources(root, platform === 'test' && sourceOption >= 0 ? forwarded[sourceOption + 1] : undefined);
    if (platform === 'modules') {
      runPnpm(['--dir', 'tools/valdi-rolldown', 'build', ...forwarded], root);
    } else {
      run(process.execPath, ['--test', 'scripts/tests/prerequisites.test.mjs', 'scripts/tests/upstream.test.mjs'], root);
      runPnpm(['--dir', 'tools/valdi-rolldown', 'exec', 'tsx', '--test', 'resources.test.ts', 'hermes.test.ts'], root);
      runPnpm(['--dir', 'tools/valdi-rolldown', 'exec', 'tsx', 'codegen/goldens.ts', ...forwarded], root);
    }
    return;
  }
  if (!['android', 'ios'].includes(platform)) {
    throw new Error('Usage: node scripts/project.mjs modules|test|android|ios [options]');
  }
  if (forwarded.includes('--help')) {
    console.log(platform === 'android'
      ? 'pnpm build:android [Gradle options]\nBuilds :app:assembleDebug into android/app/build/outputs/apk/debug/.'
      : 'pnpm build:ios [xcodebuild options]\nGenerates the Xcode project and builds Debug for iOS Simulator into ios/build/.');
    return;
  }
  if (platform === 'ios' && process.platform !== 'darwin') throw new Error('build:ios requires macOS and Xcode.');
  checkDependencies(root);
  checkRuntime(root, platform);
  checkSources(root);
  checkVision(root, platform);
  if (platform === 'android') {
    run('./gradlew', [':app:assembleDebug', ...forwarded], path.join(root, 'android'));
    return;
  }
  const cwd = path.join(root, 'ios');
  run('xcodegen', ['generate', '--spec', 'project.yml'], cwd);
  run('xcodebuild', [
    '-project', 'ValdiRoutes.xcodeproj',
    '-scheme', 'ValdiRoutes',
    '-configuration', 'Debug',
    '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator',
    '-derivedDataPath', 'build',
    'CODE_SIGNING_ALLOWED=NO',
    ...forwarded,
    'build',
  ], cwd);
}

try {
  main();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
