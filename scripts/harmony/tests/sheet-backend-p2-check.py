#!/usr/bin/env python3
"""Source/snapshot integrity only; no compiler or fixture process is invoked."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
app = root / "harmony/entry/src/main/cpp/backend"
fork = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102/valdi/harmony/arkui")
initial = Path("/tmp/valdi-sheets-20261103/backend-source-freeze/receipt.json")
prefix = Path("/tmp/valdi-sheets-20261103/backend-p2-prefix/receipt.json")
sum_prefix = Path("/tmp/valdi-sheets-20261103/backend-max-prefix/receipt.json")
resume = Path("/tmp/valdi-sheets-20261103/resume-20261103-partial-audit/receipt.json")
previous = Path("/tmp/valdi-sheets-20261103/backend-p2-max-source-freeze/receipt.json")
reenable_prefix = Path("/tmp/valdi-sheets-20261103/backend-touch-reenable-prefix/receipt.json")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def protected_digest(path):
    # Preserve the original assertion/behavior hash while admitting exactly the
    # native-boundary fields required by the gesture input-parent extraction.
    path = Path(path)
    text = path.read_text()
    if path.name == "wheel-native.cpp":
        text = text.replace("    std::vector<Node*> nodes;\n", "")
        text = text.replace("struct Inactive { ArkUI_NodeHandle handle = nullptr, content = nullptr; };",
                            "struct Inactive { ArkUI_NodeHandle handle = nullptr; };")
    elif path.name == "scroll-dismiss-keyboard.cpp":
        text = text.replace("    std::vector<Node*> nodes;\n", "")
        text = text.replace("    struct RefreshBoundary { ArkUI_NodeHandle handle = nullptr; };\n"
                            "    std::shared_ptr<RefreshBoundary> refresh;", "    bool refresh = false;")
    return hashlib.sha256(text.encode()).hexdigest()


assert digest(initial) == "c1f0ab9cfc922a020239bb4b7d22f495858abc8e2912d8a45a22a9e9b488a74f"
assert digest(prefix) == "da719928ea037477bdb26d11373dc6ee9cf454d7a9fe2f7c7e64c0896380a97d"
assert digest(sum_prefix) == "65dd74438cee8e22bbfc72408041aa1b3451bde46a54b7fd4d9137224cb836ec"
assert digest(previous) == "db89d5dc2248a8891cf6e6390010ab12aa0985cb658704354f185cf6fcd601cb"
assert digest(reenable_prefix) == "33ddd2dc77032f8e455c8fe167098ffeb609805a3f4cc7afc896a4e68d88c26e"
original = json.loads(initial.read_text())
before = json.loads(prefix.read_text())
for entry in original["sources"]:
    assert digest(entry["snapshot"]) == entry["sha256"], entry["snapshot"]
for entry in before["sources"]:
    assert digest(entry["snapshot"]) == entry["sha256"], entry["snapshot"]
for entry in json.loads(sum_prefix.read_text())["sources"]:
    assert digest(entry["snapshot"]) == entry["sha256"], entry["snapshot"]
for entry in json.loads(sum_prefix.read_text())["referenceSources"]:
    assert digest(entry["path"]) == entry["sha256"], entry["path"]
for entry in json.loads(resume.read_text())["sources"].values():
    assert digest(entry["snapshot"]) == entry["sha256"], entry["snapshot"]
for receipt in [previous, reenable_prefix]:
    for entry in json.loads(receipt.read_text())["sources"]:
        assert digest(entry["snapshot"]) == entry["sha256"], entry["snapshot"]
for entry in original["protectedSources"]:
    assert protected_digest(entry["path"]) == entry["sha256"], entry["path"]
for entry in before["readOnlySources"]:
    assert digest(entry["source"]) == entry["sha256"], entry["source"]
changed = {"ArkUIViewManager.cpp", "NativeScroll.inc", "NativeGestures.inc", "SheetInteraction.inc", "SheetInteraction.hpp"}
gesture_modules = {"gesture.hpp", "gesture.cpp", "CMakeLists.txt"}
consumer_changes = {"sheet-backend-check.mjs", "sheet-backend-p2-check.py", "sheet-backend-p2-extract.py"}
for directory in [app, fork]:
    assert not (directory / "NativeGestures.inc").exists(), "Retired gesture include must not return"
for entry in before["sources"]:
    p = Path(entry["source"])
    if p.name not in changed | gesture_modules | consumer_changes:
        assert protected_digest(p) == entry["sha256"], str(p)
for name in ["NativeScroll.inc", "gesture.hpp", "gesture.cpp", "SheetInteraction.inc", "SheetInteraction.hpp"]:
    assert digest(app / name) == digest(fork / name), name
assert digest(app / "SheetInteraction.hpp") == "a0402760090cbbd615a09b923ef9647ea0fbdaa213d08632328d85d60fc5d297"
sources = []
for directory in [app, fork]:
    for name in sorted((changed - {"NativeGestures.inc"}) | gesture_modules):
        p = directory / name
        sources.append({"path": str(p), "sha256": digest(p)})
for p in sorted(Path(__file__).parent.glob("sheet-backend-*")):
    if p.is_file():
        sources.append({"path": str(p), "sha256": digest(p)})
extractions = []
for variant in ["prefix-app", "prefix-fork", "sum-app", "sum-fork", "fixed-app", "fixed-fork"]:
    p = Path(f"/tmp/valdi-sheets-20261103/backend-round3-generated-{variant}/extraction.json")
    extraction = json.loads(p.read_text())
    for path, expected in extraction["inputs"].items():
        assert digest(path) == expected, path
    for path, expected in extraction["outputs"].items():
        assert digest(path) == expected, path
    extractions.append({"path": str(p), "sha256": digest(p)})
print(json.dumps({
    "validationKind": "source-and-extraction-integrity-only",
    "nativeCompilerInvoked": False,
    "nativeFixtureExecuted": False,
    "initialFreeze": {"path": str(initial), "sha256": digest(initial), "unchanged": True},
    "preFixSnapshot": {"path": str(prefix), "sha256": digest(prefix), "unchanged": True},
    "sumAllocatorSnapshot": {"path": str(sum_prefix), "sha256": digest(sum_prefix), "unchanged": True},
    "pausedPartialAudit": {"path": str(resume), "sha256": digest(resume), "snapshotsUnchanged": True},
    "previousSourceFreeze": {"path": str(previous), "sha256": digest(previous), "unchanged": True},
    "reenablePreFixSnapshot": {"path": str(reenable_prefix), "sha256": digest(reenable_prefix), "unchanged": True},
    "sources": sources,
    "selectedBodyExtractions": extractions,
    "protectedFilesVerified": len(original["protectedSources"]),
    "readOnlyDelegatesVerified": before["readOnlySources"],
    "iosPrimaryReferences": [{"path": entry["path"], "sha256": digest(entry["path"])}
                            for entry in json.loads(sum_prefix.read_text())["referenceSources"]],
    "iosRouteEntryReference": {"path": str(root / "ios/ValdiRoutes/ValdiHost.swift"),
                              "sha256": digest(root / "ios/ValdiRoutes/ValdiHost.swift")},
    "privateEndReason": "SheetInteractionEndReason { Ended, GestureCanceled, LifecycleCanceled }",
    "parentPending": ["identical-source baseline RED and fixed GREEN under ASan/UBSan",
                      "all four SDK manager profiles",
                      "fresh independent review round three",
                      "identical-source SUM RED and MAX+pin GREEN with actual native callback paths",
                      "actual route-host Ended/GestureCanceled +/-600 and midpoint snap policy",
                      "native device event-order and budget proof",
                      "distinct lifecycle cancellation before DID_SCROLL ordering remains open"],
}, indent=2))
