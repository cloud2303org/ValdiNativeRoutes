#!/usr/bin/env python3
"""Build local canonical gesture/manager objects serially for both SDK ABIs."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shlex
import subprocess

HERE = Path(__file__).resolve().parent
APP = HERE.parent
FORK = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102")
SDK = Path("/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--recipe", type=Path, required=True, help="SDK manager command JSON; recipe only")
    p.add_argument("--abi", choices=("x86_64", "arm64-v8a"), action="append")
    p.add_argument("--backend", choices=("app", "fork"), action="append")
    a = p.parse_args()
    a.output.mkdir(parents=True, exist_ok=True)
    scan = runpy.run_path(str(HERE / "verify-scroll-dismiss-regressions.py"))["scan_native"]
    recipe = json.loads(a.recipe.read_text())
    original = recipe["command"]
    flags = []
    skip = False
    for i, arg in enumerate(original[1:]):
        if skip:
            skip = False
            continue
        if arg in ("-o", "-c", "-MF"):
            skip = True
        elif arg not in ("-MD", "-MMD") and not arg.startswith(("--target=", "--sysroot=", "--gcc-toolchain=")):
            flags.append(arg)
    assert not any(".tools/harmony/upstream" in arg for arg in flags), "Current fork headers required"
    assert "-I" + str(FORK / "valdi/src") in flags
    # CMake deduplicates repeated standalone option tokens. Keep each include
    # prefix joined to its path so every real dependency remains an include.
    compact = []
    i = 0
    while i < len(flags):
        if flags[i] in ("-isystem", "-idirafter", "-I"):
            compact.append(flags[i] + flags[i + 1])
            i += 2
        else:
            compact.append(flags[i])
            i += 1
    flags = compact
    records = []
    consumed = {}

    def run(command, label):
        before = scan()
        log = a.output / (label + ".log")
        with log.open("w") as stream:
            r = subprocess.run(list(map(str, command)), stdout=stream, stderr=subprocess.STDOUT)
        records.append({"command": list(map(str, command)), "exitStatus": r.returncode,
                        "log": str(log), "nativeScanBefore": before})
        (a.output / "commands.json").write_text(json.dumps(records, indent=2) + "\n")
        if r.returncode:
            raise RuntimeError(log.read_text()[-12000:])

    for abi in a.abi or ("x86_64", "arm64-v8a"):
        for kind in a.backend or ("app",):
            backend = APP if kind == "app" else FORK / "valdi/harmony/arkui"
            build = a.output / (abi + "-" + kind)
            build.mkdir(exist_ok=True)
            extra = build / "flags.cmake"
            # All flags are literal CMake bracket arguments, never shell text.
            extra.write_text("set(GESTURE_COMPILE_FLAGS\n" +
                             "\n".join("  [==[" + flag + "]==]" for flag in flags) + "\n)\n")
            run(["cmake", "-S", HERE / "gesture-cmake", "-B", build, "-G", "Ninja",
                 "-DCMAKE_CXX_COMPILER=" + str(SDK / "llvm/bin/clang++"),
                 "-DCMAKE_CXX_COMPILER_TARGET=" + ("x86_64-linux-ohos" if abi == "x86_64" else "aarch64-linux-ohos"),
                 "-DCMAKE_SYSROOT=" + str(SDK / "sysroot"),
                 "-DCMAKE_SYSTEM_NAME=OHOS", "-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY",
                 "-DGESTURE_FLAGS_FILE=" + str(extra), "-DGESTURE_BACKEND=" + str(backend),
                 "-DGESTURE_FORK=" + ("ON" if kind == "fork" else "OFF")], abi + "-" + kind + "-configure")
            target = "valdi_arkui_backend" if kind == "app" else "valdi_harmony_arkui"
            objects = []
            units = ("gesture.cpp", "ArkUIViewManager.cpp")
            for unit in units:
                before = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                          for path in backend.iterdir() if path.is_file()}
                run(["cmake", "--build", build, "--parallel", "1", "--target",
                     "backend/CMakeFiles/" + target + ".dir/" + unit + ".o", "--", "-d", "keepdepfile"],
                    abi + "-" + kind + "-" + unit)
                obj = build / ("backend/CMakeFiles/" + target + ".dir/" + unit + ".o")
                dependency = Path(str(obj) + ".d")
                paths = shlex.split(dependency.read_text().replace("\\\n", "").split(": ", 1)[1])
                for path in map(Path, paths):
                    if path.is_file():
                        digest = hashlib.sha256(path.read_bytes()).hexdigest()
                        assert str(path) not in before or before[str(path)] == digest, "Source changed during native compile"
                        consumed[str(path)] = digest
                objects.append(obj)
                print(abi, kind, unit, "PASS", flush=True)
            label = abi + "-" + kind
            compile_rows = json.loads((build / "compile_commands.json").read_text())
            entry = next(row for row in compile_rows if row["file"] == str(backend / "gesture.cpp"))
            command = shlex.split(entry["command"])
            consumer = build / "gesture-sdk-consumer.o"
            command[command.index("-c") + 1] = str(HERE / "gesture-sdk-consumer.cpp")
            command[command.index("-o") + 1] = str(consumer)
            run(command, label + "-consumer")
            tool = SDK / "llvm/bin"
            closure = build / "gesture-manager-consumer.o"
            run([tool / "ld.lld", "-r", *objects, consumer, "-o", closure], label + "-closure")
            unresolved = subprocess.check_output(
                [tool / "llvm-nm", "--undefined-only", "--demangle", closure], text=True)
            module_names = ("gestureInputEvent", "gestureInputUserData", "refreshGestures", "cancelGestures", "gestureAttribute",
                            "resetGestureAttribute", "updateTouchRegion", "bindGestureAttributes",
                            "consumeRawTerminal", "deliverRawTerminal")
            assert not any("Valdi::Harmony::detail::" + name + "(" in unresolved for name in module_names), \
                "Manager/consumer did not resolve to the actual module"
            module_unresolved = subprocess.check_output(
                [tool / "llvm-nm", "--undefined-only", *objects[:-1]], text=True)
            required = {line.split()[-1] for line in module_unresolved.splitlines()
                        if line.split() and line.split()[-1].startswith("OH_ArkUI_")}
            triple = "x86_64-linux-ohos" if abi == "x86_64" else "aarch64-linux-ohos"
            library = SDK / "sysroot/usr/lib" / triple / "libace_ndk.z.so"
            exports = subprocess.check_output(
                [tool / "llvm-nm", "--dynamic", "--defined-only", library], text=True)
            exported = {line.split()[-1].split("@")[0] for line in exports.splitlines() if line.split()}
            assert required <= exported, "SDK gesture imports unavailable: " + str(required - exported)
            probe = build / "gesture-sdk-imports.cpp"
            probe.write_text("#include <arkui/native_node.h>\n#include <arkui/native_gesture.h>\n"
                             "#include <arkui/ui_input_event.h>\n" +
                             "\n".join(f"decltype(&{symbol}) volatile gesture_import_{i} = &{symbol};"
                                       for i, symbol in enumerate(sorted(required))) + "\n")
            run([SDK / "llvm/bin/clang++", "--target=" + triple, "--sysroot=" + str(SDK / "sysroot"),
                 "-std=c++20", "-fPIC", "-shared", probe, "-Wl,--no-undefined", "-lace_ndk.z",
                 "-o", build / "gesture-sdk-imports.so"], label + "-strict-import-link")
            (build / "imports.json").write_text(json.dumps(sorted(required), indent=2) + "\n")
            print(label, "module/manager/consumer closure and strict SDK imports PASS", flush=True)
    digests = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
               for p in a.output.rglob("*.o")}
    (a.output / "receipt.json").write_text(json.dumps({
        "scope": "Independent real gesture.cpp and manager objects through production CMake; no runtime/HAP/device",
        "commands": records, "objectsSHA256": digests,
        "consumedSHA256": consumed,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
