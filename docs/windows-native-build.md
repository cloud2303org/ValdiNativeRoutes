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

This exports the three-ABI Valdi runtime AAR, prepares the Android arm64
OpenCV/ncnn libraries when they are missing, builds the custom Bazel-backed
modules, and assembles the Debug APK with `gradlew.bat`. The Gradle pipeline's
TypeScript tasks invoke pnpm through `scripts/pnpm.mjs`, which uses Node and the
bundled Corepack launcher instead of spawning a `.cmd` shim.

The complete Windows entry point is Debug-only, matching `pnpm build:android`.
Release runtime export remains available through `export-android.ps1 -Config release`.

Use `-SkipRuntimeExport` when the runtime and its fingerprint are already
current. Use `-SkipVisionPrepare` to reuse an existing vision build.

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

## GitHub Actions

`Application CI` includes a `Windows native Android` job on `windows-2025`.
It installs the pinned JS dependencies and Android SDK/NDK, fetches the exact
`VALDI_COMMIT` as a clean Git checkout, and runs `build-android.ps1` without skip
flags. The job also runs the Windows helper tests, pipeline tests, runtime
fingerprint check and compiler action audit, and uploads logs and the Debug APK.
The explicit checkout uses the same supported `-ValdiCheckout` path as local
builds; it does not require a manually populated external repository directory.
A successful local run is separate from the result of this hosted CI job.
