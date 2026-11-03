#!/usr/bin/env python3
"""Print a bounded source recipe by default. Compile ONLY with --execute --native-slot-held.

Every Valdi ABI-bearing object is rebuilt from the CURRENT source/header set.
No Context archive, restored .cxx objects, Hermes build, app build, HAP or device.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
TESTS = Path(__file__).parent
HOST = ROOT / "harmony/entry/src/main/cpp/host"
UPSTREAM = ROOT / ".tools/harmony/upstream"
NATIVE = ROOT / "harmony/business-build/.artifacts/host"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recipe(output):
    # Read existing compile DATABASE as include/source recipe, never its objects.
    database = NATIVE / "compile_commands.json"
    rows = [row for row in json.loads(database.read_text())
            if "CMakeFiles/real_valdi_host.dir/" in row["command"]]
    assert 0 < len(rows) <= 140, "Core subset footprint changed; inspect before enlarging"
    reference = next(row for row in rows if row["file"].endswith("/Context.cpp"))
    raw = shlex.split(reference["command"])
    flags, index = [], 1
    while index < len(raw):
        token = raw[index]
        if token == "-isystem":
            flags.extend(raw[index:index + 2])
            index += 2
            continue
        if token.startswith(("-I", "-D")) and token != "-DNDEBUG":
            flags.append(token)
        index += 1
    flags += [
        "-I" + str(ROOT / "valdi/native/generated"), "-I" + str(HOST), "-I" + str(output),
        "-std=c++20", "-O1", "-g", "-UNDEBUG", "-fsanitize=address,undefined",
        "-fno-omit-frame-pointer", "-Wno-missing-template-arg-list-after-template-kw",
        "-Wno-deprecated-declarations", "-Wno-deprecated-literal-operator",
        "-Wno-unused-result", "-Wno-vla-cxx-extension", "-Wno-deprecated-this-capture",
    ]
    # Reuse the CURRENT list, not that driver's objects, flags or execution
    # function (which uses parallel compiles). This recipe is strictly serial.
    inventory_file = HOST.parent / "platform/tests/engine_boundary.py"
    tree = ast.parse(inventory_file.read_text())
    names = next(node.value for node in ast.walk(tree)
                 if isinstance(node, ast.Assign) and any(
                     isinstance(target, ast.Name) and target.id == "names" for target in node.targets))
    adapter = [UPSTREAM / "valdi/src/valdi" / name for name in ast.literal_eval(names)]
    adapter += [UPSTREAM / "valdi/src/valdi/runtime" / name for name in (
        "Utils/DisposableGroup.cpp", "Utils/BridgeLogger.cpp", "Context/ContextEntry.cpp",
        "Context/AttributionResolver.cpp", "Resources/ResourceManager.cpp",
        "JavaScript/JavaScriptContextEntryPoint.cpp",
    )]
    sources = list(dict.fromkeys([Path(row["file"]) for row in rows] + adapter + [
        ROOT / "valdi/native/generated/valdi_modules/app_pages/app_pages.cpp",
        ROOT / ".tools/harmony/runtime-inputs/external/boringssl/crypto/base64/base64.cc",
        TESTS / "sheet-caller-native.cpp",
    ]))
    assert len(sources) <= 180, "Bounded source footprint exceeded; do not silently build full runtime"
    for source in sources:
        if not source.is_file():
            raise FileNotFoundError(source)
    libraries = [NATIVE / "deps/fmt/libfmt.a", NATIVE / "deps/jsoncpp/src/lib_json/libjsoncpp.a"]
    for library in libraries:
        if not library.is_file():
            raise FileNotFoundError("Non-Valdi dependency archive missing: " + str(library))
    commands, objects = [], []
    for index, source in enumerate(sources):
        obj, deps = output / f"fresh-{index}.o", output / f"fresh-{index}.d"
        objects.append(obj)
        # Upstream adapters use Clang's zero-length VLA extension for zero-arg
        # JS calls. Disable only this known extension check, retaining ASan and
        # all other UBSan checks; no upstream implementation is substituted.
        extra = ["-fno-sanitize=vla-bound"] if source.name in {
            "JavaScriptCoreContext.cpp", "JSCoreCustomClasses.cpp",
            "ValueFunctionWithJSValue.cpp"} else []
        commands.append(["/usr/bin/clang++", *flags, *extra, "-MMD", "-MF", str(deps),
                         "-c", str(source), "-o", str(obj)])
    binary = output / "sheet-caller"
    commands.append(["/usr/bin/clang++", *flags, "-Wl,-dead_strip", *map(str, objects),
                     *map(str, libraries), "-framework", "JavaScriptCore",
                     "-framework", "CoreFoundation", "-framework", "Security", "-o", str(binary)])
    return {
        "sourceCount": len(sources), "sources": list(map(str, sources)),
        "recipeInputs": [str(database), str(inventory_file)], "commands": commands,
        "libraries": list(map(str, libraries)), "maxJobs": 1,
        "fullRuntimeInitialized": False, "productionJavaScriptRuntimeScheduler": False,
        "realDedicatedValdiDispatchQueue": True, "engine": "official macOS Valdi JSC adapter",
        "HermesExecuted": False, "oldContextArchiveLinked": False,
        "treeRuntimeAndUIAreExplicitCollaborators": True, "HAP": False, "device": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--native-slot-held", action="store_true")
    parser.add_argument("--support-from", type=Path,
                        help="Reuse only this fixture's freshly compiled support objects after exact recipe/dependency verification")
    parser.add_argument("--negative", choices=("child-lineage", "retirement-gate", "global-null-caller"))
    args = parser.parse_args()
    output = args.output.resolve()
    plan = recipe(output)
    if not args.execute:
        print(json.dumps({"status": "SOURCE_RECIPE_NOT_EXECUTED", **plan}, indent=2))
        return
    if not args.native_slot_held:
        parser.error("--execute requires the parent's --native-slot-held assertion")
    output.mkdir(parents=True, exist_ok=False)
    (output / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    records, inputs, outputs = [], {}, {}
    fixture_inputs = [path for path in TESTS.glob("sheet-caller*") if path.is_file()]
    for path in fixture_inputs + [Path(path) for path in plan["recipeInputs"] + plan["libraries"]]:
        inputs[str(path)] = digest(path)

    def save(status):
        (output / "receipt.json").write_text(json.dumps({
            **{key: value for key, value in plan.items() if key != "commands"},
            "status": status, "commands": records, "inputSHA256": inputs, "outputSHA256": outputs,
            "negativeControl": args.negative, "expectedBehaviorFailure": bool(args.negative),
        }, indent=2) + "\n")

    def run(command, name, expected_failure=False):
        # This is an audit, not a distributed lock. The parent owns serialization.
        if Path(command[0]).name in {"clang++", "clang", "ar", "ld"}:
            listing = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
            (output / (name + "-processes.log")).write_text(listing)
            conflicts = [line for line in listing.splitlines()
                         if Path(line.strip().split(maxsplit=1)[-1]).name in {
                             "clang", "clang++", "cc1", "cc1plus", "ninja", "make", "cmake", "hvigorw", "ld"}]
            if conflicts:
                raise RuntimeError("Native slot occupied: " + repr(conflicts))
        with (output / (name + ".log")).open("w") as log:
            completed = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                timeout=180, env={**os.environ, "ASAN_OPTIONS": "halt_on_error=1",
                                  "UBSAN_OPTIONS": "halt_on_error=1"})
        records.append({"command": command, "exit": completed.returncode, "log": name + ".log",
                        "expectedFailure": expected_failure})
        save("RUNNING")
        if (completed.returncode != 0) != expected_failure:
            raise RuntimeError(name + " failed; inspect " + str(output / (name + ".log")))

    try:
        # Extraction is SOURCE only; no Context or function-body rewrites.
        spec = importlib.util.spec_from_file_location("sheet_caller_extract", TESTS / "sheet-caller-extract.py")
        module = importlib.util.module_from_spec(spec)
        # Avoid creating __pycache__ in the shared repository.
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
        generated, extraction = module.extract()
        resolver, resolver_manifest = module.parent_resolution()
        resolver_include = output / "sheet-caller-parent-resolution.inc"
        resolver_include.write_text(resolver)
        extraction["parentResolution"] = resolver_manifest
        inputs[resolver_manifest["source"]] = resolver_manifest["sourceSHA256"]
        inputs[str(resolver_include)] = digest(resolver_include)
        trace = module.page_root_trace()
        inputs.update(trace["inputs"])
        trace_path = output / "page-root-source-trace.json"
        trace_path.write_text(json.dumps(trace, indent=2) + "\n")
        outputs[str(trace_path)] = digest(trace_path)
        if args.negative:
            before, after = {
                "child-lineage": ("current = current->getParent();", "current = nullptr;"),
                "retirement-gate": (
                    "context->isDestroyed() || _retiringContexts.count(context.get())",
                    "context->isDestroyed()"),
                "global-null-caller": (
                    "if (result->callerCaptured && std::any_of(result->callerLineage.begin(), result->callerLineage.end(),\n"
                    "                [&](const auto& caller) { return caller.get() == context.get(); }))",
                    "if (!result->callerCaptured || std::any_of(result->callerLineage.begin(), result->callerLineage.end(),\n"
                    "                [&](const auto& caller) { return caller.get() == context.get(); }))"),
            }[args.negative]
            assert generated.count(before) == 1
            generated = generated.replace(before, after)
            extraction["negativeControl"] = {"name": args.negative, "before": before, "after": after}
        include = output / "sheet-caller-production.inc"
        include.write_text(generated)
        (output / "extraction.json").write_text(json.dumps(extraction, indent=2) + "\n")
        inputs[extraction["source"]] = extraction["sourceSHA256"]
        inputs[str(include)] = digest(include)
        js = output / "sheet-caller.js"
        run(["node", str(TESTS / "sheet-caller-js-prepare.mjs"), str(js)], "js-prepare")
        outputs[str(js)] = digest(js)
        js_manifest = Path(str(js) + ".sources.json")
        outputs[str(js_manifest)] = digest(js_manifest)
        for name, sha in json.loads(js_manifest.read_text())["fileInputs"].items():
            assert digest(Path(name)) == sha
            inputs[name] = sha
        reused = {}
        if args.support_from:
            prior_dir = args.support_from.resolve()
            prior = json.loads((prior_dir / "receipt.json").read_text())
            prior_plan = json.loads((prior_dir / "plan.json").read_text())
            assert prior_plan["sources"] == plan["sources"]
            assert prior_plan["libraries"] == plan["libraries"]
            for index, source in enumerate(plan["sources"]):
                if source == str(TESTS / "sheet-caller-native.cpp"):
                    continue
                command = plan["commands"][index]
                expected = [part.replace(str(output), str(prior_dir)) for part in command]
                if expected != prior_plan["commands"][index]:
                    continue  # Changed flags require a fresh compilation.
                obj, deps = prior_dir / f"fresh-{index}.o", prior_dir / f"fresh-{index}.d"
                if str(obj) not in prior["outputSHA256"]:
                    # An interrupted serial run may have completed only a
                    # prefix. Reuse its recorded outputs, never an unrecorded
                    # object left by the interrupted compiler.
                    continue
                assert digest(obj) == prior["outputSHA256"][str(obj)], "Support object changed"
                if not deps.is_file():
                    origin = json.loads((prior_dir / "support-reuse.json").read_text())["objects"][str(obj)]["origin"]
                    deps = Path(origin).with_suffix(".d")
                for name in shlex.split(deps.read_text().replace("\\\n", "").split(": ", 1)[1]):
                    path = Path(name)
                    if not path.is_absolute():
                        path = ROOT / path
                    current = digest(path)
                    assert current == prior["inputSHA256"][str(path)], "Support input changed: " + str(path)
                    inputs[str(path)] = current
                # Copy immutable, verified objects into this attempt; no old
                # Context archive or unrelated build products are accepted.
                import shutil
                destination = output / obj.name
                shutil.copyfile(obj, destination)
                shutil.copyfile(deps, output / f"fresh-{index}.d")
                outputs[str(destination)] = digest(destination)
                reused[str(destination)] = {"origin": str(obj), "sha256": digest(obj)}
            (output / "support-reuse.json").write_text(json.dumps({
                "priorReceipt": str(prior_dir / "receipt.json"),
                "priorReceiptSHA256": digest(prior_dir / "receipt.json"), "objects": reused,
            }, indent=2) + "\n")
        # One compiler at a time. Reuse is restricted to this probe's fresh
        # support after every consumed dependency and compile flag is checked.
        for index, command in enumerate(plan["commands"]):
            if str(output / f"fresh-{index}.o") in reused:
                continue
            run(command, f"native-{index}")
            produced = Path(command[command.index("-o") + 1])
            outputs[str(produced)] = digest(produced)
            if "-MF" in command:
                deps = Path(command[command.index("-MF") + 1])
                for name in shlex.split(deps.read_text().replace("\\\n", "").split(": ", 1)[1]):
                    path = Path(name)
                    if not path.is_absolute():
                        path = ROOT / path
                    current = digest(path)
                    if str(path) in inputs and inputs[str(path)] != current:
                        raise RuntimeError("Consumed input changed during serial proof: " + str(path))
                    inputs[str(path)] = current
        # If a needed runtime symbol was omitted, the executable's strict link
        # fails. Never mask this with -undefined,dynamic_lookup or ABI stubs.
        run([str(output / "sheet-caller"), str(js)], "characterization", bool(args.negative))
        save("EXPECTED_BEHAVIOR_FAILURE" if args.negative else "PASS")
    except BaseException:
        save("FAILED_OR_INCOMPLETE")
        raise


if __name__ == "__main__":
    main()
