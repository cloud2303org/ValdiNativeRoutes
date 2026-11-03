// Isolated Harmony signed-OTA packaging. No build/export/HAP invocation.
// API + CLI contract: host/HarmonyOTA_INTEGRATION.md.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const versionRE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const fileRE = /^(modules\/[A-Za-z0-9_@][A-Za-z0-9._@-]*\.(valdimodule|map\.json)|res\/assets\/[A-Za-z0-9_@][A-Za-z0-9._@-]*\/[A-Za-z0-9_@][A-Za-z0-9._@-]*\.(png|webp))$/;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (value, message) => { if (!value) throw new Error(message); };
const version = value => requireValue(typeof value === 'string' && versionRE.test(value), 'Invalid OTA version');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const stripComments = text => text.split('\n').map(line => line.trim())
  .filter(line => line && !/^(\/\*|\*|\/\/)/.test(line)).join('\n');
// Exactly the root ota.mjs digest algorithm; bytewise sort, no locale ordering.
export function digest(entries) {
  const hash = createHash('sha256');
  for (const [name, bytes] of [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    hash.update(`${name}\0${sha256(bytes)}\n`);
  return hash.digest('hex');
}

function noLinks(file) {
  const absolute = path.resolve(file);
  let prefix = path.parse(absolute).root;
  for (const part of absolute.slice(prefix.length).split(path.sep)) {
    prefix = path.join(prefix, part);
    requireValue(!lstatSync(prefix).isSymbolicLink(), 'OTA input/output may not traverse symlinks');
  }
  return absolute;
}
function mkdirGuarded(directory) {
  const absolute = path.resolve(directory);
  let prefix = path.parse(absolute).root;
  for (const part of absolute.slice(prefix.length).split(path.sep)) {
    prefix = path.join(prefix, part);
    const st = lstatSync(prefix, { throwIfNoEntry: false });
    if (st) requireValue(st.isDirectory() && !st.isSymbolicLink(), 'OTA output may not traverse symlinks');
    else mkdirSync(prefix, { mode: 0o700 });
  }
}
function walk(directory, prefix = '') {
  noLinks(directory);
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
    .filter(entry => !entry.name.startsWith('.')).flatMap(entry => {
      const file = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = lstatSync(file);
      requireValue(!stat.isSymbolicLink(), 'OTA input contains a symlink');
      if (stat.isDirectory()) return walk(file, relative);
      requireValue(stat.isFile() && stat.nlink === 1, 'OTA input must be a regular unlinked file');
      return [[relative, readFileSync(file)]];
    });
}
function sourceEntries(root, inputs) {
  return inputs.flatMap(relative => {
    requireValue(!path.isAbsolute(relative) && !relative.split('/').some(part => part === '..'), 'Unsafe fingerprint input');
    const file = path.join(root, relative);
    // Same missing-as-empty behavior as the existing fingerprint recipe.
    if (!lstatSync(file, { throwIfNoEntry: false })) return [];
    noLinks(file);
    const st = lstatSync(file);
    return st.isDirectory() ? walk(file, relative) : [[relative, readFileSync(file)]];
  });
}
export function fingerprintParts({ config = 'release', valdi, bindings, native }) {
  requireValue(config === 'release' && [valdi, bindings, native].every(value => /^[0-9a-f]{64}$/.test(value)),
    'OTA requires release SHA-256 compatibility parts');
  return { fingerprint: sha256(`harmony\n${config}\n${valdi}\n${bindings}\n${native}\n`).slice(0, 32),
    config, valdi, bindings, native };
}
export const harmonyNativeInputs = [
  'harmony/entry/src/main/cpp', 'harmony/entry/src/main/ets', 'harmony/entry/src/main/module.json5',
  'harmony/entry/build-profile.json5', 'harmony/build-profile.json5', 'harmony/AppScope/app.json5',
  'harmony/runtime-build', 'harmony/business-build', 'scripts/harmony',
  'tools/valdi-rolldown/harmony-business.ts', 'tools/valdi-rolldown/harmony.ts',
  'tools/valdi-rolldown/harmony-options.ts', 'scripts/upstream-runtime-patches.mjs',
];
// runtimeInfo is the binary export attestation, supplied by the PARENT packager.
// Its valdi/native fields use the exact root valdi-hash algorithm. This helper
// refuses stale exports rather than generating an attestation for unbuilt code.
export function computeCompatibility({ root = project, runtimeInfo, bindingsDirectory, publicKeyFile,
  nativeInputs = harmonyNativeInputs }) {
  requireValue(runtimeInfo.platform === 'harmony' && runtimeInfo.config === 'release',
    'A release Harmony runtime export attestation is required');
  const inputs = json(path.join(root, 'ota/fingerprint.json'));
  const valdi = digest([...sourceEntries(root, inputs.valdi), ['compiler-backend', 'node']]);
  requireValue(runtimeInfo.valdi === valdi && runtimeInfo.native === digest(sourceEntries(root, ['valdi/native'])),
    'Harmony export is stale: native runtime must be rebuilt by the parent packager');
  const bindings = walk(bindingsDirectory)
    .filter(([name]) => /\.(hpp|cpp|h|cc)$/.test(name))
    .map(([name, bytes]) => [name, stripComments(bytes.toString('utf8'))]);
  requireValue(bindings.length > 0, 'No generated Harmony C++ bindings');
  const publicKey = readFileSync(noLinks(publicKeyFile));
  validatePublicKey(publicKey);
  return fingerprintParts({ config: runtimeInfo.config, valdi, bindings: digest(bindings),
    native: digest([...sourceEntries(root, nativeInputs), ['ota/public.pem', publicKey]]) });
}
export function validatePublicKey(pem) {
  requireValue(!pem.toString().includes('PRIVATE KEY'), 'Only a public signing key is accepted');
  const key = createPublicKey(pem);
  requireValue(key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1',
    'OTA signing key must be ECDSA P-256');
  return key;
}
export function appInfo({ appVersion, parts, url = '', publicKey = '' }) {
  version(appVersion);
  requireValue(fingerprintParts(parts).fingerprint === parts.fingerprint, 'Invalid compatibility fingerprint');
  if (url) {
    const parsed = new URL(url);
    requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      !parsed.search && !parsed.hash && !/[%\\]/.test(url), 'Release OTA endpoint must use HTTPS without credentials');
    validatePublicKey(publicKey);
  } else if (publicKey) validatePublicKey(publicKey);
  return { appVersion, fingerprint: parts.fingerprint, url, publicKey };
}
export function recordRelease(file, parts) {
  requireValue(fingerprintParts(parts).fingerprint === parts.fingerprint, 'Invalid compatibility fingerprint');
  if (existsSync(file)) {
    const recorded = json(noLinks(file));
    requireValue(recorded.fingerprint === parts.fingerprint, 'App version already records a different native side');
  } else {
    mkdirGuarded(path.dirname(file));
    writeFileSync(file, `${JSON.stringify(parts, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
}
// buildBusiness() already produces the rawfile tree + build-info.json. Consume only
// completed outputs; never call it here. Caller supplies the C++ bindings produced
// in that SAME build to computeCompatibility().
export function collectBusiness(rawfileDirectory) {
  noLinks(rawfileDirectory);
  const metadata = json(path.join(rawfileDirectory, 'build-info.json'));
  requireValue(metadata.schemaVersion === 1 && metadata.profile === 'business' && metadata.hbcVersion === 99 &&
    metadata.engine === 'hermes-260318099.0.4' && metadata.platform === 6 && metadata.moduleProof &&
    metadata.bootstrap?.module === 'harmony_business/src/app', 'Expected completed Harmony business HBC99 outputs');
  const entries = [];
  for (const [name, proof] of Object.entries(metadata.moduleProof)) {
    requireValue(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(name), 'Unsafe business module name');
    requireValue(proof.hbcEntries > 0 && proof.diagnostics === 0, 'Business HBC diagnostics/proof missing');
    const filename = path.join(rawfileDirectory, 'modules', `${name}.valdimodule`);
    const bytes = readFileSync(noLinks(filename));
    requireValue(sha256(bytes) === proof.sha256, 'Business module differs from its build proof');
    entries.push([`modules/${name}.valdimodule`, bytes]);
    const map = path.join(rawfileDirectory, 'modules', `${name}.map.json`);
    if (existsSync(map)) entries.push([`modules/${name}.map.json`, readFileSync(noLinks(map))]);
  }
  const assets = path.join(rawfileDirectory, 'assets');
  if (existsSync(assets)) for (const [name, bytes] of walk(assets)) entries.push([`res/assets/${name}`, bytes]);
  requireValue(entries.some(([name]) => name === 'modules/harmony_business.valdimodule'), 'Missing business bootstrap archive');
  return entries;
}
// signer receives exact manifest bytes and returns base64 DER ECDSA. No repository
// private-key path is read, generated or inferred by this helper.
export function packHarmony({ appVersion, updateVersion, parts, recorded, entries, publicKey, signer, output }) {
  version(appVersion); version(updateVersion);
  // The version directory shares its parent with the latest pointer file.
  // Reserve case aliases too for case-insensitive packaging filesystems.
  requireValue(updateVersion.toLowerCase() !== 'latest.json', 'Reserved OTA version: latest.json');
  const key = validatePublicKey(publicKey);
  requireValue(fingerprintParts(parts).fingerprint === parts.fingerprint &&
    recorded.fingerprint === parts.fingerprint && ['config', 'valdi', 'bindings', 'native']
      .every(part => recorded[part] === parts[part]), 'Package native side differs from the recorded binary release');
  requireValue(entries.length > 0 && entries.length <= 4096, 'Invalid package file count');
  const files = Object.create(null);
  let total = 0;
  for (const [name, bytes] of entries) {
    requireValue(fileRE.test(name) && !Object.hasOwn(files, name), 'Invalid or duplicate OTA package path');
    total += bytes.length;
    requireValue(total <= 64 * 1024 * 1024, 'Package exceeds 64 MiB');
    files[name] = sha256(bytes);
  }
  requireValue(Object.keys(files).some(name => name.endsWith('.valdimodule')), 'Package has no module');
  const manifest = Buffer.from(`${JSON.stringify({
    platform: 'harmony', appVersion, fingerprint: parts.fingerprint, version: updateVersion, files,
  }, null, 2)}\n`);
  requireValue(manifest.length <= 1024 * 1024, 'Manifest exceeds 1 MiB');
  const signature = String(signer(manifest)).trim();
  requireValue(signature.length <= 4096 && /^[A-Za-z0-9+/]+={0,2}$/.test(signature) &&
    verify('sha256', manifest, { key, dsaEncoding: 'der' }, Buffer.from(signature, 'base64')),
  'External signer did not return a valid P-256/SHA-256 DER signature');
  const base = path.resolve(output, 'harmony', appVersion);
  mkdirGuarded(base);
  const destination = path.join(base, updateVersion);
  requireValue(!lstatSync(destination, { throwIfNoEntry: false }), 'OTA versions are immutable');
  const staged = mkdtempSync(path.join(base, '.ota-stage-'));
  let latest;
  try {
    for (const [name, bytes] of entries) {
      const file = path.join(staged, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes, { flag: 'wx' });
    }
    writeFileSync(path.join(staged, 'manifest.json'), manifest);
    writeFileSync(path.join(staged, 'manifest.sig'), signature);
    renameSync(staged, destination);
    // Publish latest only after immutable files + verified signature are visible.
    latest = mkdtempSync(path.join(base, '.ota-latest-'));
    writeFileSync(path.join(latest, 'latest.json'), `${JSON.stringify({ version: updateVersion })}\n`);
    renameSync(path.join(latest, 'latest.json'), path.join(base, 'latest.json'));
    return destination;
  } finally {
    rmSync(staged, { recursive: true, force: true });
    if (latest) rmSync(latest, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    requireValue(args[i].startsWith('--') && args[i + 1] !== undefined, 'Expected --name VALUE');
    options[args[i].slice(2)] = args[i + 1];
  }
  const required = name => { requireValue(options[name], `Missing --${name}`); return options[name]; };
  const publicKeyFile = options['public-key'] ?? path.join(project, 'ota/public.pem');
  const publicKey = readFileSync(noLinks(publicKeyFile), 'utf8');
  const parts = computeCompatibility({
    runtimeInfo: json(required('runtime-info')), bindingsDirectory: required('bindings'), publicKeyFile,
  });
  if (command === 'fingerprint') console.log(JSON.stringify(parts));
  else if (command === 'app-info') {
    const info = appInfo({ appVersion: required('app-version'), parts, url: options.url ?? '', publicKey });
    if (options.record) recordRelease(options.record, parts);
    console.log(JSON.stringify(info));
  } else if (command === 'pack') {
    const signerExecutable = required('signer');
    console.log(packHarmony({
      appVersion: required('app-version'), updateVersion: required('version'), parts,
      recorded: json(required('record')), entries: collectBusiness(required('rawfile')), publicKey,
      signer: bytes => execFileSync(signerExecutable, [], { input: bytes, encoding: 'utf8', maxBuffer: 4096 }),
      output: required('output'),
    }));
  } else throw new Error('Usage: ota.mjs fingerprint|app-info|pack --runtime-info FILE --bindings DIR [options]');
}
