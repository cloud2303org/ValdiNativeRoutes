import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, globSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { codegenModules, generateNativeCode, nativeSourceFiles, VALDI_PROJECT_CONFIG, type CodegenModule, type NativeCode } from './codegen/index';
import { generatedCppDependencies, ownsCppImplementation, planCppModules, syncCppModules } from './cpp-modules';
import { availableModuleNames, enabledModuleNames } from './modules.mjs';
import { cppModuleFiles } from './scaffold-cpp';

function temporary(t: TestContext): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-cpp-modules-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function put(file: string, content = '// handwritten\n'): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function catalog(directory: string, names: string[]): Record<string, CodegenModule> {
  return Object.fromEntries(names.map(name => [name, {
    module: { name, dir: path.join(directory, name), generatedDirs: [] },
    bundleInfo: { ...VALDI_PROJECT_CONFIG, name, iosModuleName: name, asyncStrictMode: false },
  }]));
}

function bindings(name: string, header = `// ${name}\n`, cpp = `#include "valdi_modules/${name}/${name}.hpp"\n`): NativeCode {
  return {
    sources: [['hpp', header], ['cpp', cpp]].map(([extension, content]) => ({
      platform: 'cpp',
      source: {
        relativePath: `valdi_modules/${name}`, filename: `${name}.${extension}`, content,
        groupingIdentifier: `${name}.${extension}`, groupingPriority: 0, localFilenameDependencies: [],
      },
    })),
  };
}

function snapshot(directory: string): Record<string, { content: string; mtime: number }> {
  const files: Record<string, { content: string; mtime: number }> = {};
  const visit = (current: string) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else files[path.relative(directory, file)] = { content: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs };
    }
  };
  visit(directory);
  return files;
}

test('default roots require cpp/src implementations, including nested cc/cxx, and skip unrelated native files', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['pages', 'cc_root', 'cxx_root', 'ui', 'video', 'headers']);
  put(path.join(directory, 'pages/cpp/src/main.cpp'));
  put(path.join(directory, 'cc_root/cpp/src/deep/main.cc'));
  put(path.join(directory, 'cxx_root/cpp/src/main.cxx'));
  put(path.join(directory, 'ui/ios/main.mm'));
  put(path.join(directory, 'video/cpp/generated/old.cpp'));
  put(path.join(directory, 'headers/cpp/src/header.hpp'));
  const calls: string[] = [];
  const plan = planCppModules({ modules, generate: target => {
    calls.push(target.module.name);
    return bindings(target.module.name);
  } });
  assert.deepEqual(plan.roots, ['cc_root', 'cxx_root', 'pages']);
  assert.deepEqual(plan.implementationRoots, plan.roots);
  assert.deepEqual(calls, plan.roots);
  assert.equal(ownsCppImplementation(path.join(directory, 'video')), false);
});

test('explicit roots add to all implementation owners instead of replacing them', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['pages', 'other', 'extra']);
  put(path.join(directory, 'pages/cpp/src/main.cpp'));
  put(path.join(directory, 'other/cpp/src/main.cc'));
  const generate = (target: CodegenModule) => bindings(target.module.name);
  for (const requested of [[], ['pages', 'pages'], ['extra']]) {
    const plan = planCppModules({ modules, roots: requested, generate });
    const expected = requested.includes('extra') ? ['extra', 'other', 'pages'] : ['other', 'pages'];
    assert.deepEqual(plan.roots, expected);
    assert.deepEqual(plan.implementationRoots, ['other', 'pages']);
    assert.deepEqual(plan.modules.map(module => module.name), expected);
  }
});

test('runtime registry automatically links two owners and records only direct generated binding dependencies', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['second', 'first', 'foundation', 'leaf', 'extra']);
  put(path.join(directory, 'first/cpp/src/main.cpp'));
  put(path.join(directory, 'second/cpp/src/deep/main.cxx'));
  const dependencies: Record<string, string[]> = {
    first: ['foundation'], second: ['leaf', 'foundation', 'leaf'], foundation: ['leaf'],
  };
  const generate = (target: CodegenModule) => {
    const name = target.module.name;
    return bindings(name, dependencies[name]?.map(dependency =>
      `#include "valdi_modules/${dependency}/${dependency}.hpp"\n`).join(''));
  };
  const output = path.join(directory, 'out');
  const registry = path.join(output, 'runtime-cpp.bzl');
  const plan = planCppModules({ modules, generate });
  assert.deepEqual(plan.roots, ['first', 'second']);
  assert.deepEqual(syncCppModules(plan, output, true), [
    ...['first', 'foundation', 'leaf', 'second'].flatMap(name => [
      path.join(output, name, 'cpp/BUILD.bazel'),
      ...['cpp', 'hpp'].map(extension => path.join(output, name, `cpp/generated/valdi_modules/${name}/${name}.${extension}`)),
    ]),
    registry, path.join(output, 'runtime-packages.bazelrc'),
  ].sort());
  assert.equal(existsSync(output), false);
  syncCppModules(plan, output);
  const expected = [
    '# Generated by tools/valdi-rolldown/codegen.ts --cpp-modules-out; do not edit.',
    '# Only implementation owners link into the runtime; explicit binding requests remain binding-only.',
    'CPP_IMPLEMENTATIONS = [',
    '    "//modules/first/cpp:native",',
    '    "//modules/second/cpp:native",',
    ']',
    '',
    'CPP_BINDING_DEPS = {',
    '    "first": [',
    '        "//modules/foundation/cpp:bindings",',
    '    ],',
    '    "foundation": [',
    '        "//modules/leaf/cpp:bindings",',
    '    ],',
    '    "leaf": [',
    '    ],',
    '    "second": [',
    '        "//modules/foundation/cpp:bindings",',
    '        "//modules/leaf/cpp:bindings",',
    '    ],',
    '}',
    '',
  ].join('\n');
  assert.equal(readFileSync(registry, 'utf8'), expected);
  // Neither catalog insertion order nor plan iteration order affects generated bytes.
  const clean = snapshot(output);
  assert.deepEqual(syncCppModules({
    ...plan, implementationRoots: [...plan.implementationRoots].reverse(),
    modules: [...plan.modules].reverse().map(module => ({ ...module, dependencies: [...module.dependencies].reverse() })),
  }, output), []);
  assert.deepEqual(snapshot(output), clean);
  const explicit = planCppModules({ modules, roots: ['extra'], generate });
  syncCppModules(explicit, output);
  const requested = readFileSync(registry, 'utf8');
  assert.match(requested, /"extra": \[\n    \],/);
  assert.equal(requested.split('CPP_BINDING_DEPS')[0], expected.split('CPP_BINDING_DEPS')[0]);
  assert.doesNotMatch(requested, /extra\/cpp:native|foundation\/cpp:native|leaf\/cpp:native/);
  const before = snapshot(output);
  assert.deepEqual(syncCppModules(explicit, output, true), []);
  assert.deepEqual(snapshot(output), before);
  put(registry, '# stale registry\n');
  const stale = snapshot(output);
  assert.deepEqual(syncCppModules(explicit, output, true), [registry]);
  assert.deepEqual(snapshot(output), stale);
  assert.deepEqual(syncCppModules(explicit, output), [registry]);
  assert.equal(readFileSync(registry, 'utf8'), requested);

  // Disabling an owner updates the runtime list and removes its generated output in this separate output root.
  const { second: disabled, ...enabled } = modules;
  const reduced = planCppModules({ modules: enabled, availableModules: Object.keys(modules), generate });
  const disabledBefore = snapshot(output);
  const differences = syncCppModules(reduced, output, true);
  assert.ok(differences.includes(registry));
  assert.deepEqual(snapshot(output), disabledBefore);
  assert.deepEqual(syncCppModules(reduced, output), differences);
  assert.doesNotMatch(readFileSync(registry, 'utf8'), /second|extra/);
  assert.equal(readFileSync(path.join(disabled.module.dir, 'cpp/src/deep/main.cxx'), 'utf8'), '// handwritten\n');
  assert.deepEqual(syncCppModules(reduced, output, true), []);
});

test('generated includes from both files determine the memoized transitive closure, including cycles', t => {
  const modules = catalog(temporary(t), ['pages', 'foundation', 'leaf', 'unused']);
  const calls: string[] = [];
  const code = {
    pages: bindings('pages', '#include <valdi_modules/foundation/foundation.hpp>\n',
      '#include "valdi_modules/leaf/leaf.hpp"\n'),
    foundation: bindings('foundation', '#include "valdi_modules/leaf/leaf.hpp"\n'),
    leaf: bindings('leaf', '#include "valdi_modules/pages/pages.hpp"\n'),
  };
  const plan = planCppModules({ modules, roots: ['pages', 'pages'], generate: target => {
    const name = target.module.name;
    calls.push(name);
    return code[name as keyof typeof code];
  } });
  assert.deepEqual(plan.roots, ['pages']);
  assert.deepEqual(plan.modules.map(({ name, dependencies }) => ({ name, dependencies })), [
    { name: 'foundation', dependencies: ['leaf'] },
    { name: 'leaf', dependencies: ['pages'] },
    { name: 'pages', dependencies: ['foundation', 'leaf'] },
  ]);
  assert.deepEqual(calls, ['pages', 'foundation', 'leaf']);
  assert.deepEqual(generatedCppDependencies('pages', new Map([['pages.hpp', [
    '#include "valdi_modules/pages/pages.hpp"',
    '// #include "valdi_modules/unused/unused.hpp"',
    '#include <valdi/runtime/Value.hpp>',
    '#include "valdi_modules/unused/other.hpp"',
  ].join('\n')]])), []);
});

test('modules without implementations still produce runtime config, and explicit roots request their bindings', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['ui']);
  const generate = (target: CodegenModule) => bindings(target.module.name);
  assert.deepEqual(planCppModules({ modules, generate }),
    { roots: [], implementationRoots: [], availableModules: ['ui'], modules: [] });
  const output = path.join(directory, 'out');
  const config = path.join(output, 'runtime-packages.bazelrc');
  const registry = path.join(output, 'runtime-cpp.bzl');
  assert.deepEqual(syncCppModules(planCppModules({ modules, generate }), output, true), [registry, config]);
  assert.equal(existsSync(output), false);
  assert.deepEqual(syncCppModules(planCppModules({ modules, generate }), output), [registry, config]);
  assert.equal(existsSync(path.join(output, 'ui')), false);
  assert.match(readFileSync(config, 'utf8'), /^common --deleted_packages=modules\/ui$/m);
  const requested = planCppModules({ modules, roots: ['ui'], generate });
  assert.equal(syncCppModules(requested, output).length, 4);
  assert.match(readFileSync(registry, 'utf8'), /CPP_IMPLEMENTATIONS = \[\n\]/);
  assert.doesNotMatch(readFileSync(registry, 'utf8'), /ui\/cpp:native/);
  assert.ok(existsSync(path.join(output, 'ui/cpp/generated/valdi_modules/ui/ui.hpp')));
});

test('runtime config uses exact sorted parent packages from the full src directory scan, including disabled modules', t => {
  const directory = temporary(t);
  const root = path.join(directory, 'project');
  const moduleDirectory = path.join(root, 'valdi/modules');
  for (const name of ['ui', 'disabled', 'pages']) put(path.join(moduleDirectory, name, 'src/index.ts'));
  put(path.join(moduleDirectory, 'pages/cpp/src/main.cpp'));
  put(path.join(moduleDirectory, 'disabled/cpp/src/main.cpp'));
  put(path.join(moduleDirectory, 'not_a_module/cpp/src/main.cpp'));
  put(path.join(root, 'package.json'), JSON.stringify({ valdi: { modules: ['ui', 'pages'] } }));
  const availableModules = availableModuleNames(root);
  const plan = planCppModules({
    modules: catalog(moduleDirectory, enabledModuleNames(root)), availableModules,
    generate: target => bindings(target.module.name),
  });
  assert.deepEqual(availableModules, ['disabled', 'pages', 'ui']);
  assert.deepEqual(plan.roots, ['pages']);
  assert.deepEqual(plan.modules.map(module => module.name), ['pages']);
  const output = path.join(directory, 'requested-output');
  const config = path.join(output, 'runtime-packages.bazelrc');
  const before = snapshot(root);
  syncCppModules(plan, output);
  assert.equal(readFileSync(config, 'utf8'), [
    '# Generated by tools/valdi-rolldown/codegen.ts --cpp-modules-out; do not edit.',
    '# Parent module packages belong to the module workspace; nested cpp packages remain available.',
    'common --deleted_packages=modules/disabled,modules/pages,modules/ui',
    '',
  ].join('\n'));
  assert.match(readFileSync(path.join(output, 'runtime-cpp.bzl'), 'utf8'), /"\/\/modules\/pages\/cpp:native"/);
  assert.doesNotMatch(readFileSync(path.join(output, 'runtime-cpp.bzl'), 'utf8'), /disabled|ui/);
  assert.equal(existsSync(path.join(output, 'disabled')), false);
  assert.equal(existsSync(path.join(root, 'valdi/runtime-packages.bazelrc')), false);
  assert.equal(existsSync(path.join(moduleDirectory, 'runtime-packages.bazelrc')), false);
  assert.deepEqual(snapshot(root), before);
});

test('config-only changes are checked read-only and repaired idempotently, including catalog removal and empty catalogs', t => {
  const directory = temporary(t);
  const output = path.join(directory, 'out');
  const config = path.join(output, 'runtime-packages.bazelrc');
  const registry = path.join(output, 'runtime-cpp.bzl');
  const plan = planCppModules({ modules: {}, availableModules: ['ui', 'disabled', 'ui'] });
  assert.deepEqual(plan.availableModules, ['disabled', 'ui']);
  assert.deepEqual(syncCppModules(plan, output, true), [registry, config]);
  assert.equal(existsSync(output), false);
  assert.deepEqual(syncCppModules(plan, output), [registry, config]);
  const clean = snapshot(output);
  assert.deepEqual(syncCppModules(plan, output), []);
  assert.deepEqual(snapshot(output), clean);
  put(config, 'stale config\n');
  const stale = snapshot(output);
  assert.deepEqual(syncCppModules(plan, output, true), [config]);
  assert.deepEqual(snapshot(output), stale);
  assert.deepEqual(syncCppModules(plan, output), [config]);
  const reduced = planCppModules({ modules: {}, availableModules: ['ui'] });
  const before = snapshot(output);
  assert.deepEqual(syncCppModules(reduced, output, true), [config]);
  assert.deepEqual(snapshot(output), before);
  syncCppModules(reduced, output);
  assert.match(readFileSync(config, 'utf8'), /^common --deleted_packages=modules\/ui$/m);
  const empty = planCppModules({ modules: {} });
  assert.deepEqual(syncCppModules(empty, output, true), [config]);
  syncCppModules(empty, output);
  assert.doesNotMatch(readFileSync(config, 'utf8'), /--deleted_packages/);
  assert.deepEqual(syncCppModules(empty, output, true), []);
  assert.deepEqual(Object.keys(snapshot(output)), ['runtime-cpp.bzl', 'runtime-packages.bazelrc']);
});

test('invalid available module IDs cannot inject runtime options or escape the requested output root', t => {
  const output = path.join(temporary(t), 'out');
  for (const name of ['../outside', 'pages/cpp', 'pages,modules/other', 'pages\ncommon --config=other']) {
    const plan = planCppModules({ modules: {}, availableModules: [name] });
    assert.throws(() => syncCppModules(plan, output), /Invalid C\+\+ module ID/);
    assert.equal(existsSync(output), false);
  }
});

test('invalid registry IDs and unplanned labels fail before any output is written', t => {
  const directory = temporary(t);
  const output = path.join(directory, 'out');
  const modules = catalog(directory, ['pages']);
  put(path.join(directory, 'pages/cpp/src/main.cpp'));
  const plan = planCppModules({ modules, generate: () => bindings('pages') });
  for (const invalid of [
    { ...plan, roots: ['../outside'] },
    { ...plan, implementationRoots: ['pages\nINVALID = True'] },
    { ...plan, modules: [{ ...plan.modules[0], name: 'pages/cpp' }] },
    { ...plan, modules: [{ ...plan.modules[0], dependencies: ['pages:other'] }] },
  ]) {
    assert.throws(() => syncCppModules(invalid, output), /Invalid C\+\+ module ID/);
    assert.equal(existsSync(output), false);
  }
  assert.throws(() => syncCppModules({ ...plan, roots: [] }, output), /missing from the planned roots/);
  assert.throws(() => syncCppModules({
    ...plan, modules: [{ ...plan.modules[0], dependencies: ['missing'] }],
  }, output), /dependency "missing" of "pages" is not planned/);
  assert.equal(existsSync(output), false);
});

test('missing and disabled generated dependencies and explicit roots are rejected', t => {
  const modules = catalog(temporary(t), ['pages']);
  const generate = () => bindings('pages', '#include "valdi_modules/disabled/disabled.hpp"\n');
  assert.throws(() => planCppModules({ modules, roots: ['pages'], availableModules: ['pages', 'disabled'], generate }),
    /dependency "disabled" of "pages" is disabled/);
  assert.throws(() => planCppModules({ modules, roots: ['pages'], generate }), /dependency "disabled" of "pages" is missing/);
  assert.throws(() => planCppModules({ modules, roots: ['disabled'], availableModules: ['pages', 'disabled'], generate }),
    /root "disabled" is disabled/);
});

test('sync is deterministic and idempotent; check detects missing, changed and stale output without writes', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['pages', 'unused']);
  const plan = planCppModules({ modules, roots: ['pages'], generate: target => bindings(target.module.name) });
  const output = path.join(directory, 'out');
  const header = path.join(output, 'pages/cpp/generated/valdi_modules/pages/pages.hpp');
  const source = path.join(output, 'pages/cpp/generated/valdi_modules/pages/pages.cpp');
  const unused = path.join(output, 'unused/cpp/generated/valdi_modules/unused/unused.hpp');
  const removed = path.join(output, 'removed/cpp/generated/valdi_modules/removed/removed.cpp');
  const preserved = [
    'unused/cpp/src/main.cpp', 'unused/BUILD.bazel', 'unused/cpp/BUILD.bazel',
    'unused/cpp/generated/valdi_modules/unused/notes.txt',
    'unused/cpp/generated/valdi_modules/unused/handwritten.hpp',
    'unused/cpp/generated/other.cpp', 'pages/cpp/src/main.cc',
  ];
  for (const file of preserved) put(path.join(output, file));
  put(unused, 'obsolete');
  put(removed, 'removed module');
  put(header, 'changed');
  const before = snapshot(output);
  const differences = syncCppModules(plan, output, true);
  assert.equal(differences.length, 7);
  assert.deepEqual(differences, [...differences].sort());
  assert.deepEqual(snapshot(output), before);
  assert.equal(existsSync(source), false);
  assert.deepEqual(syncCppModules(plan, output), differences);
  for (const file of preserved) assert.equal(readFileSync(path.join(output, file), 'utf8'), '// handwritten\n');
  assert.equal(existsSync(unused), false);
  assert.equal(existsSync(removed), false);
  assert.equal(readFileSync(header, 'utf8'), '// pages\n');
  const after = snapshot(output);
  assert.deepEqual(syncCppModules(plan, output), []);
  assert.deepEqual(syncCppModules(plan, output, true), []);
  assert.deepEqual(snapshot(output), after);
});

test('missing dependency packages are generated only inside the plan and check reports them without writes', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['owner', 'types', 'unused']);
  put(path.join(directory, 'owner/cpp/src/main.cpp'));
  const plan = planCppModules({ modules, generate: target => bindings(target.module.name,
    target.module.name === 'owner' ? '#include "valdi_modules/types/types.hpp"\n' : '// exported types\n') });
  const ownerBuild = cppModuleFiles('owner', 'Owner').get('cpp/BUILD.bazel')!;
  put(path.join(directory, 'owner/cpp/BUILD.bazel'), ownerBuild);
  const build = path.join(directory, 'types/cpp/BUILD.bazel');
  const before = snapshot(directory);
  const missing = syncCppModules(plan, directory, true);
  assert.ok(missing.includes(build));
  assert.deepEqual(snapshot(directory), before);
  assert.equal(existsSync(path.dirname(build)), false);
  assert.deepEqual(syncCppModules(plan, directory), missing);
  assert.equal(readFileSync(path.join(directory, 'owner/cpp/BUILD.bazel'), 'utf8'), ownerBuild);
  assert.equal(readFileSync(build, 'utf8'), [
    '# Generated by tools/valdi-rolldown/codegen.ts --cpp-modules-out; do not edit.',
    '# Binding-only package managed by --cpp-modules-out.',
    '',
    'load("//bzl/module_cpp:module.bzl", "module_cpp_library")',
    '',
    '# Source globs enable :native automatically when implementations are added.',
    'module_cpp_library(',
    '    module_name = "types",',
    '    srcs = glob(["src/**/*.cpp", "src/**/*.cc", "src/**/*.cxx"], allow_empty = True),',
    '    hdrs = glob(["src/**/*.h", "src/**/*.hpp"], allow_empty = True),',
    ')',
    '',
  ].join('\n'));
  assert.equal(existsSync(path.join(directory, 'unused')), false);
  const generated = readFileSync(build, 'utf8');
  rmSync(build);
  const removed = snapshot(directory);
  assert.deepEqual(syncCppModules(plan, directory, true), [build]);
  assert.deepEqual(snapshot(directory), removed);
  assert.deepEqual(syncCppModules(plan, directory), [build]);
  assert.equal(readFileSync(build, 'utf8'), generated);
  const clean = snapshot(directory);
  assert.deepEqual(syncCppModules(plan, directory), []);
  assert.deepEqual(snapshot(directory), clean);
});

test('handwritten BUILD files, including customized generated packages and scaffold implementations, stay byte-identical', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['manual', 'scaffold', 'customized', 'marker_only', 'legacy']);
  const plan = planCppModules({ modules, roots: Object.keys(modules),
    generate: target => bindings(target.module.name) });
  put(path.join(directory, 'legacy/cpp/BUILD'), '# User-owned BUILD without a .bazel extension.\n');
  syncCppModules(plan, directory);
  assert.equal(existsSync(path.join(directory, 'legacy/cpp/BUILD.bazel')), false);
  const customized = path.join(directory, 'customized/cpp/BUILD.bazel');
  put(customized, readFileSync(customized, 'utf8').split('\n').slice(1).join('\n'));
  put(path.join(directory, 'manual/cpp/BUILD.bazel'),
    '# Generated by tools/valdi-rolldown/codegen.ts --cpp-modules-out; do not edit.\n# User-owned package.\n');
  put(path.join(directory, 'marker_only/cpp/BUILD.bazel'),
    '# Binding-only package managed by --cpp-modules-out.\n# User-owned package.\n');
  put(path.join(directory, 'scaffold/cpp/BUILD.bazel'), cppModuleFiles('scaffold', 'Scaffold').get('cpp/BUILD.bazel')!);
  put(path.join(directory, 'scaffold/cpp/src/Cpp.cpp'), cppModuleFiles('scaffold', 'Scaffold').get('cpp/src/Cpp.cpp')!);
  const before = snapshot(directory);
  assert.deepEqual(syncCppModules(plan, directory, true), []);
  assert.deepEqual(syncCppModules(plan, directory), []);
  assert.deepEqual(snapshot(directory), before);
  const empty = planCppModules({ modules: {}, availableModules: Object.keys(modules) });
  syncCppModules(empty, directory);
  for (const [file, state] of Object.entries(before)) {
    if (file.endsWith('/BUILD.bazel') || file.endsWith('/BUILD') || file.includes('/cpp/src/')) {
      assert.deepEqual(snapshot(directory)[file], state);
    }
  }
});

test('stale cleanup removes only marked binding-only BUILDs outside the plan and preserves source and other files', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['keep', 'disabled', 'removed', 'implemented']);
  const plan = planCppModules({ modules, roots: Object.keys(modules), generate: target => bindings(target.module.name) });
  syncCppModules(plan, directory);
  put(path.join(directory, 'implemented/cpp/src/deep/main.cxx'), '// added after generation\n');
  put(path.join(directory, 'implemented/cpp/src/deep/main.hpp'));
  put(path.join(directory, 'removed/cpp/generated/notes.txt'));
  put(path.join(directory, 'removed/cpp/notes.txt'));
  put(path.join(directory, 'removed/BUILD.bazel'));
  const reduced = planCppModules({ modules: catalog(directory, ['keep']), availableModules: ['keep', 'disabled'],
    roots: ['keep'], generate: target => bindings(target.module.name) });
  const before = snapshot(directory);
  const differences = syncCppModules(reduced, directory, true);
  const staleBuilds = differences.filter(file => file.includes('BUILD.bazel'));
  assert.deepEqual(staleBuilds, ['disabled', 'removed'].map(name =>
    `${path.join(directory, name, 'cpp/BUILD.bazel')} (stale binding-only C++ package; remove)`));
  assert.deepEqual(snapshot(directory), before);
  assert.deepEqual(syncCppModules(reduced, directory), differences);
  for (const name of ['disabled', 'removed']) assert.equal(existsSync(path.join(directory, name, 'cpp/BUILD.bazel')), false);
  const after = snapshot(directory);
  for (const file of [
    'keep/cpp/BUILD.bazel', 'implemented/cpp/BUILD.bazel', 'implemented/cpp/src/deep/main.cxx',
    'implemented/cpp/src/deep/main.hpp', 'removed/cpp/generated/notes.txt', 'removed/cpp/notes.txt', 'removed/BUILD.bazel',
  ]) assert.deepEqual(after[file], before[file]);
  assert.deepEqual(syncCppModules(reduced, directory, true), []);
});

test('adding implementations to a generated binding-only package makes it a native root with active source and header globs', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['types']);
  const generate = (target: CodegenModule) => bindings(target.module.name);
  const initial = planCppModules({ modules, roots: ['types'], generate });
  syncCppModules(initial, directory);
  const build = path.join(directory, 'types/cpp/BUILD.bazel');
  const before = snapshot(directory)['types/cpp/BUILD.bazel'];
  assert.deepEqual(initial.implementationRoots, []);
  for (const extension of ['cpp', 'cc', 'cxx']) put(path.join(directory, `types/cpp/src/deep/main.${extension}`));
  for (const extension of ['h', 'hpp']) put(path.join(directory, `types/cpp/src/deep/main.${extension}`));
  const plan = planCppModules({ modules, generate });
  assert.deepEqual(plan.roots, ['types']);
  assert.deepEqual(plan.implementationRoots, ['types']);
  assert.deepEqual(syncCppModules(plan, directory, true), [path.join(directory, 'runtime-cpp.bzl')]);
  syncCppModules(plan, directory);
  assert.match(readFileSync(path.join(directory, 'runtime-cpp.bzl'), 'utf8'),
    /CPP_IMPLEMENTATIONS = \[\n    "\/\/modules\/types\/cpp:native",\n\]/);
  // Evaluate the emitted macro arguments against the actual fixture files without running a native build.
  const content = readFileSync(build, 'utf8');
  for (const [attribute, extensions] of [['srcs', ['cpp', 'cc', 'cxx']], ['hdrs', ['h', 'hpp']]] as const) {
    const patterns = JSON.parse(content.match(new RegExp(`${attribute} = glob\\((\\[[^\\]]+\\]), allow_empty = True\\)`))![1]) as string[];
    const files = globSync(patterns, { cwd: path.dirname(build) });
    assert.deepEqual(files.sort(), extensions.map(extension => `src/deep/main.${extension}`).sort());
  }
  assert.deepEqual(snapshot(directory)['types/cpp/BUILD.bazel'], before);
  assert.deepEqual(syncCppModules(plan, directory, true), []);
});

test('empty binding placeholders are omitted and old owned files are removed', t => {
  const directory = temporary(t);
  const modules = catalog(directory, ['empty']);
  const plan = planCppModules({ modules, roots: ['empty'], generate: () => bindings('empty', '', '') });
  assert.equal(plan.modules[0].files.size, 0);
  const output = path.join(directory, 'out');
  put(path.join(output, 'empty/cpp/generated/valdi_modules/empty/empty.hpp'), 'obsolete');
  assert.equal(syncCppModules(plan, output, true).length, 4);
  assert.equal(syncCppModules(plan, output).length, 4);
  assert.deepEqual(syncCppModules(plan, output), []);
});

test('real app_pages codegen requires only app_foundation when pages owns a C++ implementation', t => {
  const directory = temporary(t);
  const modules = codegenModules();
  const calls: string[] = [];
  const cache = new Map<string, NativeCode>();
  const generate = (target: CodegenModule) => {
    calls.push(target.module.name);
    const code = generateNativeCode(target);
    cache.set(target.module.name, code);
    return code;
  };
  const plan = planCppModules({ modules, availableModules: availableModuleNames(path.resolve(import.meta.dirname, '../..')), generate });
  assert.deepEqual(plan.roots, ['app_pages']);
  assert.deepEqual(plan.modules.map(({ name, dependencies }) => ({ name, dependencies })), [
    { name: 'app_foundation', dependencies: [] },
    { name: 'app_pages', dependencies: ['app_foundation'] },
  ]);
  assert.deepEqual(calls, ['app_pages', 'app_foundation']);
  const output = path.join(directory, 'output');
  assert.equal(syncCppModules(plan, output).length, 8);
  for (const module of plan.modules) {
    for (const [file, content] of nativeSourceFiles(modules[module.name], cache.get(module.name)!, 'cpp')) {
      assert.equal(readFileSync(path.join(output, module.name, 'cpp/generated', file), 'utf8'), content);
    }
  }
  assert.deepEqual(syncCppModules(plan, output, true), []);
  assert.equal(existsSync(path.join(output, 'app_ui')), false);
  assert.equal(existsSync(path.join(output, 'app_video')), false);
  assert.equal(existsSync(path.join(output, 'app_vision')), false);
});

test('positional CLI creates pure TS dependency packages while preserving both independent implementation owners', t => {
  const directory = temporary(t);
  const tool = path.join(directory, 'tools/valdi-rolldown');
  mkdirSync(tool, { recursive: true });
  // Copy the entry points that derive the project root, and the real backend that imports that pipeline.
  for (const name of ['codegen.ts', 'cpp-modules.ts', 'pipeline.ts', 'hermes.ts', 'codegen']) {
    cpSync(path.join(import.meta.dirname, name), path.join(tool, name), { recursive: true });
  }
  for (const name of ['package.json', 'node_modules', 'modules.mjs', 'valdiTs.ts',
    'module-selection.ts', 'editor-config.ts', 'vendor']) {
    symlinkSync(path.join(import.meta.dirname, name), path.join(tool, name));
  }
  const output = path.join(directory, 'valdi/modules');
  put(path.join(directory, 'package.json'), JSON.stringify({ valdi: { modules: ['first', 'second', 'extra', 'types'] } }));
  for (const name of ['first', 'second', 'extra', 'types']) {
    put(path.join(output, name, 'src/index.ts'),
      '/** @ExportModel */\nexport interface Value { readonly value: number; }\n');
    put(path.join(output, name, 'tsconfig.json'), JSON.stringify({
      include: ['src/**/*.ts'],
      compilerOptions: { paths: { 'types/*': ['../types/*'] } },
    }));
  }
  put(path.join(output, 'first/src/index.ts'), [
    "import { Value as SharedValue } from 'types/src';",
    '/** @ExportModel */',
    'export interface Value { readonly shared: SharedValue; }',
    '',
  ].join('\n'));
  put(path.join(output, 'first/cpp/BUILD.bazel'), cppModuleFiles('first', 'First').get('cpp/BUILD.bazel')!);
  put(path.join(output, 'first/cpp/src/main.cpp'), 'int first() { return 1; }\n');
  put(path.join(output, 'second/cpp/src/deep/main.cc'), 'int second() { return 2; }\n');
  put(path.join(output, 'second/module.json'), JSON.stringify({ nativeBuild: 'bazel' }));
  const run = (args: string[]) => spawnSync(process.execPath, [
    path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs'),
    path.join(tool, 'codegen.ts'), ...args, '--cpp-modules-out', output,
  ], { cwd: tool, encoding: 'utf8', timeout: 60_000 });
  const generatedFile = (name: string, extension: string) =>
    path.join(output, name, `cpp/generated/valdi_modules/${name}/${name}.${extension}`);
  const initial = run([]);
  assert.equal(initial.status, 0, initial.stderr);
  const registry = path.join(output, 'runtime-cpp.bzl');
  const initialRegistry = readFileSync(registry, 'utf8');
  assert.match(initialRegistry, /CPP_IMPLEMENTATIONS = \[\n    "\/\/modules\/first\/cpp:native",\n    "\/\/modules\/second\/cpp:native",\n\]/);
  assert.match(initialRegistry, /"first": \[\n        "\/\/modules\/types\/cpp:bindings",\n    \],/);
  for (const name of ['first', 'second', 'types']) {
    for (const extension of ['hpp', 'cpp']) assert.ok(existsSync(generatedFile(name, extension)));
    assert.ok(existsSync(path.join(output, name, 'cpp/BUILD.bazel')));
  }
  assert.equal(readFileSync(path.join(output, 'first/cpp/BUILD.bazel'), 'utf8'),
    cppModuleFiles('first', 'First').get('cpp/BUILD.bazel'));
  assert.match(readFileSync(path.join(output, 'types/cpp/BUILD.bazel'), 'utf8'), /module_name = "types"/);
  assert.doesNotMatch(initialRegistry, /types\/cpp:native/);
  assert.equal(existsSync(generatedFile('extra', 'hpp')), false);
  const before = snapshot(output);
  const check = run(['first', '--check']);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout, '');
  assert.deepEqual(snapshot(output), before);
  const dependencyBuild = path.join(output, 'types/cpp/BUILD.bazel');
  rmSync(dependencyBuild);
  const missingPackage = snapshot(output);
  const missingCheck = run(['first', '--check']);
  assert.equal(missingCheck.status, 1, missingCheck.stderr);
  assert.match(missingCheck.stderr, /types\/cpp\/BUILD\.bazel/);
  assert.deepEqual(snapshot(output), missingPackage);
  const repairPackage = run(['first']);
  assert.equal(repairPackage.status, 0, repairPackage.stderr);
  // The recreated package has a new mtime; retain the repaired baseline for subsequent no-write checks.
  before['types/cpp/BUILD.bazel'] = snapshot(output)['types/cpp/BUILD.bazel'];
  const flat = path.join(directory, 'flat');
  const scoped = run(['first', '--cpp-out', flat]);
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.deepEqual(snapshot(output), before);
  assert.deepEqual(Object.keys(snapshot(flat)), [
    'valdi_modules/first/first.cpp', 'valdi_modules/first/first.hpp',
  ]);
  const additional = run(['extra']);
  assert.equal(additional.status, 0, additional.stderr);
  const explicitRegistry = readFileSync(registry, 'utf8');
  assert.equal(explicitRegistry.split('CPP_BINDING_DEPS')[0], initialRegistry.split('CPP_BINDING_DEPS')[0]);
  assert.match(explicitRegistry, /"extra": \[/);
  assert.doesNotMatch(explicitRegistry, /extra\/cpp:native/);
  for (const name of ['first', 'second', 'extra', 'types']) {
    for (const extension of ['hpp', 'cpp']) assert.ok(existsSync(generatedFile(name, extension)));
  }
  const after = snapshot(output);
  for (const [file, state] of Object.entries(before)) {
    if (file !== 'runtime-cpp.bzl') assert.deepEqual(after[file], state);
  }
});

test('CLI combines module C++, generic flat C++, Kotlin and ObjC, and reports read-only check recovery', t => {
  const directory = temporary(t);
  const out = path.join(directory, 'modules');
  const args = ['app_pages', '--cpp-modules-out', out,
    '--cpp-out', path.join(directory, 'flat'),
    '--kotlin-out', path.join(directory, 'kotlin'),
    '--objc-out', path.join(directory, 'objc'), '--objc-framework', 'ValdiRuntime'];
  const run = (extra: string[] = []) => spawnSync(process.execPath, [
    path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs'),
    path.join(import.meta.dirname, 'codegen.ts'), ...args, ...extra,
  ], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 60_000 });
  const missing = run(['--check']);
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /run: npx tsx codegen\.ts app_pages --kotlin-out .*--cpp-modules-out /);
  assert.equal(existsSync(out), false);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const config = path.join(out, 'runtime-packages.bazelrc');
  const available = availableModuleNames(path.resolve(import.meta.dirname, '../..'));
  assert.equal(readFileSync(config, 'utf8').split('\n')[2],
    `common --deleted_packages=${available.map(name => `modules/${name}`).join(',')}`);
  assert.equal(existsSync(path.join(directory, 'flat/runtime-packages.bazelrc')), false);
  assert.equal(existsSync(path.join(directory, 'flat/runtime-cpp.bzl')), false);
  for (const extension of ['hpp', 'cpp']) {
    assert.equal(readFileSync(path.join(out, `app_pages/cpp/generated/valdi_modules/app_pages/app_pages.${extension}`), 'utf8'),
      readFileSync(path.join(directory, `flat/valdi_modules/app_pages/app_pages.${extension}`), 'utf8'));
  }
  assert.ok(existsSync(path.join(out, 'app_foundation/cpp/generated/valdi_modules/app_foundation/app_foundation.hpp')));
  assert.match(readFileSync(path.join(directory, 'kotlin/app_pages.kt'), 'utf8'), /CppStats/);
  assert.match(readFileSync(path.join(directory, 'objc/app_pagesTypes/app_pagesTypes.h'), 'utf8'), /ValdiRuntime\//);
  assert.equal(existsSync(path.join(directory, 'flat/valdi_modules/app_foundation')), false);
  const expectedConfig = readFileSync(config, 'utf8');
  for (const staleConfig of [undefined, '# obsolete runtime config\n']) {
    if (staleConfig === undefined) rmSync(config);
    else put(config, staleConfig);
    const before = snapshot(directory);
    const check = run(['--check']);
    assert.equal(check.status, 1, check.stderr);
    assert.match(check.stderr, /runtime-packages\.bazelrc/);
    assert.deepEqual(snapshot(directory), before);
    const repair = run();
    assert.equal(repair.status, 0, repair.stderr);
    assert.equal(readFileSync(config, 'utf8'), expectedConfig);
  }
  const stale = path.join(out, 'app_video/cpp/generated/valdi_modules/app_video/app_video.hpp');
  put(stale, 'stale');
  const header = path.join(out, 'app_pages/cpp/generated/valdi_modules/app_pages/app_pages.hpp');
  put(header, 'changed');
  const before = snapshot(directory);
  const check = run(['--check']);
  assert.equal(check.status, 1, check.stderr);
  assert.match(check.stderr, /stale C\+\+ bindings; remove/);
  assert.deepEqual(snapshot(directory), before);
  const repair = run();
  assert.equal(repair.status, 0, repair.stderr);
  const repaired = snapshot(directory);
  const unchanged = run();
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.equal(unchanged.stdout, '');
  assert.deepEqual(snapshot(directory), repaired);
  const clean = run(['--check']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, '');
  assert.deepEqual(snapshot(directory), repaired);
});
