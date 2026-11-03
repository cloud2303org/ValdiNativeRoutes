cmake_minimum_required(VERSION 3.22)

if(NOT TARGET valdi_runtime_ohos)
    message(FATAL_ERROR "Add harmony/runtime-build before the ArkUI backend")
endif()

add_library(valdi_arkui_backend STATIC ArkUIViewManager.cpp gesture.cpp gesture.hpp NativeShape.inc ShapeState.hpp
    NativeSnapshot.inc SnapshotState.hpp DirectImageFilter.hpp
    NativeRefresh.inc RefreshState.hpp
    ../assets/HarmonyImageAsset.cpp)
target_compile_features(valdi_arkui_backend PUBLIC cxx_std_20)
set_target_properties(valdi_arkui_backend PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories(valdi_arkui_backend PUBLIC "${CMAKE_CURRENT_LIST_DIR}")
target_link_libraries(valdi_arkui_backend PUBLIC valdi_runtime_ohos ace_ndk.z native_drawing pixelmap image_packer)
