import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Includes declaration imports and static import()/require(), before bundling can externalize them. */
export function assertEnabledImports(
  files: string[], modulesDirectory: string, available: string[], enabled: string[],
): void {
  const disabled = new Set(available.filter(name => !enabled.includes(name)));
  for (const file of files) {
    for (const imported of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      const name = imported.fileName.startsWith('.')
        ? path.relative(modulesDirectory, path.resolve(path.dirname(file), imported.fileName)).split(path.sep)[0]
        : imported.fileName.split('/')[0];
      if (disabled.has(name)) {
        throw new Error(`${file} imports disabled module "${name}". Enable it in package.json valdi.modules or remove the import.`);
      }
    }
  }
}
