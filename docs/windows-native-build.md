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

## Install, export, then build

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File scripts/windows/export-android.ps1 -Config debug
pnpm android
# Or build without installing/launching:
pnpm build:android
```

The manual export fetches the pinned Valdi sources, generates bindings and exports
the three-ABI runtime AAR. `pnpm android [--device <serial>] [--no-install] [--no-launch]`
runs the Gradle build and installs/launches on an emulator (a physical phone only
when named with `--device`). Gradle automatically checks enabled modules' declared
native dependencies, prepares missing/stale dependencies, and builds module
libraries and module-declared CMake sources. Disabled modules do not participate.
The root runner does not compile native module libraries before Gradle.
The Gradle pipeline's
TypeScript tasks invoke pnpm through `scripts/pnpm.mjs`, which uses Node and the
bundled Corepack launcher instead of spawning a `.cmd` shim.

`pnpm build:android` is the daily build-only entry point. Runtime validation checks
artifact existence and platform/configuration metadata. It does not compare
source hashes or automatically re-export; manually export again after changes to
the Valdi pin, runtime toolchain/compiler or C++ linked into the runtime.
The normal app entry points build Debug.
Release runtime export remains available through `export-android.ps1 -Config release`.

### Windows build wrapper

After manually exporting the runtime, `scripts/windows/build-android.ps1` can
configure Windows tools, proxy and cache paths and invoke the normal app build.
It installs missing JS dependencies unless `-SkipInstall` is passed. It does not
export the runtime or prepare Vision before the native build; Gradle owns module
dependency preparation and native libraries.

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
# After manually exporting the runtime:
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

### Cold-build runner

`scripts/windows/test-cold-build.ps1` checks the install → manual export → native
build sequence in isolation. The commands below describe the runner; this
documentation update does not establish a fresh Windows pass.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/test-cold-build.ps1 `
  -Root C:\vc -Commit <sha> -ProxyUrl http://proxy.example:8080 `
  -BazelPath C:\tools\bazel.exe -JavaHome C:\jdk17 -AndroidHome C:\Android\Sdk
```

It requires an empty `-Root` on a short path, clones the repository over the network at one commit, verifies the
clone is clean and holds no AAR/APK/vendor directories, and gives the build an empty, isolated directory for every
cache above (`caches\…`, `bazel-out`). It installs dependencies, explicitly invokes
the runtime exporter, checks that runtime metadata contains only `platform` /
`config`, and checks the generated bindings. It then runs
`pnpm android --no-install --no-launch`, verifies that the manually exported AAR
was not changed by the app build, and runs the pipeline tests against the fetched
Valdi sources. It scaffolds a module and rebuilds the module bundles
(`-SkipNewModule` opts out), again checking that the runtime stays unchanged.
It writes `logs\cold-build-report.json` with cache sizes, output hashes, test
results and new-module evidence, and prints artifact hashes. Preinstalled tools
are reused explicitly; this is an isolated build on existing hardware, not a
pristine Windows installation.

An isolated Gradle home still has to download the wrapper distribution and the Android Gradle Plugin. Java ignores
`HTTPS_PROXY`, so when `-ProxyUrl` is given the script also passes the proxy as JVM settings (`GRADLE_OPTS`) and as
`gradle.properties` entries inside that isolated home; the npm fetches get the documented retry/timeout settings.

### Which fetches use the proxy

They do not all follow the same path, and treating "GitHub works" as proof for the rest is wrong:

| fetcher | transport | proxy behaviour |
| --- | --- | --- |
| `git` (checkout, fork fetch) | `GIT_CONFIG_COUNT`/`KEY`/`VALUE` | server-specific `http.https://github.com/.proxy`; `git config --get` returns the configured URL |
| Bazel's downloader (module registry, `http_archive`, the `http_file` jars that `rules_jvm_external` creates) | Bazel's own HTTP client | honours `HTTPS_PROXY`/`NO_PROXY`; hosts listed in `NO_PROXY` are fetched **directly** |
| coursier resolution inside `rules_jvm_external` | JVM started by Bazel | Java ignores `HTTPS_PROXY`; it is direct unless `-Dhttps.proxyHost` reaches that JVM |
| Gradle (wrapper distribution, AGP, app dependencies) | JVM | direct by default; the cold script passes `GRADLE_OPTS` and `gradle.properties` so an isolated run is proxied |

One consequence observed in CI: `dl.google.com` sits in the workflow's `NO_PROXY`, so the Google Maven jars are
fetched directly. Run `41201533819` failed there with `429` on three artifacts
(`databinding-common` 8.7.0, `desugar_jdk_libs_minimal` 2.1.5, `espresso-idling-resource` 3.6.1 at 12:36 UTC on
2026-10-31). What the logs prove is the response code and the direct route; that a parallel burst caused the CDN to
rate-limit this address is an inference - there is no server-side log or request timeline for it. Bazel already
retries such downloads (`--experimental_repository_downloader_retries` defaults to 5 in 8.2.1), and the same jar
returned `200` over both the direct and the proxied route minutes later. Routing that host through the proxy is a
deliberate decision, not a default.

`--output_base` also needs naming explicitly: a host-level `~/.bazelrc` with `startup --output_base=C:/_bazel`
overrides `--output_user_root`, so the isolated entry points pass both flags. `valdi` and `module-build` are
different Bazel workspaces and must not share one base, so the run root travels as
`VALDI_BAZEL_OUTPUT_BASE_ROOT` and each workspace appends its own name (`<root>/base/valdi`,
`<root>/base/module-build`). The cold proof fails if either `bazel info output_base` is outside the run root or if
the two are the same path.

The `Windows Android CI` workflow exposes the same proof as a manual `cold_build` input: it skips the normal job,
runs `test-cold-build.ps1` in `C:\vc-<run id>` with the repository's optional proxy variables, uploads
`windows-cold-<run id>` (logs, report JSON, APK) and removes only that isolation root.

The explicit runtime export passes the validated Valdi checkout to
`scripts/export-android.sh`; the app build invokes `gradlew.bat`, whose module
build steps prepare declared dependencies as needed.
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
expected and actual state. This enforces the wrapper's explicit pinned-source
contract; runtime metadata no longer records a source fingerprint.

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

The export writes `android/app/libs/valdi_ota.json` with only `platform` and `config`.
Builds check artifact existence and this metadata; OTA packing requires a Release
runtime for the selected platform. `valdiCodegenCheck` still checks generated
bindings, without comparing runtime source hashes. To inspect the runtime
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

## Native changes and build ownership

- **Runtime**: after changing the Valdi fork pin/registry, runtime toolchain/Node
  compiler or runtime-linked module C++, manually export the AAR and rebuild the
  app. Source freshness is not inferred from metadata.
- **Module and host code**: Gradle builds selected module libraries and the APK,
  including module-declared Android CMake contributions. Native dependency hooks
  check caches and prepare missing/stale dependencies as part of that build.
  `pnpm dev` retains the existing TS/resource watch and hot reload.

Generated Kotlin/Objective-C bindings still follow each module's native-build ownership.
Canonical C++ generation uses `--cpp-modules-out ../../valdi/modules`: each C++ owner
gets `cpp/generated/valdi_modules/<id>/`, and explicit module `cpp/BUILD.bazel` targets
compile it. The default roots are enabled modules with `cpp/src` implementations;
generated include dependencies supply the transitive binding closure. A module's
optional `cppSourceRoots` narrows only this module-owned C++ generation. `app_pages`
selects `src/cpp/Cpp.d.ts`, so its demo bindings no longer depend on foundation's
routing contracts. The current closure contains `app_pages` and `app_vision`; the
runtime links their `cpp:native` targets.

- A host-only binding outside that C++ closure rebuilds its native module/app, without
  adding a new runtime C++ dependency. Its changed native ABI still affects OTA compatibility.
- C++ implementations, generated binding dependencies, module C++ build rules, and the
  runtime/toolchain inputs require a matching runtime export.

The former `scripts/windows/test-native-invalidation.ps1` runner has been removed.
Historical reports of automatic export or rejection of stale runtime source
hashes describe the old workflow.

Vision's module hook checks its preparation receipts against
`vision/vendor-lock.json`. A stale receipt triggers preparation in the native
build. These vendor cache checks are separate from runtime metadata.

## GitHub Actions

`Windows Android CI` includes a `Windows native Android` job on the repository-specific self-hosted runner labeled `valdi-windows`.
It only accepts pushes/manual runs for `hermes-v1`; pull-request events do not
run on the personal Windows computer. The runner starts when its Windows user
logs in, so that computer must be online with the user session available.
It installs the pinned JS dependencies and Android SDK/NDK, fetches the exact
`VALDI_COMMIT` as a clean Git checkout, explicitly exports the runtime, then runs
`build-android.ps1`. It also runs helper and pipeline tests, validates runtime
platform/configuration metadata, audits compiler actions, and uploads logs and the
Debug APK. Gradle prepares selected modules' native dependencies during the build.
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
