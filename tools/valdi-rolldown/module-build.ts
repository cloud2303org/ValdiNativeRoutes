// Bazel's module action. It invokes only our Node compiler/codegen, stages its
// inputs in a temporary module, and writes only declared Bazel outputs.
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack, setArchiveHash } from './archive';
import { VALDI_PROJECT_CONFIG, generateNativeCode, nativeSourceFiles } from './codegen/index';
import {
  appModule,
  buildModule,
  inlineSourceMaps,
  moduleConfig,
  precompile,
  sourceMapJson,
  valdiSourceRoot,
  writeTsconfig,
} from './pipeline';
import {
  addFontEntries,
  assetCatalog,
  findFonts,
  findImages,
  writeAndroidResources,
  writeIosResources,
  writeResTs,
} from './resources';
import { valdiTs, type ValdiModule } from './valdiTs';
import { fileURLToPath } from 'node:url';

export async function compileNodeModule(
  original: ValdiModule,
  out: string,
  iosName: string,
  mode: 'debug' | 'release',
  dependencies: ValdiModule[] = [],
  iosLanguage: 'objc' | 'swift' | 'both' = 'objc',
): Promise<void> {
  // Editor configs can exist before preparation. Require real framework inputs
  // independently, before staging sources or publishing any output.
  if (!valdiSourceRoot()) {
    throw new Error(
      'Valdi sources are not prepared for the Node module compiler: neither VALDI_SOURCE_ROOT nor valdi/bazel-*/external/valdi+ ' +
        'holds modules/_configs/base.tsconfig.json. Run: node scripts/prepare-valdi.mjs',
    );
  }
  const name = original.name;
  const originalConfigFile = path.join(original.dir, 'module.json');
  const originalConfig = existsSync(originalConfigFile)
    ? JSON.parse(readFileSync(originalConfigFile, 'utf8')) : moduleConfig(name);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), `node-valdi-${name}-`)));
  try {
    symlinkSync(original.nodeModules!, path.join(temporary, 'node_modules'), 'dir');
    // Source and generated roots share module-relative names, just as the
    // checkout's modules/<name> and .gen/<name>. Keep dependency overlays in
    // that namespace too, so './Strings' cannot resolve another module's file.
    const staged = (source: ValdiModule): ValdiModule => {
      const dir = path.join(temporary, 'modules', source.name);
      const generated = path.join(temporary, 'generated', source.name);
      mkdirSync(dir, { recursive: true });
      for (const entry of ['src', 'strings', 'module.json']) {
        if (existsSync(path.join(source.dir, entry)))
          cpSync(path.join(source.dir, entry), path.join(dir, entry), { recursive: true });
      }
      for (const input of source.generatedDirs) {
        if (existsSync(input)) cpSync(input, generated, { recursive: true });
      }
      return { ...source, dir, generatedDirs: [generated] };
    };
    const module = staged({ ...original, generatedDirs: [] });
    const stagedDependencies = dependencies.map(staged);
    if (existsSync(path.join(original.dir, 'res')))
      cpSync(path.join(original.dir, 'res'), path.join(module.dir, 'res'), { recursive: true });
    writeTsconfig(module, [module, ...stagedDependencies]);
    const images = await findImages(module);
    const fonts = findFonts(module) ?? [];
    writeResTs(module, images, module.generatedDirs[0], fonts);
    const plugin = valdiTs(module);
    const built = await buildModule(module, plugin, mode === 'release');
    if (images || fonts.length) built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
    addFontEntries(built.entries, fonts);
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, `${name}.map.json`), sourceMapJson(name, built));
    if (mode === 'release') await precompile(built.entries);
    else inlineSourceMaps(built);
    setArchiveHash(built.entries);
    writeFileSync(path.join(out, `${name}.valdimodule`), pack(built.entries));
    const target = {
      module,
      program: () => plugin.program(),
      nativeDependencies: stagedDependencies.map(module => {
        const configFile = path.join(module.dir, 'module.json');
        const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : moduleConfig(module.name);
        return { module, bundleInfo: {
          ...VALDI_PROJECT_CONFIG, name: module.name, iosModuleName: config.iosModuleName ?? module.name,
          iosLanguage: config.iosLanguage ?? 'objc', asyncStrictMode: false,
          androidClassPath: config.androidClassPath,
        } };
      }),
      bundleInfo: {
        ...VALDI_PROJECT_CONFIG,
        name,
        iosModuleName: iosName,
        iosLanguage,
        androidClassPath: originalConfig.androidClassPath,
        asyncStrictMode: false,
      },
    };
    const native = generateNativeCode(target);
    for (const platform of ['android', 'ios', 'cpp'] as const) {
      for (const [file, source] of nativeSourceFiles(target, native, platform)) {
        const output = path.join(out, platform, file);
        mkdirSync(path.dirname(output), { recursive: true });
        const content =
          platform === 'ios'
            ? source
                .replaceAll('#import <valdi_core/', '#import <ValdiRuntime/')
                .replaceAll('import ValdiCoreSwift', 'import ValdiRuntime')
                .replaceAll(`#import "${iosName}Types.h"`, `#import <${iosName}Types/${iosName}Types.h>`)
                .replaceAll(`#import "${iosName}.h"`, `#import <${iosName}/${iosName}.h>`)
            : source;
        writeFileSync(output, content);
      }
    }
    // Fixed Bazel outputs exist even when that language emits no declarations.
    for (const directory of [iosName, iosName + 'Types']) {
      mkdirSync(path.join(out, 'ios', directory), { recursive: true });
      for (const extension of ['swift', 'h', 'm']) {
        const file = path.join(out, 'ios', directory, directory + '.' + extension);
        if (!existsSync(file)) writeFileSync(file, '');
      }
    }
    const resources = path.join(out, 'resources');
    mkdirSync(path.join(resources, 'android'), { recursive: true });
    mkdirSync(path.join(resources, 'ios'), { recursive: true });
    mkdirSync(path.join(resources, 'ts'), { recursive: true });
    const declarations = path.join(module.generatedDirs[0], 'res.ts');
    if (existsSync(declarations)) copyFileSync(declarations, path.join(resources, 'ts/res.ts'));
    const strings = path.join(module.generatedDirs[0], 'src/Strings.ts');
    if (existsSync(strings)) {
      mkdirSync(path.join(resources, 'ts/src'), { recursive: true });
      copyFileSync(strings, path.join(resources, 'ts/src/Strings.ts'));
    }
    await writeAndroidResources(module, images ?? [], path.join(resources, 'android'));
    await writeIosResources(module, images ?? [], path.join(resources, 'ios'));
    writeFileSync(
      path.join(out, 'build.json'),
      JSON.stringify({ name, mode, compiler: 'node-valdi-rolldown', iosModuleName: iosName, iosLanguage }, null, 2) + '\n',
    );
    console.log(`${name}: ${mode}, ${built.entries.size} entries; Node TS, resources and native bindings`);
  } finally {
    // Windows can keep a short-lived lock on the freshly written native/resource files.
    rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  function option(name: string): string {
    const index = args.indexOf(name);
    const value = args[index + 1];
    if (index < 0 || !value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    args.splice(index, 2);
    return value;
  }
  const name = option('--module');
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid module name');
  const out = path.resolve(option('--out'));
  const iosName = option('--ios-module-name');
  const mode = option('--mode');
  const iosLanguage = args.includes('--ios-language') ? option('--ios-language') : 'objc';
  if (!['objc', 'swift', 'both'].includes(iosLanguage)) throw new Error('Invalid iOS binding language');
  const dependencies = args.includes('--deps')
    ? (JSON.parse(option('--deps')) as { name: string; generatedDir: string }[]).map(dep => ({
        ...appModule(dep.name),
        generatedDirs: [path.resolve(dep.generatedDir)],
      }))
    : [];
  process.chdir(import.meta.dirname);
  if (args.length || !['debug', 'release'].includes(mode)) throw new Error('Unexpected module build arguments');
  const config = moduleConfig(name);
  if ((config.iosLanguage ?? 'objc') !== iosLanguage) throw new Error('BUILD ios_language must match module.json iosLanguage');
  if ((config.iosModuleName ?? name) !== iosName) {
    throw new Error(`${name}: BUILD.bazel and module.json must agree on iosModuleName`);
  }
  await compileNodeModule(appModule(name), out, iosName, mode as 'debug' | 'release', dependencies, iosLanguage as 'objc' | 'swift' | 'both');
}
