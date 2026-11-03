#!/usr/bin/env python3
"""Execute verbatim Scroll admission/attributes, editor blur and Node writes.

Pass --backend to run the same tests against preserved original production
sources. The native boundary records SDK26 calls, including its documented
page-wide clear-focus semantics; Valdi callback/lock types are adapted.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile


def production(backend):
    function = runpy.run_path(str(Path(__file__).with_name("verify-mount-reentry.py")))["function"]
    manager = (backend / "ArkUIViewManager.cpp").read_text()
    scroll = (backend / "NativeScroll.inc").read_text()
    input_source = (backend / "NativeTextInput.inc").read_text()
    node = manager[manager.index("struct Node :"):manager.index("static std::shared_ptr<Node> unwrap")]
    declarations = function(manager, "struct NativeScroll :") + ";\n"
    declarations += function(manager, "struct NativeTextInput :") + ";\n"
    bodies = ["namespace Valdi::Harmony::detail {\n"]
    for signature in ("void live() const", "void set(ArkUI_NodeHandle", "void integer(ArkUI_NodeHandle"):
        bodies.append(function(node, signature).replace("void ", "void Node::", 1) + "\n")
    bodies.append(function((backend / "SheetInteractionMount.inc").read_text(), "static std::shared_ptr<Node> interactionParent(") + "\n")
    bodies.append(function((backend / "SheetInteractionInput.inc").read_text(), "static bool inputEnabled(") + "\n")
    for signature in ("static void validateNativeScrollAxis(", "static int32_t nativeScrollNestedMode("):
        bodies.append(function(manager, signature) + "\n")
    if "static std::shared_ptr<Node> scrollInputRoot(" in scroll:
        for signature in ("static std::shared_ptr<Node> scrollInputRoot(",
                          "static bool scrollDragCurrent(", "static void dismissScrollKeyboard("):
            bodies.append(function(scroll, signature) + "\n")
    for signature in ("NativeTextInput::NativeTextInput(", "bool NativeTextInput::valid() const",
                      "void NativeTextInput::activate()", "void NativeTextInput::focus(",
                      "void NativeTextInput::requestPendingFocus()"):
        bodies.append(function(input_source, signature) + "\n")
    for signature in (
        "NativeScroll::NativeScroll(", "void NativeScroll::post(", "void NativeScroll::properties(",
        "void NativeScroll::writeOffset(", "void NativeScroll::sample(",
        "void NativeScroll::enqueue(NoticeType type)",
        "void NativeScroll::enqueue(std::initializer_list<NoticeType> types)",
        "void NativeScroll::queueDragTarget(", "void NativeScroll::drain(",
        "void NativeScroll::cancel(", "void NativeScroll::event(",
        "static bool scrollAttribute(", "static bool resetScrollAttribute(",
        "static void bindScrollAttributes(",
    ):
        bodies.append(function(scroll, signature) + "\n")
    bodies.append("}\n")
    field = "std::function<bool()> scrollBlurCurrent;\n" if "std::function<bool()> scrollBlurCurrent;" in node else ""
    return {"scroll-input-declarations.inc": declarations,
            "scroll-node-fields.inc": field, "scroll-dismiss-production.inc": "".join(bodies)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--sdk-includes", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--original-red", action="store_true")
    parser.add_argument("--focus-operation-red", action="store_true",
                        help="Run all cases against the prior frozen implementation; expect only the P2 repros to fail")
    parser.add_argument("--negative-controls", action="store_true")
    options = parser.parse_args()
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    files = production(options.backend.resolve())
    cases = (
        "binding", "default", "false", "reset", "drag", "area", "sibling", "absent",
        "other-root", "other-backend", "stale-focus", "inactive-input", "disabled-input",
        "retired-input", "detached-input", "duplicate", "next-drag", "scroll-start",
        "did-scroll", "pending", "suppressed", "disabled", "suspended", "stopped",
        "shutting-down", "retired", "detached", "touch-disabled", "ancestor-disabled",
        "reenter-retire", "reenter-dispose", "reenter-reparent-scroll", "reenter-reparent-input",
        "reenter-unmount", "reenter-replace-drag", "reenter-disable", "reenter-suspend",
        "reenter-shutdown", "reenter-input-retire", "reenter-input-rebind",
        "reenter-refocus", "reenter-replacement", "reenter-throw", "raw-reentry",
        "reenter-release",
        "independent-blur-disabled", "independent-blur-removed", "independent-blur-active",
        "independent-blur-rebound", "replacement-focus-disabled", "replacement-focus-removed",
    )
    focus_operation_red = ("independent-blur-disabled", "independent-blur-removed", "independent-blur-rebound")
    # Mutate only extracted production bodies; each control must be caught by
    # the same behavioral expectations as current/original source.
    controls = {
        "post-blur": ("\n            if (!scrollDragCurrent(self, owner, root, token)) return;\n",
                      "\n", ("reenter-retire",)),
        "page-clear": ("            scrollBlurCurrent && !scrollBlurCurrent()) return;",
                       "            scrollBlurCurrent && false) return;", ("reenter-replacement",)),
        "reset": ('key == "dismissKeyboardOnDrag") {', 'key == "__removed__") {', ("reset",)),
        "epoch": ("scroll->sequence.current(token) &&", "(static_cast<void>(token), true) &&", ("reenter-replace-drag",)),
        "raw-reentry": ("                    if (!scrollDragCurrent(self, owner, root, token)) return;\n",
                        "", ("raw-reentry",)),
        "focus-operation": ("        if (editorNode->input != editor || editor->focusGeneration != focusTicket + 1) return true;\n",
                            "", focus_operation_red),
    }
    results = []
    with tempfile.TemporaryDirectory(prefix="valdi-dismiss-sdk-") as temporary:
        include = Path(temporary)
        for name in ("arkui", "info", "ace", "napi", "native_drawing", "multimedia"):
            target = options.sdk_includes / name
            if target.exists():
                (include / name).symlink_to(target, target_is_directory=True)
        for name in ("node_api.h", "node_api_types.h", "js_native_api.h", "js_native_api_types.h"):
            (include / name).symlink_to(options.sdk_includes / name)
        variants = ("current", *controls) if options.negative_controls else ("current",)
        for variant in variants:
            source = dict(files)
            if variant != "current":
                old, new, _ = controls[variant]
                text = source["scroll-dismiss-production.inc"]
                if text.count(old) != 1:
                    raise RuntimeError("Negative-control guard changed: " + variant + ": " + str(text.count(old)))
                source["scroll-dismiss-production.inc"] = text.replace(old, new)
            folder = output / variant
            folder.mkdir(exist_ok=True)
            for name, text in source.items():
                (folder / name).write_text(text)
            executable = folder / "scroll-dismiss-keyboard"
            command = [
                shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
                "-Wno-ignored-attributes", "-Wno-unknown-attributes",
                "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                "-I" + str(include), "-I" + str(folder),
                str(Path(__file__).with_name("scroll-dismiss-keyboard.cpp")), "-o", str(executable),
            ]
            (folder / "command.json").write_text(json.dumps(command, indent=2) + "\n")
            guard = runpy.run_path(str(Path(__file__).with_name("verify-scroll-dismiss-regressions.py")))
            (folder / "native-scan.json").write_text(json.dumps(guard["scan_native"]()) + "\n")
            subprocess.run(command, check=True)
            selected = ("binding", "drag", "sibling") if options.original_red else (
                cases if variant == "current" else controls[variant][2])
            for scenario in selected:
                result = subprocess.run([str(executable), scenario], text=True, capture_output=True)
                expected = 75 if (options.original_red or variant != "current" or
                                  (options.focus_operation_red and scenario in focus_operation_red)) else 0
                if result.returncode != expected or (expected and "REGRESSION:" not in result.stderr):
                    raise RuntimeError(f"{variant}/{scenario}: {result.returncode}\n" + result.stdout + result.stderr)
                print(f"{'RED' if expected else 'GREEN'} {variant}/{scenario}: " +
                      (result.stderr.strip() if expected else result.stdout.strip()), flush=True)
                results.append({"variant": variant, "scenario": scenario, "exitStatus": result.returncode,
                                "stdout": result.stdout, "stderr": result.stderr,
                                "productionSHA256": {name: hashlib.sha256(text.encode()).hexdigest()
                                                     for name, text in source.items()}})
    (output / "verification.json").write_text(json.dumps({
        "backend": str(options.backend.resolve()), "sanitizers": ["address", "undefined"],
        "sdkIncludes": str(options.sdk_includes.resolve()),
        "boundary": "Verbatim production Scroll event/admission/properties/attrs/journal/drain, "
                    "NativeTextInput focus/valid/activate and Node integer/set/live; adapted Valdi callbacks/"
                    "locks, raw-touch terminals, edit-change callback and recording SDK native boundary; no device",
        "cases": results,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
