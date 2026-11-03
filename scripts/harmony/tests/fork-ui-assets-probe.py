#!/usr/bin/env python3
"""Fresh SDK configure/ownership and selected object probes; never build or link runtime/app.

Requires an explicitly granted parent native lease. Every CMake/clang invocation
waits for other native compilers. Existing .cxx/entry/build/archives are not inputs.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import time

APP = Path(__file__).resolve().parents[3]
CPP = APP / "harmony/entry/src/main/cpp"
PRODUCTION = [
    CPP / "CMakeLists.txt", CPP / "host/HarmonyNavigator.hpp",
    CPP / "host/HarmonyRuntimeHost.hpp", CPP / "host/HarmonyRuntimeHost.cpp",
]
PARENT = '''cmake_minimum_required(VERSION 3.22)
project(fork_ui_assets_probe LANGUAGES C CXX ASM)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
add_subdirectory("${APP_ROOT}/harmony/entry/src/main/cpp" app)
add_library(fork_ui_assets_consumer OBJECT
  "${APP_ROOT}/scripts/harmony/tests/fork-ui-assets-consumer.cpp")
target_compile_features(fork_ui_assets_consumer PRIVATE cxx_std_20)
target_include_directories(fork_ui_assets_consumer PRIVATE
  "${APP_ROOT}" "${APP_ROOT}/harmony/entry/src/main/cpp"
  "${APP_ROOT}/valdi/native/generated" "${APP_ROOT}/.tools/harmony/business-bindings")
target_compile_definitions(fork_ui_assets_consumer PRIVATE
  VALDI_HARMONY_USE_FORK_UI_ASSETS=$<BOOL:${VALDI_HARMONY_USE_FORK_UI_ASSETS}>
  VALDI_HARMONY_FULL_DEVELOPMENT=0
  VALDI_HARMONY_FORK_RUNTIME=$<STREQUAL:${VALDI_HARMONY_RUNTIME_MODE},fork>)
if(VALDI_HARMONY_RUNTIME_MODE STREQUAL "fork")
  target_link_libraries(fork_ui_assets_consumer PRIVATE Valdi::HarmonyRuntime)
else()
  target_link_libraries(fork_ui_assets_consumer PRIVATE valdi_runtime_ohos)
endif()
if(VALDI_HARMONY_USE_FORK_UI_ASSETS)
  target_link_libraries(fork_ui_assets_consumer PRIVATE Valdi::HarmonyArkUI Valdi::HarmonyAssets)
endif()
file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/app-properties.txt" CONTENT
"links=$<TARGET_PROPERTY:valdi_harmony,LINK_LIBRARIES>
interface_definitions=$<TARGET_PROPERTY:valdi_harmony,INTERFACE_COMPILE_DEFINITIONS>
sources=$<TARGET_PROPERTY:valdi_harmony,SOURCES>
")
'''


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def snapshot(paths):
    return {str(path): sha(path) for path in sorted(set(paths)) if path.is_file()}


def wait_slot():
    announced = False
    while True:
        active = []
        for line in subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True).splitlines():
            fields = line.strip().split(None, 1)
            if len(fields) == 2:
                name = Path(fields[1]).name
                if name.startswith(("clang", "ld.lld")) or name in {"cc1", "cc1plus", "g++"}:
                    active.append(fields[0])
        if not active:
            return
        if not announced:
            print("Waiting for native slot: " + ", ".join(active), flush=True)
            announced = True
        time.sleep(0.25)


def execute(args, command, label, cwd=None):
    wait_slot()
    log = args.output / (label + ".log")
    print(label, flush=True)
    started = time.time_ns()
    with log.open("w") as stream:
        result = subprocess.run(command, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT,
                                env={**os.environ, "CMAKE_BUILD_PARALLEL_LEVEL": "1",
                                     "PYTHONDONTWRITEBYTECODE": "1"})
    record = {"command": command, "cwd": str(cwd) if cwd else None,
              "exit": result.returncode, "log": str(log), "startedNs": started}
    with (args.output / "invocations.jsonl").open("a") as stream:
        stream.write(json.dumps(record) + "\n")
    return record


def configure(args, source, build, arch, mode, enabled, label, extra=()):
    flags = []
    if mode == "fork":
        flags = [f"-DVALDI_HARMONY_FORK_ROOT={args.fork_root}",
                 "-DVALDI_HARMONY_PROFILE=full-development",
                 f"-DVALDI_HARMONY_EXTERNAL_DIR={args.external}",
                 f"-DVALDI_HARMONY_PROTO_DIR={args.proto}",
                 f"-DVALDI_HARMONY_WEBSOCKETPP_DIR={args.websocketpp}"]
    selection = [f"-DVALDI_HARMONY_USE_FORK_UI_ASSETS={'ON' if enabled else 'OFF'}"]
    if mode == "legacy" and not enabled:
        selection = []  # Exercise the actual OFF default, not an explicit override.
    return execute(args, [
        str(args.sdk / "build-tools/cmake/bin/cmake"), "-S", str(source), "-B", str(build),
        "-G", "Ninja", f"-DCMAKE_TOOLCHAIN_FILE={args.sdk}/build/cmake/ohos.toolchain.cmake",
        f"-DCMAKE_MAKE_PROGRAM={args.sdk}/build-tools/cmake/bin/ninja",
        f"-DOHOS_ARCH={arch}", "-DCMAKE_BUILD_TYPE=Debug", "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
        f"-DAPP_ROOT={APP}", f"-DVALDI_HARMONY_RUNTIME_MODE={mode}", *selection, *flags, *extra,
    ], label)


def frozen_inputs(args):
    groups = [
        (CPP / "backend", args.fork_root / "valdi/harmony/arkui/provenance/application-backend-53.json",
         "backendSourceSHA256"),
        (CPP / "assets", args.fork_root / "valdi/harmony/assets/provenance/application-assets-25.json", None),
        (args.fork_root / "valdi/harmony/arkui", args.arkui_receipt, "fileSHA256"),
        (args.fork_root / "valdi/harmony/assets", args.assets_receipt, "fileSHA256"),
    ]
    proofs = []
    for source, proof, key in groups:
        contents = json.loads(proof.read_text())
        expected = contents[key] if key else contents
        for relative, digest in expected.items():
            require(sha(source / relative) == digest, "Frozen source changed: " + str(source / relative))
        proofs.append({"root": str(source), "receipt": str(proof), "receiptSHA256": sha(proof),
                       "fileCount": len(expected), "fileSHA256": expected})
    return proofs


def ownership(args, build, mode, enabled):
    rows = json.loads((build / "compile_commands.json").read_text())
    files = {Path(row["file"]).resolve() for row in rows}
    local = {p.resolve() for directory in ("backend", "assets") for p in (CPP / directory).glob("*.cpp")}
    fork_cpp = {args.fork_root / "valdi/harmony/arkui" / name for name in
                ("ArkUIViewManager.cpp", "ArkUIImageAsset.cpp")}
    fork_cpp |= {args.fork_root / "valdi/harmony/assets" / name for name in (
        "HarmonyImageAsset.cpp", "HarmonyImageAssetLoader.cpp", "HarmonyImageDecoder.cpp",
        "HarmonyImageDrawing.cpp", "HarmonyImageFilter.cpp")}
    require((files & local) == (set() if enabled else local), "Local source ownership mismatch")
    require((files & fork_cpp) == (fork_cpp if enabled else set()), "Fork source ownership mismatch")
    properties = (build / "app-properties.txt").read_text()
    for target in ("Valdi::HarmonyArkUI", "Valdi::HarmonyAssets"):
        require((target in properties) == enabled, "Wrong actual app target linkage: " + target)
    interface = properties.split("interface_definitions=", 1)[1].splitlines()[0]
    require("VALDI_HARMONY_USE_FORK_UI_ASSETS" not in interface, "App selection macro leaked publicly")
    host_rows = [row for row in rows if str(CPP / "host") + "/" in row["file"]]
    require(bool(host_rows), "No actual app host commands")
    for row in host_rows:
        command = row.get("arguments") or shlex.split(row["command"])
        require(f"-DVALDI_HARMONY_USE_FORK_UI_ASSETS={int(enabled)}" in command,
                "App host macro is not a private numeric selection")
    plan = subprocess.check_output([str(args.sdk / "build-tools/cmake/bin/ninja"), "-C", str(build),
                                    "-t", "commands", "valdi_harmony"], text=True)
    (build / "app-link-plan.txt").write_text(plan)
    final = plan.splitlines()[-1]
    require("--no-undefined" in final and "libvaldi_harmony.so" in final, "Not the real app link plan")
    for archive in ("libvaldi_harmony_arkui.a", "libvaldi_harmony_assets.a"):
        require((archive in final) == enabled, "Wrong selected app archive: " + archive)
    return rows, {"localProductionSources": sorted(str(p) for p in files & local),
                  "forkProductionSources": sorted(str(p) for p in files & fork_cpp),
                  "properties": properties, "linkPlan": str(build / "app-link-plan.txt"),
                  "linkPlanSHA256": sha(build / "app-link-plan.txt"),
                  "linkPlanExecuted": False, "mode": mode, "forkUIAssets": enabled}


def compile_one(args, row, build, label, enabled, consumed):
    command = list(row.get("arguments") or shlex.split(row["command"]))
    output = args.output / "objects" / (label + ".o")
    output.parent.mkdir(exist_ok=True)
    command[command.index("-o") + 1] = str(output)
    dependencies = output.with_suffix(".d")
    record = execute(args, [*command, "-MD", "-MF", str(dependencies)], label, Path(row["directory"]))
    require(record["exit"] == 0, "Actual object failed: " + record["log"])
    paths = shlex.split(dependencies.read_text().replace("\\\n", "").split(":", 1)[1])
    paths = {(Path(row["directory"]) / p).resolve() for p in paths}
    relevant = []
    for path in paths:
        if path.is_relative_to(APP) or path.is_relative_to(args.fork_root):
            digest = sha(path)
            require(path.stat().st_mtime_ns < record["startedNs"], "Source changed during compile: " + str(path))
            require(str(path) not in consumed or consumed[str(path)] == digest, "Consumed header drift")
            consumed[str(path)] = digest
            relevant.append(str(path))
    legacy = {CPP / "backend/ArkUIViewManager.hpp", CPP / "assets/HarmonyImageAsset.hpp",
              CPP / "assets/HarmonyImageAssetLoader.hpp"}
    selected = {args.fork_root / "valdi/harmony/arkui/ArkUIViewManager.hpp",
                args.fork_root / "valdi/harmony/assets/HarmonyImageAsset.hpp",
                args.fork_root / "valdi/harmony/assets/HarmonyImageAssetLoader.hpp"}
    require(not (paths & (legacy if enabled else selected)), "Mixed legacy/fork public header owners")
    record.update({"source": row["file"], "object": str(output), "sha256": sha(output),
                   "dependencyFile": str(dependencies), "consumedAppForkSources": sorted(relevant)})
    return record


def run(args):
    require(args.native_lease, "An explicit parent native compile lease is required")
    args.output = args.output.resolve()
    require(not args.output.exists(), "Use a new output directory")
    args.output.mkdir(parents=True)
    for name in ("fork_root", "sdk", "external", "proto", "websocketpp", "arkui_receipt", "assets_receipt"):
        setattr(args, name, getattr(args, name).resolve())
    initial_frozen = frozen_inputs(args)
    owned = [*PRODUCTION, *Path(__file__).parent.glob("fork-ui-assets*")]
    document = APP / "docs/harmony-fork-ui-assets.md"
    if document.is_file():
        owned.append(document)
    own_before = snapshot(owned)
    # Runtime source/configuration hashes are evidence, not old-archive compatibility claims.
    runtime_paths = [p for directory in ("valdi/harmony/runtime", "valdi/src/valdi/runtime")
                     for p in (args.fork_root / directory).rglob("*") if p.is_file()]
    runtime_before = snapshot(runtime_paths)
    parent = args.output / "parent"
    parent.mkdir()
    (parent / "CMakeLists.txt").write_text(PARENT)
    source_result = execute(args, ["node", "--test", str(APP / "scripts/harmony/tests/fork-ui-assets.test.mjs")],
                            "source-green")
    require(source_result["exit"] == 0, "Source regression failed")
    configurations = []
    object_records = []
    consumed = {}
    for arch in ("x86_64", "arm64-v8a"):
        for mode, enabled in (("legacy", False), ("fork", False), ("fork", True)):
            label = f"{arch}-{mode}-{'fork-ui' if enabled else 'legacy-ui'}"
            build = args.output / label
            result = configure(args, parent, build, arch, mode, enabled, label + "-configure")
            require(result["exit"] == 0, "Configuration failed: " + result["log"])
            rows, owners = ownership(args, build, mode, enabled)
            chosen = [CPP / "host" / name for name in
                      ("HarmonyRuntimeHost.cpp", "HarmonyNavigator.cpp", "NapiModule.cpp")]
            chosen.append(APP / "scripts/harmony/tests/fork-ui-assets-consumer.cpp")
            production = (args.fork_root / "valdi/harmony") if enabled else CPP
            chosen += [production / ("arkui" if enabled else "backend") / "ArkUIViewManager.cpp"]
            chosen += [production / "assets" / name for name in (
                "HarmonyImageAsset.cpp", "HarmonyImageAssetLoader.cpp", "HarmonyImageDecoder.cpp",
                "HarmonyImageDrawing.cpp", "HarmonyImageFilter.cpp")]
            if enabled:
                chosen.append(production / "arkui/ArkUIImageAsset.cpp")
            for source in chosen:
                row = next(row for row in rows if Path(row["file"]).resolve() == source.resolve())
                object_records.append(compile_one(args, row, build, label + "-" + source.stem,
                                                  enabled, consumed))
            # Locate by source rather than assuming target/source order.
            consumer = next(record for record in reversed(object_records)
                            if record["source"].endswith("/fork-ui-assets-consumer.cpp"))
            symbols = subprocess.check_output([str(args.sdk / "llvm/bin/llvm-nm"), "-S", consumer["object"]],
                                              text=True)
            layout = next(line for line in symbols.splitlines() if line.endswith("forkUiAssetsContextLayout"))
            size = int(layout.split()[1], 16)
            require(mode != "fork" or size == 616, "Current fork context layout is not 616 bytes")
            map_fields = next(line for line in symbols.splitlines() if line.endswith("forkUiAssetsMapTransportFields"))
            map_field_size = int(map_fields.split()[1], 16)
            require(mode != "fork" or map_field_size == 96, "Map transport references are not 96 bytes")
            if enabled:
                # Use the same real CMake compiler command but the actual old
                # concrete asset header. The reviewed parent assertion must fail.
                bad_source = args.output / (arch + "-wrong-asset-parent.cpp")
                original_source = APP / "scripts/harmony/tests/fork-ui-assets-consumer.cpp"
                bad_source.write_text(original_source.read_text().replace(
                    "#include <HarmonyImageAsset.hpp>",
                    '#include "' + str(CPP / "assets/HarmonyImageAsset.hpp") + '"'))
                row = next(row for row in rows if Path(row["file"]).resolve() == original_source)
                bad_command = list(row.get("arguments") or shlex.split(row["command"]))
                bad_command[bad_command.index("-c") + 1] = str(bad_source)
                bad_command[bad_command.index("-o") + 1] = str(args.output / (arch + "-wrong-parent.o"))
                negative = execute(args, bad_command, arch + "-wrong-asset-parent-negative",
                                   Path(row["directory"]))
                require(negative["exit"] != 0 and "is_base_of_v" in Path(negative["log"]).read_text(),
                        "Wrong legacy asset parent did not fail the actual consumer")
                configurations.append({"negative": "wrong-concrete-asset-parent", **negative})
            configurations.append({"arch": arch, **result, **owners, "contextLayoutBytes": size,
                                   "mapTransportReferenceBytes": map_field_size})
        # A runtime-fork OFF and ON cache each reject the opposite choice.
        for enabled in (False, True):
            build = args.output / f"{arch}-fork-{'fork-ui' if enabled else 'legacy-ui'}"
            negative = configure(args, parent, build, arch, "fork", not enabled,
                                 f"{arch}-cache-switch-{int(enabled)}-negative")
            require(negative["exit"] != 0 and "App UI/assets selection changed" in
                    Path(negative["log"]).read_text(), "Cache selection change was accepted")
            configurations.append({"negative": "cache-switch", **negative})
            if not enabled:
                untracked = configure(args, parent, build, arch, "fork", True,
                                      arch + "-untracked-cache-negative",
                                      ["-UVALDI_HARMONY_APP_CONFIGURED_UI_ASSETS"])
                require(untracked["exit"] != 0 and "selection is untracked" in
                        Path(untracked["log"]).read_text(), "Pre-option cache accepted first fork UI adoption")
                configurations.append({"negative": "untracked-cache", **untracked})
        negative = configure(args, parent, args.output / f"{arch}-legacy-on", arch, "legacy", True,
                             arch + "-legacy-on-negative")
        require(negative["exit"] != 0 and "Fork UI/assets require explicit" in
                Path(negative["log"]).read_text(), "Legacy runtime accepted fork UI/assets")
        configurations.append({"negative": "legacy-on", **negative})
    require(snapshot(owned) == own_before, "Owned sources changed during proof")
    require(snapshot(runtime_paths) == runtime_before, "Current runtime sources changed during proof")
    for file, digest in consumed.items():
        require(sha(Path(file)) == digest, "Consumed app/fork header changed before freeze")
    require(frozen_inputs(args) == initial_frozen, "Frozen source groups changed during proof")
    report = {"capturedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "sourceSHA256": own_before, "frozenSourceGroups": initial_frozen,
              "currentRuntimeSHA256": runtime_before, "consumedSourcesSHA256": consumed,
              "configurations": configurations, "objects": object_records,
              "sourceRegression": source_result, "maxCompilerJobs": 1,
              "scope": "Fresh current-source SDK objects and real app configure/link plans only. "
                       "No runtime build/archive consumption or shared app link; no entry/build/.cxx input.",
              "nativeCompileSlotReleased": True, "pendingWrites": False}
    proof = args.output / "verification.json"
    proof.write_text(json.dumps(report, indent=2) + "\n")
    print("Evidence:", proof, "SHA256", sha(proof), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("fork-root", "sdk", "external", "proto", "websocketpp", "arkui-receipt", "assets-receipt", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--native-lease", action="store_true")
    run(parser.parse_args())
