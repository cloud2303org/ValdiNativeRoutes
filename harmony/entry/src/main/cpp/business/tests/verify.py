#!/usr/bin/env python3
"""Real SDK two-ABI compile/strict link and real Valdi host boundary regressions.

No application build, device, remote, generated ABI stub, or modified upstream.
Host tests replace only the OS AssetStore service, not Valdi or business logic.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile


def run(command, **kwargs):
    subprocess.run([str(value) for value in command], check=True, **kwargs)


def main():
    # Storage has a current-ABI bounded proof and must not use this historical
    # broad runner's Context/runtime archive with newer Valdi headers.
    if sys.argv[1:2] == ["storage"]:
        run([sys.executable, Path(__file__).with_name("verify-storage.py"), *sys.argv[2:]])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sanitize", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    root = tests.parents[6]
    production = [tests.parent / name for name in ("AssetTokenStore.cpp", "HarmonyBusinessModules.cpp")]
    production.append(tests.parent.parent / "host/HarmonyStorageHost.cpp")
    canonical_root = root / "valdi/native/generated"
    generated_root = root / ".tools/harmony/business-bindings"
    generated = [canonical_root / "valdi_modules/app_pages/app_pages.cpp",
                 generated_root / "valdi_modules/bluetooth/bluetooth.cpp"]
    temporary = tempfile.TemporaryDirectory(prefix="harmony-first-login-") if not args.output else None
    output = args.output.resolve() if args.output else Path(temporary.name)
    output.mkdir(parents=True, exist_ok=True)
    contract = (root / "valdi/modules/bluetooth/src/BleHost.ts").read_text()
    native = production[1].read_text()
    hostContract = re.search(r"export interface BleHost \{(.*?)^\}", contract, re.S | re.M)[1]
    radio = set(re.findall(r"^\s+(\w+)\([^;]*?\): Promise<", hostContract, re.M))
    nativeRadio = set(re.findall(r'final \{\s+return reject<.*?>\("(\w+)"\);', native))
    assert radio <= nativeRadio, f"BleHost radio contract drift: {radio - nativeRadio}"
    eventContract = re.search(r"export interface BleHostEvents \{(.*?)^\}", contract, re.S | re.M)[1]
    events = set(re.findall(r"^\s+(\w+):", eventContract, re.M))
    test_source = (tests / "business-tests.cpp").read_text()
    test_events = set(re.findall(r'"(\w+)"', re.search(r'events\[\] = \{(.*?)\};', test_source, re.S)[1]))
    assert events == test_events, f"BleHostEvents test coverage drift: {events ^ test_events}"
    print(f"Actual TS contract: {len(radio)} radio methods and {len(events)} event functions matched", flush=True)
    proof = {"hostUsesAssetServiceDouble": True, "deviceExecution": False, "abis": {},
             "jsConsumerExecuted": False, "productionPromiseSchemaAssertions": True,
             "contract": {"radioMethods": sorted(radio), "eventFunctions": sorted(events)},
             "sourceSHA256": {str(source.relative_to(root)): hashlib.sha256(source.read_bytes()).hexdigest()
                              for source in [*production, *generated, tests / "business-tests.cpp", tests / "storage-tests.cpp", tests / "promise-consumer.js", Path(__file__).resolve()]}}
    rows = {}
    for abi in ("x86_64", "arm64-v8a"):
        runtime = root / f".tools/harmony/runtime-{abi}"
        commands = json.loads((runtime / "compile_commands.json").read_text())
        row = next(item for item in commands if item["file"].endswith("/valdi/runtime/Runtime.cpp"))
        rows[abi] = row
        objects = []
        for source in [*production, *generated]:
            obj = output / f"{source.stem}-{abi}.o"
            command = shlex.split(row["command"])
            command[command.index("-o") + 1] = str(obj)
            command[-1] = str(source)
            command += ["-I" + str(root / ".tools/harmony/business-inputs/sqlite"), "-I" + str(canonical_root), "-I" + str(generated_root), "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter"]
            run(command, cwd=row["directory"])
            objects.append(obj)
        compiler = shlex.split(row["command"])
        target = next(item for item in compiler if item.startswith("--target="))
        sysroot = next(item for item in compiler if item.startswith("--sysroot="))
        library = output / f"libfirst-login-{abi}.so"
        link = [compiler[0], target, sysroot, "-shared", *objects,
                runtime / "libvaldi_runtime_ohos_link_check.so", "-lasset_ndk.z",
                root / f"harmony/business-build/.artifacts/{abi}/business/libvaldi_clientsql_sqlite_ohos.a",
                "-Wl,--no-undefined", "-o", library]
        run(link)
        readelf = Path(compiler[0]).with_name("llvm-readelf")
        elf = subprocess.check_output([str(readelf), "-h", "-d", str(library)], text=True)
        assert "TEXTREL" not in elf
        assert ("X86-64" if abi == "x86_64" else "AArch64") in elf
        assert "libasset_ndk.z.so" in elf
        proof["abis"][abi] = {"library": str(library), "strictLink": True, "sdkAssetDependency": True,
                             "sha256": hashlib.sha256(library.read_bytes()).hexdigest(),
                             "linkCommand": [str(value) for value in link], "elf": elf}
        print(f"{abi}: real SDK production compile + --no-undefined AssetStore/Valdi link passed", flush=True)

    # Reuse real native Valdi test compile options/dependencies. Do not rebuild or
    # change the parent's CMake files or any runtime sources.
    host = root / "harmony/business-build/.artifacts/host"
    hostCommands = json.loads((host / "compile_commands.json").read_text())
    hostRow = next(row for row in hostCommands if row["file"].endswith("ClientSQLNativeModuleFactory_tests.cpp"))
    arguments = shlex.split(hostRow["command"])
    includes = []
    i = 0
    while i < len(arguments):
        if arguments[i] == "-isystem":
            includes += arguments[i:i + 2]
            i += 2
            continue
        if arguments[i].startswith(("-I", "-D")):
            includes.append(arguments[i])
        i += 1
    sdk = next(item.split("=", 1)[1] for item in compiler if item.startswith("--sysroot="))
    flags = ["-I" + str(canonical_root), "-I" + str(generated_root), "-std=c++20", "-O1", "-g", "-Wno-ignored-attributes", "-Wno-deprecated-declarations",
             "-Wno-deprecated-literal-operator", "-Wno-missing-template-arg-list-after-template-kw",
             "-idirafter", str(Path(sdk) / "usr/include"), *includes]
    if args.sanitize:
        flags += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
    runtime = root / ".tools/harmony/upstream/valdi/src/valdi/runtime"
    sources = [*production, *generated, tests / "business-tests.cpp",
               tests / "storage-tests.cpp"]
    sources += [runtime / name for name in (
        "Utils/DisposableGroup.cpp", "Utils/BridgeLogger.cpp", "Context/ContextEntry.cpp",
        "Context/Context.cpp", "Context/AttributionResolver.cpp", "Resources/ResourceManager.cpp")]
    objects = [output / f"host-{source.stem}.o" for source in sources]

    def compile_one(pair):
        source, obj = pair
        run(["/usr/bin/clang++", *flags, "-c", source, "-o", obj], cwd=hostRow["directory"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(compile_one, zip(sources, objects)))
    executable = output / "business-tests"
    libs = [host / "libreal_valdi_host.a", host / "deps/fmt/libfmt.a",
            host / "deps/jsoncpp/src/lib_json/libjsoncpp.a",
            host / "lib/libgtest_main.a", host / "lib/libgtest.a", host / "libreal_sqlite_host.a"]
    run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", *objects, *libs, "-o", executable])
    env = os.environ.copy()
    if args.sanitize:
        env["ASAN_OPTIONS"] = "halt_on_error=1"
        env["UBSAN_OPTIONS"] = "halt_on_error=1"
    run([executable, f"--gtest_output=xml:{output / 'results.xml'}"], env=env)
    proof["hostSanitizers"] = args.sanitize
    (output / "proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    if args.output:
        print(f"Proof: {output / 'proof.json'}", flush=True)
    if temporary:
        temporary.cleanup()


if __name__ == "__main__":
    main()
