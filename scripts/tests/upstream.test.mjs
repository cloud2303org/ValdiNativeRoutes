import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pinValdi, vendorReport } from '../upstream.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdiroutes-upstream-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  write('valdi/MODULE.bazel', `VALDI_REPOSITORY = "ExampleOrg/Valdi"\nVALDI_COMMIT = "${'a'.repeat(40)}"\nWIDGETS_TAG = "widgets-old"\n# application overrides stay here\n`);
  write('valdi/.bazelrc', `common:macos --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${'a'.repeat(40)}/registry\ncommon:linux --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${'a'.repeat(40)}/registry\ncommon:windows --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${'a'.repeat(40)}/registry\ncommon --registry=https://bcr.bazel.build\nbuild --valdi_js_engine=hermes\n`);
  write('module-build/MODULE.bazel', `VALDI_REPOSITORY = "ExampleOrg/Valdi"\nVALDI_COMMIT = "${'a'.repeat(40)}"\n`);
  write('module-build/.bazelrc', `common:macos --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${'a'.repeat(40)}/registry\ncommon:linux --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${'a'.repeat(40)}/registry\ncommon:windows --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${'a'.repeat(40)}/registry\n`);
  return { root, write, read: name => readFileSync(path.join(root, name), 'utf8') };
}

test('a fork commit update keeps source and registry together while preserving Widgets and app settings', t => {
  const { root, read } = fixture(t);
  const commit = 'b'.repeat(40);
  pinValdi(root, commit);
  assert.equal(read('valdi/MODULE.bazel'), `VALDI_REPOSITORY = "ExampleOrg/Valdi"\nVALDI_COMMIT = "${commit}"\nWIDGETS_TAG = "widgets-old"\n# application overrides stay here\n`);
  assert.equal(read('valdi/.bazelrc'), `common:macos --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${commit}/registry\ncommon:linux --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${commit}/registry\ncommon:windows --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${commit}/registry\ncommon --registry=https://bcr.bazel.build\nbuild --valdi_js_engine=hermes\n`);
  assert.equal(read('module-build/MODULE.bazel'), `VALDI_REPOSITORY = "ExampleOrg/Valdi"\nVALDI_COMMIT = "${commit}"\n`);
  assert.equal(read('module-build/.bazelrc'), `common:macos --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${commit}/registry\ncommon:linux --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${commit}/registry\ncommon:windows --registry=https://raw.githubusercontent.com/ExampleOrg/Valdi/${commit}/registry\n`);
  pinValdi(root, commit, 'widgets-new');
  assert.match(read('valdi/MODULE.bazel'), /WIDGETS_TAG = "widgets-new"/);
});

test('mutable refs, invalid inputs and mismatched registry pins cannot leave a half-updated pin', t => {
  const { root, write, read } = fixture(t);
  const before = read('valdi/MODULE.bazel');
  const registry = read('valdi/.bazelrc');
  const moduleBuildRegistry = read('module-build/.bazelrc');
  for (const ref of ['main', 'beta-0.3.0', '../../main', 'a'.repeat(39)]) {
    assert.throws(() => pinValdi(root, ref), /immutable 40-character/);
    assert.equal(read('valdi/MODULE.bazel'), before);
    assert.equal(read('valdi/.bazelrc'), registry);
  }
  assert.throws(() => pinValdi(root, 'b'.repeat(40), '../../widgets'), /explicit Widgets tag/);
  for (const invalid of ['# missing registry\n', registry.replace('ExampleOrg', 'DifferentOrg'), registry.replace('a'.repeat(40), 'c'.repeat(40))]) {
    write('valdi/.bazelrc', invalid);
    assert.throws(() => pinValdi(root, 'b'.repeat(40)), /Valdi (?:fork|registry) pins/);
    assert.equal(read('valdi/MODULE.bazel'), before);
    assert.equal(read('valdi/.bazelrc'), invalid);
  }
  write('valdi/.bazelrc', registry);
  write('module-build/.bazelrc', moduleBuildRegistry.replace('ExampleOrg', 'DifferentOrg'));
  assert.throws(() => pinValdi(root, 'b'.repeat(40)), /registry pins in module-build/);
  assert.equal(read('valdi/MODULE.bazel'), before);
});

test('an absent Widgets declaration rejects an explicit Widgets update before either file is written', t => {
  const { root, write, read } = fixture(t);
  const module = read('valdi/MODULE.bazel').replace('WIDGETS_TAG = "widgets-old"\n', '');
  const registry = read('valdi/.bazelrc');
  write('valdi/MODULE.bazel', module);
  assert.throws(() => pinValdi(root, 'b'.repeat(40), 'widgets-new'), /Cannot locate the Widgets tag/);
  assert.equal(read('valdi/MODULE.bazel'), module);
  assert.equal(read('valdi/.bazelrc'), registry);
});

test('vendor reports normalize our ESM import adaptation but expose source changes and removed files', t => {
  const { root, write, read } = fixture(t);
  write('tools/valdi-rolldown/vendor/companion/AST.ts', "import ts from 'typescript';\nexport const version = 1;\n");
  write('tools/valdi-rolldown/vendor/companion/source-map.d.ts', '// local declarations\n');
  write('tools/valdi-rolldown/vendor/companion/Removed.ts', 'export const removed = 1;\n');
  write('upstream/compiler/companion/src/AST.ts', "import * as ts from 'typescript';\nexport const version = 1;\n");
  write('upstream/compiler/companion/src/Removed.ts', 'export const removed = 1;\n');
  const source = path.join(root, 'upstream');
  const output = path.join(root, 'report');
  assert.equal(vendorReport(root, source, output), 0);
  write('upstream/compiler/companion/src/AST.ts', "import * as ts from 'typescript';\nexport const version = 2;\n");
  rmSync(path.join(root, 'upstream/compiler/companion/src/Removed.ts'));
  assert.equal(vendorReport(root, source, output), 2);
  assert.match(read('report/vendor.md'), /CHANGED: companion\/AST.ts/);
  assert.match(read('report/vendor.md'), /MISSING upstream: companion\/Removed.ts/);
  assert.match(read('report/upstream/companion/AST.ts.diff'), /\+export const version = 2/);
  assert.match(read('tools/valdi-rolldown/vendor/companion/AST.ts'), /version = 1/);
});
