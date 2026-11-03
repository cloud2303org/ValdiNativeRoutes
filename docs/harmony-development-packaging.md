# Harmony development module packaging

This is an opt-in JavaScript packaging path for the independent Harmony business
builder. Release remains the default. The source root is still the prepared
application pin plus the verified Harmony overlay at `.tools/harmony/upstream`.
Consumption of the maintained fork and selection of its full development runtime
are separate parent integration steps.

The native fork has linked lean release and full development for both x86_64 and
arm64-v8a. Those four strict links establish native closure. They do not establish
application selection of those libraries, debugger attachment, trace output,
hot reload, or breakpoint acceptance.

## Build selection

The API adds `BusinessBuildOptions.development?: boolean`, defaulting to `false`.
The equivalent CLI switch is the standalone flag `--development`.
All existing path options remain available.

Use dedicated, disjoint paths for every output. For example, after obtaining the
parent's business-build slot:

```sh
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs \
  tools/valdi-rolldown/harmony-business.ts \
  --development \
  --source "$PWD/.tools/harmony/upstream" \
  --out /tmp/harmony-development-packaging/rawfile \
  --stage /tmp/harmony-development-packaging/stage \
  --bindings /tmp/harmony-development-packaging/bindings
```

`--git-source DIR` optionally selects the local Git object store used to verify
the application pin, as before; it does not select a new pin. `VALDI_FORK_SOURCE`
remains the fallback Git source option. The builder validates output overlap and
verifies consumed framework inputs against the exact `VALDI_COMMIT` from
`valdi/MODULE.bazel` before clearing output directories. Files altered by the
overlay must match that overlay applied to a pristine extraction of the pin.
Changing the source directory does not exempt its contents from verification.

Output validation compares filesystem ancestry as well as lexical paths.
Existing directories are identified by `stat` device/inode pairs. Missing
directories retain their unresolved suffix below each existing ancestor, so
aliased future outputs are checked before anything is created. `realpath` is used
to resolve symlinks, while device/inode comparison also detects macOS Data-volume
aliases that `realpath` leaves as different strings. Both a symlink's placement
and its target ancestry participate in overlap checks.

Outputs may not equal, contain, or sit inside protected source/smoke directories,
and outputs must remain mutually disjoint through aliases too. Dangling links,
symlink loops, nondirectory components and inspection errors are rejected.
Unresolved names are compared conservatively after Unicode normalization and
case folding. Safe symlinked ancestors, including `/tmp`, remain usable for
dedicated disjoint outputs. Validation happens before source verification or
output writes and runs again immediately before clearing output directories.

Do not run the full builder concurrently with parent HAP generation or shared
binding work. This change's focused tests do not invoke the full business build.
They explicitly isolate their output, staging, resource generation, compiler
fixtures and binding writes under temporary directories.

## JavaScript and source maps

The output layout and module identities are unchanged: `modules/` contains
`coreutils`, `jasmine`, `source_map`, `valdi_tsx`, `valdi_core`, `client_sql`,
`valdi_http`, every enabled local application module, and `harmony_business`.
Each has a `.valdimodule` archive and `.map.json`; `valdi_api_version` remains
`0\n`. Business bootstrap, resources, tab icons, native annotation/codegen
settings and binding paths follow the existing builder.

Development application modules use `buildModule(module, plugin, false)` followed
by the existing `inlineSourceMaps` function, exactly as the current `dev.ts`
pipeline does. Native runtime modules use the existing `compileRuntimeModule`
debug path with `compilationMode: 'js'` and `cpp/debug/assets/...` output
descriptors. These descriptors select compilation behavior; on-disk archives
still go directly into the same `modules/` layout.

TypeScript-derived JavaScript carries a base64 JSON `sourceMappingURL` comment.
Map sources retain the existing `//module/path` URLs, such as
`//app_pages/src/app.ts`, including the existing `//npm/...` naming for bundled
dependencies. The builder does not alter map mappings or add wrapper offsets.
It preserves the current pipeline's `sourcesContent` policy: app bundling excludes
source text and runtime TypeScript emission does not embed it either. Original
TypeScript therefore is not promised to be embedded in these archives.
Plain JavaScript runtime inputs retain the official compiler's behavior of being
copied verbatim; no fabricated TypeScript map is attached to them.

The standalone `.map.json` files continue to use `sourceMapJson`, keyed by
`<module>/<archive-entry>.js`, with each value a JSON map string. Hash entries
cover the emitted bytes, including inline comments and resources, in the existing
sorted-entry order.

## Build-info contract

Both the complete `build-info.json` and the compact `valdi/build-info.json`
identify development payloads with:

```json
{
  "compilationMode": "js",
  "minified": false,
  "sourceMaps": "inline"
}
```

They retain the business profile, engine identity, platform, pin, module list,
bootstrap and routing metadata. They omit `hbcVersion` for development.
The complete file's `moduleProof` records `javascriptEntries`, archive `sha256`
and `diagnostics`, plus the existing local-module imports and binding paths.
Development proof rejects any wrapped HBC entry instead of labeling it as
JavaScript. It does not publish an HBC count or claim an HBC version.

Without `--development`, metadata retains its existing fields and ordering,
including `hbcVersion: 99` and per-module `hbcEntries`; no development fields
are added. Application modules still use minification, pinned HBC99 precompilation,
the original entry hash and the original archive packer. Runtime release outputs
still select `cpp/release/assets` and `js_bytecode`.

The release OTA packager and its native export/compatibility attestations are
unchanged. This flag prepares modules; it does not create a development OTA
contract or change the release OTA command.

## Focused validation and parent handoff

Run from the repository root:

```sh
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs --test \
  tools/valdi-rolldown/harmony-development-packaging.test.ts
```

The tests use the real TypeScript/Valdi/Rolldown pipeline, the official pinned
Hermes compiler, actual Valdi archives, and decoded source maps. They compare
development bytes with the current dev pipeline and verify generated-to-original
token positions, readable identifiers, preserved `debugger` statements, source
URLs, `sourcesContent`, resources and archive hashes. Release fixture archives
must equal the previous minify/precompile/hash/pack sequence byte for byte.
A lightweight isolated runtime fixture exercises actual debug/release emission,
including the official debug-only test-file selection.

Source checks use the current application pin and actual overlay and reject
modified configs, modified overlay files and untracked input paths. Native codegen
copies the actual enabled app modules and business bootstrap into isolated stage
directories, regenerates resources there, then compares actual generated C++ bytes
with frozen `.tools/harmony/business-bindings`, including the canonical
`valdi/native/generated` app bindings. This requires the parent's prepared pin
and current frozen canonical bindings to exist. Canonical outputs are only read.

The output-guard regressions call the read-only validator directly for canonical
macOS volume aliases; they never pass a canonical alias to the destructive builder.
They cover `/tmp` versus `/private/tmp`, Data-volume aliases, existing and missing
parent/child paths, symlink placement and targets, dangling links and loops.
Temporary fixture calls to the builder use deliberately incomplete source inputs
and assert an overlap error before source scanning, Git verification, compilation,
deletion or output creation. Fixture trees and canonical content stay unchanged.
The six guard tests can be run without any compiler/packaging execution:

```sh
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs --test \
  --test-name-pattern='output guard' \
  tools/valdi-rolldown/harmony-development-packaging.test.ts
```

The parent registered `harmony-development-packaging.test.ts` in the explicit
Rolldown test-file list in `scripts/project.mjs`. That file is outside this
implementation's ownership. Relevant adjacent tests for the parent's root run
are `hermes.test.ts`, `runtime-module.test.ts`, `dev-protocol.test.ts`,
`harmony-dev-transport.test.ts`, and `harmony-dev-cdp.test.ts`.

These checks establish source-mapped packaging and release compatibility for
the exercised fixtures. Actual breakpoint acceptance still requires a HAP that
selects the full development runtime, matching host/debugger settings and working
device transport. Attach the debugger, demonstrate an original TypeScript
breakpoint, inspect a mapped stack, and observe an HMR update and trace output
on that runtime before reporting those capabilities as accepted.
