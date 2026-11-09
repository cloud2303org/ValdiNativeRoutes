import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = 'valdi/modules/app_pages/assets/lottie';
const output = 'valdi/modules/app_pages/src/features/lottie/demoData.ts';
const legacyOutput = 'valdi/modules/app_pages/src/lottieDemoData.ts';

function fixture(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-lottie-generator-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'scripts'));
  cpSync(path.join(root, 'scripts/generate-lottie-demo.mjs'), path.join(directory, 'scripts/generate-lottie-demo.mjs'));
  cpSync(path.join(root, assets), path.join(directory, assets), { recursive: true });
  mkdirSync(path.dirname(path.join(directory, output)), { recursive: true });
  cpSync(path.join(root, output), path.join(directory, output));
  const run = (...args) => spawnSync(process.execPath, [
    path.join(directory, 'scripts/generate-lottie-demo.mjs'), ...args,
  ], { cwd: tmpdir(), encoding: 'utf8', timeout: 10_000 });
  return { directory, run };
}

function snapshot(directory) {
  return Object.fromEntries(readdirSync(directory, { recursive: true }).sort().flatMap(relative => {
    const file = path.join(directory, relative);
    const stat = statSync(file, { bigint: true });
    return stat.isFile() ? [[relative, {
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), mtimeNs: stat.mtimeNs,
    }]] : [];
  }));
}

test('Lottie --check verifies the current page resource without rewriting any files', t => {
  const { directory, run } = fixture(t);
  const before = snapshot(directory);
  const checked = run('--check');
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  assert.deepEqual(snapshot(directory), before);
  assert.equal(existsSync(path.join(directory, legacyOutput)), false);
});

test('Lottie generation restores the current consumer resource and preserves original provenance', t => {
  const { directory, run } = fixture(t);
  const expected = readFileSync(path.join(root, output));
  const originals = ['gatin.json', 'LICENSE.txt', 'source.json'].map(name => [
    name, readFileSync(path.join(directory, assets, name)),
  ]);
  writeFileSync(path.join(directory, output), '// stale resource\n');
  const generated = run();
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
  assert.ok(readFileSync(path.join(directory, output)).equals(expected), 'generated consumer bytes must match the canonical resource');
  assert.equal(existsSync(path.join(directory, legacyOutput)), false);
  for (const [name, bytes] of originals) {
    assert.ok(readFileSync(path.join(directory, assets, name)).equals(bytes), name);
  }
  const checked = run('--check');
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
});

test('Lottie --check rejects a stale consumer resource even if the legacy resource is current', t => {
  const { directory, run } = fixture(t);
  cpSync(path.join(directory, output), path.join(directory, legacyOutput));
  writeFileSync(path.join(directory, output), '// stale resource\n');
  const before = snapshot(directory);
  const checked = run('--check');
  assert.notEqual(checked.status, 0, checked.stdout);
  assert.ok(checked.stderr.includes(`${path.join(directory, output)} is stale.`), checked.stderr);
  assert.deepEqual(snapshot(directory), before);
});
