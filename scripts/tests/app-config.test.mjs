import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appBuildPaths, iosProjectEnvironment, readAppConfig, syncAppConfig } from '../app-config.mjs';
import { syncModulePlatformConfig } from '../module-platform-config.mjs';
import { sampleApp } from './fixtures/app-config.mjs';
import { stageE2EFlows } from '../e2e-config.mjs';

function fixture(t, app = sampleApp()) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-app-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Keep the production package envelope, including module selection.
  const save = value => writeFileSync(path.join(root, 'package.json'), JSON.stringify({ valdi: { app: value, modules: [] } }));
  save(app);
  return { root, save };
}

test('absent icon preserves the exact config shape and copied no-icon consumers stay synchronous', t => {
  const { root } = fixture(t);
  assert.deepEqual(readAppConfig(root), sampleApp());
  assert.deepEqual(syncAppConfig(root), sampleApp());
  assert.equal(existsSync(path.join(root, 'ios/Generated/AppAssets.xcassets')), false);
  assert.equal(existsSync(path.join(root, 'android/app/build/generated/valdi-app/res/mipmap-mdpi')), false);
  const copied = path.join(root, 'app-config.mjs');
  cpSync(new URL('../app-config.mjs', import.meta.url), copied);
  const isolated = createRequire(import.meta.url)(copied);
  assert.deepEqual(isolated.readAppConfig(root), sampleApp());
  assert.deepEqual(isolated.syncAppConfig(root), sampleApp());
});

test('application identity is independent of native code identity and build paths use the configured name', t => {
  const { root, save } = fixture(t);
  const first = readAppConfig(root);
  assert.equal(first.android.applicationId, 'com.example.sample');
  assert.equal(first.native.androidNamespace, 'com.example.host');
  assert.equal(appBuildPaths(root).iosApp, path.join(root, 'ios/build/Build/Products/Debug-iphonesimulator/SampleApp.app'));
  assert.equal(appBuildPaths(root).iosProject, 'SampleApp.xcodeproj');
  assert.equal(iosProjectEnvironment(root, { KEEP: 'yes', VALDI_APP_NAME: 'stale' }).VALDI_APP_NAME, 'SampleApp');
  assert.equal(iosProjectEnvironment(root, { KEEP: 'yes' }).KEEP, 'yes');
  save({ ...sampleApp(), displayName: 'Renamed', android: { applicationId: 'com.example.renamed' } });
  assert.deepEqual(readAppConfig(root).native, first.native);
});

test('missing, unknown and unsafe configuration fails before generating files', t => {
  const { root, save } = fixture(t);
  const invalid = [
    undefined,
    { ...sampleApp(), name: '../escape' },
    { ...sampleApp(), name: 'Unsafe\n' },
    { ...sampleApp(), name: 'class' },
    { ...sampleApp(), displayName: 'bad\nname' },
    { ...sampleApp(), displayName: '' },
    { ...sampleApp(), displayName: '$(PRODUCT_NAME)' },
    { ...sampleApp(), displayName: '${PRODUCT_NAME}' },
    { ...sampleApp(), android: { applicationId: 'com.example;echo' } },
    { ...sampleApp(), android: { applicationId: 'com.class.app' } },
    { ...sampleApp(), android: { applicationId: 'com.example', typo: true } },
    { ...sampleApp(), ios: { bundleIdentifier: 'com.example.*' } },
    { ...sampleApp(), native: { androidNamespace: 'com.example', iosPrefix: 'NS' } },
    { ...sampleApp(), native: { androidNamespace: 'com.example', iosPrefix: 'Bad-Prefix' } },
    { ...sampleApp(), displayname: 'Typo' },
    { ...sampleApp(), icons: 'assets/app-icon.png' },
    ...[null, false, 42, {}, { source: 'assets/app-icon.png' }, ''].map(icon => ({ ...sampleApp(), icon })),
  ];
  for (const app of invalid) {
    save(app);
    assert.throws(() => syncAppConfig(root), /valdi\.app/, JSON.stringify(app));
    assert.equal(existsSync(path.join(root, 'ios')), false);
    assert.equal(existsSync(path.join(root, 'android')), false);
  }
});

test('optional icon is exposed unchanged and synchronized before native config outputs', async t => {
  const sharp = createRequire(import.meta.url)('../../tools/valdi-rolldown/node_modules/sharp');
  const app = { ...sampleApp(), icon: 'assets/app-icon.png' };
  const { root } = fixture(t, app);
  mkdirSync(path.join(root, 'assets'));
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#164abd' } })
    .png().toFile(path.join(root, app.icon));
  assert.deepEqual(readAppConfig(root), app);
  assert.deepEqual(syncAppConfig(root), app);
  assert.ok(existsSync(path.join(root, 'ios/Generated/AppAssets.xcassets/AppIcon.appiconset/AppIcon.png')));
  const original = readFileSync(path.join(root, 'ios/Generated/App.yml'));
  writeFileSync(path.join(root, app.icon), Buffer.from('not a PNG'));
  assert.throws(() => syncAppConfig(root), /invalid icon/);
  assert.deepEqual(readFileSync(path.join(root, 'ios/Generated/App.yml')), original);
});

test('generated Android and iOS configuration preserves Unicode and literal display-name characters', t => {
  const app = { ...sampleApp(), displayName: "Demo 中文 & <test> \"quoted\" 'single' @name $literal $$ $& $` $'" };
  const { root } = fixture(t, app);
  const base = path.join(root, 'ios/ValdiRoutes/Info.plist');
  mkdirSync(path.dirname(base), { recursive: true });
  writeFileSync(base, '<plist><dict><key>CFBundleDisplayName</key><string>$(VALDI_APP_DISPLAY_NAME)</string></dict></plist>');
  syncAppConfig(root);
  const resource = readFileSync(path.join(root, 'android/app/build/generated/valdi-app/res/values/valdi_app.xml'), 'utf8');
  assert.match(resource, /Demo 中文 &amp; &lt;test&gt;/);
  assert.match(resource, /\\&quot;quoted\\&quot;/);
  assert.match(resource, /@name \$literal/);
  const overlay = JSON.parse(readFileSync(path.join(root, 'ios/Generated/App.yml'), 'utf8'));
  assert.equal(overlay.targets.SampleApp.settings.base.PRODUCT_BUNDLE_IDENTIFIER, app.ios.bundleIdentifier);
  assert.equal(overlay.targets.SampleApp.settings.base.PRODUCT_NAME, 'SampleApp');
  syncModulePlatformConfig(root, []);
  const info = readFileSync(path.join(root, 'ios/Generated/AppInfo.plist'), 'utf8');
  assert.match(info, /Demo 中文 &amp; &lt;test&gt; &quot;quoted&quot; &apos;single&apos; @name \$literal/);
  assert.ok(info.includes("@name $literal $$ $&amp; $` $&apos;"));
  const modules = JSON.parse(readFileSync(path.join(root, 'ios/Generated/Modules.yml'), 'utf8'));
  assert.deepEqual(Object.keys(modules.targets), ['SampleApp']);
  const before = readFileSync(base, 'utf8');
  syncAppConfig(root);
  assert.equal(readFileSync(base, 'utf8'), before, 'generation does not rewrite the checked-in base plist');
});

test('E2E launch IDs, sibling flows and nested tests follow the selected platform without rewriting recordings', t => {
  const { root } = fixture(t);
  const source = path.join(root, '.argent/e2e');
  mkdirSync(path.join(source, '__baselines__/home'), { recursive: true });
  const home = 'steps:\n  - launch: { native: io.valdiroutes.app }\n  - echo: io.valdiroutes.app\n';
  writeFileSync(path.join(source, 'home.yaml'), home);
  writeFileSync(path.join(source, 'detail.yaml'), `steps:
  - run: home
  - tool: launch-app
    args: {bundleId: io.valdiroutes.app}
  - tool: e2e-execute
    args: {name: home, project_root: ${JSON.stringify(root)}}
  - launch: com.example.unrelated
`);
  writeFileSync(path.join(source, '__baselines__/home/ios.png'), 'baseline bytes');
  for (const platform of ['android', 'ios']) {
    const target = stageE2EFlows(root, platform, 'detail');
    const staged = JSON.parse(readFileSync(target, 'utf8'));
    const id = platform === 'android' ? 'com.example.sample' : 'com.example.sample-ios';
    assert.equal(staged.steps[0].run, 'home');
    assert.equal(staged.steps[1].args.bundleId, id);
    const sibling = JSON.parse(readFileSync(path.join(path.dirname(target), 'home.yaml'), 'utf8'));
    assert.equal(sibling.steps[0].launch.native, id);
    assert.equal(sibling.steps[1].echo, 'io.valdiroutes.app');
    assert.equal(staged.steps[3].launch, 'com.example.unrelated');
    const nested = path.join(staged.steps[2].args.project_root, '.argent/e2e/home.yaml');
    assert.equal(readFileSync(nested, 'utf8'), readFileSync(path.join(path.dirname(target), 'home.yaml'), 'utf8'));
    assert.equal(readFileSync(path.join(path.dirname(target), '__baselines__/home/ios.png'), 'utf8'), 'baseline bytes');
  }
  assert.equal(readFileSync(path.join(source, 'home.yaml'), 'utf8'), home);
  assert.throws(() => stageE2EFlows(root, 'android', '../outside.yaml'), /flow must be/);
});
