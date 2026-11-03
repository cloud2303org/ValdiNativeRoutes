#!/usr/bin/env python3
"""Replay SDK26 manager-only object commands against current fork headers.

No configure, generator, runtime compilation, archive or application link.
Commands and dependency hashes are saved outside the repository.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shlex
import subprocess
import time


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dependencies(path):
    text = path.read_text().replace("\\\n", "")
    return [Path(value) for value in shlex.split(text.split(":", 1)[1])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--invocations", type=Path, required=True)
    parser.add_argument("--app-backend", type=Path, required=True)
    parser.add_argument("--fork-backend", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    records = [json.loads(line) for line in options.invocations.read_text().splitlines()]
    scan = runpy.run_path(str(Path(__file__).with_name("verify-scroll-dismiss-regressions.py")))["scan_native"]
    runs = []
    for abi in ("x86_64", "arm64-v8a"):
        for kind, backend, configuration in (
            ("app", options.app_backend.resolve(), "fork-legacy-ui"),
            ("fork", options.fork_backend.resolve(), "fork-fork-ui"),
        ):
            expected_source = str(backend / "ArkUIViewManager.cpp")
            matches = [record for record in records if
                       (record.get("cwd") or "").endswith("/" + abi + "-" + configuration) and
                       expected_source in record["command"] and "-c" in record["command"]]
            if len(matches) != 1:
                raise RuntimeError(f"Expected one saved {abi}/{kind} full-manager command, got {len(matches)}")
            saved = matches[0]
            command = list(saved["command"])
            fork = options.fork_backend.resolve().parents[2]
            if "-I" + str(fork / "valdi/src") not in command:
                raise RuntimeError("Saved command does not consume current real fork headers")
            if any(".tools/harmony/upstream" in value for value in command):
                raise RuntimeError("Legacy runtime headers in current-fork compile")
            if "26.0.0.865" not in command[0]:
                raise RuntimeError("Expected installed SDK26 compiler")
            old_dependency = Path(command[command.index("-MF") + 1])
            prior_inputs = dependencies(old_dependency)
            before = {str(path): sha(path) for path in prior_inputs if path.is_file()}
            before.update({str(path): sha(path) for path in backend.iterdir() if path.is_file()})
            target = output / (abi + "-" + kind + "-ArkUIViewManager.o")
            dependency = target.with_suffix(".d")
            command[command.index("-o") + 1] = str(target)
            command[command.index("-MF") + 1] = str(dependency)
            log = target.with_suffix(".log")
            scan_result = scan()
            started = time.time_ns()
            (output / (abi + "-" + kind + "-command.json")).write_text(
                json.dumps({"command": command, "cwd": saved["cwd"], "nativeScan": scan_result}, indent=2) + "\n")
            with log.open("w") as stream:
                result = subprocess.run(command, cwd=saved["cwd"], stdout=stream, stderr=subprocess.STDOUT)
            finished = time.time_ns()
            if result.returncode:
                raise RuntimeError(f"{abi}/{kind} manager compile failed: {log}\n" + log.read_text())
            consumed = {str(path): sha(path) for path in dependencies(dependency) if path.is_file()}
            changed = [path for path, digest in consumed.items() if path in before and before[path] != digest]
            if changed:
                raise RuntimeError("Consumed source/header changed during compile: " + str(changed))
            info = subprocess.check_output(["file", str(target)], text=True).strip()
            runs.append({"kind": kind, "abi": abi, "command": command, "cwd": saved["cwd"],
                         "savedCommandSHA256": hashlib.sha256(json.dumps(saved, sort_keys=True).encode()).hexdigest(),
                         "exitStatus": result.returncode, "startedNs": started, "finishedNs": finished,
                         "object": str(target), "objectSHA256": sha(target), "file": info,
                         "dependency": str(dependency), "consumedSHA256": consumed,
                         "log": str(log), "nativeScanBefore": scan_result})
            (output / "verification.json").write_text(json.dumps({
                "scope": "SDK26 current-fork-header full-manager object compilation only; no runtime/archive/app link",
                "invocations": str(options.invocations.resolve()), "invocationsSHA256": sha(options.invocations),
                "runs": runs,
            }, indent=2) + "\n")
            print(info, flush=True)
    scan()


if __name__ == "__main__":
    main()
