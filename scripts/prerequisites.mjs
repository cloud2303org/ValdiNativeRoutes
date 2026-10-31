import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function pnpmInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const npmExecpath = 'npmExecpath' in options ? options.npmExecpath : process.env.npm_execpath;
  // Use the exact pnpm that started the root command, including Corepack / pnpm version management.
  if (npmExecpath && /pnpm\.(?:c?js|mjs)$/.test(npmExecpath)) {
    return { command: execPath, args: [npmExecpath, ...args] };
  }
  if (platform === 'win32') {
    // Windows cannot spawn pnpm's .cmd shim directly from Node 24, so ask the
    // bundled Corepack launcher to honor packageManager instead of guessing a global version.
    const corepack = path.join(path.dirname(execPath), 'node_modules/corepack/dist/corepack.js');
    if (existsSync(corepack)) return { command: execPath, args: [corepack, 'pnpm', ...args] };
  }
  return { command: 'pnpm', args };
}

export function runPnpm(args, root) {
  const invocation = pnpmInvocation(args);
  run(invocation.command, invocation.args, root);
}

const exportCommand = platform => `sh scripts/export-${platform}.sh`;

export function checkDependencies(root) {
  const packages = ['@snap/valdi', 'typescript', ...Object.keys(JSON.parse(readFileSync(path.join(root, 'valdi/package.json'), 'utf8')).dependencies)];
  for (const name of packages) {
    if (!existsSync(path.join(root, 'valdi/node_modules', name))) {
      throw new Error(`Missing valdi dependency ${name}. Run pnpm install from the repository root.`);
    }
  }
  for (const name of ['tsx', 'typescript', 'rolldown', 'sharp', 'hermes-compiler']) {
    if (!existsSync(path.join(root, 'tools/valdi-rolldown/node_modules', name))) {
      throw new Error(`Missing build dependency ${name}. Run pnpm install from the repository root.`);
    }
  }
}

export function checkSources(root, sourceDir) {
  const candidates = [
    sourceDir,
    path.join(root, 'valdi/.valdi-sources/external/valdi+'),
    path.join(root, 'valdi/bazel-valdi/external/valdi+'),
  ].filter(Boolean);
  if (!candidates.some(dir => existsSync(path.join(dir, 'modules/_configs/base.tsconfig.json')))) {
    throw new Error(`Valdi sources are not prepared at ${candidates.join(' or ')}. Run:\n  node scripts/prepare-valdi.mjs`);
  }
}

export function prepareSources(root, options = {}) {
  const candidates = process.env.BAZEL_BIN ? [process.env.BAZEL_BIN] : ['bzl', 'bazel', 'bazelisk'];
  const command = candidates.find(candidate => !spawnSync(candidate, ['--version'], { stdio: 'ignore' }).error);
  if (!command) throw new Error('Preparing Valdi sources requires Bazel/Bazelisk on PATH (or BAZEL_BIN).');
  const cwd = path.join(root, 'valdi');
  // An isolated build passes its own output root / repository cache here so the fetch-only
  // step neither starts a shared Bazel server nor fills a shared cache.
  const startup = options.startupArgs ?? [];
  const common = options.bazelArgs ?? [];
  // Fetch only the pinned fork repository. No app/compiler target or native toolchain analysis is needed.
  run(command, [...startup, '--max_idle_secs=5', 'fetch', '--repo=@valdi', ...common], cwd);
  const info = spawnSync(command, [...startup, '--max_idle_secs=5', 'info', 'output_base', ...common], { cwd, encoding: 'utf8' });
  if (info.error || info.status !== 0) throw new Error(`Cannot locate fetched Valdi sources: ${info.error?.message ?? info.stderr.trim()}`);
  const outputBase = info.stdout.trim();
  const fetchedConfig = path.join(outputBase, 'external/valdi+/modules/_configs/base.tsconfig.json');
  if (!existsSync(fetchedConfig)) {
    throw new Error('The fetched Valdi repository does not contain modules/_configs/base.tsconfig.json.');
  }
  // Bazel repoints each `bazel-*` convenience link as it runs (output base first, then the
  // execroot), so module tsconfigs that name those links can lose their base config mid-job.
  // Keep one link Bazel never touches for the compiler to point at.
  const stable = path.join(cwd, '.valdi-sources');
  const stableExisting = lstatSync(stable, { throwIfNoEntry: false });
  if (stableExisting && !stableExisting.isSymbolicLink()) throw new Error(`${stable} is not a symlink; refusing to replace it.`);
  if (!stableExisting || realpathSync(stable) !== realpathSync(outputBase)) {
    if (stableExisting) unlinkSync(stable);
    symlinkSync(outputBase, stable, 'dir');
  }
  // Before a real build there is no execroot symlink forest. Expose output_base/external at the existing TS path;
  // Bazel replaces this convenience symlink with the execroot on its first real build.
  const link = path.join(cwd, `bazel-${path.basename(cwd)}`);
  const linkedConfig = path.join(link, 'external/valdi+/modules/_configs/base.tsconfig.json');
  if (existsSync(linkedConfig) && realpathSync(linkedConfig) === realpathSync(fetchedConfig)) return;
  const existing = lstatSync(link, { throwIfNoEntry: false });
  if (existing && !existing.isSymbolicLink()) throw new Error(`${link} is not a symlink; refusing to replace it.`);
  if (existing) unlinkSync(link);
  symlinkSync(outputBase, link, 'dir');
  checkSources(root);
}

export function checkRuntime(root, platform) {
  const directory = platform === 'android' ? 'android/app/libs' : 'ios/Frameworks';
  const artifact = platform === 'android' ? 'valdi_runtime.aar' : 'ValdiRuntime.xcframework';
  const stamp = path.join(root, directory, 'valdi_ota.json');
  if (!existsSync(path.join(root, directory, artifact)) || !existsSync(stamp)) {
    throw new Error(`${platform} Valdi runtime is missing. Run:\n  ${exportCommand(platform)}`);
  }
  let info;
  try { info = JSON.parse(readFileSync(stamp, 'utf8')); }
  catch { throw new Error(`${directory}/valdi_ota.json is invalid. Run:\n  ${exportCommand(platform)}`); }
  if (info.platform !== platform || !['debug', 'release'].includes(info.config)) {
    throw new Error(`${directory}/valdi_ota.json does not describe a valid ${platform} export. Run:\n  ${exportCommand(platform)}`);
  }
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/ota.mjs'), 'valdi-hash', platform, info.config], {
    cwd: root, encoding: 'utf8',
  });
  if (result.error || result.status !== 0) throw new Error(`Cannot check the ${platform} runtime fingerprint: ${result.error?.message ?? result.stderr.trim()}`);
  const current = JSON.parse(result.stdout);
  if (info.valdi !== current.valdi || info.native !== current.native) {
    throw new Error(`${platform} Valdi runtime is out of date (Valdi fork/toolchain configuration or valdi/native changed). Run:\n  ${exportCommand(platform)}${info.config === 'release' ? ' release' : ''}`);
  }
}

export function checkVision(root, platform) {
  const targets = platform === 'android'
    ? ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn'].map(name => `vision/vendor/install/android-arm64/lib/lib${name}.a`)
    : ['vision/vendor/install/ios/VisionDependencies.xcframework/Info.plist'];
  if (targets.some(file => !existsSync(path.join(root, file)))) {
    throw new Error(`${platform} OpenCV/ncnn dependencies are missing. Run:\n  node vision/scripts/prepare-native.cjs --target ${platform === 'android' ? 'android-arm64' : 'ios'}`);
  }
  // The app fingerprint names vision/vendor-lock.json: libraries built from another lock
  // would silently mix inputs, so compare the stamps the preparation writes.
  const lock = JSON.parse(readFileSync(path.join(root, 'vision/vendor-lock.json'), 'utf8'));
  const prepared = platform === 'android' ? ['android-arm64'] : ['ios-arm64', 'ios-simulator-arm64'];
  for (const target of prepared) {
    const stamp = path.join(root, 'vision/vendor/install', target, 'native-routes-vision.json');
    let info;
    try { info = JSON.parse(readFileSync(stamp, 'utf8')); } catch { info = undefined; }
    if (!info || info.opencv !== lock.opencv.version || info.ncnn !== lock.ncnn.version
      || info.sourcePins?.opencv !== lock.opencv.sha256 || info.sourcePins?.ncnn !== lock.ncnn.sha256) {
      throw new Error(`${platform} OpenCV/ncnn dependencies were built from another vision/vendor-lock.json. Run:\n  node vision/scripts/prepare-native.cjs --target ${platform === 'android' ? 'android-arm64' : 'ios'}`);
    }
  }
}
