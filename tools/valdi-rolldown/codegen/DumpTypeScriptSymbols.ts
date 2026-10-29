// The type information native code generation starts from, as Processors/DumpTypeScriptSymbolsProcessor.swift gets it
// from the compiler's companion: each of the module's files' annotated symbols, dumped by the companion's own code
// (vendor/companion/AST.ts, called as its Workspace.dumpSymbolsWithComments does) from the module's program.
//
// The companion sees the modules in a workspace rooted at /, one directory per module, and the compiler drops that /
// from type references (TypeScriptCompilerManager.canonicalizeDumpSymbolsResponse): files are named by compilation
// path, `<module>/<path in the module>`. Here files are where they are on disk, so their compilation paths come from
// where the module's tsconfig maps the modules (its `<module>/*` paths).
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ValdiModule } from '../valdiTs';
import { AST, dumpRootNodes } from '../vendor/companion/AST';
import type { CompilationItem, DumpSymbolsWithCommentsResponseBody } from './TypeScriptAnnotation';
import type { TypeScriptItemSrc } from './Utils';

export interface TypeScriptItem {
  src: TypeScriptItemSrc;
  item: CompilationItem;
  sourceFile: ts.SourceFile;
}

export interface TypeScriptItemAndSymbols {
  typeScriptItem: TypeScriptItem;
  dumpedSymbols: DumpSymbolsWithCommentsResponseBody;
}

const real = (file: string) => (existsSync(file) ? realpathSync(file) : path.resolve(file));

/**
 * A file's compilation path, or undefined outside of every module. The module's own directories come first; the other
 * modules are found from the tsconfig's `<module>/*` paths (relative to the tsconfig, which has no baseUrl).
 */
export function compilationPathResolver(
  module: ValdiModule,
  options: ts.CompilerOptions,
): (fileName: string) => string | undefined {
  const roots: [string, string][] = [module.dir, ...module.generatedDirs].map(dir => [real(dir), module.name]);
  for (const [pattern, targets] of Object.entries(options.paths ?? {})) {
    if (!pattern.endsWith('/*')) continue;
    for (const target of targets) {
      if (target.endsWith('/*'))
        roots.push([real(path.resolve(module.dir, target.slice(0, -2))), pattern.slice(0, -2)]);
    }
  }
  return fileName => {
    const file = real(fileName);
    for (const [root, name] of roots) {
      const relative = path.relative(root, file);
      if (!relative.startsWith('..') && !path.isAbsolute(relative))
        return `${name}/${relative.split(path.sep).join('/')}`;
    }
    return undefined;
  };
}

/** Workspace.dumpSymbolsWithComments. */
function dumpSymbolsWithComments(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
): DumpSymbolsWithCommentsResponseBody {
  const references: AST.TypeReference[] = [];
  const dumpedSymbols = dumpRootNodes(sourceFile, { typeChecker, references });
  return { dumpedSymbols, references };
}

/**
 * Every source file of the module with its dumped symbols, by compilation path. A file the companion fails to dump is
 * skipped with a warning, as the compiler does (its annotations then generate nothing).
 */
export function dumpAllSymbols(
  module: ValdiModule,
  program: ts.Program,
  warn: (message: string) => void,
): TypeScriptItemAndSymbols[] {
  const compilationPath = compilationPathResolver(module, program.getCompilerOptions());
  const typeChecker = program.getTypeChecker();
  const items: TypeScriptItemAndSymbols[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    const relativeProjectPath = compilationPath(sourceFile.fileName);
    if (!relativeProjectPath?.startsWith(`${module.name}/`)) continue;
    const src = { compilationPath: relativeProjectPath, sourceURL: sourceFile.fileName };
    const item = {
      sourceURL: src.sourceURL,
      relativeProjectPath,
      relativeBundlePath: relativeProjectPath.slice(module.name.length + 1),
    };
    let dumped: DumpSymbolsWithCommentsResponseBody;
    try {
      // Through JSON, as the compiler gets it from the companion: what's undefined isn't there.
      dumped = JSON.parse(JSON.stringify(dumpSymbolsWithComments(sourceFile, typeChecker)));
    } catch (error) {
      warn(`Failed to dump symbols: ${relativeProjectPath}: ${(error as Error).message}`);
      continue;
    }
    // canonicalizeDumpSymbolsResponse: references name their file by compilation path.
    for (const reference of dumped.references) {
      reference.fileName = compilationPath(reference.fileName) ?? reference.fileName.replace(/^\//, '');
    }
    items.push({ typeScriptItem: { src, item, sourceFile }, dumpedSymbols: dumped });
  }
  return items.sort((a, b) => (a.typeScriptItem.src.compilationPath < b.typeScriptItem.src.compilationPath ? -1 : 1));
}
