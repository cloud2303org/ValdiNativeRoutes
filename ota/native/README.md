# Valdi OTA file codecs

`ValdiOtaCodec.h` is the entire client API. All three functions return `0` on
success and nonzero on any error. This core is C99 and depends only on libc,
POSIX file operations, and system zlib. Valdi, Hermes, JNI, Swift, C++, STL and
the JavaScript runtime are not dependencies.

```c
int vr_ota_zstd_decode(const char *input, const char *output, uint64_t max_output);
int vr_ota_zstd_encode(const char *input, const char *output, uint64_t max_output);
int vr_ota_hdiff_patch(const char *old_file, const char *patch_file,
                       const char *output, uint64_t expected_size);
```

Inputs must be regular files no larger than 64 MiB. Caller limits above 64 MiB
are rejected, including negative signed values converted to `uint64_t`.
Decode/patch allow empty output; encode requires enough room for the ZSTD frame.
The core creates output with `O_EXCL` and mode `0600`, rejects existing files,
directories and dangling symlinks, and removes its own output after any failure.
Use a private, fresh work directory. Inputs and the work directory must remain
stable for the duration of a call.

Decode accepts exactly one standard, dictionary-free ZSTD frame. It rejects
skippable frames, concatenated frames, truncated data, trailing bytes, a window
above 64 MiB, oversized declared content and actual output above `max_output`.
Streaming output uses two 64 KiB I/O buffers plus the bounded decoder window.

Encode uses pinned ZSTD **1.5.7**, default level **3**, single threaded.
It calls `ZSTD_compressStream2(..., ZSTD_e_end)` with the entire input available
and a **16 KiB output buffer**, matching the publisher's default Node
`zstdCompressSync` call. The output buffer size affects compressed bytes:
`ZSTD_compress()` and a larger streaming output buffer produced different bytes
for the existing release `app_pages.valdimodule` during host validation.
Input storage is capped at 64 MiB, plus 16 KiB output and the default compression
context. Neither dictionaries nor custom levels are selected.

Patch accepts **HDIFFSF20 / zlib** only, with exact old and new sizes. It also
handles the format's uncompressed payload when HDiff elects not to compress.
Patch file and uncompressed instructions are each limited to 64 MiB,
cover count is bounded by target length plus one, and step memory is limited
to **32 MiB**, plus a fixed **1 MiB** scratch cache. The zlib plugin uses a
32 KiB input buffer and accepts only bounded raw-deflate/zlib windows.
Both the HDiff envelope and embedded deflate stream must be consumed exactly;
end markers, missing bytes and trailing bytes are checked. Multithreading and
upstream assertions are disabled for the vendored decoder, including Debug
builds; malformed input returns an error rather than aborting.

The core does not parse split manifests, archive paths, Valdi packets or Hermes
envelopes. Clients authenticate all downloaded inputs and verify every entry's
exact size/hash, packet hash/size, and final compressed archive hash/size.
Successful recompression does not imply byte equality on every platform or
toolchain. A final hash mismatch is a delta failure: discard the work directory
and download the original signed full artifact. No active snapshot is patched.

## Parent build

```cmake
add_subdirectory(path/to/ota/native valdi-ota-native)
target_link_libraries(your_platform_wrapper PRIVATE valdi_ota_core)
```

`valdi_ota_core` is a static archive containing the codec and vendored objects.
All objects use PIC and hidden visibility; no ZSTD/HDiff symbols are exported.
Only its own targets receive compile definitions/options. System zlib is a
transitive link dependency (`z` on Android; `ZLIB::ZLIB` elsewhere).
The public include directory provides `ValdiOtaCodec.h`.

Host tests default off when used as a subdirectory. Platform JNI, Swift bridging,
platform library loading and full-package fallback remain the parent/client
integration's responsibility.

## Isolated host tests

No downloads, dependency installation, app builds or device access are needed.
Use a local HDiffPatch `hdiffz` via `VALDI_HDIFFZ` or `PATH`.

```sh
VALDI_HDIFFZ=/absolute/path/to/hdiffz \
VR_OTA_TEST_MODULE=/absolute/path/to/current/app_pages.valdimodule \
sh ota/native/tests/run.sh /tmp/valdi-ota-codec-host
```

This creates:

- `libvaldi_ota_core.a`
- `libvaldi_ota_codec_host.dylib` (macOS) or `.so` (Linux), exporting only the
  three shared C entry points
- `valdi_ota_zstd_reference`, a test-only pinned default encoder

The Python standard-library suite creates real `hdiffz` fixtures with
`-SD -s-64 -c-zlib-6 -p-1` and covers recovery, every truncated fixture prefix,
inner/outer trailing bytes, invalid headers, window/step/size limits, empty and
incompressible data, file aliases/symlinks, concurrent exclusive creation, kernel
short writes, FIFO rejection, deterministic mutations, and exact current-module
recompression. Set `VR_OTA_TEST_MODULE` to enable the actual module comparison;
without it that optional comparison is explicitly skipped.

Configure `-DVALDI_OTA_SANITIZE=ON` in an isolated host build for ASan/UBSan.
That configuration also needs the installed Python embedding headers/library.
It builds a small ASan-linked Python launcher for CTest, so the runtime loads
before the shared codec. This avoids relying on `DYLD_INSERT_LIBRARIES`, which
some macOS Python launchers strip. Host validation used
`ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1`; leak reporting for the
embedded, uninstrumented Python runtime was disabled.

## Vendored source provenance

All vendor copies are from existing local checkouts; no sources were downloaded.
`vendor/SOURCES.json` records original paths and SHA256 digests for every copied
source and the RFU/plugin sources adapted into `ValdiOtaHdiff.c`.

- `vendor/hdiffpatch`: unmodified C decoder subset of local HDiffPatch **5.1.3**
  from `ExpoNativeRoutes/packages/fast-update/vendor/hdiffpatch`. Its existing
  `VERSION.json`, source MIT notices and `LICENSE` are retained. No diff generator,
  file wrapper, directory patching implementation or multithread implementation
  is included.
- `ValdiOtaHdiff.c`: adapts the checks/call sequence from local
  `fast-update/cpp/RFUPatch.c`, and the saved-window zlib protocol from
  `decompress_plugin_demo.h`, with exclusive file streams and stricter bounds
  and stream-finalization checks. The MIT notice is retained in the source;
  `vendor/RFU-LICENSE` retains the source checkout's MIT license.
- `vendor/zstd`: unmodified common/compression/decompression C subset from pinned
  `valdi/.valdi-sources/external/zstd+/lib`, version **1.5.7**. BSD `LICENSE` and
  dual-license `COPYING` are retained. Dictionary builders, legacy decoders,
  command-line tools, assembly and multithread implementations are omitted.
