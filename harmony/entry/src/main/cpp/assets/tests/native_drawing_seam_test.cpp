// Executes HarmonyImageDrawing.cpp itself with fault-injected C entry points.
// Function signatures come from the installed SDK headers, not handwritten ABI
// declarations. This checks production adapter behavior, not SDK pixel parity.
#include "../HarmonyImageDrawing.hpp"
#include <native_drawing/drawing_brush.h>
#include <native_drawing/drawing_canvas.h>
#include <native_drawing/drawing_color_filter.h>
#include <native_drawing/drawing_filter.h>
#include <native_drawing/drawing_image_filter.h>
#include <native_drawing/drawing_pixel_map.h>
#include <native_drawing/drawing_rect.h>

#include <cassert>
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct OH_PixelmapNative { bool isSource = false; int writes = 0; };
struct OH_Drawing_PixelMap { OH_PixelmapNative* map; int canvasReferences = 0; };
struct OH_Drawing_Rect { float right, bottom; };
struct OH_Drawing_ColorFilter { float redBias, alphaBias; };
struct OH_Drawing_ImageFilter { bool blur; OH_Drawing_ImageFilter* input; };
struct OH_Drawing_Filter { OH_Drawing_ImageFilter* image = nullptr; };
struct OH_Drawing_Brush { OH_Drawing_Filter* filter = nullptr; bool src = false; };
struct OH_Drawing_Canvas { OH_Drawing_PixelMap* target; OH_Drawing_Brush* brush = nullptr; };

namespace {
struct State {
    int allocations = 0;
    int live = 0;
    int failAllocation = 0;
    std::string failOperation;
    std::array<float, 20> forwardedMatrix{};
    OH_Drawing_ErrorCode error = OH_DRAWING_SUCCESS;
    std::vector<std::string> releases;
} state;

bool allocate() {
    if (++state.allocations == state.failAllocation) {
        state.error = OH_DRAWING_ERROR_ALLOCATION_FAILED;
        return false;
    }
    ++state.live;
    return true;
}
void operation(const char* name) {
    if (state.failOperation == name) state.error = OH_DRAWING_ERROR_INVALID_PARAMETER;
}
template<typename T>
void destroy(T* value, const char* name) {
    assert(value && state.live > 0);
    --state.live;
    state.releases.emplace_back(name);
    delete value;
}
} // namespace

extern "C" {
void OH_Drawing_ErrorCodeReset() { state.error = OH_DRAWING_SUCCESS; }
OH_Drawing_ErrorCode OH_Drawing_ErrorCodeGet() { return state.error; }

OH_Drawing_PixelMap* OH_Drawing_PixelMapGetFromOhPixelMapNative(OH_PixelmapNative* map) {
    return allocate() ? new OH_Drawing_PixelMap{map} : nullptr;
}
void OH_Drawing_PixelMapDissolve(OH_Drawing_PixelMap* map) {
    assert(map->canvasReferences == 0); // canvas must be destroyed first
    destroy(map, map->map->isSource ? "source binding" : "destination binding");
}
OH_Drawing_Canvas* OH_Drawing_CanvasCreateWithPixelMap(OH_Drawing_PixelMap* map) {
    assert(map && !map->map->isSource);
    if (!allocate()) return nullptr;
    ++map->canvasReferences;
    return new OH_Drawing_Canvas{map};
}
void OH_Drawing_CanvasDestroy(OH_Drawing_Canvas* canvas) {
    assert(!canvas->brush && canvas->target->canvasReferences == 1);
    --canvas->target->canvasReferences;
    destroy(canvas, "canvas");
}
OH_Drawing_Rect* OH_Drawing_RectCreate(float left, float top, float right, float bottom) {
    assert(left == 0 && top == 0 && right == 13 && bottom == 9);
    return allocate() ? new OH_Drawing_Rect{right, bottom} : nullptr;
}
void OH_Drawing_RectDestroy(OH_Drawing_Rect* rect) { destroy(rect, "extent"); }
OH_Drawing_ColorFilter* OH_Drawing_ColorFilterCreateMatrix(const float matrix[20]) {
    std::copy_n(matrix, state.forwardedMatrix.size(), state.forwardedMatrix.begin());
    return allocate() ? new OH_Drawing_ColorFilter{matrix[4], matrix[19]} : nullptr;
}
void OH_Drawing_ColorFilterDestroy(OH_Drawing_ColorFilter* filter) { destroy(filter, "color"); }
OH_Drawing_ImageFilter* OH_Drawing_ImageFilterCreateFromColorFilter(
    OH_Drawing_ColorFilter* color, OH_Drawing_ImageFilter* input) {
    assert(color && !input);
    return allocate() ? new OH_Drawing_ImageFilter{false, nullptr} : nullptr;
}
OH_Drawing_ImageFilter* OH_Drawing_ImageFilterCreateBlurWithCrop(
    float sigmaX, float sigmaY, OH_Drawing_TileMode tile,
    OH_Drawing_ImageFilter* input, const OH_Drawing_Rect* rect) {
    assert(sigmaX == 3.25f && sigmaY == 3.25f && tile == CLAMP);
    assert(input && !input->blur && rect->right == 13 && rect->bottom == 9);
    return allocate() ? new OH_Drawing_ImageFilter{true, input} : nullptr;
}
void OH_Drawing_ImageFilterDestroy(OH_Drawing_ImageFilter* filter) {
    destroy(filter, filter->blur ? "blur" : "matrix");
}
OH_Drawing_Filter* OH_Drawing_FilterCreate() {
    return allocate() ? new OH_Drawing_Filter{} : nullptr;
}
void OH_Drawing_FilterDestroy(OH_Drawing_Filter* filter) { destroy(filter, "filter"); }
void OH_Drawing_FilterSetImageFilter(OH_Drawing_Filter* filter, OH_Drawing_ImageFilter* image) {
    assert(filter && image && image->blur && image->input && !image->input->blur);
    filter->image = image;
    operation("set image filter");
}
OH_Drawing_Brush* OH_Drawing_BrushCreate() {
    return allocate() ? new OH_Drawing_Brush{} : nullptr;
}
void OH_Drawing_BrushDestroy(OH_Drawing_Brush* brush) { destroy(brush, "brush"); }
void OH_Drawing_BrushSetFilter(OH_Drawing_Brush* brush, OH_Drawing_Filter* filter) {
    brush->filter = filter;
    operation("set brush filter");
}
void OH_Drawing_BrushSetBlendMode(OH_Drawing_Brush* brush, OH_Drawing_BlendMode mode) {
    assert(mode == BLEND_MODE_SRC);
    brush->src = true;
    operation("blend");
}
void OH_Drawing_CanvasClear(OH_Drawing_Canvas* canvas, uint32_t color) {
    assert(color == 0 && !canvas->target->map->isSource);
    ++canvas->target->map->writes;
    operation("clear");
}
void OH_Drawing_CanvasAttachBrush(OH_Drawing_Canvas* canvas, const OH_Drawing_Brush* brush) {
    assert(brush && brush->filter && brush->filter->image && brush->src);
    canvas->brush = const_cast<OH_Drawing_Brush*>(brush);
    operation("attach");
}
void OH_Drawing_CanvasDetachBrush(OH_Drawing_Canvas* canvas) {
    canvas->brush = nullptr;
    operation("detach");
}
OH_Drawing_ErrorCode OH_Drawing_CanvasDrawPixelMapRectConstraint(
    OH_Drawing_Canvas* canvas, OH_Drawing_PixelMap* source,
    const OH_Drawing_Rect* src, const OH_Drawing_Rect* dst,
    const OH_Drawing_SamplingOptions* sampling, OH_Drawing_SrcRectConstraint constraint) {
    assert(source->map->isSource && source->map != canvas->target->map && canvas->brush);
    assert(src == dst && !sampling && constraint == STRICT_SRC_RECT_CONSTRAINT);
    ++canvas->target->map->writes;
    operation("draw");
    return state.error;
}
} // extern "C"

namespace {
using namespace ValdiHarmony;
HarmonyImageFilterSpec spec() {
    HarmonyImageFilterSpec result;
    result.matrix[4] = 1;
    result.matrix[19] = 0.25;
    result.sigma = 3.25f;
    return result;
}

void successAndOwnership() {
    state = {};
    OH_PixelmapNative source{true}, destination;
    assert(drawHarmonyImageFilterPixels(&source, &destination, 13, 9, spec(),
                                       [] { return false; }) == ImageFilterRenderStatus::Success);
    assert(state.allocations == 9 && state.live == 0);
    assert(state.forwardedMatrix == spec().matrix);
    assert(state.forwardedMatrix[4] == 1 && state.forwardedMatrix[19] == 0.25f);
    assert(source.writes == 0 && destination.writes == 2);
    assert((state.releases == std::vector<std::string>{
        "brush", "filter", "blur", "matrix", "color", "extent", "canvas",
        "source binding", "destination binding"}));
}

void normalizedMatrixForwarding() {
    std::array<HarmonyImageFilterSpec, 4> cases{spec(), spec(), spec(), spec()};
    cases[0].matrix = HarmonyImageFilterSpec{}.matrix;
    for (size_t row = 0; row < 3; ++row) {
        cases[0].matrix[row * 5 + row] = -1;
        cases[0].matrix[row * 5 + 4] = 1;
    }
    cases[1].matrix[4] = 0.25f;
    cases[1].matrix[9] = -0.125f;
    cases[1].matrix[14] = 0.0625f;
    cases[2].matrix[18] = 0.5f;
    cases[2].matrix[19] = 0.125f;
    for (size_t i = 0; i < 20; ++i) {
        cases[3].matrix[i] = (float(i) - 9.0f) / 16.0f;
    }
    for (const auto& matrixCase : cases) {
        state = {};
        OH_PixelmapNative source{true}, destination;
        assert(drawHarmonyImageFilterPixels(&source, &destination, 13, 9, matrixCase,
                                           [] { return false; }) == ImageFilterRenderStatus::Success);
        // Observe the argument delivered by the actual production adapter to
        // the SDK-typed C seam; this is not a claim about native output pixels.
        assert(state.forwardedMatrix == matrixCase.matrix);
        assert(state.live == 0 && source.writes == 0);
    }
}

void everyAllocationAndVoidError() {
    for (int failure = 1; failure <= 9; ++failure) {
        state = {};
        state.failAllocation = failure;
        OH_PixelmapNative source{true}, destination;
        assert(drawHarmonyImageFilterPixels(&source, &destination, 13, 9, spec(),
                                           [] { return false; }) != ImageFilterRenderStatus::Success);
        assert(state.live == 0 && source.writes == 0);
    }
    for (auto* operation : {"set image filter", "set brush filter", "blend",
                            "clear", "attach", "draw", "detach"}) {
        state = {};
        state.failOperation = operation;
        OH_PixelmapNative source{true}, destination;
        assert(drawHarmonyImageFilterPixels(&source, &destination, 13, 9, spec(),
                                           [] { return false; }) == ImageFilterRenderStatus::Draw);
        assert(state.live == 0 && source.writes == 0);
    }
}

void staleResultsAndSourceAliasing() {
    for (int cancelAt = 1; cancelAt <= 5; ++cancelAt) {
        state = {};
        int boundary = 0;
        OH_PixelmapNative source{true}, destination;
        assert(drawHarmonyImageFilterPixels(&source, &destination, 13, 9, spec(),
            [&] { return ++boundary == cancelAt; }) == ImageFilterRenderStatus::Canceled);
        assert(state.live == 0 && source.writes == 0);
    }
    state = {};
    OH_PixelmapNative source{true};
    assert(drawHarmonyImageFilterPixels(&source, &source, 13, 9, spec(),
                                       [] { return false; }) == ImageFilterRenderStatus::PixelmapBinding);
    assert(state.allocations == 0 && source.writes == 0);
}
} // namespace

int main() {
    successAndOwnership();
    normalizedMatrixForwarding();
    everyAllocationAndVoidError();
    staleResultsAndSourceAliasing();
    std::cout << "Production native Drawing seam: 4 groups passed (SDK-header-typed fault injection)\n";
}
