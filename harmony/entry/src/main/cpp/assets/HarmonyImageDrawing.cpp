#include "HarmonyImageDrawing.hpp"
#include "HarmonyImageNativeOwner.hpp"

#include <native_drawing/drawing_brush.h>
#include <native_drawing/drawing_canvas.h>
#include <native_drawing/drawing_color_filter.h>
#include <native_drawing/drawing_filter.h>
#include <native_drawing/drawing_image_filter.h>
#include <native_drawing/drawing_pixel_map.h>
#include <native_drawing/drawing_rect.h>

namespace ValdiHarmony {
namespace {

class NativeDrawingFilter final {
public:
    using ColorOwner = ImageNativeOwner<OH_Drawing_ColorFilter, OH_Drawing_ColorFilterDestroy>;
    using FilterOwner = ImageNativeOwner<OH_Drawing_ImageFilter, OH_Drawing_ImageFilterDestroy>;

    NativeDrawingFilter(OH_Drawing_Canvas* canvas, OH_Drawing_PixelMap* source, OH_Drawing_Rect* extent)
        : _canvas(canvas), _source(source), _extent(extent) {}

    ColorOwner createColorMatrix(const std::array<float, 20>& matrix) {
        OH_Drawing_ErrorCodeReset();
        ColorOwner result(OH_Drawing_ColorFilterCreateMatrix(matrix.data()));
        if (OH_Drawing_ErrorCodeGet() != OH_DRAWING_SUCCESS) result.reset();
        return result;
    }
    FilterOwner createMatrixNode(OH_Drawing_ColorFilter* color) {
        OH_Drawing_ErrorCodeReset();
        FilterOwner result(OH_Drawing_ImageFilterCreateFromColorFilter(color, nullptr));
        if (OH_Drawing_ErrorCodeGet() != OH_DRAWING_SUCCESS) result.reset();
        return result;
    }
    FilterOwner createClampedCroppedBlur(float sigma, OH_Drawing_ImageFilter* matrix) {
        OH_Drawing_ErrorCodeReset();
        FilterOwner result(OH_Drawing_ImageFilterCreateBlurWithCrop(
            sigma, sigma, CLAMP, matrix, _extent));
        if (OH_Drawing_ErrorCodeGet() != OH_DRAWING_SUCCESS) result.reset();
        return result;
    }
    bool draw(OH_Drawing_ImageFilter* imageFilter) {
        OH_Drawing_ErrorCodeReset();
        ImageNativeOwner<OH_Drawing_Filter, OH_Drawing_FilterDestroy> filter(OH_Drawing_FilterCreate());
        ImageNativeOwner<OH_Drawing_Brush, OH_Drawing_BrushDestroy> brush(OH_Drawing_BrushCreate());
        if (!filter.value || !brush.value) return false;
        OH_Drawing_FilterSetImageFilter(filter.value, imageFilter);
        OH_Drawing_BrushSetFilter(brush.value, filter.value);
        OH_Drawing_BrushSetBlendMode(brush.value, BLEND_MODE_SRC);
        OH_Drawing_CanvasClear(_canvas, 0); // never blend with uninitialized destination bytes
        OH_Drawing_CanvasAttachBrush(_canvas, brush.value);
        if (OH_Drawing_ErrorCodeGet() != OH_DRAWING_SUCCESS) {
            OH_Drawing_CanvasDetachBrush(_canvas);
            return false;
        }
        auto code = OH_Drawing_CanvasDrawPixelMapRectConstraint(
            _canvas, _source, _extent, _extent, nullptr, STRICT_SRC_RECT_CONSTRAINT);
        const auto error = OH_Drawing_ErrorCodeGet();
        OH_Drawing_CanvasDetachBrush(_canvas);
        return code == OH_DRAWING_SUCCESS && error == OH_DRAWING_SUCCESS &&
               OH_Drawing_ErrorCodeGet() == OH_DRAWING_SUCCESS;
    }

private:
    OH_Drawing_Canvas* _canvas;
    OH_Drawing_PixelMap* _source;
    OH_Drawing_Rect* _extent;
};

} // namespace

ImageFilterRenderStatus drawHarmonyImageFilterPixels(
    OH_PixelmapNative* source, OH_PixelmapNative* destination, uint32_t width, uint32_t height,
    const HarmonyImageFilterSpec& spec, const std::function<bool()>& wasCanceled) {
    if (wasCanceled()) return ImageFilterRenderStatus::Canceled;
    if (!source || !destination || source == destination || !spec.valid() ||
        !ImageDecodePolicy::validDimensions(width, height)) return ImageFilterRenderStatus::PixelmapBinding;
    // Reverse destruction: canvas, source wrapper, destination wrapper, pixelmap.
    // The SDK requires the canvas to die before dissolving its pixelmap binding.
    OH_Drawing_ErrorCodeReset();
    ImageNativeOwner<OH_Drawing_PixelMap, OH_Drawing_PixelMapDissolve> drawingDestination(
        OH_Drawing_PixelMapGetFromOhPixelMapNative(destination));
    ImageNativeOwner<OH_Drawing_PixelMap, OH_Drawing_PixelMapDissolve> drawingSource(
        OH_Drawing_PixelMapGetFromOhPixelMapNative(source));
    if (!drawingDestination.value || !drawingSource.value) {
        return ImageFilterRenderStatus::PixelmapBinding;
    }
    ImageNativeOwner<OH_Drawing_Canvas, OH_Drawing_CanvasDestroy> canvas(
        OH_Drawing_CanvasCreateWithPixelMap(drawingDestination.value));
    ImageNativeOwner<OH_Drawing_Rect, OH_Drawing_RectDestroy> extent(
        OH_Drawing_RectCreate(0, 0, float(width), float(height)));
    if (!canvas.value || !extent.value || OH_Drawing_ErrorCodeGet() != OH_DRAWING_SUCCESS) {
        return ImageFilterRenderStatus::Canvas;
    }
    NativeDrawingFilter renderer(canvas.value, drawingSource.value, extent.value);
    return renderHarmonyImageFilterGraph(renderer, spec, wasCanceled);
}

} // namespace ValdiHarmony
