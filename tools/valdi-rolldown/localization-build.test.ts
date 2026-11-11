import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { unpack } from './archive';
import { valdiSourceRoot } from './pipeline';
import { createManifest } from '../../scripts/ota.mjs';

const tools = import.meta.dirname;

function fixture(t: { after: (fn: () => void) => void }) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-localized-build-')));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const localTools = path.join(directory, 'tools/valdi-rolldown');
  mkdirSync(localTools, { recursive: true });
  for (const entry of readdirSync(tools, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.endsWith('.test.ts')) continue;
    const destination = path.join(localTools, entry.name);
    if (['pipeline.ts', 'build.ts', 'tsconfig.ts'].includes(entry.name)) {
      copyFileSync(path.join(tools, entry.name), destination);
    } else {
      symlinkSync(path.join(tools, entry.name), destination, entry.isDirectory() ? 'dir' : 'file');
    }
  }
  symlinkSync(path.resolve(tools, '../../scripts'), path.join(directory, 'scripts'), 'dir');
  const put = (relative: string, content: string) => {
    const file = path.join(directory, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  put('package.json', JSON.stringify({ type: 'module', valdi: { modules: ['app_pages'] } }));
  put('valdi/modules/app_pages/src/index.ts', `
import Strings from 'app_pages/src/Strings';
import res from 'app_pages/res';
export const message = () => Strings.welcome('Ada');
export const badge = res.badge;
`);
  const images = path.join(directory, 'valdi/modules/app_pages/res');
  mkdirSync(images, { recursive: true });
  copyFileSync(path.resolve(tools, '../../valdi/modules/app_pages/res/tab_home@3x.png'), path.join(images, 'badge@3x.png'));
  put('valdi/modules/app_pages/strings/strings-en.json',
    JSON.stringify({ welcome: { defaultMessage: 'Hello {name}' } }));
  put('valdi/modules/app_pages/strings/strings-zh-Hans.json',
    JSON.stringify({ welcome: { defaultMessage: '你好，{name}' } }));
  const run = (file: string, args: string[] = []) => spawnSync(process.execPath, [
    path.join(tools, 'node_modules/tsx/dist/cli.mjs'), path.join(localTools, file), ...args,
  ], {
    cwd: localTools, encoding: 'utf8',
    env: { ...process.env, VALDI_SOURCE_ROOT: valdiSourceRoot()!, BAZEL_BIN: 'localization-fixture-must-not-run-bazel' },
  });
  return { directory, put, run };
}

test('editor sync prepares Strings and resources before the first build, and Debug/Release OTA retains both', t => {
  const f = fixture(t);
  const synced = f.run('tsconfig.ts');
  assert.equal(synced.status, 0, synced.stderr);
  const accessor = path.join(f.directory, 'tools/valdi-rolldown/.gen/app_pages/src/Strings.ts');
  assert.ok(existsSync(accessor), 'editor completion must not depend on a previous bundle build');
  const resources = path.join(f.directory, 'tools/valdi-rolldown/.gen/app_pages/res.ts');
  assert.match(readFileSync(resources, 'utf8'), /readonly badge: Asset/);

  for (const mode of ['debug', 'release']) {
    const out = path.join(f.directory, mode);
    const result = f.run('build.ts', ['--module', 'app_pages', '--out', out, ...(mode === 'release' ? ['--release'] : [])]);
    assert.equal(result.status, 0, result.stderr);
    const archive = readFileSync(path.join(out, 'app_pages.valdimodule'));
    const entries = unpack(archive);
    assert.deepEqual(JSON.parse(entries.get('strings/strings-en.json')!.toString()),
      { welcome: { defaultMessage: 'Hello {name}' } });
    assert.deepEqual(JSON.parse(entries.get('strings/strings-zh-Hans.json')!.toString()),
      { welcome: { defaultMessage: '你好，{name}' } });
    assert.ok(entries.get('src/Strings.js')!.length > 0);
    assert.ok(entries.has('res.js'));
    assert.ok(entries.has('res.assetcatalog'));
    const manifest = createManifest({
      platform: 'android', appVersion: '1.0.0', version: 'localized-1',
      entries: [['modules/app_pages.valdimodule', archive]],
    });
    assert.equal(manifest.files['modules/app_pages.valdimodule'].size, archive.length);
  }
  f.put('valdi/modules/app_pages/strings/strings-ja.json',
    JSON.stringify({ welcome: { defaultMessage: 'こんにちは、{name}' } }));
  const updated = f.run('build.ts', ['--module', 'app_pages', '--out', path.join(f.directory, 'updated')]);
  assert.equal(updated.status, 0, updated.stderr);
  const entries = unpack(readFileSync(path.join(f.directory, 'updated/app_pages.valdimodule')));
  assert.ok(entries.has('strings/strings-ja.json'));
  assert.match(entries.get('src/Strings.js')!.toString(), /strings-ja\.json/);
  assert.ok(!existsSync(path.join(f.directory, 'valdi/modules/app_pages/src/Strings.ts')));
});
