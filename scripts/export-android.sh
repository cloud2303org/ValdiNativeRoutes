#!/bin/sh
# Rebuild the Valdi pages into android/app/libs/valdi_pages.aar.
# Usage: scripts/export-android.sh [debug|release]
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
config=${1:-debug}
export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
cd "$root/valdi"
# valdi export always builds arm32/arm64/x86_64 (an extra --android_platforms adds to the list instead of
# replacing it); the app's abiFilters keeps only arm64 in the APK.
valdi export android \
  --library //:valdi_pages_android \
  --build_config "$config" \
  --output_path "$root/android/app/libs/valdi_pages.aar"
