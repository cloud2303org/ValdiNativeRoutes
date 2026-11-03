#!/usr/bin/env python3
"""Serial production DeviceBridge RED/GREEN and SDK 26 two-ABI probes.

Requires an explicit parent native slot. No CMake, runtime/app build, generated
inputs, cached runtime archives, device operations, or shared build outputs.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[3]
TESTS = Path(__file__).resolve().parent
HOST = ROOT / "harmony/entry/src/main/cpp/host"
PRODUCTION = HOST / "HarmonyBridgeModules.cpp"
BEFORE_SHA = "34806da31c10ded307c13aeab78034eb17dc7323ef312498287f2ef71a4675bb"
SYMBOLS = {
    "OH_NativeDisplayManager_GetDefaultDisplayWidth",
    "OH_NativeDisplayManager_GetDefaultDisplayHeight",
    "OH_NativeDisplayManager_GetDefaultDisplayDensityPixels",
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def baseline(source):
    # Reconstruct the exact original bytes and verify the independently recorded
    # pre-edit hash. This is not a handwritten replacement bridge.
    source = source.replace("#include <window_manager/oh_display_manager.h>\n\n", "", 1)
    source = source.replace("#include <cmath>\n", "", 1)
    start = source.index("Valdi::Value getDefaultDisplayDimension(")
    end = source.index("} // namespace", start)
    source = source[:start] + source[end:]
    start = source.index('    bind(module, "getDisplayWidth",')
    end = source.index('    for (const auto* name : {"getWindowWidth"', start)
    source = source[:start] + source[end:]
    source = source.replace('for (const auto* name : {"getSystemVersion", "getModel",',
                            'for (const auto* name : {"getDisplayWidth", "getDisplayHeight", "getSystemVersion", "getModel",', 1)
    require(hashlib.sha256(source.encode()).hexdigest() == BEFORE_SHA, "Pre-edit source reconstruction drift")
    return source


def row_from(path):
    return next(row for row in json.loads(path.read_text())
                if row["file"].endswith("/HarmonyBridgeModules.cpp"))


def arguments(row):
    return list(row.get("arguments") or shlex.split(row["command"]))


def include_flags(command):
    result = []
    i = 0
    while i < len(command):
        flag = command[i]
        if flag == "-isystem":
            # Host platform's system headers must precede OHOS headers.
            if "sysroot/usr/include" not in command[i + 1]:
                result.extend(command[i:i + 2])
            i += 2
            continue
        if flag.startswith("-I") and "sysroot/usr/include" not in flag:
            result.append(flag)
        i += 1
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-lease", required=True, help="Explicit parent grant identifier")
    parser.add_argument("--x86-commands", required=True, type=Path)
    parser.add_argument("--arm64-commands", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    require(bool(args.native_lease.strip()), "An explicit native grant is required")
    output = args.output.resolve()
    require(not output.exists(), "Use a fresh evidence directory")
    output.mkdir(parents=True)
    inputs = {}
    records = []

    def remember(path):
        path = path.resolve()
        digest = sha(path)
        require(str(path) not in inputs or inputs[str(path)] == digest, f"Input drift: {path}")
        inputs[str(path)] = digest

    def execute(label, command, cwd=ROOT, expect=0):
        log = output / (label + ".log")
        print(label, flush=True)
        result = subprocess.run(list(map(str, command)), cwd=cwd, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                env={**os.environ, "ASAN_OPTIONS": "halt_on_error=1",
                                     "UBSAN_OPTIONS": "halt_on_error=1"})
        log.write_text(result.stdout)
        records.append({"label": label, "command": list(map(str, command)), "cwd": str(cwd),
                        "exit": result.returncode, "log": str(log)})
        (output / "commands.json").write_text(json.dumps(records, indent=2) + "\n")
        if expect == 0:
            require(result.returncode == 0, f"{label} failed: {log}\n{result.stdout[-6000:]}")
        else:
            require(result.returncode != 0, f"{label} unexpectedly linked without the SDK library")
        return result.stdout

    def dependencies(path, cwd=ROOT):
        # No Windows drive prefixes in the macOS compiler dependency files.
        text = path.read_text().replace("\\\n", "")
        for name in shlex.split(text.split(":", 1)[1]):
            remember(Path(cwd) / name)

    production_before = baseline(PRODUCTION.read_text())
    before = output / "HarmonyBridgeModules-before.cpp"
    before.write_text(production_before)
    sources = [PRODUCTION, HOST / "HarmonyBridgeModules.hpp", Path(__file__),
               TESTS / "device-display-bridge.cpp", TESTS / "device-display-sdk.cpp",
               TESTS / "device-display.test.mjs"]
    for source in sources:
        remember(source)
        (output / source.name).write_bytes(source.read_bytes())

    rows = {arch: row_from(path) for arch, path in (
        ("x86_64", args.x86_commands.resolve()), ("arm64-v8a", args.arm64_commands.resolve()))}
    for path in (args.x86_commands, args.arm64_commands):
        remember(path)
    commands = {arch: arguments(row) for arch, row in rows.items()}
    sdk = Path(next(flag.split("=", 1)[1] for flag in commands["x86_64"] if flag.startswith("--sysroot=")))
    native = sdk.parent
    for name in ("oh_display_manager.h", "oh_display_info.h"):
        path = sdk / "usr/include/window_manager" / name
        remember(path)
        (output / name).write_bytes(path.read_bytes())
    remember(sdk / "usr/include/arkui/native_node.h")

    # Fresh, small real Valdi utility objects from the same maintained fork as
    # the app commands. Never link an old app or runtime archive into the tests.
    includes = include_flags(commands["x86_64"])
    core_include = next(Path(flag[2:]) for flag in includes
                        if flag.startswith("-I") and flag.endswith("/valdi_core/src"))
    fork = core_include.parents[1]
    core = core_include / "valdi_core/cpp"
    names = [
        "Utils/Shared.cpp", "Utils/Bytes.cpp", "Utils/Value.cpp", "Utils/ValueMap.cpp",
        "Utils/StringBox.cpp", "Utils/StringCache.cpp", "Utils/InternedStringImpl.cpp",
        "Utils/ValueArray.cpp", "Utils/ValueFunction.cpp", "Utils/ValueFunctionWithCallable.cpp",
        "Utils/ValueTypedArray.cpp", "Utils/ValueTypedObject.cpp", "Utils/ValueTypedProxyObject.cpp",
        "Utils/StaticString.cpp", "Utils/Error.cpp", "Utils/Mutex.cpp", "Utils/Result.cpp",
        "Utils/ExceptionTracker.cpp", "Utils/ValdiObject.cpp", "Text/UTF16Utils.cpp",
        "Schema/ValueSchema.cpp", "Context/ContextBase.cpp",
    ]
    support = [core / name for name in names]
    support += [fork / "libs/utils/src/utils/debugging/Assert.cpp",
                fork / "libs/utils/src/utils/debugging/detail/AssertInternals.cpp",
                ROOT / ".tools/harmony/runtime-inputs/external/fmt/src/format.cc"]
    host_flags = ["-std=c++20", "-O1", "-g", "-UNDEBUG", "-ffunction-sections", "-fdata-sections",
                  "-DDATAREF_OBJC=0", "-DDATAREF_JNI=0", "-DDATAREF_WASM=0",
                  "-D_LIBCPP_ENABLE_CXX17_REMOVED_UNARY_BINARY_FUNCTION",
                  "-Wno-deprecated-declarations", "-Wno-deprecated-literal-operator",
                  "-Wno-ignored-attributes", "-Wno-missing-template-arg-list-after-template-kw",
                  "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                  "-idirafter", str(sdk / "usr/include"), "-I" + str(HOST), *includes]

    def host_object(source, label):
        remember(source)
        obj = output / (label + ".o")
        dep = obj.with_suffix(".d")
        execute(label, ["/usr/bin/clang++", *host_flags, "-MMD", "-MF", dep,
                        "-c", source, "-o", obj])
        dependencies(dep)
        return obj

    common = [host_object(source, f"host-support-{i:02}") for i, source in enumerate(support)]
    test_obj = host_object(TESTS / "device-display-bridge.cpp", "host-test")
    for label, source in (("red", before), ("green", PRODUCTION)):
        bridge_obj = host_object(source, "host-bridge-" + label)
        executable = output / ("bridge-" + label)
        execute("host-link-" + label, ["/usr/bin/clang++", "-fsanitize=address,undefined",
                "-Wl,-dead_strip", *common, test_obj, bridge_obj, "-o", executable])
        execute("host-run-" + label, [executable, *(["--expect-unsupported"] if label == "red" else [])])

    # Real production objects with each actual app's SDK/fork compile command.
    # Then use an isolated strict SDK link, without any runtime/app archive.
    for arch, command in commands.items():
        row = rows[arch]
        obj = output / ("bridge-" + arch + ".o")
        dep = obj.with_suffix(".d")
        command[command.index("-o") + 1] = str(obj)
        command += ["-MMD", "-MF", str(dep), "-Wall", "-Wextra", "-Werror",
                    "-Wno-unused-parameter", "-Wno-unused-command-line-argument"]
        execute("sdk-production-" + arch, command, Path(row["directory"]))
        dependencies(dep, Path(row["directory"]))
        imports = execute("sdk-production-imports-" + arch,
                          [native / "llvm/bin/llvm-nm", "--undefined-only", obj])
        display_imports = {line.split()[-1] for line in imports.splitlines()
                           if "OH_NativeDisplayManager_" in line}
        require(display_imports == SYMBOLS, f"Unexpected display SDK imports: {display_imports}")
        target = next(flag for flag in command if flag.startswith("--target="))
        triple = target.split("=", 1)[1]
        library = sdk / "usr/lib" / triple / "libnative_display_manager.so"
        remember(library)
        exports = execute("sdk-exports-" + arch,
                          [native / "llvm/bin/llvm-nm", "-D", "--defined-only", library])
        require(SYMBOLS <= {line.split()[-1] for line in exports.splitlines() if line.split()},
                f"Missing real SDK exports: {library}")
        probe = output / ("sdk-probe-" + arch + ".o")
        execute("sdk-probe-object-" + arch, [command[0], target, "--sysroot=" + str(sdk),
                "-std=c++20", "-fPIC", "-Wall", "-Wextra", "-Werror", "-c",
                TESTS / "device-display-sdk.cpp", "-o", probe])
        shared = output / ("libdevice-display-" + arch + ".so")
        link = [command[0], target, "--sysroot=" + str(sdk), "-shared", probe,
                "-Wl,--no-undefined", "-o", shared]
        negative = execute("sdk-link-without-library-" + arch, link, expect=1)
        require(all(symbol in negative for symbol in SYMBOLS), "Negative link did not fail on all required symbols")
        execute("sdk-link-with-library-" + arch, [*link, library])
        dynamic = execute("sdk-dynamic-" + arch, [native / "llvm/bin/llvm-readelf", "-d", shared])
        require("libnative_display_manager.so" in dynamic, "SDK dependency absent from DT_NEEDED")

    for path, digest in inputs.items():
        require(sha(Path(path)) == digest, f"Consumed source/header changed during validation: {path}")
    manifest = {
        "completedAt": datetime.now(timezone.utc).isoformat(), "nativeLease": args.native_lease,
        "parallelJobs": 1, "baselineSHA256": BEFORE_SHA, "productionSHA256": sha(PRODUCTION),
        "headerSHA256": sha(HOST / "HarmonyBridgeModules.hpp"),
        "hostBoundary": "fresh real fork Valdi objects; only three SDK functions replaced; ASan+UBSan",
        "sdkBoundary": "actual app bridge objects; isolated SDK strict links; no runtime/app archives",
        "appBuildExecuted": False, "runtimeBuildExecuted": False, "deviceReplayExecuted": False,
        "displaySymbols": sorted(SYMBOLS), "inputsSHA256": inputs,
        "artifactsSHA256": {str(path): sha(path) for path in output.iterdir() if path.is_file()},
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("PASS: serial native RED/GREEN, both SDK ABI objects/imports and strict +/- SDK links")
    print("Frozen evidence: " + str(output))


if __name__ == "__main__":
    main()
