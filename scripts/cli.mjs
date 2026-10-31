// Unified developer entry points. Node dispatches on every host; platform details stay internal.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDependencies, checkRuntime, checkSources, checkVision } from './prerequisites.mjs';
import { chooseAndroidDevice, chooseIosSimulator } from './device.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rolldown = path.join(root, 'tools/valdi-rolldown');
const tsx = path.join(rolldown, 'node_modules/tsx/dist/cli.mjs');
const platforms = ['android', 'ios'];

const help = `Usage: pnpm <command> [options] [-- <platform tool arguments>]

Commands
  prebuild --platform <android|ios>   Prepare the pinned Valdi sources, bindings, runtime,
                                      native module libraries and Vision dependencies.
                                      Unchanged inputs take the fast path (no export).
  android [options]                   prebuild, build, install and launch the Debug APK on an
                                      Android emulator (or an explicit --device serial).
  ios [options]                       prebuild, build, install and launch the Debug app on an
                                      iOS simulator (macOS only).
  dev                                 Hot reload into running debug apps (scripts/hotreload.sh).
  build:android | build:ios           Pure Debug build, no preparation or device work.
  build                               Build the Valdi module bundles only.
  test                                Pipeline, golden and prerequisite tests.

Options (prebuild, android, ios)
  --platform <android|ios>            prebuild only; android/ios imply it.
  --dry-run                           prebuild: print the plan and exit without changing files.
  --json                              prebuild --dry-run: print the plan as JSON.
  --force-export                      prebuild: export the runtime even when the fingerprint matches.
  --bazel-path <path>                 Bazel executable (Windows; default BAZEL_BIN or PATH).
  --output-base <dir>                 Bazel output/user root (Windows; default C:/b).
  --repository-cache <dir>            Bazel repository cache.
  --disk-cache <dir>                  Bazel disk action cache.
  --go-mod-cache <dir>                Go module cache for Bazel.
  --pnpm-store <dir>                  pnpm store for installs.
  --gradle-user-home <dir>            Gradle user home.
  --proxy-url <url>                   HTTP(S) proxy for build processes only.
  --no-proxy <hosts>                  Comma-separated hosts that bypass the proxy.
  --offline                           Keep GOPROXY=off (Go modules must already be cached).

Options (android, ios)
  --device <id>                       Target this serial (adb) or simulator (udid/name).
  --no-install                        Build only; do not install.
  --no-launch                         Install but do not launch.
  --no-prebuild                       Skip preparation (the build then checks the export itself).
  --release                           Not supported yet; use an explicit export + platform build.

Notes
  * Debug builds only, matching pnpm build:android/build:ios; Release OTA builds stay manual.
  * Physical Android devices are never chosen automatically; name one with --device.
  * Arguments after -- are forwarded to Gradle or xcodebuild.
  * iOS preparation/building/launching requires macOS with Xcode.`;

function parseArguments(argv) {
  const [first, ...others] = argv;
  const command = first && !first.startsWith('-') ? first : undefined;
  const rest = command ? others : argv;
  const options = { passthrough: [] };
  const aliases = {
    '--bazel-path': 'bazelPath',
    '--output-base': 'outputBase',
    '--repository-cache': 'repositoryCache',
    '--disk-cache': 'diskCache',
    '--go-mod-cache': 'goModCache',
    '--pnpm-store': 'pnpmStore',
    '--gradle-user-home': 'gradleUserHome',
    '--proxy-url': 'proxyUrl',
    '--no-proxy': 'noProxy',
    '--platform': 'platform',
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
    else if (flag === '--force-export') options.forceExport = true;
    else if (flag === '--offline') options.offline = true;
    else if (flag === '--no-install') options.noInstall = true;
    else if (flag === '--no-launch') options.noLaunch = true;
    else if (flag === '--no-prebuild') options.noPrebuild = true;
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

function runQuiet(command, args, cwd = root) {
  return spawnSync(command, args, { cwd, stdio: 'ignore' }).status === 0;
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
  if (options.pnpmStore) process.env.npm_config_store_dir = path.resolve(options.pnpmStore);
  if (options.gradleUserHome) process.env.GRADLE_USER_HOME = path.resolve(options.gradleUserHome);
  // Every child (the PowerShell export, prepare-valdi, the module-build Bazel workspace) reads these, and a
  // command-line startup/build flag is the only thing that beats a user-level ~/.bazelrc. An isolated build
  // must not inherit the host's output base or repository cache.
  if (options.outputBase) {
    process.env.VALDI_BAZEL_STARTUP_ARGS = `--output_user_root=${path.resolve(options.outputBase).replace(/\\/g, '/')}`;
  }
  if (options.repositoryCache) {
    process.env.VALDI_BAZEL_ARGS = `--repository_cache=${path.resolve(options.repositoryCache).replace(/\\/g, '/')}`;
  }
  if (options.goModCache) {
    process.env.GOMODCACHE = path.resolve(options.goModCache);
    if (options.offline) process.env.GOPROXY = 'off';
  }
}

function ensureDependencies(options) {
  const missing = ['node_modules', 'valdi/node_modules', 'tools/valdi-rolldown/node_modules']
    .filter(directory => !existsSync(path.join(root, directory)));
  if (!missing.length) return false;
  console.log(`Installing JS dependencies from the frozen lockfiles (${missing.join(', ')} missing)...`);
  run(process.execPath, ['scripts/pnpm.mjs', 'install', '--frozen-lockfile']);
  return true;
}

function ensureSources(options) {
  try {
    checkSources(root);
    return false;
  } catch {
    console.log('Valdi sources are not prepared; fetching the pinned fork...');
    const args = ['scripts/prepare-valdi.mjs'];
    if (options.bazelPath) args.push('--bazel', path.resolve(options.bazelPath));
    if (options.outputBase) args.push('--output-base', options.outputBase);
    if (options.repositoryCache) args.push('--repository-cache', options.repositoryCache);
    run(process.execPath, args);
    return true;
  }
}

function bindingsArguments(platform) {
  return platform === 'android'
    ? ['--kotlin-out', '../../android/app/generated/valdi', '--cpp-out', '../../valdi/native/generated']
    : ['--objc-out', '../../ios/Generated/valdi', '--objc-framework', 'ValdiRuntime', '--cpp-out', '../../valdi/native/generated'];
}

function ensureBindings(platform) {
  const argumentsList = bindingsArguments(platform);
  if (runQuiet(process.execPath, [tsx, 'codegen.ts', ...argumentsList, '--check'], rolldown)) return false;
  console.log('Native bindings are stale; regenerating them (the runtime export follows).');
  run(process.execPath, [tsx, 'codegen.ts', ...argumentsList], rolldown);
  return true;
}

function exportArguments(options) {
  const args = [];
  const map = [
    ['bazelPath', '-BazelPath'],
    ['outputBase', '-OutputBase'],
    ['repositoryCache', '-RepositoryCache'],
    ['diskCache', '-DiskCache'],
    ['goModCache', '-GoModCache'],
  ];
  for (const [key, flag] of map) if (options[key]) args.push(flag, options[key]);
  if (options.offline) args.push('-Offline');
  return args;
}

function exportRuntime(platform, options) {
  if (platform === 'ios') {
    if (process.platform !== 'darwin') throw new Error('iOS runtime preparation requires macOS.');
    run('sh', ['scripts/export-ios.sh'], root);
    return;
  }
  if (process.platform === 'win32') {
    run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows/export-android.ps1'),
      '-Config', 'debug', ...exportArguments(options)]);
  } else {
    run('sh', ['scripts/export-android.sh'], root);
  }
}

function ensureRuntime(platform, options) {
  try {
    checkRuntime(root, platform);
    return false;
  } catch (error) {
    if (!options.forceExport) console.log(`${error.message.split('\n')[0]} Exporting the runtime...`);
    exportRuntime(platform, options);
    return true;
  }
}

function ensureVision(platform, options) {
  try {
    checkVision(root, platform);
    return false;
  } catch {
    const target = platform === 'android' ? 'android-arm64' : 'ios';
    console.log(`Preparing Vision dependencies (${target}) from vision/vendor-lock.json...`);
    run(process.execPath, ['vision/scripts/prepare-native.cjs', '--target', target]);
    return true;
  }
}

function ensureModules(platform) {
  console.log(`Building the Bazel-backed module libraries (${platform})...`);
  run(process.execPath, ['scripts/node-modules.mjs', platform]);
  return true;
}

/** The ordered plan, so --dry-run and tests can inspect the decision without side effects. */
export function planPrebuild({ platform, runtimeCurrent, visionCurrent, bindingsStale }) {
  return {
    platform,
    steps: [
      { step: 'sources', action: 'fetch the pinned Valdi sources when missing' },
      { step: 'bindings', action: bindingsStale ? 'regenerate stale native bindings' : 'check bindings (current)' },
      { step: 'runtime', action: runtimeCurrent ? 'runtime fingerprint matches (skip export)' : 'export the Valdi runtime' },
      { step: 'vision', action: visionCurrent ? 'Vision dependencies match the vendor lock (skip build)' : 'build OpenCV/ncnn from the pinned archives' },
      { step: 'modules', action: 'build the Bazel-backed module libraries (incremental)' },
    ],
  };
}

function prebuild(options) {
  const platform = options.platform;
  if (!platforms.includes(platform)) throw new Error('prebuild requires --platform android or --platform ios. Run with --help.');
  if (platform === 'ios' && process.platform !== 'darwin') throw new Error('iOS preparation requires macOS with Xcode.');
  if (options.release) throw new Error('Release preparation is not supported here yet; export Release explicitly (see docs).');
  applyProxy(options);
  applyCaches(options);

  if (options.dryRun) {
    printPlan(inspectPrebuild(platform), options.json);
    return 0;
  }

  const actions = [];
  if (ensureDependencies(options)) actions.push('installed JS dependencies');
  if (ensureSources(options)) actions.push('fetched Valdi sources');
  if (ensureBindings(platform)) actions.push('regenerated native bindings');
  if (ensureRuntime(platform, options)) actions.push('exported the runtime');
  if (ensureVision(platform, options)) actions.push('prepared Vision dependencies');
  ensureModules(platform);
  actions.push('built module libraries');
  console.log(actions.length ? `Prebuild done: ${actions.join('; ')}.` : 'Prebuild done: everything was current.');
  return 0;
}

/** Inspect the current fingerprints without any side effects; `--dry-run` and tests use this. */
function inspectPrebuild(platform) {
  let runtimeCurrent = false;
  let visionCurrent = false;
  try { checkRuntime(root, platform); runtimeCurrent = true; } catch {}
  try { checkVision(root, platform); visionCurrent = true; } catch {}
  const bindingsStale = !runQuiet(process.execPath, [tsx, 'codegen.ts', ...bindingsArguments(platform), '--check'], rolldown);
  return planPrebuild({ platform, runtimeCurrent, visionCurrent, bindingsStale });
}

function printPlan(plan, json) {
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`Prebuild plan (${plan.platform}):\n` + plan.steps.map(entry => `  ${entry.step}: ${entry.action}`).join('\n'));
}

function androidApplicationId() {
  const text = readFileSync(path.join(root, 'android/app/build.gradle.kts'), 'utf8');
  const match = /applicationId\s*=\s*"([^"]+)"/.exec(text);
  if (!match) throw new Error('Cannot read applicationId from android/app/build.gradle.kts.');
  return match[1];
}

function iosBundleId() {
  const text = readFileSync(path.join(root, 'ios/project.yml'), 'utf8');
  const match = /PRODUCT_BUNDLE_IDENTIFIER:\s*(\S+)/.exec(text);
  if (!match) throw new Error('Cannot read PRODUCT_BUNDLE_IDENTIFIER from ios/project.yml.');
  return match[1].trim();
}

function installAndLaunchAndroid(options) {
  const { adb, device } = chooseAndroidDevice(options.device);
  const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
  if (!existsSync(apk)) throw new Error(`Missing Debug APK: ${apk}. Build it first.`);
  console.log(`Installing on ${device.serial}...`);
  run(adb, ['-s', device.serial, 'install', '-r', '-d', apk]);
  if (options.noLaunch) return;
  console.log(`Launching ${androidApplicationId()} on ${device.serial}...`);
  run(adb, ['-s', device.serial, 'shell', 'monkey', '-p', androidApplicationId(), '-c', 'android.intent.category.LAUNCHER', '1']);
}

function installAndLaunchIos(options) {
  const simulator = chooseIosSimulator(options.device);
  const app = path.join(root, 'ios/build/Build/Products/Debug-iphonesimulator/ValdiRoutes.app');
  if (!existsSync(app)) throw new Error(`Missing simulator app: ${app}. Build it first.`);
  if (simulator.state !== 'Booted') {
    console.log(`Booting ${simulator.name} (${simulator.udid})...`);
    run('xcrun', ['simctl', 'boot', simulator.udid]);
    run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);
  }
  console.log(`Installing on ${simulator.name}...`);
  run('xcrun', ['simctl', 'install', simulator.udid, app]);
  if (options.noLaunch) return;
  console.log(`Launching ${iosBundleId()} on ${simulator.name}...`);
  run('xcrun', ['simctl', 'launch', simulator.udid, iosBundleId()]);
}

function deviceCommand(platform, options) {
  if (options.release) {
    throw new Error('pnpm android/ios build Debug only. Release OTA builds are manual (release export + signed build); see docs.');
  }
  if (platform === 'ios' && process.platform !== 'darwin') throw new Error('pnpm ios requires macOS with Xcode.');
  applyProxy(options);
  applyCaches(options);
  if (options.dryRun) {
    // Dry-run only reports the plan: no Gradle/xcodebuild, no install, no device change.
    const plan = options.noPrebuild ? undefined : inspectPrebuild(platform);
    const device = devicePlan(platform, options);
    if (options.json) console.log(JSON.stringify({ ...(plan ?? { platform }), device: device.data }, null, 2));
    else {
      if (plan) printPlan(plan, false);
      console.log(device.text);
    }
    return 0;
  }
  if (!options.noPrebuild) {
    const code = prebuild({ ...options, platform });
    if (code !== 0) return code;
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
    if (command === 'prebuild') return prebuild(options);
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
