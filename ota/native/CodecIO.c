#include "CodecIO.h"
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

int vr_ota_open_input(const char *path, uint64_t *size) {
    struct stat st;
    int fd;
    if (!path || !*path) return -1;
    fd = open(path, O_RDONLY | O_CLOEXEC | O_NONBLOCK);
    if (fd < 0) return -1;
    if (fstat(fd, &st) || !S_ISREG(st.st_mode) || st.st_size < 0 ||
        (uint64_t)st.st_size > VR_OTA_LIMIT) {
        close(fd);
        return -1;
    }
    *size = (uint64_t)st.st_size;
    return fd;
}

int vr_ota_open_output(const char *path) {
    if (!path || !*path) return -1;
    return open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
}

int vr_ota_read_at(int fd, uint64_t offset, void *buffer, size_t size) {
    unsigned char *at = (unsigned char *)buffer;
    while (size) {
        ssize_t count = pread(fd, at, size, (off_t)offset);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return 1;
        at += count;
        offset += (uint64_t)count;
        size -= (size_t)count;
    }
    return 0;
}

int vr_ota_write_all(int fd, const void *buffer, size_t size) {
    const unsigned char *at = (const unsigned char *)buffer;
    while (size) {
        ssize_t count = write(fd, at, size);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return 1;
        at += count;
        size -= (size_t)count;
    }
    return 0;
}

int vr_ota_finish_output(int fd, const char *path, int result) {
    if (fd >= 0) {
        if (close(fd)) result = 1;
        if (result) unlink(path);
    }
    return result;
}
