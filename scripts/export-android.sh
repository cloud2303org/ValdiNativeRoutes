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
case "$(uname -s)" in
  Darwin)
    export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}
    export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
    ;;
  MINGW*|CYGWIN*|MSYS*)
    if [ -z "${JAVA_HOME:-}" ]; then
      java_command=$(command -v javac.exe || command -v java.exe)
      if [ -n "$java_command" ]; then
        java_bin=$(cd "$(dirname "$java_command")" && pwd -W 2>/dev/null || pwd)
        export JAVA_HOME=$(dirname "$java_bin")
      fi
    fi
    export ANDROID_HOME=${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}
    ;;
esac
# First checkout: fetch the pinned Valdi declarations before checking the app's C++ bindings.
node "$root/scripts/prepare-valdi.mjs"
# The C++ bindings must be current: they're compiled into the runtime here.
(cd "$root/tools/valdi-rolldown" && pnpm exec tsx codegen.ts --cpp-out ../../valdi/native/generated --check)
cd "$root/valdi"
# valdi export always builds arm32/arm64/x86_64 (an extra --android_platforms adds to the list instead of
# replacing it); the app's abiFilters keeps only arm64 in the APK.
# The project's Valdi CLI (valdi/package.json, patched in valdi/patches); `pnpm install` in valdi/ installs it.
case "$(uname -s)" in
  MINGW*|CYGWIN*|MSYS*)
    # The Valdi CLI passes single-quoted cquery expressions through cmd.exe,
    # which strips the wrong quotes. Build the one documented target directly.
    bazel_bin=${BAZEL_BIN:-bazel}
    if [ "$config" = release ]; then
      config_flags="--snap_flavor=production -c opt"
    else
      config_flags="--snap_flavor=platform_development"
    fi
    # shellcheck disable=SC2086
    # --max_idle_secs keeps the server from outliving this script with an inherited stdout.
    "$bazel_bin" ${VALDI_BAZEL_STARTUP_ARGS:-} --max_idle_secs=60 build //:valdi_runtime_android \
      $config_flags \
      --config=stable_exec \
      --copt=-DANDROID_WITH_JNI \
      --repo_env=VALDI_PLATFORM_DEPENDENCIES=android \
      --define client_repo_arm32=true \
      --define client_repo_arm64=true \
      --define client_repo_x86_64=true \
      "--android_platforms=@snap_platforms//os:android_arm32,@snap_platforms//os:android_arm64,@snap_platforms//os:android_x86_64" \
      ${VALDI_BAZEL_ARGS:-}
    # Bazel outputs are read-only; replace an existing export instead of
    # inheriting that attribute on Windows.
    cp -f "$root/valdi/bazel-bin/valdi_runtime_android.aar" "$out/valdi_runtime.aar"
    ;;
  *)
    pnpm exec valdi export android \
      --library //:valdi_runtime_android \
      --build_config "$config" \
      --bazel_args="${VALDI_BAZEL_ARGS:-}" \
      --output_path "$out/valdi_runtime.aar"
    ;;
esac

# What earlier versions of this script left here: the aar with app_pages in it, and the modules' resources.
rm -rf "$out/valdi_pages.aar" "$out/valdi_res" "$out/valdi_exported"

# The Valdi half of the over-the-air fingerprint (toolchain, valdi/native, generated bindings) and valdi/native's own
# hash, which the app's build checks this export against; the app's Gradle build adds the native half
# (ota/fingerprint.json).
node "$root/scripts/ota.mjs" valdi-hash android "$config" >"$out/valdi_ota.json"
