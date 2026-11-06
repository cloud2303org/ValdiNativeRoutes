#!/bin/sh
set -eu
ios_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/valdi-route-payload.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
xcrun swiftc "$ios_dir/ValdiRoutes/Navigation/RoutePayload.swift" "$ios_dir/Tests/RoutePayloadTests.swift" \
  -o "$test_dir/RoutePayloadTests"
"$test_dir/RoutePayloadTests"
