#!/bin/sh
# Build a signed over-the-air package of the Valdi modules for the iOS binaries of an app version (CFBundleShortVersionString).
# Their release build recorded their native side (ota/releases/ios/<app version>.json); packing fails when this tree's
# differs (scripts/ota.mjs).
# Usage: scripts/ota-pack-ios.sh <app version> <version>   → ota/dist/ios/<app version>/{latest.json,<version>/}
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
[ $# -eq 2 ] || { echo "usage: $0 <app version> <version>" >&2; exit 2; }
node "$root/scripts/ota.mjs" pack ios "$1" "$2"
