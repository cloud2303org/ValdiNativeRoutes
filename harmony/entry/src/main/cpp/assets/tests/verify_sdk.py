#!/usr/bin/env python3
"""Compile production sources for both ABIs and link every imported SDK C symbol.

Uses actual parent-generated compile_commands.json, pinned Valdi headers and SDK
headers/libraries. Does not configure/build the parent, modify upstream, run a
device, or claim to execute the SDK decoder on macOS.
"""

import argparse
import concurrent.futures
import json
import pathlib
import shlex
import subprocess
import tempfile


def run(command, cwd=None):
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(shlex.join(command) + "\n" + result.stdout + result.stderr)
    return result.stdout


def verify_metadata(ast_text):
    """Check overloads selected in the real production method, not a JS replica."""
    def walk(node):
        yield node
        for child in node.get("inner", []):
            yield from walk(child)

    # Clang emits a separate JSON document for the declaration and definition.
    decoder = json.JSONDecoder()
    fields = {}
    while ast_text.strip():
        root, end = decoder.raw_decode(ast_text.lstrip())
        ast_text = ast_text.lstrip()[end:]
        for node in walk(root):
            if node["kind"] != "CXXMemberCallExpr":
                continue
            receiver, *args = node.get("inner", [])
            if receiver.get("name") != "setMapValue" or len(args) != 2:
                continue
            keys = [n["value"] for n in walk(args[0]) if n["kind"] == "StringLiteral"]
            values = [n for n in walk(args[1]) if n["kind"] == "CXXConstructExpr"
                      and n.get("type", {}).get("qualType") == "Valdi::Value"]
            if len(keys) != 1 or len(values) != 1:
                raise RuntimeError("Expected a literal metadata key and one Valdi::Value constructor")
            key = json.loads(keys[0])
            fields[key] = {"constructor": values[0]["ctorType"]["qualType"],
                           "strings": [json.loads(n["value"]) for n in walk(values[0])
                                       if n["kind"] == "StringLiteral"]}

    for key in ("width", "height", "sourceWidth", "sourceHeight", "rowStride",
                "allocationBytes", "pixelFormat", "alphaType"):
        if fields.get(key, {}).get("constructor") != "void (int32_t) noexcept":
            raise RuntimeError(f"Metadata {key} must use Valdi::Value(int32_t), got {fields.get(key)}")
    discriminator = fields.get("type", {})
    if (discriminator.get("constructor") != "void (const Valdi::StringBox &) noexcept"
            or discriminator.get("strings") != ["image"]):
        raise RuntimeError(f"Metadata must contain string type:'image', got {discriminator}")
    return fields


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compile-commands", required=True, type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path)
    options = parser.parse_args()
    output = options.output or pathlib.Path(tempfile.mkdtemp(prefix="harmony-image-sdk-"))
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    assets = pathlib.Path(__file__).resolve().parents[1]
    entries = json.loads(options.compile_commands.read_text())
    entry = next(e for e in entries if "/host/" in e["file"])
    command = shlex.split(entry["command"])
    for flag in ("-o", "-c"):
        index = command.index(flag)
        del command[index:index + 2]
    native = pathlib.Path(command[0]).parents[2]
    nm = native / "llvm/bin/llvm-nm"
    compiler = command[0]
    sysroot = next(a for a in command if a.startswith("--sysroot="))
    sources = sorted(assets.glob("*.cpp"))

    def compile_object(target, source):
        obj = output / f"{target}-{source.stem}.o"
        args = [f"--target={target}-linux-ohos" if a.startswith("--target=") else a for a in command]
        args += ["-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
                 "-Wno-unused-command-line-argument", "-c", str(source), "-o", str(obj)]
        run(args, cwd=entry["directory"])
        return obj

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = {target: [executor.submit(compile_object, target, source) for source in sources]
                   for target in ("aarch64", "x86_64")}
        objects = {target: [future.result() for future in tasks] for target, tasks in futures.items()}

    report = {}
    for target, files in objects.items():
        args = [f"--target={target}-linux-ohos" if a.startswith("--target=") else a for a in command]
        ast = run(args + ["-fsyntax-only", "-Wno-unused-command-line-argument",
                         "-Xclang", "-ast-dump=json", "-Xclang",
                         "-ast-dump-filter=ValdiHarmony::HarmonyImageAsset::getMetadata",
                         str(assets / "HarmonyImageAsset.cpp")], cwd=entry["directory"])
        metadata = verify_metadata(ast)
        symbols = set()
        for obj in files:
            undefined = run([str(nm), "--undefined-only", "--format=posix", str(obj)])
            symbols.update(line.split()[0] for line in undefined.splitlines()
                           if line.startswith("OH_"))
        # GetImageInfo fills alphaMode in the audited native C API. Ensure both
        # production decoder/filter objects use the paired getter, not the
        # separate legacy alphaType field that stayed zero in the r3 path.
        if "OH_PixelmapImageInfo_GetAlphaType" in symbols:
            raise RuntimeError(f"{target}: production metadata must use GetAlphaMode with GetImageInfo")
        if "OH_PixelmapImageInfo_GetAlphaMode" not in symbols:
            raise RuntimeError(f"{target}: production metadata is missing the paired GetAlphaMode import")
        # Check the public presentation contract too, without editing backend code.
        symbols.update(("OH_ArkUI_DrawableDescriptor_CreateFromPixelMap",
                        "OH_ArkUI_DrawableDescriptor_Dispose"))
        libraries = {
            "image_source": native / f"sysroot/usr/lib/{target}-linux-ohos/libimage_source.so",
            "pixelmap": native / f"sysroot/usr/lib/{target}-linux-ohos/libpixelmap.so",
            "native_drawing": native / f"sysroot/usr/lib/{target}-linux-ohos/libnative_drawing.so",
            "ace_ndk.z": native / f"sysroot/usr/lib/{target}-linux-ohos/libace_ndk.z.so",
        }
        exports = {}
        for name, library in libraries.items():
            text = run([str(nm), "--dynamic", "--defined-only", "--format=posix", str(library)])
            exports[name] = {line.split()[0].split("@")[0] for line in text.splitlines() if line}
        owners = {}
        for symbol in sorted(symbols):
            owners[symbol] = [name for name, names in exports.items() if symbol in names]
            if not owners[symbol]:
                raise RuntimeError(f"{target}: no SDK export for {symbol}")
        probe = output / f"{target}-imports.cpp"
        probe.write_text(
            '#include <multimedia/image_framework/image/image_source_native.h>\n'
            '#include <multimedia/image_framework/image/pixelmap_native.h>\n'
            '#include <arkui/drawable_descriptor.h>\n' +
            '#include <native_drawing/drawing_canvas.h>\n'
            '#include <native_drawing/drawing_brush.h>\n'
            '#include <native_drawing/drawing_filter.h>\n'
            '#include <native_drawing/drawing_color_filter.h>\n'
            '#include <native_drawing/drawing_image_filter.h>\n'
            '#include <native_drawing/drawing_pixel_map.h>\n'
            '#include <native_drawing/drawing_rect.h>\n' +
            "\n".join(f'decltype(&{symbol}) volatile image_import_{i} = &{symbol};'
                      for i, symbol in enumerate(sorted(symbols))) +
            '\nextern "C" ArkUI_DrawableDescriptor* harmony_image_presentation_probe('
            'OH_PixelmapNative* pixelmap) {\n'
            '  return OH_ArkUI_DrawableDescriptor_CreateFromPixelMap(pixelmap);\n}\n')
        linked = output / f"{target}-sdk-imports.so"
        run([compiler, f"--target={target}-linux-ohos", sysroot, "-std=c++20", "-fPIC", "-shared",
             "-Werror", str(probe), "-Wl,--no-undefined", "-limage_source", "-lpixelmap",
             "-lnative_drawing", "-lace_ndk.z", "-o", str(linked)])
        drawing_object = next(f for f in files if f.stem.endswith("-HarmonyImageDrawing"))
        drawing_linked = output / f"{target}-production-drawing.so"
        run([compiler, f"--target={target}-linux-ohos", sysroot, "-shared",
             str(drawing_object), "-Wl,--no-undefined", "-lnative_drawing", "-lpixelmap",
             "-o", str(drawing_linked)])
        report[target] = {"objects": [str(f) for f in files], "metadataConstructors": metadata,
                          "sdkImports": owners,
                          "noUndefinedImportProbe": str(linked),
                          "noUndefinedProductionDrawing": str(drawing_linked)}
        print(f"{target}: {len(files)} production objects, {len(symbols)} SDK exports, "
              "--no-undefined import probe + production Drawing link; metadata assertions passed")
    (output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Evidence: {output / 'verification.json'}")


if __name__ == "__main__":
    main()
