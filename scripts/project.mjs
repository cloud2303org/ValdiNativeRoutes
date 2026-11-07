// Root build commands only build; installing/launching an app belongs to the device workflow.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDependencies, checkRuntime, checkSources, checkVision, run, runPnpm } from './prerequisites.mjs';
import { buildNodeModules } from './node-modules.mjs';
import { appBuildPaths, syncAppConfig } from './app-config.mjs';
import { generateIosProject } from './ios-project.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, ...forwarded] = process.argv.slice(2);
if (forwarded[0] === '--') forwarded.shift();

function main() {
  if (platform === 'modules' || platform === 'test') {
    checkDependencies(root);
    run(process.execPath, ['scripts/database.mjs', 'check'], root);
    const sourceOption = forwarded.indexOf('--valdi');
    if (sourceOption >= 0 && !forwarded[sourceOption + 1]) throw new Error('--valdi requires a source directory.');
    if (platform === 'test' && sourceOption >= 0) forwarded[sourceOption + 1] = path.resolve(forwarded[sourceOption + 1]);
    checkSources(root, platform === 'test' && sourceOption >= 0 ? forwarded[sourceOption + 1] : undefined);
    if (platform === 'modules') {
      runPnpm(['--dir', 'tools/valdi-rolldown', 'build', ...forwarded], root);
    } else {
      run(process.execPath, ['--test', 'scripts/tests/app-config.test.mjs', 'scripts/tests/app-icons.test.mjs', 'scripts/tests/ota.test.mjs', 'scripts/tests/ota-delta.test.mjs', 'scripts/tests/hdiff-tool.test.mjs', 'scripts/tests/release.test.mjs', 'scripts/tests/prerequisites.test.mjs', 'scripts/tests/upstream.test.mjs', 'scripts/tests/cli.test.mjs', 'scripts/tests/dev-controls.test.mjs', 'scripts/tests/native-modules.test.mjs', 'scripts/tests/module-selection.test.mjs', 'scripts/tests/swift-runtime.test.mjs'], root);
      const valdiSource = sourceOption >= 0 ? forwarded[sourceOption + 1] : [
        path.join(root, 'valdi/.valdi-sources/external/valdi+'),
        path.join(root, 'valdi/bazel-valdi/external/valdi+'),
      ].find(dir => existsSync(path.join(dir, 'modules/_configs/base.tsconfig.json'))) ?? path.join(root, 'valdi/bazel-valdi/external/valdi+');
      // runtime-module.test.ts and the declaration fixtures read the Valdi sources from here;
      // the workspace's bazel-valdi link can point at an execroot that no longer has them.
      process.env.VALDI_SOURCE_ROOT ||= valdiSource;
      // Compiler fixtures read the app's tsconfigs, which must use this same source tree.
      const rolldownDir = path.join(root, 'tools/valdi-rolldown');
      const tsx = path.join(rolldownDir, 'node_modules/tsx/dist/cli.mjs');
      run(process.execPath, [tsx, 'tsconfig.ts'], rolldownDir);
      run(process.execPath, ['--test', path.join(valdiSource, 'bzl/valdi/node_tools/rewrite_header.test.mjs')], root);
      // Run tsx's launcher with Node directly: `pnpm exec` resolves the binary differently on
      // Windows and can report `Command "tsx" not found` for the same install.
      run(process.execPath, [tsx, '--test', 'routes.test.ts', 'navigation-options.test.ts', 'mobile-services.test.ts', 'typed-routing.test.ts', 'native-module-access.test.ts', 'host-extension.test.ts', 'cpp-modules.test.ts', 'codegen-ownership.test.ts', 'organization-boundary.test.ts', 'splash-screen.test.ts', 'ota-module.test.ts', 'editor-config.test.ts', 'typed-storage.test.ts', 'appui-promise.test.ts', 'service-modules.test.ts', 'route-animation-parity.test.ts', 'dev-protocol.test.ts', 'wheel-platform-compat.test.ts', 'webview-module.test.ts', 'webview-page.test.ts', 'resources.test.ts', 'hermes.test.ts', 'archive.test.ts', 'build-cli.test.ts', 'module-build.test.ts', 'runtime-module.test.ts', 'scaffold.test.ts', 'swift.test.ts', 'objc-selector.test.ts', 'bluetooth.test.ts', 'bluetooth-execution.test.ts', 'drizzle-driver.test.ts', 'drizzle-migrations.test.ts', 'module-selection.test.ts', 'jsx-upstream.test.ts', 'lazy-import.test.ts', 'upstream-runtime.test.ts'], rolldownDir);
      run(process.execPath, [tsx, '--test', '../../valdi/modules/native_common/tests/module-split.test.mts'], rolldownDir);
      // The goldens compare against the same sources the tests used, whatever link holds them.
      const goldensArgs = ['codegen/goldens.ts', ...forwarded];
      if (sourceOption < 0) goldensArgs.push('--valdi', valdiSource);
      run(process.execPath, [tsx, ...goldensArgs], rolldownDir);
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
  run(process.execPath, ['scripts/database.mjs', 'check'], root);
  syncAppConfig(root);
  checkRuntime(root, platform);
  checkSources(root);
  checkVision(root, platform);
  if (platform === 'android') {
    buildNodeModules('android', false, true);
    // Node 24 refuses to execute Gradle's .cmd wrapper directly, so route through cmd.exe on Windows.
    if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat', ':app:assembleDebug', ...forwarded], path.join(root, 'android'));
    else run('./gradlew', [':app:assembleDebug', ...forwarded], path.join(root, 'android'));
    return;
  }
  const cwd = path.join(root, 'ios');
  buildNodeModules('ios', false, true);
  generateIosProject(root);
  const paths = appBuildPaths(root);
  run('xcodebuild', [
    '-project', paths.iosProject,
    '-scheme', paths.iosScheme,
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
