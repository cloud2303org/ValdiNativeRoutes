#!/usr/bin/env python3
"""Build a small fresh real-Valdi support archive and execute independent gesture.cpp.

The SDK boundary is recorded, not emulated recognition. No runtime/context
archive, HAP, device, or hand-written Valdi ABI participates.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shlex
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
APP = HERE.parent
ROOT = APP.parents[5]
FORK = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102")
SDK = Path("/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native")
NAMES = set("""Attribution.cpp ComponentPath.cpp ContextId.cpp ContextBase.cpp Shared.cpp StaticString.cpp StringBox.cpp
StringCache.cpp InternedStringImpl.cpp Value.cpp ValueArray.cpp ValueMap.cpp ValueMapIterator.cpp ValueTypedArray.cpp
ValueTypedObject.cpp ValueTypedProxyObject.cpp ValueFunction.cpp ValueUtils.cpp ValueArrayBuilder.cpp ValdiObject.cpp
JSONReader.cpp JSONWriter.cpp TextParser.cpp ByteBuffer.cpp Bytes.cpp Error.cpp Exception.cpp ExceptionTracker.cpp
Result.cpp Mutex.cpp TrackedLock.cpp Thread.cpp ThreadBase.cpp ThreadAccessChecker.cpp Trace.cpp Promise.cpp
ResolvablePromise.cpp SimpleAtomicCancelable.cpp LazyValueConvertible.cpp ValueFunctionWithCallable.cpp
ValueFunctionWithMethod.cpp ReferenceInfo.cpp BridgeObject.cpp SmallVector.cpp TextAttributeValue.cpp Assert.cpp
AssertInternals.cpp Logger.cpp Base64Utils.cpp utils_oss.cpp DataRef.cpp DataRef_c_translator.cpp
DataView_c_translator.cpp djinni_c.cpp djinni_c_types.cpp Runtime.cpp Duration.cpp TimePoint.cpp UptimeClock.cpp
BoottimeClock.cpp UTF16Utils.cpp ValueSchema.cpp Frame.cpp TouchEvents.cpp""".split())


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--backend", type=Path, default=APP)
    p.add_argument("--backend-kind", choices=("app", "fork"), help="Explicit target kind for an immutable baseline copy")
    p.add_argument("--manager-source", type=Path, help="Actual manager source supplying the retention port; defaults to backend")
    p.add_argument("--recipe", type=Path, required=True, help="Source/flag recipe only; existing archives never used")
    p.add_argument("--support-from", type=Path)
    p.add_argument("--test", default="all")
    p.add_argument("--expect-regression", action="store_true")
    p.add_argument("--negative-control", choices=("lifted-pointer", "frozen-handler", "stale-accept",
                                                 "retired-identity"))
    p.add_argument("--fixture", type=Path, default=HERE / "gesture-native.cpp",
                   help="Exact same fixture for frozen-source RED and current-source GREEN")
    a = p.parse_args()
    a.output.mkdir(parents=True, exist_ok=True)
    manager_source = a.manager_source or a.backend / "ArkUIViewManager.cpp"
    module_inputs = [a.backend / name for name in
                     ("gesture.cpp", "gesture.hpp", "gesture_coordinator.cpp", "gesture_coordinator.hpp",
                      "gesture_admission.cpp", "gesture_admission.hpp")
                     if (a.backend / name).is_file()]
    start_inputs = {str(path): sha(path) for path in
                    (*module_inputs, a.fixture, manager_source)}
    scan = runpy.run_path(str(HERE / "verify-scroll-dismiss-regressions.py"))["scan_native"]
    old = str(ROOT / ".tools/harmony/upstream")
    raw = json.loads(a.recipe.read_text())
    flags = []
    # Recipe contains real sources and include roots only. Flags after NDEBUG
    # belonged to an unrelated probe and are deliberately rebuilt here.
    for flag in raw["flags"][:raw["flags"].index("-DNDEBUG")]:
        flags.append(flag.replace(old, str(FORK)))
    sources = [Path(s.replace(old, str(FORK))) for s in raw["sources"] if Path(s).name in NAMES]
    for name, relative in (("Frame.cpp", "valdi_core/src/valdi_core/cpp/Views/Frame.cpp"),
                           ("TouchEvents.cpp", "valdi_core/src/valdi_core/cpp/Events/TouchEvents.cpp")):
        if not any(s.name == name for s in sources):
            sources.append(FORK / relative)
    sources.append(ROOT / ".tools/harmony/runtime-inputs/external/fmt/src/format.cc")
    sdk_include = a.output / "sdk-include"
    sdk_include.mkdir(exist_ok=True)
    extract = runpy.run_path(str(HERE / "verify-mount-reentry.py"))["function"]
    retain_port = extract(manager_source.read_text(), "std::shared_ptr<GestureNode> retainGestureNode()")
    (sdk_include / "gesture-retain-port.hpp").write_text(retain_port + "\n")
    input_port = extract(manager_source.read_text(), "void Node::inputEvent(")
    (sdk_include / "gesture-input-port.hpp").write_text(
        "static void productionInput(ArkUI_NodeEvent* event) noexcept " +
        input_port[input_port.index("{"):].replace("static_cast<Node*>", "static_cast<PlainNode*>") + "\n")
    for name in ("arkui", "info", "ace", "napi", "native_drawing", "multimedia"):
        target = sdk_include / name
        if not target.exists():
            target.symlink_to(SDK / "sysroot/usr/include" / name, target_is_directory=True)
    flags += ["-I" + str(sdk_include), "-I" + str(a.backend.resolve()),
              "-std=c++20", "-O1", "-g", "-UNDEBUG", "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
              "-Wno-missing-template-arg-list-after-template-kw", "-Wno-deprecated-declarations",
              "-Wno-deprecated-literal-operator", "-Wno-unused-result", "-Wno-vla-cxx-extension",
              "-Wno-deprecated-this-capture", "-Wno-ignored-attributes", "-Wno-unknown-attributes"]
    assert not any(".tools/harmony/upstream" in str(s) for s in sources + flags)
    commands = []
    inputs = {}

    def run(command, label):
        before = scan()
        log = a.output / (label + ".log")
        with log.open("w") as stream:
            result = subprocess.run(list(map(str, command)), stdout=stream, stderr=subprocess.STDOUT)
        commands.append({"command": list(map(str, command)), "exitStatus": result.returncode,
                         "nativeScanBefore": before, "log": str(log)})
        (a.output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
        if result.returncode:
            raise RuntimeError(label + "\n" + log.read_text()[-14000:])

    archive = a.output / "libgesture-values-current.a"
    reused_sources = set()
    objects = []
    if a.support_from:
        receipt = json.loads((a.support_from / "support-receipt.json").read_text())
        for path, digest in receipt["inputSHA256"].items():
            assert sha(path) == digest, "Fresh support input drift: " + path
        source_archive = a.support_from / "libgesture-values-current.a"
        assert sha(source_archive) == receipt["archiveSHA256"]
        shutil.copy2(source_archive, archive)
        reused_sources = set(receipt["sources"])
        inputs.update(receipt["inputSHA256"])
    for i, source in enumerate(sources):
        if str(source) not in reused_sources:
            obj = a.output / ("value-" + str(i) + ".o")
            dep = obj.with_suffix(".d")
            run(["/usr/bin/clang++", *flags, "-MMD", "-MF", dep, "-c", source, "-o", obj], "value-" + str(i))
            for file in shlex.split(dep.read_text().replace("\\\n", "").split(": ", 1)[1]):
                if Path(file).is_file():
                    inputs[file] = sha(file)
            objects.append(obj)
    if objects:
        run(["/usr/bin/ar", "rcs", archive, *objects], "archive")
    (a.output / "support-receipt.json").write_text(json.dumps({
        "inputSHA256": inputs, "archiveSHA256": sha(archive), "sources": list(map(str, sources)),
    }, indent=2) + "\n")
    # CMake deduplicates standalone -isystem tokens; join prefixes and paths.
    compact = []
    i = 0
    while i < len(flags):
        if flags[i] in ("-I", "-isystem", "-idirafter"):
            compact.append(flags[i] + flags[i + 1]); i += 2
        else:
            compact.append(flags[i]); i += 1
    cmake_flags = a.output / "flags.cmake"
    cmake_flags.write_text("set(GESTURE_COMPILE_FLAGS\n" +
                           "\n".join(" [==[" + f + "]==]" for f in compact) + "\n)\n")
    build = a.output / "build"
    module_source = a.backend.resolve() / "gesture.cpp"
    coordinator_source = a.backend.resolve() / "gesture_coordinator.cpp"
    admission_source = a.backend.resolve() / "gesture_admission.cpp"
    if a.negative_control:
        assert not coordinator_source.exists(), "Use preserved historical verifier for coordinator mutants"
        text = module_source.read_text()
        if a.negative_control == "lifted-pointer":
            old = " || i == lifted"
            assert text.count(old) == 1
            text = text.replace(old, "")
        elif a.negative_control == "frozen-handler":
            old = "    GestureSequence sequence;"
            assert text.count(old) == 1
            text = text.replace(old, "    Ref<ValueFunction> frozen;\n" + old)
            old = "        slot.kind = kind;"
            assert text.count(old) == 1
            text = text.replace(old, old + "\n        if (kind != GestureKind::RootPan) slot.frozen = node.lock()->gestureConfig[size_t(kind)].action;")
            old = "auto callback = value->gestureConfig[static_cast<size_t>(raw->kind)].action;"
            assert text.count(old) == 1
            text = text.replace(old, "auto callback = raw->frozen;")
        elif a.negative_control == "retired-identity":
            old = "auto* native = std::exchange(slot->native, nullptr);"
            assert text.count(old) == 1
            text = text.replace(old, "auto* native = slot->native;")
            old = "if (pointer) pointer->native = nullptr;"
            assert text.count(old) == 1
            text = text.replace(old, "(void)pointer; // negative control: keep freed native identity")
        else:
            start = text.index("        return admitted && self->current(*value)")
            end = text.index(";", start)
            text = text[:start] + "        return admitted" + text[end:]
            old = "if (revision != value->gestureAttributeRevision) admitted = false;"
            assert text.count(old) == 1
            text = text.replace(old, "// negative control: accept despite predicate reentry")
        module_source = a.output.resolve() / "negative-gesture.cpp"
        module_source.write_text(text)
    run(["cmake", "-S", HERE / "gesture-cmake", "-B", build, "-G", "Ninja",
         "-DCMAKE_CXX_COMPILER=/usr/bin/clang++", "-DGESTURE_FLAGS_FILE=" + str(cmake_flags.resolve()),
         "-DGESTURE_BACKEND=" + str(a.backend.resolve()),
         "-DGESTURE_FORK=" + ("OFF" if (a.backend_kind == "app" or
             (a.backend_kind is None and a.backend.resolve() == APP)) else "ON"),
         "-DGESTURE_MODULE_SOURCE=" + str(module_source),
         "-DGESTURE_COORDINATOR_SOURCE=" + str(coordinator_source),
         "-DGESTURE_ADMISSION_SOURCE=" + str(admission_source),
         "-DGESTURE_HOST_FIXTURE=" + str(a.fixture.resolve()),
         "-DGESTURE_SUPPORT_ARCHIVE=" + str(archive)], "configure")
    run(["cmake", "--build", build, "--parallel", "1", "--target", "gesture_native"], "build")
    executable = build / "gesture_native"
    result = subprocess.run([str(executable), a.test], capture_output=True, text=True)
    (a.output / ("test-" + a.test + ".log")).write_text(result.stdout + result.stderr)
    (a.output / "receipt.json").write_text(json.dumps({
        "scope": "Independent production gesture.cpp, real current Valdi ABI/support, recording SDK/host boundary",
        "test": a.test, "exitStatus": result.returncode, "commands": commands,
        "fixtureSHA256": sha(a.fixture),
        "moduleSource": str(module_source), "moduleSHA256": sha(module_source),
        "coordinatorSource": str(coordinator_source) if coordinator_source.exists() else None,
        "coordinatorSHA256": sha(coordinator_source) if coordinator_source.exists() else None,
        "negativeControl": a.negative_control, "headerSHA256": sha(a.backend / "gesture.hpp"),
        "managerSource": str(manager_source), "managerSHA256": sha(manager_source),
        "productionRetainPort": retain_port,
        "archiveSHA256": sha(archive),
        "startInputsSHA256": start_inputs,
    }, indent=2) + "\n")
    for path, digest in start_inputs.items():
        assert sha(path) == digest, "Source changed during the native probe: " + path
    print(result.stdout + result.stderr)
    if a.expect_regression:
        assert result.returncode != 0 and "REGRESSION:" in result.stderr, "Expected behavior failure was not observed"
    else:
        raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
