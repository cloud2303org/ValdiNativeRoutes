import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pack, unpack } from './archive';
import { precompile } from './hermes';

const tool = import.meta.dirname;
const tsx = path.join(tool, 'node_modules/tsx/dist/cli.mjs');
const run = (args: string[]) => spawnSync(process.execPath, [tsx, path.join(tool, 'build.ts'), ...args], {
  cwd: tool, encoding: 'utf8', env: { ...process.env, BAZEL_BIN: 'must-not-run-bazel-for-invalid-options' },
});

test('removed comparison and unknown options fail before changing outputs or starting a build', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-build-options-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marker = path.join(dir, 'app_pages.valdimodule');
  writeFileSync(marker, 'untouched');
  for (const option of ['--compare', '--unknown']) {
    const result = run([option, '--out', dir]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(`Unknown build option: ${option}`), result.stderr);
    assert.doesNotMatch(result.stderr, /must-not-run-bazel/);
    assert.equal(readFileSync(marker, 'utf8'), 'untouched');
  }
});

test('base compilation and module selection reject invalid options before changing outputs', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-build-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marker = path.join(dir, 'permissions.valdimodule');
  writeFileSync(marker, 'untouched');
  const base = path.join(dir, 'bad.valdimodule');
  writeFileSync(base, 'not an archive');
  for (const args of [
    ['--module'],
    ['--module', 'not_enabled'],
    ['--hermes-base', base],
    ['--release', '--hermes-base', base],
    ['--release', '--module', 'app_pages', '--hermes-base', base],
    ['--release', '--module', 'calculator', '--hermes-base', base],
    ['--native-platform', 'web'],
    ['--native-platform', 'android'],
    ['--native-platform', 'ios', '--module', 'app_pages'],
  ]) {
    const result = run([...args, '--out', dir]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /module|base|archive|Zstd|ZSTD|zstd|magic|native-platform/i);
    assert.doesNotMatch(result.stderr, /must-not-run-bazel/);
    assert.equal(readFileSync(marker, 'utf8'), 'untouched');
    assert.equal(existsSync(path.join(dir, 'app_pages.valdimodule')), false);
  }
});

test('one-module Release build uses its HBC base without rebuilding native modules or deleting siblings', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-build-one-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marker = path.join(dir, 'permissions.valdimodule');
  writeFileSync(marker, 'keep the sibling archive');
  const baseEntries = new Map([['src/features/home/HomePage.js', Buffer.from('exports.previous = "baseline-only-marker-7";')]]);
  await precompile(baseEntries);
  const base = path.join(dir, 'base.valdimodule');
  writeFileSync(base, pack(baseEntries));
  const result = run(['--release', '--module', 'app_pages', '--hermes-base', base, '--out', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /custom module rule/);
  assert.equal(readFileSync(marker, 'utf8'), 'keep the sibling archive');
  const entries = unpack(readFileSync(path.join(dir, 'app_pages.valdimodule')));
  assert.ok(entries.get('src/features/home/HomePage.js')!.includes(Buffer.from('baseline-only-marker-7')));
  assert.ok(existsSync(path.join(dir, 'app_pages.map.json')));
});
