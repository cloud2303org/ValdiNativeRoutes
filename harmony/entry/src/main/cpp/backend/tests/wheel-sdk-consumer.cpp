#include "../ArkUIViewManager.hpp"
#include "../WheelState.hpp"
#include "valdi/runtime/Interfaces/IJavaScriptContext.hpp"
#include <type_traits>

using namespace Valdi;
using namespace Valdi::Harmony;
static_assert(sizeof(IJavaScriptContext) == 616, "current Context ABI required");
static_assert(3 * sizeof(JSValueRef) == 96);
static_assert(std::is_base_of_v<IViewManager, ArkUIViewManager>);

// Relocatable closure must resolve this call against the freshly compiled real
// manager, not a handwritten factory or an archived runtime.
bool consumeHarmonyWheelManager(ArkUIViewManager& manager) {
    return manager.supportsClassNameNatively(STRING_LITERAL("ArkUIColumnWheelView")) &&
           manager.supportsClassNameNatively(STRING_LITERAL("ArkUITimeWheelView")) &&
           manager.supportsClassNameNatively(STRING_LITERAL("ArkUITreeWheelView")) &&
           Valdi::Harmony::detail::wheelMonthDays(1900, 2) == 28 &&
           Valdi::Harmony::detail::wheelMonthDays(2000, 2) == 29 &&
           Valdi::Harmony::detail::wheelMonthDays(2100, 2) == 28;
}
