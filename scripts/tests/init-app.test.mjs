import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CORE_MODULES, deriveIosPrefix, initApp } from '../init-app.mjs';

const repository = path.resolve(import.meta.dirname, '../..');

function seedHostFixture(t) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'valdi-init-app-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));

  for (const relative of [
    'package.json',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/java/io/valdiroutes/app/App.kt',
    'android/app/src/main/java/io/valdiroutes/app/MainActivity.kt',
    'android/app/src/main/java/io/valdiroutes/app/features/picker/PickerScreen.kt',
    'android/app/src/main/java/io/valdiroutes/app/navigation/AppRoot.kt',
    'android/app/src/main/java/io/valdiroutes/app/runtime/ValdiHost.kt',
    'android/app/src/test/java/io/valdiroutes/app/RouteDataTest.kt',
    'ios/project.yml',
    'ios/ValdiRoutes/App.swift',
    'ios/ValdiRoutes/Info.plist',
    'ios/ValdiRoutes/ValdiRoutes-Bridging-Header.h',
    'ios/Tests/run-route-payload-tests.sh',
    'ios/Tests/run-startup-splash-state-tests.sh',
  ]) {
    const dest = path.join(fixture, relative);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(path.join(repository, relative), dest);
  }
  mkdirSync(path.join(fixture, 'ios/ValdiRoutes/Features/Picker'), { recursive: true });
  writeFileSync(path.join(fixture, 'ios/ValdiRoutes/Features/Picker/PickerScreen.swift'), '// sample\n');
  const pkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  delete pkg.valdi.app.icon;
  pkg.valdi.modules = ['app_pages'];
  mkdirSync(path.join(fixture, 'valdi/modules/app_pages/src'), { recursive: true });
  writeFileSync(path.join(fixture, 'valdi/modules/app_pages/src/index.ts'), 'export {};\n');
  writeFileSync(path.join(fixture, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  return fixture;
}

test('deriveIosPrefix avoids reserved Apple framework prefixes and handles PascalCase and single-word names', () => {
  assert.equal(deriveIosPrefix('AcmeRoutes'), 'AR');
  assert.equal(deriveIosPrefix('SuperCloud'), 'SCX');
  assert.equal(deriveIosPrefix('NextStep'), 'NSX');
  assert.equal(deriveIosPrefix('demo'), 'DE');
});

test('invalid options and --dry-run leave repository files completely untouched', t => {
  const fixture = seedHostFixture(t);
  const beforePkg = readFileSync(path.join(fixture, 'package.json'), 'utf8');

  assert.throws(() => initApp({ root: fixture, name: '123Invalid' }), /valdi\.app: invalid name/);
  assert.throws(() => initApp({ root: fixture, appId: 'com.class.app' }), /valdi\.app: invalid android\.applicationId/);
  assert.throws(() => initApp({ root: fixture, iosPrefix: 'UI' }), /Apple\/framework prefix/);
  assert.equal(readFileSync(path.join(fixture, 'package.json'), 'utf8'), beforePkg);
  assert.equal(existsSync(path.join(fixture, 'android/app/src/main/java/io/valdiroutes/app/App.kt')), true);

  const preview = initApp({
    root: fixture,
    name: 'AcmeRoutes',
    displayName: 'Acme 路由',
    appId: 'com.acme.routes',
    minimal: true,
    dryRun: true,
  });
  assert.equal(preview.dryRun, true);
  assert.ok(preview.actions.length >= 5);
  assert.equal(readFileSync(path.join(fixture, 'package.json'), 'utf8'), beforePkg);
  assert.equal(existsSync(path.join(fixture, 'ios/AcmeRoutes')), false);

  const help = spawnSync(process.execPath, [path.join(repository, 'scripts/init-app.mjs'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: pnpm init-app/);
});

test('rebranding relocates Android packages, updates shared module imports, renames iOS target, and stays reversible', t => {
  const fixture = seedHostFixture(t);
  mkdirSync(path.join(fixture, 'ios/ValdiRoutes.xcodeproj'), { recursive: true });

  const first = initApp({
    root: fixture,
    name: 'AcmeRoutes',
    displayName: 'Acme 路由',
    appId: 'com.acme.routes',
    skipIosProject: true,
  });
  assert.equal(first.nextApp.name, 'AcmeRoutes');
  assert.equal(first.nextApp.native.iosPrefix, 'AR');

  const pkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'acme-routes');
  assert.equal(pkg.valdi.app.android.applicationId, 'com.acme.routes');
  assert.equal(pkg.valdi.app.ios.bundleIdentifier, 'com.acme.routes');
  assert.equal(pkg.valdi.app.native.androidNamespace, 'com.acme.routes');

  assert.equal(existsSync(path.join(fixture, 'android/app/src/main/java/io')), false);
  const valdiHost = readFileSync(
    path.join(fixture, 'android/app/src/main/java/com/acme/routes/runtime/ValdiHost.kt'),
    'utf8',
  );
  assert.match(valdiHost, /^package com\.acme\.routes$/m);
  assert.match(valdiHost, /^import io\.valdiroutes\.app\.ValdiOta$/m);
  assert.match(valdiHost, /^import io\.valdiroutes\.app\.BottomSheetBinders$/m);

  const appRoot = readFileSync(
    path.join(fixture, 'android/app/src/main/java/com/acme/routes/navigation/AppRoot.kt'),
    'utf8',
  );
  assert.match(appRoot, /^package com\.acme\.routes$/m);
  assert.match(appRoot, /^import io\.valdiroutes\.app\.ValdiOta$/m);

  const testKt = readFileSync(
    path.join(fixture, 'android/app/src/test/java/com/acme/routes/RouteDataTest.kt'),
    'utf8',
  );
  assert.match(testKt, /^package com\.acme\.routes$/m);

  assert.equal(existsSync(path.join(fixture, 'ios/ValdiRoutes')), false);
  assert.equal(existsSync(path.join(fixture, 'ios/ValdiRoutes.xcodeproj')), false);
  assert.equal(existsSync(path.join(fixture, 'ios/AcmeRoutes/AcmeRoutes-Bridging-Header.h')), true);
  const projectYml = readFileSync(path.join(fixture, 'ios/project.yml'), 'utf8');
  assert.match(projectYml, /- path: AcmeRoutes\b/);
  assert.match(projectYml, /SWIFT_OBJC_BRIDGING_HEADER: AcmeRoutes\/AcmeRoutes-Bridging-Header\.h\b/);
  assert.match(
    readFileSync(path.join(fixture, 'ios/Tests/run-route-payload-tests.sh'), 'utf8'),
    /\$ios_dir\/AcmeRoutes\/Navigation\/RoutePayload\.swift/,
  );
  assert.match(readFileSync(path.join(fixture, 'ios/Generated/AppInfo.plist'), 'utf8'), /Acme 路由/);

  // Rebranding back to io.valdiroutes.app removes redundant same-package imports cleanly.
  initApp({
    root: fixture,
    name: 'ValdiRoutes',
    appId: 'io.valdiroutes.app',
    iosPrefix: 'VR',
    skipIosProject: true,
  });
  const revertedHost = readFileSync(
    path.join(fixture, 'android/app/src/main/java/io/valdiroutes/app/runtime/ValdiHost.kt'),
    'utf8',
  );
  assert.doesNotMatch(revertedHost, /^import io\.valdiroutes\.app\.ValdiOta$/m);
});

test('--minimal strips optional modules and demo clutter while typechecking, passing codegen --check, and building', t => {
  const fixture = seedHostFixture(t);

  // Copy the core modules plus representative optional modules (host, bazel, cpp) and generated bindings.
  for (const mod of [...CORE_MODULES, 'app_video', 'app_vision', 'bluetooth', 'permissions']) {
    cpSync(path.join(repository, 'valdi/modules', mod), path.join(fixture, 'valdi/modules', mod), {
      recursive: true,
      dereference: false,
    });
    const moduleNodeModules = path.join(fixture, 'valdi/modules', mod, 'node_modules');
    rmSync(moduleNodeModules, { recursive: true, force: true });
    symlinkSync(path.join(repository, 'valdi/node_modules'), moduleNodeModules, 'junction');
  }
  cpSync(path.join(repository, 'android/app/generated/valdi'), path.join(fixture, 'android/app/generated/valdi'), {
    recursive: true,
  });
  cpSync(path.join(repository, 'ios/Generated/valdi'), path.join(fixture, 'ios/Generated/valdi'), {
    recursive: true,
  });

  // Seed optional clutter that --minimal must clean up, plus runtime exporters that must be kept.
  for (const dir of ['vision', '.argent/e2e', 'scripts/e2e', 'scripts/tests', 'tools/valdi-rolldown/tests']) {
    mkdirSync(path.join(fixture, dir), { recursive: true });
    writeFileSync(path.join(fixture, dir, 'marker.txt'), 'remove-me\n');
  }
  mkdirSync(path.join(fixture, 'scripts/maintainer'), { recursive: true });
  for (const name of ['export-android.sh', 'export-ios.sh', 'package-swift-runtime.mjs', 'runtime-info.mjs', 'release.mjs', 'upstream.mjs']) {
    cpSync(path.join(repository, 'scripts/maintainer', name), path.join(fixture, 'scripts/maintainer', name));
  }

  // Wire valdi sources, node_modules, scripts/lib, and rolldown compiler scripts into the isolated fixture.
  cpSync(path.join(repository, 'scripts/lib'), path.join(fixture, 'scripts/lib'), { recursive: true });
  symlinkSync(path.join(repository, 'valdi/.valdi-sources'), path.join(fixture, 'valdi/.valdi-sources'), 'junction');
  symlinkSync(path.join(repository, 'valdi/node_modules'), path.join(fixture, 'valdi/node_modules'), 'junction');
  const toolSrc = path.join(repository, 'tools/valdi-rolldown');
  const toolDst = path.join(fixture, 'tools/valdi-rolldown');
  mkdirSync(toolDst, { recursive: true });
  for (const name of ['node_modules', 'vendor']) {
    symlinkSync(path.join(toolSrc, name), path.join(toolDst, name), 'junction');
  }
  for (const entry of ['codegen', 'runtime-native', 'archive.ts', 'build.ts', 'codegen.ts', 'cpp-modules.ts', 'editor-config.ts',
    'hermes.ts', 'localization.ts', 'module-build.ts', 'module-selection.ts', 'modules.mjs', 'package.json',
    'pipeline.ts', 'resources.ts', 'routes-transform.ts', 'runtime-module-ids.ts', 'tsconfig.ts',
    'typecheck.ts', 'typescript-project.ts', 'valdiTs.ts']) {
    cpSync(path.join(toolSrc, entry), path.join(toolDst, entry), { recursive: true });
  }

  const pkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  pkg.valdi.modules = [...CORE_MODULES, 'app_video', 'app_vision', 'bluetooth', 'permissions'];
  writeFileSync(path.join(fixture, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

  initApp({
    root: fixture,
    name: 'MinimalStarter',
    displayName: '极简启动模板',
    appId: 'com.minimal.starter',
    minimal: true,
    skipIosProject: true,
  });

  const updatedPkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  assert.deepEqual(updatedPkg.valdi.modules, CORE_MODULES);
  assert.equal(updatedPkg.scripts['release:pack'], undefined);
  assert.equal(updatedPkg.scripts['test:e2e:android'], undefined);

  for (const removed of [
    'valdi/modules/app_video',
    'valdi/modules/app_vision',
    'valdi/modules/bluetooth',
    'valdi/modules/permissions',
    'valdi/modules/app_pages/assets',
    'valdi/modules/app_pages/cpp',
    'valdi/modules/app_pages/module.json',
    'android/app/generated/valdi/app_video.kt',
    'android/app/generated/valdi/bluetooth.kt',
    'android/app/generated/valdi/permissions.kt',
    'ios/Generated/valdi/AppVideo',
    'ios/Generated/valdi/Bluetooth',
    'ios/Generated/valdi/Permissions',
    'vision',
    '.argent',
    'scripts/e2e',
    'scripts/tests',
    'tools/valdi-rolldown/tests',
    'scripts/maintainer/release.mjs',
    'scripts/maintainer/upstream.mjs',
    'android/app/src/main/java/com/minimal/starter/features',
    'ios/MinimalStarter/Features',
  ]) {
    assert.equal(existsSync(path.join(fixture, removed)), false, `Expected ${removed} to be removed`);
  }

  assert.equal(existsSync(path.join(fixture, 'scripts/maintainer/export-android.sh')), true);
  assert.equal(existsSync(path.join(fixture, 'scripts/maintainer/export-ios.sh')), true);
  assert.doesNotMatch(
    readFileSync(path.join(fixture, 'android/app/src/main/java/com/minimal/starter/App.kt'), 'utf8'),
    /NativeExamples/,
  );
  assert.doesNotMatch(
    readFileSync(path.join(fixture, 'ios/MinimalStarter/App.swift'), 'utf8'),
    /NativeExamples/,
  );

  const generatedKt = readFileSync(path.join(fixture, 'android/app/generated/valdi/ValdiNativeModules.kt'), 'utf8');
  assert.doesNotMatch(generatedKt, /VideoModuleFactoryImpl|PermissionModuleFactoryImpl/);
  const generatedObjc = readFileSync(path.join(fixture, 'ios/Generated/valdi/ValdiNativeModules.m'), 'utf8');
  assert.doesNotMatch(generatedObjc, /VRVideoService/);

  const tsx = path.join(toolDst, 'node_modules/tsx/dist/cli.mjs');
  const typecheck = spawnSync(process.execPath, [tsx, 'typecheck.ts'], { cwd: toolDst, encoding: 'utf8' });
  assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);

  const codegenCheck = spawnSync(process.execPath, [
    tsx, 'codegen.ts',
    '--kotlin-out', path.join(fixture, 'android/app/generated/valdi'),
    '--objc-out', path.join(fixture, 'ios/Generated/valdi'),
    '--objc-framework', 'ValdiRuntime',
    '--cpp-modules-out', path.join(fixture, 'valdi/modules'),
    '--check',
  ], { cwd: toolDst, encoding: 'utf8' });
  assert.equal(codegenCheck.status, 0, `${codegenCheck.stdout}\n${codegenCheck.stderr}`);

  // Seed staged Bazel bundle output for theme_bridge inside fixture so full packaging stays hermetic on clean CI runners.
  const stagedThemeBridge = path.join(fixture, 'module-build/out/android/theme_bridge/bundle-debug');
  mkdirSync(path.join(stagedThemeBridge, 'resources/ts'), { recursive: true });
  mkdirSync(path.join(stagedThemeBridge, 'resources/android'), { recursive: true });
  writeFileSync(path.join(stagedThemeBridge, 'theme_bridge.valdimodule'), 'fixture-archive');

  const outDir = path.join(fixture, 'out');
  const resDir = path.join(fixture, 'res');
  const build = spawnSync(process.execPath, [
    tsx, 'build.ts', '--native-platform', 'android', '--out', outDir, '--res', resDir,
  ], { cwd: toolDst, encoding: 'utf8' });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  assert.equal(existsSync(path.join(outDir, 'app_pages.valdimodule')), true);
  assert.equal(existsSync(path.join(outDir, 'theme_bridge.valdimodule')), true);
});
