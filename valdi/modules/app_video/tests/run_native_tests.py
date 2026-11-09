#!/usr/bin/env python3
"""Focused native source tests; no app build, codegen, simulator, or downloads.

The iOS volume command and its real perform: wrapper are extracted verbatim
from production because that translation unit also imports UIKit/AVKit.
The Foundation resource resolver is compiled as a complete production file.
These tests do not exercise AV playback, JNI/Valdi marshalling, or packaging.
"""
from pathlib import Path
import os
import plistlib
import subprocess
import tempfile


def method(source, signature):
    start = source.index(signature)
    body = source.index("{", start)
    depth = 1
    end = body + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


def main():
    tests = Path(__file__).resolve().parent
    module = tests.parent
    source = (module / "ios/VRVideoService.m").read_text()
    with tempfile.TemporaryDirectory(prefix="valdi-video-native-") as directory:
        output = Path(directory)
        harness = (tests / "VolumeCommandTests.m").read_text()
        for marker, signature in [
            ("ERROR", "static NSError *VRVideoError("),
            ("PERFORM", "- (SCValdiPromise<SCValdiUndefinedValue *> *)perform:"),
            ("SET_VOLUME", "- (SCValdiPromise<SCValdiUndefinedValue *> *)setVolumeWithVolume:"),
        ]:
            harness = harness.replace(f"/* PRODUCTION_{marker} */", method(source, signature))
        command = output / "VolumeCommandTests.m"
        command.write_text(harness)
        binary = output / "volume-tests"
        subprocess.run(["clang", "-fobjc-arc", "-fblocks", "-framework", "Foundation",
                        str(command), "-o", str(binary)], check=True)
        subprocess.run([str(binary)], check=True, timeout=15)
        fixture = output / "Fixture.bundle"
        fixture.mkdir()
        (fixture / "Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": "test.video.resources"}))
        (fixture / "sample.mp4").write_bytes(b"test content")
        (fixture / "other-file_2.mov").write_bytes(b"other content")
        (fixture / "directory.mp4").mkdir()
        binary = output / "source-tests"
        subprocess.run(["clang", "-fobjc-arc", "-framework", "Foundation",
                        "-I", str(module / "ios"), str(module / "ios/VRVideoSource.m"),
                        str(tests / "SourceURLTests.m"), "-o", str(binary)], check=True)
        subprocess.run([str(binary), str(fixture)], check=True, timeout=15)

        cache = Path.home() / ".gradle/caches/modules-2/files-2.1"

        def cached(group, artifact, version):
            matches = list((cache / group / artifact / version).glob("*/*.jar"))
            if len(matches) != 1:
                raise RuntimeError(f"Expected one cached {artifact}:{version}; no downloads allowed")
            return matches[0]

        stdlib = cached("org.jetbrains.kotlin", "kotlin-stdlib", "2.2.10")
        annotations = cached("org.jetbrains", "annotations", "13.0")
        compiler = cached("org.jetbrains.kotlin", "kotlin-compiler-embeddable", "2.2.10")
        coroutines = cached("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.8.0")
        jar = output / "volume-tests.jar"
        subprocess.run(["java", "-cp", os.pathsep.join(map(str, [compiler, stdlib, annotations, coroutines])),
                        "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", "-no-stdlib", "-no-reflect", "-nowarn",
                        "-classpath", os.pathsep.join(map(str, [stdlib, annotations])),
                        "-d", str(jar), str(module / "android/VideoPlayerImpl.kt"),
                        str(tests / "VolumeCommandTests.kt"), str(tests / "PromiseBoundary.kt")], check=True)
        subprocess.run(["java", "-cp", os.pathsep.join(map(str, [jar, stdlib])),
                        "io.valdiroutes.video.VolumeCommandTestsKt"], check=True, timeout=15)


if __name__ == "__main__":
    main()
