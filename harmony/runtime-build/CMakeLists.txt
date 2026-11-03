cmake_minimum_required(VERSION 3.22)
project(valdi_runtime_ohos LANGUAGES C CXX ASM)

if(NOT CMAKE_SYSTEM_NAME STREQUAL "OHOS")
  message(FATAL_ERROR "Use the OHOS NDK ohos.toolchain.cmake; host builds are not supported.")
endif()
if(NOT OHOS_ARCH MATCHES "^(arm64-v8a|x86_64)$")
  message(FATAL_ERROR "Supported OHOS_ARCH values: arm64-v8a, x86_64")
endif()
get_filename_component(VALDI_PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(VALDI_HARMONY_SOURCE_DIR "${VALDI_PROJECT_ROOT}/.tools/harmony/upstream" CACHE PATH "Pinned Valdi git archive")
set(VALDI_HARMONY_EXTERNAL_DIR "${VALDI_PROJECT_ROOT}/.tools/harmony/runtime-inputs/external" CACHE PATH "Writable staged dependency sources")
set(VALDI_HARMONY_GENERATED_DIR "${VALDI_PROJECT_ROOT}/.tools/harmony/runtime-inputs/generated" CACHE PATH "Prepared manifests and protoc 29.3 output")
set(VALDI_HARMONY_OVERLAY_INCLUDE_DIR "" CACHE PATH "Platform header overlay supplied by the Harmony backend")
set(VALDI_HARMONY_PLATFORM_SOURCES "" CACHE STRING "Additional OHOS platform implementation source files")
option(VALDI_HARMONY_LINK_CHECK "Link all runtime objects with --no-undefined" ON)
option(VALDI_HARMONY_ASSERTS "Compile Valdi assertions" OFF)
option(VALDI_HARMONY_LOGGING "Compile Valdi logging" ON)
option(VALDI_HARMONY_TRACING "Compile Valdi tracing" OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
# The NDK passes --gcc-toolchain even though its Clang C frontend does not use it.
# Dependency configure probes with -Werror otherwise reject working pthread APIs.
string(APPEND CMAKE_C_FLAGS " -Wno-unused-command-line-argument")
string(APPEND CMAKE_CXX_FLAGS " -Wno-unused-command-line-argument")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(V "${VALDI_HARMONY_SOURCE_DIR}")
set(E "${VALDI_HARMONY_EXTERNAL_DIR}")
set(G "${CMAKE_CURRENT_BINARY_DIR}/generated")
set(HERMES_SOURCE_DIR "${E}/hermes")
include("${VALDI_HARMONY_GENERATED_DIR}/sources.cmake")
# Reproduce Bazel's include_prefix="phmap" over parallel_hashmap/*.h.
file(GLOB PHMAP_HEADERS "${E}/phmap/parallel_hashmap/*.h")
file(MAKE_DIRECTORY "${G}/phmap")
file(COPY ${PHMAP_HEADERS} DESTINATION "${G}/phmap")

# Keep the release Hermes heap model identical in the VM and every consumer.
file(MAKE_DIRECTORY "${G}/hermes/llvh/Config")
configure_file("${V}/third-party/hermes_v1/prepared_include/linux/libhermesvm-config.h"
               "${G}/hermes/libhermesvm-config.h" COPYONLY)
include(CheckSymbolExists)
set(CMAKE_REQUIRED_DEFINITIONS -D_GNU_SOURCE)
check_symbol_exists(mallinfo "malloc.h" VALDI_OHOS_HAS_MALLINFO)
check_symbol_exists(lseek64 "unistd.h" VALDI_OHOS_HAS_LSEEK64)
file(READ "${V}/third-party/hermes_v1/prepared_include/linux/llvh/Config/config.h" LLVH_CONFIG)
if(NOT VALDI_OHOS_HAS_MALLINFO)
  string(REPLACE "#define HAVE_MALLINFO 1" "/* #undef HAVE_MALLINFO */" LLVH_CONFIG "${LLVH_CONFIG}")
endif()
if(NOT VALDI_OHOS_HAS_LSEEK64)
  string(REPLACE "#define HAVE_LSEEK64 1" "/* #undef HAVE_LSEEK64 */" LLVH_CONFIG "${LLVH_CONFIG}")
endif()
file(CONFIGURE OUTPUT "${G}/hermes/llvh/Config/config.h" CONTENT "${LLVH_CONFIG}" @ONLY)
configure_file(llvm-config.h.in "${G}/hermes/llvh/Config/llvm-config.h" @ONLY)
foreach(flag ASSERT LOGGING TRACING DEV GOLD APPSTORE ALPHA)
  set(SC_BUILD_FLAG_${flag} false)
endforeach()
if(VALDI_HARMONY_ASSERTS)
  set(SC_BUILD_FLAG_ASSERT true)
endif()
if(VALDI_HARMONY_LOGGING)
  set(SC_BUILD_FLAG_LOGGING true)
endif()
if(VALDI_HARMONY_TRACING)
  set(SC_BUILD_FLAG_TRACING true)
endif()
configure_file("${V}/libs/utils/src/utils/platform/BuildOptionsGenerated.hpp.in"
               "${G}/build_options/BuildOptionsGenerated.hpp" @ONLY)

# The dependency projects are configured only from writable staged copies.
set(OPENSSL_NO_ASM ON CACHE BOOL "" FORCE)
add_subdirectory("${E}/boringssl" deps/boringssl EXCLUDE_FROM_ALL)
set(protobuf_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(protobuf_BUILD_PROTOC_BINARIES OFF CACHE BOOL "" FORCE)
set(protobuf_BUILD_LIBUPB OFF CACHE BOOL "" FORCE)
set(protobuf_INSTALL OFF CACHE BOOL "" FORCE)
set(protobuf_WITH_ZLIB OFF CACHE BOOL "" FORCE)
# Consumers select their own supported standard (protobuf 17, Valdi 20).
set(ABSL_PROPAGATE_CXX_STD OFF CACHE BOOL "" FORCE)
set(ABSL_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
set(ABSL_ROOT_DIR "${E}/abseil" CACHE PATH "" FORCE)
add_subdirectory("${E}/protobuf" deps/protobuf EXCLUDE_FROM_ALL)
# Protobuf's recursive JSON UntypedMessage trips eager C++20 trait instantiation
# in this NDK's libc++; its supported C++17 mode avoids that container path.
set_target_properties(libprotobuf PROPERTIES CXX_STANDARD 17)
set(FMT_TEST OFF CACHE BOOL "" FORCE)
set(FMT_INSTALL OFF CACHE BOOL "" FORCE)
add_subdirectory("${E}/fmt" deps/fmt EXCLUDE_FROM_ALL)
set(JSONCPP_WITH_TESTS OFF CACHE BOOL "" FORCE)
set(JSONCPP_WITH_POST_BUILD_UNITTEST OFF CACHE BOOL "" FORCE)
set(JSONCPP_WITH_PKGCONFIG_SUPPORT OFF CACHE BOOL "" FORCE)
set(JSONCPP_WITH_CMAKE_PACKAGE OFF CACHE BOOL "" FORCE)
set(BUILD_OBJECT_LIBS OFF CACHE BOOL "" FORCE)
add_subdirectory("${E}/jsoncpp" deps/jsoncpp EXCLUDE_FROM_ALL)
set(ZSTD_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(ZSTD_MULTITHREAD_SUPPORT OFF CACHE BOOL "" FORCE)
add_subdirectory("${E}/zstd/build/cmake" deps/zstd EXCLUDE_FROM_ALL)
add_library(valdi_ohos_xxhash STATIC "${E}/xxhash/xxhash.c")
target_include_directories(valdi_ohos_xxhash PUBLIC "${E}/xxhash")
add_library(valdi_ohos_harfbuzz STATIC ${HARFBUZZ_SRCS})
target_include_directories(valdi_ohos_harfbuzz PUBLIC "${E}/harfbuzz/src")
target_compile_definitions(valdi_ohos_harfbuzz PRIVATE HAVE_ROUND HAVE_OT HAVE_UCDN HB_NO_LEGACY HAVE_UNISTD_H HAVE_SYS_MMAN_H HB_NO_PRAGMA_GCC_DIAGNOSTIC_WARNING)
add_library(valdi_ohos_boost STATIC "${E}/boost/asio.cpp" "${E}/boost/asio-ssl.cpp")
target_include_directories(valdi_ohos_boost SYSTEM PUBLIC "${E}/boost")
target_compile_definitions(valdi_ohos_boost PUBLIC BOOST_ASIO_SEPARATE_COMPILATION BOOST_ASIO_HAS_STD_CHRONO _LIBCPP_ENABLE_CXX17_REMOVED_UNARY_BINARY_FUNCTION)
target_link_libraries(valdi_ohos_boost PUBLIC ssl crypto)

add_library(valdi_ohos_hermes_config INTERFACE)
target_include_directories(valdi_ohos_hermes_config SYSTEM INTERFACE
  "${G}/hermes" "${HERMES_SOURCE_DIR}/include" "${HERMES_SOURCE_DIR}/public"
  "${HERMES_SOURCE_DIR}/API" "${HERMES_SOURCE_DIR}/API/jsi"
  "${HERMES_SOURCE_DIR}/external" "${HERMES_SOURCE_DIR}/external/dragonbox"
  "${HERMES_SOURCE_DIR}/external/fast_float"
  "${HERMES_SOURCE_DIR}/external/llvh/include" "${HERMES_SOURCE_DIR}/external/llvh/gen/include"
  "${V}/third-party/hermes_v1/prepared_include/internal_js")
target_compile_definitions(valdi_ohos_hermes_config INTERFACE
  NDEBUG HERMES_RELEASE_VERSION="260318099.0.4" HERMESVM_ALLOW_CONCURRENT_GC
  HERMESVM_ALLOW_INLINE_ASM HERMESVM_INDIRECT_THREADING HERMES_CHECK_NATIVE_STACK
  HERMES_ENABLE_UNICODE_REGEXP_PROPERTY_ESCAPES HERMES_USE_BOOST_CONTEXT=0
  STATIC_HERMES HERMES_PLATFORM_UNICODE=HERMES_PLATFORM_UNICODE_LITE HERMESVM_LEAN)
add_library(valdi_ohos_hermes STATIC ${HERMES_VM_SRCS} ${HERMES_LEAN_BACKEND_SRCS} ${HERMES_LLVH_SRCS})
set_target_properties(valdi_ohos_hermes PROPERTIES CXX_STANDARD 17)
target_compile_options(valdi_ohos_hermes PRIVATE -O3 -fno-exceptions -Wno-unknown-warning-option -Wno-deprecated-volatile -Wno-unused-variable)
target_link_libraries(valdi_ohos_hermes PUBLIC valdi_ohos_hermes_config)
add_library(valdi_ohos_dtoa STATIC ${HERMES_DTOA_SRCS})
target_compile_definitions(valdi_ohos_dtoa PRIVATE IEEE_8087 Long=int NO_HEX_FP NO_INFNAN_CHECK MULTIPLE_THREADS)
target_include_directories(valdi_ohos_dtoa PRIVATE "${HERMES_SOURCE_DIR}/external")
target_link_libraries(valdi_ohos_hermes PUBLIC valdi_ohos_dtoa)

file(GLOB_RECURSE VALDI_RUNTIME_SRCS CONFIGURE_DEPENDS "${V}/valdi/src/valdi/runtime/*.cpp" "${V}/valdi/src/valdi/runtime/*.c")
file(GLOB_RECURSE VALDI_CORE_SRCS CONFIGURE_DEPENDS "${V}/valdi_core/src/valdi_core/cpp/*.cpp" "${V}/valdi_core/src/valdi_core/cpp/*.c" "${V}/valdi_core/src/bindings/include/*_valdi.cpp")
file(GLOB_RECURSE VALDI_PROTOBUF_SRCS CONFIGURE_DEPENDS "${V}/valdi_protobuf/src/valdi_protobuf/*.cpp")
file(GLOB_RECURSE VALDI_YOGA_SRCS CONFIGURE_DEPENDS "${V}/third-party/yoga/src/yoga/*.cpp")
file(GLOB VALDI_DJINNI_SRCS CONFIGURE_DEPENDS "${V}/third-party/djinni-support-lib/src/djinni/cpp/*.cpp")
file(GLOB_RECURSE VALDI_HERMES_SRCS CONFIGURE_DEPENDS "${V}/valdi/src/valdi/hermes/*.cpp")
set(VALDI_UTILS_SRCS "")
foreach(component platform debugging time encoding crypto logging base)
  file(GLOB_RECURSE component_src CONFIGURE_DEPENDS "${V}/libs/utils/src/utils/${component}/*.cpp")
  list(APPEND VALDI_UTILS_SRCS ${component_src})
endforeach()
file(GLOB kitchen_src CONFIGURE_DEPENDS "${V}/libs/utils/src/utils/*.cpp")
file(GLOB_RECURSE oss_src CONFIGURE_DEPENDS "${V}/libs/utils/src/utils_oss/*.cpp")
add_library(valdi_runtime_ohos STATIC
  ${VALDI_RUNTIME_SRCS} ${VALDI_CORE_SRCS} ${VALDI_PROTOBUF_SRCS}
  ${VALDI_YOGA_SRCS} ${VALDI_DJINNI_SRCS} ${VALDI_HERMES_SRCS}
  ${VALDI_UTILS_SRCS} ${kitchen_src} ${oss_src}
  "${V}/valdi/src/valdi/jsbridge/JavaScriptBridge.cpp"
  "${VALDI_HARMONY_GENERATED_DIR}/proto/valdi/valdi.pb.cc"
  "${VALDI_HARMONY_GENERATED_DIR}/proto/valdi_protobuf/protos/DescriptorIndex.pb.cc"
  ${VALDI_HARMONY_PLATFORM_SOURCES})
target_include_directories(valdi_runtime_ohos BEFORE PUBLIC
  ${VALDI_HARMONY_OVERLAY_INCLUDE_DIR} "${G}" "${VALDI_HARMONY_GENERATED_DIR}/proto"
  "${V}/valdi/src" "${V}/valdi/generated-src/cpp"
  "${V}/valdi_core/src" "${V}/valdi_core/generated-src/cpp" "${V}/valdi_core/src/bindings/include"
  "${V}/valdi_protobuf/src" "${V}/libs/utils/src"
  "${V}/third-party/djinni-support-lib/src" "${V}/third-party/yoga/src"
  "${V}/third-party/yoga/src/yoga/event" "${V}/third-party/yoga/src/yoga/internal")
target_include_directories(valdi_runtime_ohos SYSTEM PUBLIC "${E}/phmap" "${E}/zoo/inc" "${E}/zoo/src")
target_compile_definitions(valdi_runtime_ohos PUBLIC
  VALDI_HAS_HERMES VALDI_JS_ENGINE_DEFAULT_HERMES GRPC_USE_PROTO_LITE
  DATAREF_JNI=0 DATAREF_OBJC=0 DATAREF_WASM=0)
target_compile_options(valdi_runtime_ohos PRIVATE -Wno-deprecated-declarations -Wno-deprecated-this-capture -Wno-unused-result)
target_link_libraries(valdi_runtime_ohos PUBLIC
  valdi_ohos_hermes valdi_ohos_boost valdi_ohos_harfbuzz valdi_ohos_xxhash
  protobuf::libprotobuf fmt::fmt jsoncpp_static libzstd_static dl m)

# A strict whole-archive link proves closure beyond merely creating an .a file.
if(VALDI_HARMONY_LINK_CHECK)
  add_library(valdi_runtime_ohos_link_check SHARED link_check.cpp)
  target_link_libraries(valdi_runtime_ohos_link_check PRIVATE
    "-Wl,--whole-archive" valdi_runtime_ohos "-Wl,--no-whole-archive")
  target_link_options(valdi_runtime_ohos_link_check PRIVATE "-Wl,--no-undefined" "-Wl,--no-gc-sections")
endif()
