import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { codegenModules, generateNativeCode, nativeSourceFiles } from './codegen/index';
import { appModule } from './pipeline';

test('theme consumers have exact, readonly color and numeric token fields', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-theme-types-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'consumer.ts');
  writeFileSync(file, `
import type { ThemeTokens } from 'theme_bridge/src/host';
import { color, tokens } from 'app_pages/src/components/theme';
declare const native: ThemeTokens;
const surface: string = native.light.surface;
const radius: number = native.shared.radius.card;
const name: 'surface' = color.surface;
const size: number = tokens.font.title;
// @ts-expect-error Unknown palette fields must be rejected.
native.light.sruface;
// @ts-expect-error Unknown numeric fields must be rejected.
tokens.radius.cadr;
// @ts-expect-error Unknown color identifiers must be rejected.
color.missing;
// @ts-expect-error Native numeric tokens are not strings.
const invalid: string = native.shared.space.md;
// @ts-expect-error The native token snapshot is readonly in TypeScript.
native.light.surface = '#000000';
// @ts-expect-error Shared tokens cannot be reassigned in TypeScript.
tokens.font.title = 12;
`);
  const app = appModule('app_pages');
  const configFile = path.join(app.dir, 'tsconfig.json');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, app.dir, { noEmit: true }, configFile);
  assert.deepEqual(parsed.errors, []);
  const program = ts.createProgram([file], parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});

test('real theme codegen exports nested native models without dictionary or JSON transport', () => {
  const target = codegenModules().theme_bridge;
  const code = generateNativeCode(target);
  const kotlin = [...nativeSourceFiles(target, code, 'android')].map(([, text]) => text).join('\n');
  const swift = [...nativeSourceFiles(target, code, 'ios')].map(([, text]) => text).join('\n');
  assert.match(kotlin, /light: ThemeColorTokens/);
  assert.match(kotlin, /shared: ThemeSharedTokens/);
  assert.match(kotlin, /card: Double/);
  assert.doesNotMatch(kotlin, /Map<String|Any\??/);
  assert.match(swift, /light: VRThemeColorTokens/);
  assert.match(swift, /shared: VRThemeSharedTokens/);
  assert.match(swift, /card: Double/);
  assert.doesNotMatch(swift, /\[String: Any|\[String: String/);
});
