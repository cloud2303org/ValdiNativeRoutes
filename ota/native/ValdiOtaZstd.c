#include "ValdiOtaCodec.h"
#include "CodecIO.h"
#define ZSTD_STATIC_LINKING_ONLY
#include "vendor/zstd/lib/zstd.h"
#include <stdlib.h>
#include <unistd.h>

#if ZSTD_VERSION_NUMBER != 10507
#error "OTA recompression requires pinned ZSTD 1.5.7"
#endif

int vr_ota_zstd_encode(const char *input, const char *output, uint64_t max_output) {
    uint64_t size = 0;
    unsigned char *source = NULL, *encoded = NULL;
    ZSTD_CCtx *context = NULL;
    ZSTD_inBuffer data;
    uint64_t written = 0;
    size_t status;
    int in = -1, out = -1, result = 1;
    if (!output || max_output > VR_OTA_LIMIT) return 1;
    in = vr_ota_open_input(input, &size);
    if (in < 0) goto done;
    source = (unsigned char *)malloc(size ? (size_t)size : 1);
    encoded = (unsigned char *)malloc(16 * 1024);
    context = ZSTD_createCCtx();
    if (!source || !encoded || !context ||
        vr_ota_read_at(in, 0, source, (size_t)size)) goto done;
    /*
     * Match Node zstdCompressSync defaults: whole input, e_end, 16 KiB output.
     * ZSTD_compress() and other output chunk sizes can produce different bytes.
     * Peak input <=64 MiB, plus 16 KiB and the default level-3 context.
     */
    data.src = source;
    data.size = (size_t)size;
    data.pos = 0;
    out = vr_ota_open_output(output);
    if (out < 0) goto done;
    do {
        ZSTD_outBuffer target = {encoded, 16 * 1024, 0};
        status = ZSTD_compressStream2(context, &target, &data, ZSTD_e_end);
        if (ZSTD_isError(status) || target.pos > max_output - written ||
            vr_ota_write_all(out, encoded, target.pos)) goto done;
        written += target.pos;
    } while (status);
    if (data.pos != data.size) goto done;
    result = 0;
done:
    free(encoded);
    free(source);
    ZSTD_freeCCtx(context);
    if (in >= 0 && close(in)) result = 1;
    return vr_ota_finish_output(out, output, result);
}

int vr_ota_zstd_decode(const char *input, const char *output, uint64_t max_output) {
    uint64_t size = 0, offset = 0, written = 0;
    unsigned char header[ZSTD_FRAMEHEADERSIZE_MAX];
    unsigned char *buffers = NULL;
    ZSTD_FrameHeader frame;
    ZSTD_DStream *stream = NULL;
    size_t status, header_size;
    int in = -1, out = -1, result = 1;
    if (!output || max_output > VR_OTA_LIMIT) return 1;
    in = vr_ota_open_input(input, &size);
    if (in < 0) goto done;
    header_size = size < sizeof(header) ? (size_t)size : sizeof(header);
    if (vr_ota_read_at(in, 0, header, header_size)) goto done;
    status = ZSTD_getFrameHeader(&frame, header, header_size);
    if (status || frame.frameType != ZSTD_frame || frame.dictID ||
        frame.windowSize > VR_OTA_LIMIT ||
        (frame.frameContentSize != ZSTD_CONTENTSIZE_UNKNOWN &&
         frame.frameContentSize > max_output)) goto done;
    buffers = (unsigned char *)malloc(2 * VR_OTA_IO_SIZE);
    stream = ZSTD_createDStream();
    if (!buffers || !stream ||
        ZSTD_isError(ZSTD_DCtx_setMaxWindowSize(stream, (size_t)VR_OTA_LIMIT))) goto done;
    out = vr_ota_open_output(output);
    if (out < 0) goto done;
    while (offset < size) {
        size_t count = size - offset < VR_OTA_IO_SIZE ? (size_t)(size - offset) : VR_OTA_IO_SIZE;
        ZSTD_inBuffer source = {buffers, count, 0};
        if (vr_ota_read_at(in, offset, buffers, count)) goto done;
        offset += count;
        do {
            ZSTD_outBuffer target = {buffers + VR_OTA_IO_SIZE, VR_OTA_IO_SIZE, 0};
            size_t previous = source.pos;
            status = ZSTD_decompressStream(stream, &target, &source);
            if (ZSTD_isError(status) || target.pos > max_output - written) goto done;
            if (vr_ota_write_all(out, target.dst, target.pos)) goto done;
            written += target.pos;
            if (!status) {
                /* Reject concatenated frames, skippables and any trailing byte. */
                if (source.pos != source.size || offset != size) goto done;
                result = 0;
                goto done;
            }
            if (previous == source.pos && !target.pos) {
                if (source.pos == source.size) break; /* Needs the next input chunk. */
                goto done;
            }
            /* Drain buffered output even after a full input chunk was consumed. */
            if (source.pos == source.size && target.pos < target.size) break;
        } while (1);
    }
done:
    ZSTD_freeDStream(stream);
    free(buffers);
    if (in >= 0 && close(in)) result = 1;
    return vr_ota_finish_output(out, output, result);
}
