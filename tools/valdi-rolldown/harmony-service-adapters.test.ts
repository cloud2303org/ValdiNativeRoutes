import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkServiceAdapters, generateServiceAdapters } from './harmony-service-adapters';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const generated = generateServiceAdapters(root);

test('annotation pipeline supplies four typed interfaces, 52 Futures and 14 events', () => {
  assert.equal(generated.manifest.length, 4);
  assert.equal(generated.manifest.reduce((n, service) => n + service.methods.length, 0), 52);
  assert.equal(generated.manifest.reduce((n, service) => n + service.events.length, 0), 14);
  assert.equal(generated.manifest.filter(service => service.events.length).length, 3);
  assert.deepEqual(generated.manifest.map(service => service.host), ['BleHost', 'PermissionHost', 'WifiHost', 'NfcHost']);
});
test('adapter output is current and scoped to the new platform generated files', () => {
  assert.deepEqual([...generated.files.keys()], ['PlatformServiceAdapters.hpp', 'PlatformServiceAdapters.cpp']);
  for (const [name, source] of generated.files)
    assert.equal(readFileSync(path.join(root, 'harmony/entry/src/main/cpp/platform', name), 'utf8'), source);
});
test('canonical C++ type metadata produces actual subclass signatures and fixed bindings', () => {
  const header = generated.files.get('PlatformServiceAdapters.hpp')!;
  const source = generated.files.get('PlatformServiceAdapters.cpp')!;
  assert.ok(header.includes('class BleHostAdapter final : public snap::valdi_modules::bluetooth::BleHost'));
  assert.ok(header.includes('Valdi::Future<double> getBLEDeviceRSSI(Valdi::StringBox deviceId) final;'));
  assert.ok(header.includes('Valdi::Future<Valdi::BytesView> transceive('));
  assert.ok(header.includes('void setEvents(snap::valdi_modules::app_pages::NfcHostEvents events) final;'));
  assert.ok(source.includes('snap::valdi_modules::app_pages::PermissionHost::getRegisteredClass()'));
  assert.ok(!source.includes('ValueFunctionWithCallable'));
  assert.ok(!source.includes('getPropertyIndexForName'));
  assert.ok(!source.includes('ValueTypedObject::make'));
});
test('read-only check rejects stale files without changing them', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'harmony-adapter-check-'));
  try {
    for (const [name, content] of generated.files) writeFileSync(path.join(output, name), content);
    checkServiceAdapters(output, generated.files);
    const file = path.join(output, 'PlatformServiceAdapters.cpp');
    writeFileSync(file, 'stale fixture');
    assert.throws(() => checkServiceAdapters(output, generated.files), /Stale or missing generated adapter/);
    assert.equal(readFileSync(file, 'utf8'), 'stale fixture');
    rmSync(file);
    assert.throws(() => checkServiceAdapters(output, generated.files), /Stale or missing generated adapter/);
    assert.equal(existsSync(file), false);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
test('CLI --check with explicit missing --out does not create directories', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'harmony-adapter-cli-'));
  const output = path.join(fixture, 'must-not-be-created');
  try {
    const result = spawnSync(path.join(root, 'tools/valdi-rolldown/node_modules/.bin/tsx'),
      [path.join(root, 'tools/valdi-rolldown/harmony-service-adapters.ts'), '--out', output, '--check'],
      { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Stale or missing generated adapter/);
    assert.equal(existsSync(output), false);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
