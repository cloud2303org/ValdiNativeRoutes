#!/usr/bin/env python3
"""Offline JVM source regression tests, using real generated Valdi models/runtime.

Each scenario uses a fresh JVM to avoid any test-only store reset API.
Only Android Log is substituted. JNI marshalling,
Android packaging and device behavior are outside this runner's boundary.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile


def main():
    tests = Path(__file__).resolve().parent
    root = tests.parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=tests.parent / "android/ThemeBridgeModuleFactory.kt")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=True)
    cache = Path.home() / ".gradle/caches/modules-2/files-2.1"

    def cached(group, artifact, version):
        matches = sorted((cache / group / artifact / version).glob("*/*.jar"))
        if len(matches) != 1:
            raise RuntimeError(f"Expected one cached {artifact}:{version}, found {len(matches)}; no downloads allowed")
        return matches[0]

    compiler = cached("org.jetbrains.kotlin", "kotlin-compiler-embeddable", "2.2.10")
    stdlib = cached("org.jetbrains.kotlin", "kotlin-stdlib", "2.2.10")
    annotations = cached("org.jetbrains", "annotations", "13.0")
    coroutines = cached("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.8.0")
    models = root / "module-build/out/android/theme_bridge/theme_bridge_android.jar"
    aar = root / "android/app/libs/valdi_runtime.aar"
    runtime = args.evidence / "valdi-runtime-classes.jar"
    with zipfile.ZipFile(aar) as archive:
        runtime.write_bytes(archive.read("classes.jar"))
    inputs = [
        args.source, models, aar, compiler, stdlib, annotations, coroutines,
        tests.parent / "android/ThemeTokensStore.kt",
        *sorted(tests.rglob("*.kt")), Path(__file__).resolve(),
    ]
    manifest = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    (args.evidence / "inputs-sha256.json").write_text(json.dumps(manifest, indent=2) + "\n")

    def cp(paths):
        return os.pathsep.join(map(str, paths))

    output = args.evidence / "theme-tests.jar"
    deps = [models, runtime, stdlib, annotations]
    compile_command = [
        "java", "-cp", cp([compiler, stdlib, annotations, coroutines]),
        "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
        "-no-stdlib", "-no-reflect", "-jvm-target", "17",
        "-classpath", cp(deps), "-d", str(output), str(args.source),
        str(tests.parent / "android/ThemeTokensStore.kt"),
        str(tests / "ThemeTokensStoreTest.kt"),
        *map(str, [tests / "stubs/Log.kt"]),
    ]
    compiled = subprocess.run(compile_command, capture_output=True, text=True)
    (args.evidence / "compile.log").write_text(compiled.stdout + compiled.stderr)
    if compiled.returncode:
        print(compiled.stdout + compiled.stderr)
        raise SystemExit(compiled.returncode)

    scenarios = ["typed-native-store"]
    failures = []
    for scenario in scenarios:
        result = subprocess.run([
            "java", "-cp", cp([output, *deps]),
            "io.valdiroutes.app.modules.theme_bridge.ThemeTokensStoreTestKt",
            scenario,
        ], capture_output=True, text=True)
        (args.evidence / f"{scenario}.log").write_text(result.stdout + result.stderr)
        print(f"{'PASS' if result.returncode == 0 else 'FAIL'} {scenario}", flush=True)
        if result.returncode:
            failures.append(scenario)
    invalid = args.evidence / "InvalidThemeConsumer.kt"
    invalid.write_text("import io.valdiroutes.app.modules.theme_bridge.ThemeTokensStore\nval invalid: Double = ThemeTokensStore.tokens.light.surface\n")
    rejected = subprocess.run([
        "java", "-cp", cp([compiler, stdlib, annotations, coroutines]),
        "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", "-no-stdlib", "-no-reflect", "-jvm-target", "17",
        "-classpath", cp([output, *deps]), "-d", str(args.evidence / "invalid.jar"), str(invalid),
    ], capture_output=True, text=True)
    (args.evidence / "invalid-consumer.log").write_text(rejected.stdout + rejected.stderr)
    errors = rejected.stdout + rejected.stderr
    if rejected.returncode == 0 or "Double" not in errors or "String" not in errors:
        failures.append("native-type-rejection")
    scenarios.append("native-type-rejection")
    summary = {"passed": len(scenarios) - len(failures), "total": len(scenarios), "failures": failures}
    (args.evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))
    raise SystemExit(bool(failures))


if __name__ == "__main__":
    main()
