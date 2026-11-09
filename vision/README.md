# Static Vision dependencies

`@vision//:vision_core` is a `cc_library` consumed through the C++ module's
dependencies in ValdiRuntime. It compiles the unchanged `cpp/VisionCore.cpp` and
defines `VALDI_VISION_ENABLED=1` for Android arm64 and iOS arm64 (device or
simulator). Other architectures receive the public header without the define,
algorithm objects, or vendor dependencies. Callers guard algorithm calls with
`VALDI_VISION_ENABLED`.

Android uses the pinned runtime's **NDK 28.0.13004108 (r28), API 31,
`c++_static`** configuration from `android-runtime.json`. Install that SDK NDK,
even when NDK 27 remains installed for other targets:

```sh
sdkmanager "ndk;28.0.13004108"
node vision/scripts/prepare-native.cjs --target android-arm64 --jobs 8
```

Set `ANDROID_SDK_ROOT` or `ANDROID_HOME` when the SDK is outside the standard
host location. Alternatively, set `VISION_ANDROID_NDK` to an existing
28.0.13004108 NDK directory containing `source.properties` and
`build/cmake/android.toolchain.cmake`. An explicit older NDK is rejected.

As an optional cache reuse path, the script discovers an already-fetched
hermetic NDK through `valdi/.valdi-sources/external`, a cold
`valdi/bazel-valdi/external` convenience link, or a normal
`output_base/execroot/_main` convenience link. It also checks the module-build
workspace. With `VALDI_BAZEL_OUTPUT_BASE_ROOT`, it checks only that isolated
root's `valdi/external` and `module-build/external` caches. It does not invoke
Bazel or fetch a missing hermetic NDK; a fresh machine needs the SDK installation
or explicit environment variable above.

The four PIC archives and headers are installed under
`vendor/install/android-arm64/static/`. OpenCV's static core, imgproc, and
highgui archives plus ncnn require `-lm -ldl -llog`; the Bazel target propagates
these options. The runtime toolchain supplies its existing libc++ and libc++abi
once. Do not add `-lc++`, `libc++_shared.so`, or separate STL archives to this
dependency. OpenMP and Vulkan are disabled.

iOS uses `ios-runtime.json` to match the runtime's **15.0** deployment target.
On macOS with Xcode, prepare both arm64 slices and their static XCFramework:

```sh
node vision/scripts/prepare-native.cjs --target ios --jobs 8
```

The product is `vendor/install/ios/VisionDependencies.xcframework`, imported by
`@vision//:ios_archive`. `rules_apple` selects the device or simulator archive.
The normal Apple C++ toolchain supplies system libc++; the vendor dependency
does not add a second STL. Both per-platform receipts and the combined product
receipt must match the deployment target and source pins. The combined receipt
hashes both XCFramework archives, so an older XCFramework cannot pass checks
using newer per-platform receipts.

The module dependency entry point accepts the current exporter platform names:

```sh
node valdi/modules/app_vision/scripts/native-dependencies.mjs check android
node valdi/modules/app_vision/scripts/native-dependencies.mjs check ios
node valdi/modules/app_vision/scripts/native-dependencies.mjs prepare android
node valdi/modules/app_vision/scripts/native-dependencies.mjs prepare ios
```

Android receipts check the exact NDK/API/STL, PIC, exceptions/RTTI, source pins,
OpenCV Android patch, and archive hashes. Existing unqualified static caches or
shared libraries do not satisfy the runtime check. Build caches are retained.
Optional standalone Android shared preparation remains available with
`--target android-arm64 --linkage shared`; CMake consumers select it using
`VISION_VENDOR_LINKAGE=shared`.

The module's native dependency inputs should include `vision/BUILD.bazel`,
`vision/MODULE.bazel`, `vision/android-runtime.json`, `vision/ios-runtime.json`,
`vision/vendor-lock.json`, `vision/scripts`, and `vision/patches`. C++ source
and CMake inputs remain native build inputs.

Focused checks:

```sh
node --test vision/scripts/check-dependencies.test.mjs vision/scripts/android-runtime.test.cjs
```
