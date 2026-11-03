# Image asset validation

Run from the repository root. These checks only create artifacts under `/tmp`.
They do not configure the parent, modify upstream, build a HAP, or use a device.

## Production policy and request lifecycle

```sh
clang++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -fsanitize=address,undefined \
  harmony/entry/src/main/cpp/assets/tests/image_helpers_test.cpp \
  -o /tmp/valdi-harmony-image-helpers
/tmp/valdi-harmony-image-helpers
```

For the same concurrency checks under ThreadSanitizer:

```sh
clang++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -fsanitize=thread \
  harmony/entry/src/main/cpp/assets/tests/image_helpers_test.cpp \
  -o /tmp/valdi-harmony-image-helpers-tsan
/tmp/valdi-harmony-image-helpers-tsan
```

The tests include the production policy and request gate headers directly.
Coverage includes intrinsic/one-axis/box preferred sizing, extreme dimensions,
stride/allocation validation, duplicate/synchronous completion, cancellation
before handle installation, cancellation during queued work, breaking in-flight
download ownership cycles, callback reentry, delivery/cancel synchronization and
500 concurrent download/cancel/handle-install races. There is no fake SDK decode.

## Filter policy, graph, cancellation and native ownership

```sh
clang++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -fsanitize=address,undefined \
  harmony/entry/src/main/cpp/assets/tests/image_filter_test.cpp \
  -o /tmp/valdi-harmony-image-filter-tests
/tmp/valdi-harmony-image-filter-tests
```

Use `-fsanitize=thread` in place of `-fsanitize=address,undefined` for TSan.
The seven groups include the **production** filter policy, graph orchestration,
SDK handle owner and request gate. They exercise unchanged normalized RGBA/alpha
matrix forwarding, finite coefficients, sigma boundaries, combined peak memory,
intrinsic versus downsampled sizing, padded blur workspaces, matrix-before-blur
order, matrix-only/blur-only paths, all graph creation/draw failures,
cancellation at every boundary, stale output release and owning error
out-pointers. The graph uses an instrumented API, not a software pixel renderer.

The normalized matrix regressions can also be run separately by passing
`passthrough`, `invert`, `fractional` or `alpha` to this executable. All four
were observed failing against the prior production offset-times-255 code
before changing that code, then passing after the fix. The fractional case
includes positive and negative RGB offsets; alpha checks a fractional scale
and offset. Their normalized affine math is a contract oracle, not a claim
about SDK raster output. Red and green logs are kept under
`/tmp/valdi-harmony-image-filter-normalized-proof`.

## Identity dispatch and effective-filter metadata errors

```sh
clang++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -fsanitize=address,undefined \
  harmony/entry/src/main/cpp/assets/tests/image_filter_input_test.cpp \
  -o /tmp/valdi-harmony-image-filter-input
/tmp/valdi-harmony-image-filter-input
```

Use `-fsanitize=thread` for the corresponding TSan run. These four groups execute
the production `dispatchHarmonyImageFilter` and numeric metadata formatter.
The renderer callback stands in for all Drawing metadata queries/allocations:
identity must never call it, even when it would reject unknown alpha/format
metadata. The tests check exact source-reference/retained-byte/metadata
preservation, effective matrix/blur routing into that callback, numeric
diagnostic fields, rejection of invalid layout/allocation/memory, cancellation,
and source lifetime. The decoder's RGBA format restriction remains unchanged;
synthetic metadata values here are not measurements of the vendor SDK.

The r2 artifact/log hashes, pre-fix asset snapshot, sanitizer logs and next
SDK ABI verification are retained under
`/tmp/valdi-harmony-image-identity-proof`. No HAP/device operation is performed
by these checks. A subsequent parent HAP must validate actual plain-image
restoration and report effective-filter metadata/output.

## Actual production Drawing adapter seam

On the current Mac, compile the actual production `HarmonyImageDrawing.cpp`
with the installed SDK headers and fault-injected C API definitions:

```sh
image_sdk_include=/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native/sysroot/usr/include
clang++ -std=c++20 -Wall -Wextra -Werror -Wno-ignored-attributes \
  -fsanitize=address,undefined -idirafter "$image_sdk_include" \
  harmony/entry/src/main/cpp/assets/HarmonyImageDrawing.cpp \
  harmony/entry/src/main/cpp/assets/tests/native_drawing_seam_test.cpp \
  -o /tmp/valdi-harmony-native-drawing-seam
/tmp/valdi-harmony-native-drawing-seam
```

The four groups execute the unmodified production C++ adapter. All C API
definitions must match the actual SDK declarations at compile time. Assertions
cover matrix/blur input chaining, sigma/clamp/crop and source-rectangle arguments,
source/destination separation, immutable source use, fresh destination writes,
unchanged forwarding of all 20 coefficients for invert/fractional/alpha cases,
all nine allocation failures, sticky errors from void APIs, cancellation before
and after drawing, brush detachment, and canvas destruction before pixelmap
binding dissolution. These tests check the production adapter, ownership and
error handling; their fault-injected C implementations do not prove SDK
rasterization, color-space behavior or live pixel parity.

## Current versus default alpha metadata

```sh
image_sdk_include=/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native/sysroot/usr/include
clang++ -std=c++20 -Wall -Wextra -Werror -Wno-ignored-attributes \
  -fsanitize=address,undefined -idirafter "$image_sdk_include" \
  harmony/entry/src/main/cpp/assets/tests/pixelmap_metadata_test.cpp \
  -o /tmp/valdi-harmony-pixelmap-metadata
/tmp/valdi-harmony-pixelmap-metadata
```

Use `-fsanitize=thread` for TSan. The three groups execute the production
`readHarmonyImagePixelmapMetadata` helper against SDK-header-typed C functions.
The [official API reference](https://github.com/openharmony/docs/blob/2103b11b1219ba415c395a75584de393c728008a/zh-cn/application-dev/reference/apis-image-kit/capi-pixelmap-native-h.md#oh_pixelmapimageinfo_getalphatype)
distinguishes default alpha type from current image alpha mode. Tests encode
that semantic difference: current opaque/premultiplied/unpremultiplied modes
are checked against every distinct default type, including zero; a known
default must not hide an actually unknown current mode. Metadata errors
propagate without falling back to the default getter. The source pixelmap's
current mode remains unchanged.

This seam failed against the previous `GetImageInfo`/default-`GetAlphaType`
pair before switching to the documented current-mode getter. The test models
the field separation verified in immutable public OH6 source; it does not
execute the vendor runtime or render pixels. Full provenance and the installed
SDK declaration are recorded in `../IMAGE_API.md`.

R3/r4/business artifact references, the red/green logs, immutable official
documentation/source snapshots and final checks are under
`/tmp/valdi-harmony-image-alpha-proof`.

## SDK 26 object and imported symbol verification

Use the existing parent compile database, generated by the host build:

```sh
python3 harmony/entry/src/main/cpp/assets/tests/verify_sdk.py \
  --compile-commands harmony/entry/.cxx/default/default/debug/x86_64/compile_commands.json \
  --output /tmp/valdi-harmony-image-filter-sdk-proof
```

The script copies compile flags from a host translation unit and compiles all
five production `.cpp` files to real OHOS objects for `aarch64-linux-ohos` and
`x86_64-linux-ohos`. It uses the actual pinned Valdi headers and installed SDK
headers. It derives every `OH_*` undefined symbol from the compiled objects,
checks each against SDK ELF exports, then builds a header-typed import-only
shared library with `--no-undefined`. The two ArkUI descriptor functions from the
public presentation contract are checked as well.
The production imports must include `OH_PixelmapImageInfo_GetAlphaMode` and
must not include the default-only `OH_PixelmapImageInfo_GetAlphaType`.
It also strictly links the **entire actual production Drawing object** into
`<ABI>-production-drawing.so` with `--no-undefined`, `native_drawing` and
`pixelmap`. That object has no Valdi dependencies and is not an import-only
probe.

For each ABI, the script also compiles the production `getMetadata()` method
against those real headers and checks Clang's resolved AST: all eight numeric
fields must select `Valdi::Value(int32_t)`, and `type` must select the string
constructor with `"image"`. This checks the actual production method and
overload resolution; it does not execute the OHOS asset or the JS marshaller.

The import probe links `image_source`, `pixelmap`, `native_drawing` and
`ace_ndk.z`. It does not
link the Valdi implementation or validate the parent's whole shared library.
The machine-readable report records object paths, each symbol's library, and
the linked probes in `verification.json`.

Verified on November 2, 2026 with the installed
`Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native` SDK:

* Five production objects per ABI compiled with warnings treated as errors.
* Fifty-eight imported SDK symbols per ABI exported by the real libraries.
* Both `--no-undefined` SDK import probes and both entire production Drawing
  object links succeeded.
* Production metadata constructor and `type: 'image'` assertions passed for both
  ABIs using the real-header compiler AST.
* All seven existing host policy/lifecycle groups and seven filter groups passed
  with ASan/UBSan and in separate ThreadSanitizer runs.
* All four actual production native Drawing adapter groups passed with
  ASan/UBSan and TSan, using the installed SDK declarations and fault-injected
  C calls.
* All four production identity/effective-filter input dispatch groups passed
  with ASan/UBSan and TSan, including numeric diagnostic fields, source ownership,
  and identity bypass without weakening layout/combined-memory checks.
* All three current/default-alpha metadata seam groups passed ASan/UBSan and
  TSan with actual SDK declarations; genuine unknown modes and SDK errors are
  not relabeled or hidden.

This establishes ABI/header and SDK import compatibility plus host execution of
the production size policy and cancellation state machine. Actual SDK image
decoding and native view display still require the parent's fixture/build/device
validation. It does not establish codec scratch-memory maxima; intrinsic/output
budgets plus the combined 128 MiB admission model bound accepted work, rather
than providing a hard allocator quota for SDK internals. Direct `LoadedAsset`
attribute filtering bypasses the loader and still needs explicit parent
integration; see `../IMAGE_API.md`. That contract also records immutable public
OH6 Drawing/Skia source provenance for normalized matrix offsets and explicitly
does not map those sources to proprietary SDK26 vendor runtime binaries.
