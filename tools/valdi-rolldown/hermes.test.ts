import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compilerBytecodeVersion, formatJsModule, hermesCompiler, precompile, validateRuntimeContract } from './hermes';

test('accepts the pinned Linux and Windows compiler banners while rejecting unknown mismatches', () => {
  const release = '260318099.0.4';
  const banner = (version: string, bytecode = '99') =>
    `Hermes JavaScript compiler.\n  Hermes release version: ${version}\n  HBC bytecode version: ${bytecode}\n`;
  assert.equal(compilerBytecodeVersion(banner(release), release, 'darwin'), 99);
  assert.equal(compilerBytecodeVersion(banner('1.0.0'), release, 'linux'), 99);
  assert.equal(compilerBytecodeVersion(banner('1.0.0'), release, 'win32'), 99);
  for (const [info, expected, platform] of [
    [banner('1.0.0'), release, 'darwin'],
    [banner('1.0.0', '100'), release, 'linux'],
    [banner('1.0.0', '100'), release, 'win32'],
    [banner('1.0.0'), '260318099.0.5', 'win32'],
    [banner('1.0.0'), '260318099.0.5', 'linux'],
    [banner('2.0.0'), release, 'linux'],
    [banner(release, '0'), release, 'linux'],
    [banner(release, 'missing'), release, 'linux'],
    ['HBC bytecode version: 99', release, 'linux'],
  ] as const) {
    assert.throws(() => compilerBytecodeVersion(info, expected, platform), /Unexpected Hermes compiler version/);
  }
});

test('official compiler emits a Valdi-wrapped factory and leaves other archive entries intact', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hermes-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
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
  assert.equal(entries.get('sample/index.js'), result);
});

test('already-compiled modules reject truncated or corrupt HBC headers and incompatible versions', async t => {
  const name = 'nested/module/index.js';
  const compiled = new Map([[name, Buffer.from('exports.answer = 42;')]]);
  await precompile(compiled);
  const valid = compiled.get(name)!;
  const invalid: [string, Buffer][] = [];
  // Keep the Valdi marker intact while truncating every part of the required
  // HBC magic/version header, including the Valdi-marker-only case.
  for (let length = 4; length < 16; length++) {
    invalid.push([`truncated to ${length} bytes`, valid.subarray(0, length)]);
  }
  const badMagic = Buffer.from(valid);
  badMagic[4] ^= 0xff;
  invalid.push(['corrupt HBC magic', badMagic]);
  const badVersion = Buffer.from(valid);
  badVersion.writeUInt32LE(valid.readUInt32LE(12) + 1, 12);
  invalid.push(['incompatible HBC version', badVersion]);
  for (const [label, data] of invalid) {
    await t.test(label, async () => {
      const entries = new Map([[name, data]]);
      await assert.rejects(precompile(entries), error => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Unexpected Hermes bytecode format/);
        assert.ok(error.message.includes(name));
        return true;
      });
      assert.equal(entries.get(name), data);
    });
  }
  // Validate existing bytecode before scheduling any fresh compilation, too.
  const source = Buffer.from('exports.fresh = true;');
  const mixed = new Map([['fresh.js', source], [name, badVersion]]);
  await assert.rejects(precompile(mixed), /Unexpected Hermes bytecode format/);
  assert.equal(mixed.get('fresh.js'), source);
});

test('resource-only and empty archives do not require the compiler or runtime sources', async () => {
  const previous = process.env.VALDI_SOURCE_ROOT;
  process.env.VALDI_SOURCE_ROOT = path.join(tmpdir(), 'missing-valdi-hermes-runtime');
  try {
    const resource = Buffer.from([0x34, 0xc6, 0x00, 0x01]);
    const entries = new Map([['res/catalog', resource]]);
    await precompile(entries);
    assert.equal(entries.get('res/catalog'), resource);
    await precompile(new Map());
  } finally {
    if (previous === undefined) delete process.env.VALDI_SOURCE_ROOT;
    else process.env.VALDI_SOURCE_ROOT = previous;
  }
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
  const name = 'feature/nested/invalid.js';
  const entries = new Map([[name, source]]);
  await assert.rejects(precompile(entries), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes(name));
    const cause = error.cause as Error & { stderr: string; code: number };
    assert.ok(cause instanceof Error);
    assert.ok(cause.code !== 0);
    assert.match(cause.stderr, /error:/);
    assert.ok(error.message.includes(cause.message));
    assert.ok(error.message.includes(cause.stderr.trim()));
    return true;
  });
  assert.equal(entries.get(name), source);
});

test('base compilation matches the official compiler and leaves new files on the normal path', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hermes-base-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const name = 'src/page.js';
  const previous = new Map([[name, Buffer.from('"use strict";\nexports.value = { removed: "old-only-string", stable: "kept" };')]]);
  await precompile(previous);
  const source = '"use strict";\nexports.value = { stable: "kept", added: "new-string" };';
  const fresh = 'exports.newPage = "added page";';
  const target = new Map([[name, Buffer.from(source)], ['src/new.js', Buffer.from(fresh)]]);
  await precompile(target, { baseArchive: previous });
  const input = path.join(dir, 'reference.js');
  const base = path.join(dir, 'previous.hbc');
  const output = path.join(dir, 'reference.hbc');
  writeFileSync(input, formatJsModule(source));
  writeFileSync(base, previous.get(name)!.subarray(4));
  execFileSync(hermesCompiler().executable, [
    '-emit-binary', '-O', '-strict', '-Xes6-block-scoping', '-fno-static-builtins',
    '-fstrip-function-names', '-g0', '-emit-async-break-check',
    `-base-bytecode=${base}`, '-out', output, input,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.deepEqual(target.get(name)!.subarray(4), readFileSync(output));
  const normal = new Map([[name, Buffer.from(source)], ['src/new.js', Buffer.from(fresh)]]);
  await precompile(normal);
  assert.notDeepEqual(target.get(name), normal.get(name), 'the old string table must actually participate');
  assert.deepEqual(target.get('src/new.js'), normal.get('src/new.js'));
  assert.equal(previous.get(name)!.readBigUInt64LE(4), 0x1f1903c103bc1fc6n);
});

test('incompatible or non-Release base entries fail before replacing any target source', async () => {
  const name = 'src/page.js';
  const old = new Map([[name, Buffer.from('exports.value = 1;')]]);
  await precompile(old);
  const badVersion = Buffer.from(old.get(name)!);
  badVersion.writeUInt32LE(badVersion.readUInt32LE(12) + 1, 12);
  for (const bytes of [Buffer.from('exports.debug = true;'), badVersion, old.get(name)!.subarray(0, 8)]) {
    const source = Buffer.from('exports.value = 2;');
    const target = new Map([[name, source], ['src/new.js', Buffer.from('exports.newPage = 1;')]]);
    await assert.rejects(precompile(target, { baseArchive: new Map([[name, bytes]]) }), /base|bytecode/i);
    assert.equal(target.get(name), source);
  }
});

test('upstream module protocol drift is rejected before emitting Release bytecode', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hermes-contract-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  // The workspace's bazel-valdi link points into an execroot, so CI names the fork checkout.
  const upstream = process.env.VALDI_SOURCE_ROOT ?? path.resolve(import.meta.dirname, '../../valdi/bazel-valdi/external/valdi+');
  const config = path.join(dir, 'valdi/bazel-valdi/external/valdi+/third-party/hermes_v1/hermes.BUILD');
  const source = path.join(dir, 'valdi/bazel-valdi/external/valdi+/valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp');
  mkdirSync(path.dirname(config), { recursive: true });
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(config, readFileSync(path.join(upstream, 'third-party/hermes_v1/hermes.BUILD')));
  const original = readFileSync(path.join(upstream, 'valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp'), 'utf8');
  writeFileSync(source, original.replace('0x0100C634', '0x0100C635'));
  // The fixture's own Valdi sources must win here; CI exports VALDI_SOURCE_ROOT for the
  // other tests, and it otherwise takes precedence over the directory argument.
  const previous = process.env.VALDI_SOURCE_ROOT;
  delete process.env.VALDI_SOURCE_ROOT;
  try {
    assert.throws(() => validateRuntimeContract(dir), /protocol changed/);
  } finally {
    if (previous !== undefined) process.env.VALDI_SOURCE_ROOT = previous;
  }
});
