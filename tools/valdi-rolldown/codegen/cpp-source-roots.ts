import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { CodegenModule } from './index';
import { valdiTs } from '../valdiTs';

/** Validate eagerly, before the CLI can synchronize any output. Only module C++ uses this target. */
export function cppSourceRootTarget(target: CodegenModule, roots: unknown): CodegenModule {
  if (roots === undefined) return target;
  const label = `${target.module.name}: cppSourceRoots`;
  if (!Array.isArray(roots) || !roots.length) {
    throw new Error(`${label} must be a non-empty array of module-relative TypeScript files`);
  }
  const moduleDirectory = realpathSync(target.module.dir);
  const inside = (directory: string, file: string) => {
    const relative = path.relative(directory, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const rootNames = roots.map(value => {
    if (typeof value !== 'string' || !value.trim() || /[\\\0]/.test(value) ||
        path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || !/\.tsx?$/.test(value)) {
      throw new Error(`${label}: invalid module-relative TypeScript file ${JSON.stringify(value)}`);
    }
    const file = path.resolve(target.module.dir, value);
    if (!inside(path.resolve(target.module.dir), file)) {
      throw new Error(`${label}: file must stay inside the module: ${value}`);
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`${label}: missing TypeScript file: ${value}`);
    }
    if (!inside(moduleDirectory, realpathSync(file))) {
      throw new Error(`${label}: file must stay inside the module: ${value}`);
    }
    return file;
  });
  return {
    ...target,
    program: () => {
      // Reuse the normal program's compiler options, including tsconfig paths, generated paths,
      // ambient types and module resolution. Imports are followed normally from the selected files.
      const fullProgram = target.program ? target.program() : valdiTs(target.module).program();
      const host = ts.createCompilerHost(fullProgram.getCompilerOptions());
      host.getCurrentDirectory = () => target.module.dir;
      return ts.createProgram({
        rootNames: [...new Set(rootNames)],
        options: fullProgram.getCompilerOptions(),
        projectReferences: fullProgram.getProjectReferences(),
        host,
      });
    },
  };
}
