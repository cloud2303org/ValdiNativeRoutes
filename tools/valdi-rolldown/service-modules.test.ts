import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { unpack } from './archive';
import { compileNodeModule } from './module-build';
import { appModule, genDir, moduleConfig } from './pipeline';

const services = [
  ['mmkv', 'MMKVStorage', 'MMKVNativeModule', 'MMKV'],
  ['permissions', 'Permissions', 'PermissionsNativeModule', 'Permissions'],
  ['wifi', 'Wifi', 'WifiNativeModule', 'Wifi'],
  ['nfc', 'Nfc', 'NfcNativeModule', 'Nfc'],
  ['app_ui', 'AppUI', 'AppUINativeModule', 'AppUI'],
] as const;

for (const [name, iosName, nativeType, declaration] of services) {
  const modes = name === 'mmkv' || name === 'app_ui' ? ['debug', 'release'] as const : ['debug'] as const;
  for (const mode of modes) test(`${name} compiles independently as a real ${mode} Node module`, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), `valdi-service-${name}-${mode}-`));
    t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
    const dependencies = [appModule('native_common'), ...(name === 'wifi' || name === 'nfc' ? [appModule('permissions')] : [])];
    assert.equal(moduleConfig(name).nativeBuild, 'host');
    if (name === 'mmkv' && mode === 'release') {
      // Exercise the CLI used by declared Node build targets, as well as the shared compiler function.
      execFileSync(process.execPath, [
        path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs'),
        path.join(import.meta.dirname, 'module-build.ts'),
        '--module', name, '--out', directory, '--ios-module-name', iosName, '--mode', mode,
        '--deps', JSON.stringify(dependencies.map(module => ({ name: module.name, generatedDir: genDir(module.name) }))),
      ], { env: process.env, encoding: 'utf8' });
    } else await compileNodeModule(appModule(name), directory, iosName, mode, dependencies);
    const kotlin = readFileSync(path.join(directory, 'android', `${name}.kt`), 'utf8');
    assert.ok(kotlin.includes(`interface ${nativeType}:`));
    assert.ok(kotlin.includes(`return "${name}/src/${declaration}"`));
    assert.match(kotlin, /fun getHost\(\): /);
    if (name === 'permissions') assert.match(kotlin, /fun getAndroidSdk\(\): Double/);
    const objc = readFileSync(path.join(directory, 'ios', `${iosName}Types`, `${iosName}Types.h`), 'utf8');
    assert.ok(objc.includes(`@protocol VR${nativeType}`));
    const archive = unpack(readFileSync(path.join(directory, `${name}.valdimodule`)));
    const entries = [...archive.entries()].filter(([file]) => file.endsWith('.js'));
    assert.ok(entries.length);
    for (const [file, data] of entries) {
      if (mode === 'release') assert.equal(data.readUInt32LE(0), 0x0100c634, `${file} uses the Valdi Hermes envelope`);
      else assert.doesNotMatch(data.toString(), /require\(["']app_pages\//);
    }
  });
}
