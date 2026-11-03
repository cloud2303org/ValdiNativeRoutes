#!/usr/bin/env python3
"""Prove focused production-helper regressions reject representative breakage."""

from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    backend = Path(__file__).resolve().parents[1]
    header = (backend / "InputState.hpp").read_text()
    tests = (backend / "tests/input-state.cpp").read_text()
    mutations = {
        "session consumed after reentry": (
            "const bool ended = std::exchange(focused, false);",
            "const bool ended = focused;",
        ),
        "clamped selection never published": (
            "publish(edit.selection);",
            "(void)publish;",
        ),
        "processor reentry unnecessarily invalidates accepted edit": (
            "auto replacement = processor(candidate);",
            "auto replacement = processor(candidate);\n    epoch.replace();",
        ),
        "true content replacement fails to cancel processor": (
            "if (!epoch.current(generation) || !valid()) return std::nullopt;",
            "(void)generation;\n    if (!valid()) return std::nullopt;",
        ),
        "setter acknowledgement remains armed for same-text commit": (
            "pending.text = false;",
            "(void)pending.text;",
        ),
        "coalesced setters retain superseded text expectations": (
            "if (pending.generation <= matched) pending.text",
            "if (pending.generation == matched) pending.text",
        ),
        "user activity fails to cancel pending setters": (
            "void cancel() { _pending.clear(); }",
            "void cancel() { (void)_pending; }",
        ),
        "setter expectation lives beyond bounded window": (
            "return now >= pending.expires;",
            "return now >= pending.expires + std::chrono::seconds(1);",
        ),
        "setter generation ledger grows without bound": (
            "if (_pending.size() == capacity) _pending.pop_front();",
            "(void)_pending;",
        ),
        "selection ticket incorrectly suppresses a same-text commit": (
            "if (pending.text && pending.edit.text == value)",
            "if (pending.edit.text == value)",
        ),
        "blocking setter consumes the entire deferred window": (
            "pending.expires = now + lifetime;",
            "(void)now;",
        ),
        "repeated completion extends the same setter indefinitely": (
            "pending.generation == ticket && !pending.completed",
            "pending.generation == ticket",
        ),
        "old completion refreshes an unrelated newer ticket": (
            "pending.generation == ticket && !pending.completed",
            "!pending.completed",
        ),
        "completion rearms acknowledged channels": (
            "pending.completed = true;",
            "pending.completed = true;\n                pending.text = pending.selection = pending.caret = true;",
        ),
        "superseded write completion keeps its old ticket": (
            "if (!current) { cancel(ticket); return false; }",
            "if (!current) { return false; }",
        ),
    }
    with tempfile.TemporaryDirectory(prefix="valdi-input-negative-controls-") as directory:
        root = Path(directory)
        (root / "tests").mkdir()
        (root / "tests/input-state.cpp").write_text(tests)
        for name, (before, after) in mutations.items():
            if header.count(before) != 1:
                raise RuntimeError(f"{name}: mutation no longer identifies one production seam")
            (root / "InputState.hpp").write_text(header.replace(before, after))
            subprocess.run(
                [shutil.which("clang++") or "c++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
                 str(root / "tests/input-state.cpp"), "-o", str(root / "input-state")],
                check=True, capture_output=True, text=True,
            )
            result = subprocess.run([str(root / "input-state")], capture_output=True, text=True)
            if result.returncode == 0 or "Assertion failed" not in result.stderr:
                raise RuntimeError(f"{name}: expected regression assertion, got {result.returncode}: {result.stderr}")
            print(f"input negative control rejected: {name}", flush=True)


if __name__ == "__main__":
    main()
