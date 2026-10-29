import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatJsModule, hermesCompiler, precompile, validateRuntimeContract } from './hermes';

test('official compiler emits a Valdi-wrapped factory and leaves other archive entries intact', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hermes-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = '"use strict";\nexports.answer = 6 * 7;';
  const resource = Buffer.from('resource bytes');
  const entries = new Map([['sample/index.js', Buffer.from(source)], ['res/catalog', resource]]);
  await precompile(entries);
  const result = entries.get('sample/index.js')!;
  assert.equal(result.readUInt32LE(0), 0x0100c634);
  assert.equal(result.readBigUInt64LE(4), 0x1f1903c103bc1fc6n);
  const { executable, bytecodeVersion } = hermesCompiler();
  assert.equal(result.readUInt32LE(12), bytecodeVersion);
  assert.deepEqual(result.subarray(16, 36), createHash('sha1').update(formatJsModule(source)).digest());
  const file = path.join(dir, 'sample.hbc');
  writeFileSync(file, result.subarray(4));
  const disassembly = execFileSync(executable, ['-dump-bytecode', file], { encoding: 'utf8' });
  assert.match(disassembly, /CreateClosure/);
  assert.match(disassembly, /answer/);
  assert.match(disassembly, /Ret\s+r/);
  assert.deepEqual(entries.get('res/catalog'), resource);
  await precompile(entries);
  assert.deepEqual(entries.get('sample/index.js'), result);
});

test('non-strict modules retain Valdi source-map line offset setup', async () => {
  const source = 'exports.value = 1;';
  assert.match(formatJsModule(source), /^\(function\(require, module, exports\) \{ if \(module\) module.sourceMapLineOffset = 1;\n/);
  const entries = new Map([['plain.js', Buffer.from(source)]]);
  await precompile(entries);
  assert.equal(entries.get('plain.js')!.readUInt32LE(0), 0x0100c634);
});

test('invalid JavaScript fails compilation without replacing the source entry', async () => {
  const source = Buffer.from('exports.value = ;');
  const entries = new Map([['invalid.js', source]]);
  await assert.rejects(precompile(entries));
  assert.deepEqual(entries.get('invalid.js'), source);
});

test('upstream module protocol drift is rejected before emitting Release bytecode', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hermes-contract-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'valdi/bazel-valdi/external/valdi+/third-party/hermes_v1/hermes.BUILD');
  const source = path.join(dir, 'valdi/bazel-valdi/external/valdi+/valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp');
  mkdirSync(path.dirname(config), { recursive: true });
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(config, readFileSync(path.resolve(import.meta.dirname, '../../valdi/bazel-valdi/external/valdi+/third-party/hermes_v1/hermes.BUILD')));
  const original = readFileSync(path.resolve(import.meta.dirname, '../../valdi/bazel-valdi/external/valdi+/valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp'), 'utf8');
  writeFileSync(source, original.replace('0x0100C634', '0x0100C635'));
  assert.throws(() => validateRuntimeContract(dir), /protocol changed/);
});
