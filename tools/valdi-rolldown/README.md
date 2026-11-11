# Valdi module resources

For the native bindings (Kotlin, Objective-C and C++, checked against Valdi's compiler goldens with
`npx tsx codegen/goldens.ts`), see the repository README's “构建” and “C++ 绑定” sections.

The build and dev server generate `app_pages/res` from the files directly inside
`valdi/modules/app_pages/res/`. Image metadata/conversion uses prebuilt `sharp`; density sizes, resource names and the asset catalog stay compatible.
Android emits WebP at quality 75; iOS keeps matching PNG variants and palette-encodes converted PNGs.
Mitchell sampling follows the old Skia resize path; encoder output is not required to be byte-identical.

Release uses the pinned official `hermes-compiler` package. `hermes.ts` checks it against the Hermes version in the pinned Valdi fork,
wraps each CommonJS module as Valdi expects, invokes hermesc, and prepends the Valdi header. A changed upstream
wrapper/header fails explicitly. Run `pnpm test` at the root for image, compiler/protocol and binding golden checks.
The application build/dev server does not need the Valdi toolbox.

## Runtime TypeScript projects

Run `pnpm typecheck` at the repository root to check the Node tools and every
enabled runtime module. `pnpm test` runs the same checks before the test suites.
`pnpm tsconfig` prepares both resource declarations and localized Strings before
writing editor configs. Generated APIs use canonical imports such as
`app_pages/res` and `app_pages/src/Strings`; authored sources can use relative imports.

The editor, runtime checker and build plugin read the same module tsconfig,
aliases and roots: `src/**/*.ts`, `src/**/*.tsx`, module-root declarations and
that module's generated TypeScript. Node tests have separate projects. All
reachable sources and declarations are checked, including imported siblings and
npm declarations; no ownership filter or `skipLibCheck` hides their errors.

Source checking uses Valdi's CommonJS module profile, which supports framework
`import = require(...)` declarations. A separate language service shares the
same inputs and resolution and changes emission settings for Rolldown's ESNext
input. The runtime checker and build also check each emitted file against that
output format: bundled sources use ES module imports/exports; `import = require`
and `export =` fail with TypeScript's format diagnostics before emission.
Runtime bootstrap emits CommonJS directly and supports those constructs.
All reachable source errors remain checked regardless of emission ownership.
Type errors stop bundling before an archive is published.

Archive hashing is shared by application, staged-module and runtime builds.
The dev connection uses the tested packet reader for framing. The retired
`--compare`, `codegen/compare.ts` and OTA `module-bindings.ts` commands have been
removed; native binding goldens remain part of `pnpm test`.

## Node TypeScript projects

Install this package with `pnpm --dir tools/valdi-rolldown install --frozen-lockfile`,
then run `pnpm --dir tools/valdi-rolldown typecheck` from the repository root.
The command checks all three Node projects and returns a failure if any project
has diagnostics:

- `tsconfig.json` owns the tool TypeScript sources, code generators and vendored
  companion sources. `modules.mjs` and `typecheck-node.mjs` opt into JavaScript
  checking with `@ts-check`; imported repository JavaScript retains its inferred
  types without opting the entire `scripts/` tree into checking.
- `tsconfig.tests.json` owns every tool `*.test.ts` and `*.test.mts`. The navigation
  tests import real runtime TypeScript. Both `pnpm tsconfig` and the Node checker
  generate ignored `.gen/tsconfig.framework.json`, which this project also
  extends, mapping `valdi_core/*` to the same prepared sources as the pipeline:
  `VALDI_SOURCE_ROOT` first, then `valdi/.valdi-sources/external/valdi+`,
  `valdi/bazel-valdi/external/valdi+`, and other `valdi/bazel-*` source trees.
  This also honors the source selected by `pnpm test --valdi <directory>`.
  After changing that selection, rerun `pnpm tsconfig` with the same environment
  to refresh editor paths. Without prepared sources, setup writes an empty mapping
  and retains the bootstrap status; checking still reports unresolved framework
  imports. There is no replacement declaration for the native device API.
- `../../valdi/modules/native_common/tests/tsconfig.json` owns the existing Node
  tests at their original location. It inherits the Node options directly from
  the tool project, rather than the enclosing module's Valdi runtime config,
  and resolves Node declarations from this package.

Each project uses strict checking, `noEmit`, ES2022 libraries, ESNext modules,
Bundler resolution and Node types. Dependency declarations are checked too.
To check one project directly, use
`node tools/valdi-rolldown/node_modules/typescript/lib/tsc.js --project <config>`.

Both the application and tooling packages pin `typescript` to **5.9.3**.
Runtime checking, Valdi transformations, native code generation and Node checking
use that version; there is no separate checker alias. Keep the runtime and Node
project environments separate. Type checking does not execute tests; use the
repository's `pnpm test` command for the existing test suites.

## Custom fonts

Place a `.ttf` file in that directory, for example `brand_regular.ttf`:

```tsx
import res from 'app_pages/res';

// Inside a Valdi component's onRender():
<label value="Hello" font={res.brandRegular(18)} />;
```

Font filenames may contain ASCII letters, digits, underscores and hyphens. Names
are normalized using Valdi's snake-case convention (`Brand-Regular.ttf` becomes
`brand_regular.ttf`), then exposed in camelCase (`brandRegular`). Fonts and images
must have distinct generated property names; conflicting names fail the build.
Only `.ttf` is supported, matching the current native runtime's module font loaders.

The generated `res.ts` declares a `(size: number) => string` method per font.
`res.assetcatalog` contains font entries with type 2 and zero width/height. The
font bytes are stored as `res/<normalized_name>.ttf` inside `app_pages.valdimodule`,
where both Android and iOS read them. No extra native font registration is needed.
Release compilation preserves the font bytes; module-based OTA packages include
them with the module.

The dev server watches `res/`, regenerates the catalog and TypeScript references,
and sends changed font files. Restart the app after replacing an already-used
font: platform font caches are not explicitly invalidated by this tooling.

Each weight should be supplied as its own font file, referenced through its own
generated method. The font must contain the glyphs needed by the UI; for example,
a Latin-only font does not supply Chinese glyphs.
