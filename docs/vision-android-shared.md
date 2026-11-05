# Android Vision shared vendors

Android packages OpenCV Mobile and ncnn as four separate shared libraries,
linked by the existing JNI wrapper. The shared vendors, Debug APK, installed
APK binding, ELF dependency closure, and emulator execution were checked on
2026-11-05. iOS continues to use its existing static XCFramework.

## Scope and preserved outputs

`node vision/scripts/prepare-native.cjs --target android-arm64` now prepares four
independent vendor shared libraries:

```text
vision/vendor/build/android-arm64/shared/opencv/
vision/vendor/build/android-arm64/shared/ncnn/
vision/vendor/install/android-arm64/shared/
  include/opencv4/
  include/ncnn/
  lib/libopencv_core.so
  lib/libopencv_imgproc.so
  lib/libopencv_highgui.so
  lib/libncnn.so
  native-routes-vision.json
```

The target identity stays `android-arm64`; its receipt adds `linkage: "shared"`.
The shared build and install use new subdirectories. Existing static build
directories, installed `.a` files, source trees, and archive caches are retained.
The preparation script uses the existing archive verification and source stamps;
no source pin or download URL changes.

iOS keeps its original `ios-arm64` and `ios-simulator-arm64` build/install paths,
platform options, OpenCV `options.txt`, `NCNN_SHARED_LIB=OFF`, receipt shape,
`libVisionDependencies.a` aggregation, and static `VisionDependencies.xcframework`
creation/selection behavior. There is no iOS shared-library split. Non-Android
consumers of `VisionVendors.cmake` continue to link the original archive paths.

Relevant source files:

- `vision/scripts/prepare-native.cjs`
- `vision/cmake/VisionVendors.cmake`
- `android/app/src/main/cpp/CMakeLists.txt`
- `docs/vision-android-shared.md`
- `vision/patches/opencv-mobile-android/INIT_MODULE_SOURCES_opencv_highgui.cmake`
- `scripts/prerequisites.mjs`
- `scripts/tests/prerequisites.test.mjs`

## Inspected cached sources and toolchain

The lock and cached `.native-routes-source.json` files identify:

- OpenCV Mobile v36 / OpenCV 4.13.0, commit
  `0d81551eb80b53a48eed83ea36cbc769b11e120a`, archive SHA-256
  `0aeaea4837d19894765aae23cb82fc4b87cec07449bee4b4404a63bdda15d6ee`.
- ncnn 20260526, commit `e54f7b1f88434e1d844ea0551b880a1cfb079ce1`,
  archive SHA-256
  `999e904d1631f46381728c68c3255af67d2cf4dbfbab8e3a7f2343e7a6dffc3d`.

The cached OpenCV `options.txt` sets `BUILD_SHARED_LIBS=OFF`. Android overrides
that option **after** loading the options, with `BUILD_SHARED_LIBS=ON` and
`BUILD_opencv_world=OFF`, retaining `BUILD_LIST=core,imgproc,highgui`. This cached
branch really defines these three component targets; its mobile `highgui`
contains `imencode`/`imdecode` and declares them for export. No separate
`imgcodecs`, Java wrapper, or invented world output is required.
`cmake/OpenCVInstallLayout.cmake` installs Android shared components under
`sdk/native/libs/arm64-v8a`; preparation copies those real files into `lib/`.

### Android highgui V4L2 source patch

The parent's supplied
`/tmp/valdi-media-demo-20261105/android-vision-shared-prepare1.log:4315`
shows the shared highgui link failing on `cv::capture_v4l2::*` references from
`videocapture.cpp`. This is supplied build evidence, not an agent rerun.

In the pinned source, `modules/highgui/CMakeLists.txt:22` appends
`capture_v4l2.cpp`, `display_fb.cpp`, and `writer_http.cpp` only when
`CMAKE_SYSTEM_NAME` is `Linux`. Android uses `Android`, so those implementations
are omitted. `videocapture.cpp` nonetheless has five `#if defined __linux__`
guards (include, backend member, open, release, and frame extraction); Android
defines `__linux__`. Neither those guards nor this mobile module's source-list
selection consults `WITH_V4L`. Turning it OFF cannot fix the mismatch.
Neighboring `videowriter.cpp` and `highgui.cpp` already exclude Android from
their desktop HTTP-writer/framebuffer paths.

The fix uses the pinned OpenCV build's supported `OPENCV_CMAKE_HOOKS_DIR` and
`INIT_MODULE_SOURCES_opencv_highgui` hook, not a backend-disable configuration
option. The explicit hook verifies the original `videocapture.cpp` SHA-256
(`b449272de5e4b0f33b15e98ef2d1e4b905248cf87806759990e652f15cf93b69`)
and all five guards, then changes each to
`#if defined __linux__ && !defined __ANDROID__` in a private copy:

```text
vision/vendor/build/android-arm64/shared/opencv/modules/highgui/
  native-routes-android/videocapture.cpp
```

It replaces only that translation unit in highgui's module source list. The
original extracted file is never written. The hook is passed only on Android
shared preparation; iOS uses its untouched original file, flags and static
build path. The OpenCV source/build root stays the same, so the parent can
reconfigure the existing failed Android build cache without deleting it or
discarding the completed core/imgproc work. No snapshot is created until the
parent actually configures the build.

The image encode/decode implementation in `highgui.cpp`, EXIF/rotation helpers,
NMS, and exported VideoCapture/VideoWriter methods remain in the module.
Android's desktop V4L2 references are excluded; no unresolved-symbol exemption
or replacement backend/stub is added. With this configuration,
`VideoCapture::open(int)` follows the vendor's existing no-backend path and
returns false, and `isOpened()` stays false. This library does **not** provide
Android camera capture, native window display, or the desktop HTTP video writer.
The hook rejects enabling the board-specific CVI/AW/RK capture backends.
The hook emits that camera limitation during configuration, and the Android
receipt explicitly records `videoCaptureBackend: "none"`. The image-codec
implementation is preserved. The emulator demo exercised image encoding,
grayscale/Canny processing, generated-image display, and real ncnn inference.

The pinned ncnn `CMakeLists.txt` defines `NCNN_SHARED_LIB`,
`NCNN_DISABLE_RTTI`, and `NCNN_DISABLE_EXCEPTION`. Android sets them to ON, OFF,
and OFF respectively; the Apple defaults remain untouched. ncnn installs its
library and generated export headers with `NCNN_INSTALL_SDK=ON`;
Android explicitly selects `CMAKE_INSTALL_LIBDIR=lib`.

Both Android vendors use NDK Clang, arm64-v8a, API 28, C++20, RTTI, exceptions,
PIC, and `c++_shared`, with `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`. OpenMP and
Vulkan remain disabled. The default NDK is `27.1.12297006`, matching
`android/app/build.gradle.kts`. `VISION_ANDROID_NDK` may select an installation,
but the app must use that same NDK revision.

The Android receipt retains the versions, source archive hashes, and CPU-only
flag, and adds:

```json
{
  "linkage": "shared",
  "android": {
    "abi": "arm64-v8a",
    "api": 28,
    "stl": "c++_shared",
    "cxxStandard": 20,
    "rtti": true,
    "exceptions": true,
    "ndkRevision": "27.1.12297006",
    "videoCaptureBackend": "none"
  },
  "patches": {
    "opencvAndroidHighgui": "<SHA-256 of the checked-in Android highgui hook>"
  }
}
```

The revision is read from the selected NDK's `source.properties`. These fields
describe the requested successful preparation configuration; they are not an ELF
inspection or runtime attestation. The shared success receipt is invalidated
before rebuilding and written only after both installs and all four `.so` file
checks complete. Preparation also rejects a hook changed during the build,
rather than recording a hash for a different patch recipe.

The wrapper's CMake checks the receipt against the lock and its selected NDK,
ABI, API, STL, and C++ standard, requires RTTI/exceptions, and verifies the local
Android hook hash and explicit camera-backend limitation in the receipt.
It imports each vendor as `SHARED` with `IMPORTED_LOCATION`, and models
`highgui -> imgproc -> core`. All four imported targets are also direct members
of the wrapper's interface dependency list so Gradle's external native build
can discover/package them. The wrapper explicitly enables exceptions and RTTI.
There is no duplicate `jniLibs` copy step.

## Prerequisite checks

Previously, `scripts/prerequisites.mjs:checkVision()` checked
`vision/vendor/install/android-arm64/lib/*.a` and the legacy receipt. Those old
files can make prebuild incorrectly report Vision as current and skip shared
preparation. It now requires the shared files and receipt instead.

The Android branch requires:

- The four `shared/lib/*.so` paths above.
- `shared/native-routes-vision.json` with `target: "android-arm64"`,
  `linkage: "shared"`, matching versions/source pins and `cpuOnly: true`.
- The Android ABI/API/STL/C++/RTTI/exception contract and a well-formed NDK
  revision. CMake additionally enforces equality with the app's selected NDK.
- `android.videoCaptureBackend: "none"` and `patches.opencvAndroidHighgui`
  matching the SHA-256 of the checked-in Android highgui hook. Reject missing or
  stale patch metadata so an older receipt cannot conceal a different recipe.
- Rejection of a legacy static-only install, missing shared file/receipt, wrong
  linkage, stale pins, or incompatible Android toolchain fields.

The iOS prerequisites and receipt rules stay unchanged. The existing CLI already
calls the same preparation script with `--target android-arm64`; no new selector
is needed. CMake additionally matches the receipt to the selected app NDK.
With the NDK legacy toolchain, `CMAKE_SYSTEM_VERSION` is `1`; the check uses
the resolved `ANDROID_NATIVE_API_LEVEL` and still requires API 28. The actual
compiler target is `aarch64-none-linux-android28`.

## Build and acceptance commands

Start from the repository root. Use the same NDK for preparation and Gradle:

```sh
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
export VISION_ANDROID_NDK="$ANDROID_SDK_ROOT/ndk/27.1.12297006"
export VISION_CMAKE="$ANDROID_SDK_ROOT/cmake/4.1.2/bin/cmake"
export PATH="$ANDROID_SDK_ROOT/cmake/4.1.2/bin:$PATH"
node vision/scripts/prepare-native.cjs --target android-arm64 --jobs 8
```

Inspect both new CMake caches and compile/link commands for API 28, arm64-v8a,
the selected NDK Clang, `c++_shared`, RTTI/exceptions, PIC, and the flexible page
size setting. Confirm OpenCV `BUILD_SHARED_LIBS=ON`,
`BUILD_opencv_world=OFF`, the Android hook directory, and only the three requested
modules. Verify the generated highgui snapshot has all five Android exclusions,
the source list compiles that snapshot, and the original source hash is
unchanged. The configure log must explicitly report that VideoCapture has no
Android camera backend. Confirm ncnn
`NCNN_SHARED_LIB=ON`, `NCNN_DISABLE_RTTI=OFF`,
`NCNN_DISABLE_EXCEPTION=OFF`, and OpenMP/Vulkan OFF. Compare source receipt pins
with `vision/vendor-lock.json`. Existing static outputs must remain intact.

The normal app build command is:

```sh
pnpm build:android
```

For a focused native/package pass with the parent's other app prerequisites
already satisfied:

```sh
cd android
./gradlew :app:externalNativeBuildDebug :app:assembleDebug
cd ..
```

Use the NDK ELF tools to inspect the installed vendors, Gradle-built wrapper,
and packaged binaries. The local macOS NDK uses this host tools directory:

```sh
VISION_ELF_TOOLS="$VISION_ANDROID_NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin"
for library in opencv_core opencv_imgproc opencv_highgui ncnn; do
  "$VISION_ELF_TOOLS/llvm-readelf" -h -d -l \
    "vision/vendor/install/android-arm64/shared/lib/lib${library}.so"
done
find android/app -name libvaldi_routes_vision.so -print
unzip -l android/app/build/outputs/apk/debug/app-debug.apk 'lib/arm64-v8a/*'
```

Run the same `llvm-readelf -h -d -l` on the wrapper and binaries extracted from
the APK into a new temporary directory. Expected acceptance evidence:

- All five project ELF files are AArch64 `DYN` objects. Each SONAME is its
  unversioned basename: `libvaldi_routes_vision.so`, `libopencv_core.so`,
  `libopencv_imgproc.so`, `libopencv_highgui.so`, and `libncnn.so`.
  OpenCV explicitly omits Android version properties; the inspected Android
  CMake platform defaults to unversioned SONAMEs even though ncnn sets
  VERSION/SOVERSION. Reject `.so.1` or absolute build paths in `DT_NEEDED`.
- The wrapper references the OpenCV and ncnn DSOs through `DT_NEEDED`.
  `VisionCore.cpp` uses all three OpenCV components and ncnn, so expect all
  four vendor basenames as direct entries; inspect the actual linker result.
- `opencv_highgui` needs `opencv_imgproc` and `opencv_core`;
  `opencv_imgproc` needs `opencv_core`. Inspect the entire recursive
  `DT_NEEDED` closure, including `libc++_shared.so`. Additional NDK system
  libraries such as libc/libm/libdl/liblog/libandroid/libjnigraphics can vary
  by DSO and linker elimination. No OpenMP/Vulkan runtime should be introduced.
- The APK contains the wrapper, all four vendor `.so` files, and exactly one
  compatible `libc++_shared.so` under `lib/arm64-v8a/`. Every non-system
  `DT_NEEDED` resolves to a packaged basename. Verify the packaged copies
  rather than relying only on vendor install files or Gradle's build tree.
- Inspect ELF LOAD alignment for 16 KiB compatibility and APK alignment using
  the parent's installed Android build tools. The option is configured here;
  alignment is not proven by source inspection.
- A subsequent real device run loads the wrapper and exercises both the OpenCV
  image encode/decode/processing path and ncnn inference without loader or
  unresolved-symbol failures. Only that later evidence can establish dynamic
  runtime behavior.

Do not delete old vendor outputs or archive caches to make this build pass.

## Observed results, 2026-11-05

The shared preparation and Android Debug build succeeded. Inspection of the
actual APK found these stripped native payload sizes (bytes):

| Library | Bytes |
| --- | ---: |
| `libvaldi_routes_vision.so` | 99,176 |
| `libopencv_core.so` | 2,719,784 |
| `libopencv_imgproc.so` | 3,315,240 |
| `libopencv_highgui.so` | 158,904 |
| `libncnn.so` | 4,189,488 |
| `libc++_shared.so` | 1,292,904 |

All five project SONAMEs are unversioned basenames. The wrapper directly needs
all four vendor DSOs; their recursive closure resolves to packaged libraries
or NDK system libraries. There is one packaged C++ shared runtime.
All six packaged ELF files have LOAD alignment of at least 16 KiB, and their
uncompressed APK entries begin at 16 KiB-aligned offsets. This is an artifact
alignment check, not a physical-device compatibility claim.

The installed APK SHA-256 matches the inspected build. These libraries are
mapped directly from uncompressed APK entries: process mappings were correlated
with each ELF's ZIP byte range, finding mappings for all four vendors, the
wrapper, and the C++ runtime.

The existing `vision-demo` flow passed twice on the Android arm64/API 36
emulator: 26 passing checks per run, zero failures/errors, and four expected
login-branch skips because the preserved account was already signed in.
This exercised the generated image, OpenCV processing and ncnn's weightless
channel-response graph; it is not a trained-model accuracy or performance test.
No physical-device, GPU/Vulkan, or Android camera-backend claim is made.

Evidence: `/tmp/valdi-media-demo-20261105/android-vision-shared/`, including
`packaged-elf.json`, `installed-binding.json`, and `loaded-apk-mappings.json`.
The two `prepare` logs preserve the initial unresolved V4L2 failure and its
Android-only correction. The app build logs preserve the NDK API-check failure
and the subsequent successful build.
The parent-observed two-run summaries and their flow/APK hashes are indexed in
`/tmp/valdi-media-demo-20261105/validation-final.json`. They are explicitly labeled
tool-result summaries rather than exported raw runner reports.
