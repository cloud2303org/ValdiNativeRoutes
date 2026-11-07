import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createManifest, publishPackage } from '../ota.mjs';
import { discoveryHdiffz, optionalHdiffz } from './ota-test-tools.mjs';

const repository = path.resolve(import.meta.dirname, '../..');

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-ota-script-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  for (const name of ['ota.mjs', 'ota-delta.mjs', 'native-cpp.mjs', 'prerequisites.mjs', 'native-modules.mjs', 'module-platform-config.mjs', 'app-config.mjs']) {
    const file = path.join(root, 'scripts', name);
    mkdirSync(path.dirname(file), { recursive: true });
    cpSync(path.join(repository, 'scripts', name), file);
  }
  write('tools/valdi-rolldown/modules.mjs', readFileSync(path.join(repository, 'tools/valdi-rolldown/modules.mjs')));
  const app = JSON.parse(readFileSync(path.join(repository, 'package.json'))).valdi.app;
  delete app.icon;
  write('package.json', JSON.stringify({ valdi: { app, modules: ['app_pages', 'app_foundation'] } }));
  for (const name of ['app_pages', 'app_foundation']) write(`valdi/modules/${name}/src/index.ts`, 'export {};');
  write('ota/fingerprint.json', JSON.stringify({ valdi: [], android: ['android/app/src'], ios: [] }));
  write('android/app/generated/valdi/models.kt', 'class ExistingBinding');
  // The old implementation invokes this to fingerprint bindings. The new
  // configuration must not need to run binding codegen at all.
  write('tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs', 'console.log("[]");');
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  write('ota/public.pem', keys.publicKey.export({ type: 'spki', format: 'pem' }));
  write('export.json', JSON.stringify({ platform: 'android', config: 'release', valdi: 'runtime', native: 'cpp' }));
  const run = (...args) => spawnSync(process.execPath, ['scripts/ota.mjs', ...args], {
    cwd: root, encoding: 'utf8',
  });
  return { root, write, run };
}

test('app-info binds the manually selected version and module inventory without a source fingerprint', t => {
  const { root, run } = fixture(t);
  const result = run('app-info', 'android', 'export.json', '1.2.0', 'https://updates.example.test/app');
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.appVersion, '1.2.0');
  assert.equal(config.url, 'https://updates.example.test/app');
  assert.deepEqual(config.modules, ['app_pages']);
  assert.equal(config.bundleVersion, 'pages-001');
  assert.equal(Object.hasOwn(config, 'fingerprint'), false);
  assert.equal(existsSync(path.join(root, 'ota/releases')), false);
});

test('native source changes do not alter manual OTA eligibility', t => {
  const { write, run } = fixture(t);
  const args = ['app-info', 'android', 'export.json', '1.2.0', 'https://updates.example.test/app'];
  const before = run(...args);
  assert.equal(before.status, 0, before.stderr);
  write('android/app/src/Host.kt', 'changed native implementation');
  const after = run(...args);
  assert.equal(after.status, 0, after.stderr);
  assert.deepEqual(JSON.parse(after.stdout), JSON.parse(before.stdout));
});

const content = Buffer.from('Hermes module fixture');
const entries = [['modules/app_pages.valdimodule', content]];
const description = { platform: 'android', appVersion: '1.2.0', version: 'update-001', modules: ['app_pages'], entries };

test('manifest describes complete files with deterministic content hashes and exact sizes', () => {
  const input = { ...description, entries: [
    ['res/drawable-xhdpi/app_pages_logo.webp', Buffer.from('image')],
    ['modules/app_pages.map.json', Buffer.from('{}')], ...entries,
  ] };
  const manifest = createManifest(input);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(Object.hasOwn(manifest, 'fingerprint'), false);
  assert.deepEqual(manifest.files['modules/app_pages.valdimodule'], {
    sha256: createHash('sha256').update(content).digest('hex'), size: content.length,
  });
  assert.deepEqual(createManifest({ ...input, entries: [...input.entries].reverse() }), manifest);
});

test('only app_pages may be OTA-owned even when other native modules are enabled', () => {
  assert.throws(() => createManifest({ ...description, modules: ['app_pages', 'bluetooth'], entries: [
    ...entries, ['modules/bluetooth.valdimodule', Buffer.from('native module JS wrapper')],
  ] }), /app_pages/);
});

test('foreign modules, foreign resources, invalid paths and duplicate files are rejected', () => {
  for (const name of ['modules/other.valdimodule', 'modules/other.map.json', 'res/drawable/other_logo.webp',
    'res/other.bundle/logo.png', 'res/drawable/../escape', 'modules/../escape', '/modules/app_pages.valdimodule',
    'res/drawable/app_pages_logo.webp?query', 'modules\\app_pages.valdimodule']) {
    assert.throws(() => createManifest({ ...description, entries: [...entries, [name, content]] }), /Invalid/);
  }
  assert.throws(() => createManifest({ ...description, entries: [...entries, ...entries] }), /duplicate/);
});

test('iOS resources preserve their module bundle layout', () => {
  const manifest = createManifest({ ...description, platform: 'ios', entries: [
    ...entries, ['res/app_pages.bundle/logo@3x.png', Buffer.from('image')],
  ] });
  assert.equal(manifest.files['res/app_pages.bundle/logo@3x.png'].size, 5);
  assert.throws(() => createManifest({ ...description, platform: 'ios', entries: [
    ...entries, ['res/drawable/app_pages_logo.webp', content],
  ] }), /Invalid/);
});

test('version identities must be strings and must not escape the static directory', () => {
  for (const value of [1, undefined, null, '', '../other', 'one/two', 'a?b', 'a'.repeat(65)]) {
    assert.throws(() => createManifest({ ...description, appVersion: value }), /Invalid/);
    assert.throws(() => createManifest({ ...description, version: value }), /Invalid/);
  }
});

test('empty modules and oversized complete packages are rejected', () => {
  assert.throws(() => createManifest({ ...description, entries: [['modules/app_pages.valdimodule', Buffer.alloc(0)]] }), /Empty/);
  assert.throws(() => createManifest({ ...description, entries: [['modules/app_pages.valdimodule', Buffer.alloc(64 * 1024 * 1024 + 1)]] }), /64 MiB/);
});

test('publishing signs exact manifest bytes and commits the complete version before its index', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-ota-publish-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const target = publishPackage({ ...description, directory, privateKey });
  const bytes = readFileSync(path.join(target, 'manifest.json'));
  const signature = Buffer.from(readFileSync(path.join(target, 'manifest.sig'), 'utf8'), 'base64');
  assert.equal(verify('sha256', bytes, keys.publicKey, signature), true);
  assert.deepEqual(JSON.parse(bytes), createManifest(description));
  assert.deepEqual(readFileSync(path.join(target, entries[0][0])), content);
  const latest = path.join(directory, 'android/1.2.0/latest.json');
  assert.deepEqual(JSON.parse(readFileSync(latest)), { version: description.version });
  assert.throws(() => publishPackage({ ...description, directory, privateKey }), /immutable/);
  assert.deepEqual(JSON.parse(readFileSync(latest)), { version: description.version });
  assert.equal(existsSync(path.join(directory, 'releases')), false);
});

test('invalid signing keys fail without exposing an incomplete static version', t => {
  const directory = path.join(mkdtempSync(path.join(tmpdir(), 'valdi-ota-bad-key-')), 'dist');
  t.after(() => rmSync(path.dirname(directory), { recursive: true, force: true }));
  assert.throws(() => publishPackage({ ...description, directory, privateKey: 'invalid private key' }));
  assert.equal(existsSync(directory), false);
  const keys = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  assert.throws(() => publishPackage({
    ...description, directory, privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }), /P-256/);
  assert.equal(existsSync(directory), false);
});

test('oversized signed metadata is rejected before publishing any files', t => {
  const directory = path.join(mkdtempSync(path.join(tmpdir(), 'valdi-ota-metadata-')), 'dist');
  t.after(() => rmSync(path.dirname(directory), { recursive: true, force: true }));
  const input = { ...description, entries: [...entries, ...Array.from({ length: 3500 }, (_, index) => [
    `res/drawable/app_pages_${index}_${'a'.repeat(205)}.webp`, Buffer.from('x'),
  ])] };
  assert.ok(Buffer.byteLength(JSON.stringify(createManifest(input), null, 2)) > 1024 * 1024);
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.throws(() => publishPackage({
    ...input, directory, privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }), /manifest.*1 MiB/);
  assert.equal(existsSync(directory), false);
});

test('update versions cannot collide with the latest index filename', () => {
  for (const version of ['latest.json', 'Latest.json', 'LATEST.JSON', 'lAtEsT.JsOn']) {
    assert.throws(() => createManifest({ ...description, version }), /reserved/);
  }
});

test('enabled OTA needs a Release runtime and a well-formed static base URL', t => {
  const { run, write } = fixture(t);
  write('export.json', JSON.stringify({ platform: 'android', config: 'debug' }));
  assert.notEqual(run('app-info', 'android', 'export.json', '1.2.0', 'https://updates.example.test').status, 0);
  assert.equal(run('app-info', 'android', 'export.json', '1.2.0', '').status, 0);
  write('export.json', JSON.stringify({ platform: 'android', config: 'release' }));
  for (const url of ['file:///tmp/updates', 'https://user@example.test', 'https://example.test?query', 'https://example.test#fragment']) {
    assert.notEqual(run('app-info', 'android', 'export.json', '1.2.0', url).status, 0);
  }
});


test('app-info reads the embedded bundle version and requires enabled app_pages', t => {
  const { run, root, write } = fixture(t);
  const config = JSON.parse(readFileSync(path.join(root, 'package.json')));
  config.valdi.ota = { bundleVersion: 'business-42' };
  write('package.json', JSON.stringify(config));
  const result = run('app-info', 'android', 'export.json', '1.2.0', '');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).bundleVersion, 'business-42');
  config.valdi.modules = ['app_foundation'];
  write('package.json', JSON.stringify(config));
  assert.notEqual(run('app-info', 'android', 'export.json', '1.2.0', '').status, 0);
});

test('unbound split descriptors are rejected before signing or writing', t => {
  const directory = path.join(mkdtempSync(path.join(tmpdir(), 'valdi-ota-unbound-')), 'dist');
  t.after(() => rmSync(path.dirname(directory), { recursive: true, force: true }));
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.throws(() => publishPackage({ ...description, directory,
    privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    deltas: [{ descriptor: { baseVersion: 'pages-001', path: '../escape', sha256: '0'.repeat(64), size: 1 } }],
  }), /delta/i);
  assert.equal(existsSync(directory), false);
});

test('pack rejects malformed base options before reading any publisher key', t => {
  const { run } = fixture(t);
  for (const args of [['--base-version', 'old'], ['--base'], ['--base', 'old.valdimodule'], ['--unknown', 'x']]) {
    const result = run('pack', 'android', '1.2.0', 'new', ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /base|option/i);
    assert.doesNotMatch(result.stderr, /private.pem/);
  }
});

test('keygen uses a fresh temporary publisher directory and refuses implicit rotation', t => {
  const { root, run } = fixture(t);
  const first = run('keygen');
  assert.equal(first.status, 0, first.stderr);
  const privateBytes = readFileSync(path.join(root, 'ota/private.pem'));
  const publicBytes = readFileSync(path.join(root, 'ota/public.pem'));
  const again = run('keygen');
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /exists/);
  assert.deepEqual(readFileSync(path.join(root, 'ota/private.pem')), privateBytes);
  assert.deepEqual(readFileSync(path.join(root, 'ota/public.pem')), publicBytes);
});

test('valdi-hash and check-export retain native input integrity checks independently of OTA ownership', t => {
  const { run, write } = fixture(t);
  const current = run('valdi-hash', 'android', 'release');
  assert.equal(current.status, 0, current.stderr);
  const info = JSON.parse(current.stdout);
  write('export.json', JSON.stringify(info));
  assert.equal(run('check-export', 'android', 'export.json').status, 0);
  write('valdi/modules/app_foundation/cpp/Owned.cpp', 'native change');
  const updated = JSON.parse(run('valdi-hash', 'android', 'release').stdout);
  assert.notEqual(updated.valdi, info.valdi);
  assert.notEqual(updated.native, info.native);
  const stale = run('check-export', 'android', 'export.json');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /export-android.sh release/);
  assert.equal(run('app-info', 'android', 'export.json', '1.2.0', 'https://updates.example.test').status, 0);
});

test('pack CLI with temporary keys forwards both base forms and filters compiler outputs to app_pages', async t => {
  const { zstdCompressSync } = await import('node:zlib');
  const { encodePacket } = await import('../ota-delta.mjs');
  const { root, write } = fixture(t);
  const hdiffz = optionalHdiffz();
  // The hash-only archive never invokes HDiff. Keep full/base CLI coverage even
  // without the optional integration tool, using the supported repository lookup.
  if (!hdiffz) discoveryHdiffz(path.join(root, 'ota/tools'));
  const archive = zstdCompressSync(encodePacket(new Map([['hash', Buffer.from('old')]])));
  write('old.valdimodule', archive);
  // Isolate the parent-owned compiler at its process boundary; no project codegen or native build.
  write('pnpm.cjs', `const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), root = ${JSON.stringify(root)};
fs.writeFileSync(path.join(root, 'build-args.json'), JSON.stringify(args));
const out = args[args.indexOf('--out') + 1];
fs.writeFileSync(path.join(out, 'app_pages.valdimodule'), fs.readFileSync(path.join(root, 'old.valdimodule')));
fs.writeFileSync(path.join(out, 'app_pages.map.json'), '{}');
fs.writeFileSync(path.join(out, 'app_foundation.valdimodule'), 'foreign');
if (args.includes('--res')) {
  const res = path.join(out, 'res/drawable'); fs.mkdirSync(res, { recursive: true });
  for (const name of ['app_pages_logo.webp', 'app_foundation_logo.webp']) fs.writeFileSync(path.join(res, name), 'image');
} else {
  for (const name of ['app_pages', 'app_foundation']) {
    const bundle = path.join(out, name + '.bundle'); fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'logo.png'), 'image'); fs.writeFileSync(path.join(bundle, 'Info.plist'), 'plist');
  }
}`);
  for (const platform of ['android', 'ios']) {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    write('ota/private.pem', keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    for (const [version, options] of [['pages-001', []], ['pages-002', ['--base', 'old.valdimodule', '--base-version', 'embedded-001']],
      ['pages-003', ['--base', `ota/dist/${platform}/1.2.0/pages-001`]]]) {
      const result = spawnSync(process.execPath, ['scripts/ota.mjs', 'pack', platform, '1.2.0', version, ...options], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ...(hdiffz ? { VALDI_HDIFFZ: hdiffz } : {}), npm_execpath: path.join(root, 'pnpm.cjs') },
      });
      assert.equal(result.status, 0, result.stderr);
      const args = JSON.parse(readFileSync(path.join(root, 'build-args.json')));
      assert.deepEqual(args.slice(0, 6), ['exec', 'tsx', 'build.ts', '--release', '--module', 'app_pages']);
      if (options.length) {
        const old = version === 'pages-002' ? path.join(root, 'old.valdimodule') : path.join(root, `ota/dist/${platform}/1.2.0/pages-001/modules/app_pages.valdimodule`);
        assert.deepEqual(args.slice(-2), ['--hermes-base', old]);
      } else assert.equal(args.includes('--hermes-base'), false);
      const out = path.join(root, `ota/dist/${platform}/1.2.0/${version}`), manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json')));
      assert.deepEqual(Object.keys(manifest.files), ['modules/app_pages.map.json', 'modules/app_pages.valdimodule',
        platform === 'android' ? 'res/drawable/app_pages_logo.webp' : 'res/app_pages.bundle/logo.png']);
      assert.equal(existsSync(args[args.indexOf('--out') + 1]), false, 'temporary compiler output must be removed');
      assert.equal(verify('sha256', readFileSync(path.join(out, 'manifest.json')), keys.publicKey,
        Buffer.from(readFileSync(path.join(out, 'manifest.sig'), 'utf8'), 'base64')), true);
    }
  }
});

test('app-info rejects explicit invalid bundle identities instead of silently using a fixture default', t => {
  const { root, run, write } = fixture(t), config = JSON.parse(readFileSync(path.join(root, 'package.json')));
  for (const bundleVersion of [null, 42, '', '../escape', 'LATEST.JSON']) {
    config.valdi.ota = { bundleVersion }; write('package.json', JSON.stringify(config));
    assert.notEqual(run('app-info', 'android', 'export.json', '1.2.0', '').status, 0);
  }
});
