import assert from 'node:assert/strict';
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');

test('Bazel declares module localization JSON as action inputs with an optional convention glob', () => {
  const source = readFileSync(path.join(repository, 'module-build/bzl/node_module/module.bzl'), 'utf8');
  assert.match(source, /def node_valdi_module\([\s\S]*?strings = None\):/);
  // An explicit empty list must stay empty; only omission enables the convention.
  assert.match(source, /if strings == None:\s+strings = native\.glob\(\["strings\/strings-\*\.json"\], allow_empty = True\)/);
  assert.match(source, /"strings": attr\.label_list\(allow_files = \["\.json"\]\)/);
  assert.match(source, /inputs = depset\([^\n]*ctx\.files\.strings[^\n]*transitive = \[dep\[NodeValdiModuleInfo\]\.inputs/);
  assert.match(source, /ctx\.actions\.run\(\s+inputs = depset\([^\n]*transitive = \[inputs\]\)/);
  assert.match(source, /NodeValdiModuleInfo\(inputs = inputs,/);
  assert.match(source, /for suffix, release in \[\("_compiled", False\), \("_release", True\)\]:\s+_node_valdi_compiled\([\s\S]*?strings = strings,/);
});

test('Gradle module packaging globs include added, edited and deleted convention JSON files', t => {
  const source = readFileSync(path.join(repository, 'android/app/build.gradle.kts'), 'utf8');
  const task = source.slice(source.indexOf('val modules = tasks.register<ValdiModules>'));
  const includes = task.match(/fileTree\(repo\.resolve\("valdi\/modules"\)\) \{ include\(([^)]+)\) \}/);
  assert.ok(includes, 'ValdiModules must declare module source inputs');
  const patterns = [...includes[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-localization-inputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  // Evaluate the declared patterns against a module fixture, without running Gradle.
  const inputs = () => Object.fromEntries([...globSync(patterns, { cwd: root })]
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => [file.split(path.sep).join('/'), readFileSync(path.join(root, file), 'utf8')]));
  write('plain/src/index.ts', 'export {};');
  write('hello/strings/notes.json', '{}');
  write('hello/strings/nested/strings-fr.json', '{}');
  assert.deepEqual(inputs(), {}, 'modules without convention JSON have no localization inputs');
  write('hello/strings/strings-en.json', '{"title":{"defaultMessage":"Hello"}}');
  const base = inputs();
  assert.deepEqual(Object.keys(base), ['hello/strings/strings-en.json']);
  write('hello/strings/strings-zh-Hans.json', '{"title":{"defaultMessage":"你好"}}');
  assert.deepEqual(Object.keys(inputs()), ['hello/strings/strings-en.json', 'hello/strings/strings-zh-Hans.json']);
  write('hello/strings/strings-en.json', '{"title":{"defaultMessage":"Welcome"}}');
  assert.notEqual(inputs()['hello/strings/strings-en.json'], base['hello/strings/strings-en.json']);
  rmSync(path.join(root, 'hello/strings/strings-zh-Hans.json'));
  assert.deepEqual(Object.keys(inputs()), ['hello/strings/strings-en.json']);
  rmSync(path.join(root, 'hello/strings/strings-en.json'));
  assert.deepEqual(inputs(), {}, 'removing the last locale also changes the input file set');
});

test('Gradle binding checks track the localization sources used by the compiler', () => {
  const source = readFileSync(path.join(repository, 'android/app/build.gradle.kts'), 'utf8');
  const check = source.slice(source.indexOf('val valdiCodegenCheck ='), source.indexOf('tasks.named("preBuild")'));
  assert.match(check, /fileTree\(repo\.resolve\("valdi\/modules"\)\) \{ include\([^)]*"\*\/strings\/strings-\*\.json"/);
  assert.match(check, /fileTree\(tool\) \{ include\([^)]*"localization\.ts"/);
});
