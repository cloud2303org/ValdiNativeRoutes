#ifndef VR_OTA_CODEC_IO_H
#define VR_OTA_CODEC_IO_H

#include <stdint.h>
#include <stddef.h>
#include <sys/types.h>

#define VR_OTA_LIMIT (UINT64_C(64) * 1024 * 1024)
#define VR_OTA_STEP_LIMIT (UINT64_C(32) * 1024 * 1024)
#define VR_OTA_IO_SIZE (64 * 1024)

/* Return an owned descriptor, or -1. Do not block on FIFOs/devices. */
int vr_ota_open_input(const char *path, uint64_t *size);
int vr_ota_open_output(const char *path);
int vr_ota_read_at(int fd, uint64_t offset, void *buffer, size_t size);
int vr_ota_write_all(int fd, const void *buffer, size_t size);
/* Close, propagate close errors, and unlink only outputs we created. */
int vr_ota_finish_output(int fd, const char *path, int result);

#endif
