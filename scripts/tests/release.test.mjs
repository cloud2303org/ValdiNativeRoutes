import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as release from '../release.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (name, bytes) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  };
  git('init', '-q');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.invalid');
  write('package.json', JSON.stringify({ private: true, version: '0.1.0', packageManager: 'pnpm@10.32.1' }));
  write('tools/valdi-rolldown/package.json', JSON.stringify({ devDependencies: { 'hermes-compiler': '260318099.0.4' } }));
  for (const dir of ['valdi', 'module-build']) {
    write(`${dir}/MODULE.bazel`, `VALDI_REPOSITORY = "cloud2303org/Valdi"\nVALDI_COMMIT = "${'a'.repeat(40)}"\n`);
  }
  write('.gitignore', 'ota/private.pem\nnode_modules/\n.release/\n');
  write('README.md', 'committed source\n');
  write('scripts/cli.mjs', '// source entry\n');
  git('add', '.');
  git('commit', '-qm', 'Fixture release');
  git('tag', 'v0.1.0');
  return { root, git, write, out: path.join(root, '.release') };
}

test('source release packages the exact tagged snapshot and records its versions', t => {
  assert.equal(typeof release.packRelease, 'function', 'versioned template packaging is missing');
  const { root, git, write, out } = fixture(t);
  write('README.md', 'uncommitted change');
  write('ota/private.pem', 'untracked private fixture');
  write('node_modules/local-only', 'cache');
  const result = release.packRelease({ root, ref: 'v0.1.0', out });
  assert.equal(result.version, '0.1.0');
  assert.equal(result.sourceCommit, git('rev-parse', 'v0.1.0'));
  assert.equal(result.framework.commit, 'a'.repeat(40));
  assert.equal(result.toolchain.hermesCompiler, '260318099.0.4');
  const zip = path.join(out, 'ValdiNativeRoutes-v0.1.0.zip');
  const tar = path.join(out, 'ValdiNativeRoutes-v0.1.0.tar.gz');
  assert.ok(existsSync(zip));
  const listing = execFileSync('tar', ['-tzf', tar], { encoding: 'utf8' });
  assert.match(listing, /ValdiNativeRoutes-v0\.1\.0\/TEMPLATE_RELEASE\.json/);
  assert.doesNotMatch(listing, /private\.pem|node_modules|\.git\//);
  assert.equal(execFileSync('tar', ['-xOzf', tar, 'ValdiNativeRoutes-v0.1.0/README.md'], { encoding: 'utf8' }), 'committed source\n');
  const checksums = readFileSync(path.join(out, 'SHA256SUMS'), 'utf8');
  for (const name of ['ValdiNativeRoutes-v0.1.0.zip', 'ValdiNativeRoutes-v0.1.0.tar.gz', 'TEMPLATE_RELEASE.json']) {
    assert.ok(checksums.includes(`${createHash('sha256').update(readFileSync(path.join(out, name))).digest('hex')}  ${name}\n`));
  }
  assert.deepEqual(JSON.parse(execFileSync('tar', ['-xOzf', tar, 'ValdiNativeRoutes-v0.1.0/TEMPLATE_RELEASE.json'], { encoding: 'utf8' })), result);
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'TEMPLATE_RELEASE.json'))), result);
});

test('mismatched tags and framework pins fail before writing release outputs', t => {
  assert.equal(typeof release.packRelease, 'function', 'versioned template packaging is missing');
  const { root, git, write, out } = fixture(t);
  git('tag', 'v0.2.0');
  assert.throws(() => release.packRelease({ root, ref: 'v0.2.0', out }), /version/i);
  assert.equal(existsSync(out), false);
  write('module-build/MODULE.bazel', `VALDI_REPOSITORY = "cloud2303org/Valdi"\nVALDI_COMMIT = "${'b'.repeat(40)}"\n`);
  git('add', 'module-build/MODULE.bazel');
  git('commit', '-qm', 'Mismatched pins');
  assert.throws(() => release.packRelease({ root, out }), /pin/i);
  assert.equal(existsSync(out), false);
});

test('tracked private keys are rejected rather than included in release archives', t => {
  assert.equal(typeof release.packRelease, 'function', 'versioned template packaging is missing');
  const { root, git, write, out } = fixture(t);
  write('ota/private.pem', 'private fixture must not be published');
  git('add', '-f', 'ota/private.pem');
  git('commit', '-qm', 'Accidentally tracked key');
  assert.throws(() => release.packRelease({ root, out }), /private|secret/i);
  assert.equal(existsSync(out), false);
});
