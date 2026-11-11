// A rolldown plugin compiling a Valdi module's .ts/.tsx as the Valdi compiler does: TypeScript with the module's
// tsconfig, Valdi's JSXProcessor on .tsx (it needs the type checker, so this is a whole program, not per-file
// transpilation) and its console transformer on everything. TypeScript emits ES modules; rolldown turns them into
// one CommonJS file per source file (pipeline.ts).
//
// Imports are resolved the way Valdi lays modules out: `<module>/…` and relative paths inside the module are bundled,
// looked up in the module's directory first and then in generated resource declarations (res.ts);
// npm packages (in `nodeModules`) are left to rolldown, which bundles them; every other module (valdi_core, …) stays
// an external require.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'rolldown';
import ts from 'typescript';
import { createConsoleLogTransformer } from './vendor/companion/ConsoleLogTransformer';
import { JSXProcessor } from './vendor/companion/JSXProcessor';
import { routeTransformer } from './routes-transform';
import { prepareStrings } from './localization';
import { formatDiagnostics, projectDiagnostics, readModuleProject } from './typescript-project';

export interface ValdiModule {
  /** The Valdi module name, the first segment of its import paths (`app_pages`). */
  name: string;
  /** The module's directory, holding tsconfig.json and src/. */
  dir: string;
  /** Directories with generated sources laid out like `dir`: res.ts (resources.ts). */
  generatedDirs: string[];
  /** Where the npm packages it imports are (only declared dependencies are there, as pnpm installs them). */
  nodeModules?: string;
  /** Explicit runtime-module inputs; ordinary app modules still discover src/. */
  sourceEntries?: string[];
  includeJavaScript?: boolean;
}

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export function sourceFiles(module: ValdiModule): string[] {
  if (module.sourceEntries) return module.sourceEntries.filter(file => !file.endsWith('.d.ts'));
  const files: string[] = [];
  // The module's own sources are src/; generated ones may sit at its root too (res.ts).
  const roots = [path.join(module.dir, 'src'), ...module.generatedDirs];
  for (const [i, root] of roots.entries()) {
    for (const file of ts.sys.readDirectory(root, ['.ts', '.tsx'], ['**/*.d.ts'])) {
      // Generated files get their place in the module's own tree; the plugin reads them from where they are.
      files.push(path.join(module.dir, path.relative(i === 0 ? module.dir : root, file)));
    }
  }
  return [...new Set(files)];
}

export interface ValdiTsPlugin extends Plugin {
  /** The file as TypeScript emits it, before rolldown (without its source map). */
  emit(file: string): string;
  emitWithMap(file: string): { code: string; map: string };
  /** Called when `file` (anywhere on disk) changed, was added or was removed: the next build reads it again. */
  invalidate(file: string): void;
  /** All source errors and emitted-file format errors, formatted; empty when there are none. */
  diagnostics(): string;
  /** The source-checking program shared with the editor: codegen reads its declarations. */
  program(): ts.Program;
  /** Release the language service when the module's compilation lifetime ends. */
  dispose(): void;
}

export function valdiTs(module: ValdiModule, moduleKind = ts.ModuleKind.ESNext, inlineRouteIcons = false): ValdiTsPlugin {
  // Generate before creating the program so imports and accessor types work on
  // the first compile, including codegen consumers that don't run build.ts.
  if (module.generatedDirs[0]) prepareStrings(module, module.generatedDirs[0]);
  /** A file's place in the module's tree → where it is on disk. */
  const located = new Map<string, string>();
  const locate = (file: string): string | undefined => {
    if (located.has(file)) return located.get(file);
    const relative = path.relative(module.dir, file);
    if (relative.startsWith('..')) return undefined;
    for (const root of [module.dir, ...module.generatedDirs]) {
      const real = path.join(root, relative);
      if (existsSync(real)) {
        located.set(file, real);
        return real;
      }
    }
    return undefined;
  };

  /** `dayjs/plugin/utc` → whether node_modules has its package. */
  const isNpm = (source: string) => {
    if (source.startsWith('.') || path.isAbsolute(source)) return false;
    const name = source.split('/').slice(0, source.startsWith('@') ? 2 : 1).join('/');
    return !!module.nodeModules && existsSync(path.join(module.nodeModules, name));
  };
  const isExternal = (source: string) =>
    !source.startsWith('.') && !path.isAbsolute(source) && !source.startsWith(`${module.name}/`) && !isNpm(source);

  // rolldown turns `import * as x` of an external into `x = __toESM(require(…))`, which reads x.__esModule and so
  // evaluates the module behind Valdi's lazy proxy on the spot (it has no option to leave the require alone). Valdi
  // modules carry __esModule anyway, so these become the plain `const x = require(…)` the Valdi compiler emits, which
  // rolldown leaves as is. An `after` transformer: TypeScript has already elided the type-only imports by then.
  const requireExternals: ts.TransformerFactory<ts.SourceFile> = context => file => {
    const factory = context.factory;
    return factory.updateSourceFile(
      file,
      file.statements.map(statement => {
        const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
        const source = ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
        if (!clause || source === undefined || !isExternal(source)) return statement;
        const name = clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? clause.namedBindings.name : undefined;
        if (!name || clause.name) return statement;
        const require = factory.createCallExpression(factory.createIdentifier('require'), undefined, [
          factory.createStringLiteral(source),
        ]);
        return factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(name, undefined, undefined, require)],
            ts.NodeFlags.Const,
          ),
        );
      }),
    );
  };

  const emitOptions: ts.CompilerOptions = {
    module: moduleKind,
    noEmit: false,
    noEmitOnError: false,
    declaration: false,
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: false,
  };
  let config = readModuleProject(module);
  /** Bumped per changed file, so the language service reads it again and keeps the rest of the program. */
  const versions = new Map<string, number>();

  let service: ts.LanguageService;
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({ ...config.options, ...emitOptions }),
    getScriptFileNames: () => config.fileNames,
    getScriptVersion: file => String(versions.get(file) ?? 0),
    getScriptSnapshot: file => {
      const text = ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => module.dir,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    // Called once per emitted file: JSXProcessor keeps per-file state (node prototypes, ids), as in Valdi's
    // Workspace.doEmitFile.
    getCustomTransformers: () => ({
      before: [
        routeTransformer(service.getProgram()!.getTypeChecker(), module, inlineRouteIcons),
        ...(emitting.endsWith('.tsx') ? new JSXProcessor().makeTransformers(service.getProgram()!.getTypeChecker()) : []),
        createConsoleLogTransformer(),
      ],
      after: [requireExternals],
    }),
  };
  // Check the authoritative project, including CommonJS import assignments in
  // framework sources. Rolldown needs ESNext emission to see module edges, while
  // runtime bootstrap emits CommonJS directly. Both use identical inputs and
  // resolution; changing the output format must not change source diagnostics.
  const registry = ts.createDocumentRegistry();
  const sourceService = ts.createLanguageService({
    ...host,
    getCompilationSettings: () => config.options,
    getCustomTransformers: undefined,
  }, registry);
  service = ts.createLanguageService(host, registry);
  let emitting = '';

  // CommonJS syntax in external framework sources is valid and is emitted by
  // that framework's compiler. Our own ESNext inputs must also satisfy the
  // emitter: otherwise TS can silently erase import assignments or export=.
  const emissionDiagnostics = (file: string) => config.options.module === moduleKind
    ? ''
    : formatDiagnostics(service.getSemanticDiagnostics(file), module.dir);

  /** The JavaScript and its source map, whose sources are relative to the file (rolldown chains it). */
  const emitWithMap = (real: string): { code: string; map: string } => {
    const diagnostics = emissionDiagnostics(real);
    if (diagnostics) throw new Error(diagnostics);
    emitting = real;
    const output = service.getEmitOutput(real);
    // jsx: preserve names .tsx output .jsx, though JSXProcessor leaves no JSX in it.
    const js = output.outputFiles.find(file => /\.jsx?$/.test(file.name));
    const map = output.outputFiles.find(file => /\.jsx?\.map$/.test(file.name));
    if (!js || !map) throw new Error(`TypeScript emitted nothing for ${real}`);
    const sourceMap = JSON.parse(map.text);
    sourceMap.sources = sourceMap.sources.map((source: string) => path.resolve(path.dirname(map.name), source));
    return { code: js.text.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'), map: JSON.stringify(sourceMap) };
  };
  const emit = (real: string) => emitWithMap(real).code;

  return {
    name: 'valdi-ts',
    emit,
    emitWithMap,

    invalidate(file) {
      versions.set(file, (versions.get(file) ?? 0) + 1);
      // A file may have been added or removed: where files are, and which ones the program has, are found again.
      located.clear();
      config = readModuleProject(module);
    },

    diagnostics() {
      const diagnostics = projectDiagnostics(sourceService.getProgram()!, module.dir);
      if (diagnostics) return diagnostics;
      return sourceFiles(module).map(file => emissionDiagnostics(locate(file)!)).join('');
    },

    program: () => sourceService.getProgram()!,

    dispose() {
      service.dispose();
      sourceService.dispose();
      located.clear();
      versions.clear();
    },

    resolveId(source, importer) {
      // npm packages, and what their files import, resolve as Node does.
      if (isNpm(source) || importer?.includes(`${path.sep}node_modules${path.sep}`)) return null;
      let relative: string;
      if (source.startsWith(`${module.name}/`)) {
        relative = source.slice(module.name.length + 1);
      } else if (source.startsWith('.') && importer) {
        relative = path.relative(module.dir, path.resolve(path.dirname(importer), source));
      } else if (path.isAbsolute(source)) {
        return source;
      } else {
        return { id: source, external: true };
      }
      for (const extension of ['', ...EXTENSIONS, ...(module.includeJavaScript ? ['.js', '/index.js'] : [])]) {
        const file = path.join(module.dir, relative + extension);
        if ((/\.tsx?$/.test(file) || (module.includeJavaScript && file.endsWith('.js'))) && locate(file)) return file;
      }
      // Not a TypeScript source of the module: left to Valdi's loader at run time.
      // The loader's names are Valdi's, forward-slashed, on every host.
      return { id: `${module.name}/${relative.split(path.sep).join('/')}`, external: true };
    },

    load(id) {
      const real = locate(id);
      return real ? readFileSync(real, 'utf8') : null;
    },

    transform(_code, id) {
      const real = /\.tsx?$/.test(id) ? locate(id) : undefined;
      return real ? { ...emitWithMap(real), moduleType: 'js' } : null;
    },
  };
}
