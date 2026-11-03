#!/usr/bin/env python3
"""Bounded typed storage proof. No runtime archive, app build, device, or network.

Reuse only the exactly verified current Value support from a supplied receipt;
build schema/marshalling, generated ABI, SQLite, JSONCPP, fmt and gtest from source.
Every native command is serial, preceded by a fresh global compiler scan.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_hashes(entries):
    for name, expected in entries.items():
        assert Path(name).is_file() and sha(name) == expected, f"stale input/artifact: {name}"


def compiler_scan():
    text = subprocess.check_output(["ps", "-axo", "pid=,ppid=,comm=,args="], text=True)
    active = []
    for line in text.splitlines():
        fields = line.split(None, 3)
        if len(fields) >= 3 and re.fullmatch(
            r"(?:clang.*|cc1.*|gcc.*|g\+\+|cc|c\+\+|ld(?:\..*)?|ninja|make|cmake|ar|ranlib|swiftc)",
            Path(fields[2]).name,
        ):
            active.append(line)
    return active


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--support-receipt", required=True, type=Path)
    parser.add_argument("--reuse-build", type=Path)
    parser.add_argument("--source", type=Path, help="Immutable old production source for RED")
    parser.add_argument("--expect-red", action="store_true")
    parser.add_argument("--red-test", action="append",
                        help="Required failing test name for --expect-red; repeat for a focused review regression")
    parser.add_argument("--sdk", action="store_true", help="SDK26 compile of production + canonical types, two ABIs")
    args = parser.parse_args()
    if args.red_test and not args.expect_red:
        parser.error("--red-test requires --expect-red")
    tests = Path(__file__).resolve().parent
    root = tests.parents[6]
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    receipt = {"commands": [], "inputSHA256": {}, "outputSHA256": {}, "oldContextArchives": False,
               "sanitizers": "ASan + UBSan; current native Value/schema/marshalling + SQLite/JSONCPP/fmt/gtest",
               "device": False, "HAP": False, "fullRuntimeBuild": False,
               "boundary": "macOS typed host through actual generated marshalling; SDK26 compile-only"}

    def save():
        (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")

    def record(path):
        path = Path(path).resolve()
        receipt["inputSHA256"][str(path)] = sha(path)

    def run(command, label, native=True, expected=(0,), env=None, cwd=None):
        command = [str(value) for value in command]
        if native:
            # Do not kill or overlap another owner's compiler. Bounded waiting.
            for attempt in range(12):
                active = compiler_scan()
                with (out / "compiler-scans.log").open("a") as log:
                    log.write(json.dumps({"time": time.time(), "before": label, "active": active}) + "\n")
                if not active:
                    break
                print("Native slot occupied; waiting:", "\n".join(active), flush=True)
                time.sleep(5)
            else:
                raise RuntimeError("External native processes still active; no command launched")
        log = out / (label + ".log")
        row = {"command": command, "cwd": str(cwd or root), "log": str(log)}
        receipt["commands"].append(row)
        save()
        print(label, flush=True)
        with log.open("w") as stream:
            result = subprocess.run(command, cwd=cwd or root, stdout=stream, stderr=subprocess.STDOUT, env=env)
        row["exit"] = result.returncode
        save()
        if result.returncode not in expected:
            print(log.read_text()[-12000:], flush=True)
            raise RuntimeError(f"{label} exited {result.returncode}; preserved {log}")

    def deps(path):
        # clang -MMD escapes spaces and line continuations using make syntax.
        content = path.read_text().replace("\\\n", "")
        for item in shlex.split(content.split(":", 1)[1]):
            record(item)

    try:
        support_path = args.support_receipt.resolve()
        support = json.loads(support_path.read_text())
        verify_hashes(support["supportInputSHA256"])
        support_paths = {str(Path(key).resolve()) for key in support["supportInputSHA256"]}
        ar = next(row["command"] for row in support["commands"]
                  if row["command"][0].endswith("/ar") and "rcs" in row["command"])
        archive = Path(ar[2])
        assert archive.name == "libwheel-values-current.a"
        used = [*ar[3:], str(archive)]
        verify_hashes({name: support["outputSHA256"][name] for name in used})
        recipes = []
        value_objects = []
        for obj in ar[3:]:
            rows = [row for row in support["commands"] if "-o" in row["command"]
                    and row["command"][row["command"].index("-o") + 1] == obj]
            assert len(rows) == 1 and rows[0]["exit"] == 0
            cmd = rows[0]["command"]
            src = Path(cmd[cmd.index("-c") + 1]).resolve()
            assert not src.name in ("Context.cpp", "IJavaScriptContext.cpp")
            # The donor's last member is Runtime.cpp for its separate wheel proof.
            # Storage requires only the current Value support; exclude that member.
            if src.name == "Runtime.cpp":
                continue
            assert str(src) in support["supportInputSHA256"]
            depfile = Path(cmd[cmd.index("-MF") + 1])
            for item in shlex.split(depfile.read_text().replace("\\\n", "").split(":", 1)[1]):
                assert str(Path(item).resolve()) in support_paths, f"unreceipted support dependency: {item}"
            record(depfile)
            recipes.append(cmd)
            value_objects.append(obj)
        receipt["reusedSupport"] = {"receipt": str(support_path), "receiptSHA256": sha(support_path),
                                    "archive": str(archive), "archiveSHA256": sha(archive),
                                    "recipes": recipes, "verifiedInputs": len(support["supportInputSHA256"]),
                                    "verifiedArtifacts": len(used)}
        receipt["inputSHA256"].update({str(Path(p).resolve()): h for p, h in support["supportInputSHA256"].items()})
        record(support_path)
        record(archive)
        archive = out / "libstorage-values-current.a"
        run(["/usr/bin/ar", "rcs", archive, *value_objects], "value-support-archive")
        command = recipes[0]
        flags = command[1:command.index("-MMD")]
        # Use canonical generated types first. No synthetic generated model.
        canonical = root / "valdi/native/generated"
        googletest = root / ".tools/harmony/runtime-inputs/external/boringssl/third_party/googletest/googletest"
        sqlite = root / ".tools/harmony/business-inputs/sqlite"
        flags = ["-I" + str(canonical), "-I" + str(sqlite), "-I" + str(googletest / "include"),
                 "-I" + str(googletest), *flags]
        record("/usr/bin/clang++")
        core = root / ".tools/harmony/upstream/valdi_core/src/valdi_core/cpp"
        external = root / ".tools/harmony/runtime-inputs/external"
        sources = sorted((core / "Marshalling").glob("*.cpp"))
        sources += [p for p in sorted((core / "Schema").glob("*.cpp")) if p.name != "ValueSchema.cpp"]
        sources += [core / "Utils/PlatformObjectAttachments.cpp"]
        sources += sorted((external / "jsoncpp/src/lib_json").glob("*.cpp"))
        sources += [external / "fmt/src/format.cc", external / "fmt/src/os.cc",
                    googletest / "src/gtest-all.cc", googletest / "src/gtest_main.cc",
                    canonical / "valdi_modules/app_pages/app_pages.cpp"]
        sources += [external / "boringssl/crypto/base64/base64.cc"]
        objects = []
        start = 0
        reused_sqlite = None
        if args.reuse_build:
            old = json.loads((args.reuse_build / "receipt.json").read_text())
            verify_hashes(old["supportBuildInputSHA256"])
            verify_hashes(old["supportBuildOutputSHA256"])
            start = len(old["supportBuildSources"])
            assert old["supportBuildSources"] == [str(p.resolve()) for p in sources[:start]]
            assert old["supportBuildFlags"] == flags
            objects = [Path(p) for p in old["supportBuildObjects"][:-1]]
            reused_sqlite = Path(old["supportBuildObjects"][-1])
            receipt["inputSHA256"].update(old["supportBuildInputSHA256"])
            receipt["reusedBuildReceipt"] = str((args.reuse_build / "receipt.json").resolve())
            record(args.reuse_build / "receipt.json")
        for i, source in enumerate(sources[start:], start):
            obj = out / f"support-{i}.o"
            dep = obj.with_suffix(".d")
            source_flags = (["-I" + str(external / "boringssl/include")]
                            if source == external / "boringssl/crypto/base64/base64.cc" else [])
            run(["/usr/bin/clang++", *source_flags, *flags, "-MMD", "-MF", dep, "-c", source, "-o", obj],
                f"support-{i}")
            deps(dep)
            objects.append(obj)
        if reused_sqlite:
            objects.append(reused_sqlite)
        else:
            # Fresh real SQLite, with sanitizers too; no old mixed runtime archive.
            obj = out / "sqlite.o"
            dep = obj.with_suffix(".d")
            run(["/usr/bin/clang", "-O1", "-g", "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                 "-DSQLITE_THREADSAFE=1", "-DSQLITE_OMIT_LOAD_EXTENSION", "-MMD", "-MF", dep,
                 "-c", sqlite / "sqlite3.c", "-o", obj], "sqlite")
            deps(dep)
            objects.append(obj)
        receipt["supportBuildInputSHA256"] = dict(receipt["inputSHA256"])
        receipt["supportBuildOutputSHA256"] = {str(p): sha(p) for p in objects}
        receipt.update(supportBuildSources=[str(p.resolve()) for p in sources],
                       supportBuildFlags=flags, supportBuildObjects=[str(p) for p in objects])
        production = args.source.resolve() if args.source else tests.parent.parent / "host/HarmonyStorageHost.cpp"
        # A frozen baseline source includes its frozen adjacent header.
        local_objects = []
        for i, source in enumerate([production, tests / "storage-tests.cpp"]):
            obj = out / f"storage-{i}.o"
            dep = obj.with_suffix(".d")
            run(["/usr/bin/clang++", *flags, "-MMD", "-MF", dep, "-c", source, "-o", obj], f"storage-{i}")
            deps(dep)
            local_objects.append(obj)
        executable = out / "storage-tests"
        run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", "-Wl,-undefined,error",
             *local_objects, *objects, archive, "-o", executable], "host-link")
        env = dict(os.environ, ASAN_OPTIONS="halt_on_error=1", UBSAN_OPTIONS="halt_on_error=1:print_stacktrace=1")
        run([executable, f"--gtest_output=xml:{out / 'results.xml'}"], "host-tests", env=env,
            expected=(1,) if args.expect_red else (0,))
        xml = ET.parse(out / "results.xml")
        failed = [t.attrib["name"] for t in xml.iter("testcase") if t.find("failure") is not None]
        receipt["failedTests"] = failed
        receipt["tests"] = [t.attrib["name"] for t in xml.iter("testcase")]
        if args.expect_red:
            expected_failures = set(args.red_test or ["FiniteDoublesRoundTripExactlyAcrossReopen",
                                                      "VerticalTabAndAllControlsRoundTripInValuesAndKeys"])
            receipt["expectedFailedTests"] = sorted(expected_failures)
            assert expected_failures <= set(failed)
            if args.red_test:
                assert expected_failures == set(failed), "focused RED must preserve all other passing cases"
        if args.sdk:
            for abi in ("x86_64", "arm64-v8a"):
                database = root / f".tools/harmony/runtime-{abi}/compile_commands.json"
                rows = json.loads(database.read_text())
                row = next(r for r in rows if r["file"].endswith("/valdi/runtime/Runtime.cpp"))
                original = shlex.split(row["command"])
                assert "/26." in original[0], "SDK26 required"
                for i, source in enumerate([production, canonical / "valdi_modules/app_pages/app_pages.cpp"]):
                    obj = out / f"sdk-{abi}-{i}.o"
                    dep = obj.with_suffix(".d")
                    cmd = list(original)
                    cmd[cmd.index("-o") + 1] = str(obj)
                    cmd[cmd.index("-c") + 1] = str(source)
                    cmd += ["-I" + str(canonical), "-I" + str(sqlite), "-Wall", "-Wextra", "-Werror",
                            "-Wno-unused-parameter", "-MMD", "-MF", str(dep)]
                    run(cmd, f"sdk-{abi}-{i}", cwd=row["directory"])
                    deps(dep)
                record(database)
                record(original[0])
        receipt["outputSHA256"] = {str(p): sha(p) for p in out.iterdir()
                                   if p.suffix in (".o", ".a", ".xml") or p.name == "storage-tests"}
        # Freeze all source/header inputs and this runner without changing older receipts.
        record(__file__)
        for name in list(receipt["inputSHA256"]):
            p = Path(name)
            if p.suffix in (".cpp", ".hpp", ".h", ".cc", ".c", ".py", ".inc"):
                target = out / "inputs" / p.relative_to("/")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, target)
        receipt["completed"] = True
    finally:
        receipt["finalCompilerScan"] = compiler_scan()
        save()
    print(f"Proof: {out / 'receipt.json'}", flush=True)


if __name__ == "__main__":
    main()
