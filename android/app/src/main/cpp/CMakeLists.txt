# libvaldi_routes_vision.so: the shared VisionCore (vision/cpp) and its JNI adapter, after ExpoNativeRoutes'
# packages/vision/android/CMakeLists.txt without Nitro. OpenCV mobile and ncnn are linked statically from the
# archives prepared by vision/scripts/prepare-native.cjs.
cmake_minimum_required(VERSION 3.22)
project(ValdiRoutesVision CXX)
set(CMAKE_CXX_STANDARD 20)
if(NOT ANDROID_ABI STREQUAL "arm64-v8a")
  message(FATAL_ERROR "Vision prepares Android arm64-v8a only; prepare and add another ABI before enabling it")
endif()
get_filename_component(VISION_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../vision" ABSOLUTE)
set(VISION_VENDOR_TARGET android-arm64)
include(${VISION_ROOT}/cmake/VisionVendors.cmake)
add_library(valdi_routes_vision SHARED vision-jni.cpp ${VISION_ROOT}/cpp/VisionCore.cpp)
target_include_directories(valdi_routes_vision PRIVATE ${VISION_ROOT}/cpp)
# ncnn's Android asset readers reference AAsset* from the NDK system library.
target_link_libraries(valdi_routes_vision native_routes_vision_vendors android)
