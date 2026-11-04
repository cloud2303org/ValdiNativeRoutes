# Node Web entry

This directory compiles and bundles the upstream HelloWorld application with the
official `web_renderer` and `ValdiWebRuntime`. The framework checkout is read-only.
Only Node, the app's installed TypeScript/tsx/Rolldown packages, and framework
source inputs are used. No Swift compiler, toolbox, Bazel action, native build,
TGFX, or runtime replacement is involved.

Run from this worktree's `tools/valdi-rolldown` directory:

```sh
W=/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/upstream-20261104
OUT=/tmp/valdi-upstream-integration-20261104/web/attempt2
node --import tsx web/build.ts "$W" "$OUT"
node --import tsx web/test.ts "$W" "$OUT"
```

From the application root, `pnpm build:web` uses the prepared, pinned framework
and writes to this directory's ignored `.local/`. It builds the official
HelloWorld example; it does not select the application's native hardware modules.

The build command accepts `[FRAMEWORK_ROOT [OUTPUT] [API_VERSION]]`. Output is
restricted to this directory's `.local/` (the default) or a temporary
subdirectory. API version defaults to `0`, matching
`web_api_version_json` when the upstream `api_version_file` label has no files.
Pass the configured native API version explicitly when using another build.

Generated outputs:

- `dist/index.html`, `dist/bundle.js`, and `dist/bundle.js.map`: the actual browser
  application, using upstream's HTML and application entry templates.
- `package/src/<module>/...`: compiled CommonJS module sources, source
  declarations, generated native-module forwarding files, and resources.
- `package/native/<module>/web/...`: compiled official Web implementations.
- `package/src/RegisterNativeModules.js`, API version JSON, image/navigation/worker
  registries, and `web_renderer/src/_module_entry_registry.js`: bootstrap inputs.
- `build.json`: module graph, BUILD sources, native mappings, bundled inputs, and
  SHA-256 fingerprints of source inputs.
- `diagnostics.txt`: full source semantic diagnostics; a nonempty file fails the
  build.
- `renderer-tests.json`: loaded spec files, executed spec count, failures, suite
  failures, and Jasmine overall status.

Package and dist directories are replaced on each build. Test reports are kept.
The emitted package is the input to this application bundler; it is not a
complete publishable SDK with generated declarations for every `.ts` source.

## Upstream contracts

The implementation follows the Web fields of `ValdiModuleInfo` and reads actual
`valdi_module` dependency and `web_deps` declarations, rather than using the
native adapter's module allowlist. For this source graph the metadata consists
of literal attributes and local `ts_project` targets compiling `web/`. Computed
or external Web dependencies require a manifest adapter; this entry rejects
them instead of evaluating Starlark.

The relevant upstream sources are:

- `bzl/valdi/valdi_compiled.bzl`: declared Web sources, module file entries,
  declarations, resource paths, native ID overrides, and worker declarations.
- `bzl/valdi/valdi_web_package.bzl`: module/native package assembly and API
  version metadata.
- `bzl/valdi/valdi_collapse_web_paths.bzl`: canonical native destinations,
  native ID registration, and package destinations.
- `bzl/valdi/valdi_web_application.bzl` and `app_templates/`: browser application
  bootstrap and static site layout.
- Upstream commit `9b7a20d5`'s `PrependWebJsProcessor.swift`,
  `GenerateWebNativeModulePackageFilesProcessor.swift`, and
  `CollapseWebPaths.cpp`: inspected as source to retain the require transforms,
  forwarding files, and registry behavior after the old build tools' removal.
  These implementations are not restored or executed.

`compiler.ts` creates a real TypeScript Program over the complete source graph,
including official `.d.ts` inputs. It runs the framework's own
`compiler/companion/src/JSXProcessor.ts`, using the installed TypeScript instance.
This inlines declaration-only const enums such as `DeviceSystemType`; isolated
`transpileModule` would leave an invalid runtime import. Generated resource
declarations enter the Program through a virtual compiler host, without writes
to the framework.

`build.ts` performs the Web require and `module.path` rewrites with a JavaScript
AST, retaining the upstream bootstrap exclusions. BUILD-declared native IDs get
both package forwarding files and module-loader registrations. Every eligible
Web implementation is evaluated for `webPolyglotViews`, including implementations
with no explicit module IDs. Base64 maps to the real
`coreutils/web/Base64Native.ts`. Images use the largest source scale as data URLs;
bundled `.bin` entries are copied byte for byte and registered lazily.

The minimum application graph has no `web_workers`. Nonempty declarations fail
assembly; it does not claim to generate browser worker chunks. The entry also
does not implement localization compilation, SQL/protobuf code generation,
legacy Vue/CSS, arbitrary application selection, or full npm SDK declaration
generation.

## Verification

On November 4, 2026:

- Browser application source typecheck: **zero diagnostics**.
- Attempt2 Rolldown standalone IIFE: **188 bundled inputs**, **16 native ID
  mappings**, **1,141,470 bytes**, with no external chunk imports.
- All **188 module IDs** equal their real paths, with **zero duplicate realpath
  identities**. There is one bundled factory each for `Renderer` and `Component`.
- Attempt2 bundle SHA-256:
  `a4208d3dec7bdfbbfdab9560c050431a1326b75e2dc3b61d554ee48d7cc49d4e`.
- Bundle JavaScript syntax check: passed via `vm.Script`, without executing the
  application.
- **398 source fingerprints** matched after the build; the HelloWorld checker
  `.png.bin` package input matched the original bytes.
- Official renderer specs: **32 files, 442 specs, 0 failures**, checked-in
  Jasmine **4.1.1**, actual Program emission.
- Official HMR tests: **6 passed**.
- Official JSX platform tests: **7 passed**.
- Official PersistentStore Web compatibility and debugger snapshot checks:
  passed.
- The three new TypeScript entry/harness files: strict `tsc --noEmit` passed.

The parent's first browser attempt found a blank HelloWorld with
`Cannot call this outside of a onRender callback`. Its source-traced cause was
confirmed from the build manifest: ten module files, including `Renderer` and
`Component`, had both `/tmp/...` and `/private/tmp/...` IDs and were instantiated
twice. `build.ts` now creates the output directory, canonicalizes it with
`realpathSync`, and canonicalizes every custom and default-resolved input,
including generated native-module forwarding files. Noncanonical input IDs or
duplicate real paths fail the build. `build.json.moduleIdentity` records the
result.

Attempt2 is isolated under `web/attempt2/`. Both the original `web/dist/bundle.js`
and the parent's `web-browser-attempt1/bundle.js` retain SHA-256
`71e69e952e57c7fe552e398b9045ca29241824ac5bca7ed20ca2c814ce1c676e`.
Browser validation of attempt2 belongs to the parent; the Node checks above do
not establish rendered-content success.

Renderer specs supply their own DOM fakes; the harness supplies no replacement
runtime. Unknown module loads fail. The harness explicitly exits nonzero on
load/assertion errors, before Jasmine can swallow an uncaught exception, and
rejects zero executed specs and suite/global failures.

Reproduce the other official tests from this directory:

```sh
AW=/Users/cloud/.config/superpowers/worktrees/ValdiNativeRoutes/upstream-20261104
W=/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/upstream-20261104
node --test "$W/tools/valdi_web_devtools/hmr.test.js"
node "$W/src/valdi_modules/src/valdi/valdi_core/test/JSXPlatformTest.cjs" \
  "$AW/tools/valdi-rolldown/node_modules/typescript"
node --import "$AW/tools/valdi-rolldown/node_modules/tsx/dist/loader.mjs" \
  "$W/src/valdi_modules/src/valdi/persistence/web/test/PersistentStoreNativeWebTest.ts"
node node_modules/typescript/bin/tsc --noEmit --module esnext \
  --moduleResolution bundler --target es2022 --esModuleInterop \
  --skipLibCheck --strict web/compiler.ts web/build.ts web/test.ts
```

Run `JSXPlatformTest.cjs` directly: its arguments select TypeScript. With
`node --test`, Node interprets the supplied TypeScript path as another test file.

## Parent integration seams and remaining limits

The standalone Node command works now. Shared compiler/framework integration
remains outside this directory's ownership:

1. `valdi/bzl/node_compiler/adapter.bzl` rejects `enable_web` and selects the
   native-only `runtime-module.ts`. A Web adapter must provide declared source
   inputs and Web metadata, then emit the Web paths already declared by
   `ValdiModuleInfo`. Removing the rejection alone is insufficient.
2. The framework checkout has no root app-owned Node adapter binding. Its
   `collapse_web_paths` and `collapse_native_paths` implementations intentionally
   fail after toolbox removal. Connect Node package assembly there with explicit
   inputs/outputs; this standalone entry bypasses those unavailable actions.
3. A general adapter should pass evaluated `ValdiModuleInfo` manifests, including
   source declarations, generated declarations, resources, strings, Web native
   deps, module file entries, native ID overrides, and worker metadata. The
   literal BUILD reader here covers the verified HelloWorld graph only.
4. The source-preparation agent did not run a browser. The parent subsequently
   validated attempt2 in the T3 collaborative browser: eleven bootstrap checks
   passed, including visible Welcome text, Shadow DOM, callback-attribution return
   behavior, no uncaught errors or console errors, and nontransparent decoded
   resource-image canvas pixels. Its 44×44 backing canvas had zero CSS dimensions
   in this official example; this does not establish visible image layout.
   Worker execution and HMR in a browser remain unvalidated.

Upstream's `drawing/web/BitmapNative.ts` intentionally contains a stub
`decodeNativeBitmap` that returns a transparent 1×1 bitmap. HelloWorld now imports
the byte-exact bitmap example, so its browser pixels are subject to that
preexisting limitation. `encodeNativeBitmap` also returns a copy of the raw pixel
buffer rather than encoding a PNG (or another requested format). This entry
retains those official implementations and mappings unchanged. The bundled
checker bytes are verified exact; no bitmap decode, PNG encode, or full codec
parity is established. Browser bootstrap, Welcome text, Shadow DOM, and resource
image loading can be validated separately by the parent without implying that
the byte-exact bitmap example decodes correctly.
