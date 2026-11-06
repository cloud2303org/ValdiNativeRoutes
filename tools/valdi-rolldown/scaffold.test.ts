import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { nativeModules, syncNativeModuleRegistration } from '../../scripts/native-modules.mjs';
import { unpack } from './archive';
import { compileNodeModule } from './module-build';
import { root, valdiSourceRoot } from './pipeline';
import { createModule, MODULE_TEMPLATES } from './scaffold';
import { sampleApp } from '../../scripts/tests/fixtures/app-config.mjs';

test('every official module template compiles with the Node backend and preserves platform sources', async t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-scaffold-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const sources = valdiSourceRoot();
  assert.ok(sources, 'Prepare the pinned Valdi sources before testing templates');
  const officialTemplates = MODULE_TEMPLATES.filter(template => template !== 'cpp_bridge_module');
  for (const template of officialTemplates) {
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
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ valdi: { app: sampleApp(), modules: officialTemplates.map(template => `sample_${template}`) } }));
  const modules = syncNativeModuleRegistration(fixture);
  assert.equal(modules.length, 2);
  assert.deepEqual(nativeModules(fixture), modules);
  const kotlin = readFileSync(path.join(fixture, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8');
  assert.match(kotlin, /CalculatorModuleFactoryImpl\(\)/);
  assert.match(kotlin, /PolyglotNativeViewAttributesBinder\(context\)/);
  const objc = readFileSync(path.join(fixture, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8');
  assert.match(objc, /registerNativeModuleFactory:SamplePolyglotBridgeModuleCreateModuleFactory\(\)/);
});

test('C++ bridge templates generate module-owned implementations and real bindings without platform factories', async t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-cpp-scaffold-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const sources = valdiSourceRoot()!;
  for (const name of ['first_cpp', 'second_cpp']) {
    const created = createModule({
      root: fixture, sources, name, template: 'cpp_bridge_module',
      naming: { androidNamespace: 'com.example.host', iosPrefix: 'EX' },
    });
    const config = JSON.parse(readFileSync(path.join(created.directory, 'module.json'), 'utf8'));
    assert.equal(config.template, 'cpp_bridge_module');
    assert.equal(config.nativeBuild, undefined, 'C++ factories belong to the runtime, not Kotlin/ObjC registration');
    assert.equal(existsSync(path.join(created.directory, 'BUILD.bazel')), false);
    assert.equal(existsSync(path.join(created.directory, 'android')), false);
    assert.equal(existsSync(path.join(created.directory, 'ios')), false);
    assert.match(readFileSync(path.join(created.directory, 'cpp/BUILD.bazel'), 'utf8'),
      new RegExp(`module_cpp_library\\([\\s\\S]*module_name = "${name}"`));
    assert.match(readFileSync(path.join(created.directory, 'src/Cpp.d.ts'), 'utf8'),
      new RegExp(`android: 'com\\.example\\.host\\.modules\\.${name}\\.CppModule'`));
    const implementation = readFileSync(path.join(created.directory, 'cpp/src/Cpp.cpp'), 'utf8');
    assert.match(implementation, new RegExp(`namespace snap::valdi_modules::${name}`));
    assert.match(implementation, /registerTyped<CppModuleFactoryImpl>/);
    for (const mode of ['debug', 'release'] as const) {
      const output = path.join(fixture, mode, name);
      await compileNodeModule({
        name, dir: created.directory, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules'),
      }, output, config.iosModuleName, mode);
      const header = readFileSync(path.join(output, `cpp/valdi_modules/${name}/${name}.hpp`), 'utf8');
      assert.match(header, /class CppModuleFactory/);
      assert.match(header, /virtual double multiply\(double left, double right\)/);
      const cpp = readFileSync(path.join(output, `cpp/valdi_modules/${name}/${name}.cpp`), 'utf8');
      assert.ok(cpp.includes(`${name}/src/Cpp`), 'generated factory must expose the module canonical ID');
      const archive = unpack(readFileSync(path.join(output, `${name}.valdimodule`)));
      assert.ok([...archive.keys()].some(entry => entry.endsWith('index.js')));
      assert.equal([...archive.keys()].some(entry => entry.endsWith('Cpp.js')), false);
    }
  }
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({
    valdi: { app: sampleApp(), modules: ['first_cpp', 'second_cpp'] },
  }));
  assert.deepEqual(nativeModules(fixture), []);
  syncNativeModuleRegistration(fixture);
  assert.doesNotMatch(readFileSync(path.join(fixture, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8'),
    /CppModuleFactory/);
  for (const options of [
    { iosLanguage: 'swift' as const },
    { androidContext: true },
    { swiftUI: true },
  ]) {
    assert.throws(() => createModule({
      root: fixture, sources, name: 'invalid_cpp', template: 'cpp_bridge_module', ...options,
    }), /requires|applies to/);
    assert.equal(existsSync(path.join(fixture, 'valdi/modules/invalid_cpp')), false);
  }
  for (const name of ['double', 'namespace', 'co_await', 'reserved__cpp']) {
    assert.throws(() => createModule({
      root: fixture, sources, name, template: 'cpp_bridge_module',
    }), /C\+\+ namespace/);
    assert.equal(existsSync(path.join(fixture, 'valdi/modules', name)), false);
  }
});

test('new-module CLI prepares C++ bindings and selection without modifying the host BUILD', t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-cpp-scaffold-cli-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const tool = path.join(fixture, 'tools/valdi-rolldown');
  mkdirSync(tool, { recursive: true });
  for (const name of ['new-module.ts', 'codegen.ts', 'cpp-modules.ts', 'pipeline.ts', 'hermes.ts', 'codegen']) {
    cpSync(path.join(import.meta.dirname, name), path.join(tool, name), { recursive: true });
  }
  for (const name of ['package.json', 'node_modules', 'modules.mjs', 'valdiTs.ts', 'module-selection.ts',
    'editor-config.ts', 'scaffold.ts', 'scaffold-cpp.ts', 'vendor']) {
    symlinkSync(path.join(import.meta.dirname, name), path.join(tool, name));
  }
  symlinkSync(path.join(root, 'scripts'), path.join(fixture, 'scripts'));
  mkdirSync(path.join(fixture, 'valdi'), { recursive: true });
  symlinkSync(path.join(root, 'valdi/.valdi-sources'), path.join(fixture, 'valdi/.valdi-sources'));
  symlinkSync(path.join(root, 'valdi/node_modules'), path.join(fixture, 'valdi/node_modules'));
  const hostBuild = 'load("//:modules/runtime-cpp.bzl", "CPP_IMPLEMENTATIONS")\n# host kept unchanged\n';
  writeFileSync(path.join(fixture, 'valdi/BUILD.bazel'), hostBuild);
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({
    valdi: { app: sampleApp(), modules: ['fresh_cpp'] },
  }));
  const run = (args: string[]) => spawnSync(process.execPath, [
    path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs'), ...args,
  ], { cwd: tool, encoding: 'utf8', timeout: 60_000 });
  const created = run(['new-module.ts', 'fresh_cpp', '--template', 'cpp_bridge_module']);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
  assert.equal(readFileSync(path.join(fixture, 'valdi/BUILD.bazel'), 'utf8'), hostBuild);
  assert.ok(existsSync(path.join(fixture, 'valdi/modules/fresh_cpp/cpp/generated/valdi_modules/fresh_cpp/fresh_cpp.hpp')));
  assert.ok(existsSync(path.join(fixture, 'android/app/generated/valdi/fresh_cpp.kt')));
  assert.match(readFileSync(path.join(fixture, 'valdi/modules/runtime-cpp.bzl'), 'utf8'),
    /\/\/modules\/fresh_cpp\/cpp:native/);
  const checked = run(['codegen.ts', '--cpp-modules-out', path.join(fixture, 'valdi/modules'), '--check']);
  assert.equal(checked.status, 0, checked.stderr);
  const disabled = run(['new-module.ts', 'later_cpp', '--template', 'cpp_bridge_module']);
  assert.equal(disabled.status, 0, `${disabled.stdout}\n${disabled.stderr}`);
  const selection = readFileSync(path.join(fixture, 'valdi/modules/runtime-cpp.bzl'), 'utf8');
  assert.match(selection, /fresh_cpp\/cpp:native/);
  assert.doesNotMatch(selection, /later_cpp/);
  assert.match(readFileSync(path.join(fixture, 'valdi/modules/runtime-packages.bazelrc'), 'utf8'), /modules\/later_cpp/);
  assert.equal(existsSync(path.join(fixture, 'valdi/modules/later_cpp/cpp/generated')), false);
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
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ valdi: { app: sampleApp(), modules: ['swift_math', 'swift_counter'] } }));
  syncNativeModuleRegistration(fixture);
  assert.match(readFileSync(path.join(fixture, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8'), /VRSwiftMathModuleFactory/);
  assert.match(readFileSync(path.join(fixture, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8'), /CalculatorModuleFactoryImpl\(context.applicationContext\)/);
  assert.throws(() => createModule({ root: fixture, sources, name: 'bad_ui', template: 'polyglot_bridge_module', swiftUI: true }), /requires/);
});

test('project naming applies only to new modules and agrees with compiled native contracts', async t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-project-scaffold-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const sources = valdiSourceRoot()!;
  const app = sampleApp();
  for (const [name, template, iosLanguage] of [
    ['custom_math', 'polyglot_bridge_module', 'objc'],
    ['custom_swift', 'polyglot_bridge_module', 'swift'],
    ['custom_view', 'polyglot_view_module', 'objc'],
  ] as const) {
    const created = createModule({ root: fixture, sources, name, template, iosLanguage, naming: app.native });
    const config = JSON.parse(readFileSync(path.join(created.directory, 'module.json'), 'utf8'));
    assert.equal(config.androidClassPath, `com.example.host.modules.${name}`);
    const out = path.join(fixture, 'out', name);
    await compileNodeModule({
      name, dir: created.directory, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules'),
    }, out, config.iosModuleName, 'debug', [], iosLanguage);
    if (template === 'polyglot_bridge_module') {
      assert.match(readFileSync(path.join(out, 'android', `${name}.kt`), 'utf8'),
        new RegExp(`package com\\.example\\.host\\.modules\\.${name}`));
    }
    if (name === 'custom_math') {
      assert.equal(config.iosModuleFactory, 'EXCustomMathCreateModuleFactory');
      assert.match(readFileSync(path.join(created.directory, 'ios/EXCustomMathModuleFactory.m'), 'utf8'),
        /EXCustomMathCalculatorModuleFactoryImpl/);
      assert.match(readFileSync(path.join(out, 'ios/CustomMathTypes/CustomMathTypes.h'), 'utf8'),
        /CustomMathCalculatorModule/);
    } else if (name === 'custom_swift') {
      assert.equal(config.iosModuleFactoryClass, 'EXCustomSwiftModuleFactory');
      assert.match(readFileSync(path.join(out, 'ios/CustomSwiftTypes/CustomSwiftTypes.swift'), 'utf8'),
        /protocol EXCustomSwiftCalculatorModule/);
    } else {
      assert.ok(existsSync(path.join(created.directory, 'ios/EXCustomViewNativeView.m')));
      assert.match(readFileSync(path.join(created.directory, 'android/PolyglotNativeView.kt'), 'utf8'),
        /package com\.example\.host\.modules\.custom_view/);
    }
  }
});
