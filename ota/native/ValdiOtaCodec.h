#ifndef VALDI_OTA_CODEC_H
#define VALDI_OTA_CODEC_H

#include <stdint.h>

#if defined(VR_OTA_SHARED) && (defined(__GNUC__) || defined(__clang__))
#define VR_OTA_API __attribute__((visibility("default")))
#else
#define VR_OTA_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

/*
 * 0 = success; nonzero = reject/error (clients must fall back to the full file).
 * Inputs must be regular files <=64 MiB. Limits must be <=64 MiB.
 * Outputs are created exclusively (0600), never overwritten, and removed on
 * failure. Call in a private work directory, never against the active snapshot.
 * Decode accepts exactly one standard, dictionary-free ZSTD frame; its window
 * is capped at 64 MiB. Encode is ZSTD 1.5.7 default level 3, with the 16 KiB
 * output chunks used by the publisher's default Node zstdCompressSync call.
 * HDIFFSF20/zlib uses exact expected_size, <=32 MiB step memory and <=64 MiB
 * uncompressed patch instructions. Empty results are valid with a zero limit.
 * No authentication is performed here: clients verify all signed sizes/hashes,
 * including the final compressed bytes, before promoting a snapshot.
 */
VR_OTA_API int vr_ota_zstd_decode(const char *input, const char *output, uint64_t max_output);
VR_OTA_API int vr_ota_zstd_encode(const char *input, const char *output, uint64_t max_output);
VR_OTA_API int vr_ota_hdiff_patch(const char *old_file, const char *patch_file,
                                 const char *output, uint64_t expected_size);

#ifdef __cplusplus
}
#endif

#endif
