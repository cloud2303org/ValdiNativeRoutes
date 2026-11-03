import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { nativeModules, syncNativeModuleRegistration } from '../../scripts/native-modules.mjs';
import { unpack } from './archive';
import { compileNodeModule } from './module-build';
import { root, valdiSourceRoot } from './pipeline';
import { createModule, MODULE_TEMPLATES } from './scaffold';

test('every official module template compiles with the Node backend and preserves platform sources', async t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-scaffold-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const sources = valdiSourceRoot();
  assert.ok(sources, 'Prepare the pinned Valdi sources before testing templates');
  for (const template of MODULE_TEMPLATES) {
    const created = createModule({ root: fixture, sources, name: `sample_${template}`, template });
    const config = JSON.parse(readFileSync(path.join(created.directory, 'module.json'), 'utf8'));
    const out = path.join(fixture, 'out', created.name);
    await compileNodeModule({
      name: created.name, dir: created.directory, generatedDirs: [],
      nodeModules: path.join(root, 'valdi/node_modules'),
    }, out, config.iosModuleName, 'debug');
    const archive = unpack(readFileSync(path.join(out, `${created.name}.valdimodule`)));
    assert.ok(archive.has('hash'));
    if (template === 'polyglot_bridge_module') {
      assert.equal(archive.size, 1, 'native API declarations must not be emitted as a JS implementation');
      assert.match(readFileSync(path.join(out, 'android', `${created.name}.kt`), 'utf8'), /interface CalculatorModule/);
      assert.match(readFileSync(path.join(out, 'ios', `${config.iosModuleName}Types`, `${config.iosModuleName}Types.h`), 'utf8'), /multiplyWithLeft:/);
      assert.ok(existsSync(path.join(created.directory, 'web/Calculator.ts')));
    } else {
      assert.ok([...archive.keys()].some(name => name.endsWith('.js')));
    }
    if (template === 'polyglot_view_module') {
      assert.ok(existsSync(path.join(created.directory, 'macos', `SC${config.iosModuleName}NativeView.m`)));
      assert.ok(existsSync(path.join(created.directory, 'web/PolyglotWeb.ts')));
    }
    if (template !== 'ui_component') {
      const build = readFileSync(path.join(created.directory, 'BUILD.bazel'), 'utf8');
      assert.match(build, /node_valdi_module/);
      assert.doesNotMatch(build, /"valdi_module"/);
    }
    const release = path.join(fixture, 'release', created.name);
    await compileNodeModule({
      name: created.name, dir: created.directory, generatedDirs: [],
      nodeModules: path.join(root, 'valdi/node_modules'),
    }, release, config.iosModuleName, 'release');
    const releaseEntries = unpack(readFileSync(path.join(release, `${created.name}.valdimodule`)));
    for (const [file, bytes] of releaseEntries) {
      if (file.endsWith('.js')) assert.equal(bytes.readUInt32LE(0), 0x0100c634, file);
    }
    assert.throws(() => createModule({ root: fixture, sources, name: created.name, template }), /already exists/);
  }
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ valdi: { modules: MODULE_TEMPLATES.map(template => `sample_${template}`) } }));
  const modules = syncNativeModuleRegistration(fixture);
  assert.equal(modules.length, 2);
  assert.deepEqual(nativeModules(fixture), modules);
  const kotlin = readFileSync(path.join(fixture, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8');
  assert.match(kotlin, /CalculatorModuleFactoryImpl\(\)/);
  assert.match(kotlin, /PolyglotNativeViewAttributesBinder\(context\)/);
  const objc = readFileSync(path.join(fixture, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8');
  assert.match(objc, /registerNativeModuleFactory:SamplePolyglotBridgeModuleCreateModuleFactory\(\)/);
});

test('two native view templates have distinct Objective-C symbols and bad paths write nothing', t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-scaffold-names-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const sources = valdiSourceRoot()!;
  const one = createModule({ root: fixture, sources, name: 'first-view', template: 'polyglot_view_module' });
  const two = createModule({ root: fixture, sources, name: 'SecondView', template: 'polyglot_view_module' });
  assert.equal(one.name, 'first_view');
  assert.equal(two.name, 'second_view');
  assert.match(readFileSync(path.join(one.directory, 'ios/SCFirstViewNativeView.m'), 'utf8'), /@implementation SCFirstViewNativeView/);
  assert.match(readFileSync(path.join(two.directory, 'ios/SCSecondViewNativeView.m'), 'utf8'), /@implementation SCSecondViewNativeView/);
  assert.throws(() => createModule({ root: fixture, sources, name: '../escape', template: 'ui_component' }), /Module names/);
  assert.throws(() => createModule({ root: fixture, sources, name: 'first__view', template: 'polyglot_view_module' }), /already used/);
  assert.throws(() => createModule({ root: fixture, sources, name: 'class', template: 'polyglot_bridge_module' }), /reserved/);
  assert.throws(() => createModule({ root: fixture, sources, name: 'drawing', template: 'ui_component' }), /runtime module/);
  assert.throws(() => createModule({ root: fixture, sources, name: 'context_view', template: 'polyglot_view_module', androidContext: true }), /requires polyglot_bridge_module/);
});

test('Swift bridge and SwiftUI templates generate independent native libraries and registration', async t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-swift-scaffold-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const sources = valdiSourceRoot()!;
  for (const [name, template] of [
    ['swift_math', 'polyglot_bridge_module'],
    ['swift_counter', 'polyglot_view_module'],
  ] as const) {
    const created = createModule({ root: fixture, sources, name, template, iosLanguage: 'swift', swiftUI: template === 'polyglot_view_module', androidContext: template === 'polyglot_bridge_module' });
    const config = JSON.parse(readFileSync(path.join(created.directory, 'module.json'), 'utf8'));
    assert.equal(config.iosLanguage, 'swift');
    const output = path.join(fixture, 'out', name);
    await compileNodeModule({
      name, dir: created.directory, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules'),
    }, output, config.iosModuleName, 'release', [], 'swift');
    if (template === 'polyglot_bridge_module') {
      assert.equal(config.iosModuleFactoryClass, 'VRSwiftMathModuleFactory');
      assert.equal(config.androidModuleFactoryContext, true);
      assert.match(readFileSync(path.join(created.directory, 'android/CalculatorModuleFactory.kt'), 'utf8'), /private val context: android.content.Context/);
      assert.match(readFileSync(path.join(output, 'ios/SwiftMathTypes/SwiftMathTypes.swift'), 'utf8'), /protocol VRSwiftMathCalculatorModule/);
    } else {
      const view = readFileSync(path.join(created.directory, 'ios/NativeView.swift'), 'utf8');
      assert.match(view, /UIHostingController/);
      assert.match(view, /removeFromParent/);
    }
  }
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ valdi: { modules: ['swift_math', 'swift_counter'] } }));
  syncNativeModuleRegistration(fixture);
  assert.match(readFileSync(path.join(fixture, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8'), /VRSwiftMathModuleFactory/);
  assert.match(readFileSync(path.join(fixture, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8'), /CalculatorModuleFactoryImpl\(context.applicationContext\)/);
  assert.throws(() => createModule({ root: fixture, sources, name: 'bad_ui', template: 'polyglot_bridge_module', swiftUI: true }), /requires/);
});
