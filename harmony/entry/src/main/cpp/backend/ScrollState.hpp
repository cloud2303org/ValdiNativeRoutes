#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>
#include <initializer_list>
#include <optional>
#include <utility>

namespace Valdi::Harmony::detail {

struct ScrollPoint {
    float x = 0, y = 0;
};

// Geometry is physical LTR, in Valdi points. ViewNode owns logical/RTL
// conversion. The ArkUI Scroll uses VP; only custom layout uses physical PX.
struct ScrollGeometry {
    float viewportWidth = 0, viewportHeight = 0;
    float contentWidth = 0, contentHeight = 0;
    bool horizontal = false;

    ScrollPoint contentExtent() const {
        return {horizontal ? std::max(viewportWidth, contentWidth) : viewportWidth,
                horizontal ? viewportHeight : std::max(viewportHeight, contentHeight)};
    }
    ScrollPoint clamp(ScrollPoint point) const {
        return {horizontal ? std::clamp(point.x, 0.0f, std::max(0.0f, contentWidth - viewportWidth)) : 0,
                horizontal ? 0 : std::clamp(point.y, 0.0f, std::max(0.0f, contentHeight - viewportHeight))};
    }
};

// SDK absolute offsets are sampled only on DID_SCROLL. Extra lifecycle events
// at the same position must not replace the last drag velocity with zero.
struct ScrollMotion {
    ScrollPoint previous, velocity;
    double timestamp = 0;
    bool initialized = false;
    void reset(ScrollPoint point, double time) {
        previous = point;
        velocity = {};
        timestamp = time;
        initialized = true;
    }
    void sample(ScrollPoint point, double time) {
        const double seconds = time - timestamp;
        if (initialized && seconds >= .001 && seconds <= .25) {
            velocity = {static_cast<float>((point.x - previous.x) / seconds),
                        static_cast<float>((point.y - previous.y) / seconds)};
        } else {
            velocity = {};
        }
        previous = point;
        timestamp = time;
        initialized = true;
    }
    void release(float speed, bool horizontal) {
        // The SDK reports one scalar gesture speed. Its magnitude is VP/s;
        // use observed content motion for the physical offset sign.
        auto& component = horizontal ? velocity.x : velocity.y;
        if (std::isfinite(speed) && std::abs(component) > .01f) {
            component = std::copysign(std::abs(speed), component);
        }
    }
};

// Consume flags BEFORE notifying runtime/JS. A callback can synchronously
// replace specs, detach the node, or cancel this same sequence.
struct ScrollSequence {
    uint64_t generation = 0;
    bool active = false, dragging = false;

    uint64_t replace(bool animated = false) {
        ++generation;
        active = animated;
        dragging = false;
        return generation;
    }
    bool startDrag() {
        if (dragging) return false;
        ++generation;
        active = dragging = true;
        return true;
    }
    bool endDrag() {
        return std::exchange(dragging, false);
    }
    struct Terminal { bool active, dragging; };
    Terminal finish() {
        Terminal terminal {active, dragging};
        active = dragging = false;
        return terminal;
    }
    bool current(uint64_t token) const { return token == generation; }
    bool stopOnDown(bool enabled, bool pendingAnimated = false) const {
        // A DOWN stops inertial/programmatic motion, never the drag receiving
        // that DOWN. A pending animated spec has not reached native layout yet.
        return enabled && !dragging && (active || pendingAnimated);
    }
};

enum class ScrollNoticeType { Scroll, StartDrag, EndDrag, CancelDrag, End };

// UI-owned lifecycle journal. A generation invalidates controller work and
// offset samples, not an accepted drag's already consumed lifecycle callbacks.
// Keep this policy independent of ArkUI/tree locking so the exact production
// queue and deferred-correction orderings can also execute on the host.
template<typename Point>
struct ScrollState : ScrollSequence {
    using NoticeType = ScrollNoticeType;
    struct Sample {
        Point offset, raw, velocity;
    };
    struct Notice : Sample {
        NoticeType type;
        uint64_t generation;
    };
    struct Correction {
        Point point;
        uint64_t generation;
    };
    std::deque<Notice> notices;
    std::optional<Correction> dragTarget;
    Point runtimeOffset {};
    bool hasSpecs = false;

    void enqueue(std::initializer_list<NoticeType> types, const Sample& sample) {
        for (auto type : types) {
            Notice notice {sample, type, generation};
            // Only adjacent samples coalesce; lifecycle order is durable.
            if (type == NoticeType::Scroll && !notices.empty() &&
                notices.back().type == type && notices.back().generation == generation) {
                notices.back() = notice;
            } else {
                notices.push_back(notice);
            }
        }
    }

    void finishNotices(const Sample& sample, bool notify = true) {
        auto terminal = finish(); // consume before any callback can reenter
        if (notify && terminal.dragging) enqueue({NoticeType::CancelDrag}, sample);
        if (notify && terminal.active) enqueue({NoticeType::End}, sample);
    }

    // The pinned runtime sends a nonanimated spec for content-size sync at
    // its last published offset, even during a native drag or animation.
    // Such a sync changes extents only; a controller write would stop motion.
    bool specs(const Point& point, bool geometryChanged, bool animated, const Sample& sample) {
        const bool geometryOnly = hasSpecs && geometryChanged && !animated &&
                                  point.x == runtimeOffset.x && point.y == runtimeOffset.y;
        hasSpecs = true;
        if (geometryOnly) return false;
        finishNotices(sample);
        replace(animated);
        dragTarget.reset();
        // Animated targets are not yet the runtime's published content offset.
        if (!animated) runtimeOffset = point;
        return true;
    }

    bool beginDrag(const Sample& sample) {
        if (dragging) return false;
        finishNotices(sample);
        dragTarget.reset(); // an old posted correction must not suppress new ends
        startDrag();
        enqueue({NoticeType::StartDrag}, sample);
        return true;
    }

    void release(const Sample& sample) {
        if (endDrag()) enqueue({NoticeType::EndDrag}, sample);
    }

    bool hasDragTarget(uint64_t token) const {
        return dragTarget && dragTarget->generation == token;
    }

    template<typename FinishRuntime, typename NotifyHistorical>
    void deliverEnd(const Notice& notice, FinishRuntime&& finishRuntime, NotifyHistorical&& notifyHistorical) const {
        if (notice.type != NoticeType::End || hasDragTarget(notice.generation)) return;
        // ViewNode::onScrollEnd clears its animation flag before calling JS.
        // An older terminal may notify JS, but cannot finish a newer motion.
        if (!current(notice.generation) && active) notifyHistorical();
        else finishRuntime();
    }

    void stop(const Sample& sample) {
        if (hasDragTarget(generation)) return;
        auto terminal = finish();
        if (terminal.active || terminal.dragging) enqueue({NoticeType::Scroll}, sample);
        if (terminal.dragging) enqueue({NoticeType::EndDrag}, sample);
        if (terminal.active) enqueue({NoticeType::End}, sample);
    }

    Terminal cancel(const Sample& sample, bool notify = true) {
        Terminal terminal {active, dragging};
        finishNotices(sample, notify);
        replace();
        dragTarget.reset();
        return terminal;
    }

    std::optional<Notice> nextNotice() {
        while (!notices.empty()) {
            auto notice = notices.front();
            notices.pop_front();
            if (notice.type == NoticeType::Scroll && !current(notice.generation)) continue;
            // Publish before dispatch: onScroll may synchronously resize the
            // content at exactly this offset from inside the callback.
            if (notice.type == NoticeType::Scroll) runtimeOffset = notice.offset;
            return notice;
        }
        return std::nullopt;
    }

    bool acceptDragTarget(const Notice& notice, const Point& point) {
        if (notice.type != NoticeType::EndDrag || !current(notice.generation)) return false;
        dragTarget = Correction {point, notice.generation};
        active = true; // includes release delivered after native STOP was consumed
        return true;
    }

    std::optional<Point> takeDragTarget(uint64_t token, uint64_t geometryRevision, uint64_t laidOutRevision) {
        // A stale posted task must neither apply nor clear a newer correction.
        if (!current(token) || !hasDragTarget(token)) return std::nullopt;
        // A geometry-only callback can retain the generation while growing the
        // content. Keep the target until ArkUI has laid out those new extents.
        if (laidOutRevision != geometryRevision) return std::nullopt;
        auto point = dragTarget->point;
        dragTarget.reset();
        return point;
    }
};

} // namespace Valdi::Harmony::detail
