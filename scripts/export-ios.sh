#!/bin/sh
# Rebuild the Valdi runtime into ios/Frameworks/ValdiRuntime.xcframework: the runtime, Valdi's own modules (valdi_core,
# valdi_tsx, client_sql) and the app's C++ (valdi/native: @ExportModule implementations and their bindings). app_pages
# and the npm packages are built by the app's Xcode build (tools/valdi-rolldown), its Objective-C bindings are
# ios/Generated/valdi, so this is only needed when the pinned Valdi fork/toolchain or valdi/native changes.
# Builtin modules use the local Node backend by default; compiler changes also require a new export.
# The old Swift Valdi compiler and its fallback have been removed.
# Usage: scripts/export-ios.sh [debug|release] [output dir, default ios/Frameworks]
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
config=${1:-debug}
out=${2:-$root/ios/Frameworks}
mkdir -p "$out"
out=$(cd "$out" && pwd)
export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}
# First checkout: fetch the pinned Valdi declarations before checking the app's C++ bindings.
node "$root/scripts/prepare-valdi.mjs"
# The C++ bindings must be current: they're compiled into the runtime here.
(cd "$root/tools/valdi-rolldown" && pnpm exec tsx codegen.ts --cpp-out ../../valdi/native/generated --check)
cd "$root/valdi"
# The project's Valdi CLI (valdi/package.json, patched in valdi/patches); `pnpm install` in valdi/ installs it.
pnpm exec valdi export ios \
  --library //:valdi_runtime_ios \
  --build_config "$config" \
  --bazel_args="${VALDI_BAZEL_ARGS:-}" \
  --output_path "$out/ValdiRuntime.xcframework"
# What earlier versions of this script exported: the framework with app_pages in it.
rm -rf "$out/ValdiPages.xcframework"

# The Valdi half of the over-the-air fingerprint (toolchain, valdi/native, generated bindings) and valdi/native's own
# hash, which the app's build checks this export against; the app's build adds the native half (ios/project.yml).
node "$root/scripts/ota.mjs" valdi-hash ios "$config" >"$out/valdi_ota.json"
