# Application identity

`package.json` is the source of application identity for Android, iOS, the build
CLI and new native modules:

```json
{
  "valdi": {
    "app": {
      "name": "ValdiRoutes",
      "displayName": "Valdi 路由",
      "icon": "assets/app-icon.png",
      "android": { "applicationId": "io.valdiroutes.app" },
      "ios": { "bundleIdentifier": "io.valdiroutes.app" },
      "native": {
        "androidNamespace": "io.valdiroutes.app",
        "iosPrefix": "VR"
      }
    },
    "modules": ["app_pages", "native_common"]
  }
}
```

The module list above is illustrative; retain the enabled modules required by
your application's imports and host implementations.

`app_vision` uses `nativeBuild: "cpp"`: its generated Polyglot C++ bindings,
adapter, VisionCore and static OpenCV/ncnn dependencies are linked into
ValdiRuntime. Adding or removing an enabled cpp module requires a manual runtime
export and an App rebuild. The same applies to linked C++ or vendor changes;
TS page edits continue to use normal hot reload. A normal App build does not
refresh the runtime or run cpp-mode `nativeDependencies` hooks. Those hooks run
only during explicit runtime exports; host-mode hooks remain in normal builds.
See [Vision build and packaging](vision-build.md) for platform cache requirements.

## Editable application identity

- `name` is a plain identifier used for the Android project name and iOS project,
  target, scheme, product and Swift product module name.
- `displayName` is the launcher name on both platforms. Unicode and XML
  punctuation are supported. Control characters and Xcode `$(...)` / `${...}` substitutions
  are rejected.
- `icon` is the optional repository-relative path to a square 1024-by-1024 PNG.
  This app uses `assets/app-icon.png` as the single source for both launcher
  icons and SplashScreen. Replace that PNG and run the normal native build;
  platform sizes and asset catalogs are generated automatically.
- `android.applicationId` is the installed Android package ID.
- `ios.bundleIdentifier` is the installed Apple bundle ID.

Changing an installation ID creates a different application with its own storage
and signing/provisioning identity. It does not migrate an installed application's
data. Keep the current IDs to update the existing app in place.

`scripts/app-config.mjs` validates the configuration before generating any files.
Missing fields, unknown keys, invalid identifiers and reserved native names fail
with an explicit error.

## Stable native code identity

`native.androidNamespace` is the namespace of the host's Kotlin code and generated
Android resources. It is separate from `applicationId`. Existing source packages,
JNI names and explicit native class declarations must continue to agree with it.

`native.iosPrefix` supplies the default prefix for **new** native module
implementations created with `pnpm new-module`. The Android module package is
`<androidNamespace>.modules.<module_id>`. The new module records its names in its
own metadata and source declarations; existing modules are never renamed.

These fields are initialization defaults, not a command for rewriting all native
source. The current host source folders and existing native interfaces retain
their names. Creating an entirely new host namespace will require the later
project-template initialization step, or an explicit native source refactor.

## Build and generation

```sh
node scripts/app-config.mjs read --json
# First install dependencies and manually export the required runtime (see README).
pnpm build:android
pnpm build:ios
```

Android Gradle reads the shared configuration directly and generates the launcher
string resource. Both the Gradle wrapper and the root CLI use the same identity.

For a manually opened Xcode project, generate it from the repository root:

```sh
node scripts/ios-project.mjs
open ios/ValdiRoutes.xcodeproj
```

Use `<name>.xcodeproj` when `name` differs. `pnpm build:ios` does this generation
automatically. The wrapper sets XcodeGen's `VALDI_APP_NAME` environment variable
from the validated configuration and refreshes the selected-module overlay and
application identity overlay. Calling `xcodegen generate` directly without that
environment is not the supported generation entry point.

Generated files remain ignored:

- `android/app/build/generated/valdi-app/res/values/valdi_app.xml`
- `ios/Generated/App.yml`
- `ios/Generated/AppAssets.xcassets/`
- `ios/Generated/Modules.yml`
- `ios/Generated/AppInfo.plist`

The checked-in base plist and native source files are not rewritten on generation.
The CLI obtains package IDs and output paths from the shared reader rather than
parsing Gradle or YAML with regular expressions.

`scripts/e2e.sh` stages the project's recorded flows and baselines under ignored
`.argent/generated/`, rebinding recorded application launches and native tool
application IDs to the selected platform's current configuration. Sibling
fragments and nested test calls use the staged tree. Source recordings and their
baselines are retained unchanged; baseline updates during a staged run apply to
that generated tree. Direct `argent e2e run` calls still use the IDs in the source
recording. Historical flows explicitly targeting a different QA application are
not relabeled as the configured app.

## OTA compatibility

Application identity and icons belong to the native installation. Icon or identity
changes require a new native build; they are not delivered by a JS-only OTA.
OTA targets the publisher-selected platform and application version without
source fingerprint checks or compatibility records. The publisher is responsible
for native API compatibility. Identity or icon changes alone do not require
recompiling the Valdi runtime.

Application session state and its persistence policy are app-owned. The demo
uses an in-memory Zustand store and has no native token-storage service.
OTA remains the existing host Kotlin/Swift client plus host C codec linkage;
the Vision selection does not migrate OTA into ValdiRuntime.
