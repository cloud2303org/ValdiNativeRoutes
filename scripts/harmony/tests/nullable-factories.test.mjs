import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimePatchFiles } from '../../upstream-runtime-patches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = path.join(root, '.tools/harmony/upstream');
const core = 'src/valdi_modules/src/valdi/valdi_core';
const propertyList = `${core}/src/utils/PropertyList.ts`;
const overlayFiles = [
  ...runtimePatchFiles,
  'valdi_core/src/valdi_core/cpp/Context/PlatformType.hpp',
  'valdi_core/valdi_core.djinni', 'valdi_core/generated-src/cpp/valdi_core/Platform.hpp',
  'valdi_core/generated-src/cpp/valdi_core/AssetOutputType.hpp',
  ...['JavaScript/JavaScriptRuntime.cpp', 'Context/ViewNodeAssetHandler.cpp', 'RuntimeManager.cpp',
    'Attributes/DefaultAttributes.cpp', 'Views/GlobalViewFactories.cpp', 'Context/ViewManagerContext.cpp',
    'Views/ViewPreloader.cpp', 'Views/ViewPreloader.hpp'].map(p => `valdi/src/valdi/runtime/${p}`),
  ...['src/JSXBootstrap.ts', 'src/ValdiRuntime.d.ts', 'src/Asset.ts', 'src/DeviceBridge.d.ts',
    'src/Device.ts', 'test/JSXPlatformTest.cjs'].map(p => `${core}/${p}`),
  propertyList,
  'src/valdi_modules/src/valdi/valdi_tsx/src/JSX.ts',
];
const pin = '15feb6530ceecb971f4c8519ea8ab77474b959db';

test('platform overlay applies to the pin and is byte-idempotent, including earlier overlays', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'harmony-overlay-'));
  try {
    const gitSource = process.env.VALDI_FORK_SOURCE ?? path.resolve(root, '../Valdi-node-only');
    for (const file of overlayFiles) {
      mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
      writeFileSync(path.join(temporary, file),
        execFileSync('git', ['-C', gitSource, 'show', `${pin}:${file}`], { maxBuffer: 16 * 1024 * 1024 }));
    }
    const pinnedPropertyList = readFileSync(path.join(temporary, propertyList));
    const apply = () => execFileSync(process.execPath, [path.join(root, 'scripts/harmony/apply-platform.mjs'), temporary]);
    apply();
    const first = overlayFiles.map(file => readFileSync(path.join(temporary, file)));
    apply();
    overlayFiles.forEach((file, i) => {
      assert.deepEqual(readFileSync(path.join(temporary, file)), first[i], file);
      const prepared = readFileSync(path.join(source, file));
      if (file === propertyList) {
        // Shared staging can still be the pin until the next isolated preparation.
        assert.ok(prepared.equals(pinnedPropertyList) || prepared.equals(first[i]),
          `prepared source drift: ${file}`);
      } else {
        assert.deepEqual(first[i], prepared, `prepared source drift: ${file}`);
      }
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('production C++ cache, pool and preload methods execute against pinned headers', { timeout: 120000 }, () => {
  // Reuse only the already-built real host core/dependency archives; no build or
  // mutation of the business harness. The tested runtime units are freshly compiled.
  const host = path.join(root, 'harmony/business-build/.artifacts/host');
  assert.ok(existsSync(path.join(host, 'libreal_valdi_host.a')), 'Prepare the real Valdi host core archives first');
  const temporary = mkdtempSync(path.join(tmpdir(), 'harmony-null-factories-'));
  try {
    const rows = JSON.parse(readFileSync(path.join(host, 'compile_commands.json'), 'utf8'));
    const row = rows.find(row => row.file.endsWith('/runtime/Runtime.cpp'));
    const base = row.arguments ?? row.command.match(/(?:[^\s"]+|"[^"]*")+/g).map(arg => arg.replace(/^"|"$/g, ''));
    const flags = base.slice(1);
    flags.splice(flags.indexOf('-o'), 2);
    flags.splice(flags.indexOf('-c'), 2);
    // The sole source seam replaces attribute resolution, whose default binding
    // graph is unrelated to nullable factory consumers. Keep its real constructor.
    const attributes = readFileSync(path.join(source, 'valdi/src/valdi/runtime/Attributes/AttributesManager.cpp'), 'utf8');
    const getter = /SharedBoundAttributes AttributesManager::getAttributesForClass\(const StringBox& className\) noexcept \{[\s\S]*?\n\}/;
    assert.equal([...attributes.matchAll(new RegExp(getter.source, 'g'))].length, 1);
    const attributesFile = path.join(temporary, 'AttributesManager.cpp');
    writeFileSync(attributesFile, attributes.replace(getter, ''));
    const units = [
      path.join(root, 'scripts/harmony/tests/nullable-factories.cpp'), attributesFile,
      ...['Views/GlobalViewFactories.cpp', 'Views/ViewPreloader.cpp', 'Views/ViewFactory.cpp',
        'Context/ViewManagerContext.cpp', 'Utils/MainThreadManager.cpp', 'Attributes/AttributeIds.cpp',
        'Attributes/AttributeHandler.cpp'].map(file => path.join(source, 'valdi/src/valdi/runtime', file)),
    ];
    const objects = units.map((unit, i) => {
      const object = path.join(temporary, `${i}.o`);
      execFileSync(base[0], [...flags, '-c', unit, '-o', object], { cwd: row.directory, stdio: 'pipe' });
      return object;
    });
    const executable = path.join(temporary, 'nullable-factories');
    execFileSync(base[0], ['-Wl,-dead_strip', ...objects,
      path.join(host, 'libreal_valdi_host.a'), path.join(host, 'deps/fmt/libfmt.a'),
      path.join(host, 'deps/jsoncpp/src/lib_json/libjsoncpp.a'), '-o', executable],
    { stdio: 'pipe' });
    const result = execFileSync(executable, [], { encoding: 'utf8', timeout: 15000 });
    assert.match(result, /PASS 6 real-header runtime nullable-factory regressions/);
    console.log(result.trim());
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
