Vendored from Valdi beta-0.2.1, `compiler/companion/src/`: the TSX transform (JSXProcessor) and its dependencies,
and the symbol dumper used by native code generation (AST, called by `Workspace.dumpSymbolsWithComments`;
../../codegen/DumpTypeScriptSymbols.ts is our wrapper). MIT, see LICENSE.

JSXProcessor.ts is updated to official upstream/main commit 4aa98f01a46e65ead03a8fc8cc1c21e04f2a465d.
It emits factory-aware renderer calls for normal and lazy custom views and rejects viewFactory combined with
platform view classes (iOS, Android, macOS, Linux, or web). The other companion sources, including AST, retain
the beta-0.2.1 baseline; this is not a wholesale AST update. The project runtime must provide the matching
factory-aware JSX renderer methods.

Local interoperability change: `import * as ts from 'typescript'` (and `source-map`) became default imports,
as this tool runs as an ES module, where a CommonJS package's namespace import has no named exports.
JSXProcessor otherwise matches the upstream file exactly.

source-map.d.ts is ours: source-map 0.5.7 has no types (the companion builds with @types/source-map), so files
type-checking this code under --strict reference it.

../../jsx-upstream.test.ts compiles real TSX fixtures with valdiTs and buildModule through Rolldown and executes
the emitted JavaScript against a renderer call recorder. Runtime types come from VALDI_SOURCE_ROOT first,
then the project's prepared/discovered Valdi source checkout. These tests
cover the generated renderer call contract, not native factory marshalling or device rendering.
