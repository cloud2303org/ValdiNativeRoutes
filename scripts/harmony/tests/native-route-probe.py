#!/usr/bin/env python3
"""Serial native-route proof; real SDK configure/objects or bounded host execution.

Never links the app/runtime, generates bindings, packages, or uses a device.
Every command and dependency hash is retained in a fresh evidence directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
HOST = ROOT / "harmony/entry/src/main/cpp/host"
SDK = Path("/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sdk", action="store_true")
    parser.add_argument("--host", action="store_true")
    parser.add_argument("--navigator-source", type=Path)
    parser.add_argument("--support-from", type=Path, help="Reuse only hash/command/dependency-verified bounded data objects")
    parser.add_argument("--only", choices=("navigator", "surface-and-appui"))
    parser.add_argument("--surface-source", type=Path)
    parser.add_argument("--screens-source", type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    records, inputs, artifacts = [], {}, []

    def run(command, label, cwd=ROOT, env=None):
        command = list(map(str, command))
        snapshot = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
        conflicts = [line for line in snapshot.splitlines()
                     if Path(line.strip().split(maxsplit=1)[-1]).name
                     in {"clang", "clang++", "cc1", "cc1plus", "ninja", "make", "cmake", "hvigorw", "ld.lld"}]
        if conflicts:
            raise RuntimeError("Native slot occupied: " + repr(conflicts))
        (output / (label + "-processes.log")).write_text(snapshot)
        print(label, flush=True)
        with (output / (label + ".log")).open("w") as log:
            result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
        records.append({"command": command, "cwd": str(cwd), "exit": result.returncode,
                        "log": str(output / (label + ".log"))})
        (output / "commands.json").write_text(json.dumps(records, indent=2))
        if result.returncode:
            print((output / (label + ".log")).read_text()[-14000:], file=sys.stderr)
            raise RuntimeError(label + " failed")

    def compile(command, source, obj, label, cwd=ROOT):
        deps = obj.with_suffix(".d")
        run([*command, "-MMD", "-MF", deps, "-c", source, "-o", obj], label, cwd)
        artifacts.append(obj)
        paths = shlex.split(deps.read_text().replace("\\\n", "").split(": ", 1)[1])
        for path in paths:
            path = Path(path)
            if not path.is_absolute():
                path = Path(cwd) / path
            if path.is_file():
                current = sha(path)
                if str(path) in inputs:
                    assert inputs[str(path)] == current, "Consumed input drift: " + str(path)
                inputs[str(path)] = current

    try:
        if args.sdk:
            # Fresh app configuration. Existing .cxx commands/objects are never
            # used; only explicit source/dependency roots are carried forward.
            parent = output / "parent"
            parent.mkdir()
            (parent / "CMakeLists.txt").write_text(
                'cmake_minimum_required(VERSION 3.22)\nproject(native_route_probe LANGUAGES C CXX ASM)\n'
                'set(CMAKE_EXPORT_COMPILE_COMMANDS ON)\n'
                f'add_subdirectory("{ROOT}/harmony/entry/src/main/cpp" app)\n')
            fork = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102")
            for arch in ("x86_64", "arm64-v8a"):
                for mode, enabled in (("legacy", False), ("fork", True)):
                    label = arch + "-" + mode
                    build = output / label
                    options = []
                    if enabled:
                        options = [
                            "-DVALDI_HARMONY_USE_FORK_UI_ASSETS=ON",
                            f"-DVALDI_HARMONY_FORK_ROOT={fork}", "-DVALDI_HARMONY_PROFILE=full-development",
                            f"-DVALDI_HARMONY_EXTERNAL_DIR={ROOT}/.tools/harmony/runtime-inputs/external",
                            f"-DVALDI_HARMONY_PROTO_DIR={ROOT}/.tools/harmony/runtime-inputs/generated/proto",
                            "-DVALDI_HARMONY_WEBSOCKETPP_DIR=/private/tmp/valdi-harmony-runtime-7hl3ei7w/websocketpp"]
                    run([SDK / "build-tools/cmake/bin/cmake", "-S", parent, "-B", build, "-G", "Ninja",
                         f"-DCMAKE_TOOLCHAIN_FILE={SDK}/build/cmake/ohos.toolchain.cmake",
                         f"-DCMAKE_MAKE_PROGRAM={SDK}/build-tools/cmake/bin/ninja",
                         f"-DOHOS_ARCH={arch}", "-DCMAKE_BUILD_TYPE=Debug",
                         f"-DVALDI_HARMONY_RUNTIME_MODE={mode}", *options], label + "-configure")
                    rows = json.loads((build / "compile_commands.json").read_text())
                    for name in ("HarmonyNativeRouteSurface.cpp", "HarmonyNativeScreens.cpp",
                                 "HarmonyNavigator.cpp", "HarmonyRuntimeHost.cpp"):
                        row = next(row for row in rows if row["file"] == str(HOST / name))
                        command = list(row.get("arguments") or shlex.split(row["command"]))
                        for flag in ("-o", "-c"):
                            index = command.index(flag)
                            del command[index:index + 2]
                        compile(command, HOST / name, output / (label + "-" + name + ".o"),
                                label + "-" + name, row["directory"])
                    source = output / (label + "-abi.cpp")
                    source.write_text(
                        '#include "valdi/runtime/Interfaces/IJavaScriptContext.hpp"\n'
                        'static_assert(sizeof(Valdi::IJavaScriptContext)==616);\n'
                        'static_assert(3*sizeof(Valdi::JSValueRef)==96);\n')
                    compile(command, source, output / (label + "-abi.o"), label + "-abi", row["directory"])
        if args.host:
            # Source/flags from the fresh current-ABI media probe are a command
            # recipe only. Recompile the bounded core/generated-data support
            # subset with dependency inventories; no old context archive reuse.
            prior = json.loads(Path("/tmp/valdi-appui-media-p2-20261103/native-green/receipt.json").read_text())
            ref = next(c for c in prior["commands"] if "-c" in c and Path(c[c.index("-o") + 1]).name == "core-0.o")
            flags = ref[1:ref.index("-c")]
            flags = [f for f in flags if not f.startswith("-I/private/tmp/valdi-appui-media")]
            flags += ["-I" + str(HOST), "-I" + str(ROOT / "scripts/harmony/tests")]
            objects = []
            support = []
            for c in prior["commands"]:
                if "-c" not in c:
                    continue
                oldobj = Path(c[c.index("-o") + 1]).name
                source = Path(c[c.index("-c") + 1])
                if oldobj.startswith("core-") or source.name in {
                    "DisposableGroup.cpp", "BridgeLogger.cpp", "ContextEntry.cpp",
                    "AttributionResolver.cpp", "ResourceManager.cpp", "app_pages.cpp"}:
                    support.append(source)
            archive = output / "libnative-route-data-support.a"
            support_recipe = {"flags": flags, "sources": list(map(str, support))}
            reused = None
            if args.support_from:
                old = args.support_from.resolve()
                receipt = json.loads((old / "receipt.json").read_text())
                recipe_file = old / "support-recipe.json"
                if recipe_file.exists():
                    old_recipe = json.loads(recipe_file.read_text())
                else:
                    commands = [r["command"] for r in receipt["commands"]
                                if "-c" in r["command"] and
                                Path(r["command"][r["command"].index("-o") + 1]).name.startswith("support-")]
                    old_recipe = {"flags": commands[0][1:commands[0].index("-MMD")],
                                  "sources": [c[c.index("-c") + 1] for c in commands]}
                assert old_recipe == support_recipe
                for i, source in enumerate(support):
                    deps = old / f"support-{i}.d"
                    for name in shlex.split(deps.read_text().replace("\\\n", "").split(": ", 1)[1]):
                        path = Path(name)
                        if not path.is_absolute():
                            path = ROOT / path
                        assert sha(path) == receipt["inputSHA256"][str(path)], "Support input drift: " + str(path)
                        inputs[str(path)] = sha(path)
                original = old / archive.name
                assert sha(original) == receipt["outputSHA256"][str(original)]
                shutil.copy2(original, archive)
                reused = {"archive": str(original), "SHA256": sha(original)}
            else:
                for i, source in enumerate(support):
                    obj = output / f"support-{i}.o"
                    compile(["/usr/bin/clang++", *flags], source, obj, f"support-{i}")
                    objects.append(obj)
                run(["/usr/bin/ar", "rcs", archive, *objects], "data-support-archive")
            (output / "support-recipe.json").write_text(json.dumps(support_recipe, indent=2))
            (output / "support-reuse.json").write_text(json.dumps(reused, indent=2))
            artifacts.append(archive)
            tests = ROOT / "scripts/harmony/tests"
            extraction = output / "navigator.cpp"
            run([sys.executable, tests / "native-route-extract.py",
                 args.navigator_source or HOST / "HarmonyNavigator.cpp", extraction], "extract-navigator")
            for label, sources in (
                ("surface-and-appui", [args.surface_source or HOST / "HarmonyNativeRouteSurface.cpp",
                                       args.screens_source or HOST / "HarmonyNativeScreens.cpp",
                                       tests / "native-route-native.cpp"]),
                ("navigator", [args.surface_source or HOST / "HarmonyNativeRouteSurface.cpp",
                               args.screens_source or HOST / "HarmonyNativeScreens.cpp", extraction]),
            ):
                if args.only and label != args.only:
                    continue
                target_objects = []
                for i, source in enumerate(sources):
                    obj = output / f"{label}-{i}.o"
                    compile(["/usr/bin/clang++", *flags], source, obj, f"{label}-compile-{i}")
                    target_objects.append(obj)
                binary = output / label
                native = ROOT / "harmony/business-build/.artifacts/host"
                run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", *target_objects, archive,
                     native / "deps/fmt/libfmt.a", native / "deps/jsoncpp/src/lib_json/libjsoncpp.a",
                     "-o", binary], label + "-link")
                artifacts.append(binary)
                run([binary], label + "-run", env={**os.environ,
                    "ASAN_OPTIONS": "halt_on_error=1", "UBSAN_OPTIONS": "halt_on_error=1"})
    finally:
        # SDK headers are system dependencies, intentionally inventoried too.
        for directory in (SDK / "sysroot/usr/include/arkui",):
            for path in directory.rglob("*.h"):
                inputs[str(path)] = sha(path)
        receipt = {"commands": records, "inputSHA256": inputs,
                   "outputSHA256": {str(p): sha(p) for p in artifacts},
                   "serialNativeInvocations": True, "maxJobs": 1,
                   "restoredCxxCommandsUsed": False, "oldContextArchiveLinked": False,
                   "applicationOrFullRuntimeLinked": False, "HAP": False, "device": False,
                   "hostBoundary": "real helpers, SDK declarations, explicit SDK/runtime doubles and extracted Navigator methods"}
        (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
