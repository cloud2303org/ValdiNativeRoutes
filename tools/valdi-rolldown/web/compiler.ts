import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export interface WebModule {
  name: string;
  dir: string;
  buildFile: string;
  deps: string[];
  nativeModules: Record<string, string>;
  workers: string[];
}

/** Read the literal attributes used by this upstream's valdi_module declarations.
 * This is deliberately not a Starlark evaluator. Computed metadata must be
 * supplied by a future ValdiModuleInfo adapter rather than guessed here.
 */
export function readModule(dir: string): WebModule {
  const buildFile = path.join(dir, 'BUILD.bazel');
  const build = readFileSync(buildFile, 'utf8');
  const start = build.indexOf('\nvaldi_module(');
  if (start < 0) throw new Error(`No valdi_module in ${buildFile}`);
  const body = build.slice(start);
  const attr = (name: string, empty: string) => {
    const match = new RegExp(`^    ${name} = ([\\s\\S]*?)(?=^    \\w+ = |^\\))`, 'm').exec(body);
    return match ? match[1].replace(/#[^\n]*/g, '').trim().replace(/,$/, '') : empty;
  };
  const strings = (name: string) => {
    const raw = attr(name, '[]');
    if (!/^\[[\s\S]*\]$/.test(raw)) throw new Error(`Computed ${name} unsupported: ${buildFile}`);
    return JSON.parse(raw.replace(/,\s*]/g, ']')) as string[];
  };
  const nativeRaw = attr('web_register_native_module_id_overrides', '{}');
  const nativeModules = JSON.parse(nativeRaw.replace(/,\s*}/g, '}')) as Record<string, string>;
  const name = JSON.parse(attr('name', '""')) as string;
  if (!name) throw new Error(`Missing module name: ${buildFile}`);
  const webDeps = strings('web_deps');
  // All web_deps used by this entry are local ts_project targets compiling web/.
  for (const dep of webDeps) {
    if (!dep.startsWith(':') || !build.includes(`name = "${dep.slice(1)}"`)) {
      throw new Error(`Unsupported external/computed web_deps ${dep} in ${buildFile}`);
    }
  }
  return { name, dir, buildFile, deps: strings('deps'), nativeModules, workers: strings('web_workers') };
}

export function moduleGraph(framework: string, extra: string[] = []): WebModule[] {
  const modules = new Map<string, WebModule>();
  const visit = (dir: string) => {
    const module = readModule(dir);
    if (modules.has(module.name)) return;
    modules.set(module.name, module);
    for (const dep of module.deps) {
      const label = dep.replace(/^@valdi/, '');
      if (!label.startsWith('//')) throw new Error(`Unsupported dependency ${dep}`);
      visit(path.join(framework, label.slice(2).split(':')[0]));
    }
  };
  visit(path.join(framework, 'apps/helloworld/src/valdi/hello_world'));
  visit(path.join(framework, 'src/valdi_modules/src/valdi/web_renderer'));
  for (const dir of extra) visit(dir);
  return [...modules.values()];
}

export function nativeMappings(modules: WebModule[]): Map<string, string> {
  const mappings = new Map<string, string>();
  for (const module of modules) {
    for (const [implementation, ids] of Object.entries(module.nativeModules)) {
      if (!implementation.startsWith(`${module.name}/web/`) || !implementation.endsWith('.js')) {
        throw new Error(`Unsupported native implementation ${implementation}`);
      }
      const file = path.join(module.dir, implementation.slice(module.name.length + 1)).replace(/\.js$/, '.ts');
      if (!existsSync(file)) throw new Error(`Missing official Web implementation ${file}`);
      for (const raw of ids.split(',')) {
        const id = raw.trim();
        if (!id || (mappings.has(id) && mappings.get(id) !== file)) throw new Error(`Conflicting native ID ${id}`);
        mappings.set(id, file);
      }
    }
  }
  return mappings;
}

export function sources(dir: string, includeTests = false): string[] {
  return ts.sys.readDirectory(dir, ['.ts', '.tsx', '.js'], ['**/.valdi_build/**'])
    .filter(file => !/\/web\/(?:debug|release)\//.test(file))
    .filter(file => includeTests || !/(?:\/test\/|\.spec\.|\.test\.)/.test(file));
}

export interface SourceCompiler {
  program: ts.Program;
  emit(file: string): string;
  diagnostics(): string;
}

/** A full Program is essential: transpileModule cannot inline const enums
 * imported from upstream .d.ts files.
 */
export function createSourceCompiler(
  framework: string,
  modules: WebModule[],
  extraRoots: string[] = [],
): SourceCompiler {
  const paths: Record<string, string[]> = Object.fromEntries(modules.map(module => [`${module.name}/*`, [`${module.dir}/*`]]));
  const core = path.join(framework, 'src/valdi_modules/src/valdi/valdi_core');
  paths.tslib = [path.join(core, 'src/tslib.d.ts')];
  paths.Valdi = [path.join(core, 'src/Valdi.d.ts')];
  paths.jasmine = [path.join(framework, 'src/valdi_modules/src/valdi/jasmine/src/jasmine.d.ts')];
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10, jsx: ts.JsxEmit.Preserve,
    experimentalDecorators: true, allowJs: true, checkJs: false,
    skipLibCheck: true, strict: true, importHelpers: true,
    noEmitOnError: false, types: [], lib: ['lib.es2021.d.ts', 'lib.dom.d.ts'],
    baseUrl: framework, paths, sourceMap: false, declaration: false,
    outDir: '/__valdi_web_emit_never_written__',
  };
  const roots = modules.flatMap(module => [
    ...sources(path.join(module.dir, 'src')),
    ...sources(path.join(module.dir, 'types')),
    ...sources(path.join(module.dir, 'web')),
  ]);
  roots.push(path.join(framework, 'modules/types/Long.d.ts'), path.join(framework, 'modules/types/globals.d.ts'), ...extraRoots);
  // The native compiler normally creates this declaration along with res.js.
  // Provide the same generated input virtually: framework sources stay read-only.
  const virtual = new Map<string, string>();
  for (const module of modules) {
    const res = path.join(module.dir, 'res');
    if (!existsSync(res)) continue;
    const keys = [...new Set(readdirSync(res).flatMap(file => {
      const match = /^(.+?)(?:@[\d.]+x)?\.(png|jpe?g|webp|svg|gif)$/.exec(file);
      return match ? [match[1].replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase())] : [];
    }))];
    const filename = path.join(module.dir, 'res.d.ts');
    virtual.set(filename, `import type { Asset } from "valdi_tsx/src/Asset";\ndeclare const res: {${keys.map(key => `${JSON.stringify(key)}: Asset`).join(';')}};\nexport default res;\n`);
    roots.push(filename);
  }
  const host = ts.createCompilerHost(options);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = file => virtual.has(file) || originalFileExists(file);
  host.readFile = file => virtual.get(file) ?? originalReadFile(file);
  host.getSourceFile = (file, language, onError, fresh) => virtual.has(file)
    ? ts.createSourceFile(file, virtual.get(file)!, language)
    : originalGetSourceFile(file, language, onError, fresh);
  const program = ts.createProgram([...new Set(roots)], options, host);
  const cache = new Map<string, string>();
  const format = (diagnostics: readonly ts.Diagnostic[]) => ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => framework, getNewLine: () => '\n',
  });
  const syntax = [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics()];
  if (syntax.length) throw new Error(format(syntax));
  // Load the official companion implementation with this exact TS instance.
  // Dependencies resolve from the installed app toolchain; nothing is copied
  // into or installed in the framework checkout.
  const loadCompanion = makeProgramLoader(program, framework);
  const { JSXProcessor } = loadCompanion(path.join(framework, 'compiler/companion/src/JSXProcessor.ts'));
  const emit = (file: string) => {
    if (cache.has(file)) return cache.get(file)!;
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`File is outside the TypeScript Program: ${file}`);
    let code: string | undefined;
    const result = program.emit(source, (name, text) => {
      if (/\.jsx?$/.test(name)) code = text;
    }, undefined, false, {
      before: file.endsWith('.tsx') ? new JSXProcessor().makeTransformers(program.getTypeChecker()) : [],
    });
    if (result.emitSkipped || code === undefined) throw new Error(`Emit failed: ${file}\n${format(result.diagnostics)}`);
    cache.set(file, code);
    return code;
  };
  return { program, emit, diagnostics: () => format(program.getSemanticDiagnostics()) };
}

/** Small CommonJS evaluator for official compiler helpers and Node spec inputs.
 * Unknown imports throw; no permissive {} mocks or failed-load suppression.
 */
export function makeProgramLoader(
  program: ts.Program, framework: string, compiler?: SourceCompiler, mappings: Map<string, string> = new Map(),
) {
  const require = createRequire(import.meta.url);
  const cache = new Map<string, { exports: any }>();
  const moduleRoot = path.join(framework, 'src/valdi_modules/src/valdi');
  const resolve = (name: string, importer: string): string | undefined => {
    const base = name.startsWith('.') ? path.resolve(path.dirname(importer), name)
      : path.isAbsolute(name) ? name
      : name === 'tslib' ? path.join(moduleRoot, 'valdi_core/src/tslib')
      : path.join(moduleRoot, name);
    const id = path.relative(moduleRoot, base).split(path.sep).join('/').replace(/\.js$/, '');
    if (mappings.has(id)) return mappings.get(id);
    if (mappings.has(name)) return mappings.get(name);
    return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')]
      .find(file => existsSync(file) && /\.[cm]?[jt]sx?$/.test(file) && !file.endsWith('.d.ts'));
  };
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file)!.exports;
    const module = { exports: {} as any };
    cache.set(file, module);
    // Compiler helper TS files aren't in the app Program. Compile those in
    // their own real Program as well (not per-file transpileModule).
    let code: string;
    if (compiler && program.getSourceFile(file)) code = compiler.emit(file);
    else if (file.endsWith('.js') || file.endsWith('.cjs')) code = readFileSync(file, 'utf8');
    else {
      const helperProgram = ts.createProgram([file], {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
        esModuleInterop: true, skipLibCheck: true, types: [], outDir: '/__valdi_helper_emit_never_written__',
      });
      let output: string | undefined;
      helperProgram.emit(helperProgram.getSourceFile(file), (name, text) => { if (name.endsWith('.js')) output = text; });
      if (output === undefined) throw new Error(`Cannot emit compiler helper ${file}`);
      code = output;
    }
    const localRequire = (name: string) => {
      if (name === 'typescript') return ts;
      const resolved = resolve(name, file);
      if (resolved) return load(resolved);
      if (name.startsWith('.') || path.isAbsolute(name)) throw new Error(`Cannot resolve ${name} from ${file}`);
      return require(name);
    };
    const wrapper = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){\n${code}\n})`, { filename: file });
    wrapper(localRequire, module, module.exports, file, path.dirname(file));
    return module.exports;
  };
  return load;
}
