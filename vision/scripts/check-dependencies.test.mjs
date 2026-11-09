import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkVision } from '../../valdi/modules/app_vision/scripts/check-dependencies.mjs';

const project = path.resolve(import.meta.dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (root, file, contents) => {
  const absolute = path.join(root, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, typeof contents === 'string' ? contents : JSON.stringify(contents));
};

function fixture(t, platform) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vision-static-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['vendor-lock.json', 'android-runtime.json', 'ios-runtime.json',
    'patches/opencv-mobile-android/INIT_MODULE_SOURCES_opencv_highgui.cmake']) {
    const absolute = path.join(root, 'vision', file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    cpSync(path.join(project, 'vision', file), absolute);
  }
  const lock = JSON.parse(readFileSync(path.join(project, 'vision/vendor-lock.json')));
  const pins = { opencv: lock.opencv.sha256, ncnn: lock.ncnn.sha256 };
  const receipt = {
    target: 'android-arm64', linkage: 'static', cpuOnly: true,
    opencv: lock.opencv.version, ncnn: lock.ncnn.version, sourcePins: pins,
  };
  if (platform === 'android') {
    const runtime = JSON.parse(readFileSync(path.join(project, 'vision/android-runtime.json')));
    Object.assign(receipt, {
      android: { ...runtime, pic: true, cxxStandard: 20, rtti: true, exceptions: true, videoCaptureBackend: 'none' },
      patches: { opencvAndroidHighgui: hash(readFileSync(path.join(project, 'vision/patches/opencv-mobile-android/INIT_MODULE_SOURCES_opencv_highgui.cmake'))) },
      artifacts: {},
    });
    for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn']) {
      const file = `lib/lib${name}.a`;
      write(root, `vision/vendor/install/android-arm64/static/${file}`, 'archive fixture');
      receipt.artifacts[file] = hash('archive fixture');
    }
    for (const header of ['opencv4/opencv2/core.hpp', 'opencv4/opencv2/imgproc.hpp',
      'opencv4/opencv2/highgui/highgui.hpp', 'ncnn/net.h', 'ncnn/platform.h']) {
      write(root, `vision/vendor/install/android-arm64/static/include/${header}`, '// header fixture');
    }
    write(root, 'vision/vendor/install/android-arm64/static/native-routes-vision.json', receipt);
  } else {
    const runtime = JSON.parse(readFileSync(path.join(project, 'vision/ios-runtime.json')));
    for (const target of ['ios-arm64', 'ios-simulator-arm64']) {
      write(root, `vision/vendor/install/${target}/native-routes-vision.json`, {
        ...receipt, target, ios: { ...runtime, arch: 'arm64' },
      });
    }
    const artifacts = {};
    write(root, 'vision/vendor/install/ios/VisionDependencies.xcframework/Info.plist', 'manifest fixture');
    for (const slice of ['ios-arm64', 'ios-arm64-simulator']) {
      for (const file of ['libVisionDependencies.a', 'Headers/opencv4/opencv2/core.hpp', 'Headers/ncnn/net.h', 'Headers/ncnn/platform.h']) {
        write(root, `vision/vendor/install/ios/VisionDependencies.xcframework/${slice}/${file}`, 'slice fixture');
      }
      artifacts[`${slice}/libVisionDependencies.a`] = hash('slice fixture');
    }
    write(root, 'vision/vendor/install/ios/native-routes-vision.json', {
      target: 'ios', linkage: 'static', ...runtime, sourcePins: pins, artifacts,
    });
  }
  return root;
}

test('accepts static Android receipts matching the runtime', t => {
  checkVision(fixture(t, 'android'), 'android');
});

for (const [name, mutate] of [
  ['old NDK', receipt => { receipt.android.ndkRevision = '27.1.12297006'; }],
  ['old API', receipt => { receipt.android.api = 28; }],
  ['shared STL', receipt => { receipt.android.stl = 'c++_shared'; }],
  ['shared product', receipt => { receipt.linkage = 'shared'; }],
  ['non-PIC objects', receipt => { receipt.android.pic = false; }],
]) {
  test(`rejects ${name}`, t => {
    const root = fixture(t, 'android');
    const file = 'vision/vendor/install/android-arm64/static/native-routes-vision.json';
    const receipt = JSON.parse(readFileSync(path.join(root, file)));
    mutate(receipt);
    write(root, file, receipt);
    assert.throws(() => checkVision(root, 'android'), /incompatible runtime configuration/);
  });
}

test('rejects an archive changed after successful preparation', t => {
  const root = fixture(t, 'android');
  write(root, 'vision/vendor/install/android-arm64/static/lib/libncnn.a', 'changed archive');
  assert.throws(() => checkVision(root, 'android'), /changed archive/);
});

test('accepts both current iOS slices and rejects the old deployment target', t => {
  const root = fixture(t, 'ios');
  checkVision(root, 'ios');
  const file = 'vision/vendor/install/ios-arm64/native-routes-vision.json';
  const receipt = JSON.parse(readFileSync(path.join(root, file)));
  receipt.ios.deploymentTarget = '16.4';
  write(root, file, receipt);
  assert.throws(() => checkVision(root, 'ios'), /incompatible deployment target/);
});

test('rejects a stale XCFramework even when per-platform receipts are current', t => {
  const root = fixture(t, 'ios');
  write(root, 'vision/vendor/install/ios/VisionDependencies.xcframework/ios-arm64-simulator/libVisionDependencies.a', 'old archive');
  assert.throws(() => checkVision(root, 'ios'), /changed XCFramework archive/);
});
