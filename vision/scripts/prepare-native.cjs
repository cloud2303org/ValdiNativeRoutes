const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'vendor-lock.json'), 'utf8'));
const allowed = ['android-arm64', 'ios-arm64', 'ios-simulator-arm64', 'macos-arm64'];
const args = process.argv.slice(2);
let targets = [], jobs;
while (args.length) {
  const flag = args.shift();
  if (flag === '--target' && args.length) targets.push(...args.shift().split(','));
  else if (flag === '--jobs' && args.length) jobs = Number(args.shift());
  else if (flag === '--help') {
    console.log('Prepare pinned OpenCV Mobile + ncnn from source\n  node vision/scripts/prepare-native.cjs --target ' + allowed.join('|') + ' [--jobs N]\n  Android builds shared libraries in android-arm64/shared; existing static outputs are preserved.\n  --target ios builds static device + simulator archives and their XCFramework.\n  Parallelism defaults to the native build tool unless --jobs is supplied.');
    process.exit(0);
  } else throw new Error(`Unknown/missing option: ${flag}`);
}
if (!targets.length) throw new Error('Select an explicit --target; use --help for supported targets.');
targets = [...new Set(targets.flatMap(t => t === 'ios' ? ['ios-arm64', 'ios-simulator-arm64'] : [t]))];
if ((jobs !== undefined && (!Number.isSafeInteger(jobs) || jobs < 1)) || targets.some(t => !allowed.includes(t))) throw new Error('Invalid target or job count.');
const parallelArgs = jobs === undefined ? [] : ['--parallel', String(jobs)];
const cmake = process.env.VISION_CMAKE || 'cmake';
// The Windows build prepends Git Bash's usr/bin to PATH, and its GNU tar reads
// "C:\..." as a remote host ("Cannot connect to C:"). Prefer the bsdtar Windows ships.
const windowsTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const tar = process.platform === 'win32' && fs.existsSync(windowsTar) ? windowsTar : 'tar';
const run = (exe, argv, options = {}) => {
  console.log(JSON.stringify({executable: exe, args: argv}));
  return execFileSync(exe, argv, {cwd: root, stdio: 'inherit', ...options});
};
const capture = (exe, argv) => execFileSync(exe, argv, {encoding: 'utf8'}).trim();
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const name of ['cache', 'src', 'build', 'install']) fs.mkdirSync(path.join(vendor, name), {recursive: true});
for (const dependency of [lock.opencv, lock.ncnn]) {
  const archive = path.join(vendor, 'cache', dependency.file);
  // A fresh machine downloads these over the network, where connections can reset.
  // Download beside the archive and only publish the verified bytes.
  const download = () => {
    const partial = archive + '.partial';
    fs.rmSync(partial, {force: true});
    run('curl', ['--fail', '--location', '--retry', '5', '--retry-all-errors', '--retry-delay', '3',
      '--connect-timeout', '30', dependency.url, '--output', partial]);
    if (hash(partial) !== dependency.sha256) {
      fs.rmSync(partial, {force: true});
      throw new Error(`Vendor archive checksum mismatch after download: ${dependency.url}`);
    }
    fs.renameSync(partial, archive);
  };
  if (!fs.existsSync(archive)) download();
  else if (hash(archive) !== dependency.sha256) {
    // A partial or corrupted cache entry is re-fetched instead of failing the build forever.
    console.warn(`Discarding a cache entry whose checksum does not match: ${archive}`);
    fs.rmSync(archive, {force: true});
    download();
  }
  const source = path.join(vendor, 'src', dependency.directory);
  const stamp = path.join(source, '.native-routes-source.json');
  if (!fs.existsSync(stamp)) {
    if (fs.existsSync(source)) {
      // A pre-extracted tree is accepted only from this just-verified archive.
      fs.rmSync(source, {recursive: true, force: true});
    }
    if (dependency.file.endsWith('.zip')) {
      // Windows has bsdtar but does not ship Info-ZIP's unzip command.
      if (process.platform === 'win32') run(tar, ['-xf', archive, '-C', path.join(vendor, 'src')]);
      else run('unzip', ['-q', archive, '-d', path.join(vendor, 'src')]);
    }
    else run(tar, ['-xzf', archive, '-C', path.join(vendor, 'src')]);
    fs.writeFileSync(stamp, JSON.stringify({url: dependency.url, sha256: dependency.sha256}, null, 2) + '\n');
  } else if (JSON.parse(fs.readFileSync(stamp, 'utf8')).sha256 !== dependency.sha256) {
    throw new Error(`Source pin changed: remove ${source} before rebuilding.`);
  }
}
const common = ['-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POSITION_INDEPENDENT_CODE=ON', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5'];
const androidOpenCvHooks = path.join(root, 'patches/opencv-mobile-android');
const androidOpenCvPatch = path.join(androidOpenCvHooks, 'INIT_MODULE_SOURCES_opencv_highgui.cmake');
function androidNdk() {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  return process.env.VISION_ANDROID_NDK || path.join(sdk, 'ndk/27.1.12297006');
}
function platformOptions(target) {
  if (target === 'android-arm64') {
    const ndk = androidNdk();
    const toolchain = path.join(ndk, 'build/cmake/android.toolchain.cmake');
    if (!fs.existsSync(toolchain)) throw new Error('Set VISION_ANDROID_NDK to the installed NDK directory.');
    return [`-DCMAKE_TOOLCHAIN_FILE=${toolchain}`, '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-28', '-DANDROID_STL=c++_shared',
      '-DANDROID_CPP_FEATURES=rtti exceptions', '-DCMAKE_CXX_STANDARD=20', '-DCMAKE_CXX_STANDARD_REQUIRED=ON',
      '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON'];
  }
  if (target.startsWith('ios-')) {
    const sdk = capture('xcrun', ['--sdk', target === 'ios-arm64' ? 'iphoneos' : 'iphonesimulator', '--show-sdk-path']);
    return ['-DCMAKE_SYSTEM_NAME=iOS', `-DCMAKE_OSX_SYSROOT=${sdk}`, '-DCMAKE_OSX_ARCHITECTURES=arm64', '-DCMAKE_OSX_DEPLOYMENT_TARGET=16.4', '-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY'];
  }
  return ['-DCMAKE_OSX_ARCHITECTURES=arm64', '-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0'];
}
for (const target of targets) {
  const androidShared = target === 'android-arm64';
  // Never reuse a static build cache or overwrite the existing static install.
  const variant = androidShared ? path.join(target, 'shared') : target;
  const prefix = path.join(vendor, 'install', variant);
  const receipt = path.join(prefix, 'native-routes-vision.json');
  const platform = platformOptions(target);
  let android, patches;
  if (androidShared) {
    const properties = fs.readFileSync(path.join(androidNdk(), 'source.properties'), 'utf8');
    const ndkRevision = properties.match(/^Pkg\.Revision\s*=\s*(\S+)/m)?.[1];
    if (!ndkRevision) throw new Error('Cannot identify VISION_ANDROID_NDK from source.properties.');
    android = {abi: 'arm64-v8a', api: 28, stl: 'c++_shared', cxxStandard: 20, rtti: true, exceptions: true, ndkRevision,
      videoCaptureBackend: 'none'};
    patches = {opencvAndroidHighgui: hash(androidOpenCvPatch)};
    // An interrupted rebuild must not retain a success receipt from an earlier run.
    fs.rmSync(receipt, {force: true});
  }
  const options = fs.readFileSync(path.join(vendor, 'src', lock.opencv.directory, 'options.txt'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
  const opencvBuild = path.join(vendor, 'build', variant, 'opencv');
  run(cmake, ['-S', path.join(vendor, 'src', lock.opencv.directory), '-B', opencvBuild, ...common, ...platform, ...options,
    `-DCMAKE_INSTALL_PREFIX=${prefix}`, '-DBUILD_LIST=core,imgproc,highgui', '-DWITH_OPENMP=OFF', '-DWITH_KLEIDICV=OFF', '-DWITH_LAPACK=OFF',
    // The pinned mobile options.txt sets BUILD_SHARED_LIBS=OFF; override it last on Android only.
    ...(androidShared ? ['-DBUILD_SHARED_LIBS=ON', '-DBUILD_opencv_world=OFF', `-DOPENCV_CMAKE_HOOKS_DIR=${androidOpenCvHooks}`] : [])]);
  run(cmake, ['--build', opencvBuild, ...parallelArgs]);
  run(cmake, ['--install', opencvBuild]);
  // OpenCV's Android SDK install layout differs from its Unix/iOS layout.
  // Stage the actual shared components/headers into the package's common layout.
  if (androidShared) {
    fs.cpSync(path.join(prefix, 'sdk/native/jni/include'), path.join(prefix, 'include/opencv4'), {recursive: true});
    fs.mkdirSync(path.join(prefix, 'lib'), {recursive: true});
    for (const library of ['opencv_core', 'opencv_imgproc', 'opencv_highgui']) {
      fs.copyFileSync(path.join(prefix, 'sdk/native/libs/arm64-v8a', `lib${library}.so`), path.join(prefix, 'lib', `lib${library}.so`));
    }
  }
  const ncnnBuild = path.join(vendor, 'build', variant, 'ncnn');
  run(cmake, ['-S', path.join(vendor, 'src', lock.ncnn.directory), '-B', ncnnBuild, ...common, ...platform,
    `-DCMAKE_INSTALL_PREFIX=${prefix}`, `-DNCNN_VERSION=${lock.ncnn.version}`, '-DNCNN_VULKAN=OFF', '-DNCNN_OPENMP=OFF',
    `-DNCNN_SHARED_LIB=${androidShared ? 'ON' : 'OFF'}`,
    ...(androidShared ? ['-DNCNN_DISABLE_RTTI=OFF', '-DNCNN_DISABLE_EXCEPTION=OFF', '-DCMAKE_INSTALL_LIBDIR=lib'] : []),
    '-DNCNN_BUILD_TOOLS=OFF', '-DNCNN_BUILD_EXAMPLES=OFF', '-DNCNN_BUILD_BENCHMARK=OFF', '-DNCNN_BUILD_TESTS=OFF', '-DNCNN_INSTALL_SDK=ON']);
  run(cmake, ['--build', ncnnBuild, ...parallelArgs]);
  run(cmake, ['--install', ncnnBuild]);
  if (androidShared) {
    if (hash(androidOpenCvPatch) !== patches.opencvAndroidHighgui) throw new Error('Android OpenCV hook changed during preparation; rebuild with a frozen patch.');
    for (const library of ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn']) {
      if (!fs.statSync(path.join(prefix, 'lib', `lib${library}.so`)).isFile()) throw new Error(`Missing shared vendor library: ${library}`);
    }
  }
  fs.writeFileSync(receipt, JSON.stringify({target, opencv: lock.opencv.version, ncnn: lock.ncnn.version, sourcePins: {opencv: lock.opencv.sha256, ncnn: lock.ncnn.sha256},cpuOnly: true,
    ...(androidShared ? {linkage: 'shared', android, patches} : {})}, null, 2) + '\n');
  console.log(`Prepared ${target}: ${prefix}`);
}
// CocoaPods selects one static XCFramework slice for the actual SDK, so the two
// arm64 platform archives are never linked into the same application together.
const device = path.join(vendor, 'install/ios-arm64');
const simulator = path.join(vendor, 'install/ios-simulator-arm64');
if (targets.some(t => t.startsWith('ios-')) && [device, simulator].every(p => fs.existsSync(path.join(p, 'native-routes-vision.json')))) {
  for (const directory of [device, simulator]) {
    const libs = ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn'].map(name => path.join(directory, 'lib', `lib${name}.a`));
    run('xcrun', ['libtool', '-static', '-o', path.join(directory, 'lib/libVisionDependencies.a'), ...libs]);
  }
  const xcframework = path.join(vendor, 'install/ios/VisionDependencies.xcframework');
  fs.rmSync(xcframework, {recursive: true, force: true});
  run('xcodebuild', ['-create-xcframework', '-library', path.join(device, 'lib/libVisionDependencies.a'), '-headers', path.join(device, 'include'),
    '-library', path.join(simulator, 'lib/libVisionDependencies.a'), '-headers', path.join(simulator, 'include'), '-output', xcframework]);
}
