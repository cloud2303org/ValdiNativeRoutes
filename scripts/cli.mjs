// Unified developer entry points. Node dispatches on every host; platform details stay internal.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseAndroidDevice, chooseIosSimulator } from './device.mjs';
import { appBuildPaths, readAppConfig } from './app-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const help = `Usage: pnpm <command> [options] [-- <platform tool arguments>]

Commands
  android [options]                   Build, install and launch the Debug APK on an
                                      Android emulator (or an explicit --device serial).
  ios [options]                       Build, install and launch the Debug app on an
                                      iOS simulator (macOS only).
  dev                                 Hot reload; press a/i to build and launch a selected device.
  build:android | build:ios           Debug build only, without installing or launching.
  build                               Build the Valdi module bundles only.
  test                                Pipeline, golden and prerequisite tests.

Options (android, ios)
  --dry-run                           Print the build/device plan without changing files.
  --json                              Print the dry-run plan as JSON.
  --device <id>                       Target this serial (adb) or simulator (udid/name).
  --no-install                        Build only; do not install.
  --no-launch                         Install but do not launch.
  --bazel-path <path>                 Bazel executable (default BAZEL_BIN or PATH).
  --output-base <dir>                 Root for isolated Bazel output bases.
  --repository-cache <dir>            Bazel repository cache.
  --go-mod-cache <dir>                Go module cache for Bazel.
  --gradle-user-home <dir>            Gradle user home.
  --proxy-url <url>                   HTTP(S) proxy for build processes only.
  --no-proxy <hosts>                  Comma-separated hosts that bypass the proxy.
  --offline                           Keep GOPROXY=off (Go modules must already be cached).
  --release                           Not supported here; use explicit Release export/build.

Notes
  * Debug builds only; Release OTA builds stay manual.
  * Install JS dependencies with pnpm install before building.
  * Export the runtime manually with scripts/export-android.sh or scripts/export-ios.sh.
    Runtime changes require a new export; builds do not fingerprint or export it.
  * Host modules prepare their declared native dependencies during app builds.
    Runtime C++ modules prepare theirs during the explicit runtime export.
  * Physical Android devices are never chosen automatically; name one with --device.
  * Arguments after -- are forwarded to Gradle or xcodebuild.
  * iOS building/launching requires macOS with Xcode.`;

function parseArguments(argv) {
  const [first, ...others] = argv;
  const command = first && !first.startsWith('-') ? first : undefined;
  const rest = command ? others : argv;
  const options = { passthrough: [] };
  const aliases = {
    '--bazel-path': 'bazelPath',
    '--output-base': 'outputBase',
    '--repository-cache': 'repositoryCache',
    '--go-mod-cache': 'goModCache',
    '--gradle-user-home': 'gradleUserHome',
    '--proxy-url': 'proxyUrl',
    '--no-proxy': 'noProxy',
    '--device': 'device',
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--') {
      options.passthrough = rest.slice(index + 1);
      break;
    }
    const [flag, inline] = argument.split('=');
    if (aliases[flag]) {
      const value = inline ?? rest[++index];
      if (!value) throw new Error(`${flag} needs a value`);
      options[aliases[flag]] = value;
    } else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--json') options.json = true;
    else if (flag === '--offline') options.offline = true;
    else if (flag === '--no-install') options.noInstall = true;
    else if (flag === '--no-launch') options.noLaunch = true;
    else if (flag === '--release') options.release = true;
    else if (flag === '--help' || flag === '-h') options.help = true;
    else throw new Error(`Unknown option: ${argument}. Run with --help.`);
  }
  return { command, options };
}

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function applyProxy(options) {
  if (!options.proxyUrl) return;
  const list = ['localhost', '127.0.0.1', '::1', ...(options.noProxy ? options.noProxy.split(',') : [])].join(',');
  for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) process.env[name] = options.proxyUrl;
  for (const name of ['NO_PROXY', 'no_proxy']) process.env[name] = list;
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.proxy';
  process.env.GIT_CONFIG_VALUE_0 = options.proxyUrl;
}

function applyCaches(options) {
  if (options.bazelPath) process.env.BAZEL_BIN = path.resolve(options.bazelPath);
  if (options.gradleUserHome) process.env.GRADLE_USER_HOME = path.resolve(options.gradleUserHome);
  // Every child (the PowerShell export, prepare-valdi, the module-build Bazel workspace) reads these, and a
  // command-line startup/build flag is the only thing that beats a user-level ~/.bazelrc. An isolated build
  // must not inherit the host's output base or repository cache.
  if (options.outputBase) {
    const root = path.resolve(options.outputBase).replace(/\\/g, '/');
    // A host rc that sets `startup --output_base` beats `--output_user_root`, so every workspace must name
    // its own base. Two workspaces (valdi, module-build) cannot share one base, so only the root travels in
    // the environment and each workspace appends its own suffix.
    process.env.VALDI_BAZEL_OUTPUT_BASE_ROOT = `${root}/base`;
    process.env.VALDI_BAZEL_STARTUP_ARGS = `--output_user_root=${root}`;
  }
  if (options.repositoryCache) {
    process.env.VALDI_BAZEL_ARGS = `--repository_cache=${path.resolve(options.repositoryCache).replace(/\\/g, '/')}`;
  }
  if (options.goModCache) {
    process.env.GOMODCACHE = path.resolve(options.goModCache);
    if (options.offline) process.env.GOPROXY = 'off';
  }
}

function installAndLaunchAndroid(options) {
  const applicationId = readAppConfig(root).android.applicationId;
  const { adb, device } = chooseAndroidDevice(options.device);
  const apk = appBuildPaths(root).androidApk;
  if (!existsSync(apk)) throw new Error(`Missing Debug APK: ${apk}. Build it first.`);
  console.log(`Installing on ${device.serial}...`);
  run(adb, ['-s', device.serial, 'install', '-r', '-d', apk]);
  if (options.noLaunch) return;
  console.log(`Launching ${applicationId} on ${device.serial}...`);
  run(adb, ['-s', device.serial, 'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1']);
}

function installAndLaunchIos(options) {
  const bundleId = readAppConfig(root).ios.bundleIdentifier;
  const simulator = chooseIosSimulator(options.device);
  const app = appBuildPaths(root).iosApp;
  if (!existsSync(app)) throw new Error(`Missing simulator app: ${app}. Build it first.`);
  if (simulator.state !== 'Booted') {
    console.log(`Booting ${simulator.name} (${simulator.udid})...`);
    run('xcrun', ['simctl', 'boot', simulator.udid]);
    run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);
  }
  console.log(`Installing on ${simulator.name}...`);
  run('xcrun', ['simctl', 'install', simulator.udid, app]);
  if (options.noLaunch) return;
  console.log(`Launching ${bundleId} on ${simulator.name}...`);
  run('xcrun', ['simctl', 'launch', simulator.udid, bundleId]);
}

function deviceCommand(platform, options) {
  if (options.release) {
    throw new Error('pnpm android/ios build Debug only. Release OTA builds are manual (release export + signed build); see docs.');
  }
  if (platform === 'ios' && process.platform !== 'darwin') throw new Error('pnpm ios requires macOS with Xcode.');
  applyProxy(options);
  applyCaches(options);
  if (options.dryRun) {
    const device = devicePlan(platform, options);
    if (options.json) console.log(JSON.stringify({ platform, build: 'Debug', device: device.data }, null, 2));
    else console.log(`Build plan: Debug ${platform} app.\n${device.text}`);
    return 0;
  }
  const projectArgs = [path.join(root, 'scripts/project.mjs'), platform];
  if (process.env.CI) projectArgs.push('--no-daemon');
  projectArgs.push(...options.passthrough);
  run(process.execPath, projectArgs, root);
  if (!options.noInstall) {
    if (platform === 'android') installAndLaunchAndroid(options);
    else installAndLaunchIos(options);
  }
  return 0;
}

/** Dry-run only: say which device the real run would use, without failing when none is up. */
function devicePlan(platform, options) {
  const actions = options.noInstall
    ? 'build only (--no-install)'
    : options.noLaunch ? 'build and install (--no-launch)' : 'build, install and launch';
  try {
    if (platform === 'android') {
      const { device } = chooseAndroidDevice(options.device);
      return { text: `Device plan: ${actions} the Debug APK on ${device.serial}.`, data: { actions, serial: device.serial } };
    }
    const simulator = chooseIosSimulator(options.device);
    return {
      text: `Device plan: ${actions} the Debug app on ${simulator.name} (${simulator.udid}).`,
      data: { actions, udid: simulator.udid, name: simulator.name },
    };
  } catch (error) {
    return { text: `Device plan: ${actions} — ${error.message}`, data: { actions, error: error.message } };
  }
}

function dev(options) {
  const bash = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe'), 'bash'].find(candidate => existsSync(candidate))
    : 'bash';
  if (!bash) throw new Error('pnpm dev needs Git Bash on Windows (install Git for Windows) or bash on macOS/Linux.');
  if (options.dryRun) {
    console.log(`Hot reload plan: ${bash} ${path.join(root, 'scripts/hotreload.sh')} ${options.passthrough.join(' ')}`.trim());
    return 0;
  }
  run(bash, [path.join(root, 'scripts/hotreload.sh'), ...options.passthrough], root);
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    console.error(`${error.message}\n\n${help}`);
    return 2;
  }
  const { command, options } = parsed;
  if (!command || options.help || command === 'help') {
    console.log(help);
    return 0;
  }
  try {
    readAppConfig(root);
    if (command === 'android') return deviceCommand('android', options);
    if (command === 'ios') return deviceCommand('ios', options);
    if (command === 'dev') return dev(options);
    console.error(`Unknown command: ${command}\n\n${help}`);
    return 2;
  } catch (error) {
    console.error(`\n${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
