# Android-only patch for pinned OpenCV Mobile 4.13.0 (v36).
# CMake omits capture_v4l2.cpp on Android, but videocapture.cpp tests only
# __linux__. Match the Android exclusion already used by videowriter/highgui.
# Use the supported module-source hook to compile a private copy, never edit
# the vendor source shared with the iOS static builds.
if(NOT ANDROID OR NOT BUILD_SHARED_LIBS OR NOT the_module STREQUAL "opencv_highgui")
  message(FATAL_ERROR "The Vision highgui source patch is for Android shared builds only")
endif()
if(WITH_CVI OR WITH_AW OR WITH_RK)
  message(FATAL_ERROR "Android Vision declares no capture backend; board-specific CVI/AW/RK backends must stay OFF")
endif()

set(VISION_CAPTURE_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/src/videocapture.cpp")
file(SHA256 "${VISION_CAPTURE_SOURCE}" VISION_CAPTURE_SOURCE_SHA256)
if(NOT VISION_CAPTURE_SOURCE_SHA256 STREQUAL "b449272de5e4b0f33b15e98ef2d1e4b905248cf87806759990e652f15cf93b69")
  message(FATAL_ERROR "OpenCV Mobile videocapture.cpp changed; review the Android backend patch")
endif()
file(READ "${VISION_CAPTURE_SOURCE}" VISION_CAPTURE_SOURCE_TEXT)
string(REGEX MATCHALL "#if defined __linux__\n" VISION_CAPTURE_GUARDS "${VISION_CAPTURE_SOURCE_TEXT}")
list(LENGTH VISION_CAPTURE_GUARDS VISION_CAPTURE_GUARD_COUNT)
if(NOT VISION_CAPTURE_GUARD_COUNT EQUAL 5)
  message(FATAL_ERROR "Expected five Linux V4L2 guards in pinned videocapture.cpp")
endif()
string(REPLACE "#if defined __linux__\n" "#if defined __linux__ && !defined __ANDROID__\n"
  VISION_CAPTURE_PATCHED_TEXT "${VISION_CAPTURE_SOURCE_TEXT}")

set(VISION_CAPTURE_SNAPSHOT "${CMAKE_CURRENT_BINARY_DIR}/native-routes-android/videocapture.cpp")
file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/native-routes-android")
set(VISION_CAPTURE_OLD_TEXT "")
if(EXISTS "${VISION_CAPTURE_SNAPSHOT}")
  file(READ "${VISION_CAPTURE_SNAPSHOT}" VISION_CAPTURE_OLD_TEXT)
endif()
if(NOT "${VISION_CAPTURE_OLD_TEXT}" STREQUAL "${VISION_CAPTURE_PATCHED_TEXT}")
  file(WRITE "${VISION_CAPTURE_SNAPSHOT}" "${VISION_CAPTURE_PATCHED_TEXT}")
endif()
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${VISION_CAPTURE_SOURCE}")

# This hook runs inside ocv_set_module_sources, before it caches the source list.
list(FIND OPENCV_MODULE_opencv_highgui_SOURCES "${VISION_CAPTURE_SOURCE}" VISION_CAPTURE_SOURCE_INDEX)
if(VISION_CAPTURE_SOURCE_INDEX EQUAL -1)
  message(FATAL_ERROR "OpenCV highgui no longer lists the expected videocapture.cpp")
endif()
list(REMOVE_AT OPENCV_MODULE_opencv_highgui_SOURCES ${VISION_CAPTURE_SOURCE_INDEX})
list(INSERT OPENCV_MODULE_opencv_highgui_SOURCES ${VISION_CAPTURE_SOURCE_INDEX} "${VISION_CAPTURE_SNAPSHOT}")
message(STATUS "Android Vision highgui: image codecs retained; VideoCapture has no camera backend (desktop V4L2 excluded)")
