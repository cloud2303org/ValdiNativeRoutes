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
- Git for Windows. Bazel uses its `bash.exe` (`-GitBash` overrides the
  Program Files default, and paths with spaces are supported).

No Administrator-level system change is needed. The scripts only write to the
repository, Gradle/Bazel caches, and the Android SDK build directories.

## Full build

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File scripts/windows/build-android.ps1
```

The cross-platform unified entry points work here too: `pnpm prebuild --platform android` prepares the
fingerprint-selected artifacts, and `pnpm android [--device <serial>] [--no-install] [--no-launch]` runs prebuild,
the Gradle build, and installs/launches on an emulator (a physical phone only when named with `--device`). The
PowerShell script remains the Windows-specific implementation the Node dispatcher and CI call; it is the full
bootstrap path described below.

This exports the three-ABI Valdi runtime AAR, prepares the Android arm64
OpenCV/ncnn libraries when they are missing, builds the custom Bazel-backed
modules, and assembles the Debug APK with `gradlew.bat`. The Gradle pipeline's
TypeScript tasks invoke pnpm through `scripts/pnpm.mjs`, which uses Node and the
bundled Corepack launcher instead of spawning a `.cmd` shim.

`build-android.ps1` is the full entry point: it verifies every prerequisite, runs
`pnpm install --frozen-lockfile` itself when the three dependency trees are missing,
exports the runtime, prepares Vision, builds the Bazel-backed modules and assembles
the APK. A new computer needs this one command plus the preinstalled tools; it does
not need a previous export, APK or Maven seed. `pnpm build:android` is the daily
entry point: it checks an existing export and fails with the
`sh scripts/export-android.sh` instruction when the Valdi pin/toolchain or
`valdi/native` changed, instead of exporting silently.

The complete Windows entry point is Debug-only, matching `pnpm build:android`.
Release runtime export remains available through `export-android.ps1 -Config release`.

Use `-SkipRuntimeExport` when the runtime and its fingerprint are already
current. Use `-SkipVisionPrepare` to reuse an existing vision build.

## What is preinstalled and what is downloaded

Preinstalled tools are prerequisites and are never downloaded by these scripts:

- Windows 10+ with PowerShell 5.1, Git for Windows (Git Bash) and `System32\tar.exe`.
- Node 24 with the pinned pnpm launcher (`package.json` `packageManager`, the Corepack `pnpm.js` or `pnpm.cjs`).
- Bazel 8.2.1, verified against `valdi/.bazelversion`.
- JDK 17 or newer (CI uses Temurin 17; `-JavaHome` selects it explicitly).
- Android SDK with `platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`.
- CMake and Ninja for the Vision preparation (`-Cmake` selects a CMake; the SDK's 3.22.1 is the default) and
  `curl.exe`.

Everything else is fetched online from committed pins and lockfiles: pnpm packages (`pnpm-lock.yaml`), Valdi fork
sources/registry (`valdi/MODULE.bazel` + `MODULE.bazel.lock`), Bazel modules (BCR and the fork registry), Maven
artifacts (Aliyun Central mirror first, then `dl.google.com`), Gradle plugins/dependencies (`GRADLE_USER_HOME`),
the Gradle distribution, the Go modules used by Bazel, and the OpenCV/ncnn archives (`vision/vendor-lock.json`,
checksum-verified) that are compiled from source.

Nearly all of this goes through HTTP(S). When the host needs a proxy, pass it explicitly; nothing assumes a
particular local listener:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/build-android.ps1 `
  -ProxyUrl http://proxy.example:8080 -NoProxy "repo1.maven.org,dl.google.com,maven.google.com"
```

`-ProxyUrl` sets `HTTPS_PROXY`/`HTTP_PROXY` and Git's `http.https://github.com/.proxy` for the build processes
only; `-SkipNetworkCheck` skips the one-request reachability probe. `-Offline` (with `-GoModCache`) keeps
`GOPROXY=off` for a fully seeded Go cache.

## Caches and isolated builds

The build writes only these caches:

| cache | default | isolated override |
| --- | --- | --- |
| Bazel output/user root | `C:/b` | `-OutputBase` |
| Bazel repository cache | `~/_bazel_<user>/cache/repos/v1` | `-RepositoryCache` |
| Bazel disk action cache | `~/.cache/bazel-disk-cache` (from `.bazelrc`) | `-DiskCache` |
| pnpm store / npm cache | pnpm's user store | `-PnpmStore`, `npm_config_cache` |
| Gradle user home | `~/.gradle` | `-GradleUserHome` |
| Go module/build cache | Go's user cache | `-GoModCache`, `GOMODCACHE`/`GOCACHE` |
| Valdi sources for the compiler | Bazel output base | `VALDI_SOURCE_ROOT`, `valdi/.valdi-sources` |

`-DiskCache` is written to `valdi/win.cache.bazelrc` and `module-build/win.cache.bazelrc`, which the checked-in
`.bazelrc` files import last, so the override wins over the shared default. Both files are ignored by git and are
rewritten by every run (an empty file means "use the defaults"), so a previous isolated run cannot keep redirecting
caches.

`scripts/windows/test-cold-build.ps1` proves the fresh-computer path on one machine:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/test-cold-build.ps1 `
  -Root C:\vc -Commit <sha> -ProxyUrl http://proxy.example:8080 `
  -BazelPath C:\tools\bazel.exe -JavaHome C:\jdk17 -AndroidHome C:\Android\Sdk
```

It requires an empty `-Root` on a short path, clones the repository over the network at one commit, verifies the
clone is clean and holds no AAR/APK/vendor directories, and gives the build an empty, isolated directory for every
cache above (`caches\…`, `bazel-out`). It then runs the unified `pnpm android --no-install --no-launch` (prebuild
plus the Gradle build), the pipeline tests against the fetched
Valdi sources, and `scripts/windows/test-native-invalidation.ps1` (standalone module change rebuilds the module
library and APK without re-exporting; a TypeScript-only change does not rebuild either native artifact; a
`valdi/native` change fails the daily build with the export instruction). It then scaffolds a module through
`pnpm new-module` and rebuilds the module bundles (`-SkipNewModule` opts out), writes
`logs\cold-build-report.json` with the cache sizes after the run, output hashes, test results, invalidation and
new-module evidence, and prints the artifact hashes. Preinstalled tools are reused explicitly; this validates an
isolated cold build on existing hardware, not a pristine Windows installation.

An isolated Gradle home still has to download the wrapper distribution and the Android Gradle Plugin. Java ignores
`HTTPS_PROXY`, so when `-ProxyUrl` is given the script also passes the proxy as JVM settings (`GRADLE_OPTS`) and as
`gradle.properties` entries inside that isolated home; the npm fetches get the documented retry/timeout settings.

The `Windows Android CI` workflow exposes the same proof as a manual `cold_build` input: it skips the normal job,
runs `test-cold-build.ps1` in `C:\vc-<run id>` with the repository's optional proxy variables, uploads
`windows-cold-<run id>` (logs, report JSON, APK) and removes only that isolation root.

The full flow passes the validated Valdi checkout to the runtime export and runs
`scripts/export-android.sh`, the vision preparation, and `gradlew.bat` directly.
The checked-in scripts print the resolved `Git Bash`, `Valdi checkout` commit,
and `Bazel output root` before building.

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
`-ValdiCheckout C:\path\to\Valdi`. The wrapper first verifies that the path is
the root of a git work tree whose `HEAD` is exactly the `VALDI_COMMIT` pinned in
`valdi/MODULE.bazel` and whose `git status --porcelain` is empty. A different
commit or a modified/untracked file is rejected with a message naming the
expected and actual state: the OTA fingerprint names the pinned commit, so a
checkout of another commit (or local edits) would make the fingerprint lie.

After that check the wrapper writes ignored `valdi/win.local.bazelrc` and
`module-build/win.local.bazelrc` files with the checkout's file registry and
explicit Bazel `--override_module` flags for Valdi and its internal modules.
Paths are quoted for Bazel's rc parser and both files are written as UTF-8
without a BOM, so directories with spaces or non-ASCII characters survive.
The files are imported at the top of each `.bazelrc`, before the pinned fork
registry and BCR, so the local file registry is tried first. Platform-specific
`common:<platform>` options expand after `common` options, which is why the
checked-in registries are `common` entries.
The option is validation-only; committed builds use the immutable commit and
registry URL pinned in `valdi/MODULE.bazel` and `module-build/MODULE.bazel`.

The shell entry point is invoked with argument arrays rather than a constructed
`bash -c` string, so checkout, output, and configuration paths are never
re-parsed as shell syntax.

The default Bazel output root is `C:/b` to keep Android AAPT2
resource paths below the legacy Windows `MAX_PATH` limit. Use
`-OutputBase C:\short-path` to choose another short directory. The wrapper
checks that the default (or explicit) output root can be created and written
before starting Bazel, and otherwise fails with the underlying error and the
`-OutputBase` remedy. A custom output root containing a space still works with
quoted rc options, but Bazel warns that it can break builds; prefer `C:/b` or
another short path without spaces.
The wrapper reuses the default user Bazel repository cache when present; pass
`-RepositoryCache C:\path\to\cache\repos\v1` to point at another cache.
Bazel's disk action cache (`~/.cache/bazel-disk-cache`, from `valdi/.bazelrc`
and `module-build/.bazelrc`) is shared with local builds. A non-elevated
runner, such as the self-hosted GitHub Actions runner, therefore needs an ACE
for its own account on that directory. If an elevated shell re-creates it with
a protected DACL that omits that account, Bazel stops with only the cache path
and `Error initializing RemoteModule`; re-grant the account, for example
`icacls "$env:USERPROFILE\.cache" /grant "windows\user:(OI)(CI)F"`.
For offline Go repository fetches, pass `-GoModCache C:\path\to\gomodcache`;
the wrapper then sets `GOPROXY=off`. `-Distdir` is forwarded to Bazel, but
pinned Valdi module archives must also be reachable or already present in the
repository cache when the URL has no fixed checksum.
`-BazelArg` (repeatable) and `-BazelArgs` (pipe-separated) forward extra rc
lines to both Bazel workspaces. An entry beginning with `startup`, `common`,
`build`, `test`, or `fetch` is used as-is; anything else is added under
`common`. They cannot carry `--override_repository`: the export first runs
`bazel fetch --repo=@valdi`, and Bazel 8 rejects that option together with
`--repo`. When a dependency mirror is required, pre-populate the Bazel external
repository (by default `C:\b\<workspace-hash>\external`) or the repository
cache; the build then reuses it without extra flags.

The wrapper points Bazel at the checkout's registry through a local `file://`
URL. Bazel's lockfile records registry-file hashes by URL, so a Windows build
drops the fork-registry URL entries from `valdi/MODULE.bazel.lock` and
`module-build/MODULE.bazel.lock`; the BCR entries and every module version stay
unchanged. The committed lockfiles remain canonical: after a local Windows
validation restore them with
`git checkout -- valdi/MODULE.bazel.lock module-build/MODULE.bazel.lock`.

## Helper tests

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/test-windows-build.ps1
```

The tests create temporary git repositories and directories to check:

- clean checkout at the pinned commit accepted; wrong commit, dirty tracked
  file, untracked file, a subdirectory, and a non-git directory rejected;
- generated Bazel rc options quoted for spaces and non-ASCII paths, with a
  UTF-8 (no BOM) rc file;
- a writable short output base, including a path with spaces, and a helpful
  rejection when the path is a file;
- explicit Git Bash resolution through a path containing spaces;
- bash argument passing for paths with spaces and shell metacharacters, and
  exit-code propagation.

Add `-Integration -BazelPath C:\path\to\bazel.exe` to also start a real Bazel
server with a quoted, spaced, non-ASCII `--output_user_root` and shut it down.

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

## Native changes and invalidation

`ota/fingerprint.json` splits the inputs into a Valdi half and a per-platform native half:

- **`valdi`**: the Valdi fork pin/registry, `valdi/.bazelrc`, the runtime Node compiler
  (`tools/valdi-rolldown/{runtime-module,valdiTs,pipeline,archive,hermes}.ts`, `codegen`, `vendor`), and
  `valdi/native` (the app C++ linked into `libvaldi_runtime.so`). Changing any of these makes
  `scripts/ota.mjs check-export` fail with the `sh scripts/export-android.sh` instruction; the full Windows
  entry point re-exports first, so it is the supported way to rebuild.
- **`android`**: host sources, the standalone module's native implementation (`valdi/modules/calculator/android`,
  `module.json`, `Calculator.d.ts`), `module-build/`, Gradle files, `vision/`, and `ota/public.pem`. Changing these
  rebuilds the module library (`module-build` Bazel workspace) and the APK; the runtime AAR is not re-exported.

Generated bindings follow the same split: `tools/valdi-rolldown/codegen.ts` writes Kotlin to
`android/app/generated/valdi` and C++ to `valdi/native/generated` for app modules, but **excludes**
`nativeBuild: "bazel"` modules because they compile their bindings in their own native libraries. So:

- adding or changing a standalone native module (`module.json` `nativeBuild: "bazel"` plus native sources in the
  module) rebuilds that module's library and the app; no runtime export is needed;
- changing an app-level `@Export` declaration (a non-Bazel module), `valdi/native`, or the Valdi pin/toolchain
  changes `valdi/native/generated` or the runtime inputs, so the runtime must be exported again.

`scripts/windows/test-native-invalidation.ps1` checks this against a real build: it changes the calculator
implementation and asserts the module JAR and APK change while the AAR hash stays identical; then it changes
`valdi/native/src/Cpp.cpp` and asserts the daily `pnpm build:android` exits non-zero with the `runtime is out of
date` instruction and leaves the old AAR untouched, after which the full entry point exports a new AAR. Finally it
restores both files and rebuilds, so the reported artifacts match the committed tree. A failing export never
silently produces a new APK: the wrapper exits before Gradle runs, and `check-export` rejects a stale AAR.

The Vision preparation stamps its source pins; a changed `vision/vendor-lock.json` makes both the daily check and
the full wrapper demand a fresh `prepare-native.cjs` instead of reusing old archives.

## GitHub Actions

`Windows Android CI` includes a `Windows native Android` job on the repository-specific self-hosted runner labeled `valdi-windows`.
It only accepts pushes/manual runs for `hermes-v1`; pull-request events do not
run on the personal Windows computer. The runner starts when its Windows user
logs in, so that computer must be online with the user session available.
It installs the pinned JS dependencies and Android SDK/NDK, fetches the exact
`VALDI_COMMIT` as a clean Git checkout, and runs `build-android.ps1` without skip
flags. The job also runs the Windows helper tests, pipeline tests, runtime
fingerprint check and compiler action audit, and uploads logs and the Debug APK.
The explicit checkout uses the same supported `-ValdiCheckout` path as local
builds; it does not require a manually populated external repository directory.
A successful local run is separate from the result of this hosted CI job.

The optional repository variable `WINDOWS_GIT_PROXY_URL` routes only Git HTTPS
requests to GitHub for the Windows CI job. The home runner uses its existing
`http://127.0.0.1:10809` listener; this does not change global Git or system proxy
settings. Remove the variable to use the default network path.

Set the repository variable `WINDOWS_BAZEL_PATH` to the runner's preinstalled
Bazel executable when it is not on PATH. CI verifies it against
`valdi/.bazelversion` before building.
