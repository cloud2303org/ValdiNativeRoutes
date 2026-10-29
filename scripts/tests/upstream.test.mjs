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
  write('valdi/MODULE.bazel', 'VALDI_TAG = "old"\nWIDGETS_TAG = "widgets-old"\n# local patches stay here\n');
  write('valdi/.bazelrc', 'common --registry=https://raw.githubusercontent.com/Snapchat/Valdi/old/registry\nbuild --valdi_js_engine=hermes\n');
  return { root, write, read: name => readFileSync(path.join(root, name), 'utf8') };
}

test('an explicit upgrade changes Valdi and registry together while preserving Widgets and custom settings', t => {
  const { root, read } = fixture(t);
  pinValdi(root, 'beta-0.3.0');
  assert.equal(read('valdi/MODULE.bazel'), 'VALDI_TAG = "beta-0.3.0"\nWIDGETS_TAG = "widgets-old"\n# local patches stay here\n');
  assert.equal(read('valdi/.bazelrc'), 'common --registry=https://raw.githubusercontent.com/Snapchat/Valdi/beta-0.3.0/registry\nbuild --valdi_js_engine=hermes\n');
  pinValdi(root, 'beta-0.3.0', 'widgets-new');
  assert.match(read('valdi/MODULE.bazel'), /WIDGETS_TAG = "widgets-new"/);
});

test('invalid tags and an ambiguous registry cannot leave a half-updated version pin', t => {
  const { root, write, read } = fixture(t);
  const before = read('valdi/MODULE.bazel');
  assert.throws(() => pinValdi(root, '../../main'), /explicit upstream tag/);
  assert.equal(read('valdi/MODULE.bazel'), before);
  write('valdi/.bazelrc', '# missing registry\n');
  assert.throws(() => pinValdi(root, 'candidate'), /unique Valdi tag and registry/);
  assert.equal(read('valdi/MODULE.bazel'), before);
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
