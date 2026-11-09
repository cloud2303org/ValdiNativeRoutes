import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { nativeModuleInputs, nativeModules, syncNativeModuleRegistration } from '../native-modules.mjs';
import { sampleApp } from './fixtures/app-config.mjs';
import { stagedModuleOutputs } from '../node-modules.mjs';

test('native module tooling can be imported from a stdin script without executing its CLI', () => {
  const moduleUrl = new URL('../native-modules.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    input: `import { nativeModules } from ${JSON.stringify(moduleUrl)};\nconsole.log(typeof nativeModules);\n`,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'function');
});

test('native modules are discovered, registered and included in platform compatibility inputs', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-native-modules-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'valdi/modules/hello/module.json');
  mkdirSync(path.dirname(config), { recursive: true });
  mkdirSync(path.join(path.dirname(config), 'src'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ valdi: { app: sampleApp(), modules: ['hello'] } }));
  writeFileSync(config, JSON.stringify({
    nativeBuild: 'bazel', name: 'unrelated',
    androidModuleFactory: 'com.example.Factory', androidViewBinder: 'com.example.Binder',
    androidClassPath: 'com.example.webview',
    androidModuleFactoryContext: true,
    androidDependencies: ['com.example:native:1.2.3'],
    iosModuleFactory: 'HelloCreateModuleFactory',
  }));
  assert.equal(nativeModules(root)[0].name, 'hello');
  assert.equal(nativeModules(root)[0].androidClassPath, 'com.example.webview');
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
  writeFileSync(config, JSON.stringify({ nativeBuild: 'bazel', androidClassPath: 'invalid/package' }));
  assert.throws(() => syncNativeModuleRegistration(root), /invalid androidClassPath/);
});

test('native packaging reuses products from the selected platform and build mode without rebuilding modules', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-staged-modules-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  };
  const select = modules => write('package.json', JSON.stringify({ valdi: { modules } }));
  write('valdi/modules/example/src/index.ts', 'export {};');
  write('valdi/modules/example/module.json', JSON.stringify({ nativeBuild: 'bazel' }));
  select(['example']);
  assert.throws(() => stagedModuleOutputs('android', false, root), /build the native module task/);
  write('module-build/out/android/example/bundle-debug/example.valdimodule', 'debug bundle');
  const android = stagedModuleOutputs('android', false, root);
  assert.equal(readFileSync(path.join(android.get('example'), 'example.valdimodule'), 'utf8'), 'debug bundle');
  assert.throws(() => stagedModuleOutputs('ios', false, root), /Missing ios/);
  assert.throws(() => stagedModuleOutputs('android', true, root), /Missing android/);
  write('module-build/out/android/example/bundle-release/example.valdimodule', 'release bundle');
  assert.throws(() => stagedModuleOutputs('android', true, root), /build the native module task/);
  write('module-build/out/android/example/bundle-release/example.map.json', '{}');
  assert.ok(stagedModuleOutputs('android', true, root).get('example').endsWith('bundle-release'));
  select([]);
  assert.equal(stagedModuleOutputs('android', false, root).size, 0);
});
