import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkNativeDependencies, inspectNativeDependencies, prepareNativeDependencies } from '../native-dependencies.mjs';
import { nativeModuleCmake, nativeModuleInputs, nativeModules, syncNativeModuleRegistration } from '../native-modules.mjs';
import { sampleApp } from './fixtures/app-config.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-native-dependencies-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  };
  const select = modules => write('package.json', JSON.stringify({ valdi: { app: sampleApp(), modules } }));
  return { root, write, select };
}

for (const nativeBuild of ['host', 'bazel']) test(`${nativeBuild} app dependency lifecycle prepares, rechecks, reuses current outputs and ignores disabled modules`, t => {
  const { root, write, select } = fixture(t);
  const config = {
    nativeBuild, nativeDependencies: { script: 'prepare.mjs', inputs: ['lock.json'] },
  };
  write('valdi/modules/example/src/index.ts', 'export {};');
  write('valdi/modules/example/module.json', JSON.stringify(config));
  write('valdi/modules/example/prepare.mjs', `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [action, platform] = process.argv.slice(2);
const stamp = path.join(import.meta.dirname, platform + '.stamp');
appendFileSync(path.join(import.meta.dirname, 'calls'), action + ':' + platform + '\\n');
if (action === 'prepare') writeFileSync(stamp, 'ready');
else if (!existsSync(stamp)) { console.error('missing pinned dependency'); process.exitCode = 1; }
`);
  select(['example']);
  assert.deepEqual(inspectNativeDependencies(root, 'android').map(item => [item.name, item.current]), [['example', false]]);
  assert.throws(() => checkNativeDependencies(root, 'android'), /example.*android.*missing pinned dependency/);
  assert.deepEqual(prepareNativeDependencies(root, 'android'), ['example']);
  assert.deepEqual(prepareNativeDependencies(root, 'android'), []);
  assert.deepEqual(prepareNativeDependencies(root, 'ios'), ['example']);
  const calls = () => readFileSync(path.join(root, 'valdi/modules/example/calls'), 'utf8');
  assert.match(calls(), /prepare:android\ncheck:android\ncheck:android/);
  const before = calls();
  select([]);
  assert.deepEqual(inspectNativeDependencies(root, 'android'), []);
  assert.deepEqual(prepareNativeDependencies(root, 'android'), []);
  checkNativeDependencies(root, 'ios');
  assert.equal(calls(), before);
  select(['example']);
  write('valdi/modules/example/prepare.mjs', 'process.exitCode = process.argv[2] === "prepare" ? 0 : 1;');
  assert.throws(() => prepareNativeDependencies(root, 'android'), /example.*exit 1/);
  write('valdi/modules/example/prepare.mjs', 'console.error("compiler failed"); process.exitCode = 2;');
  assert.throws(() => prepareNativeDependencies(root, 'android'), /example.*exit 2/);
});

test('cpp dependency hooks run only in the runtime phase while app hooks and disabled modules stay isolated', t => {
  const { root, write, select } = fixture(t);
  for (const [name, nativeBuild] of [['host', 'host'], ['bazel', 'bazel'], ['runtime_cpp', 'cpp'], ['disabled_cpp', 'cpp']]) {
    write(`valdi/modules/${name}/src/index.ts`, 'export {};');
    write(`valdi/modules/${name}/module.json`, JSON.stringify({
      nativeBuild, nativeDependencies: { script: 'prepare.mjs', inputs: [] },
    }));
    write(`valdi/modules/${name}/prepare.mjs`, `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [action, platform] = process.argv.slice(2);
const stamp = path.join(import.meta.dirname, platform + '.stamp');
appendFileSync(path.resolve(import.meta.dirname, '../../../calls'), '${name}:' + action + ':' + platform + '\\n');
if (action === 'prepare') writeFileSync(stamp, 'ready');
else if (!existsSync(stamp)) { console.error('missing dependency'); process.exitCode = 1; }
`);
  }
  // Ignored disabled declarations must not be validated or invoked in either phase.
  write('valdi/modules/disabled_cpp/module.json', JSON.stringify({
    nativeBuild: 'cpp', androidModuleFactory: 'InvalidForCpp',
    nativeDependencies: { script: 'prepare.mjs', inputs: [] },
  }));
  select(['host', 'bazel', 'runtime_cpp']);
  const calls = () => readFileSync(path.join(root, 'calls'), 'utf8');
  for (const platform of ['android', 'ios']) {
    assert.deepEqual(inspectNativeDependencies(root, platform).map(item => item.name), ['bazel', 'host']);
    assert.deepEqual(prepareNativeDependencies(root, platform), ['bazel', 'host']);
    checkNativeDependencies(root, platform);
    assert.doesNotMatch(calls(), new RegExp(`runtime_cpp:.*:${platform}|disabled_cpp:`));
    const beforeRuntime = calls();
    assert.deepEqual(inspectNativeDependencies(root, platform, 'runtime').map(item => [item.name, item.current]), [['runtime_cpp', false]]);
    assert.throws(() => checkNativeDependencies(root, platform, 'runtime'), /runtime_cpp.*missing dependency/);
    assert.deepEqual(prepareNativeDependencies(root, platform, 'runtime'), ['runtime_cpp']);
    assert.deepEqual(prepareNativeDependencies(root, platform, 'runtime'), []);
    checkNativeDependencies(root, platform, 'runtime');
    assert.doesNotMatch(calls().slice(beforeRuntime.length), /(?:bazel|host|disabled_cpp):/);
  }
  const beforeDisabled = calls();
  select([]);
  for (const phase of ['app', 'runtime']) {
    assert.deepEqual(inspectNativeDependencies(root, 'android', phase), []);
    assert.deepEqual(prepareNativeDependencies(root, 'ios', phase), []);
    checkNativeDependencies(root, 'ios', phase);
  }
  assert.equal(calls(), beforeDisabled);
  assert.throws(() => inspectNativeDependencies(root, 'android', 'invalid'), /Expected app or runtime phase/);
  assert.throws(() => prepareNativeDependencies(root, 'invalid', 'runtime'), /Expected android or ios/);
});

test('dependency CLI selects app or runtime hooks and reports failures without running disabled hooks', t => {
  const { root, write, select } = fixture(t);
  for (const file of ['native-dependencies.mjs', 'native-modules.mjs', 'module-native-config.mjs', 'module-platform-config.mjs', 'app-config.mjs'])
    write(`scripts/${file}`, readFileSync(path.join(repository, 'scripts', file), 'utf8'));
  write('tools/valdi-rolldown/modules.mjs', readFileSync(path.join(repository, 'tools/valdi-rolldown/modules.mjs'), 'utf8'));
  for (const [name, nativeBuild] of [['app', 'host'], ['runtime_cpp', 'cpp'], ['disabled_cpp', 'cpp']]) {
    write(`valdi/modules/${name}/src/index.ts`, 'export {};');
    write(`valdi/modules/${name}/module.json`, JSON.stringify({
      nativeBuild, nativeDependencies: { script: 'prepare.mjs', inputs: [] },
    }));
    write(`valdi/modules/${name}/prepare.mjs`, `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const stamp = path.join(import.meta.dirname, process.argv[3] + '.stamp');
appendFileSync(path.resolve(import.meta.dirname, '../../../calls'), '${name}:' + process.argv[2] + '\\n');
if (process.argv[2] === 'prepare') writeFileSync(stamp, 'ready');
else if (!existsSync(stamp)) { console.error('missing dependency'); process.exitCode = 1; }
`);
  }
  select(['app', 'runtime_cpp']);
  const calls = () => readFileSync(path.join(root, 'calls'), 'utf8');
  const run = (action, platform) => spawnSync(process.execPath, [path.join(root, 'scripts/native-dependencies.mjs'), action, platform],
    { encoding: 'utf8', timeout: 10_000 });
  for (const platform of ['android', 'ios']) {
    const failed = run('check-runtime', platform);
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stderr, /runtime_cpp.*missing dependency/);
    const beforeApp = calls();
    const app = run('prepare', platform);
    assert.equal(app.status, 0, app.stderr);
    assert.equal(run('check', platform).status, 0);
    assert.doesNotMatch(calls().slice(beforeApp.length), /runtime_cpp|disabled_cpp/);
    const beforeRuntime = calls();
    const runtime = run('prepare-runtime', platform);
    assert.equal(runtime.status, 0, runtime.stderr);
    assert.equal(run('check-runtime', platform).status, 0);
    assert.equal(run('prepare-runtime', platform).stdout, '');
    assert.doesNotMatch(calls().slice(beforeRuntime.length), /app:|disabled_cpp:/);
  }
  const beforeDisabled = calls();
  select([]);
  assert.equal(run('prepare-runtime', 'android').status, 0);
  assert.equal(calls(), beforeDisabled);
});

test('the real Vision module is runtime-owned with dependency inputs and no app native contributions', t => {
  const { root, write, select } = fixture(t);
  cpSync(path.join(repository, 'valdi/modules/app_vision'), path.join(root, 'valdi/modules/app_vision'), { recursive: true });
  select(['app_vision']);
  assert.equal(nativeModules(root)[0].nativeBuild, 'cpp');
  // Stale platform directories must not contribute app sources, manifests or headers.
  write('valdi/modules/app_vision/ios/OldHost.h', '// stale host header\n');
  write('valdi/modules/app_vision/android/AndroidManifest.xml',
    '<manifest><application><activity android:name="OldVisionHost" /></application></manifest>');
  write('android/app/src/main/AndroidManifest.xml', '<manifest><application /></manifest>');
  syncNativeModuleRegistration(root);
  const overlay = () => JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8')).targets.SampleApp;
  assert.deepEqual(overlay().sources, []);
  assert.deepEqual(overlay().dependencies, []);
  assert.equal(overlay().settings, undefined);
  assert.equal(nativeModuleCmake(root).trim(), '');
  for (const file of ['ios/Generated/valdi/ValdiNativeModules.m', 'ios/Generated/valdi/ValdiModuleImports.h',
    'android/app/generated/valdi/ValdiNativeModules.kt', 'android/app/build/generated/valdi-module-manifest/AndroidManifest.xml'])
    assert.doesNotMatch(readFileSync(path.join(root, file), 'utf8'), /Vision|app_vision/);
  for (const platform of ['android', 'ios']) {
    const inputs = nativeModuleInputs(platform, root);
    assert.ok(inputs.includes('vision/vendor-lock.json'));
    assert.ok(inputs.includes('vision/cpp'));
    assert.ok(inputs.includes('valdi/modules/app_vision/cpp'));
    assert.ok(inputs.includes('valdi/modules/app_vision/scripts/native-dependencies.mjs'));
    assert.ok(!inputs.some(value => value.includes('/vendor/install') || /app_vision\/(?:android|ios)/.test(value)));
    // Even check hooks would fail here without vendor inputs; app builds must not invoke them.
    assert.deepEqual(inspectNativeDependencies(root, platform), []);
    assert.deepEqual(prepareNativeDependencies(root, platform), []);
    checkNativeDependencies(root, platform);
  }
  select([]);
  syncNativeModuleRegistration(root);
  assert.equal(nativeModuleCmake(root).trim(), '');
  assert.deepEqual(nativeModuleInputs('android', root), []);
  assert.deepEqual(overlay().sources, []);
  assert.deepEqual(overlay().dependencies, []);
  assert.equal(overlay().settings, undefined);
  for (const file of ['ios/Generated/valdi/ValdiNativeModules.m', 'ios/Generated/valdi/ValdiModuleImports.h',
    'android/app/generated/valdi/ValdiNativeModules.kt'])
    assert.doesNotMatch(readFileSync(path.join(root, file), 'utf8'), /Vision|app_vision/);

  // Configure the actual host CMake graph without any Vision vendor files.
  // Keep cpp enabled with a hook that fails on every invocation. Host CMake must skip it.
  write('valdi/modules/app_vision/scripts/native-dependencies.mjs', 'throw new Error("app build invoked runtime dependency hook");\n');
  select(['app_vision']);
  cpSync(path.join(repository, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  write('tools/valdi-rolldown/modules.mjs', readFileSync(path.join(repository, 'tools/valdi-rolldown/modules.mjs'), 'utf8'));
  write('android/app/src/main/cpp/CMakeLists.txt',
    readFileSync(path.join(repository, 'android/app/src/main/cpp/CMakeLists.txt'), 'utf8') + '\nadd_custom_target(selection_check)\n');
  const configured = spawnSync('cmake', ['-G', 'Ninja', '-S', path.join(root, 'android/app/src/main/cpp'), '-B', path.join(root, 'build')], { encoding: 'utf8' });
  assert.equal(configured.status, 0, configured.stdout + configured.stderr);
  const targets = spawnSync('cmake', ['--build', path.join(root, 'build'), '--target', 'help'], { encoding: 'utf8' });
  assert.equal(targets.status, 0, targets.stderr);
  assert.doesNotMatch(targets.stdout, /valdi_ota_patch/);
  assert.doesNotMatch(targets.stdout, /valdi_routes_vision|opencv|ncnn/);
  assert.equal(existsSync(path.join(root, 'vision/vendor')), false);

  // Exercise selection changes in the same CMake cache, without an explicit
  // reconfigure. The host's configure dependencies must update the native graph.
  write('valdi/modules/probe/src/index.ts', 'export {};');
  write('valdi/modules/probe/module.json', JSON.stringify({
    nativeBuild: 'host', androidCmake: 'android/cpp',
    nativeDependencies: { script: 'dependencies.mjs', inputs: [] },
  }));
  write('valdi/modules/probe/dependencies.mjs', `
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const stamp = path.join(import.meta.dirname, 'prepared');
if (process.argv[2] === 'prepare') writeFileSync(stamp, 'module dependency ready');
else if (!existsSync(stamp)) process.exitCode = 1;
`);
  write('valdi/modules/probe/android/cpp/Module.cpp', 'int moduleDependencyValue() { return 42; }\n');
  write('valdi/modules/probe/android/cpp/CMakeLists.txt', `
if(NOT EXISTS "\${CMAKE_CURRENT_SOURCE_DIR}/../../prepared")
  message(FATAL_ERROR "module dependency must be prepared by the native build")
endif()
add_library(selected_module_probe STATIC Module.cpp)
`);
  select(['app_vision', 'probe']);
  const refresh = () => {
    const result = spawnSync('cmake', ['--build', path.join(root, 'build'), '--target', 'selection_check'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const graph = spawnSync('cmake', ['--build', path.join(root, 'build'), '--target', 'help'], { encoding: 'utf8' });
    assert.equal(graph.status, 0, graph.stderr);
    return graph.stdout;
  };
  assert.match(refresh(), /selected_module_probe/);
  assert.equal(readFileSync(path.join(root, 'valdi/modules/probe/prepared'), 'utf8'), 'module dependency ready');
  const compiled = spawnSync('cmake', ['--build', path.join(root, 'build'), '--target', 'selected_module_probe'], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  select(['app_vision']);
  assert.doesNotMatch(refresh(), /selected_module_probe/);
  assert.doesNotMatch(refresh(), /valdi_ota_patch/);

  // The real OTA codec joins/leaves the same cached graph with its module.
  cpSync(path.join(repository, 'valdi/modules/app_ota'), path.join(root, 'valdi/modules/app_ota'), { recursive: true });
  select(['app_vision', 'app_ota']);
  syncNativeModuleRegistration(root);
  assert.match(refresh(), /valdi_ota_patch/);
  assert.match(readFileSync(path.join(root, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8'),
    /io\.valdiroutes\.app\.OtaModuleFactory\(\)/);
  assert.match(readFileSync(path.join(root, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8'),
    /NSClassFromString\(@"VROtaModuleFactory"\)/);
  const iosOverlay = JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8'));
  assert.deepEqual(iosOverlay.include, ['../../valdi/modules/app_ota/ios/project.yml']);
  const otaSources = iosOverlay.targets.SampleApp.sources.find(source => source.group === 'Modules/app_ota');
  assert.deepEqual(otaSources.excludes, ['project.yml']);
  assert.ok(nativeModuleInputs('ios', root).includes('valdi/modules/app_ota/native'));
  assert.ok(nativeModuleInputs('ios', root).includes('valdi/modules/app_ota/ios/project.yml'));
  select(['app_vision']);
  syncNativeModuleRegistration(root);
  assert.doesNotMatch(refresh(), /valdi_ota_patch/);
  assert.equal(JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8')).include, undefined);
  assert.doesNotMatch(readFileSync(path.join(root, 'ios/Generated/valdi/ValdiModuleImports.h'), 'utf8'), /app_ota/);
});

test('explicit runtime exports prepare cpp dependencies after source setup and before codegen/export', () => {
  for (const platform of ['android', 'ios']) {
    const source = readFileSync(path.join(repository, `scripts/export-${platform}.sh`), 'utf8');
    const prepare = source.indexOf(`node "$root/scripts/native-dependencies.mjs" prepare-runtime ${platform}`);
    assert.ok(prepare >= 0, `${platform} export must prepare runtime dependencies`);
    assert.ok(prepare > source.indexOf('node "$root/scripts/prepare-valdi.mjs"'));
    assert.ok(prepare < source.indexOf('pnpm exec tsx codegen.ts'));
  }
});

test('cpp modules reject app registration and platform contributions before dependency hooks run', t => {
  const { write, select, root } = fixture(t);
  select(['example']);
  write('valdi/modules/example/src/index.ts', 'export {};');
  const config = { nativeBuild: 'cpp', nativeDependencies: { script: 'prepare.mjs', inputs: [] } };
  write('valdi/modules/example/prepare.mjs', 'throw new Error("invalid cpp config executed hook");\n');
  for (const field of [
    'androidModuleFactory', 'androidModuleFactoryContext', 'androidViewBinder', 'androidDependencies',
    'androidPlatforms', 'androidPermissions', 'androidFeatures', 'androidCmake', 'iosProjectSpec',
    'iosModuleFactory', 'iosModuleFactoryClass', 'iosFrameworks', 'iosPackages',
    'iosInfoPlist', 'iosEntitlements', 'iosBackgroundModes', 'iosNativeSources', 'iosNativeFrameworks', 'iosBuildSettings',
  ]) {
    write('valdi/modules/example/module.json', JSON.stringify({ ...config, [field]: [] }));
    assert.throws(() => nativeModules(root), new RegExp(`nativeBuild cpp.*${field}`));
    assert.throws(() => prepareNativeDependencies(root, 'android'), new RegExp(`nativeBuild cpp.*${field}`));
    assert.throws(() => prepareNativeDependencies(root, 'ios', 'runtime'), new RegExp(`nativeBuild cpp.*${field}`));
  }
});

test('invalid native contributions fail before executing dependency hooks', t => {
  const { root, write, select } = fixture(t);
  write('valdi/modules/example/src/index.ts', 'export {};');
  select(['example']);
  for (const patch of [
    { nativeDependencies: { script: '../../../../outside.mjs', inputs: [] } },
    { nativeDependencies: { script: '/host/prepare.mjs', inputs: [] } },
    { nativeDependencies: { script: 'prepare.mjs', inputs: 'lock.json' } },
    { androidCmake: 'a"; execute_process()' },
    { iosProjectSpec: '/tmp/host-project.yml' },
    { iosNativeSources: '../outside' },
    { iosBuildSettings: { HEADER_SEARCH_PATHS: { invalid: true } } },
  ]) {
    write('valdi/modules/example/module.json', JSON.stringify({ nativeBuild: 'host', ...patch }));
    assert.throws(() => nativeModules(root), /invalid|inside the repository/);
  }
});
