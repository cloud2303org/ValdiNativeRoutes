#!/bin/sh
# Rebuild the Valdi runtime into android/app/libs/valdi_runtime.aar: libvaldi_runtime.so, Valdi's Kotlin and its own
# modules (valdi_core, valdi_tsx, client_sql), and the app's C++ (valdi/native: @ExportModule implementations and their
# bindings), linked into the runtime. app_pages and the npm packages are built by the app's Gradle build
# (tools/valdi-rolldown), so this is only needed when the pinned Valdi fork/toolchain or valdi/native changes.
# Builtin modules use the local Node backend by default; compiler changes also require a new export.
# The old Swift Valdi compiler and its fallback have been removed.
# Usage: scripts/export-android.sh [debug|release] [output dir, default android/app/libs]
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
config=${1:-debug}
out=${2:-$root/android/app/libs}
mkdir -p "$out"
out=$(cd "$out" && pwd)
export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
# First checkout: fetch the pinned Valdi declarations before checking the app's C++ bindings.
node "$root/scripts/prepare-valdi.mjs"
# The C++ bindings must be current: they're compiled into the runtime here.
(cd "$root/tools/valdi-rolldown" && pnpm exec tsx codegen.ts --cpp-out ../../valdi/native/generated --check)
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

# The Valdi half of the over-the-air fingerprint (toolchain, valdi/native, generated bindings) and valdi/native's own
# hash, which the app's build checks this export against; the app's Gradle build adds the native half
# (ota/fingerprint.json).
node "$root/scripts/ota.mjs" valdi-hash android "$config" >"$out/valdi_ota.json"
