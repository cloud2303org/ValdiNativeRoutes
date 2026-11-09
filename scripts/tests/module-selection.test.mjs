import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { availableModuleNames, enabledModuleNames, pruneDisabledModuleOutputs } from '../../tools/valdi-rolldown/modules.mjs';
import { moduleAssetDirectories, nativeModuleInputs, nativeModules, syncNativeModuleRegistration } from '../native-modules.mjs';
import { sampleApp } from './fixtures/app-config.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-selection-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  const select = modules => write('package.json', JSON.stringify({ valdi: { app: sampleApp(), modules } }));
  for (const name of ['app_pages', 'bluetooth', 'calculator']) write(`valdi/modules/${name}/src/index.ts`, 'export {};');
  write('valdi/modules/calculator/module.json', JSON.stringify({ nativeBuild: 'bazel', androidModuleFactory: 'CalculatorFactory', iosModuleFactory: 'CalculatorFactory' }));
  write('valdi/modules/bluetooth/module.json', JSON.stringify({
    nativeBuild: 'bazel', androidModuleFactory: 'BluetoothFactory', iosModuleFactoryClass: 'BluetoothFactory',
    androidDependencies: ['com.example:bluetooth:1.0'],
    androidPermissions: [{ name: 'android.permission.BLUETOOTH_CONNECT' }],
    androidFeatures: [{ name: 'android.hardware.bluetooth_le', required: false }],
    iosInfoPlist: { NSBluetoothAlwaysUsageDescription: 'Use Bluetooth & devices' },
  }));
  write('android/app/src/main/AndroidManifest.xml', '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>');
  write('ios/ValdiRoutes/Info.plist', '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleName</key><string>Demo</string></dict></plist>');
  return { root, write, select };
}

test('App selection excludes native registration, dependencies, compatibility inputs and platform permissions', t => {
  const { root, select } = fixture(t);
  select(['app_pages', 'calculator', 'bluetooth']);
  syncNativeModuleRegistration(root);
  assert.match(readFileSync(path.join(root, 'android/app/build/generated/valdi-module-manifest/AndroidManifest.xml'), 'utf8'), /BLUETOOTH_CONNECT/);
  assert.match(readFileSync(path.join(root, 'ios/Generated/AppInfo.plist'), 'utf8'), /Use Bluetooth &amp; devices/);
  select(['app_pages', 'calculator']);
  assert.deepEqual(availableModuleNames(root), ['app_pages', 'bluetooth', 'calculator']);
  assert.deepEqual(enabledModuleNames(root), ['app_pages', 'calculator']);
  assert.deepEqual(nativeModules(root).map(module => module.name), ['calculator']);
  assert.ok(!nativeModuleInputs('android', root).some(file => file.includes('/bluetooth/')));
  syncNativeModuleRegistration(root);
  for (const file of [
    'android/app/generated/valdi/ValdiNativeModules.kt', 'ios/Generated/valdi/ValdiNativeModules.m',
    'android/app/build/generated/valdi-module-manifest/AndroidManifest.xml', 'ios/Generated/AppInfo.plist',
  ]) assert.doesNotMatch(readFileSync(path.join(root, file), 'utf8'), /Bluetooth|BLUETOOTH|bluetooth/);
  assert.ok(!nativeModules(root).flatMap(module => module.androidDependencies ?? []).length);
  select([]);
  syncNativeModuleRegistration(root);
  assert.deepEqual(nativeModules(root), []);
});

test('missing, duplicate, unknown and unsafe module selections fail rather than silently enabling modules', t => {
  const { root, select, write } = fixture(t);
  assert.throws(() => enabledModuleNames(root), /Declare enabled/);
  for (const names of [['calculator', 'calculator'], ['unknown'], ['../bluetooth'], 'calculator']) {
    select(names);
    assert.throws(() => enabledModuleNames(root));
  }
  select(['calculator']);
  write('valdi/modules/calculator/BUILD.bazel', 'deps = ["//modules/bluetooth:bluetooth_compiled"]');
  assert.throws(() => enabledModuleNames(root), /references disabled module "bluetooth"/);
  write('valdi/modules/calculator/BUILD.bazel', '# "//modules/bluetooth:bluetooth_compiled"\ndeps = ["@valdi//modules/runtime:runtime"]');
  assert.deepEqual(enabledModuleNames(root), ['calculator']);
});

test('video background audio capability follows module selection and rejects unsupported modes', t => {
  const { root, select, write } = fixture(t);
  const config = modes => write('valdi/modules/calculator/module.json', JSON.stringify({
    nativeBuild: 'host', iosBackgroundModes: modes,
  }));
  config(['audio', 'audio']);
  select(['calculator']);
  syncNativeModuleRegistration(root);
  const info = () => readFileSync(path.join(root, 'ios/Generated/AppInfo.plist'), 'utf8');
  assert.match(info(), /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>\s*<\/array>/);
  select([]);
  syncNativeModuleRegistration(root);
  assert.doesNotMatch(info(), /UIBackgroundModes/);
  select(['calculator']);
  for (const modes of ['audio', [true], ['location'], ['<audio>']]) {
    config(modes);
    assert.throws(() => nativeModules(root), /invalid iosBackgroundModes/);
  }
});

test('host media assets participate in native compatibility and selected iOS resources', t => {
  const { root, select, write } = fixture(t);
  write('valdi/modules/calculator/module.json', JSON.stringify({ nativeBuild: 'host' }));
  write('valdi/modules/calculator/ios/Player.m', '// player');
  write('valdi/modules/calculator/assets/clip.mp4', 'media');
  select(['calculator']);
  syncNativeModuleRegistration(root);
  assert.ok(nativeModuleInputs('android', root).includes('valdi/modules/calculator/assets'));
  assert.ok(nativeModuleInputs('ios', root).includes('valdi/modules/calculator/assets'));
  const sources = () => JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8')).targets.SampleApp.sources;
  assert.ok(sources().some(source => source.path.endsWith('/calculator/assets') && source.buildPhase === 'resources'));
  select([]);
  syncNativeModuleRegistration(root);
  assert.deepEqual(sources(), []);
  assert.ok(!nativeModuleInputs('ios', root).some(file => file.includes('/calculator/')));
});

test('TS-only business assets are packaged without a native module declaration and leave with selection', t => {
  const { root, select, write } = fixture(t);
  write('valdi/modules/app_pages/assets/flower.mp4', 'business media');
  write('valdi/modules/calculator/assets/disabled.mp4', 'disabled media');
  select(['app_pages']);
  assert.deepEqual(nativeModules(root), []);
  assert.deepEqual(moduleAssetDirectories(root), ['valdi/modules/app_pages/assets']);
  syncNativeModuleRegistration(root);
  const sources = () => JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8')).targets.SampleApp.sources;
  assert.deepEqual(sources(), [{
    path: '../../valdi/modules/app_pages/assets', group: 'Modules/app_pages', buildPhase: 'resources',
  }]);
  assert.ok(nativeModuleInputs('android', root).includes('valdi/modules/app_pages/assets'));
  select([]);
  syncNativeModuleRegistration(root);
  assert.deepEqual(moduleAssetDirectories(root), []);
  assert.deepEqual(sources(), []);
});

test('disabling a module removes previously staged archives, maps, native libraries and resource bundles only for that module', t => {
  const { root, write } = fixture(t);
  for (const file of ['bluetooth.valdimodule', 'bluetooth.map.json', 'bluetooth.bundle/icon.png', 'bluetooth/libbluetooth_ios.a', 'calculator.valdimodule', 'valdi_core.valdimodule']) {
    write(`out/${file}`, 'stale');
  }
  pruneDisabledModuleOutputs(path.join(root, 'out'), ['bluetooth', 'calculator'], ['calculator']);
  assert.deepEqual(['bluetooth.valdimodule', 'bluetooth.map.json', 'bluetooth.bundle', 'bluetooth'].map(file => existsSync(path.join(root, 'out', file))), [false, false, false, false]);
  assert.ok(existsSync(path.join(root, 'out/calculator.valdimodule')));
  assert.ok(existsSync(path.join(root, 'out/valdi_core.valdimodule')));
});

test('host-built modules contribute selected sources, Swift packages, entitlements and factories only while enabled', t => {
  const { root, select, write } = fixture(t);
  write('valdi/modules/mmkv/src/index.ts', 'export {};');
  write('valdi/modules/mmkv/ios/Module.swift', '// Native implementation');
  write('valdi/modules/mmkv/module.json', JSON.stringify({
    nativeBuild: 'host', iosModuleName: 'MMKVStorage',
    androidModuleFactory: 'com.example.StorageFactory', androidModuleFactoryContext: true,
    iosModuleFactoryClass: 'VRStorageFactory',
    androidDependencies: ['com.tencent:mmkv:2.4.3'],
    iosPackages: [{ name: 'MMKV', url: 'https://github.com/Tencent/MMKV.git', revision: '007a393cd5e255e9aa68d6648f7179159bdf0f9d' }],
    iosEntitlements: { 'com.apple.developer.networking.wifi-info': true },
    iosFrameworks: ['NetworkExtension'],
  }));
  select(['mmkv']);
  const selected = syncNativeModuleRegistration(root);
  assert.equal(selected[0].nativeBuild, 'host');
  const kotlin = readFileSync(path.join(root, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8');
  assert.match(kotlin, /val factory\w* = com\.example\.StorageFactory\(context\.applicationContext\)/);
  assert.match(kotlin, /registerModuleFactory \{ factory\w* \}/);
  const project = readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8');
  assert.match(project, /Tencent\/MMKV\.git/);
  assert.match(project, /007a393cd5e255e9aa68d6648f7179159bdf0f9d/);
  assert.match(project, /valdi\/modules\/mmkv\/ios/);
  assert.match(project, /NetworkExtension\.framework/);
  assert.match(readFileSync(path.join(root, 'ios/Generated/AppEntitlements.entitlements'), 'utf8'), /wifi-info/);
  assert.match(readFileSync(path.join(root, 'ios/Generated/valdi/ValdiModuleImports.h'), 'utf8'), /MMKVStorage\/MMKVStorage\.h/);
  select([]);
  syncNativeModuleRegistration(root);
  for (const file of ['ios/Generated/Modules.yml', 'ios/Generated/AppEntitlements.entitlements',
    'ios/Generated/valdi/ValdiModuleImports.h', 'android/app/generated/valdi/ValdiNativeModules.kt']) {
    assert.doesNotMatch(readFileSync(path.join(root, file), 'utf8'), /MMKV|mmkv|StorageFactory|wifi-info|NetworkExtension/);
  }
});

test('module-owned iOS dependency metadata rejects unsafe, conflicting and ambiguous contributions', t => {
  const { root, select, write } = fixture(t);
  select(['calculator', 'bluetooth']);
  const config = patch => write('valdi/modules/calculator/module.json', JSON.stringify({ nativeBuild: 'host', ...patch }));
  for (const patch of [
    { iosPackages: [{ name: 'MMKV', url: 'https://github.com/Tencent/MMKV.git', revision: 'main' }] },
    { iosPackages: [{ name: 'MMKV', url: 'https://github.com/Tencent/MMKV.git', revision: 'a'.repeat(40), from: '2.4.3' }] },
    { iosPackages: [{ name: 'bad/path', url: 'https://github.com/example/a.git', revision: 'a'.repeat(40) }] },
    { iosFrameworks: ['../WebKit'] },
    { iosEntitlements: { 'unrestricted-setting': true } },
  ]) {
    config(patch);
    assert.throws(() => nativeModules(root), /invalid ios/);
  }
  config({ iosInfoPlist: { NSBluetoothAlwaysUsageDescription: 'Conflicting description' } });
  assert.throws(() => syncNativeModuleRegistration(root), /Conflicting iosInfoPlist/);
});

test('the five real services select their own native sources and platform dependencies without app_pages', t => {
  const { root, select, write } = fixture(t);
  const repository = path.resolve(import.meta.dirname, '../..');
  const services = ['mmkv', 'permissions', 'wifi', 'nfc', 'app_ui'];
  const names = [...services, 'native_common', 'theme_bridge'];
  for (const name of names) cpSync(path.join(repository, 'valdi/modules', name),
    path.join(root, 'valdi/modules', name), { recursive: true });
  select(['app_ui', 'native_common']);
  assert.throws(() => enabledModuleNames(root), /app_ui.*disabled module "theme_bridge"/);
  for (const service of services) {
    const dependencies = ['native_common', ...(['wifi', 'nfc'].includes(service) ? ['permissions'] : []),
      ...(service === 'app_ui' ? ['theme_bridge'] : [])];
    select([service, ...dependencies]);
    const selected = syncNativeModuleRegistration(root);
    assert.deepEqual(selected.map(module => module.name), [service, ...dependencies.filter(name => name !== 'native_common')].sort());
    const manifest = readFileSync(path.join(root, 'android/app/build/generated/valdi-module-manifest/AndroidManifest.xml'), 'utf8');
    const project = JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8'));
    assert.equal(!!project.packages.MMKV, service === 'mmkv');
    assert.equal(manifest.includes('AttachmentFileProvider'), service === 'app_ui');
    assert.equal(manifest.includes('android.permission.CAMERA'), service === 'app_ui');
    assert.equal(manifest.includes('android.permission.NFC'), service === 'nfc');
    assert.equal(manifest.includes('android.permission.CHANGE_WIFI_STATE'), service === 'wifi');
    if (service === 'wifi') assert.match(manifest, /xmlns:tools="http:\/\/schemas.android.com\/tools"/);
    const entitlements = readFileSync(path.join(root, 'ios/Generated/AppEntitlements.entitlements'), 'utf8');
    assert.equal(entitlements.includes('wifi-info'), service === 'wifi');
    const actualSources = project.targets.SampleApp.sources.map(source => source.path);
    for (const name of ['mmkv', 'permissions', 'wifi', 'nfc', 'app_ui'])
      assert.equal(actualSources.includes(`../../valdi/modules/${name}/ios`), name === service || dependencies.includes(name));
  }
  select([]);
  syncNativeModuleRegistration(root);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8')).targets.SampleApp.sources, []);
  write('valdi/modules/consumer/src/index.ts', 'export {};');
  write('valdi/modules/consumer/BUILD.bazel', 'deps = ["//modules/mmkv:mmkv_compiled"]');
  select(['consumer']);
  assert.throws(() => enabledModuleNames(root), /references disabled module "mmkv"/);
});
