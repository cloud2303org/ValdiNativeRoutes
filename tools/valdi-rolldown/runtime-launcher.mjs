// Bazel entry point: avoid tsx's shell/CLI process and ambient tsconfig lookup.
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';

const manifest = path.resolve(process.argv[2]);
const scratch = `${manifest}.tmp`;
mkdirSync(scratch, { recursive: true });
process.env.TMPDIR = scratch;
process.env.TMP = scratch;
process.env.TEMP = scratch;
try {
  const { compileRuntimeModule } = await tsImport('./runtime-module.ts', {
    parentURL: import.meta.url,
    tsconfig: false,
  });
  await compileRuntimeModule(JSON.parse(readFileSync(manifest, 'utf8')));
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
