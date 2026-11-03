// Real app headers plus the selected concrete asset. Object compilation only:
// no old context/core archive may satisfy this current-source interface check.
#include "harmony/entry/src/main/cpp/host/HarmonyNavigator.hpp"
#include "harmony/entry/src/main/cpp/host/HarmonyRuntimeHost.hpp"
#if VALDI_HARMONY_USE_FORK_UI_ASSETS
#include <HarmonyImageAsset.hpp>
#include <ArkUIImageAsset.hpp>
#else
#include "harmony/entry/src/main/cpp/assets/HarmonyImageAsset.hpp"
#endif
#include "valdi/runtime/Interfaces/IJavaScriptContext.hpp"
#include <type_traits>

static_assert(std::is_same_v<
    decltype(Valdi::Harmony::ArkUIConfiguration::dispatchWorker),
    std::function<bool(Valdi::DispatchFunction)>>);
#if VALDI_HARMONY_FORK_RUNTIME
static_assert(sizeof(Valdi::IJavaScriptContext) == 616,
              "Use the reviewed current-fork context layout, never old context archives");
static_assert(3 * sizeof(Valdi::JSValueRef) == 96,
              "The three map transport references add 96 bytes to the context");
#endif
#if VALDI_HARMONY_USE_FORK_UI_ASSETS
static_assert(std::is_base_of_v<Valdi::Harmony::ArkUIImageAsset, ValdiHarmony::HarmonyImageAsset>);
Valdi::Ref<Valdi::Harmony::ArkUIImageAsset> forkImageParent(
    const Valdi::Ref<Valdi::LoadedAsset>& asset) {
    return Valdi::castOrNull<Valdi::Harmony::ArkUIImageAsset>(asset);
}
#endif

// llvm-nm records the actual target layout independently of host architecture.
unsigned char forkUiAssetsContextLayout[sizeof(Valdi::IJavaScriptContext)];
unsigned char forkUiAssetsMapTransportFields[3 * sizeof(Valdi::JSValueRef)];
Valdi::Ref<Valdi::LoadedAsset> forkImageOwner(
    OH_PixelmapNative* pixelmap, ValdiHarmony::HarmonyImageAsset::Info info) {
    return Valdi::makeShared<ValdiHarmony::HarmonyImageAsset>(pixelmap, info);
}
