import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readAppConfig, syncAppConfig } from '../app-config.mjs';
import { readAppIcon, syncAppIcons } from '../app-icons.mjs';
import { sampleApp } from './fixtures/app-config.mjs';

const sharp = createRequire(import.meta.url)('../../tools/valdi-rolldown/node_modules/sharp');
const icon = 'assets/app-icon.png';
const catalog = 'ios/Generated/AppAssets.xcassets';
const manifest = 'ios/Generated/AppIcons.json';
const appIcon = `${catalog}/AppIcon.appiconset/AppIcon.png`;
const mdpi = 'android/app/build/generated/valdi-app/res/mipmap-mdpi/ic_launcher.png';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-app-icons-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ valdi: { app: { ...sampleApp(), icon } } }));
  mkdirSync(path.join(root, 'assets'));
  return root;
}

async function source(root, background = '#123abc', width = 1024, height = width, channels = 3) {
  const bytes = await sharp({ create: { width, height, channels, background } }).png().toBuffer();
  writeFileSync(path.join(root, icon), bytes);
  return bytes;
}

function snapshot(root) {
  const result = {};
  function visit(relative) {
    const target = path.join(root, relative);
    if (!existsSync(target)) return;
    if (statSync(target).isDirectory()) {
      for (const child of readdirSync(target)) visit(path.posix.join(relative, child));
    } else {
      result[relative] = { hash: sha256(readFileSync(target)), mtime: statSync(target).mtimeMs };
    }
  }
  visit('ios');
  visit('android');
  return result;
}

test('a single authored PNG generates valid iOS and Android PNGs at the required sizes', async t => {
  const root = fixture(t);
  const original = await source(root);
  assert.equal(readAppIcon(root, icon).width, 1024);
  assert.deepEqual(syncAppConfig(root), { ...sampleApp(), icon });
  const iconDescription = JSON.parse(readFileSync(path.join(root, catalog, 'AppIcon.appiconset/Contents.json')));
  assert.deepEqual(iconDescription.images, [
    { filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
  ]);
  const metadata = await sharp(path.join(root, appIcon)).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, false, 'the iOS app icon must not have an alpha channel');
  const splash = JSON.parse(readFileSync(path.join(root, catalog, 'SplashLogo.imageset/Contents.json')));
  assert.equal(splash.images.length, 3);
  for (const [index, image] of splash.images.entries()) {
    assert.equal(image.scale, `${index + 1}x`);
    assert.equal(image.idiom, 'universal');
    const png = await sharp(path.join(root, catalog, 'SplashLogo.imageset', image.filename)).metadata();
    assert.equal(png.format, 'png');
    assert.equal(png.width, 288 * (index + 1));
    assert.equal(png.height, png.width);
  }
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    const file = `android/app/build/generated/valdi-app/res/mipmap-${density}/ic_launcher.png`;
    const png = await sharp(path.join(root, file)).metadata();
    assert.equal(png.format, 'png');
    assert.equal(png.width, size);
    assert.equal(png.height, size);
    const { data } = await sharp(path.join(root, file)).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([...data.subarray(0, 3)], [0x12, 0x3a, 0xbc]);
  }
  const cached = JSON.parse(readFileSync(path.join(root, manifest)));
  assert.equal(cached.sourceHash, sha256(original));
  assert.equal(Object.keys(cached.outputs).length, 12);
  for (const [file, hash] of Object.entries(cached.outputs)) {
    assert.equal(hash, sha256(readFileSync(path.join(root, file))), file);
  }
  assert.deepEqual(readFileSync(path.join(root, icon)), original, 'the authored image stays untouched');
});

test('an unchanged sync preserves every generated file mtime', async t => {
  const root = fixture(t);
  await source(root);
  syncAppConfig(root);
  const stamp = new Date('2001-01-01T00:00:00Z');
  for (const file of Object.keys(snapshot(root))) utimesSync(path.join(root, file), stamp, stamp);
  const before = snapshot(root);
  assert.equal(syncAppConfig(root).icon, icon);
  assert.deepEqual(snapshot(root), before);
});

test('source replacement is detected even when source mtime and dimensions stay unchanged', async t => {
  const root = fixture(t);
  await source(root);
  syncAppIcons(root, icon);
  const before = snapshot(root);
  const sourceTime = statSync(path.join(root, icon)).mtime;
  await source(root, '#e73851');
  utimesSync(path.join(root, icon), sourceTime, sourceTime);
  syncAppIcons(root, icon);
  const after = snapshot(root);
  for (const file of Object.keys(before).filter(file => file.endsWith('.png'))) {
    assert.notEqual(after[file].hash, before[file].hash, file);
  }
  const { data } = await sharp(path.join(root, mdpi)).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [0xe7, 0x38, 0x51]);
});

test('the cache repairs missing/corrupt PNGs and catalog metadata without touching unrelated files', async t => {
  const root = fixture(t);
  await source(root);
  syncAppIcons(root, icon);
  const baseline = snapshot(root);
  const userFile = path.join(root, catalog, 'UserAssets.imageset/keep.txt');
  mkdirSync(path.dirname(userFile));
  writeFileSync(userFile, 'user owned');
  rmSync(path.join(root, appIcon));
  writeFileSync(path.join(root, mdpi), 'corrupt PNG');
  writeFileSync(path.join(root, catalog, 'SplashLogo.imageset/Contents.json'), '{}');
  syncAppIcons(root, icon);
  for (const [file, expected] of Object.entries(baseline)) {
    assert.equal(sha256(readFileSync(path.join(root, file))), expected.hash, file);
  }
  assert.equal(readFileSync(userFile, 'utf8'), 'user owned');
  writeFileSync(path.join(root, manifest), '{broken');
  syncAppIcons(root, icon);
  assert.equal(JSON.parse(readFileSync(path.join(root, manifest))).source, icon);
});

test('non-1024 square input preserves its aspect ratio and emits a 1024 iOS icon', async t => {
  const root = fixture(t);
  await source(root, '#336699', 512);
  syncAppIcons(root, icon);
  assert.equal((await sharp(path.join(root, appIcon)).metadata()).width, 1024);
  assert.equal((await sharp(path.join(root, catalog, 'SplashLogo.imageset/SplashLogo@3x.png')).metadata()).height, 864);
});

test('portable relative PNG paths are required and invalid paths create no output', async t => {
  const root = fixture(t);
  await source(root);
  const paths = [
    '', '/assets/app-icon.png', '../app-icon.png', './assets/app-icon.png', 'assets/../app-icon.png',
    'assets//app-icon.png', 'assets\\app-icon.png', 'C:/app-icon.png', 'assets/icon.jpg',
    'assets/icon.png\n', 'assets /app-icon.png', 'assets/icon?.png', 'assets/CON.png',
    'assets/icon:bad.png', null, {}, false,
  ];
  for (const value of paths) {
    assert.throws(() => syncAppIcons(root, value), /valdi\.app: invalid icon/, JSON.stringify(value));
    assert.equal(existsSync(path.join(root, 'ios')), false);
    assert.equal(existsSync(path.join(root, 'android')), false);
  }
  assert.throws(() => readAppIcon(root, 'assets/missing.png'), /cannot read/);
  mkdirSync(path.join(root, 'assets/directory.png'));
  assert.throws(() => readAppIcon(root, 'assets/directory.png'), /must be a PNG file/);
});

test('invalid PNG headers, zero sizes, nonsquare images and broken image data fail before any writes', async t => {
  const root = fixture(t);
  const good = await source(root);
  const zero = Buffer.from(good);
  zero.writeUInt32BE(0, 16);
  const wrongHeader = Buffer.from(good);
  wrongHeader.write('IDAT', 12);
  const wrongLength = Buffer.from(good);
  wrongLength.writeUInt32BE(12, 8);
  const bad = [
    Buffer.from('not PNG'),
    good.subarray(0, 24),
    wrongHeader,
    wrongLength,
    zero,
    await source(root, '#123456', 64, 32),
    good.subarray(0, 33), // Valid header, but no compressed pixels or IEND.
  ];
  for (const bytes of bad) {
    writeFileSync(path.join(root, icon), bytes);
    assert.throws(() => syncAppConfig(root), /valdi\.app: invalid icon/);
    assert.equal(existsSync(path.join(root, 'ios')), false);
    assert.equal(existsSync(path.join(root, 'android')), false);
  }
});

test('bad image data also leaves already-generated icons and config outputs untouched', async t => {
  const root = fixture(t);
  const good = await source(root);
  syncAppConfig(root);
  const before = snapshot(root);
  writeFileSync(path.join(root, icon), good.subarray(0, 33));
  assert.doesNotThrow(() => readAppConfig(root), 'read validates the header without loading the image codec');
  assert.throws(() => syncAppConfig(root), /PNG generation failed/);
  assert.deepEqual(snapshot(root), before);
});

test('source symlinks cannot escape the repository and output symlinks are never followed', async t => {
  const root = fixture(t);
  const other = fixture(t);
  await source(other);
  symlinkSync(path.join(other, icon), path.join(root, icon));
  assert.throws(() => syncAppConfig(root), /inside the repository/);
  assert.deepEqual(snapshot(root), {});
  rmSync(path.join(root, icon));
  await source(root);
  mkdirSync(path.join(root, 'ios'));
  symlinkSync(path.join(other, 'assets'), path.join(root, 'ios/Generated'));
  const original = readFileSync(path.join(other, icon));
  assert.throws(() => syncAppConfig(root), /generated output.*regular directory/);
  assert.deepEqual(readFileSync(path.join(other, icon)), original);
  assert.equal(existsSync(path.join(other, 'assets/AppAssets.xcassets')), false);
  assert.equal(existsSync(path.join(root, 'android')), false);
});

test('an output directory conflict fails before writing any other generated files', async t => {
  const root = fixture(t);
  await source(root);
  mkdirSync(path.join(root, mdpi), { recursive: true });
  writeFileSync(path.join(root, mdpi, 'keep.txt'), 'keep');
  assert.throws(() => syncAppConfig(root), /generated output.*regular file/);
  assert.equal(existsSync(path.join(root, 'ios')), false);
  assert.equal(readFileSync(path.join(root, mdpi, 'keep.txt'), 'utf8'), 'keep');
});

test('no icon skips generation without reading files or creating outputs', t => {
  const root = fixture(t);
  assert.equal(syncAppIcons(root), undefined);
  assert.deepEqual(snapshot(root), {});
});
