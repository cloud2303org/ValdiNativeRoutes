// Over-the-air updates of the Valdi modules: the signing key, the binaries' release records and signed packages.
//   node scripts/ota.mjs keygen                                  ota/private.pem (keep out of git) and ota/public.pem
//   node scripts/ota.mjs valdi-hash <android|ios> <debug|release>  JSON the export scripts write next to their output
//   node scripts/ota.mjs check-export <android|ios> <valdi_ota.json>  fails when valdi/native changed since that export
//   node scripts/ota.mjs app-info <android|ios> <valdi_ota.json> <app version> <update url> [--record]
//                                                                the app's valdi_ota.json (Gradle, ios/project.yml)
//   node scripts/ota.mjs pack <android|ios> <app version> <version>  ota/dist/<platform>/<app version>/<version>/
//
// A package targets an app version (versionName, CFBundleShortVersionString): the binaries of that version take it.
// The binary's native side must be what the package was built against: the Valdi toolchain, the bindings generated
// from the modules' @Export declarations, the native sources (ota/fingerprint.json). Their hashes make the binary's
// fingerprint; a release build with updates on records it in ota/releases/<platform>/<app version>.json (--record,
// checked in), and fails when that version was recorded with another: a changed native side needs a new app version. `pack`
// fails, naming what changed, when the tree's isn't the recorded one; the client checks it too (the manifest's).
//
// ota/dist is what the update server serves, as static files:
//   <platform>/<app version>/latest.json                {"version": "<version>"}
//   <platform>/<app version>/<version>/manifest.json    platform, appVersion, fingerprint, version, files: {path: sha256}
//   <platform>/<app version>/<version>/manifest.sig     base64 ECDSA P-256 / SHA-256 signature of manifest.json
//   <platform>/<app version>/<version>/<path>           modules/<module>.{valdimodule,map.json}, res/…
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputs = JSON.parse(readFileSync(path.join(root, 'ota/fingerprint.json'), 'utf8'));
const platforms = ['android', 'ios'];
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Files under a repository-relative path, skipping names that start with a dot; missing paths count as empty. */
function walk(rel, out = []) {
  const stat = statSync(path.join(root, rel), { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    for (const name of readdirSync(path.join(root, rel))) if (!name.startsWith('.')) walk(`${rel}/${name}`, out);
  } else if (stat) {
    out.push(rel);
  }
  return out;
}

/** sha256 over "name\0sha256(content)\n" lines sorted by name. */
function digest(entries) {
  const hash = createHash('sha256');
  for (const [name, bytes] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash.update(`${name}\0${sha256(bytes)}\n`);
  }
  return hash.digest('hex');
}

const fileEntries = (paths) => paths.flatMap((rel) => walk(rel)).map((rel) => [rel, readFileSync(path.join(root, rel))]);

/** Generated code without comments and indentation: doc comments in TS don't change the native contract. */
const stripComments = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(\/\*|\*|\/\/)/.test(line))
    .join('\n');

/** Where tools/valdi-rolldown/codegen.ts writes each platform's native bindings, and what they are. */
const bindingSources = {
  android: { dir: 'android/app/generated/valdi', extensions: ['.kt'] },
  ios: { dir: 'ios/Generated/valdi', extensions: ['.h', '.m'] },
};

/** The Valdi side of the fingerprint, as exported: the toolchain (Valdi fork, Hermes) and valdi/native. */
const valdiHash = () => digest([
  ...fileEntries(inputs.valdi),
  ['compiler-backend', 'node'],
]);

/**
 * The native bindings generated from the modules' @Export declarations, as they are when the binary is built:
 * codegen.ts writes them outside an export, so a changed native interface needs no new one. They sit outside the
 * native half's paths and count without their comments: a doc comment in TypeScript doesn't change the native contract.
 */
function bindingsHash(platform) {
  const { dir, extensions } = bindingSources[platform];
  const bindings = walk(dir)
    .filter((rel) => extensions.some((ext) => rel.endsWith(ext)))
    .map((rel) => [path.relative(dir, rel), stripComments(readFileSync(path.join(root, rel), 'utf8'))]);
  const moduleBindings = JSON.parse(execFileSync(process.execPath, [
    path.join(root, 'tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs'),
    path.join(root, 'tools/valdi-rolldown/module-bindings.ts'), platform,
  ], { cwd: root, encoding: 'utf8' }));
  bindings.push(...moduleBindings.map(([name, content]) => [name, stripComments(content)]));
  if (bindings.length === 0) throw new Error(`No generated bindings in ${dir}: run tools/valdi-rolldown/codegen.ts`);
  return digest(bindings);
}

/**
 * The C++ the export links into the Valdi runtime (valdi/native: @ExportModule implementations and their generated
 * bindings). It counts in valdiHash too (ota/fingerprint.json); this one only tells whether an export is current.
 */
const nativeHash = () => digest(fileEntries(['valdi/native']));

/** The apps' builds run this: a runtime exported before valdi/native last changed lacks that C++. */
function checkExport(platform, info) {
  if (info.native === nativeHash()) return;
  throw new Error(
    `valdi/native (C++ linked into the Valdi runtime) changed since the runtime was exported: run scripts/export-${platform}.sh${info.config === 'release' ? ' release' : ''}`,
  );
}

/**
 * The modules tools/valdi-rolldown builds, as the release app's build does (Gradle's valdiModules, the Xcode "Valdi
 * modules" phase): Hermes bytecode with their maps, and the images in the platform's layout. Returns the output
 * directory, to be removed by the caller.
 */
function buildModules(platform) {
  const built = mkdtempSync(path.join(tmpdir(), 'valdi-ota-'));
  const images = platform === 'android' ? ['--res', path.join(built, 'res')] : ['--ios-res', built];
  execFileSync('pnpm', ['exec', 'tsx', 'build.ts', '--release', '--out', built, ...images], {
    cwd: path.join(root, 'tools/valdi-rolldown'),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return built;
}

/** What the parts of a fingerprint are, for the errors that name the changed ones. */
const partNames = {
  config: 'the Valdi runtime build (debug/release export)',
  valdi: 'the Valdi fork/toolchain or valdi/native (ota/fingerprint.json "valdi")',
  bindings: 'the native bindings (a native interface of a module)',
  native: 'the native sources (ota/fingerprint.json "<platform>")',
};

/**
 * The hashes a binary's native side is made of, and their fingerprint. `valdi` is the export's (`info`, what the
 * binary links) when given, else the tree's: a package is built from the tree.
 */
function fingerprintParts(platform, info) {
  if (info && info.platform !== platform) throw new Error(`Export info is for ${info.platform}, not ${platform}.`);
  const parts = {
    config: info ? info.config : 'release',
    valdi: info ? info.valdi : valdiHash(),
    bindings: bindingsHash(platform),
    native: digest(fileEntries(inputs[platform])),
  };
  const fingerprint = sha256(`${platform}\n${parts.config}\n${parts.valdi}\n${parts.bindings}\n${parts.native}\n`).slice(0, 32);
  return { fingerprint, ...parts };
}

const checkAppVersion = (appVersion) => {
  if (!versionPattern.test(appVersion)) throw new Error(`Invalid app version '${appVersion}': ${versionPattern}`);
};
const recordPath = (platform, appVersion) => path.join(root, 'ota/releases', platform, `${appVersion}.json`);
const readRecord = (platform, appVersion) => {
  const file = recordPath(platform, appVersion);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
};
/** The parts of `actual` that differ from `recorded`, described. */
const changedParts = (recorded, actual) =>
  Object.keys(partNames).filter((part) => recorded[part] !== actual[part]).map((part) => `  ${partNames[part]}`);

/**
 * The app's own Valdi modules, as tools/valdi-rolldown built them into `built` (app_pages, with the npm packages it
 * imports bundled in): <module>.valdimodule and its map. Valdi's own (valdi_core, ...) belong to the binary.
 */
function moduleEntries(built) {
  const modules = readdirSync(built).filter((name) => name.endsWith('.valdimodule'));
  if (modules.length === 0) throw new Error(`tools/valdi-rolldown built no modules into ${built}`);
  return modules.flatMap((file) => {
    const map = file.replace(/\.valdimodule$/, '.map.json');
    return [file, ...(existsSync(path.join(built, map)) ? [map] : [])].map((name) => [
      `modules/${name}`,
      readFileSync(path.join(built, name)),
    ]);
  });
}

/** Package entries (path in the package → bytes): modules/<module>.{valdimodule,map.json} and res/<platform layout>. */
function collectAndroid() {
  const built = buildModules('android');
  const entries = moduleEntries(built);
  // The modules' res/ images, as Android resources: drawable-<density>/<module>_<name>.webp.
  const res = path.join(built, 'res');
  for (const density of readdirSync(res).filter((name) => name.startsWith('drawable'))) {
    for (const file of readdirSync(path.join(res, density))) {
      entries.push([`res/${density}/${file}`, readFileSync(path.join(res, density, file))]);
    }
  }
  rmSync(built, { recursive: true, force: true });
  return entries;
}

function collectIos() {
  const built = buildModules('ios');
  const entries = moduleEntries(built);
  // The modules' res/ images, as the app carries them: <module>.bundle/<name>@<scale>x.png.
  for (const bundle of readdirSync(built).filter((name) => name.endsWith('.bundle'))) {
    for (const file of readdirSync(path.join(built, bundle)).filter((name) => !name.startsWith('.') && name !== 'Info.plist')) {
      entries.push([`res/${bundle}/${file}`, readFileSync(path.join(built, bundle, file))]);
    }
  }
  rmSync(built, { recursive: true, force: true });
  return entries;
}

/**
 * A package of the tree's modules for the `appVersion` binaries, whose release recorded their native side: the tree's
 * must be the same, or the modules may use what those binaries don't have.
 */
function pack(platform, appVersion, version) {
  checkAppVersion(appVersion);
  if (!versionPattern.test(version)) throw new Error(`Invalid version '${version}': ${versionPattern}`);
  const recorded = readRecord(platform, appVersion);
  if (!recorded) {
    throw new Error(
      `No release of ${platform} ${appVersion} recorded (${path.relative(root, recordPath(platform, appVersion))}): its release build records it.`,
    );
  }
  const parts = fingerprintParts(platform);
  if (parts.fingerprint !== recorded.fingerprint) {
    throw new Error(
      `The tree's native side is not ${platform} ${appVersion}'s; changed since its release:\n${changedParts(recorded, parts).join('\n')}\n` +
        'Its binaries can\'t take these modules: release a new app version, or pack from that release\'s code.',
    );
  }
  const entries = platform === 'android' ? collectAndroid() : collectIos();

  const out = path.join(root, 'ota/dist', platform, appVersion);
  const dir = path.join(out, version);
  // Clients never download a version they know again: a changed package needs a new version.
  if (existsSync(dir)) throw new Error(`${path.relative(root, dir)} exists; packages are immutable, use a new version.`);
  const files = {};
  for (const [name, bytes] of entries) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), bytes);
    files[name] = sha256(bytes);
  }
  const manifest = Buffer.from(
    `${JSON.stringify({ platform, appVersion, fingerprint: parts.fingerprint, version, files }, null, 2)}\n`,
  );
  const key = createPrivateKey(readFileSync(path.join(root, 'ota/private.pem')));
  writeFileSync(path.join(dir, 'manifest.json'), manifest);
  writeFileSync(path.join(dir, 'manifest.sig'), sign('sha256', manifest, { key, dsaEncoding: 'der' }).toString('base64'));
  // Last, so a client never sees a version whose files aren't all there.
  writeFileSync(path.join(out, 'latest.json'), `${JSON.stringify({ version })}\n`);
  console.log(`${path.relative(root, dir)} (${Object.keys(files).length} files)`);
}

/**
 * The app's valdi_ota.json (ValdiOta.kt, ValdiOta.swift): its version and fingerprint, the update server, the key
 * packages are signed with. `record` (release builds): records the fingerprint as the version's, or fails when the
 * version was recorded with another.
 */
function appInfo(platform, info, appVersion, url, record) {
  checkAppVersion(appVersion);
  const parts = fingerprintParts(platform, info);
  if (record) {
    if (info.config !== 'release') {
      throw new Error(`Packages carry release modules (Hermes bytecode); export the runtime with: scripts/export-${platform}.sh release`);
    }
    const recorded = readRecord(platform, appVersion);
    const file = path.relative(root, recordPath(platform, appVersion));
    if (!recorded) {
      mkdirSync(path.dirname(recordPath(platform, appVersion)), { recursive: true });
      writeFileSync(recordPath(platform, appVersion), `${JSON.stringify(parts, null, 2)}\n`);
      console.error(`Recorded ${platform} ${appVersion}'s native side in ${file}; check it in with the release.`);
    } else if (recorded.fingerprint !== parts.fingerprint) {
      throw new Error(
        `${platform} ${appVersion} was released with another native side (${file}); changed since:\n` +
          `${changedParts(recorded, parts).join('\n')}\n` +
          `Its packages would reach this binary too: give it a new app version. If ${appVersion} was never released, remove ${file}.`,
      );
    }
  }
  const publicKey = readFileSync(path.join(root, 'ota/public.pem'), 'utf8');
  return JSON.stringify({ appVersion, fingerprint: parts.fingerprint, url, publicKey });
}

function keygen() {
  const privatePath = path.join(root, 'ota/private.pem');
  if (existsSync(privatePath)) throw new Error('ota/private.pem exists; remove it first to rotate the key.');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(path.join(root, 'ota/public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('ota/private.pem, ota/public.pem');
}

const [command, platform, ...rest] = process.argv.slice(2);
if (command === 'keygen') keygen();
else if (!platforms.includes(platform)) throw new Error(`Usage: see the top of ${path.relative(root, fileURLToPath(import.meta.url))}`);
else if (command === 'valdi-hash' && rest.length === 1) {
  console.log(JSON.stringify({ platform, config: rest[0], valdi: valdiHash(), native: nativeHash() }));
} else if (command === 'pack' && rest.length === 2) pack(platform, rest[0], rest[1]);
else if (command === 'check-export' && rest.length === 1) {
  checkExport(platform, JSON.parse(readFileSync(rest[0], 'utf8')));
} else if (command === 'app-info' && (rest.length === 3 || (rest.length === 4 && rest[3] === '--record'))) {
  console.log(appInfo(platform, JSON.parse(readFileSync(rest[0], 'utf8')), rest[1], rest[2], rest.length === 4));
}
else throw new Error(`Usage: see the top of ${path.relative(root, fileURLToPath(import.meta.url))}`);
