// Read-only app profile arguments and prerequisite audit. Never stages or patches sources.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtime = 'valdi/src/valdi/runtime/';
// Reviewed bytes from the app's accepted pinned runtime patches, 2026-11-03.
// A different maintained implementation needs explicit source review and a new
// receipt here; flags cannot waive ABI/behavior prerequisites.
export const requiredRuntimeFiles = Object.freeze({
  'Interfaces/IJavaScriptContext.hpp': ['lossless-map transport ABI', '8589f4368d62d3024aef45981c1c701563e8d2978956f0cbb23a5172cd55882d'],
  'Interfaces/IJavaScriptContext.cpp': ['lossless-map transport implementation', 'ebad416f86b84c39f8fa7ec03801772796766a766fc076fb22e3cf19c37ba540'],
  'JavaScript/JavaScriptValueDelegate.cpp': ['lossless-map generated marshalling', '7ff09f82bf97713037c4b5045895eaa65442b4785b248a22a36405044feeea83'],
  'JavaScript/JavaScriptUtils.cpp': ['lossless-map ordinary map conversion', '7709c3054f20fd06f2cb107bc2fd6a0675e474e30c04a8027a45ba005a1acd5d'],
  'Views/GlobalViewFactories.cpp': ['nullable factory/cache handling', 'f9c74a678eade9fcd6deb52e541357e514b008e1bf06f16064915f4f34d5e5c4'],
  'Context/ViewManagerContext.cpp': ['nullable factory pool statistics', 'de52fd1cc0a1cc0510a1a43e08ff49cee3494f648c9ffe8ffc5b264401641e74'],
  'Views/ViewPreloader.cpp': ['nullable factory/preload cancellation handling', 'c285df8074126eb71f286d0bf7bce0db6484dedf8d41af94721462042b7570ac'],
  'Views/ViewPreloader.hpp': ['preload cancellation generation ABI', '7830299e4bebfdceaa937eb170a82dd6daf66e10c7ae98da7d284c0c58207bd1'],
});

const variables = {
  mode: 'VALDI_HARMONY_RUNTIME_MODE', forkRoot: 'VALDI_HARMONY_FORK_ROOT',
  profile: 'VALDI_HARMONY_PROFILE', external: 'VALDI_HARMONY_EXTERNAL_DIR',
  proto: 'VALDI_HARMONY_PROTO_DIR', websocketpp: 'VALDI_HARMONY_WEBSOCKETPP_DIR',
};
const dependencyDirectories = ['hermes', 'boost', 'boringssl', 'protobuf', 'abseil', 'harfbuzz',
  'fmt', 'jsoncpp', 'phmap', 'zoo', 'zstd', 'xxhash'];
const protoFiles = ['valdi/valdi.pb.h', 'valdi/valdi.pb.cc',
  'valdi_protobuf/protos/DescriptorIndex.pb.h', 'valdi_protobuf/protos/DescriptorIndex.pb.cc'];

function directory(value, name) {
  if (!value || !path.isAbsolute(value) || /[;\r\n]/.test(value)) {
    throw new Error(`${name} must be an explicit absolute directory without CMake list separators`);
  }
  if (!existsSync(value) || !statSync(value).isDirectory()) throw new Error(`${name} does not exist: ${value}`);
  return realpathSync(value);
}

export function profileConfig(options = {}, env = {}) {
  const config = Object.fromEntries(Object.entries(variables).map(([key, name]) =>
    [key, options[key] ?? env[name]]));
  config.mode ??= 'legacy';
  if (!['legacy', 'fork'].includes(config.mode)) throw new Error('Runtime mode must be legacy or fork');
  if (config.mode === 'legacy') {
    if (config.profile || config.forkRoot) throw new Error('Fork root/profile requires explicit fork mode; refusing legacy fallback');
    return { mode: 'legacy', cmakeArgs: ['-DVALDI_HARMONY_RUNTIME_MODE=legacy'] };
  }
  if (!['lean-release', 'full-development'].includes(config.profile)) {
    throw new Error('Fork mode requires explicit profile lean-release or full-development');
  }
  for (const key of ['forkRoot', 'external', 'proto', 'websocketpp']) {
    config[key] = directory(config[key], variables[key]);
  }
  const required = [
    path.join(config.forkRoot, 'valdi/harmony/runtime/CMakeLists.txt'),
    ...dependencyDirectories.map(name => path.join(config.external, name)),
    ...protoFiles.map(name => path.join(config.proto, name)),
  ];
  if (config.profile === 'full-development') {
    required.push(...['websocketpp/config/asio_no_tls.hpp', 'websocketpp/server.hpp']
      .map(name => path.join(config.websocketpp, name)));
  }
  const missing = required.filter(file => !existsSync(file));
  if (missing.length) throw new Error(`Missing caller-owned runtime inputs:\n${missing.join('\n')}`);
  return { ...config, cmakeArgs: Object.entries(variables).map(([key, name]) => `-D${name}=${config[key]}`) };
}

export function auditFork(config) {
  if (config.mode !== 'fork') return { mode: 'legacy', files: [], failures: [] };
  const files = [];
  const failures = [];
  function read(relative) {
    const file = path.join(config.forkRoot, relative);
    if (!existsSync(file)) {
      failures.push(`Missing source prerequisite: ${relative}`);
      return '';
    }
    const bytes = readFileSync(file);
    files.push({ file: relative, sha256: createHash('sha256').update(bytes).digest('hex') });
    return bytes.toString();
  }
  for (const [relative, [reason, expected]] of Object.entries(requiredRuntimeFiles)) {
    read(runtime + relative);
    const actual = files.find(entry => entry.file === runtime + relative)?.sha256;
    if (actual !== expected) {
      failures.push(`${reason}: ${runtime + relative}\n  expected reviewed SHA256 ${expected}; actual ${actual ?? 'missing'}`);
    }
  }
  const js = read(runtime + 'JavaScript/JavaScriptRuntime.cpp');
  if (!js.includes('castOrNull<LoadedAsset>(unwrapWrappedObject(')) {
    failures.push('Loaded-image unwrap prerequisite: JavaScriptRuntime.cpp must unwrap WrappedObject before casting LoadedAsset');
  }
  const asset = read(runtime + 'Context/ViewNodeAssetHandler.cpp');
  if (!/updateLoadObserver\(\);[\s\S]*?if \(asset == nullptr && _loadedAsset != loadedAsset\)/.test(asset) ||
      /_asset = asset;\s*_loadedAsset = loadedAsset;/.test(asset)) {
    failures.push('Loaded-image observer prerequisite: ViewNodeAssetHandler.cpp must install direct loaded assets after observer teardown');
  }
  if (config.profile === 'full-development') {
    const header = read(runtime + 'RuntimeManager.hpp');
    for (const api of ['bool enableDebuggerService', 'bool disableHotReloader',
      'std::optional<uint32_t> debuggerPort', 'void setApplicationId(', 'void attachHotReloader(']) {
      if (!header.includes(api)) failures.push(`Official RuntimeManager API prerequisite missing: ${api}`);
    }
    const manager = read(runtime + 'RuntimeManager.cpp');
    if (!/case PlatformTypeHarmony:\s*platform = snap::valdi_core::Platform::Harmony;\s*break;/.test(manager)) {
      failures.push('Harmony debugger prerequisite: RuntimeManager.cpp must map Harmony to Platform::Harmony instead of returning nullptr');
    }
    const daemon = read(runtime + 'Debugger/DaemonClient.cpp');
    if (!/case snap::valdi_core::Platform::Harmony:\s*configure\.setMapValue\("platform", Value\(STRING_LITERAL\("harmony"\)\)\);/.test(daemon)) {
      failures.push('Harmony daemon prerequisite: DaemonClient.cpp must advertise platform "harmony"');
    }
  }
  return { mode: config.mode, profile: config.profile, forkRoot: config.forkRoot, files, failures };
}

function main(args) {
  const names = { '--mode': 'mode', '--fork-root': 'forkRoot', '--profile': 'profile',
    '--external': 'external', '--proto': 'proto', '--websocketpp': 'websocketpp' };
  const options = {};
  let audit = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--audit') { audit = true; continue; }
    const key = names[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--') || key in options) {
      throw new Error(`Unknown, duplicate or incomplete argument: ${args[i]}`);
    }
    options[key] = args[++i];
  }
  // Audit invocations from CMake must depend only on the explicit cache inputs.
  const config = profileConfig(options, audit ? {} : process.env);
  if (audit) {
    const receipt = auditFork(config);
    if (receipt.failures.length) {
      throw new Error(`Maintained fork is not app-compatible. Migrate/review these prerequisites in the fork; no patches were applied:\n${receipt.failures.join('\n')}`);
    }
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(JSON.stringify(config, null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
