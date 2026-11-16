import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Use the actual Web implementation and its declaration, including const-enum
// inlining. No copied implementation or prepared framework sources.
if (!process.argv[2]) throw new Error('Usage: tsx web-unicode.test.ts FRAMEWORK_ROOT');
const framework = realpathSync(process.argv[2]);
const file = path.join(framework, 'src/valdi_modules/src/valdi/coreutils/web/UnicodeNative.ts');
const source = readFileSync(file);
const program = ts.createProgram([file], {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  jsx: ts.JsxEmit.Preserve,
  experimentalDecorators: true,
  allowJs: true,
  checkJs: false,
  skipLibCheck: true,
  strict: true,
  importHelpers: true,
  noEmitOnError: true,
  types: [],
  lib: ['lib.es2021.d.ts', 'lib.dom.d.ts'],
  baseUrl: framework,
  paths: {},
  sourceMap: false,
  declaration: false,
  outDir: '/__valdi_web_emit_never_written__',
});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
  getCanonicalFileName: name => name,
  getCurrentDirectory: () => framework,
  getNewLine: () => '\n',
}));
let code: string | undefined;
const emitted = program.emit(program.getSourceFile(file), (name, text) => {
  if (name.endsWith('.js')) code = text;
});
assert(!emitted.emitSkipped && code, 'Unicode implementation did not emit');

interface Unicode {
  encodeString(str: string, encoding: number): ArrayBuffer;
  decodeIntoString(buffer: ArrayBufferLike, encoding: number): string;
}
const exports = {} as Unicode;
// Execute in this realm so instanceof ArrayBuffer checks the public contract.
vm.runInThisContext(`(function(exports) {\n${code}\n})`, { filename: file })(exports);
const { encodeString, decodeIntoString } = exports;
// Keep fixture encoding values aligned with the actual public const enum.
const UTF8 = 1, UTF16 = 2, UTF32 = 3;
const declaration = program.getSourceFile(path.join(
  framework, 'src/valdi_modules/src/valdi/coreutils/src/unicode/UnicodeNative.d.ts',
))!;
const encoding = declaration.statements.find(
  (node): node is ts.EnumDeclaration => ts.isEnumDeclaration(node) && node.name.text === 'Encoding',
)!;
assert.deepEqual(encoding.members.map(member => program.getTypeChecker().getConstantValue(member)),
  [UTF8, UTF16, UTF32]);
let checks = 0;

function encoded(str: string, encoding: number, expected: Uint8Array): ArrayBuffer {
  const buffer = encodeString(str, encoding);
  assert(buffer instanceof ArrayBuffer, `Encoding ${encoding} must return ArrayBuffer`);
  assert.equal(buffer.byteLength, expected.byteLength);
  assert.deepEqual(new Uint8Array(buffer), new Uint8Array(expected));
  checks++;
  return buffer;
}

for (const str of [
  '', 'ASCII\u0000text', 'é中', 'e\u0301', 'A😀𝄞Z',
  '\u007f\u0080\u07ff\u0800\ud7ff\ue000\uffff\u{10000}\u{10ffff}',
]) {
  for (const [encoding, nodeEncoding] of [[UTF8, 'utf8'], [UTF16, 'utf16le']] as const) {
    const buffer = encoded(str, encoding, Buffer.from(str, nodeEncoding));
    assert.equal(decodeIntoString(buffer, encoding), str);
    checks++;
  }
}

// UTF-8 replaces lone surrogates; UTF-16 preserves JS code units.
for (const str of ['\ud800', '\udfff', 'A\ud800B\udfffC']) {
  const utf8 = encoded(str, UTF8, Buffer.from(str, 'utf8'));
  assert.equal(decodeIntoString(utf8, UTF8), Buffer.from(str, 'utf8').toString('utf8'));
  const utf16 = encoded(str, UTF16, Buffer.from(str, 'utf16le'));
  assert.equal(decodeIntoString(utf16, UTF16), str);
  checks += 2;
}
encoded('', UTF32, new Uint8Array());

function decoded(bytes: number[], encoding: number, expected: string): void {
  assert.equal(decodeIntoString(Uint8Array.from(bytes).buffer, encoding), expected);
  checks++;
}

decoded([], UTF32, '');
decoded([0x41, 0, 0, 0, 0, 0xf6, 1, 0], UTF32, 'A😀');
decoded([0xff, 0xfe, 0, 0, 0, 0xf6, 1, 0], UTF32, '😀');
decoded([0, 0, 0xfe, 0xff, 0, 1, 0xf6, 0], UTF32, '😀');
decoded([0, 0xd8, 0, 0, 0, 0, 0x11, 0], UTF32, '\ufffd\ufffd');
decoded([0x41, 0, 0, 0, 0xff], UTF32, 'A');
decoded([0xff, 0xfe, 0x41, 0, 0x3d, 0xd8, 0, 0xde], UTF16, 'A😀');
decoded([0xfe, 0xff, 0, 0x41, 0xd8, 0x3d, 0xde, 0], UTF16, 'A😀');
decoded([0x41, 0, 0xff], UTF16, 'A');
decoded([0xe2, 0x82], UTF8, '\ufffd');
decoded([0xed, 0xa0, 0x80], UTF8, '\ufffd\ufffd\ufffd');
assert.throws(() => encodeString('text', 0), /Unknown encoding/);
assert.throws(() => decodeIntoString(new ArrayBuffer(0), 0), /Unknown encoding/);
checks += 2;

console.log(JSON.stringify({
  framework,
  source: file,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  typescript: ts.version,
  semanticDiagnostics: diagnostics.length,
  checks,
  status: 'passed',
}, null, 2));
