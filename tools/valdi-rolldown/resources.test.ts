import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { findImages, writeAndroidResources, writeIosResources, writeResTs } from './resources';

function fixture(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-images-'));
  // Windows keeps a short-lived lock on files sharp just wrote.
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const module = { name: 'icons', dir, generatedDirs: [] };
  mkdirSync(path.join(dir, 'res'));
  return module;
}

test('metadata picks the largest variant and preserves normalized asset names', async t => {
  const module = fixture(t);
  await sharp({ create: { width: 4, height: 4, channels: 4, background: '#ff000080' } }).png().toFile(path.join(module.dir, 'res/status-dot.png'));
  await sharp({ create: { width: 14, height: 10, channels: 4, background: '#ff000080' } }).png().toFile(path.join(module.dir, 'res/status-dot@3x.png'));
  const images = (await findImages(module))!;
  assert.equal(images.length, 1);
  assert.deepEqual({ ...images[0], file: path.basename(images[0].file) }, {
    name: 'status_dot', file: 'status-dot@3x.png', extension: 'png', scale: 3, width: 14, height: 10,
  });
  const gen = path.join(module.dir, 'generated');
  writeResTs(module, images, gen);
  assert.match(readFileSync(path.join(gen, 'res.ts'), 'utf8'), /readonly statusDot: Asset/);
});

test('platform resources keep density sizes, alpha, filenames and the original matching PNG', async t => {
  const module = fixture(t);
  const input = path.join(module.dir, 'res/status-dot@3x.png');
  await sharp({ create: { width: 14, height: 10, channels: 4, background: { r: 230, g: 20, b: 15, alpha: 0.5 } } }).png().toFile(input);
  const images = (await findImages(module))!;
  const android = path.join(module.dir, 'android');
  const ios = path.join(module.dir, 'ios');
  await writeAndroidResources(module, images, android);
  await writeIosResources(module, images, ios);
  // Includes odd-size legacy padding; changing encoder must not silently change the size protocol.
  const sizes = { mdpi: [5, 3], hdpi: [7, 5], xhdpi: [10, 8], xxhdpi: [16, 11], xxxhdpi: [22, 14] };
  for (const [density, [width, height]] of Object.entries(sizes)) {
    const file = path.join(android, `drawable-${density}/icons_status_dot.webp`);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.hasAlpha, true);
    const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[3] >= 126 && data[3] <= 129);
  }
  const converted = await sharp(path.join(ios, 'icons.bundle/status_dot@2x.png')).metadata();
  assert.equal(converted.width, 10);
  assert.equal(converted.height, 8);
  assert.equal(converted.hasAlpha, true);
  assert.deepEqual(readFileSync(path.join(ios, 'icons.bundle/status_dot@3x.png')), readFileSync(input));
  assert.match(readFileSync(path.join(android, 'raw/valdi_icons_keep.xml'), 'utf8'), /@drawable\/icons_status_dot/);
});

test('WebP inputs are decoded and malformed images fail instead of emitting an invalid catalog', async t => {
  const module = fixture(t);
  await sharp({ create: { width: 8, height: 6, channels: 4, background: '#123456' } }).webp().toFile(path.join(module.dir, 'res/mark.webp'));
  assert.equal((await findImages(module))![0].width, 8);
  writeFileSync(path.join(module.dir, 'res/broken.png'), 'not an image');
  await assert.rejects(findImages(module));
});
