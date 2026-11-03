# Shared by the real app target and its object-only API probe.
function(valdi_harmony_configure_app_development target)
  target_compile_definitions(${target} PRIVATE
    VALDI_HARMONY_APPLICATION_DEBUG=$<IF:$<CONFIG:Debug>,1,0>
    VALDI_HARMONY_FULL_DEVELOPMENT=${VALDI_HARMONY_APP_FULL_DEVELOPMENT})
  if(VALDI_HARMONY_APP_FULL_DEVELOPMENT)
    set(_identity_file "${VALDI_PROJECT_ROOT}/harmony/AppScope/app.json5")
    file(READ "${_identity_file}" _identity)
    string(REGEX MATCH "\"bundleName\"[ \t\r\n]*:[ \t\r\n]*\"([A-Za-z0-9_.]+)\"" _match "${_identity}")
    if(NOT _match)
      message(FATAL_ERROR "Full development requires the exact AppScope bundleName")
    endif()
    target_compile_definitions(${target} PRIVATE VALDI_HARMONY_APPLICATION_ID="${CMAKE_MATCH_1}")
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${_identity_file}")
  endif()
endfunction()
