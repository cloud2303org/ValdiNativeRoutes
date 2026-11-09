import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const libraries = ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn'];
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const isFile = file => {
  try { return statSync(file).isFile() && statSync(file).size > 0; } catch { return false; }
};

export function checkVision(root, platform) {
  if (!['android', 'ios'].includes(platform)) throw new Error('Expected android or ios');
  const prepare = `node vision/scripts/prepare-native.cjs --target ${platform === 'android' ? 'android-arm64 --linkage static' : 'ios'}`;
  const fail = reason => { throw new Error(`${platform} OpenCV/ncnn static dependencies ${reason}. Run:\n  ${prepare}`); };
  const vendor = path.join(root, 'vision/vendor/install');
  const lock = JSON.parse(readFileSync(path.join(root, 'vision/vendor-lock.json'), 'utf8'));
  const prepared = platform === 'android' ? ['android-arm64'] : ['ios-arm64', 'ios-simulator-arm64'];
  for (const target of prepared) {
    const prefix = path.join(vendor, target, platform === 'android' ? 'static' : '');
    let info;
    try { info = JSON.parse(readFileSync(path.join(prefix, 'native-routes-vision.json'), 'utf8')); } catch {}
    if (!info || info.target !== target || info.cpuOnly !== true
      || info.opencv !== lock.opencv.version || info.ncnn !== lock.ncnn.version
      || info.sourcePins?.opencv !== lock.opencv.sha256 || info.sourcePins?.ncnn !== lock.ncnn.sha256) {
      fail('are missing or were built from another vision/vendor-lock.json');
    }
    if (platform === 'android') {
      const runtime = JSON.parse(readFileSync(path.join(root, 'vision/android-runtime.json'), 'utf8'));
      const patch = path.join(root, 'vision/patches/opencv-mobile-android/INIT_MODULE_SOURCES_opencv_highgui.cmake');
      if (info.linkage !== 'static'
        || Object.entries(runtime).some(([key, value]) => info.android?.[key] !== value)
        || info.android?.cxxStandard !== 20 || info.android?.rtti !== true || info.android?.exceptions !== true
        || info.android?.pic !== true || info.android?.videoCaptureBackend !== 'none'
        || !existsSync(patch) || info.patches?.opencvAndroidHighgui !== sha256(patch)) {
        fail(`have an incompatible runtime configuration (requires NDK ${runtime.ndkRevision}, API ${runtime.api}, ${runtime.stl}, PIC)`);
      }
      for (const name of libraries) {
        const relative = `lib/lib${name}.a`;
        const file = path.join(prefix, relative);
        if (!isFile(file) || info.artifacts?.[relative] !== sha256(file)) fail(`have a missing or changed archive: ${relative}`);
      }
      for (const header of ['include/opencv4/opencv2/core.hpp', 'include/opencv4/opencv2/imgproc.hpp',
        'include/opencv4/opencv2/highgui/highgui.hpp', 'include/ncnn/net.h', 'include/ncnn/platform.h']) {
        if (!isFile(path.join(prefix, header))) fail(`have a missing header: ${header}`);
      }
    } else {
      const runtime = JSON.parse(readFileSync(path.join(root, 'vision/ios-runtime.json'), 'utf8'));
      if (info.linkage !== 'static' || info.ios?.arch !== 'arm64' || info.ios?.deploymentTarget !== runtime.deploymentTarget) {
        fail(`have an incompatible deployment target (requires iOS ${runtime.deploymentTarget} arm64)`);
      }
    }
  }
  if (platform === 'ios') {
    const xcframework = path.join(vendor, 'ios/VisionDependencies.xcframework');
    const runtime = JSON.parse(readFileSync(path.join(root, 'vision/ios-runtime.json'), 'utf8'));
    let product;
    try { product = JSON.parse(readFileSync(path.join(vendor, 'ios/native-routes-vision.json'), 'utf8')); } catch {}
    if (!product || product.target !== 'ios' || product.linkage !== 'static'
      || product.deploymentTarget !== runtime.deploymentTarget
      || product.sourcePins?.opencv !== lock.opencv.sha256 || product.sourcePins?.ncnn !== lock.ncnn.sha256) {
      fail('have a missing or stale XCFramework receipt');
    }
    if (!isFile(path.join(xcframework, 'Info.plist'))) fail('are missing their XCFramework manifest');
    for (const slice of ['ios-arm64', 'ios-arm64-simulator']) {
      for (const file of ['libVisionDependencies.a', 'Headers/opencv4/opencv2/core.hpp', 'Headers/ncnn/net.h', 'Headers/ncnn/platform.h']) {
        if (!isFile(path.join(xcframework, slice, file))) fail(`have a missing XCFramework slice input: ${slice}/${file}`);
      }
      const relative = `${slice}/libVisionDependencies.a`;
      if (product.artifacts?.[relative] !== sha256(path.join(xcframework, relative))) {
        fail(`have a changed XCFramework archive: ${relative}`);
      }
    }
  }
}
