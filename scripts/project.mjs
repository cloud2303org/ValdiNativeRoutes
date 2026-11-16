// Root build commands only build; installing/launching an app belongs to the device workflow.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDependencies, checkRuntime, checkSources, run, runPnpm } from './lib/prerequisites.mjs';
import { appBuildPaths, syncAppConfig } from './lib/app-config.mjs';
import { generateIosProject } from './lib/ios-project.mjs';
import { findValdiSourceRoot } from '../tools/valdi-rolldown/modules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, ...forwarded] = process.argv.slice(2);
if (forwarded[0] === '--') forwarded.shift();

const SCRIPT_TESTS = [
  'scripts/tests/app-config.test.mjs',
  'scripts/tests/app-icons.test.mjs',
  'scripts/tests/init-app.test.mjs',
  'scripts/tests/ota.test.mjs',
  'scripts/tests/ota-delta.test.mjs',
  'scripts/tests/hdiff-tool.test.mjs',
  'scripts/tests/generate-lottie-demo.test.mjs',
  'scripts/tests/release.test.mjs',
  'scripts/tests/prerequisites.test.mjs',
  'scripts/tests/upstream.test.mjs',
  'scripts/tests/cli.test.mjs',
  'scripts/tests/ci.test.mjs',
  'scripts/tests/dev-controls.test.mjs',
  'scripts/tests/native-modules.test.mjs',
  'scripts/tests/native-dependencies.test.mjs',
  'scripts/tests/localization-inputs.test.mjs',
  'scripts/tests/module-selection.test.mjs',
  'scripts/tests/swift-runtime.test.mjs',
];

const ROLLDOWN_TESTS = [
  'tests/routes.test.ts',
  'tests/navigation-options.test.ts',
  'tests/mobile-services.test.ts',
  'tests/typed-routing.test.ts',
  'tests/wifi-ble-validation.test.ts',
  'tests/native-enums.test.ts',
  'tests/video.test.ts',
  'tests/native-module-access.test.ts',
  'tests/host-extension.test.ts',
  'tests/cpp-modules.test.ts',
  'tests/codegen-ownership.test.ts',
  'tests/organization-boundary.test.ts',
  'tests/splash-screen.test.ts',
  'tests/ota-module.test.ts',
  'tests/editor-config.test.ts',
  'tests/node-project.test.ts',
  'tests/typed-storage.test.ts',
  'tests/theme-tokens.test.ts',
  'tests/appui-promise.test.ts',
  'tests/service-modules.test.ts',
  'tests/route-animation-parity.test.ts',
  'tests/dev-protocol.test.ts',
  'tests/wheel-platform-compat.test.ts',
  'tests/bottom-sheet-api.test.ts',
  'tests/webview-module.test.ts',
  'tests/webview-page.test.ts',
  'tests/resources.test.ts',
  'tests/localization.test.ts',
  'tests/localization-build.test.ts',
  'tests/dev-localization.test.ts',
  'tests/hermes.test.ts',
  'tests/archive.test.ts',
  'tests/build-cli.test.ts',
  'tests/module-build.test.ts',
  'tests/runtime-module.test.ts',
  'tests/scaffold.test.ts',
  'tests/swift.test.ts',
  'tests/objc-selector.test.ts',
  'tests/bluetooth.test.ts',
  'tests/bluetooth-execution.test.ts',
  'tests/module-selection.test.ts',
  'tests/jsx-upstream.test.ts',
  'tests/console-log.test.ts',
  'tests/lazy-import.test.ts',
  'tests/upstream-runtime.test.ts',
];

function main() {
  if (platform === 'modules' || platform === 'test' || platform === 'typecheck') {
    checkDependencies(root);
    const sourceOption = forwarded.indexOf('--valdi');
    if (sourceOption >= 0 && !forwarded[sourceOption + 1]) throw new Error('--valdi requires a source directory.');
    if (platform === 'test' && sourceOption >= 0) forwarded[sourceOption + 1] = path.resolve(forwarded[sourceOption + 1]);
    const valdiSource = platform === 'test' && sourceOption >= 0
      ? forwarded[sourceOption + 1] : findValdiSourceRoot(root);
    checkSources(root, valdiSource);
    if (platform === 'typecheck') {
      const tools = path.join(root, 'tools/valdi-rolldown');
      run(process.execPath, [path.join(tools, 'typecheck-node.mjs')], root);
      run(process.execPath, [path.join(tools, 'node_modules/tsx/dist/cli.mjs'), path.join(tools, 'typecheck.ts')], root);
    } else if (platform === 'modules') {
      runPnpm(['--dir', 'tools/valdi-rolldown', 'build', ...forwarded], root);
    } else {
      const scriptTests = SCRIPT_TESTS.filter(file => existsSync(path.join(root, file)));
      if (scriptTests.length) run(process.execPath, ['--test', ...scriptTests], root);
      // runtime-module.test.ts and the declaration fixtures read the Valdi sources from here;
      // the workspace's bazel-valdi link can point at an execroot that no longer has them.
      process.env.VALDI_SOURCE_ROOT = valdiSource;
      // Compiler fixtures read the app's tsconfigs, which must use this same source tree.
      const rolldownDir = path.join(root, 'tools/valdi-rolldown');
      const tsx = path.join(rolldownDir, 'node_modules/tsx/dist/cli.mjs');
      run(process.execPath, [path.join(rolldownDir, 'typecheck-node.mjs')], rolldownDir);
      run(process.execPath, [tsx, 'typecheck.ts'], rolldownDir);
      if (existsSync(path.join(rolldownDir, 'tests/web-unicode.test.ts'))) {
        run(process.execPath, [tsx, 'tests/web-unicode.test.ts', valdiSource], rolldownDir);
      }
      run(process.execPath, ['--test', path.join(valdiSource, 'bzl/valdi/node_tools/rewrite_header.test.mjs')], root);
      // Run tsx's launcher with Node directly: `pnpm exec` resolves the binary differently on
      // Windows and can report `Command "tsx" not found` for the same install.
      const rolldownTests = ROLLDOWN_TESTS.filter(file => existsSync(path.join(rolldownDir, file)));
      if (rolldownTests.length) run(process.execPath, [tsx, '--test', ...rolldownTests], rolldownDir);
      const moduleSplitTest = path.join(root, 'valdi/modules/native_common/tests/module-split.test.mts');
      if (existsSync(moduleSplitTest)) {
        run(process.execPath, [tsx, '--test', '../../valdi/modules/native_common/tests/module-split.test.mts'], rolldownDir);
      }
      // The goldens compare against the same sources the tests used, whatever link holds them.
      const goldensArgs = ['codegen/goldens.ts', ...forwarded];
      if (sourceOption < 0) goldensArgs.push('--valdi', valdiSource);
      run(process.execPath, [tsx, ...goldensArgs], rolldownDir);
    }
    return;
  }
  if (!['android', 'ios'].includes(platform)) {
    throw new Error('Usage: node scripts/project.mjs modules|test|typecheck|android|ios [options]');
  }
  if (forwarded.includes('--help')) {
    console.log(platform === 'android'
      ? 'pnpm build:android [Gradle options]\nBuilds :app:assembleDebug into android/app/build/outputs/apk/debug/.'
      : 'pnpm build:ios [xcodebuild options]\nGenerates the Xcode project and builds Debug for iOS Simulator into ios/build/.');
    return;
  }
  if (platform === 'ios' && process.platform !== 'darwin') throw new Error('build:ios requires macOS and Xcode.');
  checkDependencies(root);
  syncAppConfig(root);
  checkRuntime(root, platform);
  checkSources(root);
  if (platform === 'android') {
    // Node 24 refuses to execute Gradle's .cmd wrapper directly, so route through cmd.exe on Windows.
    if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat', ':app:assembleDebug', ...forwarded], path.join(root, 'android'));
    else run('./gradlew', [':app:assembleDebug', ...forwarded], path.join(root, 'android'));
    return;
  }
  const cwd = path.join(root, 'ios');
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
