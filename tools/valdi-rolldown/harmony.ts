import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pack } from './archive';
import { buildModule, precompile, root, sourceMapJson } from './pipeline';
import { addFontEntries, assetCatalog, findFonts, findImages, writeResTs } from './resources';
import { compileRuntimeModule, type RuntimeModuleSpec } from './runtime-module';
import { valdiTs, type ValdiModule } from './valdiTs';

const source = path.resolve(process.argv[2] ?? path.join(root, '.tools/harmony/upstream'));
const out = path.resolve(process.argv[3] ?? path.join(root, 'harmony/entry/src/main/resources/rawfile/modules'));
const names = ['coreutils', 'jasmine', 'source_map', 'valdi_tsx', 'valdi_core', 'client_sql', 'valdi_http'];
const modules = path.join(source, 'src/valdi_modules/src/valdi');
process.env.VALDI_SOURCE_ROOT = source;
mkdirSync(out, { recursive: true });
// The pinned fork's api_version_file flag defaults to the empty version (0).
writeFileSync(path.join(out, 'valdi_api_version'), '0\n');

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '.gen' ? [] : files(file);
    return /\.(tsx?|js)$/.test(file) ? [file] : [];
  });
}

for (const name of names) {
  const moduleDirectory = path.join(modules, name);
  const spec: RuntimeModuleSpec = {
    name, moduleDirectory, sources: files(path.join(moduleDirectory, 'src')),
    dependencies: names.filter(dep => dep !== name).map(dep => ({
      module_name: dep, module_path: path.join(modules, dep), module_content: '',
    })),
    outputs: ['valdimodule', 'map.json'].map(extension => ({
      path: path.join(out, `${name}.${extension}`),
      relative: `cpp/release/assets/${name}.${extension}`,
      directory: false,
    })),
    iosModuleName: name, iosClassPrefix: '__valdi_unset_ios_class_prefix__', androidClassPath: '',
    disableAnnotations: true, asyncStrictMode: false, compilationMode: 'js_bytecode',
  };
  await compileRuntimeModule(spec, root);
  console.log(`Harmony builtin HBC: ${name}`);
}

// navigation/index imports ../routes: keep the actual module identity and shared routing code,
// substituting only the smoke declaration/pages, rather than loading the business app's native dependencies.
const stage = path.join(root, '.tools/harmony/route-fixture');
rmSync(stage, { recursive: true, force: true });
const appPages = path.join(stage, 'app_pages');
const smoke = path.join(stage, 'harmony_smoke');
const shared = path.join(root, 'valdi/modules/app_pages');
mkdirSync(path.join(appPages, 'src'), { recursive: true });
for (const name of ['NavigationHost.ts', 'Page.ts', 'PageComponent.ts', 'TabBar.ts', 'navigation']) {
  cpSync(path.join(shared, 'src', name), path.join(appPages, 'src', name), { recursive: true });
}
// The exported routing models travel with navigation/, including models.ts.
if (!readFileSync(path.join(appPages, 'src/navigation/models.ts')).length) {
  throw new Error('Smoke staging requires the shared typed route models');
}
cpSync(path.join(root, 'harmony/smoke/app_pages/src'), path.join(appPages, 'src'), { recursive: true });
cpSync(path.join(root, 'harmony/smoke/src'), path.join(smoke, 'src'), { recursive: true });
const icons = ['tab_home', 'tab_home_on', 'tab_components', 'tab_components_on'];
const iconDirectory = path.join(path.dirname(out), 'tab-icons');
mkdirSync(path.join(appPages, 'res'), { recursive: true });
mkdirSync(iconDirectory, { recursive: true });
for (const name of icons) {
  const image = path.join(shared, 'res', `${name}@3x.png`);
  cpSync(image, path.join(appPages, 'res', `${name}@3x.png`));
  cpSync(image, path.join(iconDirectory, `${name}.png`));
}
cpSync(path.join(source, 'valdi/res/font/roboto_mono_regular.ttf'),
  path.join(appPages, 'res/roboto_mono_regular.ttf'));
const generated = path.join(appPages, '.gen');
const appModule: ValdiModule = {
  name: 'app_pages', dir: appPages, generatedDirs: [generated],
  nodeModules: path.join(root, 'valdi/node_modules'),
};
const images = await findImages(appModule);
const fonts = findFonts(appModule) ?? [];
writeResTs(appModule, images, generated, fonts);
const imageDirectory = path.join(path.dirname(out), 'assets', appModule.name);
mkdirSync(imageDirectory, { recursive: true });
for (const image of images ?? []) {
  cpSync(image.file, path.join(imageDirectory, `${image.name}.${image.extension}`));
}
// TypeScript and the Node package resolver both need access to real npm dependencies from the stage.
symlinkSync(appModule.nodeModules!, path.join(appPages, 'node_modules'), 'junction');
const fixtureModules: ValdiModule[] = [
  appModule,
  { name: 'harmony_smoke', dir: smoke, generatedDirs: [] },
];
for (const module of fixtureModules) {
  writeFileSync(path.join(module.dir, 'tsconfig.json'), JSON.stringify({
    extends: path.join(source, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: {
      paths: Object.fromEntries([
        ...names.map(name => [`${name}/*`, [path.join(modules, name, '*')]]),
        ...fixtureModules.map(other => [
          `${other.name}/*`, [path.join(other.dir, '*'), ...other.generatedDirs.map(dir => path.join(dir, '*'))],
        ]),
        ['tslib', [path.join(modules, 'valdi_core/src/tslib')]],
        ['Valdi', [path.join(modules, 'valdi_core/src/Valdi')]],
      ]),
      types: [path.join(source, 'modules/types/Long'), path.join(source, 'modules/types/globals')],
    },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
  }));
}
for (const module of fixtureModules) {
  const plugin = valdiTs(module, undefined, true);
  const diagnostics = plugin.diagnostics();
  if (diagnostics) throw new Error(diagnostics);
  const built = await buildModule(module, plugin, true);
  if (module === appModule) {
    built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
    addFontEntries(built.entries, fonts);
  }
  writeFileSync(path.join(out, `${module.name}.map.json`), sourceMapJson(module.name, built));
  await precompile(built.entries);
  const hash = createHash('sha256');
  for (const [name, bytes] of [...built.entries].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name).update(bytes);
  }
  built.entries.set('hash', Buffer.from(hash.digest('hex')));
  writeFileSync(path.join(out, `${module.name}.valdimodule`), pack(built.entries));
  console.log(`Harmony route fixture HBC: ${module.name}`);
}
const metadata = JSON.stringify({
  schemaVersion: 1, profile: 'smoke',
  valdiCommit: readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8')
    .match(/VALDI_COMMIT = "([a-f0-9]+)"/)?.[1],
  engine: 'hermes-260318099.0.4', hbcVersion: 99,
  platform: 6, modules: [...names, ...fixtureModules.map(module => module.name)],
  bootstrap: { module: 'harmony_smoke/src/app', export: 'start', arguments: [], returns: 'RouteDeclaration',
    publication: 'updateRoutes receives exactly the returned typed declaration once' },
  routing: { abi: 'typed-v1', declaration: 'RouteDeclaration', routes: 'RouteEntry[]',
    params: 'any (UNTYPED_MAP)', results: 'any (UNTYPED_MAP)', currentPages: 'StackPage[]' },
  routeComponents: Object.fromEntries(['HomePage', 'SecondTabPage', 'DetailPage', 'StackPage', 'ResetPage', 'AnimationPage', 'GesturePage', 'ScrollPage', 'ImagePage', 'InputPage', 'TabBarPage', 'FoundationPage', 'SnapshotPage', 'RefreshPage']
    .map(name => [name, `${name}@app_pages/src/${name}`])),
  customTabComponents: ['SmokeTabBar', 'SmokeTallTabBar']
    .map(name => `${name}@app_pages/src/SmokeTabBar`),
  tabIcons: icons.map(name => `tab-icons/${name}.png`),
}, null, 2) + '\n';
writeFileSync(path.join(out, 'build-info.json'), metadata);
const metadataDirectory = path.join(path.dirname(out), 'valdi');
mkdirSync(metadataDirectory, { recursive: true });
writeFileSync(path.join(metadataDirectory, 'build-info.json'), metadata);
