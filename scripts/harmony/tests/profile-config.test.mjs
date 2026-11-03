import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFork, profileConfig, requiredRuntimeFiles } from '../profile-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('legacy is the default and full development cannot fall back to it', () => {
  assert.deepEqual(profileConfig(), { mode: 'legacy', cmakeArgs: ['-DVALDI_HARMONY_RUNTIME_MODE=legacy'] });
  assert.throws(() => profileConfig({ profile: 'full-development' }), /refusing legacy fallback/);
  assert.throws(() => profileConfig({}, { VALDI_HARMONY_PROFILE: 'full-development' }), /refusing legacy fallback/);
  assert.throws(() => profileConfig({ forkRoot: '/explicit/fork' }), /explicit fork mode/);
  assert.throws(() => profileConfig({ mode: 'typo' }), /legacy or fork/);
  assert.throws(() => profileConfig({ mode: 'fork' }), /explicit profile/);
});

test('fork arguments require all explicit roots, real inputs and valid profiles', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'profile-config-input-test-'));
  try {
    const options = { mode: 'fork', profile: 'lean-release', forkRoot: temporary,
      external: temporary, proto: temporary, websocketpp: temporary };
    assert.throws(() => profileConfig(options), /Missing caller-owned runtime inputs/);
    for (const file of ['valdi/harmony/runtime/CMakeLists.txt', 'valdi/valdi.pb.h', 'valdi/valdi.pb.cc',
      'valdi_protobuf/protos/DescriptorIndex.pb.h', 'valdi_protobuf/protos/DescriptorIndex.pb.cc']) {
      mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
      writeFileSync(path.join(temporary, file), '');
    }
    for (const name of ['hermes', 'boost', 'boringssl', 'protobuf', 'abseil', 'harfbuzz',
      'fmt', 'jsoncpp', 'phmap', 'zoo', 'zstd', 'xxhash']) mkdirSync(path.join(temporary, name));
    const config = profileConfig(options);
    assert.equal(config.cmakeArgs.length, 6);
    assert.ok(config.cmakeArgs.includes('-DVALDI_HARMONY_PROFILE=lean-release'));
    assert.throws(() => profileConfig({ ...options, websocketpp: undefined }), /explicit absolute directory/);
    assert.throws(() => profileConfig({ ...options, proto: 'relative' }), /explicit absolute directory/);
    assert.throws(() => profileConfig({ ...options, forkRoot: `${temporary};bad` }), /list separators/);
    assert.throws(() => profileConfig({ ...options, profile: 'debug' }), /explicit profile/);
    assert.throws(() => profileConfig({ ...options, profile: 'full-development' }), /websocketpp\/server.hpp/);
    const env = Object.fromEntries(config.cmakeArgs.map(arg => arg.slice(2).split('=')));
    assert.deepEqual(profileConfig({}, env), config);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('accepted actual staged runtime satisfies the frozen app ABI and behavior prerequisites', () => {
  const config = { mode: 'fork', profile: 'lean-release', forkRoot: path.join(root, '.tools/harmony/upstream') };
  const receipt = auditFork(config);
  assert.deepEqual(receipt.failures, []);
  assert.equal(receipt.files.length, Object.keys(requiredRuntimeFiles).length + 2);
  // Legacy staging intentionally has no Harmony debugger protocol. Only full
  // development requires the maintained mapping; do not retrofit legacy.
  const full = auditFork({ ...config, profile: 'full-development' });
  assert.ok(full.failures.some(failure => failure.includes('Harmony debugger prerequisite')));
  assert.ok(full.failures.some(failure => failure.includes('Harmony daemon prerequisite')));
});

test('missing fork patches report every prerequisite and never create source files', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'profile-config-audit-test-'));
  try {
    const receipt = auditFork({ mode: 'fork', profile: 'full-development', forkRoot: temporary });
    assert.ok(receipt.failures.some(failure => failure.includes('lossless-map transport ABI')));
    assert.ok(receipt.failures.some(failure => failure.includes('preload cancellation generation ABI')));
    assert.ok(receipt.failures.some(failure => failure.includes('Loaded-image observer prerequisite')));
    assert.ok(receipt.failures.some(failure => failure.includes('Official RuntimeManager API prerequisite')));
    assert.equal(receipt.files.length, 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('host identity comes from the exact app bundle and development stays profile scoped', () => {
  const identity = JSON.parse(readFileSync(path.join(root, 'harmony/AppScope/app.json5'), 'utf8')).app.bundleName;
  assert.equal(identity, 'io.valdiroutes.harmony');
  const host = readFileSync(path.join(root, 'harmony/entry/src/main/cpp/host/HarmonyRuntimeHost.cpp'), 'utf8');
  assert.match(host, /#if VALDI_HARMONY_FULL_DEVELOPMENT\s+true, false, false, std::nullopt/);
  assert.match(host, /setApplicationId\(Valdi::StringBox::fromCString\(VALDI_HARMONY_APPLICATION_ID\)\)/);
  assert.match(host, /#else\s+false, true, false, std::nullopt/);
  assert.match(host, /#if VALDI_HARMONY_FULL_DEVELOPMENT\s+_manager->attachHotReloader\(_runtime\)/);
});
