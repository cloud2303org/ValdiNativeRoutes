// Include at file scope, before namespace Valdi::Harmony. No Node dependency:
// this implementation can be compiled independently against the actual SDK.
#pragma once

#include "ShapeState.hpp"
#include "valdi/runtime/Attributes/AttributesBindingContext.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"

#include <native_drawing/drawing_brush.h>
#include <native_drawing/drawing_canvas.h>
#include <native_drawing/drawing_path.h>
#include <native_drawing/drawing_pen.h>
#include <native_drawing/drawing_rect.h>
#include <native_drawing/drawing_round_rect.h>

#include <memory>

namespace Valdi::Harmony::detail {

template <typename T, void (*Destroy)(T*)>
using ShapeDrawingHandle = std::unique_ptr<T, decltype(Destroy)>;

template <typename T>
static T* requireShapeDrawing(T* pointer) {
    if (!pointer) throw std::runtime_error("Valdi ArkUI: cannot allocate native shape drawing object");
    return pointer;
}

class ShapeDrawingVisitor final : public GeometricPathVisitor {
public:
    explicit ShapeDrawingVisitor(OH_Drawing_Path* path) : path(path) {}

    void moveTo(double x, double y) override {
        OH_Drawing_PathMoveTo(path, shapeFloat(x), shapeFloat(y));
    }
    void lineTo(double x, double y) override {
        OH_Drawing_PathLineTo(path, shapeFloat(x), shapeFloat(y));
    }
    // The business-imported utils/GeometricPathBuilder serializes endpoint
    // first, matching GeometricPathVisitor.hpp. Drawing takes controls first.
    void quadTo(double x, double y, double cx, double cy) override {
        OH_Drawing_PathQuadTo(path, shapeFloat(cx), shapeFloat(cy), shapeFloat(x), shapeFloat(y));
    }
    void cubicTo(double x, double y, double cx1, double cy1, double cx2, double cy2) override {
        OH_Drawing_PathCubicTo(path, shapeFloat(cx1), shapeFloat(cy1), shapeFloat(cx2), shapeFloat(cy2),
                               shapeFloat(x), shapeFloat(y));
    }
    void roundRectTo(double x, double y, double width, double height, double rx, double ry) override {
        ShapeDrawingHandle<OH_Drawing_Rect, OH_Drawing_RectDestroy> rect(
            requireShapeDrawing(OH_Drawing_RectCreate(shapeFloat(x), shapeFloat(y), shapeFloat(x + width),
                                                      shapeFloat(y + height))), OH_Drawing_RectDestroy);
        ShapeDrawingHandle<OH_Drawing_RoundRect, OH_Drawing_RoundRectDestroy> rounded(
            requireShapeDrawing(OH_Drawing_RoundRectCreate(rect.get(), shapeFloat(rx), shapeFloat(ry))),
            OH_Drawing_RoundRectDestroy);
        OH_Drawing_PathAddRoundRect(path, rounded.get(), PATH_DIRECTION_CW);
    }
    void arcTo(double cx, double cy, double rx, double ry, double start, double sweep) override {
        // GeometricPath uses radians; Drawing uses clockwise degrees. Split at
        // 180 degrees so full circles do not collapse under the SDK's modulo.
        const float left = shapeFloat(cx - rx), top = shapeFloat(cy - ry);
        const float right = shapeFloat(cx + rx), bottom = shapeFloat(cy + ry);
        const double degrees = 180 / ShapePath::pi;
        start = std::remainder(start, 2 * ShapePath::pi);
        const size_t segments = std::max<size_t>(1, static_cast<size_t>(std::ceil(std::abs(sweep) / ShapePath::pi)));
        const double step = sweep / static_cast<double>(segments);
        for (size_t i = 0; i < segments; ++i) {
            OH_Drawing_PathArcTo(path, left, top, right, bottom,
                shapeFloat((start + i * step) * degrees), shapeFloat(step * degrees));
        }
    }
    void close() override { OH_Drawing_PathClose(path); }

private:
    OH_Drawing_Path* path;
};

class NativeShape final {
public:
    ShapeState state;

    // Caller owns UI-thread enforcement and ON_DRAW registration. Borrow the
    // canvas only for this call. Width/height are the logical Valdi frame.
    void draw(OH_Drawing_Canvas* canvas, double width, double height, float scale) {
        if (!canvas) throw std::invalid_argument("shape draw event has no canvas");
        if (!std::isfinite(scale) || scale <= 0) throw std::invalid_argument("shape displayScale must be positive");
        shapeFloat(width);
        shapeFloat(height);
        if (width < 0 || height < 0) throw std::invalid_argument("shape frame must be nonnegative");
        if (state.path.empty() || width == 0 || height == 0) return;
        if (!path || cachedVersion != state.path.version() || width != cachedWidth || height != cachedHeight) {
            ShapeDrawingHandle<OH_Drawing_Path, OH_Drawing_PathDestroy> next(
                requireShapeDrawing(OH_Drawing_PathCreate()), OH_Drawing_PathDestroy);
            ShapeDrawingVisitor visitor(next.get());
            if (!state.path.visit(width, height, visitor)) throw std::invalid_argument("invalid shape path");
            OH_Drawing_PathSetFillType(next.get(), PATH_FILL_TYPE_WINDING);
            path = std::move(next);
            cachedVersion = state.path.version();
            cachedWidth = width;
            cachedHeight = height;
        }
        ShapeDrawingHandle<OH_Drawing_Brush, OH_Drawing_BrushDestroy> brush(nullptr, OH_Drawing_BrushDestroy);
        ShapeDrawingHandle<OH_Drawing_Pen, OH_Drawing_PenDestroy> pen(nullptr, OH_Drawing_PenDestroy);
        if (state.fill >> 24) {
            brush.reset(requireShapeDrawing(OH_Drawing_BrushCreate()));
            OH_Drawing_BrushSetAntiAlias(brush.get(), true);
            OH_Drawing_BrushSetColor(brush.get(), state.fill);
        }
        if ((state.stroke >> 24) && state.width > 0) {
            pen.reset(requireShapeDrawing(OH_Drawing_PenCreate()));
            OH_Drawing_PenSetAntiAlias(pen.get(), true);
            OH_Drawing_PenSetColor(pen.get(), state.stroke);
            OH_Drawing_PenSetWidth(pen.get(), state.width);
            OH_Drawing_PenSetCap(pen.get(), state.cap == ShapeCap::Round ? LINE_ROUND_CAP :
                state.cap == ShapeCap::Square ? LINE_SQUARE_CAP : LINE_FLAT_CAP);
            OH_Drawing_PenSetJoin(pen.get(), state.join == ShapeJoin::Round ? LINE_ROUND_JOIN :
                state.join == ShapeJoin::Bevel ? LINE_BEVEL_JOIN : LINE_MITER_JOIN);
            OH_Drawing_PenSetMiterLimit(pen.get(), 10);
        }
        OH_Drawing_CanvasSave(canvas);
        OH_Drawing_CanvasScale(canvas, scale, scale);
        OH_Drawing_CanvasDetachPen(canvas);
        OH_Drawing_CanvasDetachBrush(canvas);
        if (brush) {
            OH_Drawing_CanvasAttachBrush(canvas, brush.get());
            OH_Drawing_CanvasDrawPath(canvas, path.get());
            OH_Drawing_CanvasDetachBrush(canvas);
        }
        if (pen) {
            OH_Drawing_CanvasAttachPen(canvas, pen.get());
            OH_Drawing_CanvasDrawPath(canvas, path.get());
            OH_Drawing_CanvasDetachPen(canvas);
        }
        OH_Drawing_CanvasRestore(canvas);
    }

private:
    ShapeDrawingHandle<OH_Drawing_Path, OH_Drawing_PathDestroy> path {nullptr, OH_Drawing_PathDestroy};
    uint64_t cachedVersion = 0;
    double cachedWidth = -1, cachedHeight = -1;
};

inline bool shapeAttribute(NativeShape& shape, const StringBox& name, const Value& value) {
    const auto key = name.toStringView();
    if (key == "path") {
        const auto* array = value.getTypedArray();
        if (!array || array->getType() != TypedArrayType::Float64Array) {
            throw std::invalid_argument("shape path requires a Float64Array from GeometricPathBuilder");
        }
        const auto& bytes = array->getBuffer();
        shape.state.path.assign(bytes.data(), bytes.size());
    } else if (key == "fillColor" || key == "strokeColor") {
        if (!value.isNumber()) throw std::invalid_argument("shape color requires processed Valdi RGBA");
        const auto rgba = static_cast<uint32_t>(value.toLong());
        (key == "fillColor" ? shape.state.fill : shape.state.stroke) = (rgba >> 8) | (rgba << 24);
    } else if (key == "strokeWidth") {
        if (!value.isNumber()) throw std::invalid_argument("shape strokeWidth requires a number");
        shape.state.strokeWidth(value.toDouble());
    } else if (key == "strokeCap" || key == "strokeJoin") {
        if (!value.isString()) throw std::invalid_argument("shape cap/join requires a string");
        if (key == "strokeCap") shape.state.cap = shapeCap(value.toStringBox().toStringView());
        else shape.state.join = shapeJoin(value.toStringBox().toStringView());
    } else return false;
    return true;
}

inline bool resetShapeAttribute(NativeShape& shape, const StringBox& name) {
    const auto key = name.toStringView();
    if (key == "path") shape.state.path.clear();
    else if (key == "fillColor") shape.state.fill = 0;
    else if (key == "strokeColor") shape.state.stroke = 0;
    else if (key == "strokeWidth") shape.state.width = 1;
    else if (key == "strokeCap") shape.state.cap = ShapeCap::Butt;
    else if (key == "strokeJoin") shape.state.join = ShapeJoin::Miter;
    else return false;
    return true;
}

inline void bindShapeAttributes(AttributesBindingContext& binder, const Ref<AttributeHandlerDelegate>& delegate) {
    binder.bindUntypedAttribute(STRING_LITERAL("path"), false, delegate);
    binder.bindColorAttribute(STRING_LITERAL("fillColor"), false, delegate);
    binder.bindColorAttribute(STRING_LITERAL("strokeColor"), false, delegate);
    binder.bindDoubleAttribute(STRING_LITERAL("strokeWidth"), false, delegate);
    binder.bindStringAttribute(STRING_LITERAL("strokeCap"), false, delegate);
    binder.bindStringAttribute(STRING_LITERAL("strokeJoin"), false, delegate);
}

} // namespace Valdi::Harmony::detail
