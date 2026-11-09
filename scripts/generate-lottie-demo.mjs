#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resource generation only: no compiler, native build, download, or packager changes.
const root = new URL('../', import.meta.url);
const assetDir = new URL('valdi/modules/app_pages/assets/lottie/', root);
const output = new URL('valdi/modules/app_pages/src/features/lottie/demoData.ts', root);
const derivedOutput = new URL('gatin.skottie.json', assetDir);
const receiptOutput = new URL('gatin.skottie.receipt.json', assetDir);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedSha = '48724c6f89fc278bfc182e8b70b7f77fb78e0c19819d6ec6aa79cbde432d1f79';
const expectedLicenseSha = '9d8d4d8b4bb99572ee8b51025a30b8493d949798cac465c6c15b1b29420bcb06';
const expectedCommit = 'bede03d25d232826e0c9dca1733d542d8a7754fb';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/generate-lottie-demo.mjs [--check]');
const check = args.includes('--check');
const bytes = readFileSync(new URL('gatin.json', assetDir));
const license = readFileSync(new URL('LICENSE.txt', assetDir));
const source = JSON.parse(readFileSync(new URL('source.json', assetDir), 'utf8'));
const animation = JSON.parse(bytes.toString('utf8'));

if (sha256(bytes) !== expectedSha || source.sha256 !== expectedSha || bytes.length !== 37620) {
  throw new Error('Lottie source bytes do not match the pinned gatin.json SHA-256 and size.');
}
if (sha256(license) !== expectedLicenseSha) throw new Error('Pinned Lottie MIT license bytes have changed.');
if (source.repository !== 'https://github.com/airbnb/lottie-web' || source.commit !== expectedCommit ||
    source.path !== 'demo/gatin/data.json' || source.license !== 'MIT') {
  throw new Error('Lottie source attribution does not match the pinned upstream sample.');
}
const duration = (animation.op - animation.ip) / animation.fr;
if (animation.w !== 800 || animation.h !== 800 || animation.fr !== 25 || duration !== 3.2 ||
    source.width !== animation.w || source.height !== animation.h ||
    source.frameRate !== animation.fr || source.durationSeconds !== duration ||
    (animation.assets ?? []).length !== 0 || animation.fonts !== undefined) {
  throw new Error('Expected the pinned 800×800, 25 fps, 3.2 second vector-only sample without assets or fonts.');
}

// Inspected inventory of actual fill/stroke colors in the SHA-pinned source.
// Each entry is [layer, shape, group item, shape type, palette name].
const palette = {
  cream: [255, 238, 230, 255],
  orange: [255, 159, 87, 255],
  shadow: [244, 141, 71, 255],
};
const expectedColors = [
  [0, 0, 1, 'st', 'cream'],
  [0, 1, 1, 'fl', 'cream'],
  [0, 2, 1, 'st', 'cream'],
  [0, 3, 1, 'fl', 'cream'],
  [0, 4, 1, 'fl', 'orange'],
  [1, 0, 1, 'fl', 'orange'],
  [1, 1, 1, 'fl', 'orange'],
  [1, 2, 1, 'fl', 'cream'],
  [1, 3, 1, 'fl', 'cream'],
  [2, 0, 1, 'fl', 'orange'],
  [3, 0, 1, 'fl', 'orange'],
  [3, 1, 1, 'fl', 'orange'],
  [5, 0, 1, 'fl', 'cream'],
  [6, 0, 1, 'fl', 'orange'],
  [6, 1, 1, 'fl', 'cream'],
  [6, 2, 1, 'fl', 'orange'],
  [6, 3, 1, 'fl', 'cream'],
  [7, 0, 1, 'fl', 'orange'],
  [7, 1, 1, 'fl', 'cream'],
  [7, 2, 1, 'fl', 'orange'],
  [7, 3, 1, 'fl', 'cream'],
  [8, 0, 1, 'fl', 'cream'],
  [9, 0, 2, 'st', 'cream'],
  [10, 0, 1, 'fl', 'orange'],
  [10, 1, 1, 'fl', 'orange'],
  [10, 2, 1, 'fl', 'cream'],
  [10, 3, 1, 'fl', 'cream'],
  [10, 4, 1, 'fl', 'cream'],
  [11, 0, 1, 'fl', 'orange'],
  [11, 1, 1, 'fl', 'orange'],
  [11, 2, 1, 'fl', 'cream'],
  [11, 3, 1, 'fl', 'cream'],
  [11, 4, 1, 'fl', 'cream'],
  [12, 0, 1, 'fl', 'shadow'],
  [13, 0, 1, 'fl', 'orange'],
].map(([layer, shape, item, type, name]) => ({
  path: `$.layers[${layer}].shapes[${shape}].it[${item}].c.k`,
  type,
  from: palette[name],
}));

function colorSamples(k, path) {
  const isColor = value => Array.isArray(value) && [3, 4].includes(value.length) &&
    value.every(channel => typeof channel === 'number' && Number.isFinite(channel));
  if (isColor(k)) return [{ path, channels: k }];
  // Only s/e RGB(A) samples of a fill/stroke c.k may be colors.
  // Never normalize arbitrary animated properties, easing handles, or vectors.
  assert(Array.isArray(k) && k.length > 0, `Invalid color property ${path}`);
  return k.flatMap((frame, index) => {
    assert(frame && typeof frame === 'object' && !Array.isArray(frame), `Invalid color keyframe ${path}[${index}]`);
    return ['s', 'e'].filter(key => frame[key] !== undefined).map(key => {
      assert(isColor(frame[key]), `Invalid color sample ${path}[${index}].${key}`);
      return { path: `${path}[${index}].${key}`, channels: frame[key] };
    });
  });
}

const samples = [];
function collectColors(node, path = '$') {
  if (!node || typeof node !== 'object') return;
  if (node.c && typeof node.c === 'object' && Object.hasOwn(node.c, 'k')) {
    assert(node.ty === 'fl' || node.ty === 'st', `Unexpected color owner ${path}`);
    for (const sample of colorSamples(node.c.k, `${path}.c.k`)) {
      samples.push({ ...sample, type: node.ty });
    }
  }
  for (const [key, child] of Object.entries(node)) {
    collectColors(child, Array.isArray(node) ? `${path}[${key}]` : `${path}.${key}`);
  }
}
collectColors(animation);
assert.deepEqual(
  samples.map(({ path, type, channels }) => ({ path, type, from: channels })),
  expectedColors,
  'Color paths, shape types and original RGBA values must match the inspected source exactly.',
);

const conversions = samples.map(({ path, type, channels }) => {
  const from = [...channels];
  assert(from.every(channel => channel >= 0 && channel <= 255), `Out-of-range legacy color ${path}`);
  const to = from.map(channel => channel / 255);
  channels.splice(0, channels.length, ...to);
  return { path, type, from, to };
});
const derivedBytes = Buffer.from(`${JSON.stringify(animation)}\n`, 'utf8');
// Restore only the touched arrays, then compare every JSON field with the
// original. This catches changes outside the exact color sample inventory.
const normalizedSamples = samples.map(({ channels }) => [...channels]);
samples.forEach(({ channels }, index) => channels.splice(0, channels.length, ...conversions[index].from));
assert.deepEqual(animation, JSON.parse(bytes.toString('utf8')), 'Non-color source data must remain identical.');
samples.forEach(({ channels }, index) => channels.splice(0, channels.length, ...normalizedSamples[index]));

const receipt = {
  source: { ...source, file: 'gatin.json', byteLength: bytes.length },
  derivative: {
    file: 'gatin.skottie.json',
    byteLength: derivedBytes.length,
    sha256: sha256(derivedBytes),
    serialization: 'JSON.stringify(parsed source with color conversions) + LF; UTF-8',
  },
  conversion: {
    name: 'legacy-fill-stroke-colors-to-unit-range-v1',
    operation: 'Divide each RGB(A) channel by 255 only in the verified fill/stroke c.k samples.',
    propertyCount: expectedColors.length,
    staticSampleCount: conversions.filter(({ path }) => path.endsWith('.c.k')).length,
    keyframeSampleCount: conversions.filter(({ path }) => !path.endsWith('.c.k')).length,
    nonColorDataUnchanged: true,
    samples: conversions,
  },
};
const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
const chunks = derivedBytes.toString('base64').match(/.{1,100}/g);
const generated = `// Generated by scripts/generate-lottie-demo.mjs; do not edit.
// The original JSON and MIT license remain untouched in assets/lottie/.
// Base64 contains gatin.skottie.json: only the verified legacy colors are normalized.
export const LOTTIE_DEMO_SOURCE = ${JSON.stringify(source, null, 2)} as const;

export const LOTTIE_DEMO_DERIVATIVE = ${JSON.stringify({
  ...receipt.derivative,
  conversion: receipt.conversion.name,
  colorSampleCount: conversions.length,
}, null, 2)} as const;

export const LOTTIE_DEMO_BYTE_LENGTH = ${derivedBytes.length};

// The complete upstream notice ships in the module and is shown by LottiePage.
export const LOTTIE_DEMO_LICENSE = ${JSON.stringify(license.toString('utf8'))};

export const LOTTIE_DEMO_BASE64 =
${chunks.map((chunk, index) => `  '${chunk}'${index === chunks.length - 1 ? ';' : ' +'}`).join('\n')}
`;

for (const [file, content] of [[derivedOutput, derivedBytes], [receiptOutput, receiptText], [output, generated]]) {
  if (check) {
    let current;
    try {
      current = readFileSync(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!current?.equals(Buffer.from(content))) {
      throw new Error(`${fileURLToPath(file)} is stale. Run node scripts/generate-lottie-demo.mjs.`);
    }
  } else {
    writeFileSync(file, content);
    console.log(`Generated ${fileURLToPath(file)}.`);
  }
}
console.log(`${check ? 'Verified' : 'Generated'} color derivative: ${derivedBytes.length} bytes, SHA-256 ${receipt.derivative.sha256}; ` +
  `${conversions.length} color samples, all other JSON data unchanged. Original SHA-256 ${expectedSha}; complete MIT license preserved.`);
