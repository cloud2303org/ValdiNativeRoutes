// A rolldown plugin compiling a Valdi module's .ts/.tsx as the Valdi compiler does: TypeScript with the module's
// tsconfig, Valdi's JSXProcessor on .tsx (it needs the type checker, so this is a whole program, not per-file
// transpilation) and its console transformer on everything. TypeScript emits ES modules; rolldown turns them into
// one CommonJS file per source file (pipeline.ts).
//
// Imports are resolved the way Valdi lays modules out: `<module>/…` and relative paths inside the module are bundled,
// looked up in the module's directory first and then in the compiler's generated TypeScript (client_sql's sqlgen);
// npm packages (in `nodeModules`) are left to rolldown, which bundles them; every other module (valdi_core, …) stays
// an external require.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'rolldown';
import ts from 'typescript';
import { createConsoleLogTransformer } from './vendor/companion/ConsoleLogTransformer';
import { JSXProcessor } from './vendor/companion/JSXProcessor';

export interface ValdiModule {
  /** The Valdi module name, the first segment of its import paths (`app_pages`). */
  name: string;
  /** The module's directory, holding tsconfig.json and src/. */
  dir: string;
  /** Directories with generated sources laid out like `dir`: res.ts (resources.ts), src/sqlgen (sqlgen.ts). */
  generatedDirs: string[];
  /** Where the npm packages it imports are (only declared dependencies are there, as pnpm installs them). */
  nodeModules?: string;
}

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export function sourceFiles(module: ValdiModule): string[] {
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
  /** Called when `file` (anywhere on disk) changed, was added or was removed: the next build reads it again. */
  invalidate(file: string): void;
  /** The module's type errors, formatted; empty when there are none. */
  diagnostics(): string;
  /** The module's program, as the plugin compiles it: codegen reads its declarations. */
  program(): ts.Program;
}

export function valdiTs(module: ValdiModule, moduleKind = ts.ModuleKind.ESNext): ValdiTsPlugin {
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

  const configPath = path.join(module.dir, 'tsconfig.json');
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath, ts.sys.readFile).config,
    ts.sys,
    module.dir,
    {
      module: moduleKind,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      noEmit: false,
      noEmitOnError: false,
      declaration: false,
      sourceMap: true,
      inlineSourceMap: false,
      inlineSources: false,
    },
    configPath,
  );
  // `<module>/…` imports also find the generated files (tsconfig.json only knows the compiler's).
  const key = `${module.name}/*`;
  const paths = { ...config.options.paths };
  paths[key] = [...(paths[key] ?? []), ...module.generatedDirs.map(dir => `${dir}/*`)];
  config.options.paths = paths;
  // `import dayjs from 'dayjs'` of a CommonJS package's `export =`, which rolldown's interop gives as the default.
  config.options.allowSyntheticDefaultImports = true;
  const findRootNames = () => [...new Set([...config.fileNames, ...sourceFiles(module).map(file => locate(file)!)])];
  let rootNames = findRootNames();
  /** Bumped per changed file, so the language service reads it again and keeps the rest of the program. */
  const versions = new Map<string, number>();

  let service: ts.LanguageService;
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => config.options,
    getScriptFileNames: () => rootNames,
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
        ...(emitting.endsWith('.tsx') ? new JSXProcessor().makeTransformers(service.getProgram()!.getTypeChecker()) : []),
        createConsoleLogTransformer(),
      ],
      after: [requireExternals],
    }),
  };
  service = ts.createLanguageService(host, ts.createDocumentRegistry());
  let emitting = '';

  /** The JavaScript and its source map, whose sources are relative to the file (rolldown chains it). */
  const emitWithMap = (real: string): { code: string; map: string } => {
    emitting = real;
    const output = service.getEmitOutput(real);
    // jsx: preserve names .tsx output .jsx, though JSXProcessor leaves no JSX in it.
    const js = output.outputFiles.find(file => /\.jsx?$/.test(file.name));
    const map = output.outputFiles.find(file => /\.jsx?\.map$/.test(file.name));
    if (!js || !map) throw new Error(`TypeScript emitted nothing for ${real}`);
    return { code: js.text.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'), map: map.text };
  };
  const emit = (real: string) => emitWithMap(real).code;

  return {
    name: 'valdi-ts',
    emit,

    invalidate(file) {
      versions.set(file, (versions.get(file) ?? 0) + 1);
      // A file may have been added or removed: where files are, and which ones the program has, are found again.
      located.clear();
      rootNames = findRootNames();
    },

    diagnostics() {
      const program = service.getProgram()!;
      const roots = [module.dir, ...module.generatedDirs];
      const own = program.getSourceFiles().filter(file => roots.some(root => !path.relative(root, file.fileName).startsWith('..')));
      const found = [...program.getOptionsDiagnostics(), ...own.flatMap(file => [
        ...program.getSyntacticDiagnostics(file),
        ...program.getSemanticDiagnostics(file),
      ])];
      return ts.formatDiagnosticsWithColorAndContext(found, {
        getCanonicalFileName: file => file,
        getCurrentDirectory: () => module.dir,
        getNewLine: () => '\n',
      });
    },

    program: () => service.getProgram()!,

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
      for (const extension of ['', ...EXTENSIONS]) {
        const file = path.join(module.dir, relative + extension);
        if (/\.tsx?$/.test(file) && locate(file)) return file;
      }
      // Not a TypeScript source of the module: left to Valdi's loader at run time.
      return { id: `${module.name}/${relative}`, external: true };
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
