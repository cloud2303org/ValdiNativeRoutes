cmake_minimum_required(VERSION 3.18)
project(ValdiOtaCore VERSION 1.0 LANGUAGES C)

set(_vr_host_default OFF)
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR AND NOT CMAKE_CROSSCOMPILING)
    set(_vr_host_default ON)
endif()
option(VALDI_OTA_BUILD_HOST_TESTS "Build shared host codec, reference encoder and tests" ${_vr_host_default})
option(VALDI_OTA_SANITIZE "Enable address/undefined sanitizers for isolated host tests" OFF)

if(ANDROID)
    find_library(VR_OTA_ZLIB z REQUIRED)
else()
    find_package(ZLIB REQUIRED)
    set(VR_OTA_ZLIB ZLIB::ZLIB)
endif()

# Only single-thread C compression/decompression and the C HDiff decoder.
file(GLOB _vr_zstd CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/vendor/zstd/lib/common/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/vendor/zstd/lib/compress/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/vendor/zstd/lib/decompress/*.c")
add_library(valdi_ota_vendor OBJECT ${_vr_zstd}
    vendor/hdiffpatch/libHDiffPatch/HPatch/patch.c)
target_compile_definitions(valdi_ota_vendor PRIVATE
    NDEBUG=1 DEBUGLEVEL=0 ZSTD_DISABLE_ASM=1 ZSTD_LEGACY_SUPPORT=0
    ZSTDLIB_VISIBILITY=__attribute__\(\(visibility\(\"hidden\"\)\)\)
    ZSTDERRORLIB_VISIBILITY=__attribute__\(\(visibility\(\"hidden\"\)\)\)
    _IS_USED_MULTITHREAD=0 _HPATCH_IS_USED_MULTITHREAD=0 _IS_NEED_DIR_DIFF_PATCH=0)

set(_vr_codec CodecIO.c ValdiOtaZstd.c ValdiOtaHdiff.c)
add_library(valdi_ota_core STATIC ${_vr_codec} $<TARGET_OBJECTS:valdi_ota_vendor>)
target_include_directories(valdi_ota_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(valdi_ota_core PUBLIC ${VR_OTA_ZLIB})
target_compile_definitions(valdi_ota_core PRIVATE
    _POSIX_C_SOURCE=200809L _IS_USED_MULTITHREAD=0 _HPATCH_IS_USED_MULTITHREAD=0)

set(_vr_targets valdi_ota_core valdi_ota_vendor)
if(VALDI_OTA_BUILD_HOST_TESTS)
    if(CMAKE_CROSSCOMPILING)
        message(FATAL_ERROR "Host codec tests must use an isolated native host build")
    endif()
    add_library(valdi_ota_codec_host SHARED ${_vr_codec} $<TARGET_OBJECTS:valdi_ota_vendor>)
    target_include_directories(valdi_ota_codec_host PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
    target_compile_definitions(valdi_ota_codec_host PRIVATE VR_OTA_SHARED=1
        _POSIX_C_SOURCE=200809L _IS_USED_MULTITHREAD=0 _HPATCH_IS_USED_MULTITHREAD=0)
    target_link_libraries(valdi_ota_codec_host PRIVATE ${VR_OTA_ZLIB})
    add_executable(valdi_ota_zstd_reference tests/zstd_reference.c)
    target_link_libraries(valdi_ota_zstd_reference PRIVATE valdi_ota_core)
    list(APPEND _vr_targets valdi_ota_codec_host valdi_ota_zstd_reference)
    find_package(Python3 REQUIRED COMPONENTS Interpreter)
    set(_vr_test_python "${Python3_EXECUTABLE}")
    if(VALDI_OTA_SANITIZE)
        # Load the sanitizer runtime at process startup, before ctypes/dlopen.
        # Some macOS Python launchers strip DYLD_INSERT_LIBRARIES.
        find_package(Python3 REQUIRED COMPONENTS Interpreter Development.Embed)
        add_executable(valdi_ota_test_python tests/python_main.c)
        target_link_libraries(valdi_ota_test_python PRIVATE Python3::Python)
        list(APPEND _vr_targets valdi_ota_test_python)
        set(_vr_test_python "$<TARGET_FILE:valdi_ota_test_python>")
    endif()
    enable_testing()
    add_test(NAME valdi_ota_codec_files COMMAND "${CMAKE_COMMAND}" -E env
        "VR_OTA_CODEC_LIBRARY=$<TARGET_FILE:valdi_ota_codec_host>"
        "VR_OTA_ZSTD_REFERENCE=$<TARGET_FILE:valdi_ota_zstd_reference>"
        "${_vr_test_python}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_codec.py")
    set_tests_properties(valdi_ota_codec_files PROPERTIES TIMEOUT 120)
endif()

foreach(_vr_target IN LISTS _vr_targets)
    set_target_properties(${_vr_target} PROPERTIES
        C_STANDARD 99 C_STANDARD_REQUIRED YES C_EXTENSIONS NO
        POSITION_INDEPENDENT_CODE ON C_VISIBILITY_PRESET hidden)
    if(VALDI_OTA_SANITIZE)
        target_compile_options(${_vr_target} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
        target_link_options(${_vr_target} PRIVATE -fsanitize=address,undefined)
    endif()
endforeach()
