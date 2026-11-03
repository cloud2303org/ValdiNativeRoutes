#!/usr/bin/env python3
"""Supplementary manager intercept-port regression using real SDK declarations."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess

here = Path(__file__).resolve().parent
p = argparse.ArgumentParser()
p.add_argument("--backend", type=Path, default=here.parent)
p.add_argument("--sdk-includes", type=Path, required=True)
p.add_argument("--output", type=Path, required=True)
a = p.parse_args()
a.output.mkdir(parents=True, exist_ok=True)
extract = runpy.run_path(str(here / "verify-mount-reentry.py"))["function"]
manager = a.backend / "ArkUIViewManager.cpp"
body = extract(manager.read_text(), "static void applyInterceptPolicy(")
(a.output / "gesture-host-policy-under-test.hpp").write_text(body + "\n")
runpy.run_path(str(here / "verify-scroll-dismiss-regressions.py"))["scan_native"]()
command = ["/usr/bin/clang++", "-std=c++20", "-Wno-unknown-attributes", "-Wno-ignored-attributes",
           "-fsanitize=address,undefined", "-I" + str(a.sdk_includes),
           "-I" + str(a.backend), "-I" + str(a.output), str(here / "gesture-host-policy.cpp"),
           "-o", str(a.output / "test")]
subprocess.run(command, check=True)
r = subprocess.run([str(a.output / "test")], capture_output=True, text=True)
(a.output / "result.log").write_text(r.stdout + r.stderr)
(a.output / "receipt.json").write_text(json.dumps({
    "source": str(manager), "sourceSHA256": hashlib.sha256(manager.read_bytes()).hexdigest(),
    "bodySHA256": hashlib.sha256(body.encode()).hexdigest(), "command": command, "exitStatus": r.returncode,
    "scope": "Exact manager intercept adapter only; recording C API boundary, not live sibling hit traversal",
}, indent=2) + "\n")
print(r.stdout + r.stderr, end="")
raise SystemExit(r.returncode)
