# Harmony Device display dimensions

The full-development r1 startup log reaches Hermes debugger 44793 and Valdi
debugger 13592, then LoginPage creation fails in the pinned official
`DebugConsole.tsx:111` because `Device.getDisplayHeight()` throws
`Harmony host does not support getDisplayHeight`.
The parent supplied the corresponding JS-worker SIGABRT and symbolication to
`JavaScriptRuntime::handleUncaughtJsErrorNoHandler` at line 4724.
The implementation preserves that uncaught-error policy and all DEV features.

## Production scope

Only `harmony/entry/src/main/cpp/host/HarmonyBridgeModules.cpp` changes.
`HarmonyBridgeModules.hpp`, `HostConfiguration`, factory/module ownership,
observers, lifecycle, native mount ABI, and existing window/scale metadata stay
byte-for-byte unchanged.

The two DeviceBridge bindings synchronously read the default display's physical
pixel dimension and logical density from the SDK, then return
`double(pixels) / double(density)`. They do not return window/content dimensions.
There is no retained Ability context, node, SDK handle, listener, promise, or
display singleton added by the app.

Every SDK error becomes a Valdi exception naming the operation and numeric SDK
error. A non-positive dimension or non-finite/non-positive density also raises
an explicit exception. No failure returns a numeric fallback.

## Exact parent-owned CMake integration

Add `native_display_manager` to **valdi_harmony PRIVATE** link libraries.
No CMake file was edited by this task.

Installed SDK root:

```text
/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native
```

Official SDK header: `sysroot/usr/include/window_manager/oh_display_manager.h`.
Error enum: `sysroot/usr/include/window_manager/oh_display_info.h`.
Library: `sysroot/usr/lib/{x86_64,aarch64}-linux-ohos/libnative_display_manager.so`.
The three symbols have existed since API 12 and are present in both installed
SDK ABI stubs:

```cpp
NativeDisplayManager_ErrorCode OH_NativeDisplayManager_GetDefaultDisplayWidth(int32_t*);
NativeDisplayManager_ErrorCode OH_NativeDisplayManager_GetDefaultDisplayHeight(int32_t*);
NativeDisplayManager_ErrorCode OH_NativeDisplayManager_GetDefaultDisplayDensityPixels(float*);
```

The SDK documents width/height as px and density as the coefficient between
physical and logical pixels. The pinned Android `ValdiDeviceModule.kt` divides
real display metrics by `DisplayMetrics.density`. Pinned iOS
`SCValdiDeviceModule.m` returns UIKit point dimensions with a separate
`screen.scale`. Harmony therefore returns VP-equivalent logical dimensions.
The existing `getDisplayScale` metadata binding is not changed.

The installed `arkui/native_node.h` explicitly constrains Node APIs to the main
thread and does not declare these display-dimension getters. The selected
DisplayManager C API takes scalar output pointers, needs no UI node/context,
and specifies no main-thread restriction. The official OpenHarmony
`window_window_manager/dm/src/oh_display_manager.cpp` implementation was also
read: the three getters synchronously call `OH_GetDefaultDisplayInfo()`, which
uses `DisplayManager::GetDefaultDisplaySync()` and `GetDisplayInfo()`. This is
supporting implementation evidence; the installed SDK headers and exports
remain the ABI authority. Actual SDK service behavior on the parent's device
still requires the parent's HAP replay.

The pinned DebugConsole directly calls only `getDisplayHeight`,
`observeDisplayInsetChange`, `getDisplayTopInset`, and `getDisplayBottomInset`.
The last three already have bindings. This change adds no unrelated Device
methods or fabricated platform answers.

## Validation performed on November 3, 2026 (Asia/Shanghai)

Source regression:

```sh
node --test scripts/harmony/tests/device-display.test.mjs
```

Before editing: **1 failed / 3 passed**, failing because there is no real
display getter binding. After editing: **4 passed / 0 failed**.

Native slot was explicitly granted by the parent. All compiler/linker
invocations ran serially, with no app/runtime build or existing runtime archive
used:

```sh
python3 scripts/harmony/tests/device-display-probe.py \
  --native-lease parent-device-display-light-2026-11-03 \
  --x86-commands /tmp/valdi-fork-ui-assets-adoption-proof-r3/x86_64-fork-fork-ui/compile_commands.json \
  --arm64-commands /tmp/valdi-fork-ui-assets-adoption-proof-r3/arm64-v8a-fork-fork-ui/compile_commands.json \
  --output /tmp/valdi-device-display-native-r1
```

The runner requires a fresh output directory and an explicit native lease.
It does not configure CMake, regenerate inputs, alter shared build outputs,
start a runtime, or touch devices/ports.

Results:

- **Real bridge RED:** reconstruct the exact original source bytes, verify
  their independently recorded SHA-256, compile the original bridge, then load
  its actual ModuleFactory/DeviceBridge and confirm both display getters throw
  the original unsupported errors without calling the SDK boundary.
- **Real bridge GREEN:** compile the production bridge as a separate
  translation unit with fresh real Valdi utility objects from the maintained
  fork selected by the adoption proof. Only the three SDK C functions are
  replaced at the OS boundary. ASan and UBSan are enabled with halt-on-error.
  Tests cover fractional logical dimensions, multiple densities, dimensions
  distinct from window metadata, fresh SDK reads after resize/rotation,
  synchronous worker calls, SDK errors on either dimension and density,
  zero/negative dimensions, zero/negative/NaN/infinite density, recovery after
  failure, existing size observers, and state release after module destruction.
- **Actual SDK production objects:** both x86_64 and arm64-v8a compile the real
  `HarmonyBridgeModules.cpp` with their own adoption proof app flags, including
  full-development and maintained-fork UI selection. Each object imports
  exactly the three selected DisplayManager symbols.
- **SDK ABI and strict links:** the independent SDK consumer checks the three
  function types with `static_assert`. On each ABI the strict shared-library
  link fails on all three symbols when the library is omitted, then passes
  with the actual SDK library, whose name appears in `DT_NEEDED`.

Frozen evidence:

```text
/private/tmp/valdi-device-display-native-r1/manifest.json
/private/tmp/valdi-device-display-native-r1/commands.json
/private/tmp/valdi-device-display-native-r1/host-run-red.log
/private/tmp/valdi-device-display-native-r1/host-run-green.log
/private/tmp/valdi-device-display-native-r1/sdk-production-imports-x86_64.log
/private/tmp/valdi-device-display-native-r1/sdk-production-imports-arm64-v8a.log
```

The manifest hashes consumed source/header inputs, SDK libraries, logs,
executables, both production objects, isolated SDK probes, and source
snapshots. It records one parallel job and explicitly marks app build,
runtime build, and device replay as unexecuted.

Freeze SHA-256:

```text
Before HarmonyBridgeModules.cpp:
34806da31c10ded307c13aeab78034eb17dc7323ef312498287f2ef71a4675bb
After HarmonyBridgeModules.cpp:
0a09b046b54896b1d33b9d6f24f6b1a3f344f35c0601383346a47629b2cbf793
Unchanged HarmonyBridgeModules.hpp:
01f76618067d9f8864d90159146c4dbe60d6ded70f9a2e87e7b17a5b3f7b328c
```

The SDK stub probes are not device execution or a full production-app link.
The parent owns the CMake link addition, fresh HAP build, installation, and
startup/UI replay. The historical r1 HAP and runtime source boundary stay
historical evidence and are not claimed as validation of this change.
