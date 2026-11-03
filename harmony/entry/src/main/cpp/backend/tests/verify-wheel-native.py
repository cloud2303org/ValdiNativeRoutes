#!/usr/bin/env python3
"""Serial wheel host/SDK proof using production bodies and current fork headers.

No runtime rebuild, shared generated files, archive reuse, HAP or device.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shlex
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[7]
FORK = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102")
SDK = Path("/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--backend", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--negative-controls", action="store_true")
    parser.add_argument("--flow", type=Path, help="Actual compiler/Renderer Harmony attribute replay")
    parser.add_argument("--support-from", type=Path,
                        help="Only reuse THIS probe's freshly compiled, hash-verified current-source support")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    backend = args.backend.resolve()
    function = runpy.run_path(str(backend / "tests/verify-mount-reentry.py"))["function"]
    scan = runpy.run_path(str(backend / "tests/verify-scroll-dismiss-regressions.py"))["scan_native"]
    inputs, commands, artifacts = {}, [], []

    def run(command, label, expected=0):
        (output / (label + "-scan.json")).write_text(json.dumps(scan()))
        command = list(map(str, command))
        log = output / (label + ".log")
        print(label, flush=True)
        with log.open("w") as stream:
            result = subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
        commands.append({"command": command, "exit": result.returncode, "log": str(log)})
        (output / "commands.json").write_text(json.dumps(commands, indent=2))
        if expected == 0 and result.returncode != 0:
            raise RuntimeError(label + "\n" + log.read_text()[-14000:])
        if expected != 0 and (result.returncode == 0 or "REGRESSION:" not in log.read_text()):
            raise RuntimeError("Negative control not caught: " + label + "\n" + log.read_text()[-6000:])

    def compile(command, source, target, label):
        dependency = target.with_suffix(".d")
        run([*command, "-MMD", "-MF", dependency, "-c", source, "-o", target], label)
        for file in shlex.split(dependency.read_text().replace("\\\n", "").split(": ", 1)[1]):
            file = Path(file)
            if file.is_file():
                digest = sha(file)
                if str(file) in inputs:
                    assert inputs[str(file)] == digest, "Input drift: " + str(file)
                inputs[str(file)] = digest
        artifacts.append(target)

    try:
        include = output / "sdk-include"
        include.mkdir()
        for name in ("arkui", "info", "ace", "napi", "native_drawing", "multimedia"):
            if (SDK / "sysroot/usr/include" / name).exists():
                (include / name).symlink_to(SDK / "sysroot/usr/include" / name, target_is_directory=True)
        # Current fork sources/headers, from a recipe only. No archived Context
        # objects or headers from .tools/harmony/upstream enter this probe.
        prior = json.loads(Path("/tmp/valdi-appui-media-p2-20261103/native-green/receipt.json").read_text())
        rows = [c for c in prior["commands"] if "-c" in c and
                Path(c[c.index("-o") + 1]).name.startswith("core-")]
        flags = rows[0][1:rows[0].index("-c")]
        old = str(ROOT / ".tools/harmony/upstream")
        flags = [flag.replace(old, str(FORK)) for flag in flags if not flag.startswith("-I/private/tmp/valdi-appui-media")]
        flags += ["-I" + str(include), "-I" + str(backend), "-Wno-ignored-attributes", "-Wno-unknown-attributes"]
        # Bounded Value/JSON/callback support, not RuntimeManager, Context, JS
        # engines or UI runtime. Dead stripping keeps unrelated leaf imports out.
        names = {
            "Attribution.cpp", "ComponentPath.cpp", "ContextId.cpp", "ContextBase.cpp",
            "Shared.cpp", "StaticString.cpp", "StringBox.cpp", "StringCache.cpp", "InternedStringImpl.cpp",
            "Value.cpp", "ValueArray.cpp", "ValueMap.cpp", "ValueMapIterator.cpp", "ValueTypedArray.cpp",
            "ValueTypedObject.cpp", "ValueTypedProxyObject.cpp", "ValueFunction.cpp", "ValueUtils.cpp",
            "ValueArrayBuilder.cpp", "ValdiObject.cpp", "JSONReader.cpp", "JSONWriter.cpp", "TextParser.cpp",
            "ByteBuffer.cpp", "Bytes.cpp", "Error.cpp", "Exception.cpp", "ExceptionTracker.cpp", "Result.cpp",
            "Mutex.cpp", "TrackedLock.cpp", "Thread.cpp", "ThreadBase.cpp", "ThreadAccessChecker.cpp",
            "Trace.cpp", "Promise.cpp", "ResolvablePromise.cpp", "SimpleAtomicCancelable.cpp",
            "LazyValueConvertible.cpp", "ValueFunctionWithCallable.cpp", "ValueFunctionWithMethod.cpp",
            "ReferenceInfo.cpp", "BridgeObject.cpp", "SmallVector.cpp", "TextAttributeValue.cpp",
            "Assert.cpp", "AssertInternals.cpp", "Logger.cpp", "Base64Utils.cpp", "utils_oss.cpp",
            "DataRef.cpp", "DataRef_c_translator.cpp", "DataView_c_translator.cpp", "djinni_c.cpp",
            "djinni_c_types.cpp", "Runtime.cpp", "Duration.cpp", "TimePoint.cpp", "UptimeClock.cpp", "BoottimeClock.cpp",
            "UTF16Utils.cpp", "ValueSchema.cpp",
        }
        sources = [Path(c[c.index("-c") + 1].replace(old, str(FORK))) for c in rows
                   if Path(c[c.index("-c") + 1]).name in names]
        recipe = {"flags": flags, "sources": list(map(str, sources))}
        archive = output / "libwheel-values-current.a"
        if args.support_from:
            fresh = args.support_from.resolve()
            receipt = json.loads((fresh / "receipt.json").read_text())
            old_recipe = json.loads((fresh / "support-recipe.json").read_text())
            # Backend/include roots are per-run. All real data-source flags and
            # source paths, including the current fork, must otherwise match.
            normalize = lambda values: [v for v in values if "/sdk-include" not in v and v not in {
                "-I" + str(ROOT / "harmony/entry/src/main/cpp/backend"),
                "-I" + str(FORK / "valdi/harmony/arkui"),
            }]
            assert set(old_recipe["sources"]).issubset(recipe["sources"])
            assert normalize(recipe["flags"]) == normalize(old_recipe["flags"])
            for file, digest in receipt.get("supportInputSHA256", receipt["inputSHA256"]).items():
                if "supportInputSHA256" in receipt or (file.startswith(str(FORK)) and "/arkui/" not in file):
                    assert sha(file) == digest, "Support input drift: " + file
                    inputs[file] = digest
            source_archive = fresh / archive.name
            assert sha(source_archive) == receipt["outputSHA256"][str(source_archive)]
            shutil.copy2(source_archive, archive)
            extra = []
            for i, source in enumerate(sources):
                if str(source) in old_recipe["sources"]:
                    continue
                target = output / f"value-extra-{i}.o"
                compile(["/usr/bin/clang++", *flags], source, target, f"value-extra-{i}")
                extra.append(target)
            if extra:
                run(["/usr/bin/ar", "rcs", archive, *extra], "extend-fresh-values")
        else:
            objects = []
            for i, source in enumerate(sources):
                target = output / f"value-{i}.o"
                compile(["/usr/bin/clang++", *flags], source, target, f"value-{i}")
                objects.append(target)
            run(["/usr/bin/ar", "rcs", archive, *objects], "archive-fresh-values")
        artifacts.append(archive)
        support_inputs = dict(inputs)
        (output / "support-recipe.json").write_text(json.dumps(recipe, indent=2))
        manager = (backend / "ArkUIViewManager.cpp").read_text()
        node = manager[manager.index("struct Node :"):manager.index("static std::shared_ptr<Node> unwrap")]
        declaration = function((backend / "NativeWheel.hpp").read_text(), "struct NativeWheel :") + ";\n"
        class_selection = (backend / "NativeWheel.hpp").read_text().split("static bool wheelClass(", 1)[1]
        class_selection = "static bool wheelClass(" + class_selection
        bodies = ""
        for signature in ("void live() const", "void set(ArkUI_NodeHandle", "void number(ArkUI_NodeHandle",
                          "void integer(ArkUI_NodeHandle", "void string(ArkUI_NodeHandle"):
            bodies += function(node, signature).replace("void ", "void Node::", 1) + "\n"
        bodies += function((backend / "SheetInteractionMount.inc").read_text(), "static std::shared_ptr<Node> interactionParent(") + "\n"
        bodies += function((backend / "SheetInteractionInput.inc").read_text(), "static bool inputEnabled(") + "\n"
        bodies += function(manager, "static int32_t pixels(") + "\n"
        bodies += function(manager, "struct Constraint {") + ";\n"
        production = (backend / "NativeWheel.inc").read_text().split("static void bindWheelAttributes(")[0]
        arbitration = (backend / "WheelArbitration.inc").read_text()
        defaults = FORK / "valdi/src/valdi/runtime/Attributes/DefaultAttributes.cpp"
        view_node = FORK / "valdi/src/valdi/runtime/Context/ViewNode.cpp"
        default_source = defaults.read_text()
        begin = default_source.index('    binder.bind(\n        "harmonyClass",')
        end = default_source.index("\n\n    binder.bind(", begin)
        binding = default_source[begin:end]
        platform = function(view_node.read_text(), "void ViewNode::setViewClassNameForPlatform(")
        inputs[str(defaults)], inputs[str(view_node)] = sha(defaults), sha(view_node)
        if args.flow:
            inputs[str(args.flow.resolve())] = sha(args.flow)
        mutations = {
            "programmatic": ("        if (!control->interaction.armed) return;",
                             "        control->interaction.armed = true;"),
            "echo-before-callback": ("    if (deliver) next.echo.pending.push_back(value);", "    // negative control: missing pending echo"),
            "stale-control": ("return !retired && owner && owner->generation == generation && owner->active();",
                              "return owner && owner->active();"),
            "admission": ("if (candidateId == parentId && wheelOwnsTouch(*owner, info))",
                          "if (candidateId == parentId && wheelOwnsTouch(*owner, info) && false)"),
            "active-sdk-frame": ("        deferDispose();", "        dispose();"),
            "calendar-clamp": ("calendar[2] = std::clamp(calendar[2], 1, wheelMonthDays(calendar[0], calendar[1]));",
                               "calendar[2] = calendar[2];"),
            "tree-suffix": ("                path.resize(column);", "                // negative control: retained old suffix"),
            "tentative-is-settled": ("            control->interaction.tentative = index;",
                                     "            control->interaction.tentative = index; self->settled(control, index);"),
            "callback-reset": ('if (name == "onChange") node.wheel->onChange = nullptr;',
                               'if (name == "onChange") (void)node;'),
            "config-reset": ('    else if (name == "config") node.wheel->replace(WheelState{});',
                             '    else if (name == "config") (void)node;'),
            "structural-echo": ("        if (structural) echo.clear();", "        // negative control: old echo scope retained"),
            "deferred-platform": ("value.toStringBox(), PlatformTypeHarmony",
                                   "value.toStringBox(), PlatformTypeIOS"),
        } if args.negative_controls else {}
        if not args.flow:
            mutations.pop("deferred-platform", None)
        for label in ["current", *mutations]:
            folder = output / label
            folder.mkdir()
            native, admit = production, arbitration
            model = (backend / "WheelState.hpp").read_text()
            default_binding = binding
            if label != "current":
                before, after = mutations[label]
                if before in native:
                    assert native.count(before) == 1
                    native = native.replace(before, after)
                elif before in admit:
                    assert admit.count(before) == 1
                    admit = admit.replace(before, after)
                elif before in model:
                    assert model.count(before) == 1
                    model = model.replace(before, after)
                else:
                    assert default_binding.count(before) == 1
                    default_binding = default_binding.replace(before, after)
            for name, content in {
                "wheel-declaration.inc": declaration, "wheel-node-production.inc": bodies,
                "wheel-production.inc": native, "wheel-arbitration-production.inc": admit,
                "WheelState.hpp": model,
                "wheel-deferred-binding.inc": default_binding, "wheel-deferred-platform.inc": platform,
                "wheel-class-selection.inc": class_selection,
            }.items():
                (folder / name).write_text(content)
            source = backend / "tests/wheel-native.cpp"
            obj = folder / "wheel-native.o"
            compile(["/usr/bin/clang++", "-I" + str(folder), *flags], source, obj, label + "-compile")
            native_deps = ROOT / "harmony/business-build/.artifacts/host/deps"
            binary = folder / "wheel-native"
            run(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", "-Wl,-undefined,error", obj, archive,
                 native_deps / "fmt/libfmt.a", native_deps / "jsoncpp/src/lib_json/libjsoncpp.a",
                 "-o", binary], label + "-link")
            artifacts.append(binary)
            run([binary, *([args.flow.resolve()] if args.flow else [])],
                label + "-run", expected=0 if label == "current" else 75)
    finally:
        for file in backend.glob("*"):
            if file.is_file():
                inputs[str(file)] = sha(file)
        (output / "receipt.json").write_text(json.dumps({
            "commands": commands, "inputSHA256": inputs,
            "supportInputSHA256": locals().get("support_inputs", {}),
            "outputSHA256": {str(file): sha(file) for file in artifacts if file.exists()},
            "testSourceSHA256": sha(backend / "tests/wheel-native.cpp"),
            "oldContextArchives": False, "HAP": False, "device": False,
            "boundary": "Actual wheel/Node/input/arbitration production bodies, real SDK declarations and current Valdi Value/JSON/callback support; explicit SDK/UI boundary doubles",
        }, indent=2))


if __name__ == "__main__":
    main()
