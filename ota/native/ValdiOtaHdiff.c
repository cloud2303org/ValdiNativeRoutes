/*
 * Adapted from ExpoNativeRoutes/packages/fast-update/cpp/RFUPatch.c and
 * HDiffPatch 5.1.3 decompress_plugin_demo.h (zlib decoder).
 * The MIT License (MIT), Copyright (c) 2012-2017 HouSisong.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to
 * do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE. See also vendor/RFU-LICENSE and vendor/hdiffpatch/LICENSE.
 */
#include "ValdiOtaCodec.h"
#include "CodecIO.h"
#include "vendor/hdiffpatch/libHDiffPatch/HPatch/patch.h"
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <zlib.h>

typedef struct {
    hpatch_TStreamInput stream;
    int fd;
} PatchInput;

typedef struct {
    hpatch_TStreamOutput stream;
    int fd;
    uint64_t written;
} PatchOutput;

static hpatch_BOOL patch_read(const hpatch_TStreamInput *stream, hpatch_StreamPos_t pos,
                              unsigned char *data, unsigned char *end) {
    PatchInput *input = (PatchInput *)stream->streamImport;
    size_t size = (size_t)(end - data);
    if (pos > stream->streamSize || size > stream->streamSize - pos) return hpatch_FALSE;
    return !vr_ota_read_at(input->fd, pos, data, size);
}

static hpatch_BOOL patch_write(const hpatch_TStreamOutput *stream, hpatch_StreamPos_t pos,
                               const unsigned char *data, const unsigned char *end) {
    PatchOutput *output = (PatchOutput *)stream->streamImport;
    size_t size = (size_t)(end - data);
    if (pos != output->written || pos > stream->streamSize ||
        size > stream->streamSize - pos || vr_ota_write_all(output->fd, data, size)) return hpatch_FALSE;
    output->written += size;
    return hpatch_TRUE;
}

typedef struct {
    z_stream z;
    const hpatch_TStreamInput *input;
    hpatch_StreamPos_t position, end, remaining;
    int ended, failed;
    unsigned char buffer[32 * 1024];
} PatchZlib;

static hpatch_BOOL zlib_can_open(const char *type) {
    return !strcmp(type, "zlib");
}

static hpatch_decompressHandle zlib_open(hpatch_TDecompress *plugin, hpatch_StreamPos_t size,
                                         const hpatch_TStreamInput *input,
                                         hpatch_StreamPos_t begin, hpatch_StreamPos_t end) {
    signed char window;
    PatchZlib *state;
    (void)plugin;
    if (begin >= end || end > input->streamSize || size > VR_OTA_LIMIT ||
        !input->read(input, begin, (unsigned char *)&window, (unsigned char *)&window + 1))
        return NULL;
    /* The first byte is HDiff's saved zlib windowBits. No gzip/auto detection. */
    if (!((window >= -15 && window <= -8) || (window >= 8 && window <= 15))) return NULL;
    state = (PatchZlib *)calloc(1, sizeof(*state));
    if (!state) return NULL;
    state->input = input;
    state->position = begin + 1;
    state->end = end;
    state->remaining = size;
    if (inflateInit2(&state->z, window) != Z_OK) {
        free(state);
        return NULL;
    }
    return state;
}

static int zlib_step(PatchZlib *state) {
    uInt before_in, before_out;
    int result;
    if (!state->z.avail_in && state->position < state->end) {
        size_t count = state->end - state->position < sizeof(state->buffer)
            ? (size_t)(state->end - state->position) : sizeof(state->buffer);
        if (!state->input->read(state->input, state->position, state->buffer,
                                state->buffer + count)) return 1;
        state->position += count;
        state->z.next_in = state->buffer;
        state->z.avail_in = (uInt)count;
    }
    before_in = state->z.avail_in;
    before_out = state->z.avail_out;
    result = inflate(&state->z, Z_NO_FLUSH);
    if (result == Z_STREAM_END) {
        state->ended = 1;
        return 0;
    }
    return result != Z_OK ||
        (before_in == state->z.avail_in && before_out == state->z.avail_out);
}

static hpatch_BOOL zlib_part(hpatch_decompressHandle handle, unsigned char *data,
                             unsigned char *end) {
    PatchZlib *state = (PatchZlib *)handle;
    size_t size = (size_t)(end - data);
    if (size > state->remaining || size > UINT32_MAX) goto error;
    state->z.next_out = data;
    state->z.avail_out = (uInt)size;
    while (state->z.avail_out) {
        if (state->ended || zlib_step(state)) goto error;
    }
    state->remaining -= size;
    return hpatch_TRUE;
error:
    state->failed = 1;
    return hpatch_FALSE;
}

static hpatch_BOOL zlib_close(hpatch_TDecompress *plugin, hpatch_decompressHandle handle) {
    PatchZlib *state = (PatchZlib *)handle;
    unsigned char extra;
    int result = !state->failed && !state->remaining;
    /* End markers may be unread after the final requested output byte. */
    while (result && !state->ended) {
        state->z.next_out = &extra;
        state->z.avail_out = 1;
        if (zlib_step(state) || state->z.avail_out != 1) result = 0;
    }
    if (state->position != state->end || state->z.avail_in) result = 0;
    if (inflateEnd(&state->z) != Z_OK) result = 0;
    free(state);
    /* Upstream's single-stream path ignores close's return; check decError. */
    if (!result) plugin->decError = hpatch_dec_close_error;
    return (hpatch_BOOL)result;
}

int vr_ota_hdiff_patch(const char *old_file, const char *patch_file, const char *output,
                       uint64_t expected_size) {
    PatchInput old = {0}, diff = {0};
    PatchOutput target = {0};
    hpatch_singleCompressedDiffInfo info;
    hpatch_TDecompress plugin = {zlib_can_open, zlib_open, zlib_close, zlib_part, NULL,
                                hpatch_dec_ok, 1};
    unsigned char *cache = NULL;
    uint64_t old_size = 0, diff_size = 0, payload_size;
    size_t cache_size;
    int result = 1;
    old.fd = diff.fd = target.fd = -1;
    if (!output || expected_size > VR_OTA_LIMIT) return 1;
    old.fd = vr_ota_open_input(old_file, &old_size);
    diff.fd = vr_ota_open_input(patch_file, &diff_size);
    if (old.fd < 0 || diff.fd < 0) goto done;
    old.stream.streamImport = &old;
    old.stream.streamSize = old_size;
    old.stream.read = patch_read;
    diff.stream.streamImport = &diff;
    diff.stream.streamSize = diff_size;
    diff.stream.read = patch_read;
    if (!getSingleCompressedDiffInfo(&info, &diff.stream, 0) ||
        strcmp(info.compressType, "zlib") || info.oldDataSize != old_size ||
        info.newDataSize != expected_size || info.stepMemSize > VR_OTA_STEP_LIMIT ||
        info.uncompressedSize > VR_OTA_LIMIT || info.coverCount > expected_size + 1 ||
        info.diffDataPos > diff_size) goto done;
    payload_size = info.compressedSize ? info.compressedSize : info.uncompressedSize;
    /* Subtract before comparing, avoiding overflow and rejecting trailing data. */
    if (payload_size != diff_size - info.diffDataPos) goto done;
    cache_size = (size_t)info.stepMemSize + 1024 * 1024;
    cache = (unsigned char *)malloc(cache_size);
    if (!cache) goto done;
    target.fd = vr_ota_open_output(output);
    if (target.fd < 0) goto done;
    target.stream.streamImport = &target;
    target.stream.streamSize = expected_size;
    target.stream.write = patch_write;
    if (patch_single_compressed_diff(&target.stream, &old.stream, &diff.stream,
            info.diffDataPos, info.uncompressedSize, info.compressedSize, &plugin,
            info.coverCount, (hpatch_size_t)info.stepMemSize, cache, cache + cache_size, NULL, 1) &&
        plugin.decError == hpatch_dec_ok && target.written == expected_size) result = 0;
done:
    free(cache);
    if (old.fd >= 0 && close(old.fd)) result = 1;
    if (diff.fd >= 0 && close(diff.fd)) result = 1;
    return vr_ota_finish_output(target.fd, output, result);
}
