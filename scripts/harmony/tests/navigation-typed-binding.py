#!/usr/bin/env python3
"""Run actual typed navigation entry against verified native-route data support.

First run native-route-probe.py OUTPUT --host --only navigator, then pass OUTPUT
as --support-from. Reuse requires hashes of every consumed support dependency.
Does not build the application, change generated bindings, or operate devices.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
TESTS = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--support-from", required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    support = args.support_from.resolve()
    receipt = json.loads((support / "receipt.json").read_text())
    recipe = json.loads((support / "support-recipe.json").read_text())
    archive = support / "libnative-route-data-support.a"
    assert sha(archive) == receipt["outputSHA256"][str(archive)]
    for index, _ in enumerate(recipe["sources"]):
        deps = support / f"support-{index}.d"
        for name in shlex.split(deps.read_text().replace("\\\n", "").split(": ", 1)[1]):
            path = Path(name)
            if not path.is_absolute():
                path = ROOT / path
            assert sha(path) == receipt["inputSHA256"][str(path)], f"Support input drift: {path}"
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("navigation_extract", TESTS / "sheet-caller-extract.py")
    extractor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(extractor)
    source = ROOT / "harmony/entry/src/main/cpp/host/HarmonyNavigator.cpp"
    text = source.read_text()
    helpers = text[text.index("Value object()"):text.index("struct RouteAnimation {")]
    entry = extractor.block(text, "Value HarmonyNavigator::makeNavigationHost(")
    (output / "navigation-typed-binding-production.inc").write_text(helpers + "\n" + entry)
    flags = [*recipe["flags"], "-I" + str(output)]
    binary = output / "navigation-typed-binding"
    native = ROOT / "harmony/business-build/.artifacts/host"
    commands = [
        ["/usr/bin/clang++", *flags, "-Wl,-dead_strip", TESTS / "navigation-typed-binding.cpp",
         archive, native / "deps/fmt/libfmt.a", native / "deps/jsoncpp/src/lib_json/libjsoncpp.a",
         "-o", binary],
        [binary],
    ]
    for command in commands:
        subprocess.run(list(map(str, command)), check=True, cwd=ROOT,
                       env={**os.environ, "ASAN_OPTIONS": "halt_on_error=1", "UBSAN_OPTIONS": "halt_on_error=1"})
    assert sha(source) == hashlib.sha256(text.encode()).hexdigest(), "Production source drift"
    (output / "receipt.json").write_text(json.dumps({
        "commands": [list(map(str, command)) for command in commands],
        "sourceSHA256": sha(source), "supportReceipt": str(support / "receipt.json"),
        "supportReceiptSHA256": sha(support / "receipt.json"),
        "realGeneratedModelsAndMarshaller": True, "device": False,
        "boundary": "production host entry; command execution/rendering/caller capture are doubles",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
