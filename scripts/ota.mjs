// Static full-file OTA updates. Compatibility is selected manually by platform and app version.
//   node scripts/ota.mjs keygen                                  ota/private.pem (keep out of git) and ota/public.pem
//   node scripts/ota.mjs app-info <android|ios> <valdi_ota.json> <app version> <update url>
//                                                                the app's valdi_ota.json (Gradle, ios/project.yml)
//   node scripts/ota.mjs pack <android|ios> <app version> <version> [--base <package dir|archive> [--base-version <version>]]
//
// The publisher owns native compatibility: incompatible native changes require a new app version.
//
// ota/dist is what the update server serves, as static files:
//   <platform>/<app version>/latest.json                {"version": "<version>"}
//   <platform>/<app version>/<version>/manifest.json    schemaVersion, platform, appVersion, version, files: {path: {sha256,size}}
//   <platform>/<app version>/<version>/manifest.sig     base64 ECDSA P-256 / SHA-256 signature of manifest.json
//   <platform>/<app version>/<version>/<path>           modules/<module>.{valdimodule,map.json}, res/…
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pnpmInvocation } from './prerequisites.mjs';
import { enabledModuleNames } from '../tools/valdi-rolldown/modules.mjs';
import { MAX_BYTES, MAX_ENTRIES, MAX_METADATA, checkDeltaDescriptor, checkVersion, createDelta, ensureHdiffz, parseArchive, validateDelta } from './ota-delta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platforms = ['android', 'ios'];
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Arguments for the parent-owned compiler: only the business module is OTA-owned.
 * The old compressed archive lets Hermes reuse its bytecode string table with -base-bytecode.
 */
export function moduleBuildArguments({ platform, built, baseArchive }) {
  if (!platforms.includes(platform)) throw new Error('Invalid build platform');
  const images = platform === 'android' ? ['--res', path.join(built, 'res')] : ['--ios-res', built];
  return ['exec', 'tsx', 'build.ts', '--release', '--module', 'app_pages', '--out', built, ...images,
    ...(baseArchive ? ['--hermes-base', baseArchive] : [])];
}

function buildModules(platform, baseArchive) {
  const built = mkdtempSync(path.join(tmpdir(), 'valdi-ota-'));
  const invocation = pnpmInvocation(moduleBuildArguments({ platform, built, baseArchive }));
  try {
    execFileSync(invocation.command, invocation.args, {
      cwd: path.join(root, 'tools/valdi-rolldown'),
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return built;
  } catch (error) {
    rmSync(built, { recursive: true, force: true });
    throw error;
  }
}

const checkAppVersion = (appVersion) => {
  if (typeof appVersion !== 'string' || !versionPattern.test(appVersion)) {
    throw new Error(`Invalid version '${appVersion}': ${versionPattern}`);
  }
};
/**
 * The app's own Valdi modules, as tools/valdi-rolldown built them into `built` (app_pages, with the npm packages it
 * imports bundled in): <module>.valdimodule and its map. Valdi's own (valdi_core, ...) belong to the binary.
 */
function moduleEntries(built) {
  const file = 'app_pages.valdimodule';
  if (!existsSync(path.join(built, file))) throw new Error(`tools/valdi-rolldown built no app_pages module into ${built}`);
  const map = 'app_pages.map.json';
  return [file, ...(existsSync(path.join(built, map)) ? [map] : [])].map(name => [
    `modules/${name}`, readFileSync(path.join(built, name)),
  ]);
}

/** Package entries (path in the package → bytes): modules/<module>.{valdimodule,map.json} and res/<platform layout>. */
function collectAndroid(baseArchive) {
  const built = buildModules('android', baseArchive);
  try {
    const entries = moduleEntries(built);
    // The modules' res/ images, as Android resources: drawable-<density>/<module>_<name>.webp.
    const res = path.join(built, 'res');
    for (const density of (existsSync(res) ? readdirSync(res) : []).filter((name) => name.startsWith('drawable'))) {
      for (const file of readdirSync(path.join(res, density)).filter(name => name.startsWith('app_pages_'))) {
        entries.push([`res/${density}/${file}`, readFileSync(path.join(res, density, file))]);
      }
    }
    return entries;
  } finally { rmSync(built, { recursive: true, force: true }); }
}

function collectIos(baseArchive) {
  const built = buildModules('ios', baseArchive);
  try {
    const entries = moduleEntries(built);
    // The modules' res/ images, as the app carries them: <module>.bundle/<name>@<scale>x.png.
    for (const bundle of readdirSync(built).filter((name) => name === 'app_pages.bundle')) {
      for (const file of readdirSync(path.join(built, bundle)).filter((name) => !name.startsWith('.') && name !== 'Info.plist')) {
        entries.push([`res/${bundle}/${file}`, readFileSync(path.join(built, bundle, file))]);
      }
    }
    return entries;
  } finally { rmSync(built, { recursive: true, force: true }); }
}

/** Complete version description; unchanged bytes can be reused by the clients. */
export function createManifest({ platform, appVersion, version, modules = ['app_pages'], entries, deltas = [] }) {
  if (!platforms.includes(platform)) throw new Error(`Invalid platform '${platform}'`);
  checkAppVersion(appVersion);
  checkAppVersion(version);
  if (version.toLowerCase() === 'latest.json') throw new Error('Update version latest.json is reserved for the index');
  if (!Array.isArray(modules) || modules.length !== 1 || modules[0] !== 'app_pages') {
    throw new Error('OTA module inventory must contain only app_pages');
  }
  if (!Array.isArray(entries)) throw new Error('Invalid OTA entries');
  if (!Array.isArray(deltas) || deltas.length > 8) throw new Error('OTA supports at most 8 deltas');
  const bases = new Set();
  for (const delta of deltas) {
    checkDeltaDescriptor(delta);
    if (bases.has(delta.baseVersion) || delta.baseVersion === version) throw new Error('Invalid or duplicate delta base version');
    bases.add(delta.baseVersion);
  }
  /** @type {Record<string, { sha256: string, size: number }>} */
  const files = {};
  let total = 0;
  for (const [name, bytes] of [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const module = /^modules\/([a-z][a-z0-9_]*)\.(valdimodule|map\.json)$/.exec(name);
    let owned = module ? modules.includes(module[1]) : false;
    if (platform === 'android' && /^res\/drawable(?:-[A-Za-z0-9-]+)?\/[A-Za-z0-9_@][A-Za-z0-9._@-]*$/.test(name)) {
      const file = name.split('/')[2];
      owned = modules.some(id => file.startsWith(`${id}_`));
    } else if (platform === 'ios') {
      const resource = /^res\/([a-z][a-z0-9_]*)\.bundle\/[A-Za-z0-9_@][A-Za-z0-9._@-]*$/.exec(name);
      if (resource) owned = modules.includes(resource[1]);
    }
    if (!owned || Object.hasOwn(files, name) || !Buffer.isBuffer(bytes)) throw new Error(`Invalid or duplicate OTA file '${name}'`);
    if (module?.[2] === 'valdimodule' && bytes.length === 0) throw new Error(`Empty module '${name}'`);
    total += bytes.length;
    if (total > 64 * 1024 * 1024) throw new Error('OTA package exceeds 64 MiB');
    files[name] = { sha256: sha256(bytes), size: bytes.length };
  }
  if (Object.keys(files).length > 4096) throw new Error('OTA package exceeds 4096 files');
  for (const module of modules) {
    if (!Object.hasOwn(files, `modules/${module}.valdimodule`)) throw new Error(`Missing module '${module}'`);
  }
  return { schemaVersion: 1, platform, appVersion, version, files, ...(deltas.length ? { deltas } : {}) };
}

/** Sign and stage completely before replacing the index. Does not upload anything. */
export function publishPackage({ directory, platform, appVersion, version, modules = ['app_pages'], entries, privateKey,
  base, hdiffz, deltas = [] }) {
  const identity = { platform, appVersion, version, modules, entries };
  createManifest(identity);
  if (!Array.isArray(deltas)) throw new Error('Invalid deltas');
  const packages = [...deltas];
  const targetArchive = entries.find(([name]) => name === 'modules/app_pages.valdimodule')[1];
  if (base) {
    const delta = createDelta({ platform, appVersion, version, baseVersion: base.version, baseArchive: base.archive, targetArchive, hdiffz, root });
    if (delta) packages.push(delta);
  }
  const payloads = packages.flatMap(delta => validateDelta(delta, identity, targetArchive));
  const allEntries = [...entries, ...payloads];
  if (allEntries.length > MAX_ENTRIES || new Set(allEntries.map(([name]) => name)).size !== allEntries.length) {
    throw new Error('OTA package exceeds 4096 files or contains duplicate delta files');
  }
  if (allEntries.reduce((sum, [, bytes]) => sum + bytes.length, 0) > MAX_BYTES) throw new Error('OTA package exceeds 64 MiB');
  const manifest = Buffer.from(`${JSON.stringify(createManifest({ ...identity, deltas: packages.map(delta => delta.descriptor) }), null, 2)}\n`);
  if (manifest.length > 1024 * 1024) throw new Error('OTA manifest exceeds 1 MiB');
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('OTA signing requires an ECDSA P-256 private key');
  }
  const signature = sign('sha256', manifest, { key, dsaEncoding: 'der' }).toString('base64');
  const out = path.join(directory, platform, appVersion);
  const destination = path.join(out, version);
  if (existsSync(destination)) throw new Error(`${destination} exists; packages are immutable, use a new version.`);
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(path.join(out, '.publish-'));
  try {
    const staged = path.join(work, 'package');
    mkdirSync(staged);
    for (const [name, bytes] of allEntries) {
      const file = path.join(staged, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    writeFileSync(path.join(staged, 'manifest.json'), manifest);
    writeFileSync(path.join(staged, 'manifest.sig'), signature);
    renameSync(staged, destination);
    const latest = path.join(work, 'latest.json');
    writeFileSync(latest, `${JSON.stringify({ version })}\n`);
    renameSync(latest, path.join(out, 'latest.json'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return destination;
}

/** Load an immutable old package or an explicit archive; validates identity and exact source bytes. */
export function readBase({ base, baseVersion, platform, appVersion }) {
  if (!base) {
    if (baseVersion !== undefined) throw new Error('--base-version requires --base');
    return undefined;
  }
  const source = path.resolve(base);
  let version = baseVersion, archivePath = source, descriptor;
  const sourceStat = statSync(source, { throwIfNoEntry: false });
  if (!sourceStat) throw new Error(`Base package/archive does not exist: ${source}`);
  if (sourceStat.isDirectory()) {
    const manifestPath = path.join(source, 'manifest.json');
    if (statSync(manifestPath).size > MAX_METADATA) throw new Error('Base manifest exceeds 1 MiB');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.platform !== platform || manifest.appVersion !== appVersion) {
      throw new Error('Base package platform/appVersion must match the target');
    }
    version = manifest.version;
    if (baseVersion !== undefined && version !== baseVersion) throw new Error('--base-version disagrees with base package');
    descriptor = manifest.files?.['modules/app_pages.valdimodule'];
    archivePath = path.join(source, 'modules/app_pages.valdimodule');
    if (!realpathSync(archivePath).startsWith(realpathSync(source) + path.sep)) throw new Error('Base archive escapes package directory');
    if (!descriptor || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > MAX_BYTES ||
        !/^[a-f0-9]{64}$/.test(descriptor.sha256)) throw new Error('Invalid base archive descriptor');
  } else if (!source.endsWith('.valdimodule') || !version) throw new Error('An old .valdimodule file requires --base-version <version>');
  checkVersion(version);
  const size = statSync(archivePath).size;
  if (size <= 0 || size > MAX_BYTES || (descriptor && size !== descriptor.size)) throw new Error('Base archive length mismatch or exceeds 64 MiB');
  const archive = readFileSync(archivePath);
  if (descriptor && sha256(archive) !== descriptor.sha256) throw new Error('Base archive hash mismatch');
  parseArchive(archive);
  return { version, archive, archivePath };
}

async function pack(platform, appVersion, version, options) {
  checkAppVersion(appVersion);
  checkVersion(version);
  const selected = new Map();
  for (let i = 0; i < options.length; i += 2) {
    const flag = options[i], value = options[i + 1];
    if (!['--base', '--base-version'].includes(flag) || selected.has(flag) || !value || value.startsWith('--')) {
      throw new Error('Invalid pack option: use --base <package dir|old.valdimodule> [--base-version <version>]');
    }
    selected.set(flag, value);
  }
  if (!enabledModuleNames(root).includes('app_pages')) throw new Error('Enable app_pages in package.json valdi.modules for OTA');
  const base = readBase({ base: selected.get('--base'), baseVersion: selected.get('--base-version'), platform, appVersion });
  const directory = path.join(root, 'ota/dist');
  if (existsSync(path.join(directory, platform, appVersion, version))) throw new Error('Package exists; use a new version.');
  // Load the publisher's key only for this explicit command, before creating build outputs.
  const privateKey = readFileSync(path.join(root, 'ota/private.pem'));
  const hdiffz = base ? await ensureHdiffz({ root }) : undefined;
  const entries = platform === 'android' ? collectAndroid(base?.archivePath) : collectIos(base?.archivePath);
  const destination = publishPackage({ directory, platform, appVersion, version, entries, privateKey, base, hdiffz });
  console.log(`${path.relative(root, destination)} (${entries.length} full files)`);
}

function appInfo(platform, info, appVersion, url) {
  checkAppVersion(appVersion);
  if (info.platform !== platform) throw new Error(`Export info is for ${info.platform}, not ${platform}.`);
  if (url) {
    if (info.config !== 'release') throw new Error('OTA requires a Release runtime export.');
    const base = new URL(url);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('OTA URL must be an HTTP(S) base URL without credentials, query or fragment.');
    }
  }
  if (!enabledModuleNames(root).includes('app_pages')) throw new Error('Enable app_pages in package.json valdi.modules for OTA');
  const config = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const embedded = config.valdi?.ota?.bundleVersion;
  const bundleVersion = embedded === undefined ? 'pages-001' : embedded;
  checkVersion(bundleVersion);
  return JSON.stringify({ appVersion, url, publicKey: readFileSync(path.join(root, 'ota/public.pem'), 'utf8'),
    bundleVersion, modules: ['app_pages'] });
}

function keygen() {
  const privatePath = path.join(root, 'ota/private.pem');
  if (existsSync(privatePath)) throw new Error('ota/private.pem exists; remove it first to rotate the key.');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(path.join(root, 'ota/public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('ota/private.pem, ota/public.pem');
}

async function main() {
  const [command, platform, ...rest] = process.argv.slice(2);
  if (command === 'keygen') keygen();
  else if (!platforms.includes(platform)) throw new Error(`Usage: see the top of ${path.relative(root, fileURLToPath(import.meta.url))}`);
  else if (command === 'pack' && rest.length >= 2) await pack(platform, rest[0], rest[1], rest.slice(2));
  else if (command === 'app-info' && rest.length === 3) {
    console.log(appInfo(platform, JSON.parse(readFileSync(rest[0], 'utf8')), rest[1], rest[2]));
  } else throw new Error(`Usage: see the top of ${path.relative(root, fileURLToPath(import.meta.url))}`);
}

if (process.argv[1] && existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
