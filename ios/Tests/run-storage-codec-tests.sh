#!/bin/sh
set -eu
ios_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/valdi-storage-codec.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
xcrun swiftc "$ios_dir/../valdi/modules/mmkv/ios/StorageCodec.swift" "$ios_dir/Tests/StorageCodecTests.swift" -o "$test_dir/StorageCodecTests"
"$test_dir/StorageCodecTests"
