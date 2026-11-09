#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
frameworks="$root/ios/Frameworks/ValdiRuntime.xcframework/ios-arm64_x86_64-simulator"
modules="$root/module-build/out/ios"
if [ ! -f "$modules/swift/ThemeBridge.swiftmodule" ] || [ ! -f "$modules/theme_bridge/libtheme_bridge_ios.a" ]; then
    echo "Prepare the iOS modules first: node scripts/node-modules.mjs ios" >&2
    exit 1
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/valdi-theme-access.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
output=${THEME_ACCESS_TEST_OUTPUT:-"$work/ThemeTokensAccessTests"}
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
SDKROOT="$sdk" xcrun --sdk iphonesimulator swiftc -parse-as-library -module-name ThemeTokensHostConsumer \
    -target arm64-apple-ios16.0-simulator -sdk "$sdk" \
    -I "$modules/swift" -I "$modules/include" \
    -F "$frameworks" -framework ValdiRuntime \
    -Xcc "-fmodule-map-file=$frameworks/ValdiRuntime.framework/Modules/module.modulemap" \
    -Xlinker -force_load -Xlinker "$modules/theme_bridge/libtheme_bridge_ios.a" \
    "$root/ios/Tests/ThemeTokensAccessTests.swift" -o "$output"
cat > "$work/InvalidThemeConsumer.swift" <<'EOF'
import ThemeBridge
let invalid: Double = ThemeTokensStore.shared.tokens.light.surface
EOF
if SDKROOT="$sdk" xcrun --sdk iphonesimulator swiftc -typecheck \
    -target arm64-apple-ios16.0-simulator -sdk "$sdk" \
    -I "$modules/swift" -I "$modules/include" -F "$frameworks" \
    -Xcc "-fmodule-map-file=$frameworks/ValdiRuntime.framework/Modules/module.modulemap" \
    "$work/InvalidThemeConsumer.swift" > "$work/invalid.log" 2>&1; then
    echo "Invalid Swift token field type unexpectedly compiled." >&2
    exit 1
fi
python3 - "$work/invalid.log" <<'PY'
import sys
from pathlib import Path
error = Path(sys.argv[1]).read_text()
if "String" not in error or "Double" not in error:
    raise SystemExit(error)
PY
echo "ThemeBridge public access compiled and linked from an independent iOS Simulator module."
echo "The Swift compiler rejected a mismatched token field type."
