#!/usr/bin/env python3
"""Isolated /tmp SDK/helper checks only; never configures/builds the shared app or a HAP."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[7]
    host = root / "harmony/entry/src/main/cpp/host"
    output = (options.output or Path(tempfile.mkdtemp(prefix="harmony-ota-integration-", dir="/private/tmp"))).resolve()
    if not output.is_relative_to(Path("/private/tmp")):
        raise RuntimeError("Proof outputs must be isolated under /private/tmp")
    output.mkdir(parents=True, exist_ok=True)
    if (output / "integration-proof.json").exists():
        raise RuntimeError("Choose a fresh output; frozen proof is immutable")
    commands = []

    def run(args, name, cwd=None, env=None):
        args = list(map(str, args))
        log = output / (name + ".log")
        commands.append({"name": name, "args": args, "cwd": str(cwd or root), "log": str(log)})
        with log.open("w") as handle:
            result = subprocess.run(args, cwd=cwd, env=env, stdout=handle, stderr=subprocess.STDOUT)
        if result.returncode:
            print(log.read_text()[-16000:], flush=True)
            raise RuntimeError(f"{name} failed: {log}")

    db = root / "harmony/entry/.cxx/default/default/debug/x86_64/compile_commands.json"
    app_rows = [row for row in json.loads(db.read_text())
                if row.get("output", "").startswith("CMakeFiles/valdi_harmony.dir/")]
    reference = next(row for row in app_rows if row["file"].endswith("/HarmonyRuntimeHost.cpp"))
    extra = [host / "HarmonyOTAProcess.cpp", host / "HarmonyOTAProcessHTTP.cpp"]
    app_sources = [Path(row["file"]) for row in app_rows] + extra
    input_files = set(app_sources)
    input_files.update(host.glob("HarmonyOTA*"))
    input_files.update(host.glob("HarmonyResourceLoader.*"))
    input_files.update(host.glob("HarmonyRuntimeHost.*"))
    input_files.update(host.glob("HarmonyNavigator.*"))
    input_files.update((host / "tests").glob("*ota*"))
    input_files.update(host.parent.rglob("*.hpp"))
    input_files.add(root / "valdi/native/generated/valdi_modules/app_pages/app_pages.hpp")
    input_files.update((root / ".tools/harmony/business-bindings").rglob("*.hpp"))
    input_files.add(host.parent / "CMakeLists.txt")
    input_files.add(root / "scripts/harmony/ota.mjs")
    input_files = sorted(file for file in input_files if file.is_file())
    hashes = {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest() for file in input_files}
    (output / "inputs-at-start.json").write_text(json.dumps(hashes, indent=2) + "\n")
    sdkruntime = root / ".tools/harmony"

    def cross_compile(item):
        abi, index, unit = item
        row = next((row for row in app_rows if row["file"] == str(unit)), reference)
        args = shlex.split(row["command"])
        obj = output / f"{abi}-{index}.o"
        args[args.index("-o") + 1] = str(obj)
        args[-1] = str(unit)
        if abi == "arm64-v8a":
            args = [arg.replace("--target=x86_64-linux-ohos", "--target=aarch64-linux-ohos") for arg in args]
        args += ["-Wno-unused-command-line-argument"]
        # Enforce warnings on the integration-owned units. Existing backend
        # warning policy is preserved rather than edited during this OTA task.
        if unit.parent == host:
            args += ["-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter"]
        run(args, f"compile-{abi}-{index}", cwd=row["directory"])
        return abi, obj

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        objects = list(pool.map(cross_compile,
            [(abi, i, unit) for abi in ("x86_64", "arm64-v8a") for i, unit in enumerate(app_sources)]))
    abis = []
    for abi, target in (("x86_64", "x86_64-linux-ohos"), ("arm64-v8a", "aarch64-linux-ohos")):
        flags = shlex.split(reference["command"])
        sdk = next(arg for arg in flags if arg.startswith("--sysroot="))
        sdkpath = Path(sdk.split("=", 1)[1])
        hms = sdkpath.parent.parent.parent / "hms/native/sysroot"
        business = root / f"harmony/business-build/.artifacts/{abi}/business"
        runtime = sdkruntime / f"runtime-{abi}"
        library = output / f"libOTAIntegration-{abi}.so"
        run([flags[0], "--target=" + target, sdk, "-shared", "-Wl,--no-undefined",
             *[obj for arch, obj in objects if arch == abi],
             runtime / "libvaldi_runtime_ohos_link_check.so",
             "-Wl,--whole-archive", business / "libvaldi_clientsql_ohos.a", "-Wl,--no-whole-archive",
             business / "libvaldi_clientsql_sqlite_ohos.a",
             runtime / "deps/boringssl/crypto/libcrypto.a",
             runtime / "deps/jsoncpp/src/lib_json/libjsoncpp.a",
             "-lace_ndk.z", "-lace_napi.z", "-lhilog_ndk.z", "-lrawfile.z", "-lnative_drawing",
             "-limage_source", "-limage_packer", "-lpixelmap", "-lasset_ndk.z", "-luv",
             hms / f"usr/lib/{target}/librcp_c.so", "-ldl", "-lm", "-o", library],
            f"link-{abi}")
        abis.append({"abi": abi, "library": str(library), "sha256": hashlib.sha256(library.read_bytes()).hexdigest()})
        print(f"PASS {abi}: {len(app_sources)} current native units and strict SDK/runtime/business link", flush=True)

    external = sdkruntime / "runtime-inputs/external"
    cmake = shutil.which("cmake")
    if not cmake:
        raise RuntimeError("cmake needed for private host BoringSSL helper build")
    run([cmake, "-S", external / "boringssl", "-B", output / "crypto",
         "-DCMAKE_BUILD_TYPE=Release", "-DOPENSSL_NO_ASM=ON", "-DBUILD_TESTING=OFF",
         "-DCMAKE_C_COMPILER=/usr/bin/clang", "-DCMAKE_CXX_COMPILER=/usr/bin/clang++",
         "-DCMAKE_POLICY_VERSION_MINIMUM=3.5"], "host-crypto-configure")
    run([cmake, "--build", output / "crypto", "--target", "crypto", "-j4"], "host-crypto-compile")
    native = root / "harmony/business-build/.artifacts/host"
    row = next(row for row in json.loads((native / "compile_commands.json").read_text())
               if row["file"].endswith("/Runtime.cpp"))
    args = shlex.split(row["command"])
    flags = args[1:]
    del flags[flags.index("-o"):flags.index("-o") + 2]
    del flags[flags.index("-c"):flags.index("-c") + 2]
    sdkpath = Path(next(arg.split("=", 1)[1] for arg in shlex.split(reference["command"]) if arg.startswith("--sysroot=")))
    flags += ["-idirafter", str(sdkpath / "usr/include"), "-UNDEBUG", "-O1", "-g",
              "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer",
              "-Wno-ignored-attributes"]
    units = [host / name for name in ("HarmonyOTA.cpp", "HarmonyOTAHTTP.cpp", "HarmonyOTAProcess.cpp",
                                     "HarmonyResourceLoader.cpp", "HarmonyBootstrap.cpp",
                                     "tests/ota-integration.cpp", "tests/harmony-ota.cpp")]

    def host_compile(pair):
        index, unit = pair
        obj = output / f"host-{index}.o"
        run([args[0], *flags, "-c", unit, "-o", obj], f"host-compile-{index}", cwd=row["directory"])
        return obj

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        host_objects = list(pool.map(host_compile, enumerate(units)))
    libraries = [native / "libreal_valdi_host.a", native / "deps/fmt/libfmt.a",
                 native / "deps/jsoncpp/src/lib_json/libjsoncpp.a", next((output / "crypto").rglob("libcrypto.a"))]
    for name, linked in (("integration-tests", host_objects[:6]), ("core-tests", host_objects[:2] + [host_objects[6]])):
        run([args[0], *flags, "-Wl,-dead_strip", *linked, *libraries, "-o", output / name], f"host-link-{name}")
    run(["node", host / "tests/ota-integration-fixtures.mjs", output / "fixtures"], "fixtures")
    environment = os.environ.copy()
    environment.update({"ASAN_OPTIONS": "halt_on_error=1", "UBSAN_OPTIONS": "halt_on_error=1"})
    for mode in ("missing", "bad-json", "missing-identity", "bad-identity", "bad-key", "empty-url", "seed", "enabled"):
        storage = output / ("enabled-cache" if mode in ("seed", "enabled") else mode + "-cache")
        run([output / "integration-tests", mode, output / "fixtures", storage], "test-" + mode, env=environment)
        print((output / ("test-" + mode + ".log")).read_text().strip(), flush=True)
    run([output / "core-tests", output / "fixtures", output / "fixtures/public.pem", output / "core-cache"],
        "test-core", env=environment)
    print((output / "test-core.log").read_text().strip(), flush=True)
    run(["python3", host / "tests/ota-route-acceptance.py", "--output", output / "routes"], "test-routes")
    print((output / "test-routes.log").read_text().splitlines()[-1], flush=True)
    changed = [relative for relative, sha in hashes.items()
               if hashlib.sha256((root / relative).read_bytes()).hexdigest() != sha]
    if changed:
        (output / "input-drift.json").write_text(json.dumps(changed, indent=2) + "\n")
        raise RuntimeError("Inputs changed during proof: " + ", ".join(changed))
    for relative in hashes:
        dest = output / "frozen" / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((root / relative).read_bytes())
    (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    packaged_paths = [root / "harmony/entry/src/main/resources/rawfile/valdi_ota.json",
                      root / ".tools/harmony/business-rawfile/valdi_ota.json"]
    packaged = {str(file.relative_to(root)): file.exists() for file in packaged_paths}
    proof = {"sources": hashes, "abis": abis, "asanUbsan": True, "packagedConfigPresence": packaged,
             "enabledLiveQA": False, "output": str(output), "commands": str(output / "commands.json")}
    (output / "integration-proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    print("Frozen source/proof manifest: " + str(output / "integration-proof.json"), flush=True)


if __name__ == "__main__":
    main()
