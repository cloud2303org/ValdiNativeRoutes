#include <window_manager/oh_display_manager.h>
#include <type_traits>

using DimensionQuery = NativeDisplayManager_ErrorCode (*)(int32_t*);
using DensityQuery = NativeDisplayManager_ErrorCode (*)(float*);
static_assert(std::is_same_v<decltype(&OH_NativeDisplayManager_GetDefaultDisplayWidth), DimensionQuery>);
static_assert(std::is_same_v<decltype(&OH_NativeDisplayManager_GetDefaultDisplayHeight), DimensionQuery>);
static_assert(std::is_same_v<decltype(&OH_NativeDisplayManager_GetDefaultDisplayDensityPixels), DensityQuery>);

// Never execute this SDK-stub probe. A strict link must resolve all three actual SDK exports.
extern "C" int deviceDisplaySDKProbe(int32_t* width, int32_t* height, float* density) {
    return OH_NativeDisplayManager_GetDefaultDisplayWidth(width) +
           OH_NativeDisplayManager_GetDefaultDisplayHeight(height) +
           OH_NativeDisplayManager_GetDefaultDisplayDensityPixels(density);
}
