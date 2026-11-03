// Use the existing Node compiler's annotation/schema/codegen pipeline unchanged.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateNativeCode, nativeSourceFiles, VALDI_PROJECT_CONFIG } from '../../tools/valdi-rolldown/codegen/index';

const require = createRequire(new URL('../../tools/valdi-rolldown/package.json', import.meta.url));
const ts = require('typescript') as typeof import('../../tools/valdi-rolldown/node_modules/typescript');
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: generate-bindings.ts PINNED_SOURCE OUTPUT');
const dir = path.join(source, 'src/valdi_modules/src/valdi/client_sql');
const input = path.join(dir, 'src/ClientSQLNative.d.ts');
const target = {
  module: { name: 'client_sql', dir, generatedDirs: [] },
  bundleInfo: {
    ...VALDI_PROJECT_CONFIG,
    name: 'client_sql',
    iosModuleName: 'SCCClientSQL',
    iosLanguage: 'objc' as const,
    asyncStrictMode: false,
  },
  program: () => {
    const program = ts.createProgram([input], {
      strict: true, noEmit: true, target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS, skipLibCheck: true, types: [],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n', getCanonicalFileName: file => file,
    }));
    return program;
  },
};
const code = generateNativeCode(target, message => { throw new Error(message); });
const files = nativeSourceFiles(target, code, 'cpp');
for (const name of ['valdi_modules/client_sql/client_sql.hpp', 'valdi_modules/client_sql/client_sql.cpp']) {
  const content = files.get(name);
  if (!content) throw new Error(`Node codegen did not produce ${name}`);
  const destination = path.join(output, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  let previous;
  try { previous = readFileSync(destination, 'utf8'); } catch {}
  if (previous !== content) writeFileSync(destination, content);
  console.log(destination);
}
