#!/bin/sh
set -eu
ios_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/valdi-startup-splash-state.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
xcrun swiftc "$ios_dir/ValdiRoutes/Startup/StartupSplashState.swift" \
  "$ios_dir/Tests/StartupSplashStateTests.swift" \
  -o "$test_dir/StartupSplashStateTests"
"$test_dir/StartupSplashStateTests"
