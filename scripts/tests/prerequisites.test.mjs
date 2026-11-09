import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRuntime, checkSources, runPnpm } from '../prerequisites.mjs';
import { runtimeInfo } from '../runtime-info.mjs';
import { checkVision } from '../../valdi/modules/app_vision/scripts/check-dependencies.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
function fixture(t, platform = 'android', config = 'debug') {
  const root = mkdtempSync(path.join(tmpdir(), 'valdiroutes-prerequisites-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  const directory = platform === 'android' ? 'android/app/libs' : 'ios/Frameworks';
  const artifact = platform === 'android' ? `${directory}/valdi_runtime.aar` : `${directory}/ValdiRuntime.xcframework/Info.plist`;
  write(artifact, 'manually exported runtime');
  write(`${directory}/valdi_ota.json`, JSON.stringify(runtimeInfo(platform, config)));
  return { root, write, directory, artifact };
}

test('manual runtime metadata contains only platform and build configuration', () => {
  assert.deepEqual(runtimeInfo('android', 'debug'), { platform: 'android', config: 'debug' });
  assert.deepEqual(runtimeInfo('ios', 'release'), { platform: 'ios', config: 'release' });
  assert.throws(() => runtimeInfo('web', 'debug'));
  assert.throws(() => runtimeInfo('ios', 'unknown'));
});

test('native builds accept a manual runtime after source changes without fingerprint inputs', t => {
  for (const platform of ['android', 'ios']) {
    const { root, write } = fixture(t, platform);
    write('valdi/MODULE.bazel', 'a changed fork pin');
    write('valdi/modules/app_pages/cpp/src/Module.cpp', 'a changed implementation');
    write('tools/valdi-rolldown/runtime-module.ts', 'a changed compiler');
    assert.doesNotThrow(() => checkRuntime(root, platform));
    assert.equal(existsSync(path.join(root, 'ota/fingerprint.json')), false);
    assert.equal(existsSync(path.join(root, 'scripts/ota.mjs')), false);
  }
});

test('missing runtime artifacts fail with explicit export instructions without creating outputs', t => {
  for (const platform of ['android', 'ios']) {
    const { root, artifact } = fixture(t, platform);
    rmSync(path.join(root, platform === 'android' ? artifact : 'ios/Frameworks/ValdiRuntime.xcframework'), { recursive: true, force: true });
    assert.throws(() => checkRuntime(root, platform), new RegExp(`runtime is missing.*\\n.*export-${platform}\\.sh`));
    assert.equal(existsSync(path.join(root, artifact)), false);
  }
});

test('invalid runtime metadata and wrong platform are rejected without source hashing', t => {
  const { root, write, directory } = fixture(t);
  write(`${directory}/valdi_ota.json`, '{broken');
  assert.throws(() => checkRuntime(root, 'android'), /valdi_ota.json is invalid/);
  write(`${directory}/valdi_ota.json`, JSON.stringify(runtimeInfo('ios', 'debug')));
  assert.throws(() => checkRuntime(root, 'android'), /does not describe a valid android export/);
});

test('a clean checkout reports missing sources with a preparation command', t => {
  const { root } = fixture(t);
  assert.throws(() => checkSources(root), /Valdi sources are not prepared.*\n.*prepare-valdi\.mjs/);
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

test('Android Vision requires static archives built for the runtime toolchain and verifies their contents', t => {
  const { root, write } = fixture(t);
  const lock = { opencv: { version: '4.13.0', sha256: 'opencv-sha' }, ncnn: { version: '20260526', sha256: 'ncnn-sha' } };
  write('vision/vendor-lock.json', JSON.stringify(lock));
  const runtime = JSON.parse(readFileSync(path.join(repository, 'vision/android-runtime.json'), 'utf8'));
  write('vision/android-runtime.json', JSON.stringify(runtime));
  const patch = 'Android-only highgui source hook';
  write('vision/patches/opencv-mobile-android/INIT_MODULE_SOURCES_opencv_highgui.cmake', patch);
  const digest = value => createHash('sha256').update(value).digest('hex');
  const artifacts = Object.fromEntries(['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn']
    .map(name => [`lib/lib${name}.a`, digest(`archive-${name}`)]));
  const receipt = {
    target: 'android-arm64', opencv: lock.opencv.version, ncnn: lock.ncnn.version,
    sourcePins: { opencv: lock.opencv.sha256, ncnn: lock.ncnn.sha256 },
    cpuOnly: true, linkage: 'static', artifacts,
    android: { ...runtime, cxxStandard: 20, rtti: true, exceptions: true, pic: true, videoCaptureBackend: 'none' },
    patches: { opencvAndroidHighgui: digest(patch) },
  };
  const prefix = 'vision/vendor/install/android-arm64/static';
  const stamp = value => write(`${prefix}/native-routes-vision.json`, JSON.stringify(value));
  // Old shared libraries must not satisfy a static-in-runtime dependency.
  for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn'])
    write(`vision/vendor/install/android-arm64/shared/lib/lib${name}.so`, 'old shared library');
  assert.throws(() => checkVision(root, 'android'), /--linkage static/);
  stamp(receipt);
  for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn'])
    write(`${prefix}/lib/lib${name}.a`, `archive-${name}`);
  for (const header of ['opencv4/opencv2/core.hpp', 'opencv4/opencv2/imgproc.hpp',
    'opencv4/opencv2/highgui/highgui.hpp', 'ncnn/net.h', 'ncnn/platform.h'])
    write(`${prefix}/include/${header}`, 'header');
  assert.doesNotThrow(() => checkVision(root, 'android'));
  for (const patch of [
    { linkage: 'shared' }, { cpuOnly: false },
    { android: { ...receipt.android, ndkRevision: '27.1.12297006' } },
    { android: { ...receipt.android, stl: 'c++_shared' } },
    { android: { ...receipt.android, pic: false } },
    { android: { ...receipt.android, exceptions: false } },
    { android: { ...receipt.android, videoCaptureBackend: 'v4l2' } },
    { patches: { opencvAndroidHighgui: 'outdated-hook' } },
  ]) {
    stamp({ ...receipt, ...patch });
    assert.throws(() => checkVision(root, 'android'), /missing|runtime configuration/);
  }
  stamp(receipt);
  write(`${prefix}/lib/libncnn.a`, 'modified archive');
  assert.throws(() => checkVision(root, 'android'), /changed archive/);
  write(`${prefix}/lib/libncnn.a`, 'archive-ncnn');
  rmSync(path.join(root, `${prefix}/include/ncnn/net.h`));
  assert.throws(() => checkVision(root, 'android'), /missing header/);
  write(`${prefix}/include/ncnn/net.h`, 'header');
  write('vision/vendor-lock.json', JSON.stringify({ ...lock, ncnn: { version: 'other', sha256: 'other-sha' } }));
  assert.throws(() => checkVision(root, 'android'), /another vision\/vendor-lock\.json/);
});

test('iOS Vision requires both static XCFramework slices and matching preparation receipts', t => {
  const { root, write } = fixture(t);
  const lock = { opencv: { version: '4.13.0', sha256: 'opencv-sha' }, ncnn: { version: '20260526', sha256: 'ncnn-sha' } };
  const runtime = JSON.parse(readFileSync(path.join(repository, 'vision/ios-runtime.json'), 'utf8'));
  write('vision/ios-runtime.json', JSON.stringify(runtime));
  write('vision/vendor-lock.json', JSON.stringify(lock));
  write('vision/vendor/install/ios/VisionDependencies.xcframework/Info.plist', 'static XCFramework metadata');
  for (const target of ['ios-arm64', 'ios-simulator-arm64']) {
    write(`vision/vendor/install/${target}/native-routes-vision.json`, JSON.stringify({
      target, opencv: lock.opencv.version, ncnn: lock.ncnn.version,
      sourcePins: { opencv: lock.opencv.sha256, ncnn: lock.ncnn.sha256 }, cpuOnly: true,
      linkage: 'static', ios: { deploymentTarget: runtime.deploymentTarget, arch: 'arm64' },
    }));
  }
  const digest = createHash('sha256').update('slice input').digest('hex');
  write('vision/vendor/install/ios/native-routes-vision.json', JSON.stringify({
    target: 'ios', linkage: 'static', deploymentTarget: runtime.deploymentTarget,
    sourcePins: { opencv: lock.opencv.sha256, ncnn: lock.ncnn.sha256 },
    artifacts: Object.fromEntries(['ios-arm64', 'ios-arm64-simulator'].map(slice => [`${slice}/libVisionDependencies.a`, digest])),
  }));
  assert.throws(() => checkVision(root, 'ios'), /slice input/);
  for (const slice of ['ios-arm64', 'ios-arm64-simulator']) {
    for (const file of ['libVisionDependencies.a', 'Headers/opencv4/opencv2/core.hpp', 'Headers/ncnn/net.h', 'Headers/ncnn/platform.h'])
      write(`vision/vendor/install/ios/VisionDependencies.xcframework/${slice}/${file}`, 'slice input');
  }
  assert.doesNotThrow(() => checkVision(root, 'ios'));
  rmSync(path.join(root, 'vision/vendor/install/ios/VisionDependencies.xcframework/ios-arm64-simulator/libVisionDependencies.a'));
  assert.throws(() => checkVision(root, 'ios'), /slice input/);
});
