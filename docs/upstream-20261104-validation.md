# Valdi upstream integration validation - 2026-11-04

The maintained fork merges all 21 upstream commits after
`4aa98f01a46e65ead03a8fc8cc1c21e04f2a465d` through
`9b7a20d5bc690492d9fc15e0977a3fa9d1834f5e`.
The fork merge is `f5b41aed4780dab6899d74ca755acb411879a315`.
Both application Bazel workspaces and registries pin that immutable merge.
Hermes remains `260318099.0.4`; native rendering remains Skia.
The archived TGFX experiment is not merged.

## Executed checks

| Check | Observed result |
| --- | --- |
| Application tests against previous and merged framework source | Both pass: 192 pipeline tests, 8 module-split tests, binding golden groups |
| Actual upstream Jasmine source regressions in the app suite | Layout dispatcher 9, Renderer 104, ModuleLoader unload 10 pass |
| Native transport source contracts | 3/3 pass; source checks, not native runtime tests |
| All ten application modules | Debug and Release Hermes bytecode packaging pass |
| Official Web renderer Jasmine specs | 442/442 across all 32 spec files; real TS Program emission and checked-in Jasmine |
| Official HMR / JSX platform / Web persistence checks | 6 HMR, 7 JSX platform, persistence pass |
| Web source and entry typechecks | Zero semantic diagnostics; strict entry/harness typecheck passes |
| Actual T3 browser, default `pnpm build:web` output | 11/11 bootstrap checks; visible Welcome text, Shadow DOM, callback return, no uncaught or console errors |
| Android runtime export | Debug arm32, arm64, x86_64 AAR succeeds |
| iOS runtime export | Debug device arm64 and simulator arm64/x86_64 XCFramework, headers and Swift support succeed |
| Android host | Debug APK builds; installed APK and packaged runtime hashes match the produced artifacts |
| Android calculator flow | 16 pass, no failures/errors/skips |
| Android routes flow | 17 pass, no failures/errors; 9 inactive platform/sign-in branches skipped |
| iOS calculator flow | 16 pass, no failures/errors/skips |
| iOS service smoke flow | 29 pass, no failures/errors/skips; 3 idle warnings |

Android ran on the local arm64 API 36 emulator. iOS ran on the arm64 iOS 26.5
simulator with the isolated `io.valdiroutes.upstreamqa` bundle. The iOS flow
copies change only their launch bundle identifiers; every action and assertion
is preserved. Calculator checks include integer, negative and fractional native
arguments. Android also checks detail return and native picker result delivery.

Two iOS idle warnings had insufficient samples; one observed a small changing
region. Screen identity and result assertions passed. The warnings do not prove
that animations or all pixels were still. Native Release, physical devices,
remote OTA delivery, performance and power are outside this run. Release module
packaging does not imply a Release native-runtime test.

Both runtime compatibility fingerprints were checked against the final source
inputs after both platform builds. Native artifacts are generated outputs and
are not committed.

## Web entry and scope

`pnpm build:web` uses the prepared pinned source and writes
`tools/valdi-rolldown/web/.local/dist/`. It packages the official HelloWorld,
renderer, runtime, native Web mappings and generated registries. It does not
port the business application's hardware services. The maintained native Node
adapter and generic Bazel Web collapse actions remain separate integration work;
this is a bounded standalone HelloWorld entry, not a universal Web exporter.
See [the Web entry notes](../tools/valdi-rolldown/web/README.md).

The first actual browser attempt failed because `/tmp` and `/private/tmp`
produced two identities for the same Renderer. Output and every bundler input
now use canonical real paths; the successful package contains 188 inputs and
188 physical identities. Both independent Web reviews found no concrete P1/P2
issue. The separate fork-preservation review was also clean.

The resource canvas has a 44x44 backing store with 870 nontransparent pixels,
but zero CSS dimensions in the official example. This verifies loading into the
backing store, not visible image layout. Upstream BitmapNative still returns a
transparent 1x1 bitmap when decoding and raw bytes when encoding. Its byte-exact
source resource is retained, but no PNG/bitmap codec parity is claimed.
Workers, browser HMR execution and all-scene browser parity are not established.

## Artifact bindings

| Artifact | SHA-256 |
| --- | --- |
| Android runtime AAR | `7ab795223dc94d12da3d3bcdc2693f1b3da43162f85195602c8cbcc2b0a1653e` |
| Android built and installed APK | `83cd80f014f3e3dc3aef628fd79930b525022df879eb016b067e2746b0a399bf` |
| Android runtime ELF in both AAR and APK | `8226a28edb9f4282429827cd41d063fb4b907f826b43107aba84ff0a6d5ff80c` |
| Built iOS QA executable | `5158f422d8d7c3b84c0d51e415bd37381279fbce8899d1ae43d9a20e29671e00` |
| Default Web browser bundle | `ceb1023dfd8081e0c29e8bb74fb14d25bb02854e2d0a4c675ab919996dc38799` |
| Exported/staged iOS runtime ios-arm64 | `0eac549856f55e1c0de0cbe44afc6aedb4f8f8873582219465d94cf737d68188` |
| Exported/staged iOS runtime ios-arm64_x86_64-simulator | `cc793cb45ba8fea5f02d912e029a637efe7d6106f979d8bc5f5969f7a36a7565` |

Local execution records and build logs are under
`/tmp/valdi-upstream-integration-20261104/`, including
`android-app-e2e1.json`, `ios-app-e2e1.json`, both runtime export/build records,
`web-browser-default/browser-result.json`, and `web/attempt2/verification.json`.
Mobile flow summaries record the parent-observed Argent MCP output; the independent
reviews inspected supplied evidence without rerunning it.
