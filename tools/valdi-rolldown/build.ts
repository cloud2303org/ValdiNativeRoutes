// Builds every app module (valdi/modules/<module>, pipeline.ts appModules), each with the npm packages it imports,
// with rolldown into <module>.valdimodule: in out/ (with out/<module>/ unpacked, for reading), or only the archives
// in --out's directory (the Android build's generated assets, the iOS app's resources). --res writes the modules'
// images as Android resources into a res/ directory; --ios-res as <module>.bundle into a directory (the iOS app's
// resources, otherwise left as it is).
// Fonts are bundled in the .valdimodule as res/<name>.ttf on both platforms.
//
//   pnpm build [--release] [--minify] [--out <dir>] [--res <dir>] [--ios-res <dir>]
//              [--module <name>] [--hermes-base <previous.valdimodule>]
//
// Debug builds are JavaScript with each file's source map inline. --release: Hermes bytecode, as Valdi's release
// builds ship (and minified), with the maps in <module>.map.json next to the archive.
//
// Images use prebuilt sharp, bytecode uses pinned prebuilt hermesc; no native host build tool is required.
// Type errors fail before a module archive is written.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pack, setArchiveHash, unpack } from './archive';
import {
  appModules,
  buildModule,
  genDir,
  inlineSourceMaps,
  moduleConfig,
  precompile,
  sourceMapJson,
  writeTsconfig,
  type Built,
} from './pipeline';
import { addFontEntries, assetCatalog, findFonts, findImages, writeAndroidResources, writeIosResources, writeResTs } from './resources';
import { valdiTs } from './valdiTs';
import { buildNodeModules, copyModuleTree, stagedModuleOutputs } from '../../scripts/node-modules.mjs';
import { availableModuleNames, pruneDisabledModuleOutputs } from './modules.mjs';

const value = (name: string) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (process.argv.lastIndexOf(name) !== index || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error(`${name} requires exactly one value`);
  }
  return process.argv[index + 1];
};
const valueOptions = new Set(['--out', '--res', '--ios-res', '--module', '--hermes-base', '--native-platform']);
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (valueOptions.has(argument)) {
    value(argument);
    index++;
  } else if (argument !== '--release' && argument !== '--minify') {
    throw new Error(`Unknown build option: ${argument}`);
  }
}
const option = (name: string) => {
  const argument = value(name);
  return argument === undefined ? undefined : path.resolve(argument);
};
const archivesOnly = option('--out');
const out = archivesOnly ?? path.join(import.meta.dirname, 'out');
const androidRes = option('--res');
const iosRes = option('--ios-res');
const release = process.argv.includes('--release');
const minify = release || process.argv.includes('--minify');
const selected = value('--module');
const baseFile = option('--hermes-base');
// Gradle/Xcode depend on their native module build task and reuse its bundle products.
const nativePlatform = value('--native-platform');
if (nativePlatform !== undefined && !['android', 'ios'].includes(nativePlatform))
  throw new Error('--native-platform requires android or ios');
if (nativePlatform && (selected || !archivesOnly || nativePlatform === 'android' && !androidRes || nativePlatform === 'ios' && !iosRes))
  throw new Error('--native-platform requires full native App packaging with --out and platform resources');
if (baseFile && (!release || !selected)) throw new Error('--hermes-base requires --release and one --module');
// Validate references before starting native module actions.
const allModules = appModules();
const modules = selected ? allModules.filter(module => module.name === selected) : allModules;
if (selected && modules.length !== 1) throw new Error(`Module '${selected}' is not enabled`);
if (!modules.length) throw new Error('No enabled App modules. Set package.json valdi.modules before building.');
if (baseFile && moduleConfig(selected!).nativeBuild === 'bazel') {
  throw new Error('--hermes-base requires a source-built module; Bazel-owned archives are already compiled');
}
const baseArchive = baseFile ? unpack(readFileSync(baseFile)) : undefined;
const available = availableModuleNames(path.resolve(import.meta.dirname, '../..'));
if (!selected) {
  pruneDisabledModuleOutputs(out, available, allModules.map(module => module.name));
  if (iosRes) pruneDisabledModuleOutputs(iosRes, available, allModules.map(module => module.name));
}

if (archivesOnly) {
  mkdirSync(out, { recursive: true });
} else {
  rmSync(selected ? path.join(out, selected) : out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
}

if (androidRes && !selected) rmSync(androidRes, { recursive: true, force: true });
const bazelOutputs = !selected || moduleConfig(selected).nativeBuild === 'bazel'
  ? nativePlatform ? stagedModuleOutputs(nativePlatform, release) : buildNodeModules(androidRes ? 'android' : 'ios', release)
  : new Map();
for (const [name, compiled] of bazelOutputs) {
  rmSync(genDir(name), { recursive: true, force: true });
  copyModuleTree(path.join(compiled, 'resources/ts'), genDir(name));
}
// Gradle and Xcode call this file directly, without the install hook that writes the
// modules' tsconfig.json. Rewrite them at the sources this host really has, so the
// bundle reads the module tsconfig instead of failing every bare import (a no-op when
// this host has no fetched Valdi sources).
for (const module of modules) writeTsconfig(module, allModules);
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

  plugin.dispose();
}

/** The archive (and in release builds the source maps) of one module into `out`. */
async function write(name: string, built: Built) {
  if (release) {
    writeFileSync(path.join(out, `${name}.map.json`), sourceMapJson(name, built));
    await precompile(built.entries, { baseArchive });
  } else {
    inlineSourceMaps(built);
  }
  setArchiveHash(built.entries);
  writeFileSync(path.join(out, `${name}.valdimodule`), pack(built.entries));
}
