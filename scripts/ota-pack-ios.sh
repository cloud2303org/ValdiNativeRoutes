#!/bin/sh
# Build a signed over-the-air package of the Valdi modules for the iOS binaries of an app version (CFBundleShortVersionString).
# The publisher chooses the target app version and manages native API compatibility.
# Usage: scripts/ota-pack-ios.sh <app version> <version> [--base <package dir|archive> [--base-version <version>]] → ota/dist/ios/<app version>/{latest.json,<version>/}
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
[ $# -ge 2 ] || { echo "usage: $0 <app version> <version> [--base <package dir|old.valdimodule> [--base-version <version>]]" >&2; exit 2; }
node "$root/scripts/ota.mjs" pack ios "$@"
