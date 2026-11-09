#!/bin/sh
# Rebuild the Valdi runtime into ios/Frameworks/ValdiRuntime.xcframework: the runtime, Valdi's own modules (valdi_core,
# native_web, valdi_tsx) and the app's module-owned C++ (@ExportModule implementations and their bindings). app_pages
# and the npm packages are built by the app's Xcode build (tools/valdi-rolldown), its Objective-C bindings are
# ios/Generated/valdi, so this is only needed when the pinned Valdi fork/toolchain or module C++ changes.
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
# Runtime-linked C++ dependencies are prepared only by this explicit export, before any Bazel work.
# Fetch pinned declarations and generate the native bindings used by this explicit export.
node "$root/scripts/prepare-valdi.mjs"
node "$root/scripts/native-dependencies.mjs" prepare-runtime ios
(cd "$root/tools/valdi-rolldown" && pnpm exec tsx codegen.ts --objc-out ../../ios/Generated/valdi --objc-framework ValdiRuntime --cpp-modules-out ../../valdi/modules)
cd "$root/valdi"
# The project's Valdi CLI (valdi/package.json, patched in valdi/patches); `pnpm install` in valdi/ installs it.
pnpm exec valdi export ios \
  --library //:valdi_runtime_ios \
  --build_config "$config" \
  --bazel_args="${VALDI_BAZEL_ARGS:-}" \
  --output_path "$out/ValdiRuntime.xcframework"
node "$root/scripts/package-swift-runtime.mjs" "$out/ValdiRuntime.xcframework"
# What earlier versions of this script exported: the framework with app_pages in it.
rm -rf "$out/ValdiPages.xcframework"

# Platform/build configuration is needed for OTA release metadata, without source fingerprints.
node "$root/scripts/runtime-info.mjs" ios "$config" >"$out/valdi_ota.json"
