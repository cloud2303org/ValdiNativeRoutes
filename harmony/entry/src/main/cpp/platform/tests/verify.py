#!/usr/bin/env python3
"""Focused production-port real SDK two-ABI link and ASAN/UBSAN host checks.

Reuses prepared runtime objects; never builds/exports the app or touches devices.
"""
import concurrent.futures
import hashlib
import json
import os
import re
from pathlib import Path
import shlex
import shutil
import subprocess
import argparse
import tempfile


def run(command, **kwargs):
    subprocess.run([str(arg) for arg in command], check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--engine", action="store_true",
                        help="also run official Valdi/JSC + attached marshaller boundary tests")
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    root = tests.parents[6]
    production = sorted(tests.parent.glob("*.cpp")) + [
        tests.parent.parent / "business/HarmonySystemServiceHosts.cpp"]
    generated_root = root / ".tools/harmony/business-bindings"
    canonical_root = root / "valdi/native/generated"
    generated = [generated_root / "valdi_modules/bluetooth/bluetooth.cpp",
                 canonical_root / "valdi_modules/app_pages/app_pages.cpp"]
    temp = tempfile.TemporaryDirectory(prefix="platform-port-") if not args.output else None
    output = args.output.resolve() if args.output else Path(temp.name)
    output.mkdir(parents=True, exist_ok=True)
    exported = (root / "harmony/entry/src/main/ets/platform/PlatformServiceTypes.ets").read_text()
    def interfaces(text):
        text = re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S)
        return {name: re.sub(r"\s+", "", body) for name, body in
                re.findall(r"export interface (\w+)\s*\{(.*?)^\}", text, flags=re.S | re.M)}
    arkts = interfaces(exported)
    for contract in ("bluetooth/src/BleHost", "app_pages/src/permissions/PermissionHost",
                     "app_pages/src/wifi/WifiHost", "app_pages/src/nfc/NfcHost"):
        expected = interfaces((root / f"valdi/modules/{contract}.ts").read_text())
        assert expected, f"No source interfaces detected in {contract}"
        for name, body in expected.items():
            assert arkts.get(name) == body, f"ArkTS host/model contract drift: {name}"
    print(f"PASS ArkTS: {len(arkts) - 1} exact exported host/model/event contracts", flush=True)
    source_files = [root / "tools/valdi-rolldown/harmony-service-adapters.ts"] + production + list(tests.parent.glob("*.hpp")) + list(tests.glob("*.*")) + generated
    source_files += [tests.parent.parent / "business/HarmonySystemServiceHosts.hpp",
                     root / "harmony/entry/src/main/ets/platform/PlatformServiceTypes.ets"]
    proof = {"device": False, "fullAppBuild": False, "abis": {}, "hostSanitizers": ["ASAN", "UBSAN"],
             "sourceSHA256": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in source_files if p.is_file()},
             "arktsHostModelEventContracts": len(arkts) - 1}
    app_row = next(r for r in json.loads(
        (root / "harmony/entry/.cxx/default/default/debug/x86_64/compile_commands.json").read_text())
        if r["file"].endswith("/HarmonyAppUIHost.cpp"))

    def abi_probe(abi):
        runtime = root / f".tools/harmony/runtime-{abi}"
        # Runtime compile DB carries the actual SDK triple/sysroot, not a mock ABI.
        row = next(r for r in json.loads((runtime / "compile_commands.json").read_text())
                   if r["file"].endswith("/valdi/runtime/Runtime.cpp"))
        original = shlex.split(app_row["command"])
        native = shlex.split(row["command"])
        for prefix in ("--target=", "--sysroot="):
            replacement = next(a for a in native if a.startswith(prefix))
            original = [replacement if a.startswith(prefix) else a for a in original]
        sources = production + generated + [tests.parent.parent / "host/HarmonyMainThreadDispatcher.cpp"]
        objects = []
        for index, source in enumerate(sources):
            obj = output / f"{abi}-{index}.o"
            command = original[:]
            command.insert(1, "-I" + str(canonical_root))
            command[command.index("-o") + 1] = str(obj)
            command[-1] = str(source)
            command += ["-I" + str(generated_root), "-Wall", "-Wextra", "-Werror",
                        "-Wno-unused-parameter", "-Wno-unused-command-line-argument"]
            run(command, cwd=app_row["directory"])
            objects.append(obj)
        library = output / f"libplatform-port-{abi}.so"
        command = [native[0], *[a for a in native if a.startswith(("--target=", "--sysroot="))],
                   "-shared", *objects, runtime / "libvaldi_runtime_ohos_link_check.so",
                   "-lace_napi.z", "-lhilog_ndk.z", "-luv", "-Wl,--no-undefined", "-o", library]
        run(command)
        readelf = Path(native[0]).with_name("llvm-readelf")
        elf = subprocess.check_output([str(readelf), "-h", "-d", str(library)], text=True)
        assert ("X86-64" if abi == "x86_64" else "AArch64") in elf
        assert "TEXTREL" not in elf and "libace_napi.z.so" in elf
        print(f"PASS {abi}: real generated schemas, port, NAPI transport, facade, dispatcher SDK compile/strict link", flush=True)
        return abi, {"library": str(library), "strictLink": True, "elf": elf,
                     "sha256": hashlib.sha256(library.read_bytes()).hexdigest(),
                     "linkCommand": [str(arg) for arg in command]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        proof["abis"] = dict(pool.map(abi_probe, ("x86_64", "arm64-v8a")))

    host = root / "harmony/business-build/.artifacts/host"
    host_row = next(r for r in json.loads((host / "compile_commands.json").read_text())
                    if r["file"].endswith("ClientSQLNativeModuleFactory_tests.cpp"))
    arguments = shlex.split(host_row["command"])
    flags = ["-I" + str(canonical_root)]
    i = 0
    while i < len(arguments):
        if arguments[i] == "-isystem":
            flags += arguments[i:i + 2]
            i += 2
            continue
        if arguments[i].startswith(("-I", "-D")):
            flags.append(arguments[i])
        i += 1
    flags += ["-I" + str(generated_root), "-std=c++20", "-O1", "-g", "-UNDEBUG",
              "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
              "-Wno-missing-template-arg-list-after-template-kw", "-Wno-deprecated-declarations",
              "-Wno-deprecated-literal-operator"]
    runtime = root / ".tools/harmony/upstream/valdi/src/valdi/runtime"
    sources = [tests.parent / name for name in ("PlatformServiceCodec.cpp", "PlatformServicePort.cpp", "PlatformServiceAdapters.cpp")]
    sources += generated + [tests / "platform-port-tests.cpp"]
    sources += [runtime / name for name in (
        "Utils/DisposableGroup.cpp", "Utils/BridgeLogger.cpp", "Context/ContextEntry.cpp",
        "Context/Context.cpp", "Context/AttributionResolver.cpp", "Resources/ResourceManager.cpp")]
    objects = [output / f"host-{i}.o" for i in range(len(sources))]

    def compile_one(pair):
        source, obj = pair
        run(["/usr/bin/clang++", *flags, "-c", source, "-o", obj])

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(compile_one, zip(sources, objects)))
    core_objects = [obj for source, obj in zip(sources, objects) if source.name != "platform-port-tests.cpp"]
    executable = output / "platform-port-tests"
    libs = [host / "libreal_valdi_host.a", host / "deps/fmt/libfmt.a",
            host / "deps/jsoncpp/src/lib_json/libjsoncpp.a",
            host / "lib/libgtest_main.a", host / "lib/libgtest.a"]
    run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", *objects, *libs, "-o", executable])
    env = os.environ.copy()
    env.update(ASAN_OPTIONS="halt_on_error=1", UBSAN_OPTIONS="halt_on_error=1")
    run([executable, f"--gtest_output=xml:{output / 'results.xml'}"], env=env)
    proof["hostTransport"] = "OS service double; real production codec/port/generated schemas/Valdi runtime"
    # Same production NAPI transport, executed against the actual Node-API
    # implementation. Header forwarding selects official Node headers; it does
    # not declare fake NAPI/Valdi symbols. Only the OS services are JS doubles.
    node = Path(shutil.which("node")).resolve()
    node_include = node.parent.parent / "include/node"
    assert (node_include / "node_api.h").is_file(), "Official installed Node headers required"
    forwarding = output / "node-headers/napi"
    forwarding.mkdir(parents=True, exist_ok=True)
    (forwarding / "native_api.h").write_text("#include <node_api.h>\n")
    node_flags = flags + ["-I" + str(forwarding.parent), "-I" + str(node_include)]
    addon_sources = [tests.parent / "NapiPlatformServiceTransport.cpp", tests / "napi-transport-addon.cpp"]
    addon_objects = [output / f"addon-{i}.o" for i in range(len(addon_sources))]
    for source, obj in zip(addon_sources, addon_objects):
        run(["/usr/bin/clang++", *node_flags, "-c", source, "-o", obj])
    addon = output / "platform-transport.node"
    run(["/usr/bin/clang++", *node_flags, "-bundle", "-Wl,-undefined,dynamic_lookup", "-Wl,-dead_strip",
         "-Wl,-exported_symbol,_napi_register_module_v1",
         "-Wl,-exported_symbol,_node_api_module_get_api_version_v1",
         *core_objects, *addon_objects, *libs[:3], "-o", addon])
    asan_runtime = subprocess.check_output(
        ["/usr/bin/clang++", "-print-file-name=libclang_rt.asan_osx_dynamic.dylib"], text=True).strip()
    node_env = dict(env, DYLD_INSERT_LIBRARIES=asan_runtime, PLATFORM_TEST_ADDON=str(addon))
    # Node's default isolated test child loses macOS DYLD preload settings.
    # node:test also executes normally in this one process, with ASAN preloaded.
    node_result = subprocess.run([str(node), str(tests / "napi-transport.test.cjs")],
                                 env=node_env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (output / "node-api-tests.log").write_text(node_result.stdout)
    print(node_result.stdout, end="", flush=True)
    node_result.check_returncode()
    proof["nodeAPIExecution"] = "actual Node-API runtime, production NAPI transport, OS doubles only"
    proof["valdiJavaScriptEngineExecuted"] = False
    if args.engine:
        from engine_boundary import verify
        (output / "engine-inputs.json").write_text(json.dumps({
            "root": str(root), "output": str(output), "flags": flags,
            "core_objects": [str(p) for p in core_objects],
            "libs": [str(p) for p in libs]}, indent=2) + "\n")
        proof["engineBoundary"] = verify(root, output, flags, core_objects, libs)
        proof["valdiJavaScriptEngineExecuted"] = "official pinned Valdi JavaScriptCore adapter (macOS)"
        proof["hermesExecuted"] = False
    (output / "proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(f"Proof {output / 'proof.json'}", flush=True)
    if temp:
        temp.cleanup()


if __name__ == "__main__":
    main()
