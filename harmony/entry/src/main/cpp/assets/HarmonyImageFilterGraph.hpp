#pragma once

#include "HarmonyImageFilterPolicy.hpp"

namespace ValdiHarmony {

enum class ImageFilterRenderStatus { Success, Canceled, ColorMatrix, MatrixNode, BlurNode, Draw,
                                     PixelmapBinding, Canvas };

// Production graph orchestration shared with host fault-injection tests.
// Api owns the native surface/canvas. Its graph handles are RAII values.
// In particular blur MUST receive the matrix node, never the original input.
template<typename Api, typename IsCanceled>
ImageFilterRenderStatus renderHarmonyImageFilterGraph(
    Api& api, const HarmonyImageFilterSpec& spec, IsCanceled&& isCanceled) {
    if (isCanceled()) return ImageFilterRenderStatus::Canceled;
    typename Api::ColorOwner color;
    typename Api::FilterOwner matrix;
    typename Api::FilterOwner blur;
    if (spec.hasMatrix()) {
        color = api.createColorMatrix(spec.drawingMatrix());
        if (!color.value) return ImageFilterRenderStatus::ColorMatrix;
        matrix = api.createMatrixNode(color.value);
        if (!matrix.value) return ImageFilterRenderStatus::MatrixNode;
    }
    if (isCanceled()) return ImageFilterRenderStatus::Canceled;
    if (spec.sigma > 0) {
        blur = api.createClampedCroppedBlur(spec.sigma, matrix.value);
        if (!blur.value) return ImageFilterRenderStatus::BlurNode;
    }
    if (isCanceled()) return ImageFilterRenderStatus::Canceled;
    if (!api.draw(blur.value ? blur.value : matrix.value)) return ImageFilterRenderStatus::Draw;
    return isCanceled() ? ImageFilterRenderStatus::Canceled : ImageFilterRenderStatus::Success;
}

} // namespace ValdiHarmony
