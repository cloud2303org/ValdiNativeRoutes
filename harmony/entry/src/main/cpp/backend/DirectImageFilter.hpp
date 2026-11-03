#pragma once

#include "valdi_core/cpp/Attributes/ImageFilter.hpp"
#include "valdi_core/cpp/Resources/LoadedAsset.hpp"
#include "valdi_core/cpp/Utils/Result.hpp"
#include "valdi_core/cpp/Utils/Value.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"

namespace Valdi::Harmony::detail {

// Runs on the official srcOnLoad composite AFTER its parts were preprocessed.
// URL/resource assets go through the worker filter loader. Direct LoadedAsset
// bypasses it and setViewLoadedAsset has no associated-data argument, so reject
// effective filters before that path can silently present an unfiltered image.
inline Result<Value> preprocessDirectImageFilter(const Value& composite) {
    const auto* parts = composite.getArray();
    if (!parts || parts->size() != 4) return Error("Valdi ArkUI: invalid image srcOnLoad composite");
    if ((*parts)[0].getTypedRef<LoadedAsset>() == nullptr || (*parts)[3].isNullOrUndefined()) {
        return composite;
    }
    auto filter = (*parts)[3].getTypedRef<ImageFilter>();
    if (filter == nullptr) return Error("Valdi ArkUI: direct image filter requires typed ImageFilter");
    if (filter->getBlurRadius() != 0 || !filter->isIdentityColorMatrix()) {
        return Error("Valdi ArkUI: effective filters on direct LoadedAsset are unsupported; "
                     "use a URL/resource Asset through the Harmony image loader");
    }
    return composite;
}

} // namespace Valdi::Harmony::detail
