cmake_minimum_required(VERSION 3.22)
project(ValdiOtaAndroid LANGUAGES C)

# The OTA decoder has no Valdi/Hermes or C++ dependency and can run before the runtime starts.
get_filename_component(OTA_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../native" ABSOLUTE)
add_subdirectory("${OTA_ROOT}" "${CMAKE_CURRENT_BINARY_DIR}/ota")
add_library(valdi_ota_patch SHARED ota-jni.c)
target_link_libraries(valdi_ota_patch PRIVATE valdi_ota_core)
