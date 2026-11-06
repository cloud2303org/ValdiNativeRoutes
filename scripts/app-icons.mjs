import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const repository = path.resolve(import.meta.dirname, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const generatorHash = digest(readFileSync(script));
const catalog = 'ios/Generated/AppAssets.xcassets';
const manifestPath = 'ios/Generated/AppIcons.json';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const info = { author: 'xcode', version: 1 };
const images = [
  { file: `${catalog}/AppIcon.appiconset/AppIcon.png`, size: 1024, opaque: true },
  ...[1, 2, 3].map(scale => ({
    file: `${catalog}/SplashLogo.imageset/SplashLogo@${scale}x.png`, size: 288 * scale,
  })),
  ...Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })
    .map(([density, size]) => ({
      file: `android/app/build/generated/valdi-app/res/mipmap-${density}/ic_launcher.png`, size,
    })),
];
const descriptions = {
  [`${catalog}/Contents.json`]: json({ info }),
  [`${catalog}/AppIcon.appiconset/Contents.json`]: json({
    images: [{ filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info,
  }),
  [`${catalog}/SplashLogo.imageset/Contents.json`]: json({
    images: [1, 2, 3].map(scale => ({
      filename: `SplashLogo@${scale}x.png`, idiom: 'universal', scale: `${scale}x`,
    })),
    info,
  }),
};

const invalid = reason => new Error(`package.json valdi.app: invalid icon: ${reason}`);

/** Header/path validation is synchronous and never loads sharp or creates output directories. */
export function readAppIcon(root, icon) {
  if (typeof icon !== 'string' || !icon || /[\\<>:"|?*\u0000-\u001f\u007f]/.test(icon) ||
      icon.split('/').some(part => !part || part === '.' || part === '..' ||
        /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
      !icon.endsWith('.png')) {
    throw invalid('expected a portable repository-relative .png path (for example assets/app-icon.png)');
  }
  let source;
  let bytes;
  try {
    const base = realpathSync(root);
    source = realpathSync(path.join(base, icon));
    const relative = path.relative(base, source);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw invalid('source must remain inside the repository, including symlinks');
    }
    if (!lstatSync(source).isFile()) throw invalid('source must be a PNG file');
    bytes = readFileSync(source);
  } catch (error) {
    if (error.message.startsWith('package.json valdi.app:')) throw error;
    throw invalid(`cannot read ${icon}: ${error.code || error.message}`);
  }
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(pngSignature) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw invalid('source must have a PNG signature and IHDR header');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || width !== height) {
    throw invalid('source must be a positive square PNG; 1024x1024 is recommended for iOS');
  }
  return { bytes, width, height, hash: digest(bytes) };
}

// Generated files must be ordinary files in ordinary directories. Never follow an output
// symlink into a source asset or user directory, or remove an existing directory.
function checkTarget(root, relative) {
  let target = path.resolve(root);
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    target = path.join(target, part);
    if (!existsSync(target)) {
      // existsSync follows symlinks, so also reject a dangling link.
      try {
        if (lstatSync(target).isSymbolicLink()) throw invalid(`generated output is a symlink: ${relative}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      continue;
    }
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw invalid(`generated output is not a regular ${index === parts.length - 1 ? 'file' : 'directory'}: ${relative}`);
    }
  }
}

/** Synchronous entry point for native build/config consumers; only the child loads async sharp. */
export function syncAppIcons(root = repository, icon) {
  if (icon === undefined) return;
  const source = readAppIcon(root, icon);
  const base = realpathSync(root);
  const files = [...images.map(image => image.file), ...Object.keys(descriptions)];
  for (const file of [...files, manifestPath]) checkTarget(base, file);
  const require = createRequire(import.meta.url);
  let sharpEntry;
  let sharpVersion;
  try {
    sharpEntry = require.resolve('../tools/valdi-rolldown/node_modules/sharp');
    sharpVersion = require('../tools/valdi-rolldown/node_modules/sharp/package.json').version;
  } catch {
    throw invalid('sharp is unavailable in tools/valdi-rolldown/node_modules; install the existing tooling dependencies');
  }
  const identity = { version: 1, generatorHash, sharpVersion, source: icon, sourceHash: source.hash };
  try {
    const cached = JSON.parse(readFileSync(path.join(base, manifestPath), 'utf8'));
    if (Object.entries(identity).every(([key, value]) => cached[key] === value) &&
        cached.outputs && Object.keys(cached.outputs).length === files.length &&
        files.every(file => typeof cached.outputs[file] === 'string' &&
          digest(readFileSync(path.join(base, file))) === cached.outputs[file])) {
      return;
    }
  } catch {
    // Missing, damaged or stale outputs are repaired from the authored source.
  }
  const child = spawnSync(process.execPath, [script, '--render', sharpEntry], {
    input: source.bytes,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (child.error || child.status !== 0) {
    throw invalid(`PNG generation failed: ${(child.error?.message || child.stderr || `child exit ${child.status}`).trim()}`);
  }
  const rendered = JSON.parse(child.stdout);
  const outputs = { ...descriptions };
  for (const { file } of images) outputs[file] = Buffer.from(rendered[file], 'base64');
  const manifest = json({
    ...identity,
    outputs: Object.fromEntries(Object.entries(outputs).map(([file, bytes]) => [file, digest(bytes)])),
  });
  // No writes occur until all images have decoded/rendered successfully.
  for (const [file, bytes] of [...Object.entries(outputs), [manifestPath, manifest]]) {
    const target = path.join(base, file);
    if (existsSync(target) && readFileSync(target).equals(bytes)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

async function render(sharpEntry) {
  const { default: sharp } = await import(pathToFileURL(sharpEntry).href);
  const source = readFileSync(0);
  // Raw decoding validates the whole source, including image data, before output generation.
  const { data, info: metadata } = await sharp(source, { failOn: 'warning' })
    .raw().toBuffer({ resolveWithObject: true });
  const outputs = {};
  for (const { file, size, opaque } of images) {
    let image = sharp(data, { raw: metadata }).resize(size, size, { fit: 'inside' });
    if (opaque) image = image.flatten({ background: '#ffffff' });
    outputs[file] = (await image.png().toBuffer()).toString('base64');
  }
  process.stdout.write(JSON.stringify(outputs));
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  if (process.argv[2] === '--render') {
    render(process.argv[3]).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  } else {
    try {
      if (process.argv.length !== 4) throw new Error('Usage: node scripts/app-icons.mjs <repository> <icon.png>');
      syncAppIcons(path.resolve(process.argv[2]), process.argv[3]);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
