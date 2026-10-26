#!/bin/sh
# Hot reload the Valdi pages into the running debug app (emulator or device over adb).
# The app must be a debug build of the exported aar; it listens on port 13592.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
cd "$root/valdi"
exec valdi hotreload --target //modules/app_pages:app_pages_hotreload
