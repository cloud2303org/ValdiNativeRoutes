// Test-only keys are generated in memory; repository private credentials are never read.
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../ota.mjs';

export function makeFixtures(output) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'public.pem'), pem);
  writeFileSync(path.join(output, 'p384.pem'), generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
    .publicKey.export({ type: 'spki', format: 'pem' }));
  const signer = bytes => sign('sha256', bytes, { key: privateKey, dsaEncoding: 'der' }).toString('base64');
  const cases = ['valid-v1', 'valid-v2', 'signature', 'payload', 'platform', 'app', 'fingerprint',
    'version', 'traversal', 'encoded', 'double-slash', 'empty', 'hash', 'duplicate', 'latest'];
  for (const name of cases) {
    const version = name === 'valid-v2' ? 'v2' : 'v1';
    const module = Buffer.from(version === 'v2' ? 'two' : 'one');
    const image = Buffer.from('signed-image-fixture');
    let manifest = { platform: 'harmony', appVersion: '1.0', fingerprint: '0123456789abcdef0123456789abcdef',
      version, files: { 'modules/app_pages.valdimodule': sha256(module),
        'res/assets/app_pages/tab_home.png': sha256(image) } };
    if (name === 'platform') manifest.platform = 'ios';
    if (name === 'app') manifest.appVersion = '2.0';
    if (name === 'fingerprint') manifest.fingerprint = 'f'.repeat(32);
    if (name === 'version') manifest.version = 'other';
    if (name === 'traversal') manifest.files['res/../../outside'] = sha256(image);
    if (name === 'encoded') manifest.files['modules/%2e%2e/escape.valdimodule'] = sha256(module);
    if (name === 'double-slash') manifest.files['modules//app.valdimodule'] = sha256(module);
    if (name === 'empty') manifest.files = {};
    if (name === 'hash') manifest.files['modules/app_pages.valdimodule'] = 'a'.repeat(63);
    let bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    if (name === 'duplicate') bytes = Buffer.from(bytes.toString().replace('"platform": "harmony"',
      '"platform": "harmony", "platform": "harmony"'));
    const signature = signer(bytes);
    if (name === 'signature') bytes = Buffer.concat([bytes, Buffer.from(' ')]);
    const dir = path.join(output, name, 'harmony/1.0', version);
    mkdirSync(path.join(dir, 'modules'), { recursive: true });
    mkdirSync(path.join(dir, 'res/assets/app_pages'), { recursive: true });
    writeFileSync(path.join(dir, 'modules/app_pages.valdimodule'), name === 'payload' ? 'altered' : module);
    writeFileSync(path.join(dir, 'res/assets/app_pages/tab_home.png'), image);
    writeFileSync(path.join(dir, 'manifest.json'), bytes);
    writeFileSync(path.join(dir, 'manifest.sig'), signature);
    writeFileSync(path.join(dir, '../latest.json'), JSON.stringify({ version: name === 'latest' ? '../escape' : version }));
  }
  return { publicKey: pem, signer };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) makeFixtures(process.argv[2]);
