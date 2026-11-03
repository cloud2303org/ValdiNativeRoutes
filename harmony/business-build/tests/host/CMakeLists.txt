cmake_minimum_required(VERSION 3.22)
project(valdi_clientsql_host_tests LANGUAGES C CXX)
if(NOT APPLE)
  message(FATAL_ERROR "This focused host harness currently targets macOS.")
endif()
get_filename_component(ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(VALDI_HARMONY_SOURCE_DIR "${ROOT}/.tools/harmony/upstream" CACHE PATH "Prepared real Valdi sources")
set(VALDI_HARMONY_EXTERNAL_DIR "${ROOT}/.tools/harmony/runtime-inputs/external" CACHE PATH "Prepared dependencies")
set(VALDI_CLIENTSQL_INPUT_DIR "${ROOT}/.tools/harmony/business-inputs" CACHE PATH "Prepared ClientSQL inputs")
set(V "${VALDI_HARMONY_SOURCE_DIR}")
set(E "${VALDI_HARMONY_EXTERNAL_DIR}")
set(I "${VALDI_CLIENTSQL_INPUT_DIR}")
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(FMT_TEST OFF CACHE BOOL "" FORCE)
set(FMT_INSTALL OFF CACHE BOOL "" FORCE)
add_subdirectory("${E}/fmt" deps/fmt EXCLUDE_FROM_ALL)
set(JSONCPP_WITH_TESTS OFF CACHE BOOL "" FORCE)
set(JSONCPP_WITH_POST_BUILD_UNITTEST OFF CACHE BOOL "" FORCE)
set(JSONCPP_WITH_PKGCONFIG_SUPPORT OFF CACHE BOOL "" FORCE)
set(JSONCPP_WITH_CMAKE_PACKAGE OFF CACHE BOOL "" FORCE)
set(BUILD_OBJECT_LIBS OFF CACHE BOOL "" FORCE)
add_subdirectory("${E}/jsoncpp" deps/jsoncpp EXCLUDE_FROM_ALL)
set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
add_subdirectory("${E}/boringssl/third_party/googletest" deps/gtest EXCLUDE_FROM_ALL)

foreach(flag ASSERT LOGGING TRACING DEV GOLD APPSTORE ALPHA)
  set(SC_BUILD_FLAG_${flag} false)
endforeach()
configure_file("${V}/libs/utils/src/utils/platform/BuildOptionsGenerated.hpp.in"
  "${CMAKE_CURRENT_BINARY_DIR}/generated/build_options/BuildOptionsGenerated.hpp" @ONLY)
file(GLOB PHMAP_HEADERS "${E}/phmap/parallel_hashmap/*.h")
file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/generated/phmap")
file(COPY ${PHMAP_HEADERS} DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/generated/phmap")
file(GLOB_RECURSE CORE "${V}/valdi_core/src/valdi_core/cpp/*.cpp" "${V}/valdi_core/src/valdi_core/cpp/*.c"
  "${V}/valdi_core/src/bindings/include/*_valdi.cpp")
file(GLOB_RECURSE UTILS "${V}/libs/utils/src/utils/*.cpp" "${V}/libs/utils/src/utils_oss/*.cpp")
file(GLOB DJINNI "${V}/third-party/djinni-support-lib/src/djinni/cpp/*.cpp")
add_library(real_valdi_host STATIC ${CORE} ${UTILS} ${DJINNI}
  "${V}/valdi/src/valdi/runtime/Runtime.cpp"
  "${V}/valdi/src/valdi/runtime/Context/Context.cpp"
  "${V}/valdi/src/valdi/runtime/Resources/DiskCacheImpl.cpp")
target_include_directories(real_valdi_host PUBLIC
  "${CMAKE_CURRENT_BINARY_DIR}/generated"
  "${ROOT}/.tools/harmony/runtime-inputs/generated/proto"
  "${V}/valdi/src" "${V}/valdi/generated-src/cpp"
  "${V}/valdi_core/src" "${V}/valdi_core/generated-src/cpp" "${V}/valdi_core/src/bindings/include"
  "${V}/valdi_protobuf/src" "${V}/libs/utils/src"
  "${V}/third-party/djinni-support-lib/src" "${V}/third-party/yoga/src"
  "${E}/protobuf/src" "${E}/abseil" "${E}/boringssl/include")
target_include_directories(real_valdi_host SYSTEM PUBLIC "${E}/boost" "${E}/zoo/inc" "${E}/zoo/src")
target_compile_definitions(real_valdi_host PUBLIC DATAREF_JNI=0 DATAREF_OBJC=0 DATAREF_WASM=0
  _LIBCPP_ENABLE_CXX17_REMOVED_UNARY_BINARY_FUNCTION)
target_compile_options(real_valdi_host PUBLIC -Wno-missing-template-arg-list-after-template-kw)
target_compile_options(real_valdi_host PRIVATE -Wno-deprecated-declarations -Wno-unused-result)
target_link_libraries(real_valdi_host PUBLIC fmt::fmt jsoncpp_static)
add_library(real_sqlite_host STATIC "${I}/sqlite/sqlite3.c")
target_include_directories(real_sqlite_host PUBLIC "${I}/sqlite")
target_compile_definitions(real_sqlite_host PRIVATE
  SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_OMIT_LOAD_EXTENSION SQLITE_THREADSAFE=1)
add_executable(clientsql_native_tests
  "${I}/native/ClientSQLNativeModuleFactory_tests.cpp"
  "${I}/native/ClientSQLNativeModuleFactory.cpp"
  "${I}/generated/valdi_modules/client_sql/client_sql.cpp")
target_include_directories(clientsql_native_tests PRIVATE "${I}/native" "${I}/generated")
target_compile_definitions(clientsql_native_tests PRIVATE VALDI_CLIENTSQL_USE_BUNDLED_SQLITE)
# Discard unused runtime functions from the focused static closure; all kept
# methods still come from the actual runtime source, with normal undefined checks.
target_link_options(clientsql_native_tests PRIVATE -Wl,-dead_strip)
target_link_libraries(clientsql_native_tests PRIVATE real_valdi_host real_sqlite_host GTest::gtest_main)
enable_testing()
add_test(NAME clientsql_native COMMAND clientsql_native_tests)
