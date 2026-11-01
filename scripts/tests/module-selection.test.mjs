import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { availableModuleNames, enabledModuleNames, pruneDisabledModuleOutputs } from '../../tools/valdi-rolldown/modules.mjs';
import { nativeModuleInputs, nativeModules, syncNativeModuleRegistration } from '../native-modules.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-selection-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  const select = modules => write('package.json', JSON.stringify({ valdi: { modules } }));
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
