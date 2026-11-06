# Service modules

MMKV, permissions, Wi-Fi, NFC and AppUI are local modules under `valdi/modules/`.
Their existing Android/iOS implementations are preserved; `app_pages` remains the
consumer and imports the service modules directly. Legacy forwarding files under
`app_pages/src/` have been removed.

| Module | Responsibility | Required modules |
| --- | --- | --- |
| `mmkv` | Synchronous structured storage backed by the existing MMKV implementation | `native_common` |
| `permissions` | Permission status, request serialization and settings entry points | `native_common` |
| `wifi` | Existing Wi-Fi API, events and native hosts | `permissions`, `native_common` |
| `nfc` | Android reader/tag API; iOS retains explicit unsupported behavior | `permissions`, `native_common` |
| `app_ui` | Dialogs, pickers, feedback, media selection and native presentation controls | `native_common` |
| `native_common` | Shared data validation and TS helpers | None |

## Selection and host integration

The application selects modules through `package.json` → `valdi.modules`.
Dependencies are explicit: a reference to a disabled module is an error, rather
than an instruction to enable it automatically. Remove the corresponding TS and
native-host consumers before deselecting a service.

The five services use `nativeBuild: "host"`. Node emits their `.valdimodule` and
generated contracts; the selected Kotlin/Swift/Objective-C sources compile in the
application target. Gradle and the generated XcodeGen overlay include the selected
dependencies, resources, factories, permissions, privacy text and entitlements.
These are separate source and configuration modules, rather than five separately
linked native frameworks. Bluetooth, Calculator and WebView retain their existing
Bazel library mode. This change does not publish packages to an npm registry.

Factories retain application-scoped hosts. Android permission launchers attach to
the same host exposed to JS; Activity references detach through the existing
lifecycle. iOS AppUI receives the application's image-loader function before
module registration. Navigation ownership and image caching remain in the host.

See [custom module configuration](custom-modules.md) and the
[source-move handoff](../valdi/modules/native_common/SPLIT_INTEGRATION.md).

## Validation on November 4, 2026

App-owned wheel validation remains in `app_ui/src/wheels/schemas.ts`; common request
schemas are imported directly from `native_common/src/pickerSchemas`. AppUI also
uses that direct import instead of its redundant schema forwarding file.

The source review covered service lifetimes, registration, generated contracts,
platform declarations and conditional packaging. Corrections include unique
Swift factory filenames, compiler-checked NFC argument labels and cached Wi-Fi
factory proxies.

The complete JS suite passed: 42 root tests, 192 compiler/behavior tests, eight
service tests, five upstream rewrite tests and ten binding golden groups.
Seven module compilation tests also exercise the independent services and
Release Hermes packaging. Selection tests cover each real service independently
and reject missing dependencies; they are not disabled-service APK/IPA builds.

Simulator verification exposed an external `export *` problem: enumerating
Valdi's unloaded module proxy produced no schema exports, causing AppUI validation
to reject the login Loading call. The output plugin now requests eager exports
for star reexports in the owning chunk. The same real-ModuleLoader fixture fails
in both minification modes before the fix and passes afterward. Existing ordinary
namespace-import laziness is retained. The fix received independent source review.

Both runtime exports and complete Android/iOS Debug application builds passed
with the current module selection. The iOS simulator smoke path covers login
Loading, MMKV initialization, modal cancellation and result delivery, relaunch,
and sign-out. Its saved 29-step replay passed. Manual inspection additionally
observed the persisted home-open counter increasing from one to two across
process restart.

Android's local arm64 API 36.1 emulator also passed its saved 26-step replay,
including login Loading, MMKV, process restart and modal cancel/confirm. Its
persisted counter was manually observed increasing from one to two. The initially
selected forwarded Windows emulator could not install the APK because its package
manager service was unavailable; it is not counted as an application failure or
successful runtime test.

Native regressions passed with these boundaries:

- Android Gradle: 80 passed, nine JNI-dependent tests skipped by the ordinary JVM
  target. The separate actual-runtime JNI runner passed all 17 Promise/serializer
  tests, including those nine.
- iOS storage codec execution and eight AppUI Promise tests passed.
- iOS generated wheel-object bindings: seven passed.
- iOS Sheet/ActionSheet: the first run had one dynamic-content-resize assertion
  failure. The exact baseline suite passed 12/12, and an unchanged current-source
  rerun also passed 12/12. The initial failure is retained as an intermittent
  layout-test limitation, rather than discarded or counted as a passing attempt.

The home-page timer caused readiness-only idle warnings during the recorded
replays; all required structural conditions and modal outcomes passed. These
smoke paths do not establish complete visual or hardware acceptance.

The unsigned iOS simulator build returned to Login after relaunch; this smoke
does not certify Keychain session persistence. The flow records that observed
environment behavior. No physical Wi-Fi, NFC, camera or Bluetooth acceptance is
claimed by the module split.

Local execution logs, failed attempts and artifact hashes are retained under
the ignored `.ci/service-modules-20261104/` directory and referenced temporary
output directories. Native regression and Android emulator results are recorded
there with their exact validation boundary.

The subsequent forwarding cleanup removed 21 legacy application entry files and
AppUI's redundant schema entry. The complete JS suite, application typecheck and
canonical codegen check passed again. Actual Debug/Release module compilation
confirmed those entries are absent from both application and AppUI archives.
Native implementations and generated contracts did not change; the native and
simulator results above precede this import-only cleanup.
