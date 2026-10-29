import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function runPnpm(args, root) {
  // Use the exact pnpm that started the root command, including Corepack / pnpm version management.
  const executable = process.env.npm_execpath;
  if (executable && /pnpm\.(?:c?js|mjs)$/.test(executable)) run(process.execPath, [executable, ...args], root);
  else run('pnpm', args, root);
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

export function checkSources(root, sourceDir = path.join(root, 'valdi/bazel-valdi/external/valdi+')) {
  if (!existsSync(path.join(sourceDir, 'modules/_configs/base.tsconfig.json'))) {
    throw new Error(`Valdi sources are not prepared at ${sourceDir}. Run:\n  node scripts/prepare-valdi.mjs`);
  }
}

export function prepareSources(root) {
  const candidates = process.env.BAZEL_BIN ? [process.env.BAZEL_BIN] : ['bzl', 'bazel', 'bazelisk'];
  const command = candidates.find(candidate => !spawnSync(candidate, ['--version'], { stdio: 'ignore' }).error);
  if (!command) throw new Error('Preparing Valdi sources requires Bazel/Bazelisk on PATH (or BAZEL_BIN).');
  const cwd = path.join(root, 'valdi');
  // Fetch only the pinned, patched repository. No app/compiler target or native toolchain analysis is needed.
  run(command, ['--max_idle_secs=5', 'fetch', '--repo=@valdi'], cwd);
  const info = spawnSync(command, ['--max_idle_secs=5', 'info', 'output_base'], { cwd, encoding: 'utf8' });
  if (info.error || info.status !== 0) throw new Error(`Cannot locate fetched Valdi sources: ${info.error?.message ?? info.stderr.trim()}`);
  const outputBase = info.stdout.trim();
  const fetchedConfig = path.join(outputBase, 'external/valdi+/modules/_configs/base.tsconfig.json');
  if (!existsSync(fetchedConfig)) {
    throw new Error('The fetched Valdi repository does not contain modules/_configs/base.tsconfig.json.');
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

export function checkBuildTools(root) {
  const out = path.join(root, 'valdi/bazel-out');
  const configs = existsSync(out) ? readdirSync(out) : [];
  const prepareHostTools = 'Prepare the SQL validator (no Android/iOS runtime export needed):\n  cd valdi\n  bazel build @valdi//compiler/clientsql:sqlite_316_validator';
  const validator = process.env.VALDI_SQLITE_VALIDATOR;
  if (validator ? !existsSync(validator) : !configs.some(config => ['valdi+', 'valdi~'].some(repo =>
    existsSync(path.join(out, config, 'bin/external', repo, 'compiler/clientsql/sqlite_316_validator'))))) {
    throw new Error(`SQLite 3.16 validator is missing${validator ? ` at VALDI_SQLITE_VALIDATOR=${validator}` : ''}.\n${prepareHostTools}`);
  }
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
    throw new Error(`${platform} Valdi runtime is out of date (Valdi/Hermes configuration, patches or valdi/native changed). Run:\n  ${exportCommand(platform)}${info.config === 'release' ? ' release' : ''}`);
  }
}

export function checkVision(root, platform) {
  const targets = platform === 'android'
    ? ['opencv_core', 'opencv_imgproc', 'opencv_highgui', 'ncnn'].map(name => `vision/vendor/install/android-arm64/lib/lib${name}.a`)
    : ['vision/vendor/install/ios/VisionDependencies.xcframework/Info.plist'];
  if (targets.some(file => !existsSync(path.join(root, file)))) {
    throw new Error(`${platform} OpenCV/ncnn dependencies are missing. Run:\n  node vision/scripts/prepare-native.cjs --target ${platform === 'android' ? 'android-arm64' : 'ios'}`);
  }
}
