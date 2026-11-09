/* Test-only independent use of the pinned default compression API. */
#include "vendor/zstd/lib/zstd.h"
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    FILE *input = NULL, *output = NULL;
    unsigned char *data = NULL;
    long size;
    unsigned char buffer[16 * 1024];
    ZSTD_CCtx *context = NULL;
    ZSTD_inBuffer data_input;
    size_t status;
    int result = 1;
    if (argc != 3) return 1;
    input = fopen(argv[1], "rb");
    if (!input || fseek(input, 0, SEEK_END) || (size = ftell(input)) < 0 ||
        size > 64 * 1024 * 1024 || fseek(input, 0, SEEK_SET)) goto done;
    data = malloc(size ? (size_t)size : 1);
    if (!data || fread(data, 1, (size_t)size, input) != (size_t)size) goto done;
    context = ZSTD_createCCtx();
    if (!context) goto done;
    output = fopen(argv[2], "wb");
    if (!output) goto done;
    data_input.src = data;
    data_input.size = (size_t)size;
    data_input.pos = 0;
    do {
        ZSTD_outBuffer target = {buffer, sizeof(buffer), 0};
        status = ZSTD_compressStream2(context, &target, &data_input, ZSTD_e_end);
        if (ZSTD_isError(status) || fwrite(buffer, 1, target.pos, output) != target.pos) goto done;
    } while (status);
    result = 0;
done:
    free(data);
    ZSTD_freeCCtx(context);
    if (input && fclose(input)) result = 1;
    if (output && fclose(output)) result = 1;
    return result;
}
