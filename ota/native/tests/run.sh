#!/bin/sh
set -eu
native_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_dir=${1:-/tmp/valdi-ota-codec-host}
cmake -S "$native_dir" -B "$build_dir" -DCMAKE_BUILD_TYPE=Release -DVALDI_OTA_BUILD_HOST_TESTS=ON
cmake --build "$build_dir" --parallel 4
ctest --test-dir "$build_dir" --output-on-failure -V
