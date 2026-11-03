import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appInfo, collectBusiness, computeCompatibility, digest, fingerprintParts, packHarmony, recordRelease, sha256,
  validatePublicKey,
} from '../ota.mjs';
import { makeFixtures } from './ota-fixtures.mjs';

function fixture(body) {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'harmony-ota-script-'));
  try { body(dir, makeFixtures(path.join(dir, 'fixtures'))); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const parts = fingerprintParts({ valdi: 'a'.repeat(64), bindings: 'b'.repeat(64), native: 'c'.repeat(64) });

test('identical root fingerprint digest recipe; explicit version/key/endpoint gates', () => fixture((dir, keys) => {
  assert.equal(digest([['b', Buffer.from('two')], ['a', Buffer.from('one')]]),
    sha256(`a\0${sha256('one')}\nb\0${sha256('two')}\n`));
  assert.equal(parts.fingerprint, sha256(`harmony\nrelease\n${'a'.repeat(64)}\n${'b'.repeat(64)}\n${'c'.repeat(64)}\n`).slice(0, 32));
  assert.equal(appInfo({ appVersion: '1.0', parts }).url, '');
  assert.throws(() => appInfo({ appVersion: '../1', parts }));
  assert.throws(() => appInfo({ appVersion: '1.0', parts, url: 'http://ota.invalid', publicKey: keys.publicKey }));
  assert.throws(() => validatePublicKey(generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).publicKey
    .export({ type: 'spki', format: 'pem' })));
  const record = path.join(dir, 'release.json');
  recordRelease(record, parts);
  recordRelease(record, parts);
  assert.throws(() => recordRelease(record, fingerprintParts({ ...parts, native: 'd'.repeat(64) })));
}));

test('signed immutable package + latest publication; rejects gate/path/signer/duplicate failures', () => fixture((dir, keys) => {
  const entries = [['modules/app_pages.valdimodule', Buffer.from('module')],
    ['res/assets/app_pages/icon.png', Buffer.from('image')]];
  const options = { appVersion: '1.0', updateVersion: 'u1', parts, recorded: parts, entries,
    ...keys, output: path.join(dir, 'dist') };
  const out = packHarmony(options);
  assert.equal(JSON.parse(readFileSync(path.join(out, '../latest.json'))).version, 'u1');
  assert.equal(JSON.parse(readFileSync(path.join(out, 'manifest.json'))).files[entries[0][0]], sha256(entries[0][1]));
  assert.throws(() => packHarmony(options), /immutable/);
  assert.throws(() => packHarmony({ ...options, updateVersion: 'u2', signer: () => 'invalid' }), /signer/);
  assert.throws(() => packHarmony({ ...options, updateVersion: 'u2', recorded: { ...parts, native: 'd'.repeat(64) } }));
  for (const name of ['res/../../escape', 'modules/a/../b.valdimodule', 'modules//a.valdimodule',
    '/modules/a.valdimodule', 'modules/%2e.valdimodule', 'res/assets/app/../icon.png'])
    assert.throws(() => packHarmony({ ...options, updateVersion: 'u2', entries: [[name, Buffer.from('x')]] }));
  assert.throws(() => packHarmony({ ...options, updateVersion: 'u2', entries: [entries[0], entries[0]] }));
  mkdirSync(path.join(dir, 'outside'));
  symlinkSync(path.join(dir, 'outside'), path.join(dir, 'linked'));
  assert.throws(() => packHarmony({ ...options, output: path.join(dir, 'linked') }), /symlink/);
  assert.deepEqual(readdirSync(path.join(dir, 'outside')), [], 'Symlink rejection must precede directory creation');
}));

test('latest.json version is rejected before signing or output mutation; later publication succeeds', () => fixture((dir, keys) => {
  let signerCalls = 0;
  const output = path.join(dir, 'dist');
  const options = {
    appVersion: '1.0', parts, recorded: parts,
    entries: [['modules/app_pages.valdimodule', Buffer.from('module')]],
    publicKey: keys.publicKey, output,
    signer: manifest => { signerCalls++; return keys.signer(manifest); },
  };
  const snapshot = directory => readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name < b.name ? -1 : 1)
    .map(entry => [entry.name, entry.isDirectory()
      ? snapshot(path.join(directory, entry.name)) : readFileSync(path.join(directory, entry.name))]);
  for (const updateVersion of ['latest.json', 'LATEST.JSON']) {
    assert.throws(() => packHarmony({ ...options, updateVersion }), /reserved/i);
    assert.equal(signerCalls, 0, 'Reserved version must not invoke the signer');
    assert.equal(existsSync(output), false, 'Reserved version must not create output directories');
  }
  packHarmony({ ...options, updateVersion: 'u1' });
  const before = snapshot(output);
  for (const updateVersion of ['latest.json', 'LATEST.JSON']) {
    assert.throws(() => packHarmony({ ...options, updateVersion }), /reserved/i);
    assert.equal(signerCalls, 1, 'Reserved version must not invoke the signer on an existing release');
    assert.deepEqual(snapshot(output), before, 'Reserved version must preserve every output entry and file byte');
  }
  const normal = packHarmony({ ...options, updateVersion: 'u2' });
  assert.equal(signerCalls, 2);
  assert.equal(JSON.parse(readFileSync(path.join(normal, '../latest.json'))).version, 'u2');
  assert.deepEqual(readdirSync(path.join(output, 'harmony/1.0')).sort(), ['latest.json', 'u1', 'u2']);
}));

test('completed build proof consumption and stale runtime exports use actual filesystem inputs', () => fixture((dir, keys) => {
  const raw = path.join(dir, 'raw');
  mkdirSync(path.join(raw, 'modules'), { recursive: true });
  const module = Buffer.from('signed test fixture; no runtime execution claim');
  writeFileSync(path.join(raw, 'modules/harmony_business.valdimodule'), module);
  const metadata = { schemaVersion: 1, profile: 'business', hbcVersion: 99,
    engine: 'hermes-260318099.0.4', platform: 6, bootstrap: { module: 'harmony_business/src/app' },
    moduleProof: { harmony_business: { sha256: sha256(module), hbcEntries: 1, diagnostics: 0 } } };
  writeFileSync(path.join(raw, 'build-info.json'), JSON.stringify(metadata));
  assert.equal(collectBusiness(raw).length, 1);
  writeFileSync(path.join(raw, 'modules/harmony_business.valdimodule'), 'tampered');
  assert.throws(() => collectBusiness(raw), /proof/);
  mkdirSync(path.join(dir, 'ota'));
  mkdirSync(path.join(dir, 'valdi/native'), { recursive: true });
  mkdirSync(path.join(dir, 'bindings'));
  writeFileSync(path.join(dir, 'bindings/module.hpp'), '// doc\nclass Native {};\n');
  writeFileSync(path.join(dir, 'valdi/native/native.cpp'), 'native implementation');
  writeFileSync(path.join(dir, 'toolchain'), 'pinned compiler');
  writeFileSync(path.join(dir, 'ota/fingerprint.json'), JSON.stringify({ valdi: ['toolchain'] }));
  const runtimeInfo = { platform: 'harmony', config: 'release',
    valdi: digest([['toolchain', Buffer.from('pinned compiler')], ['compiler-backend', 'node']]),
    native: digest([['valdi/native/native.cpp', Buffer.from('native implementation')]]) };
  const options = { root: dir, runtimeInfo, bindingsDirectory: path.join(dir, 'bindings'),
    publicKeyFile: path.join(dir, 'fixtures/public.pem'), nativeInputs: ['toolchain'] };
  const initial = computeCompatibility(options);
  writeFileSync(path.join(dir, 'bindings/module.hpp'), '// changed doc\nclass Native {};\n');
  assert.deepEqual(computeCompatibility(options), initial);
  writeFileSync(path.join(dir, 'bindings/module.hpp'), 'class ChangedNative {};\n');
  assert.notEqual(computeCompatibility(options).fingerprint, initial.fingerprint);
  writeFileSync(path.join(dir, 'toolchain'), 'changed compiler');
  assert.throws(() => computeCompatibility(options), /stale/);
}));
