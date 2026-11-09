import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';

function put(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function snapshot(directory: string): Record<string, { content: string; mtime: bigint }> {
  const files: Record<string, { content: string; mtime: bigint }> = {};
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else files[path.relative(directory, file)] = {
        content: readFileSync(file, 'utf8'), mtime: statSync(file, { bigint: true }).mtimeNs,
      };
    }
  };
  visit(directory);
  return files;
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-codegen-ownership-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const tool = path.join(directory, 'tools/valdi-rolldown');
  mkdirSync(tool, { recursive: true });
  // Copy root-sensitive entry points; reuse the installed backend without touching the real project's outputs.
  for (const name of ['codegen.ts', 'cpp-modules.ts', 'pipeline.ts', 'hermes.ts', 'codegen']) {
    cpSync(path.join(import.meta.dirname, name), path.join(tool, name), { recursive: true });
  }
  for (const name of ['package.json', 'modules.mjs', 'module-selection.ts', 'editor-config.ts']) {
    cpSync(path.join(import.meta.dirname, name), path.join(tool, name));
  }
  // Keep valdiTs's own relative imports in the original tool directory.
  symlinkSync(path.join(import.meta.dirname, 'valdiTs.ts'), path.join(tool, 'valdiTs.ts'));
  for (const name of ['node_modules', 'vendor']) {
    symlinkSync(path.join(import.meta.dirname, name), path.join(tool, name), 'junction');
  }
  const modules = path.join(directory, 'valdi/modules');
  // The real, portable calculator declaration/config exercises the capitalized iOS module name and module factory.
  const calculator = path.resolve(import.meta.dirname, '../../valdi/modules/calculator');
  for (const name of ['module.json', 'src/Calculator.d.ts']) {
    mkdirSync(path.dirname(path.join(modules, 'calculator', name)), { recursive: true });
    cpSync(path.join(calculator, name), path.join(modules, 'calculator', name));
  }
  assert.equal(JSON.parse(readFileSync(path.join(calculator, 'module.json'), 'utf8')).nativeBuild, 'bazel');
  put(path.join(directory, 'package.json'), JSON.stringify({ valdi: { modules: ['calculator', 'host', 'shared', 'runtime_cpp'] } }));
  put(path.join(modules, 'host/module.json'), JSON.stringify({ nativeBuild: 'host', iosModuleName: 'Host' }));
  put(path.join(modules, 'host/src/index.ts'), [
    "import { Shared } from 'shared/src';",
    '/** @ExportModel */',
    'export interface Host { readonly shared: Shared; }',
  ].join('\n'));
  put(path.join(modules, 'host/cpp/src/main.cpp'), '// C++ implementation owner; no native build is run.\n');
  put(path.join(modules, 'calculator/cpp/src/main.cpp'), '// Bazel-owned C++ root must stay in the runtime plan.\n');
  put(path.join(modules, 'runtime_cpp/module.json'), JSON.stringify({
    nativeBuild: 'cpp', iosModuleName: 'RuntimeCpp', androidClassPath: 'com.example.runtime',
    nativeDependencies: { script: 'prepare.mjs', inputs: [] }, nativeInputs: ['cpp'],
  }));
  put(path.join(modules, 'runtime_cpp/src/index.ts'), [
    "import { Shared } from 'shared/src';",
    '/** @ExportModule */',
    'export declare function readValue(): Shared;',
  ].join('\n'));
  put(path.join(modules, 'runtime_cpp/cpp/src/main.cpp'), '// Runtime-owned C++ root.\n');
  put(path.join(modules, 'runtime_cpp/prepare.mjs'), 'throw new Error("codegen must not prepare runtime dependencies");\n');
  put(path.join(modules, 'shared/src/index.ts'),
    '/** @ExportModel */\nexport interface Shared { readonly value: number; }\n');
  put(path.join(modules, 'disabled/src/index.ts'), 'export {};\n');
  put(path.join(modules, 'disabled/module.json'), JSON.stringify({ iosModuleName: 'Disabled' }));
  for (const name of ['calculator', 'host', 'shared', 'runtime_cpp']) {
    put(path.join(modules, name, 'tsconfig.json'), JSON.stringify({
      include: ['src/**/*.ts'],
      compilerOptions: { paths: { 'shared/*': ['../shared/*'] } },
    }));
  }
  const output = path.join(directory, 'output');
  mkdirSync(output);
  const args = [
    '--kotlin-out', path.join(output, 'kotlin'),
    '--objc-out', path.join(output, 'objc'), '--objc-framework', 'ValdiRuntime',
    '--cpp-out', path.join(output, 'flat'),
    '--cpp-modules-out', path.join(output, 'modules'),
  ];
  const run = (extra: string[] = []) => {
    const result = spawnSync(process.execPath, [
      path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs'),
      path.join(tool, 'codegen.ts'), ...args, ...extra,
    ], { cwd: tool, encoding: 'utf8', timeout: 60_000 });
    assert.ifError(result.error);
    return result;
  };
  return { output, run, tool, modules };
}

test('cpp mode emits C++ runtime roots without Kotlin/ObjC and prunes stale host bindings even when named explicitly', t => {
  const { output, run } = fixture(t);
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);
  const owned = [
    'kotlin/runtime_cpp.kt',
    ...['RuntimeCpp', 'RuntimeCppTypes'].flatMap(name =>
      ['h', 'm', 'swift'].map(extension => `objc/${name}/${name}.${extension}`)),
  ];
  for (const file of owned) assert.equal(existsSync(path.join(output, file)), false, file);
  const header = 'modules/runtime_cpp/cpp/generated/valdi_modules/runtime_cpp/runtime_cpp.hpp';
  assert.match(readFileSync(path.join(output, header), 'utf8'), /readValue/);
  assert.match(readFileSync(path.join(output, 'flat/valdi_modules/runtime_cpp/runtime_cpp.hpp'), 'utf8'), /readValue/);
  const registry = readFileSync(path.join(output, 'modules/runtime-cpp.bzl'), 'utf8');
  assert.match(registry, /"\/\/modules\/runtime_cpp\/cpp:native"/);
  assert.match(registry, /"runtime_cpp": \[\n        "\/\/modules\/shared\/cpp:bindings"/);
  const preserved = ['objc/RuntimeCpp/notes.h', 'objc/RuntimeCppTypes/notes.swift', 'kotlin/runtime_cpp_notes.kt'];
  for (const file of preserved) put(path.join(output, file), '// handwritten neighbor\n');
  const expected = snapshot(output);
  for (const args of [[], ['runtime_cpp']]) {
    for (const file of owned) put(path.join(output, file), '// stale host copy\n');
    const before = snapshot(output);
    const check = run([...args, '--check']);
    assert.equal(check.status, 1, check.stderr);
    assert.deepEqual(snapshot(output), before);
    const removals = check.stderr.split('\n').filter(line => line.includes('(CPP-owned module; remove)'));
    assert.deepEqual(removals.sort(), owned.map(file =>
      `  ${path.join(output, file)} (CPP-owned module; remove)`).sort());
    const cleanup = run(args);
    assert.equal(cleanup.status, 0, cleanup.stderr);
    assert.deepEqual(snapshot(output), expected);
    const clean = run([...args, '--check']);
    assert.equal(clean.status, 0, clean.stderr);
    assert.deepEqual(snapshot(output), expected);
  }
});

test('pipeline accepts cpp metadata and rejects its app platform registrations and contributions', async t => {
  const { tool, modules } = fixture(t);
  const { moduleConfig } = await import(pathToFileURL(path.join(tool, 'pipeline.ts')).href) as typeof import('./pipeline');
  const configFile = path.join(modules, 'runtime_cpp/module.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(moduleConfig('runtime_cpp').nativeBuild, 'cpp');
  for (const field of [
    'androidModuleFactory', 'androidModuleFactoryContext', 'androidViewBinder', 'androidDependencies',
    'androidPlatforms', 'androidPermissions', 'androidFeatures', 'androidCmake',
    'iosModuleFactory', 'iosModuleFactoryClass', 'iosFrameworks', 'iosPackages',
    'iosInfoPlist', 'iosEntitlements', 'iosBackgroundModes', 'iosNativeSources', 'iosNativeFrameworks', 'iosBuildSettings',
  ]) {
    put(configFile, JSON.stringify({ ...config, [field]: [] }));
    assert.throws(() => moduleConfig('runtime_cpp'), new RegExp(`nativeBuild cpp.*${field}`));
  }
});

test('default host sync removes enabled Bazel Kotlin/ObjC copies read-only in check mode and preserves positional/C++ outputs', t => {
  const { output, run } = fixture(t);
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);
  const seed = run(['calculator']);
  assert.equal(seed.status, 0, seed.stderr);
  assert.match(readFileSync(path.join(output, 'kotlin/calculator.kt'), 'utf8'), /CalculatorModuleFactory/);
  assert.match(readFileSync(path.join(output, 'objc/CalculatorTypes/CalculatorTypes.h'), 'utf8'), /multiplyWithLeft:/);
  const owned = [
    'kotlin/calculator.kt',
    'objc/Calculator/Calculator.h', 'objc/Calculator/Calculator.m',
    'objc/CalculatorTypes/CalculatorTypes.h', 'objc/CalculatorTypes/CalculatorTypes.m',
    'objc/Calculator/Calculator.swift', 'objc/CalculatorTypes/CalculatorTypes.swift',
  ];
  // Also remove canonical leftovers from a previous iOS language setting.
  for (const file of owned.filter(file => file.endsWith('.swift'))) put(path.join(output, file), '// stale Swift\n');
  const preserved = [
    'kotlin/output-marker.txt', 'kotlin/calculator_notes.kt',
    'objc/output-marker.txt', 'objc/Calculator/notes.txt', 'objc/CalculatorTypes/notes.txt',
    'objc/calculator/handwritten.h', 'objc/Unrelated/Unrelated.h',
    'flat/valdi_modules/calculator/handwritten.hpp', 'flat/output-marker.txt',
    'modules/calculator/cpp/src/handwritten.cpp', 'modules/output-marker.txt',
  ];
  for (const file of preserved) put(path.join(output, file), `// preserve ${file}\n`);
  // Positional generation stays independent, even with module-owned C++ synchronization enabled.
  const positionalBefore = snapshot(output);
  const positionalCheck = run(['calculator', '--check']);
  assert.equal(positionalCheck.status, 0, positionalCheck.stderr);
  assert.deepEqual(snapshot(output), positionalBefore);
  const check = run(['--check']);
  assert.equal(check.status, 1, check.stderr);
  assert.equal(check.stdout, '');
  assert.deepEqual(snapshot(output), positionalBefore, '--check must not write or remove any output');
  const removalLines = check.stderr.split('\n').filter(line => line.includes('(Bazel-owned module; remove)'));
  assert.deepEqual(removalLines.sort(), owned.map(file =>
    `  ${path.join(output, file)} (Bazel-owned module; remove)`).sort());
  assert.equal(check.stderr.split('\n').filter(line => line.startsWith('  ')).length, owned.length);
  const cleanup = run();
  assert.equal(cleanup.status, 0, cleanup.stderr);
  for (const file of owned) assert.equal(existsSync(path.join(output, file)), false, file);
  const after = snapshot(output);
  const expected = { ...positionalBefore };
  for (const file of owned) delete expected[path.normalize(file)];
  assert.deepEqual(after, expected, 'only the canonical Bazel Kotlin/ObjC files may change');
  assert.match(readFileSync(path.join(output, 'modules/runtime-cpp.bzl'), 'utf8'), /"\/\/modules\/host\/cpp:native"/);
  assert.ok(existsSync(path.join(output, 'modules/shared/cpp/generated/valdi_modules/shared/shared.hpp')));
  for (const extra of [[], ['--check']]) {
    const clean = run(extra);
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(clean.stdout, '');
    assert.deepEqual(snapshot(output), after);
  }
  const reseed = run(['calculator']);
  assert.equal(reseed.status, 0, reseed.stderr);
  for (const file of owned.filter(file => !file.endsWith('.swift'))) {
    assert.equal(readFileSync(path.join(output, file), 'utf8'), positionalBefore[path.normalize(file)].content);
  }
});

test('disabled cleanup still removes all three generic platforms while enabled Bazel C++ stays untouched', t => {
  const { output, run } = fixture(t);
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);
  const stale = [
    'kotlin/disabled.kt', 'objc/Disabled/Disabled.h', 'objc/DisabledTypes/DisabledTypes.h',
    'flat/valdi_modules/disabled/disabled.hpp',
  ];
  for (const file of stale) put(path.join(output, file), '// disabled output\n');
  put(path.join(output, 'flat/valdi_modules/calculator/calculator.hpp'), '// independent generic output\n');
  put(path.join(output, 'kotlin/calculator.kt'), '// duplicate Bazel output\n');
  const before = snapshot(output);
  const check = run(['--check']);
  assert.equal(check.status, 1, check.stderr);
  assert.deepEqual(snapshot(output), before);
  for (const file of ['kotlin/disabled.kt', 'objc/Disabled', 'objc/DisabledTypes', 'flat/valdi_modules/disabled']) {
    assert.ok(check.stderr.includes(`${path.join(output, file)} (disabled module; remove)`), check.stderr);
  }
  const cleanup = run();
  assert.equal(cleanup.status, 0, cleanup.stderr);
  const expected = { ...before };
  for (const file of [...stale, 'kotlin/calculator.kt']) delete expected[path.normalize(file)];
  assert.deepEqual(snapshot(output), expected);
  const clean = run(['--check']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(snapshot(output), expected);
});
