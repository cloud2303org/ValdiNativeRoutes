#!/usr/bin/env python3
"""Sanitize real Refresh/hierarchy bodies with installed SDK boundary types."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile


def production(backend):
    extraction = runpy.run_path(str(backend / "tests/verify-mount-reentry.py"))
    function = extraction["function"]
    manager = (backend / "ArkUIViewManager.cpp").read_text()
    node = manager[manager.index("struct Node :"):manager.index("static std::shared_ptr<Node> unwrap")]
    declaration = function(manager, "struct NativeRefresh :") + ";\n"
    bodies = ["namespace Valdi::Harmony::detail {\n"]
    for signature in ("void set(ArkUI_NodeHandle", "void integer(ArkUI_NodeHandle", "bool imageCallbacksActive() const"):
        body = function(node, signature)
        prefix = "bool " if signature.startswith("bool") else "void "
        bodies.append(body.replace(prefix, prefix + "Node::", 1) + "\n")
    bodies.append(function(manager, "static int32_t nativeScrollNestedMode(") + "\n")
    bodies.append(function((backend / "SheetInteractionMount.inc").read_text(), "static std::shared_ptr<Node> interactionParent(") + "\n")
    bodies.append(function((backend / "SheetInteractionInput.inc").read_text(), "static bool inputEnabled(") + "\n")
    refresh = (backend / "NativeRefresh.inc").read_text()
    bodies.append(refresh[:refresh.index("static void bindRefreshAttributes(")])
    transaction = manager[manager.index("class Transaction final"):manager.index("} // namespace detail")]
    bodies.append(function(transaction, "std::shared_ptr<Node> node(").replace(
        "std::shared_ptr<Node> node(", "std::shared_ptr<Node> Transaction::node(", 1) + "\n")
    bodies.append(function(transaction, "void insertChildView(").replace(
        "void insertChildView(", "void Transaction::insertChildView(", 1).replace(" override", "") + "\n")
    bodies.append("}\n")
    bodies.append("namespace Valdi::Harmony {\n")
    bodies.append(function(manager, "void ArkUIViewManager::setSuspended(bool suspended)") + "\n}\n")
    return declaration, "".join(bodies)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk-includes", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    extraction = runpy.run_path(str(backend / "tests/verify-mount-reentry.py"))
    declaration, source = production(backend)
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    scenarios = ("controlled", "programmatic", "disabled", "shutdown", "snapshot", "transfer",
                 "capacity", "reentrant-capacity", "generation", "child-generation",
                 "child-dispose", "disposing-child-event", "reset-suspend", "vertical")
    results = []
    mutations = {
        "programmatic": ("        if (!notify) return;", "        (void)notify;"),
        "generation": ("self->retired || self->state.generation != generation",
                       "self->retired || (self->state.generation != generation && false)"),
        "capacity": ("if (otherChildren || !child.scroll || child.scroll->geometry.horizontal)",
                     "if ((otherChildren && false) || !child.scroll || child.scroll->geometry.horizontal)"),
        "reentrant-capacity": ("        validateRefreshChild(*owner, *child, owner->children.size());",
                               "        // Negative control: omitted post-detach capacity check."),
        "disposing-child-event": ("!owner->children.front()->disposing && owner->children.front()->handle &&",
                                  "owner->children.front()->handle &&"),
    }
    with tempfile.TemporaryDirectory(prefix="valdi-refresh-sdk-") as temporary:
        include = Path(temporary)
        for name in ("arkui", "info", "ace", "napi", "native_drawing", "multimedia"):
            target = options.sdk_includes / name
            if target.exists():
                (include / name).symlink_to(target, target_is_directory=True)
        for mutation in ("fixed", *mutations):
            folder = output / mutation
            folder.mkdir(exist_ok=True)
            text = source
            if mutation != "fixed":
                old, new = mutations[mutation]
                if text.count(old) != 1:
                    raise RuntimeError("Negative-control source guard changed: " + mutation)
                text = text.replace(old, new)
            (folder / "mount-production.inc").write_text(extraction["production"](backend))
            (folder / "refresh-declaration.inc").write_text(declaration)
            (folder / "refresh-production.inc").write_text(text)
            executable = folder / "refresh-native"
            subprocess.run([
                shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
                "-Wno-ignored-attributes", "-Wno-unknown-attributes",
                "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                "-I" + str(include), "-I" + str(folder),
                str(backend / "tests/refresh-native.cpp"), "-o", str(executable),
            ], check=True)
            cases = scenarios if mutation == "fixed" else (mutation,)
            for scenario in cases:
                result = subprocess.run([str(executable), scenario], text=True, capture_output=True)
                expected = 0 if mutation == "fixed" else 75
                if result.returncode != expected or (expected and "REGRESSION:" not in result.stderr):
                    raise RuntimeError(f"{mutation}/{scenario}: {result.returncode}\n" + result.stdout + result.stderr)
                print(result.stdout.strip() if expected == 0 else
                      "Refresh negative control reproduced: " + mutation, flush=True)
                results.append({"mutation": mutation, "scenario": scenario, "exitStatus": result.returncode,
                                "stdout": result.stdout.strip(), "stderr": result.stderr.strip(),
                                "extractedProductionSHA256": hashlib.sha256(text.encode()).hexdigest()})
    (output / "verification.json").write_text(json.dumps({
        "sanitizers": ["address", "undefined"], "sdkIncludes": str(options.sdk_includes.resolve()),
        "executionBoundary": "Production Refresh, insertion, detach, dispose, shutdown, snapshot cancellation; adapted Valdi values, inactive Scroll and native platform boundary",
        "cases": results,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
