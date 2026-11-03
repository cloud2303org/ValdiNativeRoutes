#!/usr/bin/env python3
"""Extract unchanged Navigator sheet bodies for the actual surface fixture.

Source generation only. Never invokes a compiler, native fixture or build.
Use --source for either the immutable old host or the fixed current host.
Both runs must use the same fixture/boundary/extractor source.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
METHODS = (
    ("HarmonySheetGeometry", "sheetGeometry"),
    ("void", "closeSheet"),
    ("void", "reconcileSheet"),
    ("void", "finishSheet"),
    ("void", "setActive"),
    ("void", "layoutSheet"),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def extract(text, result, name):
    matches = list(re.finditer(
        rf"^{re.escape(result)} HarmonyNavigator::{name}\(", text, re.MULTILINE))
    if len(matches) != 1:
        raise ValueError(f"Expected one production definition of {name}")
    start = matches[0].start()
    brace = text.index("{", start)
    depth, index, state = 1, brace + 1, "code"
    while depth:
        if index >= len(text):
            raise ValueError(f"Unterminated production method {name}")
        char = text[index]
        pair = text[index:index + 2]
        if state == "line":
            if char == "\n":
                state = "code"
        elif state == "block":
            if pair == "*/":
                state = "code"
                index += 1
        elif state in ("'", '"'):
            if char == "\\":
                index += 1
            elif char == state:
                state = "code"
        elif pair == "//":
            state = "line"
            index += 1
        elif pair == "/*":
            state = "block"
            index += 1
        elif char in ("'", '"'):
            state = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        index += 1
    body = text[start:index]
    return body, text[:start].count("\n") + 1


def generate(source, output, manifest):
    data = source.read_bytes()
    text = data.decode("utf-8")
    bodies, entries = [], []
    for result, name in METHODS:
        body, line = extract(text, result, name)
        bodies.append(body)
        entries.append({
            "name": name, "startLine": line,
            "endLine": line + body.count("\n"), "sha256": digest(body.encode()),
            "transformation": "none",
        })
    generated = (
        "// Unchanged production definitions; collaborators are declared in\n"
        "// sheet-surface-navigation-boundary.hpp. No surface substitutions.\n\n"
        + "\n\n".join(bodies) + "\n"
    ).encode()
    # Exclusive creation prevents accidental mutation of historical evidence.
    with output.open("xb") as stream:
        stream.write(generated)
    record = {
        "source": str(source), "sourceSha256": digest(data),
        "extractor": str(Path(__file__).resolve()),
        "extractorSha256": digest(Path(__file__).read_bytes()),
        "output": str(output), "outputSha256": digest(generated),
        "methods": entries,
        "methodBodiesChanged": False, "surfaceSubstituted": False,
        "nativeCompilerInvoked": False, "nativeFixtureExecuted": False,
    }
    with manifest.open("x") as stream:
        json.dump(record, stream, indent=2)
        stream.write("\n")
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    record = generate(args.source.resolve(), args.output.resolve(), args.manifest.resolve())
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
