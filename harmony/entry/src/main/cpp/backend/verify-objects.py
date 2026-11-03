#!/usr/bin/env python3
"""Compile real backend objects using the runtime build's staged OHOS includes."""

import argparse
import hashlib
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile


def main():
    root = Path(__file__).resolve().parents[6]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--compdb",
        type=Path,
        default=root / ".tools/harmony/runtime-x86_64/compile_commands.json",
    )
    parser.add_argument("--output", type=Path, default=Path("/tmp/valdi-arkui-objects"))
    parser.add_argument("--baseline", type=Path,
                        help="Prior verification.json whose SDK imports must all be preserved")
    options = parser.parse_args()
    backend = Path(__file__).parent
    protected = {
        "NativeTextInput.inc": "89135a690e812393a5aaf8b45d43b0ad7ffb10267f61341051056a3e8d5be10a",
        "InputState.hpp": "8f0f102fe3e667b607054524a16198498e8bc0fd86579c8b68e42e54effc0cdb",
        "NativeLabel.inc": "ad85faace7940c6ea5084211d20fb90fedc38edc7c00c28d8a7b09391bfa50fd",
    }
    def source_snapshot():
        return {str(path.relative_to(backend)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted(backend.rglob("*"))
                if path.is_file() and (path.suffix in {".cpp", ".hpp", ".inc", ".py", ".md"}
                                       or path.name == "CMakeLists.txt")}
    frozen_sources = source_snapshot()
    for name, digest in protected.items():
        if frozen_sources[name] != digest:
            raise RuntimeError(f"Protected source changed: {name}")
    baseline = json.loads(options.baseline.read_text()) if options.baseline else {}
    # Execute production interpolation/spring/timeline math on the host. These
    # tests do not simulate ArkUI callbacks or claim device execution.
    host_test = options.output.resolve() / "animation-math-test"
    options.output.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
         str(backend / "tests/animation-math.cpp"), "-o", str(host_test)], check=True
    )
    subprocess.run([str(host_test)], check=True)
    gesture_test = options.output.resolve() / "gesture-state-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-pthread", "-Wall", "-Wextra", "-Werror",
         str(backend / "tests/gesture-state.cpp"), "-o", str(gesture_test)], check=True
    )
    subprocess.run([str(gesture_test)], check=True)
    scroll_test = options.output.resolve() / "scroll-state-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
         str(backend / "tests/scroll-state.cpp"), "-o", str(scroll_test)], check=True
    )
    subprocess.run([str(scroll_test)], check=True)
    font_image_test = options.output.resolve() / "font-image-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-pthread", "-Wall", "-Wextra", "-Werror",
         "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
         str(backend / "tests/font-image.cpp"), "-o", str(font_image_test)], check=True
    )
    subprocess.run([str(font_image_test)], check=True)
    input_test = options.output.resolve() / "input-state-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
         "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
         str(backend / "tests/input-state.cpp"), "-o", str(input_test)], check=True
    )
    subprocess.run([str(input_test)], check=True)
    label_test = options.output.resolve() / "label-text-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
         "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
         str(backend / "tests/label-text.cpp"), "-o", str(label_test)], check=True
    )
    subprocess.run([str(label_test)], check=True)
    snapshot_test = options.output.resolve() / "snapshot-lifetime-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-pthread", "-Wall", "-Wextra", "-Werror",
         "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
         str(backend / "tests/snapshot-lifetime.cpp"), "-o", str(snapshot_test)], check=True
    )
    subprocess.run([str(snapshot_test)], check=True)
    entries = json.loads(options.compdb.read_text())
    entry = next(
        row for row in entries if row["file"].endswith("/valdi/runtime/Views/View.cpp")
    )
    original = entry.get("arguments") or shlex.split(entry["command"])
    sysroot = Path(next(arg.split("=", 1)[1] for arg in original if arg.startswith("--sysroot=")))
    mount_evidence = options.output.resolve() / "mount-reentry"
    subprocess.run(
        [sys.executable, str(backend / "tests/verify-mount-reentry.py"),
         "--sdk-includes", str(sysroot / "usr/include"), "--output", str(mount_evidence)], check=True
    )
    refresh_evidence = options.output.resolve() / "refresh-native"
    subprocess.run(
        [sys.executable, str(backend / "tests/verify-refresh-native.py"),
         "--sdk-includes", str(sysroot / "usr/include"), "--output", str(refresh_evidence)], check=True
    )
    refresh_scroll_evidence = options.output.resolve() / "refresh-scroll-review"
    subprocess.run(
        [sys.executable, str(backend / "tests/verify-refresh-scroll.py"),
         "--sdk-includes", str(sysroot / "usr/include"), "--output", str(refresh_scroll_evidence)], check=True
    )
    # Run the actual pinned parser, not a local reimplementation or ABI stub.
    parser_source = Path(next(row["file"] for row in entries
                              if row["file"].endswith("/valdi_core/cpp/Utils/GeometricPath.cpp")))
    upstream = parser_source.parents[5]
    shape_test = options.output.resolve() / "shape-state-test"
    subprocess.run(
        [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
         "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
         f"-I{upstream / 'valdi_core/src'}", f"-I{upstream / 'libs/utils/src'}",
         f"-I{root / '.tools/harmony/runtime-x86_64/generated'}",
         f"-I{root / '.tools/harmony/runtime-inputs/external/fmt/include'}",
         f"-I{root / '.tools/harmony/runtime-inputs/external/zoo/inc'}",
         str(backend / "tests/shape-state.cpp"), str(parser_source), "-o", str(shape_test)], check=True
    )
    shape_fixture = options.output.resolve() / "shape-builder-chevron.bin"
    builder = upstream / "src/valdi_modules/src/valdi/valdi_core/src/utils/GeometricPathBuilder.ts"
    subprocess.run(
        [str(root / "tools/valdi-rolldown/node_modules/.bin/tsx"), "-e",
         f"import {{GeometricPathBuilder}} from {json.dumps(str(builder))};"
         "import {writeFileSync} from 'node:fs';"
         "const path = new GeometricPathBuilder(24,24,2).moveTo(15,6).lineTo(9,12).lineTo(15,18).build();"
         f"writeFileSync({json.dumps(str(shape_fixture))},Buffer.from(path.buffer,path.byteOffset,path.byteLength));"],
        cwd=root, check=True
    )
    subprocess.run([str(shape_test), str(shape_fixture)], check=True)
    source = Path(__file__).with_name("ArkUIViewManager.cpp").resolve()
    report = {
        "mountReentryRegression": json.loads((mount_evidence / "verification.json").read_text()),
        "refreshNativeRegression": json.loads((refresh_evidence / "verification.json").read_text()),
        "refreshScrollReview": json.loads((refresh_scroll_evidence / "verification.json").read_text()),
    }
    options.output.mkdir(parents=True, exist_ok=True)
    # The upstream includes use phmap/; the dependency archive uses parallel_hashmap/.
    # This temporary include alias points only to the real dependency headers.
    with tempfile.TemporaryDirectory(prefix="valdi-arkui-includes-") as temporary:
        include = Path(temporary)
        phmap = root / ".tools/harmony/runtime-inputs/external/phmap/parallel_hashmap"
        (include / "phmap").symlink_to(phmap)
        for arch, target in (
            ("x86_64", "x86_64-linux-ohos"),
            ("arm64", "aarch64-linux-ohos"),
        ):
            command = list(original)
            command = [
                f"--target={target}" if arg.startswith("--target=") else arg
                for arg in command
            ]
            command[command.index("-c") + 1] = str(source)
            output = options.output.resolve() / f"ArkUIViewManager-{arch}.o"
            command[command.index("-o") + 1] = str(output)
            command.extend(
                [
                    f"-I{include}",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-Wno-unused-parameter",
                ]
            )
            subprocess.run(command, cwd=entry["directory"], check=True)
            print(f"{target}: {output}", flush=True)
            # Check the real SDK's target libraries for every imported ArkUI
            # and Drawing C symbol, including scroll component events.
            nm = Path(original[0]).parent / "llvm-nm"
            sysroot = Path(next(arg.split("=", 1)[1] for arg in original if arg.startswith("--sysroot=")))
            asset_output = options.output.resolve() / f"HarmonyImageAsset-{arch}.o"
            asset_command = list(command)
            asset_command[asset_command.index("-c") + 1] = str(backend.parent / "assets/HarmonyImageAsset.cpp")
            asset_command[asset_command.index("-o") + 1] = str(asset_output)
            subprocess.run(asset_command, cwd=entry["directory"], check=True)
            parser_output = options.output.resolve() / f"GeometricPath-{arch}.o"
            parser_command = list(command)
            parser_command[parser_command.index("-c") + 1] = str(parser_source)
            parser_command[parser_command.index("-o") + 1] = str(parser_output)
            subprocess.run(parser_command, cwd=entry["directory"], check=True)
            ref_output = options.output.resolve() / f"native-ref-consumer-{arch}.o"
            ref_command = list(command)
            ref_command[ref_command.index("-c") + 1] = str(backend / "tests/native-ref-consumer.cpp")
            ref_command[ref_command.index("-o") + 1] = str(ref_output)
            subprocess.run(ref_command, cwd=entry["directory"], check=True)
            backend_imports = subprocess.check_output(
                [str(nm), "--undefined-only", "--demangle", str(output)], text=True)
            if "Valdi::GeometricPath::visit(" not in backend_imports:
                raise RuntimeError(f"{target}: backend must consume the actual upstream GeometricPath parser")
            # Prove the standalone backend closes its Harmony asset typeinfo/
            # vtable/method references against the actual asset implementation.
            combined = options.output.resolve() / f"backend-closure-{arch}.o"
            subprocess.run([str(Path(original[0]).parent / "ld.lld"), "-r",
                            str(output), str(asset_output), str(parser_output), str(ref_output),
                            "-o", str(combined)], check=True)
            closure_imports = subprocess.check_output(
                [str(nm), "--undefined-only", "--demangle", str(combined)], text=True)
            if "ValdiHarmony::HarmonyImageAsset" in closure_imports:
                raise RuntimeError(f"{target}: standalone asset references not closed")
            if "Valdi::Harmony::ArkUIViewNodeRef" in closure_imports:
                raise RuntimeError(f"{target}: actual native-ref consumer references not closed")
            if "Valdi::GeometricPath::" in closure_imports or "Valdi::GeometricPathIterator::" in closure_imports:
                raise RuntimeError(f"{target}: actual upstream GeometricPath parser references not closed")
            imports = subprocess.check_output([str(nm), "--undefined-only", str(combined)], text=True)
            required = {line.split()[-1] for line in imports.splitlines()
                        if line.split() and line.split()[-1].startswith((
                            "OH_ArkUI_", "OH_Drawing_", "OH_PixelmapNative_", "OH_PixelmapImageInfo_",
                            "OH_ImagePackerNative_", "OH_PackingOptions_"))}
            exports = set()
            for library in ("libace_ndk.z.so", "libnative_drawing.so", "libpixelmap.so", "libimage_packer.so"):
                symbols = subprocess.check_output(
                    [str(nm), "--dynamic", "--defined-only", str(sysroot / "usr/lib" / target / library)],
                    text=True)
                exports.update(line.split()[-1].split("@")[0] for line in symbols.splitlines() if line.split())
            missing = required - exports
            if missing:
                raise RuntimeError(f"{target}: SDK symbols missing: {sorted(missing)}")
            legacy = set(baseline.get(target, {}).get("sdkImports", []))
            if legacy - required:
                raise RuntimeError(f"{target}: prior SDK imports lost: {sorted(legacy - required)}")
            # Scroll event decoding is a real SDK import, rather than a local
            # placeholder implementation accidentally satisfying the compile.
            scroll_symbols = {"OH_ArkUI_NodeEvent_GetEventType", "OH_ArkUI_NodeEvent_GetUserData",
                              "OH_ArkUI_NodeEvent_GetNodeComponentEvent"}
            if not scroll_symbols <= required:
                raise RuntimeError(f"{target}: native scroll event imports absent: {sorted(scroll_symbols - required)}")
            image_font_symbols = {
                "OH_ArkUI_DrawableDescriptor_CreateFromPixelMap", "OH_ArkUI_DrawableDescriptor_Dispose",
                "OH_PixelmapNative_Destroy", "OH_Drawing_GetFontCollectionGlobalInstance",
                "OH_Drawing_RegisterFontBuffer", "OH_ArkUI_StyledString_CreateTypography",
            }
            if not image_font_symbols <= required:
                raise RuntimeError(f"{target}: image/font imports absent: {sorted(image_font_symbols - required)}")
            if required & {"OH_Drawing_CreateFontCollection", "OH_Drawing_DestroyFontCollection",
                           "OH_Drawing_UnregisterFont"}:
                raise RuntimeError(f"{target}: borrowed global collection lifetime contract violated")
            # StyledString_Create now owns the Drawing handler internally.
            # Keep verifying that real SDK dependency, without manufacturing an
            # unused direct import in the backend merely to satisfy a test.
            if "OH_Drawing_CreateTypographyHandler" not in exports:
                raise RuntimeError(f"{target}: SDK typography handler export absent")
            input_symbols = {"OH_ArkUI_NodeEvent_GetTextChangeEvent", "OH_ArkUI_FocusRequest",
                             "OH_ArkUI_NodeEvent_GetInputEvent", "OH_ArkUI_UIInputEvent_GetAction",
                             "OH_ArkUI_KeyEvent_GetType"}
            if not input_symbols <= required:
                raise RuntimeError(f"{target}: native input imports absent: {sorted(input_symbols - required)}")
            shape_symbols = {
                "OH_ArkUI_NodeCustomEvent_GetDrawContextInDraw", "OH_ArkUI_DrawContext_GetCanvas",
                "OH_Drawing_PathCreate", "OH_Drawing_PathDestroy", "OH_Drawing_PathMoveTo",
                "OH_Drawing_PathLineTo", "OH_Drawing_PathQuadTo", "OH_Drawing_PathCubicTo",
                "OH_Drawing_PathAddRoundRect", "OH_Drawing_PathArcTo", "OH_Drawing_PathClose",
                "OH_Drawing_CanvasScale", "OH_Drawing_CanvasDrawPath",
                "OH_Drawing_PenSetWidth", "OH_Drawing_PenSetCap", "OH_Drawing_PenSetJoin",
                "OH_Drawing_BrushSetColor",
            }
            if not shape_symbols <= required:
                raise RuntimeError(f"{target}: native shape imports absent: {sorted(shape_symbols - required)}")
            label_symbols = {
                "OH_ArkUI_StyledString_Create", "OH_ArkUI_StyledString_Destroy",
                "OH_ArkUI_StyledString_PushTextStyle", "OH_ArkUI_StyledString_AddText",
                "OH_ArkUI_StyledString_PopTextStyle", "OH_ArkUI_StyledString_CreateTypography",
                "OH_Drawing_SetTextStyleFontStyle", "OH_Drawing_SetTextStyleColor",
                "OH_Drawing_SetTextStyleDecoration", "OH_Drawing_SetTextStyleDecorationStyle",
                "OH_Drawing_SetTextStyleLetterSpacing", "OH_Drawing_SetTextStyleAttributeInt",
                "OH_Drawing_SetTextStyleAttributeDouble", "OH_Drawing_SetTypographyTextEllipsis",
            }
            if not label_symbols <= required:
                raise RuntimeError(f"{target}: native label imports absent: {sorted(label_symbols - required)}")
            snapshot_symbols = {
                "OH_ArkUI_GetNodeSnapshot", "OH_ArkUI_CreateSnapshotOptions", "OH_ArkUI_DestroySnapshotOptions",
                "OH_ArkUI_SnapshotOptions_SetScale", "OH_ArkUI_SnapshotOptions_SetColorMode",
                "OH_ArkUI_SnapshotOptions_SetDynamicRangeMode",
                "OH_ImagePackerNative_Create", "OH_ImagePackerNative_PackToDataFromPixelmap",
                "OH_ImagePackerNative_Release", "OH_PackingOptions_Create", "OH_PackingOptions_SetMimeType",
                "OH_PackingOptions_SetQuality", "OH_PackingOptions_Release",
            }
            if not snapshot_symbols <= required:
                raise RuntimeError(f"{target}: native PNG snapshot imports absent: {sorted(snapshot_symbols - required)}")
            probe = options.output.resolve() / f"sdk-imports-{arch}.cpp"
            probe.write_text(
                "".join(f"#include <{header}>\n" for header in (
                    "arkui/native_interface.h", "arkui/native_node.h", "arkui/native_animate.h",
                    "arkui/native_gesture.h", "arkui/native_key_event.h",
                    "arkui/ui_input_event.h", "arkui/drawable_descriptor.h",
                    "arkui/native_interface_focus.h",
                    "arkui/styled_string.h",
                    "native_drawing/drawing_font_collection.h", "native_drawing/drawing_register_font.h",
                    "native_drawing/drawing_text_typography.h",
                    "native_drawing/drawing_path.h", "native_drawing/drawing_canvas.h",
                    "native_drawing/drawing_pen.h", "native_drawing/drawing_brush.h",
                    "native_drawing/drawing_rect.h", "native_drawing/drawing_round_rect.h",
                    "multimedia/image_framework/image/pixelmap_native.h",
                    "multimedia/image_framework/image/image_packer_native.h")) +
                "\n".join(f"decltype(&{symbol}) volatile backend_import_{i} = &{symbol};"
                          for i, symbol in enumerate(sorted(required))) + "\n")
            subprocess.run([original[0], f"--target={target}", f"--sysroot={sysroot}",
                            "-std=c++20", "-fPIC", "-shared", "-Werror", str(probe),
                            "-Wl,--no-undefined", "-lace_ndk.z", "-lnative_drawing", "-lpixelmap", "-limage_packer",
                            "-o", str(options.output.resolve() / f"sdk-imports-{arch}.so")], check=True)
            report[target] = {
                "backendObject": str(output),
                "assetObject": str(asset_output),
                "geometricPathObject": str(parser_output),
                "nativeRefConsumerObject": str(ref_output),
                "standaloneClosureObject": str(combined),
                "sdkImports": sorted(required),
                "preservedBaselineImports": len(legacy),
                "noUndefinedSdkProbe": str(options.output.resolve() / f"sdk-imports-{arch}.so"),
            }
            print(f"{target}: all {len(required)} imported ArkUI/Drawing/pixelmap/PNG symbols exported by SDK; "
                  f"preserved {len(legacy)} baseline imports; standalone asset/ref closure and "
                  "--no-undefined SDK probe passed", flush=True)
    if source_snapshot() != frozen_sources:
        raise RuntimeError("Backend source changed during verification; rerun before freezing")
    report["backendSourceSHA256"] = frozen_sources
    evidence = options.output.resolve() / "verification.json"
    evidence.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Evidence: {evidence}", flush=True)


if __name__ == "__main__":
    main()
