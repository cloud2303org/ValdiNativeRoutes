# Native Windows Android builds

The supported Windows entry point is PowerShell. It runs the native Windows
executables directly and uses Git Bash only for the repository's portable
`scripts/export-android.sh` entry point. It does not use WSL, Docker, Linux, or
macOS.

## Prerequisites

- Windows 10 or later with PowerShell 5.1 or newer.
- Node 24 and the repository's pinned pnpm (`pnpm install` from the root).
- Bazel 8.2.1. Pass `-BazelPath C:\path\to\bazel.exe` when it is not on `PATH`.
- Git for Windows (Git Bash is the only shell helper).
- Android SDK with NDK `27.1.12297006` and CMake `3.22.1`.
- A JDK that can run Gradle and Bazel. The project's Bazel toolchain remains
  pinned to Java 17; the host JDK is discovered from `JAVA_HOME` or `javac.exe`,
  or can be supplied explicitly with `-JavaHome`.

No Administrator-level system change is needed. The scripts only write to the
repository, Gradle/Bazel caches, and the Android SDK build directories.

## Full build

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File scripts/windows/build-android.ps1
```

This exports the three-ABI Valdi runtime AAR, prepares the Android arm64
OpenCV/ncnn libraries when they are missing, builds the custom Bazel-backed
modules, and assembles the Debug APK with `gradlew.bat`. The Gradle pipeline's
TypeScript tasks invoke pnpm through `scripts/pnpm.mjs`, which uses Node and the
bundled Corepack launcher instead of spawning a `.cmd` shim.

The complete Windows entry point is Debug-only, matching `pnpm build:android`.
Release runtime export remains available through `export-android.ps1 -Config release`.

Use `-SkipRuntimeExport` when the runtime and its fingerprint are already
current. Use `-SkipVisionPrepare` to reuse an existing vision build.

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Runtime export only

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/export-android.ps1 `
  -Config debug `
  -BazelPath C:\path\to\bazel.exe `
  -Distdir C:\path\to\distdir
```

The output defaults to `android/app/libs/valdi_runtime.aar`.

For staged validation against an unpushed Valdi feature checkout, pass
`-ValdiCheckout C:\path\to\Valdi`. The wrapper writes ignored
`valdi/win.local.bazelrc` and `module-build/win.local.bazelrc` files with the
feature registry and explicit Bazel `--override_module` flags for Valdi and its
internal modules. It is a validation-only option; committed builds use the
immutable commit and registry URL pinned in `valdi/MODULE.bazel` and
`module-build/MODULE.bazel`.

The default Bazel output root is `C:/b` to keep Android AAPT2
resource paths below the legacy Windows `MAX_PATH` limit. Use
`-OutputBase C:\short-path` to choose another short directory.
The wrapper reuses the default user Bazel repository cache when present; pass
`-RepositoryCache C:\path\to\cache\repos\v1` to point at another cache.
For offline Go repository fetches, pass `-GoModCache C:\path\to\gomodcache`;
the wrapper then sets `GOPROXY=off`. `-Distdir` is forwarded to Bazel, but
pinned Valdi module archives must also be reachable or already present in the
repository cache when the URL has no fixed checksum.

## Verification

The export writes `android/app/libs/valdi_ota.json`. Gradle's
`valdiCodegenCheck` runs `node scripts/ota.mjs check-export android
android/app/libs/valdi_ota.json` before packaging. To inspect the runtime
action graph without launching a second build:

```powershell
cd valdi
bazel aquery "deps(//:valdi_runtime_android)" `
  --snap_flavor=platform_development --config=stable_exec `
  --copt=-DANDROID_WITH_JNI --repo_env=VALDI_PLATFORM_DEPENDENCIES=android `
  --define client_repo_arm32=true --define client_repo_arm64=true `
  --define client_repo_x86_64=true `
  --android_platforms=@snap_platforms//os:android_arm32,@snap_platforms//os:android_arm64,@snap_platforms//os:android_x86_64 `
  --output=jsonproto --noinclude_artifacts --noinclude_commandline `
  > ..\runtime-actions.json
cd ..
node scripts/verify-runtime-actions.mjs runtime-actions.json
```
