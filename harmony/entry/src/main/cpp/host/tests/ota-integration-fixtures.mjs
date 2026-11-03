// Test-only in-memory signing. No repository private key, builder or endpoint.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');
const { makeFixtures } = await import(pathToFileURL(path.join(root, 'scripts/harmony/tests/ota-fixtures.mjs')));
const output = process.argv[2];
const { publicKey } = makeFixtures(output);
const valid = { appVersion: '1.0', fingerprint: '0123456789abcdef0123456789abcdef',
  url: 'https://ota.invalid', publicKey, binaryIdentity: 'd'.repeat(64) };
for (const [name, config] of Object.entries({
  valid, 'missing-identity': { ...valid, binaryIdentity: undefined },
  'bad-identity': { ...valid, binaryIdentity: '1.0' },
  'bad-key': { ...valid, publicKey: 'invalid' },
  'empty-url': { ...valid, url: '' },
})) writeFileSync(path.join(output, `${name}.json`), JSON.stringify(config));
writeFileSync(path.join(output, 'bad-json.json'), '{"url":');
