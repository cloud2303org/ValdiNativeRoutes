#!/usr/bin/env python3
"""Execute production root mount/detach/shutdown bodies against real SDK types."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def function(text, signature):
    start = text.index(signature)
    # Preserve positions while excluding comment/string braces from balancing.
    mask = re.sub(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'',
                  lambda match: " " * len(match[0]), text, flags=re.S)
    opening = mask.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (mask[end] == "{") - (mask[end] == "}")
        end += 1
    return text[start:end]


def production(backend, old_order=False):
    source = (backend / "ArkUIViewManager.cpp").read_text()
    backend_source = source[source.index("struct Backend "):source.index("static int fontWeight")]
    node_source = source[source.index("struct Node :"):source.index("static std::shared_ptr<Node> unwrap")]
    result = ["namespace Valdi::Harmony::detail {\n"]
    for signature in ("void requireUI() const", "void runUI(DispatchFunction fn) const",
                      "void live() const", "void report(const std::string& message) const noexcept"):
        body = function(backend_source, signature)
        result.append(body.replace("void ", "void Backend::", 1) + "\n")
    for signature in ("void live() const", "void detach()", "void dispose() noexcept",
                      "void setImageAttachmentEnabled(bool enabled)", "~Node()"):
        body = function(node_source, signature)
        qualified = body.replace("void ", "void Node::", 1) if signature.startswith("void ") else body.replace("~Node()", "Node::~Node()", 1)
        result.append(qualified + "\n")
    snapshots = (backend / "NativeSnapshot.inc").read_text()
    for signature in (
        "static void finishSnapshots(",
        "static void cancelBackendSnapshots(",
        "static void cancelSubtreeSnapshots(",
    ):
        result.append(function(snapshots, signature) + "\n")
    result.append("}\nnamespace Valdi::Harmony {\n")
    signatures = (
        "void ArkUIViewManager::mountRoot(const Ref<View>& root, ArkUI_NodeContentHandle content)",
        "void ArkUIViewManager::mountRootInParent(const Ref<View>& root, ArkUI_NodeHandle parent, int index)",
        "void ArkUIViewManager::mountRoot(const Ref<View>& root, ArkUI_NodeContentHandle content, int index)",
        "void ArkUIViewManager::shutdown()",
    )
    for signature in signatures:
        body = function(source, signature)
        if old_order and "::mountRoot" in signature:
            guard = "        node->live(); // Snapshot completion can synchronously shut down this manager.\n"
            if body.count(guard) != 1:
                raise RuntimeError("Expected exactly one post-detach guard in each production mount")
            body = body.replace(guard, "")
            body = body.replace("        if (targetParent) targetParent->live();\n", "")
            body = body.replace('        if (_backend->api->getTotalChildCount(parent) < static_cast<uint32_t>(index)) detail::fail("native parent index changed during detach");\n', "")
        result.append(body + "\n")
    result.append("}\n")
    return "".join(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk-includes", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    results = []
    with tempfile.TemporaryDirectory(prefix="valdi-mount-sdk-") as temporary:
        include = Path(temporary)
        # Use actual ArkUI declarations with host libc++; never shadow host
        # standard headers with the OHOS sysroot and never handwrite SDK ABI.
        for name in ("arkui", "info", "ace", "napi", "native_drawing", "multimedia"):
            target = options.sdk_includes / name
            if target.exists():
                (include / name).symlink_to(target, target_is_directory=True)
        for old_order in (False, True):
            folder = output / ("old-order" if old_order else "fixed")
            folder.mkdir(exist_ok=True)
            extracted = production(backend, old_order)
            (folder / "mount-production.inc").write_text(extracted)
            executable = folder / "mount-reentry"
            subprocess.run([
                shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
                "-Wno-ignored-attributes", "-Wno-unknown-attributes",
                "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                "-I" + str(include), "-I" + str(folder),
                str(backend / "tests/mount-reentry.cpp"), "-o", str(executable),
            ], check=True)
            scenarios = [("shutdown", str(variant)) for variant in range(3)]
            scenarios.extend((name,) for name in ("target-dispose", "target-index", "normal"))
            for scenario in scenarios:
                completed = subprocess.run([str(executable), *scenario], text=True, capture_output=True)
                if not old_order or scenario[0] == "normal":
                    if completed.returncode:
                        raise RuntimeError(completed.stdout + completed.stderr)
                    print(completed.stdout.strip(), flush=True)
                else:
                    if completed.returncode != 75 or "REGRESSION:" not in completed.stderr:
                        raise RuntimeError("Old-order negative control did not reproduce: " +
                                           completed.stdout + completed.stderr)
                    print("old-order negative control reproduced: " + " ".join(scenario), flush=True)
                results.append({
                    "ordering": "old-order" if old_order else "fixed",
                    "scenario": list(scenario),
                    "exitStatus": completed.returncode,
                    "stdout": completed.stdout.strip(),
                    "stderr": completed.stderr.strip(),
                    "extractedProductionSHA256": hashlib.sha256(extracted.encode()).hexdigest(),
                })
    (output / "verification.json").write_text(json.dumps({
        "sanitizers": ["address", "undefined"],
        "sdkIncludes": str(options.sdk_includes.resolve()),
        "executionBoundary": "Production method bodies; adapted ownership types, inactive subsystems, and native API boundary",
        "cases": results,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
