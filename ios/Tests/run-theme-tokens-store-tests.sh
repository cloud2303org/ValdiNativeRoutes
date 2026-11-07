#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/valdi-theme-store.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
xcrun swiftc -parse-as-library \
    "$root/valdi/modules/theme_bridge/ios/ThemeTokensStore.swift" \
    "$root/ios/Tests/ThemeTokensStoreTests.swift" -o "$work/ThemeTokensStoreTests"
for scenario in valid malformed wrong-type missing-field missing-file; do
    case "$scenario" in
        valid) cp "$root/valdi/modules/theme_bridge/assets/tokens.json" "$work/tokens.json" ;;
        malformed) printf '{' > "$work/tokens.json" ;;
        wrong-type) printf '{"light":{"surface":1},"dark":{},"shared":{}}' > "$work/tokens.json" ;;
        missing-field) printf '{"light":{},"dark":{}}' > "$work/tokens.json" ;;
        missing-file) rm -f "$work/tokens.json" ;;
    esac
    "$work/ThemeTokensStoreTests" "$scenario"
done
