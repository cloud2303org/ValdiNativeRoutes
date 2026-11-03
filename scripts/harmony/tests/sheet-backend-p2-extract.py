#!/usr/bin/env python3
"""Extract production C++ bodies only. This script NEVER invokes a compiler."""
import argparse
import hashlib
import json
from pathlib import Path


def block(text, marker):
    start = text.index(marker)
    opening = text.index("{", start)
    depth, quote, line, comment, escaped = 0, None, False, False, False
    i = opening
    while i < len(text):
        c, following = text[i], text[i:i + 2]
        if line:
            if c == "\n":
                line = False
        elif comment:
            if following == "*/":
                comment = False
                i += 1
        elif quote:
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == quote:
                quote = None
        elif following == "//":
            line = True
            i += 1
        elif following == "/*":
            comment = True
            i += 1
        elif c in "\"'":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
        i += 1
    raise ValueError(f"Unclosed production body: {marker}")


parser = argparse.ArgumentParser()
parser.add_argument("--backend-root", required=True, type=Path,
                    help="Explicit app/fork live root OR immutable pre-fix app/fork snapshot.")
parser.add_argument("--support-root", required=True, type=Path,
                    help="Matching backend root for unchanged SDK helper headers missing from snapshots.")
parser.add_argument("--out", required=True, type=Path)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
manager_path = args.backend_root / "ArkUIViewManager.cpp"
scroll_path = args.backend_root / "NativeScroll.inc"
gestures_path = args.backend_root / "NativeGestures.inc"
manager, scroll = [p.read_text() for p in [manager_path, scroll_path]]
# Historical RED selectors retain the original include. Live managers now own
# this host policy as a method; gesture.cpp only calls its narrow port.
legacy_gestures = gestures_path.exists()
gestures = gestures_path.read_text() if legacy_gestures else None
declarations = block(manager, "struct NativeScroll :")
args.out.joinpath("sheet-backend-p2-scroll-declarations.inc").write_text(declarations + ";\n")
markers = [
    "NativeScroll::NativeScroll(",
    "void NativeScroll::post(",
    "void NativeScroll::properties(",
    "void NativeScroll::specs(",
    "void NativeScroll::queueCommand(",
    "void NativeScroll::didLayout(",
    "void NativeScroll::writeOffset(",
    "void NativeScroll::sample(",
    "void NativeScroll::enqueue(NoticeType",
    "void NativeScroll::enqueue(std::initializer_list",
    "void NativeScroll::drain(",
    "void NativeScroll::cancel(",
    "void NativeScroll::queueDragTarget(",
    "static std::shared_ptr<Node> scrollInputRoot(",
    "static bool scrollDragCurrent(",
    "void NativeScroll::event(",
    "static void cancelSubtreeScroll(",
]
bodies = [block(manager, "static void validateNativeScrollAxis("),
          block(manager, "static int32_t nativeScrollNestedMode(")]
if "static bool scrollOwnedInputEnabled(" in scroll:
    bodies.append(block(scroll, "static bool scrollOwnedInputEnabled("))
bodies += [block(scroll, marker) for marker in markers]
if "static void reconcileSubtreeScrollProperties(" in scroll:
    bodies.append(block(scroll, "static void reconcileSubtreeScrollProperties("))
args.out.joinpath("sheet-backend-p2-scroll-bodies.inc").write_text("\n\n".join(bodies) + "\n")
if legacy_gestures:
    setter = block(gestures, '    if (key == "touchEnabled")')
    setter_reference = "NativeGestures.inc touchEnabled branch, exact body"
else:
    setter = block(manager, "void Node::setGestureTouchEnabled(bool enabled)")
    setter = setter[setter.index("{") + 1:setter.rindex("}")]
    assert "    auto& node = *this;\n" in setter
    setter = setter.replace("    auto& node = *this;\n", "    bool enabled = value.toBool();\n", 1)
    # Only adapt the existing void port's return to the historical bool test
    # wrapper. No policy branch, generation guard or expectation is changed.
    setter = setter.replace("return;", "return true;") + "\n    return true;"
    setter_reference = "ArkUIViewManager.cpp Node::setGestureTouchEnabled; void returns adapted to bool fixture"
args.out.joinpath("sheet-backend-p2-setter.inc").write_text(
    "static bool actualTouchEnabled(Node& node, const TestBool& value) {\n"
    + ('    const std::string_view key = "touchEnabled";\n' if legacy_gestures else "")
    + setter + "\n    return false;\n}\n")
inputs = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in [manager_path, scroll_path, *([gestures_path] if legacy_gestures else [])]}
for name in ["SheetInteraction.hpp", "SheetInteraction.inc", "SheetInteractionInput.inc",
             "SheetInteractionMount.inc", "SheetInteractionState.hpp",
             "ScrollState.hpp", "WheelArbitration.inc"]:
    source = args.backend_root / name
    if not source.exists():
        source = args.support_root / name
    # Copy into the explicit selected include root. RED/GREEN uses identical
    # fixture sources; every body/header comes from its recorded selector.
    args.out.joinpath(name).write_bytes(source.read_bytes())
    inputs[str(source)] = hashlib.sha256(source.read_bytes()).hexdigest()
outputs = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
           for p in args.out.iterdir() if p.is_file() and p.name != "extraction.json"}
receipt = {"backendRoot": str(args.backend_root), "supportRoot": str(args.support_root),
           "nativeCompilerInvoked": False, "productionBodies": markers,
           "setter": setter_reference,
           "inputs": inputs, "outputs": outputs}
args.out.joinpath("extraction.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
