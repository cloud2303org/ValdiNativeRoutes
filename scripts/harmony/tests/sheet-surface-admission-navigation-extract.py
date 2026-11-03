#!/usr/bin/env python3
"""Extract unchanged showSheet admission plus the prior six Navigator methods.

SOURCE ONLY. No compiler or native fixture is invoked. The immutable existing
extractor supplies its C++ lexical scanner; no production method is rewritten.
"""
import argparse
import hashlib
import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "scripts/harmony/tests/sheet-surface-navigation-extract.py"
BASE_MODULE = runpy.run_path(str(BASE), run_name="sheet_surface_source_scanner")
METHODS = BASE_MODULE["METHODS"] + (("void", "showSheet"),)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    source, output, manifest = (path.resolve() for path in (args.source, args.output, args.manifest))
    data = source.read_bytes()
    text = data.decode("utf-8")
    bodies, methods = [], []
    for result, name in METHODS:
        body, line = BASE_MODULE["extract"](text, result, name)
        bodies.append(body)
        methods.append({
            "name": name, "startLine": line, "endLine": line + body.count("\n"),
            "sha256": digest(body.encode()), "transformation": "none",
        })
    generated = (
        "// Unchanged showSheet and six production definitions. Actual surface;\n"
        "// explicit root-mount/dispatcher/page/JS collaborators in the boundary.\n\n"
        + "\n\n".join(bodies) + "\n"
    ).encode()
    with output.open("xb") as stream:
        stream.write(generated)
    record = {
        "source": str(source), "sourceSha256": digest(data),
        "extractor": str(Path(__file__).resolve()),
        "extractorSha256": digest(Path(__file__).read_bytes()),
        "scanner": str(BASE), "scannerSha256": digest(BASE.read_bytes()),
        "output": str(output), "outputSha256": digest(generated), "methods": methods,
        "methodBodiesChanged": False, "surfaceSubstituted": False,
        "childNativeCompilerInvoked": False, "childNativeFixtureExecuted": False,
    }
    with manifest.open("x") as stream:
        json.dump(record, stream, indent=2)
        stream.write("\n")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
