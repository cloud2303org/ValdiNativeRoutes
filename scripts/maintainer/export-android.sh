#!/bin/sh
# Rebuild the Valdi runtime into android/app/libs/valdi_runtime.aar: libvaldi_runtime.so, Valdi's Kotlin and its own
# modules (native_web, valdi_core, valdi_tsx), and the app's module-owned C++ (@ExportModule implementations and their
# bindings), linked into the runtime. app_pages and the npm packages are built by the app's Gradle build
# (tools/valdi-rolldown), so this is only needed when the pinned Valdi fork/toolchain or module C++ changes.
# Builtin modules use the local Node backend by default; compiler changes also require a new export.
# The old Swift Valdi compiler and its fallback have been removed.
# Usage: scripts/maintainer/export-android.sh [debug|release] [output dir, default android/app/libs]
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
config=${1:-debug}
out=${2:-$root/android/app/libs}
mkdir -p "$out"
out=$(cd "$out" && pwd)
case "$(uname -s)" in
  Darwin)
    export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}
    export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
    ;;
esac
# Runtime-linked C++ dependencies are prepared only by this explicit export, before any Bazel work.
# Fetch pinned declarations and generate the native bindings used by this explicit export.
node "$root/scripts/lib/prepare-valdi.mjs"
node "$root/scripts/lib/native-dependencies.mjs" prepare-runtime android
(cd "$root/tools/valdi-rolldown" && pnpm exec tsx codegen.ts --kotlin-out ../../android/app/generated/valdi --cpp-modules-out ../../valdi/modules)
cd "$root/valdi"
# valdi export always builds arm32/arm64/x86_64 (an extra --android_platforms adds to the list instead of
# replacing it); the app's abiFilters keeps only arm64 in the APK.
# The project's Valdi CLI (valdi/package.json, patched in valdi/patches); `pnpm install` in valdi/ installs it.
pnpm exec valdi export android \
  --library //:valdi_runtime_android \
  --build_config "$config" \
  --bazel_args="${VALDI_BAZEL_ARGS:-}" \
  --output_path "$out/valdi_runtime.aar"

# What earlier versions of this script left here: the aar with app_pages in it, and the modules' resources.
rm -rf "$out/valdi_pages.aar" "$out/valdi_res" "$out/valdi_exported"

# Platform/build configuration is needed for OTA release metadata, without source fingerprints.
node "$root/scripts/maintainer/runtime-info.mjs" android "$config" >"$out/valdi_ota.json"
