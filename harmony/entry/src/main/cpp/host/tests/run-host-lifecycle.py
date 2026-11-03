#!/usr/bin/env python3
"""Compile host lifecycle sources for both OHOS ABIs and run real pinned lifetime helpers."""
import concurrent.futures
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile


def run(command, cwd=None):
    print("+ " + shlex.join(map(str, command)), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main():
    root = Path(__file__).resolve().parents[7]
    host = root / "harmony/entry/src/main/cpp/host"
    native = root / "harmony/business-build/.artifacts/host"
    generated = root / "valdi/native/generated"
    canonical = generated / "valdi_modules/app_pages/app_pages.cpp"
    row = next(item for item in json.loads(
        (root / "harmony/entry/.cxx/default/default/debug/x86_64/compile_commands.json").read_text())
        if item["file"].endswith("/HarmonyRuntimeHost.cpp"))
    sdk = Path(next(arg.split("=", 1)[1] for arg in shlex.split(row["command"])
                    if arg.startswith("--sysroot=")))
    if not (sdk / "usr/include/arkui/native_type.h").is_file():
        raise FileNotFoundError(f"Installed SDK ArkUI headers missing: {sdk}")
    if not canonical.is_file():
        raise FileNotFoundError(f"Canonical generated app_pages source missing: {canonical}")
    sources = [host / name for name in (
        "HarmonyAppUIHost.cpp", "HarmonyRuntimeHost.cpp", "HarmonyNavigator.cpp", "NapiModule.cpp")]
    sources.append(canonical)
    with tempfile.TemporaryDirectory(prefix="harmony-host-lifecycle-") as directory:
        output = Path(directory)

        def compile_ohos(item):
            abi, source = item
            args = shlex.split(row["command"])
            args[args.index("-o") + 1] = str(output / f"{abi}-{source.name}.o")
            args[-1] = str(source)
            if abi == "arm64-v8a":
                args = [arg.replace("--target=x86_64-linux-ohos", "--target=aarch64-linux-ohos")
                        for arg in args]
            # Prefer current generated bindings over stale .tools business inputs.
            args[1:1] = ["-I" + str(generated), "-DVALDI_HARMONY_APPLICATION_DEBUG=1",
                         "-Wall", "-Wextra", "-Werror",
                         "-Wno-unused-parameter", "-Wno-unused-command-line-argument"]
            run(args, cwd=row["directory"])
            print(f"PASS: SDK26 {abi} {source.name}", flush=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(compile_ohos, [(abi, name)
                                       for abi in ("x86_64", "arm64-v8a") for name in sources]))

        reference = next(item for item in json.loads((native / "compile_commands.json").read_text())
                         if item["file"].endswith("/Context.cpp"))
        flags = []
        args = shlex.split(reference["command"])
        position = 0
        while position < len(args):
            arg = args[position]
            if arg == "-isystem":
                flags.extend(args[position:position + 2])
                position += 2
                continue
            if arg.startswith(("-I", "-D")):
                flags.append(arg)
            position += 1
        # -idirafter exposes the actual SDK ArkUI declarations without replacing
        # the macOS host's standard C/C++ headers with OHOS sysroot headers.
        flags[0:0] = ["-I" + str(generated)]
        flags += ["-idirafter", str(sdk / "usr/include"),
                  "-std=c++20", "-O1", "-g", "-UNDEBUG", "-fsanitize=address,undefined",
                  "-fno-omit-frame-pointer", "-Wno-missing-template-arg-list-after-template-kw",
                  "-Wno-deprecated-declarations", "-Wno-deprecated-literal-operator"]
        runtime = root / ".tools/harmony/upstream/valdi/src/valdi/runtime"
        test_sources = [Path(__file__).with_name("host-lifecycle.cpp"), canonical]
        test_sources += [runtime / name for name in (
            "Utils/DisposableGroup.cpp", "Utils/BridgeLogger.cpp", "Context/ContextEntry.cpp",
            "Context/Context.cpp", "Context/AttributionResolver.cpp", "Resources/ResourceManager.cpp")]
        # Canonical generated model marshalling pulls in real ValueUtils binary
        # encoding. Link its pinned implementation rather than supplying stubs.
        test_sources += [root / ".tools/harmony/runtime-inputs/external/boringssl/crypto/base64/base64.cc"]
        objects = [output / f"test-{index}.o" for index in range(len(test_sources))]
        for source, obj in zip(test_sources, objects):
            run(["/usr/bin/clang++", *flags, "-c", str(source), "-o", str(obj)])
        executable = output / "host-lifecycle"
        libraries = [native / "libreal_valdi_host.a", native / "deps/fmt/libfmt.a",
                     native / "deps/jsoncpp/src/lib_json/libjsoncpp.a"]
        run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", *map(str, objects),
             *map(str, libraries), "-o", str(executable)])
        environment = os.environ.copy()
        environment["ASAN_OPTIONS"] = "halt_on_error=1"
        environment["UBSAN_OPTIONS"] = "halt_on_error=1"
        print(f"+ ASAN_OPTIONS={environment['ASAN_OPTIONS']} "
              f"UBSAN_OPTIONS={environment['UBSAN_OPTIONS']} {executable}", flush=True)
        subprocess.run([str(executable)], check=True, env=environment)


if __name__ == "__main__":
    main()
