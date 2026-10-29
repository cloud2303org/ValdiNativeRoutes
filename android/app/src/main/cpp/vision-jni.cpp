// JNI adapter for VisionNative.kt: one call, converting native_routes::vision::DemoResult to VisionNative.Result.
#include "VisionCore.hpp"

#include <jni.h>

#include <cstdlib>
#include <exception>
#include <string>

namespace {

jstring string(JNIEnv* env, const std::string& value) { return env->NewStringUTF(value.c_str()); }

jobject toJava(JNIEnv* env, const native_routes::vision::DemoResult& result) {
  jclass stringClass = env->FindClass("java/lang/String");
  auto count = static_cast<jsize>(result.predictions.size());
  jobjectArray labels = env->NewObjectArray(count, stringClass, nullptr);
  jdoubleArray scores = env->NewDoubleArray(count);
  for (jsize index = 0; index < count; ++index) {
    const auto& prediction = result.predictions[index];
    jstring label = string(env, prediction.label);
    env->SetObjectArrayElement(labels, index, label);
    env->DeleteLocalRef(label);
    env->SetDoubleArrayRegion(scores, index, 1, &prediction.score);
  }
  jclass resultClass = env->FindClass("io/valdiroutes/app/VisionNative$Result");
  jmethodID constructor = env->GetMethodID(resultClass, "<init>",
      "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;DDIIIIILjava/lang/String;"
      "Ljava/lang/String;[Ljava/lang/String;[D)V");
  return env->NewObject(resultClass, constructor, string(env, result.opencvVersion), string(env, result.ncnnVersion),
      string(env, result.modelName), string(env, result.modelDescription), result.processingMs, result.inferenceMs,
      result.width, result.height, result.inferenceWidth, result.inferenceHeight, result.edgePixelCount,
      string(env, result.inputImageDataUrl), string(env, result.edgeImageDataUrl), labels, scores);
}

} // namespace

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM*, void*) {
  // OpenCV looks for parallel-backend plugins next to this library on first use. Loaded straight from the APK, that
  // directory is "base.apk!/lib/arm64-v8a"; globbing it raises cv::error, and opencv-mobile, built without exceptions,
  // crashes on it. Naming a backend skips the plugin search and keeps OpenCV's builtin thread pool.
  setenv("OPENCV_PARALLEL_BACKEND", "builtin", 0);
  return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT jobject JNICALL Java_io_valdiroutes_app_VisionNative_runDemo(JNIEnv* env, jobject) {
  try {
    return toJava(env, native_routes::vision::runDemo());
  } catch (const std::exception& error) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
  } catch (...) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), "VisionCore failed");
  }
  return nullptr;
}
