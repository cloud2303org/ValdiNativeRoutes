From Valdi beta-0.2.1 (the tag valdi/MODULE.bazel pins), `compiler/companion/src/`: the TSX transform the Valdi
compiler runs (JSXProcessor) and what it imports, and the symbol dumper its native code generation reads (AST, which
`Workspace.dumpSymbolsWithComments` calls; ../../codegen/DumpTypeScriptSymbols.ts is that wrapper). MIT, see LICENSE.

One change: `import * as ts from 'typescript'` (and `source-map`) became default imports, as this tool runs as an ES
module, where a CommonJS package's namespace import has no named exports.

source-map.d.ts is ours: source-map 0.5.7 has no types (the companion builds with @types/source-map), so files
type-checking this code under --strict reference it.
