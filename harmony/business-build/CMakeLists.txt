cmake_minimum_required(VERSION 3.22)

if(NOT TARGET valdi_runtime_ohos)
  message(FATAL_ERROR "Add the real valdi_runtime_ohos target before harmony/business-build.")
endif()
if(NOT CMAKE_SYSTEM_NAME STREQUAL "OHOS")
  message(FATAL_ERROR "Use the OHOS NDK toolchain; host validation has a separate test driver.")
endif()
if(NOT OHOS_ARCH MATCHES "^(arm64-v8a|x86_64)$")
  message(FATAL_ERROR "ClientSQL supports OHOS_ARCH arm64-v8a or x86_64.")
endif()
get_filename_component(_business_root "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(VALDI_CLIENTSQL_INPUT_DIR "${_business_root}/.tools/harmony/business-inputs" CACHE PATH "Prepared ClientSQL input directory")
if(NOT EXISTS "${VALDI_CLIENTSQL_INPUT_DIR}/inputs.cmake")
  message(FATAL_ERROR "Run node scripts/harmony/prepare-business.mjs first.")
endif()
include("${VALDI_CLIENTSQL_INPUT_DIR}/inputs.cmake")
if(NOT VALDI_CLIENTSQL_PIN STREQUAL "15feb6530ceecb971f4c8519ea8ab77474b959db")
  message(FATAL_ERROR "Prepared ClientSQL pin does not match the wrapper.")
endif()
option(VALDI_CLIENTSQL_LINK_CHECK "Strict shared link proof including all ClientSQL objects" OFF)

add_library(valdi_clientsql_sqlite_ohos STATIC "${VALDI_CLIENTSQL_INPUT_DIR}/sqlite/sqlite3.c")
set_target_properties(valdi_clientsql_sqlite_ohos PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories(valdi_clientsql_sqlite_ohos PUBLIC "${VALDI_CLIENTSQL_INPUT_DIR}/sqlite")
# Match third-party/sqlite/sqlite.BUILD rather than the host platform SQLite.
target_compile_definitions(valdi_clientsql_sqlite_ohos PRIVATE
  SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_OMIT_LOAD_EXTENSION SQLITE_THREADSAFE=1)
target_link_libraries(valdi_clientsql_sqlite_ohos PUBLIC m)

add_library(valdi_clientsql_ohos STATIC
  "${VALDI_CLIENTSQL_INPUT_DIR}/native/ClientSQLNativeModuleFactory.cpp"
  "${VALDI_CLIENTSQL_INPUT_DIR}/generated/valdi_modules/client_sql/client_sql.cpp")
set_target_properties(valdi_clientsql_ohos PROPERTIES
  POSITION_INDEPENDENT_CODE ON CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
target_include_directories(valdi_clientsql_ohos PUBLIC
  "${VALDI_CLIENTSQL_INPUT_DIR}/native" "${VALDI_CLIENTSQL_INPUT_DIR}/generated")
target_compile_features(valdi_clientsql_ohos PUBLIC cxx_std_20)
target_compile_definitions(valdi_clientsql_ohos PRIVATE VALDI_CLIENTSQL_USE_BUNDLED_SQLITE)
target_link_libraries(valdi_clientsql_ohos PUBLIC valdi_runtime_ohos valdi_clientsql_sqlite_ohos)

if(VALDI_CLIENTSQL_LINK_CHECK)
  add_library(valdi_clientsql_ohos_link_check SHARED link_check.cpp)
  target_link_libraries(valdi_clientsql_ohos_link_check PRIVATE
    "-Wl,--whole-archive" valdi_clientsql_ohos "-Wl,--no-whole-archive")
  target_link_options(valdi_clientsql_ohos_link_check PRIVATE "-Wl,--no-undefined" "-Wl,--no-gc-sections")
endif()
