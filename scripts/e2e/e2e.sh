#!/bin/sh
# Run the Argent e2e tests in .argent/e2e on the iOS simulator, then on the Android emulator. Each test launches the
# installed app itself; nothing is built or installed here.
# Usage: scripts/e2e/e2e.sh [ios|android] [test name or YAML path]
# IOS_DEVICE / ANDROID_DEVICE name the devices (only these are used).
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
app_id=$(node scripts/lib/app-config.mjs read androidId)
ios=${IOS_DEVICE:-$(xcrun simctl list devices booted 2>/dev/null | sed -n 's/.*(\([0-9A-F-]\{36\}\)) (Booted).*/\1/p' | head -n 1)}
android=${ANDROID_DEVICE:-$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { print $1; exit }')}
platform_arg=${1:-all}
if [ "$#" -gt 0 ]; then shift; fi
case $platform_arg in
  all) platforms="ios android" ;;
  ios | android) platforms=$platform_arg ;;
  *) echo "usage: $0 [ios|android] [test name or YAML path]" >&2; exit 2 ;;
esac
if [ "${1:-}" = -- ]; then shift; fi
test_path=${1:-.argent/e2e}
if [ "$#" -gt 0 ]; then shift; fi
status=0
for platform in $platforms; do
  if [ "$platform" = ios ]; then
    device=$ios
    if [ -z "$device" ]; then echo "No booted iOS simulator found; set IOS_DEVICE" >&2; exit 1; fi
    # Apps load UIKit's accessibility runtime only when asked to; without it a UILabel (Valdi's SCValdiLabel) has no
    # accessibilityLabel, which is where Argent's iOS runner reads text. Takes effect at the tests' app launch.
    xcrun simctl spawn "$device" defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true
  else
    device=$android
    if [ -z "$device" ]; then echo "No connected Android device found; set ANDROID_DEVICE" >&2; exit 1; fi
    # Grant the runtime permissions up front: a system permission dialog (Bluetooth, Wi-Fi, camera) would cover the
    # app for every later test. A permission the system doesn't know or doesn't ask for is skipped.
    for permission in $(adb -s "$device" shell dumpsys package "$app_id" |
      sed -n 's/^ *\(android\.permission\.[A-Z_]*\): granted=false.*/\1/p'); do
      adb -s "$device" shell pm grant "$app_id" "$permission" 2>/dev/null || true
    done
    # A photo for the photo picker test (presentation-choose-photos), in the media store.
    if ! adb -s "$device" shell content query --uri content://media/external/images/media --projection _display_name |
      grep -q e2e-photo.jpg; then
      adb -s "$device" push .argent/fixtures/e2e-photo.jpg /sdcard/Pictures/e2e-photo.jpg >/dev/null
      adb -s "$device" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
        -d file:///sdcard/Pictures/e2e-photo.jpg >/dev/null
    fi
  fi
  echo "== $platform: $device"
  configured_test=$(node scripts/e2e/e2e-config.mjs "$platform" "$test_path")
  argent e2e run "$configured_test" --device "$device" "$@" || status=1
done
exit $status
