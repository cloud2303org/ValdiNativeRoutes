#pragma once

#include "HarmonyImageAsset.hpp"
#include "HarmonyImageFilterPolicy.hpp"
#include <functional>

namespace ValdiHarmony {

// Only null/undefined or a runtime-preprocessed, typed Valdi::ImageFilter.
Valdi::Result<HarmonyImageFilterSpec> snapshotHarmonyImageFilter(const Valdi::Value& associatedData);

// Worker-only, immutable source. Identity shares the bounded source without any
// Drawing metadata query/alpha requirement; an effective filter validates its
// SDK metadata and creates a new pixelmap. encodedWorkingBytes includes any extra encoded
// downloader/copy storage still live; at least the retained bytes are charged.
Valdi::Result<Valdi::Ref<HarmonyImageAsset>> filterHarmonyImage(
    const Valdi::Ref<HarmonyImageAsset>& source, const HarmonyImageFilterSpec& spec,
    const std::function<bool()>& wasCanceled, uint64_t encodedWorkingBytes = 0);

} // namespace ValdiHarmony
