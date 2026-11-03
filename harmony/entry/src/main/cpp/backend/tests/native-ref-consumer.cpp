// Compile against the actual backend and pinned Valdi types for both SDK ABIs.
// This is an ABI/relocatable-closure check, not an emulated native-ref runtime.
#include "../ArkUIViewManager.hpp"
#include "../DirectImageFilter.hpp"
#include <type_traits>
#include <utility>

using namespace Valdi;
using namespace Valdi::Harmony;
static_assert(std::is_base_of_v<ValdiObject, ArkUIViewNodeRef>);
static_assert(std::is_same_v<decltype(std::declval<const ArkUIViewNodeRef&>().getView()), Result<Ref<View>>>);

Result<Ref<View>> resolveHarmonyNativeRef(const Value& opaque) {
    auto reference = opaque.getTypedRef<ArkUIViewNodeRef>();
    if (reference == nullptr) return Error("Expected opaque Harmony native node");
    return reference->getView(); // UI-only, applies getViewAndDisablePooling.
}

Result<Value> validateHarmonyDirectImageComposite(const Value& composite) {
    return Valdi::Harmony::detail::preprocessDirectImageFilter(composite);
}
