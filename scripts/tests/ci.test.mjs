import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseDocument } from 'yaml';

const repository = path.resolve(import.meta.dirname, '../..');

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'valdi-ci-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  mkdirSync(path.join(root, 'scripts'));
  for (const name of ['ci.mjs', 'prerequisites.mjs'])
    copyFileSync(path.join(repository, 'scripts', name), path.join(root, 'scripts', name));
  write('scripts/upstream.mjs', 'import { fileURLToPath } from "node:url";\nexport const root = fileURLToPath(new URL("..", import.meta.url));\n');
  // The fixture has no exporter, OTA scripts, dependency install, or native build tools.
  const run = (...args) => spawnSync(process.execPath, ['scripts/ci.mjs', ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: path.join(root, 'outputs') },
  });
  return { root, write, run };
}

test('CI reports missing runtime artifacts without attempting an export', t => {
  const f = fixture(t);
  const result = f.run('runtime-valid', 'android');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /runtime is missing/);
  assert.match(result.stdout, /valid=false/);
  assert.equal(readFileSync(path.join(f.root, 'outputs'), 'utf8'), 'valid=false\n');
});

for (const platform of ['android', 'ios']) {
  test(`CI accepts a plain ${platform} export without runtime source inputs`, t => {
    const f = fixture(t);
    const directory = platform === 'android' ? 'android/app/libs' : 'ios/Frameworks';
    if (platform === 'android') f.write(`${directory}/valdi_runtime.aar`, 'fixture');
    else mkdirSync(path.join(f.root, directory, 'ValdiRuntime.xcframework'), { recursive: true });
    f.write(`${directory}/valdi_ota.json`, JSON.stringify({ platform, config: 'release' }));
    const result = f.run('runtime-valid', platform);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'valid=true\n');
    assert.equal(readFileSync(path.join(f.root, 'outputs'), 'utf8'), 'valid=true\n');
  });
}

test('CI reports invalid platform metadata and rejects the removed runtime-key command', t => {
  const f = fixture(t);
  f.write('android/app/libs/valdi_runtime.aar', 'fixture');
  f.write('android/app/libs/valdi_ota.json', JSON.stringify({ platform: 'ios', config: 'debug' }));
  const result = f.run('runtime-valid', 'android');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /valid=false/);
  const removed = f.run('runtime-key', 'android');
  assert.notEqual(removed.status, 0);
  assert.match(removed.stderr, /Usage: node scripts\/ci\.mjs toolchain \| runtime-valid PLATFORM/);
});

test('native CI exports explicitly before builds and saves dependencies after native builds', () => {
  for (const [file, job] of [['ci.yml', 'build'], ['windows.yml', 'windows-android']]) {
    const document = parseDocument(readFileSync(path.join(repository, '.github/workflows', file), 'utf8'), {
      uniqueKeys: true,
    });
    assert.deepEqual(document.errors, [], file);
    const steps = document.toJS().jobs[job].steps;
    const exportIndex = steps.findIndex(step => /scripts\/(?:windows\/)?export-[^\r\n]*\.(sh|ps1)\b/.test(step.run ?? ''));
    const buildIndices = steps.flatMap((step, index) =>
      /pnpm build:(android|ios)|-File scripts\/windows\/build-android\.ps1/.test(step.run ?? '') ? [index] : []);
    assert.ok(exportIndex >= 0, `${file}: missing explicit export`);
    assert.equal(steps[exportIndex].if, undefined, `${file}: export must not depend on runtime freshness`);
    assert.ok(buildIndices.length > 0, `${file}: missing native build`);
    for (const index of buildIndices) assert.ok(index > exportIndex, `${file}: build precedes export`);
    const saveIndex = steps.findIndex(step => step.name === 'Save prepared vision dependencies');
    assert.ok(saveIndex > Math.max(...buildIndices), `${file}: dependency cache saved before native builds`);
    const restoreIndex = steps.findIndex(step => step.name === 'Restore vision dependencies');
    assert.ok(restoreIndex >= 0 && restoreIndex < exportIndex,
      `${file}: runtime export must consume the restored Vision dependency cache`);
    for (const step of steps) {
      assert.doesNotMatch(step.run ?? '', /\bprebuild\b|valdi-hash|check-export|runtime-key|node vision\/scripts\/prepare-native/);
      if (step.uses?.startsWith('actions/cache/'))
        assert.doesNotMatch(step.with.path, /valdi_runtime\.aar|ValdiRuntime\.xcframework|valdi_ota\.json/);
    }
  }
});
