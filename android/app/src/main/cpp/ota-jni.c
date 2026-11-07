#include <jni.h>
#include "ValdiOtaCodec.h"

#define OTA_LIMIT (64LL * 1024 * 1024)

static jint transform(JNIEnv *env, jstring input, jstring output, jlong maximum, int encode) {
    if (!input || !output || maximum <= 0 || maximum > OTA_LIMIT) return -1;
    const char *source = (*env)->GetStringUTFChars(env, input, NULL);
    if (!source) return -1;
    const char *target = (*env)->GetStringUTFChars(env, output, NULL);
    if (!target) {
        (*env)->ReleaseStringUTFChars(env, input, source);
        return -1;
    }
    int result = encode ? vr_ota_zstd_encode(source, target, (uint64_t)maximum)
                        : vr_ota_zstd_decode(source, target, (uint64_t)maximum);
    (*env)->ReleaseStringUTFChars(env, output, target);
    (*env)->ReleaseStringUTFChars(env, input, source);
    return result;
}

JNIEXPORT jint JNICALL Java_io_valdiroutes_app_OtaNative_decode(
    JNIEnv *env, jobject receiver, jstring input, jstring output, jlong maximum) {
    (void)receiver;
    return transform(env, input, output, maximum, 0);
}

JNIEXPORT jint JNICALL Java_io_valdiroutes_app_OtaNative_encode(
    JNIEnv *env, jobject receiver, jstring input, jstring output, jlong maximum) {
    (void)receiver;
    return transform(env, input, output, maximum, 1);
}

JNIEXPORT jint JNICALL Java_io_valdiroutes_app_OtaNative_patch(
    JNIEnv *env, jobject receiver, jstring old_file, jstring patch_file, jstring output, jlong expected) {
    (void)receiver;
    if (!old_file || !patch_file || !output || expected < 0 || expected > OTA_LIMIT) return -1;
    const char *old_path = (*env)->GetStringUTFChars(env, old_file, NULL);
    if (!old_path) return -1;
    const char *patch_path = (*env)->GetStringUTFChars(env, patch_file, NULL);
    if (!patch_path) {
        (*env)->ReleaseStringUTFChars(env, old_file, old_path);
        return -1;
    }
    const char *new_path = (*env)->GetStringUTFChars(env, output, NULL);
    int result = new_path ? vr_ota_hdiff_patch(old_path, patch_path, new_path, (uint64_t)expected) : -1;
    if (new_path) (*env)->ReleaseStringUTFChars(env, output, new_path);
    (*env)->ReleaseStringUTFChars(env, patch_file, patch_path);
    (*env)->ReleaseStringUTFChars(env, old_file, old_path);
    return result;
}
