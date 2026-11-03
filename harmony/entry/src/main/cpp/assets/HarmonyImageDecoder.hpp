#pragma once

#include "HarmonyImageAsset.hpp"
#include "HarmonyImageFilterPolicy.hpp"
#include <functional>

namespace ValdiHarmony {

// Called on the worker. ownedBytes remains alive until after source destruction.
// A canceled result is only an internal status; the request gate suppresses delivery.
Valdi::Result<Valdi::Ref<Valdi::LoadedAsset>> decodeHarmonyImage(
    const Valdi::Ref<Valdi::Bytes>& ownedBytes, int32_t preferredWidth, int32_t preferredHeight,
    bool retainEncodedBytes, const std::function<bool()>& wasCanceled,
    const HarmonyImageFilterSpec& filter = {});

} // namespace ValdiHarmony
