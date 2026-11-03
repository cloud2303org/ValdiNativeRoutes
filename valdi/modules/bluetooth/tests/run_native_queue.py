#!/usr/bin/env python3
"""Isolated production-core tests. Never invokes Bazel, Gradle, Xcode or a device."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

MODULE = Path(__file__).resolve().parents[1]
TESTS = MODULE / "tests"


def run(command, cwd, env=None):
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)


def cases(command, directory):
    command = list(map(str, command))
    listing = subprocess.check_output(command + ["--list"], cwd=directory, text=True)
    failed = []
    results = []
    for entry in listing.splitlines():
        if entry.startswith("CASE:"):
            case = entry.split(":")[1]
            result = subprocess.run(command + [case], cwd=directory, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True)
            print(result.stdout, end="", flush=True)
            (directory / f"case-{case}.log").write_text(result.stdout)
            results.append({"case": int(case), "exitCode": result.returncode})
            if result.returncode:
                failed.append(case)
    platform = "ios" if directory.name == "swift" else "android"
    sources = sorted((SOURCES / platform / "core").glob("*"))
    receipt = {
        "platform": platform, "baseline": args.baseline,
        "baselineRef": args.baseline_ref if args.baseline else None, "cases": results,
        "productionSources": {
            str(source.relative_to(SOURCES)): hashlib.sha256(source.read_bytes()).hexdigest()
            for source in sources if source.suffix in (".swift", ".kt")
        },
        "testSources": {
            str(source.relative_to(MODULE)): hashlib.sha256(source.read_bytes()).hexdigest()
            for source in sorted(TESTS.rglob("*"))
            if source.is_file() and source.suffix in (".py", ".swift", ".kt")
        },
        "boundary": "Production core and engine execute; OS/library boundary is deterministic. No device/radio.",
    }
    (directory / "results.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Native queue cases: {len(results) - len(failed)}/{len(results)} passed", flush=True)
    if failed:
        raise RuntimeError(f"Native cases failed: {', '.join(failed)}")


def sdk_checked(directory, description):
    file = directory / "results.json"
    receipt = json.loads(file.read_text())
    receipt["sdkCheck"] = {"passed": True, "description": description}
    file.write_text(json.dumps(receipt, indent=2) + "\n")


def swift(output):
    directory = output / "swift"
    directory.mkdir(parents=True, exist_ok=True)
    run(["swiftc", "-swift-version", "5", "-emit-module", "-emit-library",
         "-module-name", "CoreBluetooth", TESTS / "swift/CoreBluetooth.swift",
         "-emit-module-path", directory / "CoreBluetooth.swiftmodule",
         "-o", directory / "libCoreBluetooth.dylib"], directory)
    core = SOURCES / "ios/core"
    files = ["BleCore.swift", "BleEngine.swift", "BleFuture.swift",
             "BleModels.swift", "BleRequestKeys.swift", "BleDelegates.swift"]
    run(["swiftc", "-swift-version", "5", "-I", directory, "-L", directory,
         "-lCoreBluetooth", "-Xlinker", "-rpath", "-Xlinker", directory,
         *[core / f for f in files], TESTS / "swift/main.swift",
         "-o", directory / "native-queue-tests"], directory)
    cases([directory / "native-queue-tests"], directory)


def kotlin(output):
    directory = output / "kotlin"
    directory.mkdir(parents=True, exist_ok=True)
    cache = Path.home() / ".gradle/caches/modules-2/files-2.1"

    def jar(group, artifact, version):
        matches = list((cache / group / artifact / version).glob(f"*/{artifact}-{version}.jar"))
        if len(matches) != 1:
            raise RuntimeError(f"Expected cached {group}:{artifact}:{version}")
        return matches[0]

    version = "2.4.21"
    stdlib = jar("org.jetbrains.kotlin", "kotlin-stdlib", version)
    annotations = jar("org.jetbrains", "annotations", "13.0")
    compiler = [jar("org.jetbrains.kotlin", artifact, version) for artifact in [
        "kotlin-compiler-embeddable", "kotlin-script-runtime", "kotlin-daemon-embeddable",
    ]] + [stdlib, annotations, jar("org.jetbrains.kotlin", "kotlin-reflect", "1.6.10"),
          jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.8.0")]
    classpath = os.pathsep.join(map(str, [stdlib, annotations]))
    core = SOURCES / "android/core"
    files = ["BleCore.kt", "BleEngine.kt", "BleFuture.kt", "BleModels.kt",
             "BlePeripheralModels.kt", "BleMappers.kt", "PromiseStore.kt", "ListenerList.kt"]
    run(["java", "-cp", os.pathsep.join(map(str, compiler)),
         "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
         "-no-stdlib", "-no-reflect", "-nowarn", "-jvm-target", "17",
         "-classpath", classpath, "-d", directory / "classes",
         *[core / f for f in files], *sorted((TESTS / "kotlin").glob("*.kt"))], directory)
    cases(["java", "-cp", os.pathsep.join([str(directory / "classes"), classpath]),
           "io.nativeroutes.ble.MainKt"], directory)
    if args.check_sdk:
        dependencies = [Path.home() / "Library/Android/sdk/platforms/android-36/android.jar",
                        stdlib, annotations,
                        jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.10.2")]
        for group, artifact, version in [
            ("com.github.weliem", "blessed-kotlin", "3.0.12"),
            ("androidx.core", "core", "1.17.0"),
            ("androidx.core", "core-ktx", "1.17.0"),
        ]:
            archives = list((cache / group / artifact / version).glob(f"*/{artifact}-{version}.aar"))
            if len(archives) != 1:
                raise RuntimeError(f"Expected cached {group}:{artifact}:{version}")
            target = directory / f"{artifact}-classes.jar"
            with zipfile.ZipFile(archives[0]) as archive:
                target.write_bytes(archive.read("classes.jar"))
            dependencies.append(target)
        run(["java", "-cp", os.pathsep.join(map(str, compiler)),
             "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", "-no-stdlib", "-no-reflect",
             "-jvm-target", "17", "-classpath", os.pathsep.join(map(str, dependencies)),
             "-d", directory / "real-sdk-classes", *sorted(core.glob("*.kt"))], directory)
        sdk_checked(directory, "All production core sources: Android 36 / Blessed 3.0.12 / AndroidX Core+KTX 1.17.0")
        print("PASS Kotlin production core compiles against cached Android 36 / Blessed 3.0.12", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=["swift", "kotlin", "all"], default="all")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--baseline", action="store_true",
                        help="Compile pristine HEAD production files in the output directory; never revert the checkout")
    parser.add_argument("--baseline-ref", default="HEAD")
    parser.add_argument("--check-sdk", action="store_true",
                        help="Also typecheck all production core sources against real installed/cached SDKs")
    parser.add_argument("--ios-sdk", type=Path,
                        default=Path("/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"))
    args = parser.parse_args()
    output = args.output or Path(tempfile.mkdtemp(prefix="ble-native-queue-"))
    output.mkdir(parents=True, exist_ok=True)
    SOURCES = MODULE
    if args.baseline:
        SOURCES = output / "baseline"
        platforms = {"swift": ("ios",), "kotlin": ("android",), "all": ("ios", "android")}[args.platform]
        for platform in platforms:
            directory = SOURCES / platform / "core"
            directory.mkdir(parents=True, exist_ok=True)
            for source in (MODULE / platform / "core").iterdir():
                if source.suffix in (".swift", ".kt"):
                    relative = source.relative_to(MODULE.parents[2])
                    data = subprocess.check_output(["git", "show", f"{args.baseline_ref}:{relative}"], cwd=MODULE)
                    (directory / source.name).write_bytes(data)
    print(f"Native test artifacts: {output}", flush=True)
    if args.platform in ("swift", "all"):
        swift(output)
        if args.check_sdk:
            run(["swiftc", "-swift-version", "5", "-target", "arm64-apple-ios16.0",
                 "-sdk", args.ios_sdk, "-typecheck",
                 *sorted((SOURCES / "ios/core").glob("*.swift"))], output)
            sdk_checked(output / "swift", f"All production core sources: arm64 iOS / {args.ios_sdk}")
            print("PASS Swift production core typechecks for arm64 iOS against installed CoreBluetooth SDK", flush=True)
    if args.platform in ("kotlin", "all"):
        kotlin(output)
