# Android Promise rejection regression fixture

Run from the application root:

```sh
node --test scripts/tests/android-promise-rejection.test.mjs
VALDI_TEST_BAZEL_NATIVE_PATCHER=1 node --test scripts/tests/android-promise-rejection.test.mjs
VALDI_TEST_BAZEL_MAIN_REPO_PARSER=1 node --test scripts/tests/android-promise-rejection.test.mjs
```

The test reads production sources with `git show` at
`15feb6530ceecb971f4c8519ea8ab77474b959db` from the sibling `Valdi-node-only`
checkout. Set `VALDI_FORK_SOURCE` to another local checkout containing that
commit if needed. It changes only temporary copies.

The JVM test needs a JDK, a C compiler, and existing Kotlin compiler and
AndroidX annotation jars. It discovers Kotlin in the local Gradle distribution
and AndroidX in the Gradle dependency cache. To select them explicitly, set
`VALDI_TEST_KOTLIN_LIB` to a Gradle/Kotlin compiler lib directory containing the
compiler and its dependencies, and `VALDI_TEST_ANDROIDX_ANNOTATION` to the
AndroidX annotation jar. No Gradle build or dependency download runs.

The compiled production classes include `CppPromiseCallback`,
`CppNativeHandlePair`, `Promise`, `RejectedPromise`, `ResolvablePromise`,
`CancelableResolvablePromise`, `ValdiException`, and the unchanged exception
utilities. `NativeBridge.java` supplies only an assertion at the unused native
reference disposal endpoint. `capture.c` registers the callback's real JVM JNI
methods and records their arguments. The consumer verifies raw messages,
ordinary diagnostics and causes, error codes, empty failures, cancellation,
and ownership transfer of both callback handles.

The red control supplies the new marker class to the original callback: nine
raw-message assertions must fail while ordinary diagnostic and cancellation
assertions still pass. Applying the callback patch then makes all 19 consumer
cases pass. Constructor checks cover both Java-callable signatures. The shared
`messageWithCauses()` must retain its formatting even for the marker.

The optional archive parser test uses the exact version in
`valdi/.bazelversion` (8.2.1), both in the temporary workspace and through
`USE_BAZEL_VERSION`. It supplies private output-user, output-base, and repository
cache paths, disables lockfile writes, and exercises
`archive_override -> http_archive -> utils.patch -> repository_ctx.patch`.
It applies the existing lossless patch followed by the Android Promise patch
with `strip=1`. The Kotlin source glob and absence of intervening Bazel packages
are checked against the pinned production tree.

The original test workspace had no `.bazelversion`, so Bazelisk selected 9.3.1.
That parser accepted a newline-only final hunk containing
`\ No newline at end of file`. The actual 8.2.1 export rejected it with
`Expecting more chunk line at line 50`. The original export failure log remains
at `.ci/harmony/2026-11-02-completion/appui-promise-android-export-r2.log`.
`rejected-eof-marker.patch` preserves the exact failed canonical patch, SHA-256:

```text
e2f0d15c50bb4be9aebf72e53a45a2e7c4156482a16dc6822942d57574c12178
```

The parser test first requires that preserved patch to fail at line 50 through
the 8.2.1 archive path, then requires the corrected canonical patch to pass.
The corrected patch omits the unnecessary EOF hunk. The pinned callback has no
final newline: git preserves that byte layout, while Bazel's patcher appends a
newline. The comparison explicitly permits that one known byte on that one
file and requires all other patched bytes to match.

The separate main-workspace parser test runs `fetch --repo=@valdi` from the
actual `valdi/` workspace. It uses the real MODULE, registry configuration,
archive pin, patch labels, and Bazel version with independent output roots and
a private repository cache, and checks the resulting patched sources. It
verifies MODULE, lockfile, configuration, and registered patches remain
byte-identical. It performs no runtime/application build or export.

An optional `VALDI_TEST_BAZEL_REPOSITORY_SEED` points to an existing repository
cache to clone/copy into the private cache; the seed itself is never passed as
the writable cache. An optional `VALDI_TEST_BAZEL_DOWNLOADER_CONFIG` supplies a
probe-only Bazel downloader config. Alternatively,
`VALDI_TEST_BAZEL_VALDI_ARCHIVE` can point to a previously downloaded `.tar.gz`
for the exact pinned commit. The test serves it through a temporary localhost
mirror and generates a private downloader rule for the original pinned URL.
The mirror stops after the test; workspace archive registration is unchanged.
On this machine the original GitHub archive URL returned `Premature EOF`.
The acceptance probe used an archive downloaded from GitHub's codeload
endpoint, SHA-256:

```text
040f33d19ef48888800df474a85379899a715be81db0d38d3334c7246f90f83e
```

Registration is in the application's `valdi/MODULE.bazel` `archive_override`.
Writable Harmony staging via `scripts/upstream-runtime-patches.mjs` retains
only the lossless Hermes patch: this patch changes Android Kotlin sources.
Existing Android runtime AARs must be re-exported to include the new class and
callback behavior. These tests execute desktop JVM/JNI capture endpoints;
they do not load the Android Valdi native library or prove Android device or
JavaScript end-to-end behavior. Public AppUI message normalization belongs to
the AppUI producer.
