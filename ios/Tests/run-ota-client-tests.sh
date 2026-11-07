#!/bin/sh
set -eu
ios_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/valdi-ota-client.XXXXXX")
evidence=${OTA_TEST_OUTPUT:-"$test_dir/evidence"}
mkdir -p "$evidence"
fixture_pid=
cleanup() {
    if [ -n "$fixture_pid" ]; then kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true; fi
    rm -rf "$test_dir"
}
trap cleanup EXIT HUP INT TERM
if [ "${OTA_TEST_WITHOUT_CODEC:-0}" != 1 ] && [ -z "${VALDI_HDIFFZ:-}" ]; then
    if [ -x "$ios_dir/../ota/tools/hdiffz" ]; then
        VALDI_HDIFFZ="$ios_dir/../ota/tools/hdiffz"
    else
        VALDI_HDIFFZ=$(command -v hdiffz || true)
    fi
fi
if [ "${OTA_TEST_WITHOUT_CODEC:-0}" != 1 ] && [ ! -x "${VALDI_HDIFFZ:-}" ]; then
    echo "Set VALDI_HDIFFZ to a local hdiffz, install ota/tools/hdiffz, or add hdiffz to PATH. No downloads." >&2
    exit 1
fi
export VALDI_HDIFFZ
mkdir -p "$test_dir/http"
python3 "$ios_dir/Tests/ota-client-fixture.py" "$test_dir/http" >"$evidence/fixture.log" 2>&1 &
fixture_pid=$!
for attempt in $(seq 1 100); do
    [ -f "$test_dir/http/port" ] && break
    kill -0 "$fixture_pid"
    sleep 0.05
done
port=$(cat "$test_dir/http/port")
if [ "${OTA_TEST_WITHOUT_CODEC:-0}" = 1 ]; then
    set -- -D VALDI_OTA_NO_CODEC
else
    core_build=${OTA_TEST_CORE_BUILD:-"$test_dir/core"}
    cmake -S "$ios_dir/../ota/native" -B "$core_build" \
        -DCMAKE_BUILD_TYPE=Release -DVALDI_OTA_BUILD_HOST_TESTS=OFF >"$evidence/core-build.log" 2>&1
    cmake --build "$core_build" --parallel 4 >>"$evidence/core-build.log" 2>&1
    shasum -a 256 "$ios_dir/../ota/native/ValdiOtaCodec.h" "$core_build/libvaldi_ota_core.a" >"$evidence/codec-inputs.sha256"
    set -- -import-objc-header "$ios_dir/../ota/native/ValdiOtaCodec.h" "$core_build/libvaldi_ota_core.a" -lz
fi
xcrun swiftc -warnings-as-errors -parse-as-library "$@" \
    "$ios_dir/ValdiRoutes/Ota/ValdiOtaDownloader.swift" \
    "$ios_dir/ValdiRoutes/Ota/ValdiOtaSplit.swift" \
    "$ios_dir/ValdiRoutes/Ota/ValdiOtaClient.swift" \
    "$ios_dir/Tests/ValdiOtaClientTests.swift" \
    -o "$test_dir/ValdiOtaClientTests"
if [ "${OTA_TEST_WITHOUT_CODEC:-0}" = 1 ]; then
    nm -u "$test_dir/ValdiOtaClientTests" >"$evidence/undefined-symbols.txt"
    if rg 'vr_ota_' "$evidence/undefined-symbols.txt"; then
        echo "Codec-free binary unexpectedly refers to native codec symbols" >&2
        exit 1
    fi
    OTA_TEST_FILTER="codec absent build" "$test_dir/ValdiOtaClientTests" "$test_dir/http" "http://127.0.0.1:$port" "$evidence"
else
    "$test_dir/ValdiOtaClientTests" "$test_dir/http" "http://127.0.0.1:$port" "$evidence"
fi
