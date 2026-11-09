cmake_minimum_required(VERSION 3.22)
project(ValdiRoutesNative C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(VALDI_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../.." ABSOLUTE)
find_program(VALDI_NODE node REQUIRED)
# Reconfigure the native graph when module selection or declarations change.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${VALDI_REPO_ROOT}/package.json"
  "${VALDI_REPO_ROOT}/scripts/native-modules.mjs" "${VALDI_REPO_ROOT}/scripts/module-native-config.mjs")
file(GLOB VALDI_MODULE_CONFIGS CONFIGURE_DEPENDS "${VALDI_REPO_ROOT}/valdi/modules/*/module.json")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${VALDI_MODULE_CONFIGS})
execute_process(COMMAND "${VALDI_NODE}" "${VALDI_REPO_ROOT}/scripts/native-dependencies.mjs" prepare android
  RESULT_VARIABLE VALDI_CHECK_RESULT ERROR_VARIABLE VALDI_CHECK_ERROR)
if(NOT VALDI_CHECK_RESULT EQUAL 0)
  message(FATAL_ERROR "${VALDI_CHECK_ERROR}")
endif()
execute_process(COMMAND "${VALDI_NODE}" "${VALDI_REPO_ROOT}/scripts/native-modules.mjs" --cmake
  OUTPUT_VARIABLE VALDI_MODULE_CMAKE RESULT_VARIABLE VALDI_MODULE_RESULT ERROR_VARIABLE VALDI_MODULE_ERROR)
if(NOT VALDI_MODULE_RESULT EQUAL 0)
  message(FATAL_ERROR "${VALDI_MODULE_ERROR}")
endif()
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/ValdiModules.cmake" "${VALDI_MODULE_CMAKE}")
include("${CMAKE_CURRENT_BINARY_DIR}/ValdiModules.cmake")
