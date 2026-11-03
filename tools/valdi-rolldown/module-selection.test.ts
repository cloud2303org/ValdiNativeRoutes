import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertEnabledImports } from './module-selection';

test('disabled module imports fail for source, declarations, re-exports, require and dynamic imports', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-selection-imports-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'app_pages/src');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.d.ts');
  for (const source of [
    "import type { Host } from 'bluetooth/src/Host';",
    "export * from 'bluetooth/src/index';",
    "const p = import('bluetooth/src/index');",
    "const p = require('bluetooth/src/index');",
    "import { x } from '../../bluetooth/src/index';",
  ]) {
    writeFileSync(file, source);
    assert.throws(() => assertEnabledImports([file], root, ['app_pages', 'bluetooth'], ['app_pages']), /disabled module "bluetooth"/);
    assert.doesNotThrow(() => assertEnabledImports([file], root, ['app_pages', 'bluetooth'], ['app_pages', 'bluetooth']));
  }
  writeFileSync(file, "// import x from 'bluetooth/src/index';\nimport x from 'dayjs';");
  assert.doesNotThrow(() => assertEnabledImports([file], root, ['app_pages', 'bluetooth'], ['app_pages']));
});
