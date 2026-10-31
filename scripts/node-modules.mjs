// Module-only Bazel workspace. App packaging remains Gradle/Xcode.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.join(root, 'module-build');

/** Whitespace-separated extra Bazel flags from the environment (empty when unset). */
export function extraBazelFlags(value) {
  return (value ?? '')
    .split(/\s+/)
    .map(flag => flag.trim())
    .filter(Boolean);
}

/**
 * Bazel on Windows falls back to `C:\Windows\System32\bash.exe` (WSL) for genrules when BAZEL_SH is unset,
 * which fails on machines without a WSL distribution. The unified entry points do not run through the
 * PowerShell wrapper that sets it, so resolve Git Bash here too.
 */
export function ensureBazelShell(env = process.env) {
  if (process.platform !== 'win32' || env.BAZEL_SH) return env.BAZEL_SH;
  const programFiles = env.ProgramFiles ?? 'C:/Program Files';
  const candidates = [
    `${programFiles}/Git/bin/bash.exe`,
    `${programFiles}/Git/usr/bin/bash.exe`,
    `${env.ProgramW6432 ?? programFiles}/Git/bin/bash.exe`,
    'C:/Program Files (x86)/Git/bin/bash.exe',
  ];
  const shell = candidates.find(candidate => existsSync(candidate));
  if (!shell) {
    throw new Error(
      'Bazel needs a POSIX shell on Windows: install Git for Windows or set BAZEL_SH to ...\\Git\\bin\\bash.exe.',
    );
  }
  env.BAZEL_SH = shell;
  return shell;
}

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
  // module-build/modules is a tracked symlink. A Windows checkout without symlink support (a limited
  // runner account) writes it as a text file, and Bazel cannot follow that; a junction needs no
  // privilege. Restore the tracked content afterwards so the checkout stays as git expects.
  const modulesLink = path.join(workspace, 'modules');
  const modulesTarget = path.join(root, 'valdi/modules');
  let restoreText;
  const linkState = lstatSync(modulesLink, { throwIfNoEntry: false });
  if (linkState && !linkState.isSymbolicLink() && linkState.isFile()) {
    restoreText = readFileSync(modulesLink);
    rmSync(modulesLink, { force: true });
  }
  if (!existsSync(modulesLink)) symlinkSync(modulesTarget, modulesLink, 'junction');
  try {
    return buildWithJunction(platform, release, native, names);
  } finally {
    if (restoreText !== undefined) {
      rmSync(modulesLink, { recursive: true, force: true });
      writeFileSync(modulesLink, restoreText);
    }
  }
}

function buildWithJunction(platform, release, native, names) {
  const command = process.env.BAZEL_BIN ?? 'bazel';
  ensureBazelShell();
  // Startup flags must precede the command, and explicit ones beat every rc file (a user-level
  // ~/.bazelrc can otherwise redirect the output base or repository cache of an isolated build).
  const startup = extraBazelFlags(process.env.VALDI_BAZEL_STARTUP_ARGS);
  const extra = extraBazelFlags(process.env.VALDI_BAZEL_ARGS);
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
  const result = spawnSync(command, [...startup, 'build', ...targets, ...flags, ...extra, '--noshow_progress'], {
    cwd: workspace,
    env,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(`Module Bazel build failed: ${result.error?.message ?? result.status}`);
  const info = spawnSync(command, [...startup, 'info', 'bazel-bin', ...flags, ...extra], { cwd: workspace, env, encoding: 'utf8' });
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
