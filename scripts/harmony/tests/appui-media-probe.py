#!/usr/bin/env python3
"""Serial SDK26 objects and optional fresh-source Node-API/JSC media probe.

No old Valdi archive is linked. --node rebuilds only the 130-source macOS host
probe subset plus its bounded JSC adapter, in the supplied evidence directory.
No Harmony runtime, HAP or device build is invoked. Evidence is never overwritten.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HOST = ROOT / "harmony/entry/src/main/cpp/host"
TESTS = Path(__file__).parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--node", action="store_true")
    parser.add_argument("--media-only", action="store_true", help="Run affected media/feedback checks without rebuilding unchanged presenter/model regressions")
    parser.add_argument("--reuse-from", type=Path, help="Reuse only command/source-identical objects from this probe's prior receipt")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    commands = []
    inputs = {}
    artifacts = []
    reused = {}
    previous = None
    previous_commands = []
    changed_sources = {}
    if args.reuse_from:
        previous = args.reuse_from.resolve()
        prior = json.loads((previous / "receipt.json").read_text())
        for name, sha in prior["inputSHA256"].items():
            if digest(Path(name)) != sha:
                # Source-only changes can recompile their own translation
                # units. A changed header/library invalidates this bounded
                # cache: do not guess its transitive ABI/dependency impact.
                if Path(name).suffix not in {".cpp", ".cc", ".c"}:
                    raise RuntimeError("Prior probe header/library input changed: " + name)
                changed_sources[name] = {"before": sha, "after": digest(Path(name))}
        previous_commands = prior["commands"]

    def run(command, cwd=ROOT, env=None):
        command = list(map(str, command))
        # Native slot audit before every compiler/linker invocation. Never kill
        # another worker or quietly run alongside an unrelated native build.
        if Path(command[0]).name in {"clang++", "c++", "ar"}:
            snapshot = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
            conflicts = [line for line in snapshot.splitlines()
                         if Path(line.strip().split(maxsplit=1)[-1]).name
                         in {"clang", "clang++", "cc1", "cc1plus", "ninja", "make", "cmake", "hvigorw"}]
            with (output / "compiler-scans.log").open("a") as log:
                log.write(snapshot + "\n")
            if conflicts:
                raise RuntimeError("Native compile slot occupied: " + repr(conflicts))
        print("+", shlex.join(command), flush=True)
        commands.append(command)
        for value in command:
            path = Path(value)
            if path.is_absolute() and path.is_file() and path.suffix in {".cpp", ".hpp", ".h", ".a"}:
                inputs[str(path)] = digest(path)
        if previous and "-c" in command and "-o" in command:
            obj = Path(command[command.index("-o") + 1])
            old_obj = previous / obj.name
            normalize = lambda values, directory: [value.replace(str(directory), "<OUTPUT>") for value in values]
            source = Path(command[command.index("-c") + 1])
            old_source = str(source).replace(str(output), str(previous))
            if old_obj.exists() and prior["inputSHA256"].get(old_source) == digest(source) and normalize(command, output) in [
                    normalize(values, previous) for values in previous_commands]:
                expected = prior["outputSHA256"].get(str(old_obj)) or prior.get(
                    "reusedExactCommandObjects", {}).get(str(old_obj), {}).get("SHA256")
                if expected is None or digest(old_obj) != expected:
                    raise RuntimeError("Prior object lacks a matching recorded hash: " + str(old_obj))
                shutil.copy2(old_obj, obj)
                reused[str(obj)] = {"origin": str(old_obj), "SHA256": digest(obj)}
                print("REUSE exact command/source:", obj.name, flush=True)
                return
        subprocess.run(command, cwd=cwd, env=env, check=True)

    try:
        sdk_row = next(row for row in json.loads((ROOT /
            "harmony/entry/.cxx/default/default/debug/x86_64/compile_commands.json").read_text())
            if row["file"].endswith("/HarmonyAppUIHost.cpp"))
        sdk_args = shlex.split(sdk_row["command"])
        sdk_args[1:1] = ["-I" + str(ROOT / "valdi/native/generated"), "-Wall", "-Wextra", "-Werror",
                         "-Wno-unused-parameter", "-Wno-unused-command-line-argument"]
        for abi, target in (("x86_64", "x86_64"), ("arm64-v8a", "aarch64")):
            for name in ("HarmonyAppUIHost.cpp", "HarmonyNativeAppUIPresenter.cpp"):
                command = [arg.replace("--target=x86_64-linux-ohos", f"--target={target}-linux-ohos")
                           for arg in sdk_args]
                obj = output / f"{abi}-{name}.o"
                command[command.index("-o") + 1] = str(obj)
                command[-1] = str(HOST / name)
                run(command, cwd=sdk_row["directory"])
                artifacts.append(obj)
        if not args.node:
            return

        native = ROOT / "harmony/business-build/.artifacts/host"
        rows = [row for row in json.loads((native / "compile_commands.json").read_text())
                if "CMakeFiles/real_valdi_host.dir/" in row["command"]]
        reference = next(row for row in rows if row["file"].endswith("/Context.cpp"))
        flags = []
        raw = shlex.split(reference["command"])
        index = 1
        while index < len(raw):
            arg = raw[index]
            if arg == "-isystem":
                flags.extend(raw[index:index + 2]); index += 2; continue
            if arg.startswith(("-I", "-D")):
                flags.append(arg)
            index += 1
        sysroot = next(arg.split("=", 1)[1] for arg in sdk_args if arg.startswith("--sysroot="))
        node = Path(shutil.which("node")).resolve()
        include = node.parent.parent / "include/node"
        forwarding = output / "node-headers/napi"
        forwarding.mkdir(parents=True)
        (forwarding / "native_api.h").write_text("#include <node_api.h>\n")
        flags[:0] = ["-I" + str(forwarding.parent), "-I" + str(include),
                     "-I" + str(ROOT / "valdi/native/generated")]
        flags += ["-idirafter", str(Path(sysroot) / "usr/include"), "-std=c++20", "-O1", "-g",
                  "-UNDEBUG", "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                  "-Wno-missing-template-arg-list-after-template-kw", "-Wno-deprecated-declarations",
                  "-Wno-deprecated-literal-operator", "-Wno-unused-result", "-Wno-vla-cxx-extension",
                  "-Wno-deprecated-this-capture"]
        # Everything capable of depending on IJavaScriptContext is compiled
        # fresh against one header inventory. fmt/json archives have no Valdi ABI.
        fresh = []
        for index, row in enumerate(rows):
            obj = output / f"core-{index}.o"
            run(["/usr/bin/clang++", *flags, "-c", row["file"], "-o", obj])
            fresh.append(obj)
        archive = output / "libappui-media-fresh-host.a"
        run(["/usr/bin/ar", "rcs", archive, *fresh])
        artifacts.append(archive)
        runtime = ROOT / ".tools/harmony/upstream/valdi/src/valdi"
        engine_driver = HOST.parent / "platform/tests/engine_boundary.py"
        inventory = next(node.value for node in ast.walk(ast.parse(engine_driver.read_text()))
                         if isinstance(node, ast.Assign) and any(
                             isinstance(target, ast.Name) and target.id == "names" for target in node.targets))
        sources = [runtime / name for name in ast.literal_eval(inventory)]
        sources += [runtime / "runtime" / name for name in (
            "Utils/DisposableGroup.cpp", "Utils/BridgeLogger.cpp", "Context/ContextEntry.cpp",
            "Context/AttributionResolver.cpp", "Resources/ResourceManager.cpp")]
        sources += [HOST / name for name in ("HarmonyAppUIHost.cpp", "HarmonyNativeAppUIPresenter.cpp",
                                             "HarmonyMainThreadDispatcher.cpp")]
        sources += [ROOT / "valdi/native/generated/valdi_modules/app_pages/app_pages.cpp",
                    ROOT / ".tools/harmony/runtime-inputs/external/boringssl/crypto/base64/base64.cc",
                    TESTS / "appui-media-addon.cpp"]
        objects = []
        host_object = None
        for index, source in enumerate(sources):
            obj = output / f"addon-{index}.o"
            compatibility = ["-fno-sanitize=vla-bound"] if source.name in {
                "JavaScriptCoreContext.cpp", "JSCoreCustomClasses.cpp"} else []
            prefix = []
            if source.name == "base64.cc":
                # Node's headers also ship OpenSSL. This upstream BoringSSL
                # translation unit must resolve its own exact include tree.
                prefix = ["-I" + str(ROOT / ".tools/harmony/runtime-inputs/external/boringssl/include")]
            run(["/usr/bin/clang++", *prefix, *flags, *compatibility, "-c", source, "-o", obj])
            if source.name == "HarmonyAppUIHost.cpp":
                host_object = obj
            objects.append(obj)
        libraries = [archive, native / "deps/fmt/libfmt.a", native / "deps/jsoncpp/src/lib_json/libjsoncpp.a"]
        addon = output / "appui-media.node"
        link = ["/usr/bin/clang++", *flags, "-bundle", "-Wl,-undefined,dynamic_lookup", "-Wl,-dead_strip",
                "-Wl,-exported_symbol,_napi_register_module_v1",
                "-Wl,-exported_symbol,_node_api_module_get_api_version_v1"]
        run([*link, *objects, *libraries, "-framework", "JavaScriptCore", "-o", addon])
        artifacts.append(addon)
        asan = subprocess.check_output(
            ["/usr/bin/clang++", "-print-file-name=libclang_rt.asan_osx_dynamic.dylib"], text=True).strip()
        env = dict(os.environ, DYLD_INSERT_LIBRARIES=asan, ASAN_OPTIONS="halt_on_error=1",
                   UBSAN_OPTIONS="halt_on_error=1", APPUI_MEDIA_ADDON=str(addon), APPUI_TEST_ADDON=str(addon))
        run([node, TESTS / "appui-media-native.test.mjs"], env=env)
        run([node, HOST / "tests/AppUI-feedback.test.cjs"], env=env)
        if args.media_only:
            return
        presenter = output / "existing-presenter-regression"
        run(["/usr/bin/clang++", *flags, HOST / "HarmonyNativeAppUIPresenter.cpp",
             HOST / "tests/AppUI-native.cpp", "-o", presenter])
        run([presenter], env=env)
        models = output / "existing-promise-model-regression"
        supporting = {"DisposableGroup.cpp", "BridgeLogger.cpp", "ContextEntry.cpp",
                      "AttributionResolver.cpp", "ResourceManager.cpp", "app_pages.cpp", "base64.cc"}
        support_objects = [obj for source, obj in zip(sources, objects) if source.name in supporting]
        run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", HOST / "tests/AppUI-host.cpp",
             *support_objects, *libraries, "-o", models])
        run([models], env=env)
        artifacts.extend([presenter, models])

        # Restore the former three always-unsupported branches only in an
        # isolated source copy. The same production-path tests must reject it.
        control = output / "HarmonyAppUIHost-unsupported.cpp"
        text = (HOST / "HarmonyAppUIHost.cpp").read_text()
        for name, result in (("scanCode", "Pages::ScanCodeReply"), ("pickAttachments", "Pages::AttachmentSelection"),
                             ("clearAttachmentCache", "void")):
            pattern = r"(Valdi::Future<" + re.escape(result) + r"> " + name + r"\([^)]*\) override \{)"
            text, count = re.subn(pattern, lambda match: match[1] +
                f'\n        return rejected<{result}>("E_APP_UI_UNSUPPORTED:{name}");', text)
            assert count == 1
        control.write_text(text)
        control_obj = output / "unsupported.o"
        run(["/usr/bin/clang++", *flags, "-I" + str(HOST), "-c", control, "-o", control_obj])
        red_addon = output / "appui-media-unsupported.node"
        run([*link, *[control_obj if obj == host_object else obj for obj in objects], *libraries,
             "-framework", "JavaScriptCore", "-o", red_addon])
        red_env = dict(env, APPUI_MEDIA_ADDON=str(red_addon))
        result = subprocess.run([str(node), str(TESTS / "appui-media-native.test.mjs")], env=red_env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (output / "unsupported-control.log").write_text(result.stdout)
        assert result.returncode != 0 and "E_APP_UI_UNSUPPORTED" in result.stdout
        print("PASS former unsupported behavior is detected by real generated-proxy tests", flush=True)
    finally:
        for path in [HOST / name for name in ("HarmonyAppUIHost.hpp", "HarmonyPendingAppUIRequest.hpp",
                                              "HarmonyNativeAppUIPresenter.hpp")]:
            inputs[str(path)] = digest(path)
        receipt = {
            "commands": commands, "inputSHA256": inputs,
            "reusedExactCommandObjects": reused,
            "recompiledChangedSources": changed_sources,
            "outputSHA256": {str(path): digest(path) for path in artifacts if path.exists()},
            "serialNativeSlot": True, "oldValdiArchiveLinked": False,
            "HAP": False, "HarmonyRuntimeBuild": False, "device": False,
            "hostEngine": "macOS official Valdi JSC adapter; not OHOS Hermes",
            "OSBoundary": "SDK declarations for objects; SDK doubles for native execution"
        }
        (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
