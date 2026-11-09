const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Matches the pinned Valdi hermetic_ndk extension. Do not change the runtime's
// toolchain to accommodate a vendor cache; rebuild the vendors with this one.
const config = require('../android-runtime.json');

function ndkRevision(directory) {
  try {
    return fs.readFileSync(path.join(directory, 'source.properties'), 'utf8')
      .match(/^Pkg\.Revision\s*=\s*(\S+)/m)?.[1];
  } catch {
    return undefined;
  }
}

function resolveRuntimeNdk(root = path.resolve(__dirname, '../..'), env = process.env) {
  const explicit = env.VISION_ANDROID_NDK;
  if (explicit) {
    if (ndkRevision(explicit) !== config.ndkRevision) {
      throw new Error(`VISION_ANDROID_NDK must match Valdi's NDK ${config.ndkRevision}: ${explicit}`);
    }
    return path.resolve(explicit);
  }
  const sdk = env.ANDROID_SDK_ROOT || env.ANDROID_HOME
    || (process.platform === 'win32' ? path.join(env.LOCALAPPDATA || os.homedir(), 'Android/sdk')
      : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Android/sdk') : path.join(os.homedir(), 'Android/Sdk'));
  const candidates = [path.join(sdk, 'ndk', config.ndkRevision)];
  // Bazel's already-resolved hermetic NDK can be reused without downloading or
  // invoking another Bazel command while the parent exports the runtime.
  const externals = new Set();
  for (const workspace of ['valdi', 'module-build']) {
    if (env.VALDI_BAZEL_OUTPUT_BASE_ROOT) {
      // Windows/CLI isolated builds map each workspace below this base root.
      // Do not fall back to convenience links pointing into a shared cache.
      externals.add(path.join(env.VALDI_BAZEL_OUTPUT_BASE_ROOT, workspace, 'external'));
      continue;
    }
    externals.add(path.join(root, workspace, '.valdi-sources/external'));
    const convenience = path.join(root, workspace, `bazel-${workspace}`);
    externals.add(path.join(convenience, 'external'));
    try {
      const actual = fs.realpathSync(convenience);
      // Before analysis the link may point directly to output_base; after a
      // build it points to output_base/execroot/_main.
      if (path.basename(path.dirname(actual)) === 'execroot') {
        externals.add(path.resolve(actual, '../../external'));
      }
    } catch {}
  }
  for (const external of externals) {
    try {
      for (const entry of fs.readdirSync(external).filter(name => name === 'androidndk' || name.endsWith('+androidndk'))) {
        candidates.push(path.join(external, entry, 'ndk'));
      }
    } catch {}
  }
  const found = candidates.find(candidate => ndkRevision(candidate) === config.ndkRevision);
  if (!found) throw new Error(`Install Android NDK ${config.ndkRevision} or set VISION_ANDROID_NDK to Valdi's resolved NDK directory.`);
  return fs.realpathSync(found);
}

module.exports = {config, ndkRevision, resolveRuntimeNdk};
