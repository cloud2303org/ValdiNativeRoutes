#!/usr/bin/env python3
"""Isolated macOS JVM/JNI regression check; never runs Gradle, codegen, or export.

Uses canonical generated Kotlin, integrated runtime sources, the cached AAR,
and previously compiled native AppUI classes. All outputs go to /tmp.
"""
from pathlib import Path
import hashlib
import os
import subprocess
import tempfile
import zipfile


repo = Path(__file__).resolve().parents[4]
cache = Path.home() / ".gradle/caches/modules-2/files-2.1"
out = Path(tempfile.mkdtemp(prefix="valdi-appui-promise-", dir="/tmp"))


def artifact(group, name, version):
    return next((cache / group / name / version).glob("*/*.jar"))


stdlib = artifact("org.jetbrains.kotlin", "kotlin-stdlib", "2.4.21")
compiler = [
    artifact("org.jetbrains.kotlin", name, "2.4.21")
    for name in ["kotlin-compiler-embeddable", "kotlin-daemon-embeddable",
                 "kotlin-script-runtime", "kotlin-build-tools-api"]
] + [
    stdlib,
    artifact("org.jetbrains.kotlin", "kotlin-reflect", "1.6.10"),
    artifact("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.8.0"),
    artifact("org.jetbrains", "annotations", "23.0.0"),
]
runtime = out / "valdi-runtime-classes.jar"
with zipfile.ZipFile(repo / "android/app/libs/valdi_runtime.aar") as aar:
    runtime.write_bytes(aar.read("classes.jar"))
android_home = Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk")))
classpath = [
    stdlib, runtime,
    artifact("junit", "junit", "4.13.2"),
    artifact("org.hamcrest", "hamcrest-core", "1.3"),
    artifact("androidx.annotation", "annotation-jvm", "1.9.1"),
    android_home / "platforms/android-37.0/android.jar",
    repo / "android/app/build/intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes",
]
source_root = repo / "android/app/src"
runtime_source_root = Path(os.environ.get(
    "VALDI_SOURCE_ROOT", str(repo / "valdi/bazel-valdi/external/valdi+")))
runtime_root = runtime_source_root / "valdi/src/java/com/snap/valdi"
marker = runtime_root / "exceptions/PromiseRejectionException.kt"
callback = runtime_root / "promise/CppPromiseCallback.kt"
if not marker.is_file() or "PromiseRejectionException" not in callback.read_text():
    raise RuntimeError("Select integrated fork sources containing PromiseRejectionException and its callback handling")
sources = [
    repo / "android/app/generated/valdi/app_pages.kt",
    source_root / "main/java/io/valdiroutes/app/AppUIHostImpl.kt",
    *sorted((source_root / "test/java/io/valdiroutes/app").glob("AppUIPromise*Test.kt")),
    runtime_root / "promise/CppPromiseCallback.kt",
    runtime_root / "exceptions/ExceptionUtils.kt",
    runtime_root / "exceptions/ValdiException.kt",
    runtime_root / "exceptions/PromiseRejectionException.kt",
]
classes = out / "classes"
print("Output:", out, flush=True)
subprocess.run([
    "java", "-cp", os.pathsep.join(map(str, compiler)),
    "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
    "-no-stdlib", "-no-reflect", "-jvm-target", "17",
    "-classpath", os.pathsep.join(map(str, classpath)), "-d", str(classes),
    *map(str, sources),
], check=True)
java_home = Path(subprocess.check_output(["/usr/libexec/java_home", "-v", "17"], text=True).strip())
fixture = out / "libAppUIPromiseJni.dylib"
subprocess.run([
    "clang", "-dynamiclib", "-Wall", "-Wextra", "-Werror",
    "-I" + str(java_home / "include"), "-I" + str(java_home / "include/darwin"),
    str(source_root / "test/AppUIPromiseJni.c"), "-o", str(fixture),
], check=True)
runtime_classpath = os.pathsep.join(map(str, [classes, *classpath]))
(out / "classpath.txt").write_text(runtime_classpath)
result = subprocess.run([
    "java", "-Dappui.promise.jni.library=" + str(fixture), "-cp", runtime_classpath,
    "org.junit.runner.JUnitCore", "io.valdiroutes.app.AppUIPromiseTest",
    "io.valdiroutes.app.AppUIPromiseSerializerTest",
], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
print(result.stdout, end="", flush=True)
(out / "tests.log").write_text(result.stdout)
freeze = [*sources, source_root / "test/AppUIPromiseJni.c", Path(__file__).resolve()]
(out / "freeze.sha256").write_text("".join(
    hashlib.sha256(path.read_bytes()).hexdigest() + "  " +
    str(path.relative_to(repo) if path.is_relative_to(repo) else path) + "\n"
    for path in freeze
))
result.check_returncode()
