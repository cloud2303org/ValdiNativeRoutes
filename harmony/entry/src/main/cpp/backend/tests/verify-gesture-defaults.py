#!/usr/bin/env python3
"""Isolate the real default initializer, with the same fixture before/after extraction."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess

p = argparse.ArgumentParser()
p.add_argument("--backend", type=Path, default=Path(__file__).resolve().parents[1])
p.add_argument("--output", type=Path, required=True)
a = p.parse_args()
a.output.mkdir(parents=True, exist_ok=True)
source = a.backend / ("gesture.hpp" if (a.backend / "gesture.hpp").exists() else "ArkUIViewManager.cpp")
initializer = re.search(r"double longPressDuration\s*=\s*[^;]+;", source.read_text())
assert initializer, "Missing production default"
(a.output / "gesture-defaults-under-test.hpp").write_text(
    "struct GestureDefaultsUnderTest {\n" + initializer[0] + "\n};\n")
scan = runpy.run_path(str(Path(__file__).with_name("verify-scroll-dismiss-regressions.py")))["scan_native"]
scan()
command = ["/usr/bin/clang++", "-std=c++20", "-I" + str(a.output),
           str(Path(__file__).with_name("gesture-defaults.cpp")), "-o", str(a.output / "defaults")]
subprocess.run(command, check=True)
result = subprocess.run([str(a.output / "defaults")], capture_output=True, text=True)
(a.output / "result.log").write_text(result.stdout + result.stderr)
(a.output / "receipt.json").write_text(json.dumps({
    "command": command, "source": str(source),
    "sourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "fixtureSHA256": hashlib.sha256(Path(__file__).with_name("gesture-defaults.cpp").read_bytes()).hexdigest(),
    "exitStatus": result.returncode, "scope": "production default initializer only; not native-controller proof",
}, indent=2) + "\n")
print(result.stdout + result.stderr, end="")
raise SystemExit(result.returncode)
