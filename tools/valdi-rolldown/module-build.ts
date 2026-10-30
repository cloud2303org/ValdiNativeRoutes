// Bazel's module action. It invokes only our Node compiler/codegen, stages its
// inputs in a temporary module, and writes only declared Bazel outputs.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from './archive';
import { VALDI_PROJECT_CONFIG, generateNativeCode, nativeSourceFiles } from './codegen/index';
import {
  appModule,
  buildModule,
  inlineSourceMaps,
  moduleConfig,
  precompile,
  sourceMapJson,
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
): Promise<void> {
  const name = original.name;
  const temporary = mkdtempSync(path.join(tmpdir(), `node-valdi-${name}-`));
  try {
    symlinkSync(original.nodeModules!, path.join(temporary, 'node_modules'), 'dir');
    cpSync(path.join(original.dir, 'src'), path.join(temporary, 'src'), { recursive: true });
    if (existsSync(path.join(original.dir, 'res')))
      cpSync(path.join(original.dir, 'res'), path.join(temporary, 'res'), { recursive: true });
    const module = { ...original, dir: temporary, generatedDirs: [path.join(temporary, '.gen')] };
    writeTsconfig(module, [module, ...dependencies]);
    const images = await findImages(module);
    const fonts = findFonts(module) ?? [];
    writeResTs(module, images, module.generatedDirs[0], fonts);
    const plugin = valdiTs(module);
    const built = await buildModule(module, plugin, mode === 'release');
    const diagnostics = plugin.diagnostics();
    if (diagnostics) throw new Error(diagnostics);
    if (images || fonts.length) built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
    addFontEntries(built.entries, fonts);
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, `${name}.map.json`), sourceMapJson(name, built));
    if (mode === 'release') await precompile(built.entries);
    else inlineSourceMaps(built);
    const hash = createHash('sha256');
    for (const [file, bytes] of [...built.entries].sort(([a], [b]) => a.localeCompare(b)))
      hash.update(file).update(bytes);
    built.entries.set('hash', Buffer.from(hash.digest('hex')));
    writeFileSync(path.join(out, `${name}.valdimodule`), pack(built.entries));
    const target = {
      module,
      program: () => plugin.program(),
      bundleInfo: {
        ...VALDI_PROJECT_CONFIG,
        name,
        iosModuleName: iosName,
        iosLanguage: 'objc' as const,
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
                .replaceAll(`#import "${iosName}Types.h"`, `#import <${iosName}Types/${iosName}Types.h>`)
                .replaceAll(`#import "${iosName}.h"`, `#import <${iosName}/${iosName}.h>`)
            : source;
        writeFileSync(output, content);
      }
    }
    const resources = path.join(out, 'resources');
    mkdirSync(path.join(resources, 'android'), { recursive: true });
    mkdirSync(path.join(resources, 'ios'), { recursive: true });
    mkdirSync(path.join(resources, 'ts'), { recursive: true });
    const declarations = path.join(module.generatedDirs[0], 'res.ts');
    if (existsSync(declarations)) copyFileSync(declarations, path.join(resources, 'ts/res.ts'));
    await writeAndroidResources(module, images ?? [], path.join(resources, 'android'));
    await writeIosResources(module, images ?? [], path.join(resources, 'ios'));
    writeFileSync(
      path.join(out, 'build.json'),
      JSON.stringify({ name, mode, compiler: 'node-valdi-rolldown', iosModuleName: iosName }, null, 2) + '\n',
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
  const dependencies = args.includes('--deps')
    ? (JSON.parse(option('--deps')) as { name: string; generatedDir: string }[]).map(dep => ({
        ...appModule(dep.name),
        generatedDirs: [path.resolve(dep.generatedDir)],
      }))
    : [];
  process.chdir(import.meta.dirname);
  if (args.length || !['debug', 'release'].includes(mode)) throw new Error('Unexpected module build arguments');
  const config = moduleConfig(name);
  if (config.nativeBuild !== 'bazel' || (config.iosModuleName ?? name) !== iosName) {
    throw new Error(`${name}: BUILD.bazel and module.json must agree on nativeBuild and iosModuleName`);
  }
  await compileNodeModule(appModule(name), out, iosName, mode as 'debug' | 'release', dependencies);
}
