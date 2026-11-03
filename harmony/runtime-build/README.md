# Pinned Valdi/Hermes for OHOS

This wrapper builds the portable C++ closure of Valdi commit
`15feb6530ceecb971f4c8519ea8ab77474b959db`, including the patched Hermes
`260318099.0.4` lean VM (HBC 99), Yoga, Djinni, utilities, and protobuf.
It does not build SnapDrawing, Android/JNI, Apple wrappers, or the Harmony UI backend.

## Prepare inputs

```sh
node scripts/harmony/prepare-runtime.mjs
```

Defaults:

| Input | Default |
| --- | --- |
| `--git-source` | `VALDI_FORK_SOURCE` or sibling `../Valdi-node-only` (git object provider; HEAD is never used) |
| `--source` | `.tools/harmony/upstream` (exact git archive; exported if absent) |
| `--external` | `valdi/bazel-valdi/external` (read-only dependency cache) |
| `--bazel-out` | `valdi/bazel-out` (existing protoc 29.3 generated pairs) |
| `--output` | `.tools/harmony/runtime-inputs` (writable staging) |

The script verifies the exported runtime source tree against the pinned git object
(allowing the five C++ files owned by the parent platform overlay),
then invokes the parent-owned, idempotent `scripts/harmony/apply-platform.mjs`.
It preserves an existing export rather than overwriting its platform changes. It
copies dependency sources into writable staging, derives source lists from the
pinned Bazel manifests, and validates internal Hermes bytecode against the actual
patched JS sources. It copies platform-independent protobuf output only when its
generated version is 5.29.3 and the cached `.proto` inputs match the pinned source.
It does not invoke Bazel or build the fork checkout. Dependencies must already be
present in the supplied cache. `provenance.json` records the source and cache paths.
The staging directory contains no credentials or device state.

## Cross-build

```sh
source /Users/cloud/.config/harmony/env.zsh
CMAKE="$OHOS_NDK_HOME/build-tools/cmake/bin/cmake"
"$CMAKE" -S harmony/runtime-build -B .tools/harmony/runtime-x86_64 -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$OHOS_NDK_HOME/build-tools/cmake/bin/ninja" \
  -DCMAKE_TOOLCHAIN_FILE="$OHOS_NDK_HOME/build/cmake/ohos.toolchain.cmake" \
  -DOHOS_ARCH=x86_64 -DOHOS_PLATFORM_LEVEL=26 -DCMAKE_BUILD_TYPE=Release
"$CMAKE" --build .tools/harmony/runtime-x86_64 --parallel 4 \
  --target valdi_runtime_ohos_link_check
```

Use a separate build directory and `-DOHOS_ARCH=arm64-v8a` for ARM64.
Building the link-check target builds the runtime and its dependencies first.

`valdi_runtime_ohos` is a PIC static CMake target with public include paths,
definitions, and dependency linkage. Consumers should add this directory with
`add_subdirectory()` and link that target; the `.a` by itself does not contain its
third-party dependencies. The default `valdi_runtime_ohos_link_check` shared target
pulls every runtime object into a strict `--no-undefined --no-gc-sections` link, checking more than
archive creation. This library is build evidence, not an application or a device
execution test.

## Integration variables

- `VALDI_HARMONY_SOURCE_DIR`: pinned git archive root.
- `VALDI_HARMONY_EXTERNAL_DIR`: staged dependencies with normalized names (`hermes`,
  `boost`, `protobuf`, `abseil`, `boringssl`, `harfbuzz`, `fmt`, `jsoncpp`, `phmap`,
  `zoo`, `zstd`, `xxhash`).
- `VALDI_HARMONY_GENERATED_DIR`: preparation output containing `sources.cmake` and
  `proto/valdi/valdi.pb.{h,cc}` plus
  `proto/valdi_protobuf/protos/DescriptorIndex.pb.{h,cc}`.
- `VALDI_HARMONY_OVERLAY_INCLUDE_DIR`: optional platform header overlay, searched
  before the pinned headers. The backend owns platform classification and JS platform policy.
- `VALDI_HARMONY_PLATFORM_SOURCES`: optional semicolon-separated OHOS implementation files.
- `VALDI_HARMONY_LINK_CHECK`: enable the strict shared link check (default ON).
- `VALDI_HARMONY_ASSERTS`, `VALDI_HARMONY_LOGGING`, `VALDI_HARMONY_TRACING`: explicit
  generated Valdi build options (defaults OFF, ON, OFF).

The binary directory owns `generated/build_options/BuildOptionsGenerated.hpp` and
`generated/hermes/`. Both the Hermes VM and Valdi adapter include the same release
Hades/uncompressed 64-bit pointer configuration (`_s22_p8_rel`, 22-bit segments,
no JIT). Hermes and protobuf use C++17, Valdi uses C++20. Protobuf 29.3's
recursive JSON container needs C++17 with this NDK's libc++; Abseil does not force
its consumer targets to C++20. Assertions in Valdi can be enabled
independently; the Hermes ABI stays in its release model. The LLVH Linux baseline
is adjusted using OHOS cross-compiler symbol checks for musl-sensitive features.
No Android macros or JNI definitions are used to impersonate another platform.

## Verified build artifacts

Both `x86_64` and `arm64-v8a` were compiled and linked with the installed
26.0.0.865 SDK's OHOS Clang 15.0.4. Each build compiles 361 Valdi translation
units and 254 Hermes/LLVH/dtoa translation units, plus the dependency projects.
The strict whole-archive shared-library checks pass for both ELF64 architectures.
Their dynamic dependencies are `libc++_shared.so` and `libc.so`; neither has
`TEXTREL`. Re-running preparation and both builds leaves Ninja with no work.

Artifacts are under `.tools/harmony/runtime-x86_64/` and
`.tools/harmony/runtime-arm64-v8a/`: `libvaldi_runtime_ohos.a` and
`libvaldi_runtime_ohos_link_check.so`. The ignored
`.tools/harmony/runtime-build-proof.json` records their sizes, SHA-256 digests,
architectures, and final incremental-build output.

This verifies cross-compilation and strict linking only. The parent-owned ArkUI
backend must link `valdi_runtime_ohos` into its application library and validate
execution on Harmony. The lean VM executes precompiled HBC 99, not JS source.
Harmony debugger transport remains disabled by the parent platform overlay.
