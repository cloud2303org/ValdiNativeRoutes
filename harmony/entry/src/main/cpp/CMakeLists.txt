cmake_minimum_required(VERSION 3.22)
project(valdi_harmony LANGUAGES C CXX ASM)

get_filename_component(VALDI_PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../../.." ABSOLUTE)
set(_ui_assets_untracked_cache FALSE)
if(DEFINED VALDI_HARMONY_APP_CONFIGURED_RUNTIME AND
    NOT DEFINED VALDI_HARMONY_APP_CONFIGURED_UI_ASSETS)
  set(_ui_assets_untracked_cache TRUE)
endif()
include("${VALDI_PROJECT_ROOT}/harmony/runtime-build/app-runtime-profile.cmake")
option(VALDI_HARMONY_USE_FORK_UI_ASSETS "Use the paired maintained-fork ArkUI and image assets" OFF)
if(VALDI_HARMONY_USE_FORK_UI_ASSETS)
  if(NOT VALDI_HARMONY_RUNTIME_MODE STREQUAL "fork")
    message(FATAL_ERROR "Fork UI/assets require explicit VALDI_HARMONY_RUNTIME_MODE=fork")
  endif()
  if(_ui_assets_untracked_cache)
    message(FATAL_ERROR "App UI/assets selection is untracked in this existing cache; use a fresh CMake build directory")
  endif()
  set(_ui_assets_identity "fork")
else()
  set(_ui_assets_identity "legacy")
endif()
if(DEFINED VALDI_HARMONY_APP_CONFIGURED_UI_ASSETS AND
    NOT VALDI_HARMONY_APP_CONFIGURED_UI_ASSETS STREQUAL _ui_assets_identity)
  message(FATAL_ERROR "App UI/assets selection changed; use a fresh CMake build directory")
endif()
set(VALDI_HARMONY_APP_CONFIGURED_UI_ASSETS "${_ui_assets_identity}" CACHE INTERNAL "Frozen app UI/assets selection")
add_subdirectory("${VALDI_PROJECT_ROOT}/harmony/business-build" "${CMAKE_CURRENT_BINARY_DIR}/valdi-business")
# Keep ClientSQL's public generated/native include interface and static factory.
# The fork core target alone deliberately does not provide the engine adapter.
target_link_libraries(valdi_clientsql_ohos PUBLIC ${VALDI_HARMONY_APP_RUNTIME_TARGET})
file(GLOB HOST_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/host/*.cpp")
if(VALDI_HARMONY_USE_FORK_UI_ASSETS)
  # The runtime profile already validates and canonicalizes this exact fork.
  # Concrete image types share names with the legacy assets, but have a new
  # parent; select both libraries and never compile either legacy source group.
  add_subdirectory("${VALDI_HARMONY_SOURCE_DIR}/valdi/harmony/arkui" "${CMAKE_CURRENT_BINARY_DIR}/valdi-arkui")
  add_subdirectory("${VALDI_HARMONY_SOURCE_DIR}/valdi/harmony/assets" "${CMAKE_CURRENT_BINARY_DIR}/valdi-assets")
  set(BACKEND_SOURCES)
  set(ASSET_SOURCES)
else()
  file(GLOB BACKEND_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/backend/*.cpp")
  file(GLOB ASSET_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/assets/*.cpp")
endif()
set(VALDI_HARMONY_BUSINESS_BINDINGS "${VALDI_PROJECT_ROOT}/.tools/harmony/business-bindings")
# Platform schemas include app_pages through the canonical generated path.
# Fail rather than silently mixing two generations of the same native models.
foreach(extension hpp cpp)
  set(canonical "${VALDI_PROJECT_ROOT}/valdi/native/generated/valdi_modules/app_pages/app_pages.${extension}")
  set(business "${VALDI_HARMONY_BUSINESS_BINDINGS}/valdi_modules/app_pages/app_pages.${extension}")
  if(NOT EXISTS "${canonical}" OR NOT EXISTS "${business}")
    message(FATAL_ERROR "Generate matching canonical and Harmony business app_pages bindings first")
  endif()
  file(SHA256 "${canonical}" canonical_hash)
  file(SHA256 "${business}" business_hash)
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${canonical}" "${business}")
  if(NOT canonical_hash STREQUAL business_hash)
    message(FATAL_ERROR "Canonical and Harmony business app_pages bindings differ; regenerate them together")
  endif()
endforeach()
add_library(valdi_harmony SHARED ${HOST_SOURCES} ${BACKEND_SOURCES} ${ASSET_SOURCES})
target_compile_definitions(valdi_harmony PRIVATE
  VALDI_HARMONY_USE_FORK_UI_ASSETS=$<BOOL:${VALDI_HARMONY_USE_FORK_UI_ASSETS}>)
if(VALDI_HARMONY_USE_FORK_UI_ASSETS)
  target_link_libraries(valdi_harmony PRIVATE Valdi::HarmonyArkUI Valdi::HarmonyAssets)
endif()
target_sources(valdi_harmony PRIVATE
  # Link the official factory directly so static registration survives archive
  # extraction and runs before RuntimeManager::postInit().
  "${VALDI_HARMONY_SOURCE_DIR}/src/valdi_modules/src/cpp/valdi_http/HTTPRequestManagerModuleFactory.cpp"
  "${VALDI_PROJECT_ROOT}/valdi/native/generated/valdi_modules/app_pages/app_pages.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/business/AssetTokenStore.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/business/HarmonyBusinessModules.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/business/HarmonySystemServiceHosts.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/platform/PlatformServiceCodec.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/platform/PlatformServiceAdapters.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/platform/PlatformServicePort.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/platform/NapiPlatformServiceTransport.cpp"
  "${VALDI_HARMONY_BUSINESS_BINDINGS}/valdi_modules/bluetooth/bluetooth.cpp")
target_compile_features(valdi_harmony PRIVATE cxx_std_20)
# This is the app target's build flag; upstream runtime defines NDEBUG even in
# the app's Debug configuration.
include("${VALDI_PROJECT_ROOT}/harmony/runtime-build/app-development.cmake")
valdi_harmony_configure_app_development(valdi_harmony)
target_include_directories(valdi_harmony PRIVATE "${CMAKE_CURRENT_LIST_DIR}"
  "${VALDI_PROJECT_ROOT}/valdi/native/generated"
  "${VALDI_HARMONY_BUSINESS_BINDINGS}")
# RCP is supplied by the Huawei SDK overlay beside the OpenHarmony sysroot.
get_filename_component(VALDI_HARMONY_HMS_SYSROOT
  "${CMAKE_SYSROOT}/../../../hms/native/sysroot" ABSOLUTE)
if(OHOS_ARCH STREQUAL "arm64-v8a")
  set(VALDI_HARMONY_RCP_TRIPLE "aarch64-linux-ohos")
elseif(OHOS_ARCH STREQUAL "x86_64")
  set(VALDI_HARMONY_RCP_TRIPLE "x86_64-linux-ohos")
endif()
set(VALDI_HARMONY_RCP_LIBRARY
  "${VALDI_HARMONY_HMS_SYSROOT}/usr/lib/${VALDI_HARMONY_RCP_TRIPLE}/librcp_c.so")
if(NOT EXISTS "${VALDI_HARMONY_HMS_SYSROOT}/usr/include/RemoteCommunicationKit/rcp.h"
    OR NOT EXISTS "${VALDI_HARMONY_RCP_LIBRARY}")
  message(FATAL_ERROR "Harmony HTTP requires the matching Huawei SDK RemoteCommunicationKit headers and library")
endif()
target_include_directories(valdi_harmony PRIVATE
  "${VALDI_HARMONY_HMS_SYSROOT}/usr/include")
# Preserve the pinned ClientSQL factory's static registration before postInit().
target_link_libraries(valdi_harmony PRIVATE ${VALDI_HARMONY_APP_RUNTIME_TARGET}
  "-Wl,--whole-archive" valdi_clientsql_ohos "-Wl,--no-whole-archive"
  ace_ndk.z ace_napi.z hilog_ndk.z rawfile.z native_drawing native_display_manager image_source image_packer pixelmap
  "${VALDI_HARMONY_RCP_LIBRARY}" asset_ndk.z uv crypto jsoncpp_static)
target_link_options(valdi_harmony PRIVATE "-Wl,--no-undefined")
