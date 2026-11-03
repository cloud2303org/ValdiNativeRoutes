#!/usr/bin/env python3
"""Compile the production HTTP adapter against SDK26 for both OHOS ABIs; run host regressions."""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile


COMMANDS = []


def run(command, cwd=None, env=None):
    result = subprocess.run(command, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    COMMANDS.append({
        "command": [str(argument) for argument in command],
        "cwd": str(cwd or Path.cwd()), "exit": result.returncode, "output": result.stdout,
        "sanitizer_environment": {key: env[key] for key in ("ASAN_OPTIONS", "UBSAN_OPTIONS")
                                  if env and key in env},
    })
    if result.stdout:
        print(result.stdout, end="", flush=True)
    result.check_returncode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sanitize", action="store_true", help="Enable host address/undefined sanitizers")
    parser.add_argument("--proof-dir", type=Path, help="Retain compiled artifacts and a source/SDK hash manifest")
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[7]
    production = root / "harmony/entry/src/main/cpp/host/HarmonyHTTPRequestManager.cpp"
    test = Path(__file__).with_name("harmony-http.cpp")
    temporary = tempfile.TemporaryDirectory(prefix="harmony-http-")
    with temporary as directory:
        output = options.proof_dir.resolve() if options.proof_dir else Path(directory)
        output.mkdir(parents=True, exist_ok=True)
        rows = {}
        artifacts = []
        inputs = {}

        def remember(path, snapshot=False):
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if path in inputs:
                assert inputs[path] == digest, f"Input changed during validation: {path}"
            inputs[path] = digest
            if snapshot:
                try:
                    relative = Path("sources") / path.relative_to(root)
                except ValueError:
                    relative = Path("sdk") / path.name
                frozen = output / relative
                frozen.parent.mkdir(parents=True, exist_ok=True)
                frozen.write_bytes(data)
                artifacts.append(frozen)

        for path in (production, production.with_suffix(".hpp"), test, Path(__file__),
                     production.with_name("HTTP_API.md")):
            remember(path, snapshot=True)
        for name in ("HTTPRequestManager", "HTTPRequestManagerCompletion", "HTTPRequest", "HTTPResponse", "Cancelable"):
            remember(root / f".tools/harmony/upstream/valdi_core/generated-src/cpp/valdi_core/{name}.hpp",
                     snapshot=True)
        for arch in ("x86_64", "arm64-v8a"):
            compilation_database = root / f".tools/harmony/runtime-{arch}/compile_commands.json"
            remember(compilation_database)
            database = json.loads(compilation_database.read_text())
            row = next(item for item in database if item["file"].endswith("/HTTPRequestManagerUtils.cpp"))
            rows[arch] = row
            command = shlex.split(row["command"])
            sdk = Path(next(argument.split("=", 1)[1] for argument in command
                            if argument.startswith("--sysroot=")))
            # RemoteCommunicationKit belongs to the Huawei SDK overlay, not OpenHarmony.
            hms = sdk.parents[2] / "hms/native/sysroot"
            rcp_include = hms / "usr/include"
            remember(rcp_include / "RemoteCommunicationKit/rcp.h", snapshot=True)
            command[command.index("-o") + 1] = str(output / f"http-{arch}.o")
            command[-1] = str(production)
            command += [f"-I{rcp_include}", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter"]
            run(command, cwd=row["directory"])
            print(f"{arch}: production object compiled with true SDK", flush=True)
            runtime = root / f".tools/harmony/runtime-{arch}/libvaldi_runtime_ohos_link_check.so"
            target = next(argument for argument in command if argument.startswith("--target="))
            sysroot = next(argument for argument in command if argument.startswith("--sysroot="))
            triple = target.split("=", 1)[1]
            library = hms / f"usr/lib/{triple}/librcp_c.so"
            remember(library)
            remember(runtime)
            run([command[0], target, sysroot, "-shared", str(output / f"http-{arch}.o"),
                 str(runtime), str(library), "-Wl,--no-undefined",
                 "-o", str(output / f"libhttp-{arch}.so")])
            print(f"{arch}: strict native HTTP/runtime shared-library link passed", flush=True)
            artifacts += [output / f"http-{arch}.o", output / f"libhttp-{arch}.so", library, runtime]

        # Preserve include roots from the real compilation database. Apple system headers precede
        # SDK headers; the exact RCP declarations come from the Huawei overlay.
        arguments = shlex.split(rows["x86_64"]["command"])
        includes = []
        position = 0
        while position < len(arguments):
            argument = arguments[position]
            if argument.startswith("-I"):
                includes.append(argument)
            elif argument == "-isystem":
                includes.extend(arguments[position:position + 2])
                position += 1
            position += 1
        sdk = next(argument.split("=", 1)[1] for argument in arguments if argument.startswith("--sysroot="))
        core = root / ".tools/harmony/upstream/valdi_core/src/valdi_core/cpp"
        names = (
            "Utils/Shared.cpp", "Utils/Bytes.cpp", "Utils/Value.cpp", "Utils/ValueMap.cpp",
            "Utils/StringBox.cpp", "Utils/StringCache.cpp", "Utils/InternedStringImpl.cpp",
            "Utils/ValueArray.cpp", "Utils/ValueFunction.cpp", "Utils/ValueTypedArray.cpp",
            "Utils/ValueTypedObject.cpp", "Utils/ValueTypedProxyObject.cpp", "Utils/StaticString.cpp",
            "Utils/Error.cpp", "Utils/Mutex.cpp", "Text/UTF16Utils.cpp", "Schema/ValueSchema.cpp",
        )
        sources = [core / name for name in names]
        sources += [root / ".tools/harmony/runtime-inputs/external/fmt/src/format.cc", production, test]
        for source in sources:
            remember(source, snapshot=True)
        command = [
            "/usr/bin/clang++", "-std=c++20", "-O1", "-g", "-ffunction-sections", "-fdata-sections",
            "-DDATAREF_OBJC=0", "-DDATAREF_JNI=0", "-DDATAREF_WASM=0",
            "-D_LIBCPP_ENABLE_CXX17_REMOVED_UNARY_BINARY_FUNCTION", "-Wno-deprecated-declarations",
            "-Wno-deprecated-literal-operator", "-Wno-ignored-attributes",
            "-idirafter", str(Path(sdk) / "usr/include"), f"-I{rcp_include}", *includes,
        ]
        sanitizers = ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"] if options.sanitize else []
        objects = [output / f"host-{position}.o" for position in range(len(sources))]

        def compile_source(pair):
            source, obj = pair
            run([*command, *sanitizers, "-c", str(source), "-o", str(obj)])

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(compile_source, zip(sources, objects)))
        executable = output / "http-tests"
        run(["/usr/bin/clang++", *sanitizers, "-Wl,-dead_strip",
             *(str(obj) for obj in objects), "-o", str(executable)])
        environment = os.environ.copy()
        if options.sanitize:
            # UBSan otherwise recovers from many errors and can leave a passing exit code.
            for name in ("ASAN_OPTIONS", "UBSAN_OPTIONS"):
                previous = environment.get(name, "")
                environment[name] = f"{previous}:halt_on_error=1" if previous else "halt_on_error=1"
        run([str(executable)], env=environment)
        for path, digest in inputs.items():
            assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, f"Input changed during validation: {path}"
        receipts = output / "commands.json"
        receipts.write_text(json.dumps(COMMANDS, indent=2) + "\n")
        artifacts += [receipts, executable]
        manifest = {
            "validation": "both OHOS ABI strict links and production-manager OS-boundary regressions",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "sanitize": options.sanitize,
            "inputs_sha256": {str(path): digest for path, digest in inputs.items()},
            "sha256": {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in artifacts},
        }
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        if options.proof_dir:
            print(f"Frozen proof: {output}", flush=True)


if __name__ == "__main__":
    main()
