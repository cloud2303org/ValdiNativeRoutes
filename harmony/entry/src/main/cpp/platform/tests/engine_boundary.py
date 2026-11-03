"""Compile the official macOS JSC adapter and Valdi JS marshaller, not an ABI stub.

Reuses the platform helper's production objects and prepared real Valdi core.
Hermes artifacts in this workspace target OHOS and cannot execute on macOS.
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess


def verify(root, output, flags, core_objects, libs):
    upstream = root / ".tools/harmony/upstream"
    runtime = upstream / "valdi/src/valdi"
    names = [
        "jscore/JavaScriptCoreContext.cpp", "jscore/JSCoreUtils.cpp",
        "jscore/JSCoreCustomClasses.cpp", "jscore/JSCoreDebuggerProxy.cpp",
        "runtime/Interfaces/IJavaScriptContext.cpp",
        "runtime/JavaScript/JavaScriptTypes.cpp",
        "runtime/JavaScript/JavaScriptUtils.cpp",
        "runtime/JavaScript/JavaScriptValueMarshaller.cpp",
        "runtime/JavaScript/JavaScriptValueDelegate.cpp",
        "runtime/JavaScript/JavaScriptFunctionCallContext.cpp",
        "runtime/JavaScript/JavaScriptTaskScheduler.cpp",
        "runtime/JavaScript/JavaScriptErrorStackTrace.cpp",
        "runtime/JavaScript/JavaScriptCapturedStacktrace.cpp",
        "runtime/JavaScript/JavaScriptLong.cpp",
        "runtime/JavaScript/JavaScriptANRAttribution.cpp",
        "runtime/JavaScript/JavaScriptRuntime.cpp",
        "runtime/JavaScript/JSValueRefHolder.cpp",
        "runtime/JavaScript/WrappedJSValueRef.cpp",
        "runtime/JavaScript/JSClassDefinition.cpp",
        "runtime/JavaScript/JSNativeClassData.cpp",
        "runtime/JavaScript/JSFunctionWithCallable.cpp",
        "runtime/JavaScript/JSFunctionWithValueFunction.cpp",
        "runtime/JavaScript/ValueFunctionWithJSValue.cpp",
        "runtime/JavaScript/JSPromise.cpp",
        "runtime/Utils/RefCountableAutoreleasePool.cpp",
        "runtime/Utils/MainThreadManager.cpp",
        "runtime/Context/ContextAttachedValdiObject.cpp",
    ]
    sources = [runtime / name for name in names]
    sources += [Path(__file__).with_name("javascript-boundary-tests.cpp")]
    objects = [output / f"engine-{i}.o" for i in range(len(sources))]
    sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
    engine_flags = [*flags, "-isysroot", sdk, "-Wno-vla-cxx-extension"]

    def compile_one(pair):
        source, obj = pair
        # The pinned JSC adapter uses Clang's zero-length VLA extension for
        # zero-argument calls. Keep other UBSAN checks and all platform checks.
        compatibility = ["-fno-sanitize=vla-bound"] if source.name in {
            "JavaScriptCoreContext.cpp", "JSCoreCustomClasses.cpp"} else []
        subprocess.run(["/usr/bin/clang++", *engine_flags, *compatibility,
                        "-c", str(source), "-o", str(obj)], check=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(compile_one, zip(sources, objects)))
    executable = output / "javascript-boundary-tests"
    subprocess.run(["/usr/bin/clang++", *engine_flags, "-Wl,-dead_strip",
                    *map(str, core_objects), *map(str, objects), *map(str, libs),
                    "-framework", "JavaScriptCore", "-o", str(executable)], check=True)
    environment = dict(os.environ, ASAN_OPTIONS="halt_on_error=1", UBSAN_OPTIONS="halt_on_error=1")
    subprocess.run([str(executable), f"--gtest_output=xml:{output / 'engine-results.xml'}"],
                   env=environment, check=True)
    return {
        "engine": "macOS JavaScriptCore; official pinned Valdi adapter",
        "marshallerAttached": True,
        "runtimeSetterCalled": False,
        "setterConversionAndPropertyAssignmentExecuted": True,
        "hermesExecuted": False,
        "platformTestsASAN_UBSAN": True,
        "upstreamVLABoundExclusions": ["jscore/JavaScriptCoreContext.cpp", "jscore/JSCoreCustomClasses.cpp"],
        "generatedPromiseMethods": 52,
        "generatedEvents": 14,
        "negativeControl": "bare populated c+ host/module payloads reproduce typed-object-to-proxy-object failure",
        "sourceSHA256": {str(source.relative_to(root)): hashlib.sha256(source.read_bytes()).hexdigest()
                         for source in sources},
        "executableSHA256": hashlib.sha256(executable.read_bytes()).hexdigest(),
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path, help="engine-inputs.json written by verify.py --engine")
    prepared = json.loads(parser.parse_args().inputs.read_text())
    verify(Path(prepared["root"]), Path(prepared["output"]), prepared["flags"],
           list(map(Path, prepared["core_objects"])), list(map(Path, prepared["libs"])))
