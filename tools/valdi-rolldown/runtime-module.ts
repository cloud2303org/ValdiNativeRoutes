// Node implementation of the native runtime's ValdiModuleInfo output contract.
// The Bazel adapter declares the same files as the official compiler rule;
// unknown outputs fail instead of publishing placeholders for unsupported work.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { pack } from './archive';
import { VALDI_PROJECT_CONFIG, generateNativeCode, nativeSourceFiles, type CodegenModule, type NativeCode } from './codegen/index';
import { combineNativeSources } from './codegen/CombineNativeSourcesProcessor';
import { inlineSourceMaps, precompile, sourceMapJson, type Built } from './pipeline';
import { valdiTs, type ValdiModule } from './valdiTs';

export interface RuntimeModuleSpec {
  name: string;
  moduleDirectory: string;
  sources: string[];
  outputs: { path: string; relative: string; directory: boolean }[];
  dependencies: { module_name: string; module_path: string; module_content: string }[];
  iosModuleName: string;
  iosClassPrefix: string;
  androidClassPath: string;
  disableAnnotations: boolean;
  asyncStrictMode: boolean;
  compilationMode: string;
}

export async function compileRuntimeModule(spec: RuntimeModuleSpec, execroot = process.cwd()): Promise<void> {
  if (!['js_bytecode', 'js'].includes(spec.compilationMode)) throw new Error(`Unsupported runtime compilation mode ${spec.compilationMode}`);
  const original = path.resolve(execroot, spec.moduleDirectory).split(path.sep).join('/');
  // Builtins are compiled from the pinned fork; app modules use module-build.ts.
  const marker = '/src/valdi_modules/src/valdi/';
  const index = original.lastIndexOf(marker);
  if (index < 0) throw new Error(`Not a pinned runtime module: ${original}`);
  const upstream = original.slice(0, index);
  process.env.VALDI_SOURCE_ROOT = upstream;
  const temporary = mkdtempSync(path.join(tmpdir(), `valdi-runtime-${spec.name}-`));
  try {
    // Copy only declared source inputs. In particular, never pick up a checked-in
    // generated .gen tree or an old Bazel compilation result.
    const sources = spec.sources.map(source => {
      const input = path.resolve(execroot, source);
      const relative = path.relative(original, input);
      if (relative.startsWith('..')) throw new Error(`Source outside ${spec.name}: ${source}`);
      const output = path.join(temporary, relative);
      mkdirSync(path.dirname(output), { recursive: true });
      cpSync(input, output);
      return output;
    });
    // Pinned upstream declaration omission: this type is imported from
    // ValdiRuntime by its own sources but only privately imported there. This
    // type-only re-export has no JS or native runtime effect.
    const runtimeDeclaration = path.join(temporary, 'src/ValdiRuntime.d.ts');
    if (spec.name === 'valdi_core' && existsSync(runtimeDeclaration)) {
      writeFileSync(runtimeDeclaration, readFileSync(runtimeDeclaration, 'utf8') +
        '\nexport type { ElementFrame } from "valdi_tsx/src/Geometry";\n');
    }
    const modules = path.join(upstream, 'src/valdi_modules/src/valdi');
    const paths: Record<string, string[]> = {};
    for (const name of new Set([spec.name, ...spec.dependencies.map(dep => dep.module_name)])) {
      if (name === '__valdi_base__') continue;
      paths[`${name}/*`] = [`${name === spec.name ? temporary : path.join(modules, name)}/*`];
    }
    paths.tslib = [path.join(modules, 'valdi_core/src/tslib')];
    paths.Valdi = [path.join(modules, 'valdi_core/src/Valdi')];
    paths.jasmine = [path.join(modules, 'jasmine/src/jasmine.d.ts')];
    const ownGlobals = sources.some(file => file.split(path.sep).join('/').endsWith('/types/globals.d.ts'));
    const config = {
      extends: path.join(upstream, 'modules/_configs/base.tsconfig.json'),
      compilerOptions: {
        paths,
        types: ownGlobals ? [] : [path.join(upstream, 'modules/types/Long'), path.join(upstream, 'modules/types/globals')],
        allowJs: true,
        checkJs: false,
        outDir: path.join(temporary, '.emitted'),
      },
      files: sources,
      include: [],
    };
    writeFileSync(path.join(temporary, 'tsconfig.json'), JSON.stringify(config));
    const module: ValdiModule = {
      name: spec.name, dir: temporary, generatedDirs: [], includeJavaScript: true,
      sourceEntries: sources.filter(file => /\.(tsx?|js)$/.test(file) && !file.endsWith('.d.ts') && !file.includes('.spec.')),
    };
    // Runtime bootstrap cannot require bundler chunks: ModuleLoader is loaded
    // before require() exists and its root evaluator accepts only tslib.
    // Builtins have no npm imports, so emit each source as independent CommonJS.
    const plugin = valdiTs(module, ts.ModuleKind.CommonJS);
    const diagnostics = plugin.diagnostics();
    if (diagnostics) throw new Error(diagnostics);
    const target: CodegenModule = {
      module, program: () => plugin.program(),
      bundleInfo: {
        ...VALDI_PROJECT_CONFIG, name: spec.name, iosModuleName: spec.iosModuleName,
        iosLanguage: 'objc', asyncStrictMode: spec.asyncStrictMode,
        ...(spec.iosClassPrefix === '__valdi_unset_ios_class_prefix__' ? {} : { iosClassPrefix: spec.iosClassPrefix }),
        ...(spec.androidClassPath ? { androidClassPath: spec.androidClassPath } : {}),
      },
    };
    const code: NativeCode = spec.disableAnnotations
      ? { sources: combineNativeSources([], target.bundleInfo) }
      : generateNativeCode(target, message => { throw new Error(message); });
    const native = Object.fromEntries((['android', 'ios', 'cpp'] as const)
      .map(platform => [platform, nativeSourceFiles(target, code, platform)]));
    const declarations = new Map<string, string>();
    const program = plugin.program();
    const declarationProgram = ts.createProgram({ rootNames: program.getRootFileNames().filter(file => !file.endsWith('.js')), options: {
      ...program.getCompilerOptions(), declaration: true, emitDeclarationOnly: true,
      allowJs: false,
      outDir: path.join(temporary, 'declarations'), rootDir: undefined,
    } });
    const emitted = declarationProgram.emit(undefined, (file, content, _bom, _error, sourceFiles) => {
      const source = sourceFiles?.[0];
      if (source && !path.relative(temporary, source.fileName).startsWith('..')) {
        declarations.set(path.relative(temporary, source.fileName).split(path.sep).join('/').replace(/\.(tsx?|js)$/, '.d.ts'), content);
      }
    });
    if (emitted.emitSkipped || emitted.diagnostics.length) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, {
        getCanonicalFileName: file => file, getCurrentDirectory: () => temporary, getNewLine: () => '\n',
      }) || 'Declaration emission skipped');
    }
    const builds = new Map<string, Built>();
    const archives = new Map<string, Buffer>();
    for (const mode of ['debug', 'release']) {
      if (!spec.outputs.some(output => output.relative.includes(`/${mode}/assets/`))) continue;
      const active = { ...module, sourceEntries: module.sourceEntries!.filter(file => mode !== 'release' || !path.relative(temporary, file).startsWith('test/')) };
      const built: Built = { entries: new Map(), maps: new Map() };
      for (const source of active.sourceEntries) {
        const relative = path.relative(temporary, source).split(path.sep).join('/').replace(/\.tsx?$/, '.js');
        if (source.endsWith('.js')) built.entries.set(relative, readFileSync(source));
        else {
          const emitted = plugin.emitWithMap(source);
          built.entries.set(relative, Buffer.from(emitted.code));
          const map = JSON.parse(emitted.map);
          map.sources = map.sources.map((file: string) => `//${spec.name}/${path.relative(temporary, file).split(path.sep).join('/')}`);
          built.maps.set(relative, JSON.stringify(map));
        }
      }
      builds.set(mode, built);
      const entries = new Map(built.entries);
      if (mode === 'release' && spec.compilationMode === 'js_bytecode') await precompile(entries);
      else inlineSourceMaps({ ...built, entries });
      const hash = createHash('sha256');
      for (const [file, content] of [...entries].sort(([a], [b]) => a.localeCompare(b))) hash.update(file).update(content);
      entries.set('hash', Buffer.from(hash.digest('hex')));
      archives.set(mode, pack(entries));
    }
    for (const output of spec.outputs) {
      const filename = path.resolve(execroot, output.path);
      if (output.directory) {
        if (!/^(android|ios)\/(debug|release)\/source-maps$/.test(output.relative)) throw new Error(`Unknown output directory ${output.relative}`);
        mkdirSync(filename, { recursive: true });
        const mode = output.relative.split('/')[1];
        for (const [file, map] of builds.get(mode)?.maps ?? []) {
          const destination = path.join(filename, spec.name, file + '.map');
          mkdirSync(path.dirname(destination), { recursive: true });
          writeFileSync(destination, map);
        }
        continue;
      }
      let content: string | Buffer | undefined;
      const match = /^(android|ios|cpp)\/(debug|release)\/(.+)$/.exec(output.relative);
      if (match) {
        const [, platform, mode, relative] = match;
        if (relative.startsWith('src/')) content = native[platform].get(relative.slice(4));
        else if (relative === `assets/${spec.name}.valdimodule`) content = archives.get(mode);
        else if (relative === `assets/${spec.name}.map.json`) content = sourceMapJson(spec.name, builds.get(mode)!);
        else if (relative.startsWith('native/') && relative.endsWith(`/${spec.name}_native.c`)) content = `// ${spec.name}_native.c (JavaScript bytecode has no native TSN code)\n`;
      } else if (output.relative.startsWith(`.valdi_build/compile/typescript/output/${spec.name}/`)) {
        content = declarations.get(output.relative.slice(`.valdi_build/compile/typescript/output/${spec.name}/`.length));
      } else if (output.relative === `.valdi_build/compile/typescript/dumped_symbols/${spec.name}/compilation-metadata.json`) {
        content = JSON.stringify({ compiler: 'node-valdi-rolldown', module: spec.name, version: 1 });
      } else if (output.relative === 'ios/metadata/dependencyData.json') {
        content = code.iosDependencyMetadata;
      }
      if (content === undefined) throw new Error(`Node backend did not produce declared output ${output.relative}`);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, content);
    }
    console.log(`${spec.name}: Node runtime compiler, ${spec.outputs.length} outputs`);
  } finally {
    // Windows can keep a short-lived lock on the freshly written outputs.
    rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await compileRuntimeModule(JSON.parse(readFileSync(process.argv[2], 'utf8')));
}
