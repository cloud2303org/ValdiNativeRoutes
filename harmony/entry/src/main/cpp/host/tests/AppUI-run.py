#!/usr/bin/env python3
"""AppUI SDK26 ABI compile/strict-link checks and sanitized native regressions."""
import ast
import concurrent.futures
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile


def run(command, cwd=None, env=None):
    subprocess.run(command, cwd=cwd, env=env, check=True)


def main():
    root = Path(__file__).resolve().parents[7]
    host = root / "harmony/entry/src/main/cpp/host"
    native = root / "harmony/business-build/.artifacts/host"
    row = next(item for item in json.loads(
        (root / "harmony/entry/.cxx/default/default/debug/x86_64/compile_commands.json").read_text())
        if item["file"].endswith("/HarmonyAppUIHost.cpp"))
    with tempfile.TemporaryDirectory(prefix="AppUI-") as directory:
        output = Path(directory)

        def compile_ohos(abi):
            args = shlex.split(row["command"])
            args[1:1] = ["-I" + str(root / "valdi/native/generated")]
            if abi == "arm64-v8a":
                args = [arg.replace("--target=x86_64-linux-ohos", "--target=aarch64-linux-ohos") for arg in args]
            args[1:1] = ["-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
                         "-Wno-unused-command-line-argument"]
            objects = []
            for name in ("HarmonyAppUIHost.cpp", "HarmonyNativeAppUIPresenter.cpp", "HarmonyMainThreadDispatcher.cpp", "canonical.cpp"):
                obj = output / f"{abi}-{name}.o"
                args[args.index("-o") + 1] = str(obj)
                args[-1] = str(root / "valdi/native/generated/valdi_modules/app_pages/app_pages.cpp") if name == "canonical.cpp" else str(host / name)
                run(args, cwd=row["directory"])
                objects.append(obj)
            print(f"PASS: native AppUI SDK26 {abi} object compiles", flush=True)
            link_flags = [arg for arg in args if arg.startswith(("--target=", "--sysroot="))]
            runtime_so = root / f".tools/harmony/runtime-{abi}/libvaldi_runtime_ohos_link_check.so"
            run([args[0], *link_flags, "-shared", "-Wl,--no-undefined", *map(str, objects),
                 str(runtime_so), "-lace_ndk.z", "-lace_napi.z", "-luv", "-lhilog_ndk.z",
                 "-o", str(output / f"libAppUI-{abi}.so")])
            print(f"PASS: native AppUI SDK26 {abi} strict SDK/runtime shared-library link", flush=True)
            for name in ("HarmonyRuntimeHost.cpp", "NapiModule.cpp"):
                args[args.index("-o") + 1] = str(output / f"{abi}-{name}.o")
                args[-1] = str(host / name)
                run(args, cwd=row["directory"])
            print(f"PASS: AppUI mount integration SDK26 {abi} object compiles", flush=True)

        if not os.environ.get("APPUI_HOST_ONLY"):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(compile_ohos, ("x86_64", "arm64-v8a")))

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
        sdk = next(arg.split("=", 1)[1] for arg in shlex.split(row["command"]) if arg.startswith("--sysroot="))
        flags[0:0] = ["-I" + str(root / "valdi/native/generated")]
        flags += ["-idirafter", str(Path(sdk) / "usr/include"),
                  "-std=c++20", "-O1", "-g", "-UNDEBUG", "-fsanitize=address,undefined",
                  "-fno-omit-frame-pointer", "-Wno-missing-template-arg-list-after-template-kw",
                  "-Wno-deprecated-declarations", "-Wno-deprecated-literal-operator"]
        runtime = root / ".tools/harmony/upstream/valdi/src/valdi/runtime"
        sources = [root / "valdi/native/generated/valdi_modules/app_pages/app_pages.cpp", Path(__file__).with_name("AppUI-host.cpp")]
        sources += [runtime / name for name in (
            "Utils/DisposableGroup.cpp", "Utils/BridgeLogger.cpp", "Context/ContextEntry.cpp",
            "Context/Context.cpp", "Context/AttributionResolver.cpp", "Resources/ResourceManager.cpp")]
        # Real ValueUtils JSON serialization also references binary encoding.
        # Compile its pinned BoringSSL implementation rather than ABI stubs.
        sources += [root / ".tools/harmony/runtime-inputs/external/boringssl/crypto/base64/base64.cc"]
        objects = [output / f"test-{index}.o" for index in range(len(sources))]

        def compile_host(pair):
            source, obj = pair
            run(["/usr/bin/clang++", *flags, "-c", str(source), "-o", str(obj)])

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(compile_host, zip(sources, objects)))
        executable = output / "AppUI-host"
        libraries = [native / "libreal_valdi_host.a", native / "deps/fmt/libfmt.a",
                     native / "deps/jsoncpp/src/lib_json/libjsoncpp.a"]
        run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", *map(str, objects),
             *map(str, libraries), "-o", str(executable)])
        environment = os.environ.copy()
        environment["ASAN_OPTIONS"] = "halt_on_error=1"
        environment["UBSAN_OPTIONS"] = "halt_on_error=1"
        run([str(executable)], env=environment)
        native_test = output / "AppUI-native"
        run(["/usr/bin/clang++", *flags, str(host / "HarmonyNativeAppUIPresenter.cpp"),
             str(Path(__file__).with_name("AppUI-native.cpp")), "-o", str(native_test)])
        run([str(native_test)], env=environment)
        run(["python3", str(Path(__file__).with_name("AppUI-navigation.py"))])
        # Production host and dispatcher run inside the real Node-API runtime.
        # Only the ArkUI render boundary is simulated using the actual SDK types.
        node = Path(shutil.which("node")).resolve()
        node_include = node.parent.parent / "include/node"
        assert (node_include / "node_api.h").is_file()
        forwarding = output / "node-headers/napi"
        forwarding.mkdir(parents=True)
        (forwarding / "native_api.h").write_text("#include <node_api.h>\n")
        node_flags = [*flags, "-I" + str(forwarding.parent), "-I" + str(node_include)]
        addon_sources = [host / name for name in (
            "HarmonyAppUIHost.cpp", "HarmonyNativeAppUIPresenter.cpp", "HarmonyMainThreadDispatcher.cpp")]
        addon_sources += [Path(__file__).with_name("AppUI-feedback-addon.cpp")]
        # Reuse the platform harness's exact pinned engine source inventory,
        # without invoking or modifying its platform-service tests.
        engine_driver = host.parent / "platform/tests/engine_boundary.py"
        inventory = next(node.value for node in ast.walk(ast.parse(engine_driver.read_text()))
                         if isinstance(node, ast.Assign) and any(
                             isinstance(target, ast.Name) and target.id == "names" for target in node.targets))
        addon_sources += [root / ".tools/harmony/upstream/valdi/src/valdi" / name
                          for name in ast.literal_eval(inventory)]
        addon_objects = [output / f"addon-{i}.o" for i in range(len(addon_sources))]
        def compile_addon(pair):
            source, obj = pair
            compatibility = ["-fno-sanitize=vla-bound"] if source.name in {
                "JavaScriptCoreContext.cpp", "JSCoreCustomClasses.cpp"} else []
            if source.name == "JavaScriptRuntime.cpp":
                compatibility += ["-Wno-deprecated-this-capture", "-Wno-unused-result"]
            run(["/usr/bin/clang++", *node_flags, *compatibility, "-Wno-vla-cxx-extension",
                 "-c", str(source), "-o", str(obj)])
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(compile_addon, zip(addon_sources, addon_objects)))
        addon = output / "appui-feedback.node"
        run(["/usr/bin/clang++", *node_flags, "-bundle", "-Wl,-undefined,dynamic_lookup", "-Wl,-dead_strip",
             "-Wl,-exported_symbol,_napi_register_module_v1", "-Wl,-exported_symbol,_node_api_module_get_api_version_v1",
             str(objects[0]), *map(str, objects[2:]), *map(str, addon_objects), *map(str, libraries),
             "-framework", "JavaScriptCore", "-o", str(addon)])
        asan = subprocess.check_output(
            ["/usr/bin/clang++", "-print-file-name=libclang_rt.asan_osx_dynamic.dylib"], text=True).strip()
        node_env = dict(environment, DYLD_INSERT_LIBRARIES=asan, APPUI_TEST_ADDON=str(addon))
        run([str(node), str(Path(__file__).with_name("AppUI-feedback.test.cjs"))], env=node_env)


if __name__ == "__main__":
    main()
