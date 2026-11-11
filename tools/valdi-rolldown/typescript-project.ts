import path from 'node:path';
import ts from 'typescript';
import type { ValdiModule } from './valdiTs';

/** Authored runtime inputs; Node tests and tools have their own project. */
export const RUNTIME_SOURCE_PATTERNS = ['src/**/*.ts', 'src/**/*.tsx', '*.d.ts'];

export function moduleImportPaths(module: ValdiModule, paths: typeof path = path): string[] {
  return [module.dir, ...module.generatedDirs].map(directory =>
    paths.resolve(directory, '*').split(paths.sep).join('/'));
}

export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[], directory: string): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => directory,
    getNewLine: () => '\n',
  });
}

/** Read the source project used by the editor; emission settings belong to the emitter. */
export function readModuleProject(module: ValdiModule): ts.ParsedCommandLine {
  const file = path.join(module.dir, 'tsconfig.json');
  const read = ts.readConfigFile(file, ts.sys.readFile);
  if (read.error) throw new Error(formatDiagnostics([read.error], module.dir));
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, module.dir, undefined, file);
  if (config.errors.length) throw new Error(formatDiagnostics(config.errors, module.dir));
  return config;
}

/** All reachable source and declaration errors are part of the project result. */
export function projectDiagnostics(program: ts.Program, directory: string): string {
  return formatDiagnostics(ts.getPreEmitDiagnostics(program), directory);
}
