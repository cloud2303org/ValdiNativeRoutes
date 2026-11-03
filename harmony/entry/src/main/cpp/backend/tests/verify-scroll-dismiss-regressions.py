#!/usr/bin/env python3
"""Run existing Scroll/Refresh tests with the new Node boundary field.

Existing files stay untouched. A temporary copy of the existing adapted Node
test boundary gains the production scrollBlurCurrent field; all extracted
production bodies, test expectations and negative controls remain verbatim.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys


def scan_native():
    active = []
    for line in subprocess.check_output(["ps", "-axo", "pid=,comm=,args="], text=True).splitlines():
        parts = line.split(None, 2)
        if len(parts) > 1 and re.fullmatch(
            r"clang.*|cc1.*|ld|ld\.lld|lld|ninja|cmake|xcodebuild|swiftc|rustc|c\+\+|g\+\+.*",
            Path(parts[1]).name,
        ):
            active.append(line)
    if active:
        raise RuntimeError("Native slot occupied: " + "\n".join(active))
    return active


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--sdk-includes", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    backend = options.backend.resolve()
    shadow = output / "adapted-backend"
    shutil.copytree(backend, shadow, dirs_exist_ok=True)
    seam = shadow / "tests/mount-reentry.cpp"
    old = seam.read_text()
    marker = "struct Node : std::enable_shared_from_this<Node> {\n"
    if old.count(marker) != 1:
        raise RuntimeError("Existing adapted Node boundary changed")
    seam.write_text(old.replace(marker, marker + "    std::function<bool()> scrollBlurCurrent;\n"))
    runs = []
    for script in ("verify-refresh-native.py", "verify-refresh-scroll.py"):
        scan_native()
        command = [sys.executable, str(shadow / "tests" / script),
                   "--sdk-includes", str(options.sdk_includes.resolve()),
                   "--output", str(output / script.removesuffix(".py"))]
        log = output / (script + ".log")
        with log.open("w") as stream:
            subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True)
        print("existing production regression passed: " + script, flush=True)
        runs.append({"command": command, "exitStatus": 0, "log": str(log)})
    for test in ("scroll-state", "input-state"):
        scan_native()
        executable = output / test
        command = [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
                   "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                   str(backend / "tests" / (test + ".cpp")), "-o", str(executable)]
        log = output / (test + ".log")
        with log.open("w") as stream:
            subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True)
            subprocess.run([str(executable)], stdout=stream, stderr=subprocess.STDOUT, check=True)
        print("existing state regression passed: " + test, flush=True)
        runs.append({"command": command, "exitStatus": 0, "log": str(log)})
    (output / "verification.json").write_text(json.dumps({
        "backend": str(backend), "boundaryAdaptation": "Only add std::function<bool()> scrollBlurCurrent to existing adapted Node",
        "originalSeamSHA256": hashlib.sha256(old.encode()).hexdigest(),
        "adaptedSeamSHA256": hashlib.sha256(seam.read_bytes()).hexdigest(),
        "sanitizers": ["address", "undefined"], "runs": runs,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
