Vendored from Valdi beta-0.2.1, `compiler/companion/src/`: `AST.ts`, `TSUtils.ts`, and
`ConsoleLogTransformer.ts`, used by native codegen symbol dumping and log stripping
(`../../codegen/DumpTypeScriptSymbols.ts` and `../../valdiTs.ts`). MIT, see LICENSE.

Legacy `JSXProcessor` and its JSX transform dependencies were removed when Solid 2.0 Universal
became the sole JSX frontend.

Local interoperability change: `import * as ts from 'typescript'` became `import ts from 'typescript'`,
as this tool runs as an ES module, where a CommonJS package's namespace import has no named exports.
