import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkRuntime, checkSources, checkVision, runPnpm } from '../prerequisites.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fixture(t, config = 'debug') {
  const root = mkdtempSync(path.join(tmpdir(), 'valdiroutes-prerequisites-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  write('package.json', JSON.stringify({ valdi: { modules: ['app_foundation', 'app_pages'] } }));
  write('ota/fingerprint.json', JSON.stringify({ valdi: ['valdi/MODULE.bazel', 'valdi/bzl/patches', 'valdi/bzl/node_compiler', 'tools/valdi-rolldown/runtime-module.ts'] }));
  write('valdi/MODULE.bazel', 'pinned Valdi version');
  write('valdi/BUILD.bazel', 'native_deps = ["//modules/app_pages/cpp:native"]');
  write('valdi/modules/runtime-packages.bazelrc', 'common --deleted_packages=modules/app_foundation,modules/app_pages,modules/unused');
  write('valdi/modules/runtime-cpp.bzl', 'CPP_IMPLEMENTATIONS = ["//modules/app_pages/cpp:native"]');
  write('valdi/bzl/module_cpp/module.bzl', 'def module_cpp_library(module_name): pass');
  write('valdi/modules/app_pages/src/index.ts', 'export {};');
  write('valdi/modules/app_foundation/src/index.ts', 'export {};');
  write('valdi/modules/unused/src/index.ts', 'export {};');
  write('valdi/modules/app_pages/cpp/src/Module.cpp', 'original implementation');
  write('valdi/modules/app_pages/cpp/BUILD.bazel', 'deps = ["//modules/app_foundation/cpp:bindings"]');
  write('valdi/modules/app_foundation/cpp/generated/valdi_modules/app_foundation/app_foundation.hpp', 'original shared binding');
  write('valdi/bzl/patches/rules_python/toolchain.patch', 'original toolchain patch');
  write('tools/valdi-rolldown/runtime-module.ts', 'original Node compiler');
  mkdirSync(path.join(root, 'scripts'));
  cpSync(path.join(repository, 'scripts/ota.mjs'), path.join(root, 'scripts/ota.mjs'));
  cpSync(path.join(repository, 'scripts/ota-delta.mjs'), path.join(root, 'scripts/ota-delta.mjs'));
  cpSync(path.join(repository, 'scripts/hdiff-tool.mjs'), path.join(root, 'scripts/hdiff-tool.mjs'));
  cpSync(path.join(repository, 'scripts/hdiff-tool.json'), path.join(root, 'scripts/hdiff-tool.json'));
  cpSync(path.join(repository, 'scripts/prerequisites.mjs'), path.join(root, 'scripts/prerequisites.mjs'));
  cpSync(path.join(repository, 'scripts/native-cpp.mjs'), path.join(root, 'scripts/native-cpp.mjs'));
  cpSync(path.join(repository, 'scripts/native-modules.mjs'), path.join(root, 'scripts/native-modules.mjs'));
  cpSync(path.join(repository, 'scripts/module-platform-config.mjs'), path.join(root, 'scripts/module-platform-config.mjs'));
  cpSync(path.join(repository, 'scripts/app-config.mjs'), path.join(root, 'scripts/app-config.mjs'));
  write('tools/valdi-rolldown/modules.mjs', readFileSync(path.join(repository, 'tools/valdi-rolldown/modules.mjs'), 'utf8'));
  const info = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/ota.mjs'), 'valdi-hash', 'android', config], { encoding: 'utf8' }));
  write('android/app/libs/valdi_runtime.aar', 'runtime artifact');
  write('android/app/libs/valdi_ota.json', JSON.stringify(info));
  return { root, write, info };
}

test('a matching export stays valid after frontend or host-only changes', t => {
  const { root, write } = fixture(t);
  write('valdi/modules/app_pages/src/HomePage.tsx', 'new frontend');
  write('android/app/src/main/Host.kt', 'new host');
  assert.doesNotThrow(() => checkRuntime(root, 'android'));
});

test('a missing runtime gives an export command without creating artifacts', t => {
  const { root } = fixture(t);
  rmSync(path.join(root, 'android/app/libs/valdi_runtime.aar'));
  assert.throws(() => checkRuntime(root, 'android'), /runtime is missing.*\n.*export-android\.sh/);
  assert.equal(existsSync(path.join(root, 'android/app/libs/valdi_runtime.aar')), false);
});

test('changed C++ requires a new export and preserves the release configuration', t => {
  const { root, write } = fixture(t, 'release');
  write('valdi/modules/app_pages/cpp/src/Module.cpp', 'changed implementation');
  assert.throws(() => checkRuntime(root, 'android'), /out of date.*\n.*export-android\.sh release/);
});

test('a changed shared C++ binding or module build rule invalidates the export', t => {
  const { root, write } = fixture(t);
  write('valdi/modules/app_foundation/cpp/generated/valdi_modules/app_foundation/app_foundation.hpp', 'changed shared binding');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
  const another = fixture(t);
  another.write('valdi/modules/app_pages/cpp/BUILD.bazel', 'deps = []');
  assert.throws(() => checkRuntime(another.root, 'android'), /runtime is out of date/);
});

test('host C++ selection invalidates the export while disabled-module C++ does not', t => {
  const { root, write } = fixture(t);
  write('valdi/modules/unused/src/index.ts', 'export {};');
  write('valdi/modules/unused/cpp/src/Unused.cpp', 'unselected implementation');
  assert.doesNotThrow(() => checkRuntime(root, 'android'));
  write('valdi/BUILD.bazel', 'native_deps = []');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('generated C++ selection and common build rules invalidate the export', t => {
  const selection = fixture(t);
  selection.write('valdi/modules/runtime-cpp.bzl', 'CPP_IMPLEMENTATIONS = []');
  assert.throws(() => checkRuntime(selection.root, 'android'), /runtime is out of date/);
  const rules = fixture(t);
  rules.write('valdi/bzl/module_cpp/module.bzl', 'def module_cpp_library(module_name): fail("changed")');
  assert.throws(() => checkRuntime(rules.root, 'android'), /runtime is out of date/);
});

test('a changed fork pin invalidates the export even when C++ is unchanged', t => {
  const { root, write } = fixture(t);
  write('valdi/MODULE.bazel', 'a different immutable fork commit');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('a changed local dependency-rule patch invalidates the export', t => {
  const { root, write } = fixture(t);
  write('valdi/bzl/patches/rules_python/toolchain.patch', 'changed toolchain patch');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('a changed runtime compiler invalidates the export', t => {
  const { root, write } = fixture(t);
  write('tools/valdi-rolldown/runtime-module.ts', 'changed Node compiler');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('Windows routes pnpm through bundled Corepack without invoking a batch shim', t => {
  const platform = process.platform;
  const executable = process.env.npm_execpath;
  t.after(() => {
    if (executable === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = executable;
  });
  delete process.env.npm_execpath;
  if (platform !== 'win32') {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    t.after(() => Object.defineProperty(process, 'platform', { value: platform }));
  }
  runPnpm(['--version'], repository);
});

test('the removed legacy backend environment variable cannot select a compiler or invalidate Node exports', t => {
  const previous = process.env.VALDI_COMPILER_BACKEND;
  t.after(() => {
    if (previous === undefined) delete process.env.VALDI_COMPILER_BACKEND;
    else process.env.VALDI_COMPILER_BACKEND = previous;
  });
  const { root } = fixture(t);
  process.env.VALDI_COMPILER_BACKEND = previous === 'swift' ? 'node' : 'swift';
  assert.doesNotThrow(() => checkRuntime(root, 'android'));
});

test('invalid metadata and a stamp from another platform are rejected', t => {
  const { root, write, info } = fixture(t);
  write('android/app/libs/valdi_ota.json', '{broken');
  assert.throws(() => checkRuntime(root, 'android'), /valdi_ota.json is invalid/);
  write('android/app/libs/valdi_ota.json', JSON.stringify({ ...info, platform: 'ios' }));
  assert.throws(() => checkRuntime(root, 'android'), /does not describe a valid android export/);
});

test('an iOS export is checked independently against its platform', t => {
  const { root, write, info } = fixture(t);
  mkdirSync(path.join(root, 'ios/Frameworks/ValdiRuntime.xcframework'), { recursive: true });
  write('ios/Frameworks/valdi_ota.json', JSON.stringify({ ...info, platform: 'ios' }));
  assert.doesNotThrow(() => checkRuntime(root, 'ios'));
});

test('a clean checkout reports missing sources with a preparation command', t => {
  const { root } = fixture(t);
  assert.throws(() => checkSources(root), /Valdi sources are not prepared.*\n.*prepare-valdi\.mjs/);
});

test('Android Vision requires every shared library and a compatible shared receipt', t => {
  const { root, write } = fixture(t);
  const lock = { opencv: { version: '4.12.0', sha256: 'opencv-sha' }, ncnn: { version: '20250503', sha256: 'ncnn-sha' } };
  write('vision/vendor-lock.json', JSON.stringify(lock));
  const patch = 'Android-only highgui source hook';
  write('vision/patches/opencv-mobile-android/INIT_MODULE_SOURCES_opencv_highgui.cmake', patch);
  const stamp = (opencv = lock.opencv, ncnn = lock.ncnn) => JSON.stringify({
    target: 'android-arm64', opencv: opencv.version, ncnn: ncnn.version,
    sourcePins: { opencv: opencv.sha256, ncnn: ncnn.sha256 },
    cpuOnly: true,
    linkage: 'shared',
    android: {
      abi: 'arm64-v8a', api: 28, stl: 'c++_shared', cxxStandard: 20,
      rtti: true, exceptions: true, ndkRevision: '27.1.12297006', videoCaptureBackend: 'none',
    },
    patches: { opencvAndroidHighgui: createHash('sha256').update(patch).digest('hex') },
  });
  for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn']) {
    write(`vision/vendor/install/android-arm64/lib/lib${name}.a`, 'archive');
  }
  write('vision/vendor/install/android-arm64/native-routes-vision.json', stamp());
  // A previous static install must not let prebuild skip shared preparation.
  assert.throws(() => checkVision(root, 'android'), /prepare-native\.cjs --target android-arm64/);
  for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui']) {
    write(`vision/vendor/install/android-arm64/shared/lib/lib${name}.so`, 'shared library');
  }
  assert.throws(() => checkVision(root, 'android'), /prepare-native\.cjs --target android-arm64/);
  write('vision/vendor/install/android-arm64/shared/lib/libncnn.so', 'shared library');
  assert.throws(() => checkVision(root, 'android'), /another vision\/vendor-lock\.json/);
  write('vision/vendor/install/android-arm64/shared/native-routes-vision.json', stamp());
  assert.doesNotThrow(() => checkVision(root, 'android'));
  for (const patch of [
    { linkage: 'static' },
    { cpuOnly: false },
    { android: { ...JSON.parse(stamp()).android, abi: 'x86_64' } },
    { android: { ...JSON.parse(stamp()).android, stl: 'c++_static' } },
    { android: { ...JSON.parse(stamp()).android, exceptions: false } },
    { android: { ...JSON.parse(stamp()).android, videoCaptureBackend: 'v4l2' } },
    { patches: { opencvAndroidHighgui: 'outdated-hook' } },
  ]) {
    write('vision/vendor/install/android-arm64/shared/native-routes-vision.json',
      JSON.stringify({ ...JSON.parse(stamp()), ...patch }));
    assert.throws(() => checkVision(root, 'android'), /shared.*configuration/);
  }
  write('vision/vendor/install/android-arm64/shared/native-routes-vision.json', stamp());
  // A changed lock invalidates the existing build.
  write('vision/vendor-lock.json', JSON.stringify({ ...lock, ncnn: { version: '20250504', sha256: 'other-ncnn-sha' } }));
  assert.throws(() => checkVision(root, 'android'), /another vision\/vendor-lock\.json/);
});

test('iOS Vision still accepts its existing static XCFramework and preparation receipts', t => {
  const { root, write } = fixture(t);
  const lock = { opencv: { version: '4.13.0', sha256: 'opencv-sha' }, ncnn: { version: '20260526', sha256: 'ncnn-sha' } };
  write('vision/vendor-lock.json', JSON.stringify(lock));
  write('vision/vendor/install/ios/VisionDependencies.xcframework/Info.plist', 'static XCFramework metadata');
  for (const target of ['ios-arm64', 'ios-simulator-arm64']) {
    write(`vision/vendor/install/${target}/native-routes-vision.json`, JSON.stringify({
      target, opencv: lock.opencv.version, ncnn: lock.ncnn.version,
      sourcePins: { opencv: lock.opencv.sha256, ncnn: lock.ncnn.sha256 }, cpuOnly: true,
    }));
  }
  assert.doesNotThrow(() => checkVision(root, 'ios'));
});
