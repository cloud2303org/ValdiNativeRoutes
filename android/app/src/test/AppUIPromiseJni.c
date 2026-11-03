#include <jni.h>

/* Transport-only recorder: all exception formatting is performed by the production Kotlin callback. */
static jstring recorded_message;
static jint recorded_code;
static jlong recorded_handle;
static jlong recorded_marshaller_handle;

JNIEXPORT void JNICALL Java_com_snap_valdi_promise_CppPromiseCallback_nativeOnFailure(
    JNIEnv *env, jclass cls, jlong handle, jlong marshaller_handle, jstring message, jint code
) {
    (void)cls;
    if (recorded_message) (*env)->DeleteGlobalRef(env, recorded_message);
    recorded_message = (*env)->NewGlobalRef(env, message);
    recorded_code = code;
    recorded_handle = handle;
    recorded_marshaller_handle = marshaller_handle;
}

JNIEXPORT jstring JNICALL Java_io_valdiroutes_app_AppUIPromiseNativeRecorder_message(JNIEnv *env, jclass cls) {
    (void)cls;
    return (*env)->NewLocalRef(env, recorded_message);
}

JNIEXPORT jint JNICALL Java_io_valdiroutes_app_AppUIPromiseNativeRecorder_errorCode(JNIEnv *env, jclass cls) {
    (void)env;
    (void)cls;
    return recorded_code;
}

JNIEXPORT jlong JNICALL Java_io_valdiroutes_app_AppUIPromiseNativeRecorder_handle(JNIEnv *env, jclass cls) {
    (void)env;
    (void)cls;
    return recorded_handle;
}

JNIEXPORT jlong JNICALL Java_io_valdiroutes_app_AppUIPromiseNativeRecorder_marshallerHandle(JNIEnv *env, jclass cls) {
    (void)env;
    (void)cls;
    return recorded_marshaller_handle;
}
