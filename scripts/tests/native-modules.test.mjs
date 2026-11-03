import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { nativeModuleInputs, nativeModules, syncNativeModuleRegistration } from '../native-modules.mjs';

test('native modules are discovered, registered and included in platform compatibility inputs', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-native-modules-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'valdi/modules/hello/module.json');
  mkdirSync(path.dirname(config), { recursive: true });
  mkdirSync(path.join(path.dirname(config), 'src'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ valdi: { modules: ['hello'] } }));
  writeFileSync(config, JSON.stringify({
    nativeBuild: 'bazel', name: 'unrelated',
    androidModuleFactory: 'com.example.Factory', androidViewBinder: 'com.example.Binder',
    androidModuleFactoryContext: true,
    androidDependencies: ['com.example:native:1.2.3'],
    iosModuleFactory: 'HelloCreateModuleFactory',
  }));
  assert.equal(nativeModules(root)[0].name, 'hello');
  syncNativeModuleRegistration(root);
  assert.match(readFileSync(path.join(root, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8'), /com.example.Binder\(context\)/);
  assert.match(readFileSync(path.join(root, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8'), /com.example.Factory\(context.applicationContext\)/);
  assert.match(readFileSync(path.join(root, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8'), /HelloCreateModuleFactory\(\)/);
  const inputs = nativeModuleInputs('android', root);
  assert.ok(inputs.includes('valdi/modules/hello/android'));
  assert.ok(inputs.includes('valdi/modules/hello/BUILD.bazel'));
  assert.ok(!inputs.some(input => input.endsWith('/src') || input.endsWith('/ios')));
  writeFileSync(config, JSON.stringify({ nativeBuild: 'bazel', iosModuleFactoryClass: 'VRHelloSwiftFactory' }));
  syncNativeModuleRegistration(root);
  assert.match(readFileSync(path.join(root, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8'), /NSClassFromString\(@"VRHelloSwiftFactory"\)/);
  writeFileSync(config, JSON.stringify({ nativeBuild: 'bazel', iosModuleFactoryClass: 'SwiftFactory', iosModuleFactory: 'ObjCFactory' }));
  assert.throws(() => syncNativeModuleRegistration(root), /choose one/);
  writeFileSync(config, JSON.stringify({ nativeBuild: 'bazel', androidModuleFactory: 'invalid()' }));
  assert.throws(() => syncNativeModuleRegistration(root), /invalid androidModuleFactory/);
  writeFileSync(config, JSON.stringify({ nativeBuild: 'bazel', androidModuleFactoryContext: true }));
  assert.throws(() => syncNativeModuleRegistration(root), /requires androidModuleFactory/);
  writeFileSync(config, JSON.stringify({ nativeBuild: 'bazel', androidDependencies: ['not-a-coordinate'] }));
  assert.throws(() => syncNativeModuleRegistration(root), /invalid androidDependencies/);
});
