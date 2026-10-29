// Module-only Bazel workspace. App packaging remains Gradle/Xcode.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.join(root, 'module-build');

// Bazel marks output directories read-only. Keep the host's staging tree writable
// so Xcode/Gradle can consume refreshed resources on subsequent builds.
export function copyModuleTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  chmodSync(destination, 0o755);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyModuleTree(from, to);
    else {
      if (existsSync(to)) chmodSync(to, 0o644);
      copyFileSync(from, to);
      chmodSync(to, 0o644);
    }
  }
}

export function bazelModules() {
  const directory = path.join(root, 'valdi/modules');
  return readdirSync(directory)
    .filter(name => {
      const file = path.join(directory, name, 'module.json');
      return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).nativeBuild === 'bazel';
    })
    .sort();
}

export function buildNodeModules(platform = 'ios', release = false, native = false) {
  if (!['ios', 'android'].includes(platform)) throw new Error('Module platform must be ios or android');
  const names = bazelModules();
  if (!names.length) return new Map();
  const commit = file => /VALDI_COMMIT\s*=\s*"([a-f0-9]+)"/.exec(readFileSync(file, 'utf8'))?.[1];
  if (commit(path.join(root, 'valdi/MODULE.bazel')) !== commit(path.join(workspace, 'MODULE.bazel'))) {
    throw new Error(
      'module-build and valdi must pin the same Valdi commit; synchronize module-build before building modules',
    );
  }
  const command = process.env.BAZEL_BIN ?? 'bazel';
  const flags =
    platform === 'ios' ? ['--platforms=//:ios_sim_arm64'] : ['--android_platforms=@snap_platforms//os:android_arm64'];
  const env = { ...process.env };
  if (process.platform === 'darwin' && !env.JAVA_HOME) {
    const java = spawnSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' });
    if (java.status === 0) env.JAVA_HOME = java.stdout.trim();
  }
  const targets = names.flatMap(name => [
    `//modules/${name}:${name}_${release ? 'release' : 'compiled'}`,
    ...(native ? [`//modules/${name}:${name}_${platform}`] : []),
  ]);
  const result = spawnSync(command, ['build', ...targets, ...flags, '--noshow_progress'], {
    cwd: workspace,
    env,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(`Module Bazel build failed: ${result.error?.message ?? result.status}`);
  const info = spawnSync(command, ['info', 'bazel-bin', ...flags], { cwd: workspace, env, encoding: 'utf8' });
  if (info.status !== 0 || !info.stdout.trim()) throw new Error(`Cannot locate module Bazel outputs: ${info.stderr}`);
  const bin = info.stdout.trim();
  const outputs = new Map();
  for (const name of names) {
    const directory = path.join(bin, 'modules', name);
    outputs.set(name, path.join(directory, `${name}_${release ? 'release' : 'compiled'}`));
    if (native) {
      const destination = path.join(workspace, 'out', platform, name);
      mkdirSync(destination, { recursive: true });
      const filename = platform === 'ios' ? `lib${name}_ios.a` : `${name}_android.jar`;
      // objc_library(alwayslink=True) emits an ar archive with Bazel's .lo suffix.
      const source = platform === 'ios' ? `lib${name}_ios.lo` : `lib${name}_android.jar`;
      cpSync(path.join(directory, source), path.join(destination, filename));
      if (platform === 'ios')
        copyModuleTree(path.join(directory, `${name}_compiled/ios`), path.join(destination, 'include'));
    }
  }
  return outputs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [platform, mode = 'debug'] = process.argv.slice(2);
  if (!['debug', 'release'].includes(mode)) throw new Error('Mode must be debug or release');
  buildNodeModules(platform, mode === 'release', true);
}
