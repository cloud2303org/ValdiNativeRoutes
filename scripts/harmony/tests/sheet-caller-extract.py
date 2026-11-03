#!/usr/bin/env python3
"""Extract unchanged production caller-result bodies. Never invokes a compiler."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "harmony/entry/src/main/cpp/host/HarmonyNavigator.cpp"
METHODS = {
    "complete": "void",
    "enqueue": "void",
    "makeNavigationHost": "Value",
    "captureResultCaller": "void",
    "cancelCallerResults": "void",
    "retirePage": "void",
}
PARENT_SOURCE = ROOT / ".tools/harmony/upstream/valdi/src/valdi/runtime/JavaScript/JavaScriptComponentContextHandler.cpp"
FORK_RUNTIME = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102/valdi/src/valdi/runtime")


def block(text, signature):
    """Balance C++ braces while excluding comments and string/character literals."""
    start = text.index(signature)
    brace = text.index("{", start)
    index, depth, state = brace, 0, "code"
    while index < len(text):
        c, following = text[index], text[index:index + 2]
        if state in ('"', "'"):
            if c == "\\":
                index += 2
                continue
            if c == state:
                state = "code"
        elif state == "//":
            if c == "\n":
                state = "code"
        elif state == "/*":
            if following == "*/":
                state = "code"
                index += 2
                continue
        elif following in ("//", "/*"):
            state = following
            index += 2
            continue
        elif c in ('"', "'"):
            state = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
        index += 1
    raise ValueError("Unbalanced source: " + signature)


def extract(source=SOURCE):
    text = source.read_text()
    helpers = text[text.index("Value object()"):text.index("struct RouteAnimation {")]
    result = block(text, "struct HarmonyNavigator::Result {") + ";"
    methods = [block(text, f"{ret} HarmonyNavigator::{name}(") for name, ret in METHODS.items()]
    chunks = [helpers, result, *methods]
    manifest = {
        "source": str(source), "sourceSHA256": hashlib.sha256(text.encode()).hexdigest(),
        "methods": list(METHODS), "bodySubstitutions": [],
        "chunkSHA256": [hashlib.sha256(chunk.encode()).hexdigest() for chunk in chunks],
        "realContextTypesPreserved": True,
        "collaborators": ["UI queue", "Runtime destruction dispatch", "tree getContext",
                          "destination attachment and rendering"],
        "compiled": False, "executed": False,
    }
    return "\n\n".join(chunks) + "\n", manifest


def parent_resolution():
    text = PARENT_SOURCE.read_text()
    chunks = [block(text, signature) for signature in (
        "static void resolveParentContext(const RefCountable*",
        "static void resolveParentContext(const Value&",
    )]
    return "namespace Valdi {\n" + "\n\n".join(chunks) + "\n}\n", {
        "source": str(PARENT_SOURCE),
        "sourceSHA256": hashlib.sha256(text.encode()).hexdigest(),
        "chunkSHA256": [hashlib.sha256(chunk.encode()).hexdigest() for chunk in chunks],
        "bodySubstitutions": [],
    }


def page_root_trace():
    """Source evidence for the independent native page-root premise, not renderer execution."""
    staged = PARENT_SOURCE.parents[1]
    pairs = []
    inputs = {}
    for name in ("Runtime.cpp", "Context/ContextManager.cpp", "Context/Context.cpp",
                 "JavaScript/JavaScriptComponentContextHandler.cpp",
                 "JavaScript/JSValueRefHolder.cpp", "JavaScript/ValueFunctionWithJSValue.cpp"):
        left, right = staged / name, FORK_RUNTIME / name
        hashes = [hashlib.sha256(path.read_bytes()).hexdigest() for path in (left, right)]
        inputs.update({str(left): hashes[0], str(right): hashes[1]})
        pairs.append({"staged": str(left), "fork": str(right), "identical": hashes[0] == hashes[1]})
    return {
        "kind": "source-trace plus separately executed actual parent-resolver/payload controls",
        "inputs": inputs, "pairs": pairs,
        "path": [
            "Navigator::createTree native generated PageContext/TabBarContext and detached route data",
            "Runtime::createViewNodeTreeAndContext -> Runtime::createContext",
            "ContextManager::createContext constructs Context without inferred current parent",
            "JavaScriptComponentContextHandler::doOnCreate conditionally resolves JSValueRefHolder inputs",
            "native generated payloads resolve no parent; injected nested real JS functions resolve holder root",
        ],
        "rendererExecuted": False, "fullJavaScriptRuntimeInitialized": False,
        "dynamicCallerDoesNotProveLexicalOwnership": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    generated, manifest = extract(args.source)
    if args.output:
        args.output.write_text(generated)
        args.output.with_suffix(".extraction.json").write_text(json.dumps(manifest, indent=2) + "\n")
    else:
        print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
