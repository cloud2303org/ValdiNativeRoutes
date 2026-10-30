// Builds every app module (valdi/modules/<module>, pipeline.ts appModules), each with the npm packages it imports,
// with rolldown into <module>.valdimodule: in out/ (with out/<module>/ unpacked, for reading), or only the archives
// in --out's directory (the Android build's generated assets, the iOS app's resources). --res writes the modules'
// images as Android resources into a res/ directory; --ios-res as <module>.bundle into a directory (the iOS app's
// resources, otherwise left as it is).
// Fonts are bundled in the .valdimodule as res/<name>.ttf on both platforms.
//
//   pnpm build [--release] [--minify] [--compare] [--out <dir>] [--res <dir>] [--ios-res <dir>]
//
// Debug builds are JavaScript with each file's source map inline. --release: Hermes bytecode, as Valdi's release
// builds ship (and minified), with the maps in <module>.map.json next to the archive.
//
// Images use prebuilt sharp, bytecode uses pinned prebuilt hermesc; no native host build tool is required.
// Type errors fail the build, after it is written. --compare also emits each file as the Valdi
// compiler would (CommonJS straight from TypeScript) and diffs the render code against its web output.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pack, type ArchiveEntries } from './archive';
import {
  appModule,
  appModules,
  bin,
  buildModule,
  genDir,
  inlineSourceMaps,
  precompile,
  sourceMapJson,
  valdiSourceRoot,
  writeTsconfig,
  type Built,
} from './pipeline';
import { addFontEntries, assetCatalog, findFonts, findImages, writeAndroidResources, writeIosResources, writeResTs } from './resources';
import { sourceFiles, valdiTs } from './valdiTs';
import { buildNodeModules, copyModuleTree } from '../../scripts/node-modules.mjs';

const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? path.resolve(process.argv[index + 1]) : undefined;
};
const archivesOnly = option('--out');
const out = archivesOnly ?? path.join(import.meta.dirname, 'out');
const androidRes = option('--res');
const iosRes = option('--ios-res');
const release = process.argv.includes('--release');
const minify = release || process.argv.includes('--minify');

if (archivesOnly) {
  mkdirSync(out, { recursive: true });
} else {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
}

if (androidRes) rmSync(androidRes, { recursive: true, force: true });
const bazelOutputs = buildNodeModules(androidRes ? 'android' : 'ios', release);
for (const [name, compiled] of bazelOutputs) {
  rmSync(genDir(name), { recursive: true, force: true });
  copyModuleTree(path.join(compiled, 'resources/ts'), genDir(name));
}
const modules = appModules();
// Gradle and Xcode call this file directly, without the install hook that writes the
// modules' tsconfig.json. Rewrite them at the sources this host really has, so the
// bundle reads the module tsconfig instead of failing every bare import.
if (valdiSourceRoot()) for (const module of modules) writeTsconfig(module, modules);
for (const module of modules) {
  const compiled = bazelOutputs.get(module.name);
  if (compiled) {
    cpSync(path.join(compiled, `${module.name}.valdimodule`), path.join(out, `${module.name}.valdimodule`));
    if (release) cpSync(path.join(compiled, `${module.name}.map.json`), path.join(out, `${module.name}.map.json`));
    if (androidRes) copyModuleTree(path.join(compiled, 'resources/android'), androidRes);
    if (iosRes) {
      rmSync(path.join(iosRes, `${module.name}.bundle`), { recursive: true, force: true });
      copyModuleTree(path.join(compiled, 'resources/ios'), iosRes);
    }
    console.log(`${module.name}: custom module rule (${release ? 'release' : 'debug'})`);
    continue;
  }
  const started = performance.now();
  // Generated sources first: the program the plugin starts with includes them.
  const images = await findImages(module);
  const fonts = findFonts(module) ?? [];
  writeResTs(module, images, genDir(module.name), fonts);
  const plugin = valdiTs(module);
  const built = await buildModule(module, plugin, minify);
  if (images || fonts.length) built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
  addFontEntries(built.entries, fonts);
  await write(module.name, built);
  console.log(`${module.name}: ${built.entries.size} entries, ${images?.length ?? 0} images, ${fonts.length} fonts, in ${Math.round(performance.now() - started)} ms`);
  if (!archivesOnly) {
    for (const [name, content] of built.entries) {
      const file = path.join(out, module.name, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }

  if (androidRes) await writeAndroidResources(module, images ?? [], androidRes);
  if (iosRes) {
    rmSync(path.join(iosRes, `${module.name}.bundle`), { recursive: true, force: true });
    await writeIosResources(module, images ?? [], iosRes);
  }

  const errors = plugin.diagnostics();
  if (errors) {
    process.exitCode = 1;
    console.error(errors);
  }
}

/** The archive (and in release builds the source maps) of one module into `out`. */
async function write(name: string, built: Built) {
  if (release) {
    writeFileSync(path.join(out, `${name}.map.json`), sourceMapJson(name, built));
    await precompile(built.entries);
  } else {
    inlineSourceMaps(built);
  }
  setHash(built.entries);
  writeFileSync(path.join(out, `${name}.valdimodule`), pack(built.entries));
}

/** The archive's `hash` entry, which the runtime only reports (Bundle::getHash). */
function setHash(entries: ArchiveEntries) {
  const hash = createHash('sha256');
  for (const [name, content] of [...entries].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update(content);
  entries.set('hash', Buffer.from(hash.digest('hex')));
}

if (process.argv.includes('--compare')) {
  const module = appModule('app_pages');
  // The same program emitting CommonJS is what the Valdi compiler emits before minifying; its web output isn't
  // minified, so the render code can be compared line by line.
  const reference = valdiTs(module, ts.ModuleKind.CommonJS);
  const web = path.join(bin, 'web/release/assets/app_pages');
  const renderLines = (js: string) => js.split('\n').map(line => line.trim()).filter(line => /__Renderer|__node\w+ =/.test(line));
  let same = 0;
  const differ: string[] = [];
  for (const file of sourceFiles(module).filter(file => file.endsWith('.tsx'))) {
    const relative = path.relative(module.dir, file).replace(/\.tsx$/, '.js');
    const webFile = path.join(web, relative);
    if (!existsSync(webFile)) continue;
    const ours = renderLines(reference.emit(file));
    const theirs = renderLines(readFileSync(webFile, 'utf8'));
    if (ours.join('\n') === theirs.join('\n')) same++;
    else differ.push(`${relative} (${ours.length} vs ${theirs.length} render lines)`);
  }
  console.log(`render code identical to the Valdi compiler's in ${same} files${differ.length ? `; differs in ${differ.join(', ')}` : ''}`);
}
