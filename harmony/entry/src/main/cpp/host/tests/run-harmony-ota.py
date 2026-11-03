#!/usr/bin/env python3
"""Build ONLY isolated OTA objects/fixtures. Never invokes shared builders, exports or devices."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile


def run(args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="New isolated output directory, retained as evidence")
    parser.add_argument("--sanitize", action="store_true")
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[7]
    output = options.output or Path(tempfile.mkdtemp(prefix="harmony-ota-")).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output / "proof.json").exists():
        raise RuntimeError("Choose a fresh output; existing proof is immutable")
    source = root / "harmony/entry/src/main/cpp/host"
    external = root / ".tools/harmony/runtime-inputs/external"
    units = [source / "HarmonyOTA.cpp", source / "HarmonyOTAHTTP.cpp"]
    owned = [*units, source / "HarmonyOTA.hpp", source / "HarmonyOTA_INTEGRATION.md",
             source / "tests/harmony-ota.cpp", Path(__file__).resolve(),
             root / "scripts/harmony/ota.mjs",
             root / "scripts/harmony/tests/ota-fixtures.mjs",
             root / "scripts/harmony/tests/ota.test.mjs"]
    proof = {"sources": {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest()
                         for file in owned},
             "output": str(output), "abis": [], "host": False, "sanitized": options.sanitize}
    for arch in ("x86_64", "arm64-v8a"):
        build = root / f".tools/harmony/runtime-{arch}"
        rows = json.loads((build / "compile_commands.json").read_text())
        row = next(row for row in rows if row["file"].endswith("/HTTPRequestManagerUtils.cpp"))
        original = shlex.split(row["command"])
        objects = []
        for unit in units:
            obj = output / f"{arch}-{unit.stem}.o"
            args = original[:]
            args[args.index("-o") + 1] = str(obj)
            args[-1] = str(unit)
            args += ["-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter"]
            run(args, cwd=row["directory"])
            objects.append(obj)
        link = [original[0], *[arg for arg in original if
                              arg.startswith("--target=") or arg.startswith("--sysroot=")]]
        library = output / f"libHarmonyOTA-{arch}.so"
        run([*link, "-shared", *objects, build / "libvaldi_runtime_ohos_link_check.so",
             build / "deps/boringssl/crypto/libcrypto.a",
             build / "deps/jsoncpp/src/lib_json/libjsoncpp.a",
             "-Wl,--no-undefined", "-o", library])
        proof["abis"].append({"arch": arch, "linked": str(library),
                              "sha256": hashlib.sha256(library.read_bytes()).hexdigest()})
        print(f"PASS {arch}: real SDK/runtime headers and strict shared library link", flush=True)

    # Host crypto is freshly compiled from the SAME BoringSSL sources, solely in output.
    cmake = shutil.which("cmake")
    if not cmake:
        raise RuntimeError("cmake required for isolated host BoringSSL")
    run([cmake, "-S", external / "boringssl", "-B", output / "boringssl",
         "-DCMAKE_BUILD_TYPE=Release", "-DOPENSSL_NO_ASM=ON", "-DBUILD_TESTING=OFF",
         "-DCMAKE_C_COMPILER=/usr/bin/clang", "-DCMAKE_CXX_COMPILER=/usr/bin/clang++",
         "-DCMAKE_POLICY_VERSION_MINIMUM=3.5"])
    run([cmake, "--build", output / "boringssl", "--target", "crypto", "-j4"])
    host = root / "harmony/business-build/.artifacts/host"
    rows = json.loads((host / "compile_commands.json").read_text())
    row = next(row for row in rows if row["file"].endswith("/runtime/Runtime.cpp"))
    original = shlex.split(row["command"])
    flags = original[1:]
    del flags[flags.index("-o"):flags.index("-o") + 2]
    del flags[flags.index("-c"):flags.index("-c") + 2]
    flags += ["-UNDEBUG", "-O1", "-g", "-Werror", "-Wno-deprecated-declarations"]
    sanitizers = ["-fsanitize=address,undefined", "-fno-sanitize-recover=all",
                  "-fno-omit-frame-pointer"] if options.sanitize else []
    hostUnits = [*units, source / "tests/harmony-ota.cpp"]
    objects = [output / f"host-{file.stem}.o" for file in hostUnits]

    def compile_unit(pair):
        unit, obj = pair
        run([original[0], *flags, *sanitizers, "-c", unit, "-o", obj], cwd=row["directory"])
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(compile_unit, zip(hostUnits, objects)))
    crypto = next((output / "boringssl").rglob("libcrypto.a"))
    executable = output / "ota-tests"
    run([original[0], *sanitizers, "-Wl,-dead_strip", *objects,
         host / "libreal_valdi_host.a", host / "deps/fmt/libfmt.a",
         host / "deps/jsoncpp/src/lib_json/libjsoncpp.a", crypto, "-o", executable])
    run(["node", root / "scripts/harmony/tests/ota-fixtures.mjs", output / "fixtures"])
    run([executable, output / "fixtures", output / "fixtures/public.pem", output / "work"])
    run(["node", "--test", root / "scripts/harmony/tests/ota.test.mjs"])
    proof["host"] = True
    (output / "proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(f"Frozen OTA validation proof: {output / 'proof.json'}", flush=True)


if __name__ == "__main__":
    main()
