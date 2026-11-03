#!/usr/bin/env python3
"""Execute reviewed Scroll/Refresh paths with actual SDK ABI and sanitizers."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk-includes", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--reviewed-old", action="store_true",
                        help="Verify the two reviewed bugs against pre-fix source")
    options = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    mount = runpy.run_path(str(backend / "tests/verify-mount-reentry.py"))
    refresh = runpy.run_path(str(backend / "tests/verify-refresh-native.py"))
    function = mount["function"]
    manager = (backend / "ArkUIViewManager.cpp").read_text()
    scroll = (backend / "NativeScroll.inc").read_text()
    declaration, refresh_source = refresh["production"](backend)
    bodies = ["namespace Valdi::Harmony::detail {\n"]
    bodies.append(function(manager, "static int32_t pixels(") + "\n")
    if "static void validateNativeScrollAxis(" in manager:
        bodies.append(function(manager, "static void validateNativeScrollAxis(") + "\n")
    for signature in (
        "NativeScroll::NativeScroll(", "void NativeScroll::post(",
        "void NativeScroll::retire(", "void NativeScroll::properties(",
        "void NativeScroll::specs(", "void NativeScroll::writeOffset(",
        "void NativeScroll::didLayout(", "void NativeScroll::queueDragTarget(",
        "void NativeScroll::queueCommand(", "void NativeScroll::sample(",
        "void NativeScroll::enqueue(NoticeType type)",
        "void NativeScroll::enqueue(std::initializer_list<NoticeType> types)",
        "void NativeScroll::cancel(",
    ):
        bodies.append(function(scroll, signature) + "\n")
    bodies.append("}\n")
    files = {
        "mount-production.inc": mount["production"](backend),
        "refresh-declaration.inc": declaration,
        "refresh-production.inc": refresh_source,
        "scroll-declaration.inc": function(manager, "struct NativeScroll :") + ";\n",
        "scroll-production.inc": "".join(bodies),
    }
    cases = ("deferred-axis", "immediate-axis", "properties-axis", "vertical-command",
             "orphan-root", "orphan-shutdown")
    mutations = {
        "deferred-axis": ("scroll-production.inc",
                          "        validateNativeScrollAxis(*owner, horizontal);\n", ""),
        "orphan-root": ("mount-production.inc",
                        "                    if (refresh && child->scroll && !child->disposing) child->scroll->properties();\n", ""),
        "properties-axis": ("scroll-production.inc",
                            "    validateNativeScrollAxis(*owner, geometry.horizontal);\n", ""),
    }
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    results = []
    with tempfile.TemporaryDirectory(prefix="valdi-refresh-scroll-sdk-") as temporary:
        include = Path(temporary)
        for name in ("arkui", "info", "ace", "napi", "native_drawing", "multimedia"):
            target = options.sdk_includes / name
            if target.exists():
                (include / name).symlink_to(target, target_is_directory=True)
        for mutation in ("fixed",) if options.reviewed_old else ("fixed", *mutations):
            source = dict(files)
            if mutation != "fixed":
                file, old, new = mutations[mutation]
                if source[file].count(old) != 1:
                    raise RuntimeError("Review negative-control guard changed: " + mutation)
                source[file] = source[file].replace(old, new)
            folder = output / mutation
            folder.mkdir(exist_ok=True)
            for name, text in source.items():
                (folder / name).write_text(text)
            executable = folder / "refresh-scroll"
            subprocess.run([
                shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
                "-Wno-ignored-attributes", "-Wno-unknown-attributes",
                "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                "-I" + str(include), "-I" + str(folder),
                str(backend / "tests/refresh-scroll.cpp"), "-o", str(executable),
            ], check=True)
            for scenario in cases if mutation == "fixed" else (mutation,):
                result = subprocess.run([str(executable), scenario], text=True, capture_output=True)
                red = options.reviewed_old and scenario in {"deferred-axis", "orphan-root", "properties-axis"}
                expected = 75 if mutation != "fixed" or red else 0
                if result.returncode != expected or (expected and "REGRESSION:" not in result.stderr):
                    raise RuntimeError(f"{mutation}/{scenario}: {result.returncode}\n" + result.stdout + result.stderr)
                print(("reviewed pre-fix reproduced: " if red else "review guard negative control reproduced: ") +
                      scenario if expected else result.stdout.strip(), flush=True)
                results.append({
                    "mutation": "reviewed-old" if options.reviewed_old else mutation,
                    "scenario": scenario, "exitStatus": result.returncode,
                    "stdout": result.stdout.strip(), "stderr": result.stderr.strip(),
                    "extractedProductionSHA256": {name: hashlib.sha256(text.encode()).hexdigest()
                                                   for name, text in source.items()},
                })
    (output / "verification.json").write_text(json.dumps({
        "sanitizers": ["address", "undefined"],
        "sdkIncludes": str(options.sdk_includes.resolve()),
        "executionBoundary": "Production NativeScroll controllers/properties and Node/Refresh lifecycle; production ScrollState; adapted Valdi lock/value types, inactive notice receivers and recording SDK",
        "cases": results,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
