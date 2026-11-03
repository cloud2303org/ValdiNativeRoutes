#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <optional>
#include <memory>
#include <vector>
#include <utility>

namespace Valdi::Harmony::detail {

enum class GestureKind : size_t { Tap, DoubleTap, LongPress, Drag, Pinch, Rotate, RootPan, Count };
constexpr size_t gestureCount = static_cast<size_t>(GestureKind::Count);
constexpr std::array<const char*, 6> gestureNames {
    "onTap", "onDoubleTap", "onLongPress", "onDrag", "onPinch", "onRotate"};

// Canceled is a native terminal reason, not a fourth JS TouchEventState.
enum class GestureAction { Accept, Update, End, Cancel };
struct GestureSequence {
    bool active = false;
    std::optional<int> consume(GestureAction action, bool discrete = false) {
        if (discrete) return action == GestureAction::Accept ? std::optional<int>(2) : std::nullopt;
        switch (action) {
            case GestureAction::Accept:
                if (active) return std::nullopt;
                active = true;
                return 0;
            case GestureAction::Update:
                return active ? std::optional<int>(1) : std::nullopt;
            case GestureAction::End:
            case GestureAction::Cancel:
                if (!active) return std::nullopt;
                active = false;
                return 2;
        }
        return std::nullopt;
    }
};

template<class Actions, class Event>
struct TouchTerminalSnapshot {
    bool valid = false;
    Actions actions;
    Event event;
};

// Consume before running *any* terminal handler. A handler can synchronously
// disable/re-enable/remove its target or change touch delay; nested consumption
// must find an empty sequence while this snapshot keeps both terminal actions.
template<class Actions, class Event>
TouchTerminalSnapshot<Actions, Event> consumeTouchTerminal(bool& active, bool& pending, uint64_t& generation,
                                                         Actions& actions, Event event) {
    bool hadSequence = active || pending;
    active = pending = false;
    ++generation;
    return {hadSequence, std::exchange(actions, Actions {}), std::move(event)};
}

struct GesturePoint { double x = 0; double y = 0; };
template<class PointerAt>
GesturePoint pointerCentroid(uint32_t count, GesturePoint fallback, PointerAt pointerAt) {
    if (count == 0) return fallback;
    GesturePoint center;
    for (uint32_t i = 0; i < count; ++i) {
        auto point = pointerAt(i);
        center.x += point.x / count;
        center.y += point.y / count;
    }
    return center;
}

// Retain the complete registry before invoking a single synchronous callback;
// that callback can remove any later node from the live tree.
template<class T>
std::vector<std::shared_ptr<T>> retainRegistry(const std::vector<T*>& registry) {
    std::vector<std::shared_ptr<T>> snapshot;
    snapshot.reserve(registry.size());
    for (auto* node : registry) {
        if (auto retained = node->weak_from_this().lock()) snapshot.emplace_back(std::move(retained));
    }
    return snapshot;
}
inline GesturePoint logicalPoint(GesturePoint point, double width, bool rtl) {
    return {rtl ? width - point.x : point.x, point.y};
}
inline double logicalDelta(double delta, bool rtl) { return rtl ? -delta : delta; }
inline double rotationRadians(double degrees, bool rtl) {
    return logicalDelta(degrees * (3.14159265358979323846 / 180.0), rtl);
}


struct TouchInsets {
    double left = 0, right = 0, top = 0, bottom = 0;
    // Edges override the shorthand, independent of attribute delivery order.
    static TouchInsets resolve(const std::array<std::optional<double>, 5>& values) {
        double all = values[0].value_or(0);
        return {values[1].value_or(all), values[2].value_or(all),
                values[3].value_or(all), values[4].value_or(all)};
    }
    bool empty() const { return left == 0 && right == 0 && top == 0 && bottom == 0; }
};

// Coordinates expressed in the backend's committed geometry, never requiring
// the Valdi tree lock on the UI input path. Root output is logical layout
// position, matching ViewNode::convertPointToAbsoluteDirectionAgnostic.
inline GesturePoint addLogicalFrame(GesturePoint point, double x, double y,
                                    double width, double parentWidth, bool parentRTL) {
    return {point.x + (parentRTL ? parentWidth - x - width : x), point.y + y};
}

} // namespace Valdi::Harmony::detail
