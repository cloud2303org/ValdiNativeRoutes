// A Valdi module's res/ images and fonts, compiled as the Valdi compiler does (GenerateAssetCatalogProcessor,
// ImageResourcesProcessor):
//   res.ts            `import res from '<module>/res'`: Assets for images and (size) => string for fonts
//   res.assetcatalog  uncompressed archive of {width, height, type} uint32s (image=1, font=2)
//   Android           drawable-<density>/<module>_<name>.webp from the image's largest variant, and the keep rules
//                     release resource shrinking needs (the runtime finds the drawables by name)
//   iOS               <module>.bundle/<name>@2x.png and @3x.png, the converted ones quantized (pngquant); the
//                     runtime finds the bundle by the module's name, in the main bundle first
// An image is res/<name>.png or res/<name>@<scale>x.png (webp too); the largest scale is the source.
// Fonts are res/*.ttf, normalized to snake_case and stored in the module archive as res/<name>.ttf.
import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { packet, type ArchiveEntries } from './archive';
import type { ValdiModule } from './valdiTs';

const run = promisify(execFile);

export interface Image {
  /** As in the catalog: the file name without scale and extension, `-` as `_`. */
  name: string;
  file: string;
  extension: string;
  scale: number;
  /** Pixels. */
  width: number;
  height: number;
}

export interface Font {
  name: string;
  file: string;
}

const IMAGE = /^(.+?)(?:@(\d+(?:\.\d+)?)x)?\.(png|webp)$/;
const IOS_SCALES = [2, 3];
const ANDROID_DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

/** The module's images, by name, from res/ (undefined without res/); sizes are read with the toolbox. */
export function findImages(module: ValdiModule, toolbox: string): Image[] | undefined {
  const dir = path.join(module.dir, 'res');
  if (!existsSync(dir)) return undefined;
  const byName = new Map<string, Image>();
  for (const file of readdirSync(dir).sort()) {
    const match = IMAGE.exec(file);
    if (!match) continue;
    const name = match[1].replaceAll('-', '_');
    const scale = match[2] ? Number(match[2]) : 1;
    if ((byName.get(name)?.scale ?? 0) >= scale) continue;
    const absolute = path.join(dir, file);
    const { width, height } = JSON.parse(execFileSync(toolbox, ['image_info', '-i', absolute], { encoding: 'utf8' }));
    byName.set(name, { name, file: absolute, extension: match[3], scale, width, height });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findFonts(module: ValdiModule): Font[] | undefined {
  const dir = path.join(module.dir, 'res');
  if (!existsSync(dir)) return undefined;
  const fonts: Font[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.ttf')) continue;
    const stem = entry.name.slice(0, -4);
    if (!/^[A-Za-z0-9_-]+$/.test(stem)) {
      throw new Error(`Unsupported font filename ${entry.name}: use letters, numbers, underscores or hyphens`);
    }
    const name = fontResourceName(stem);
    if (!name) throw new Error(`Empty font resource name for ${entry.name}`);
    fonts.push({ name, file: path.join(dir, entry.name) });
  }
  return fonts;
}

/** Matches IdentifyFontAssetsProcessor's snakeCased for the supported ASCII filenames. */
function fontResourceName(stem: string): string {
  let converted = '';
  let uppercaseNext = false;
  for (const char of stem) {
    if (char === '-' || char === '_') {
      if (converted) uppercaseNext = true;
    } else {
      converted += uppercaseNext ? char.toUpperCase() : char;
      uppercaseNext = false;
    }
  }
  return converted.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** As valdi_core's toCamelCase, which names the catalog's properties at run time. */
function camelCase(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join('');
}

function validateResourceNames(images: Image[], fonts: Font[]): void {
  const names = new Map<string, string>();
  for (const resource of [...images, ...fonts]) {
    const key = camelCase(resource.name);
    const previous = names.get(key);
    if (previous !== undefined) {
      throw new Error(`Conflicting resource property ${key}: ${previous} and ${resource.file}`);
    }
    names.set(key, resource.file);
  }
}

/** Both platforms' font providers read these bytes from the module, not platform image resources. */
export function addFontEntries(entries: ArchiveEntries, fonts: Font[]): void {
  for (const font of fonts) entries.set(`res/${font.name}.ttf`, readFileSync(font.file));
}

/**
 * res.ts, written to `dir` only when it changes (so TypeScript and rolldown see a change only then); removed when the
 * module has no res/. Returns whether it changed.
 */
export function writeResTs(module: ValdiModule, images: Image[] | undefined, dir: string, fonts: Font[] = []): boolean {
  const file = path.join(dir, 'res.ts');
  if (!images && !fonts.length) {
    if (!existsSync(file)) return false;
    rmSync(file);
    return true;
  }
  validateResourceNames(images ?? [], fonts);
  const content = `import { loadCatalog } from 'valdi_core/src/AssetCatalog';
import { Asset } from 'valdi_core/src/Asset';

/**
* Assets Catalog Module generated from files in ${module.name}/res
*/
interface AssetCatalog {
${[
  ...(images ?? []).map(image => `  readonly ${camelCase(image.name)}: Asset;`),
  ...fonts.map(font => `  ${JSON.stringify(camelCase(font.name))}(size: number): string;`),
].join('\n\n')}
}

const catalog = loadCatalog('${module.name}/res') as AssetCatalog;
export default catalog;
`;
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, content);
  return true;
}

export function assetCatalog(images: Image[], fonts: Font[] = []): Buffer {
  validateResourceNames(images, fonts);
  const entries: ArchiveEntries = new Map();
  for (const image of images) {
    const data = Buffer.alloc(12);
    data.writeUInt32LE(Math.round(image.width / image.scale), 0);
    data.writeUInt32LE(Math.round(image.height / image.scale), 4);
    data.writeUInt32LE(1, 8); // kAssetTypeImage
    entries.set(image.name, data);
  }
  for (const font of fonts) {
    const data = Buffer.alloc(12);
    data.writeUInt32LE(2, 8); // kAssetTypeFont; width and height remain zero.
    entries.set(font.name, data);
  }
  return packet(entries);
}

/** ImageConverter.getConversionInfo: the image's size at `scale`, rounded, padded to a multiple of the scale. */
function sizeArguments(image: Image, scale: number): string[] {
  const extent = (pixels: number) => {
    const size = Math.round((pixels / image.scale) * scale);
    return size + (size % Math.trunc(scale));
  };
  return ['-w', String(extent(image.width)), '-h', String(extent(image.height))];
}

/** The Android resources of the images, into `dir` (a res/ directory). */
export async function writeAndroidResources(module: ValdiModule, images: Image[], dir: string, toolbox: string) {
  const conversions = images.flatMap(image =>
    ANDROID_DENSITIES.map(async ([density, scale]) => {
      const output = path.join(dir, `drawable-${density}`, `${module.name}_${image.name}.webp`);
      mkdirSync(path.dirname(output), { recursive: true });
      await run(toolbox, ['image_convert', '-i', image.file, '-o', output, ...sizeArguments(image, scale), '-q', '0.75']);
    }),
  );
  await Promise.all(conversions);
  if (!images.length) return;
  const drawables = images.map(image => `@drawable/${module.name}_${image.name}`).join(',');
  mkdirSync(path.join(dir, 'raw'), { recursive: true });
  writeFileSync(
    path.join(dir, 'raw', `valdi_${module.name}_keep.xml`),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- These resources are fetched using reflection from valdi -->
<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="${drawables}" tools:shrinkMode="strict" />`,
  );
}

/** The iOS resources of the images: <module>.bundle in `dir` (the app's resources). */
export async function writeIosResources(module: ValdiModule, images: Image[], dir: string, toolbox: string) {
  if (!images.length) return;
  const bundle = path.join(dir, `${module.name}.bundle`);
  mkdirSync(bundle, { recursive: true });
  await Promise.all(
    images.flatMap(image =>
      IOS_SCALES.map(async scale => {
        const output = path.join(bundle, `${image.name}@${scale}x.png`);
        // A variant the source already is ships as it is, as Valdi's does.
        if (scale === image.scale && image.extension === 'png') {
          copyFileSync(image.file, output);
          return;
        }
        await run(toolbox, ['image_convert', '-i', image.file, '-o', output, ...sizeArguments(image, scale)]);
        // ImageConverter.optimizePNG.
        await run(toolbox, ['pngquant', '-i', output]);
      }),
    ),
  );
}
