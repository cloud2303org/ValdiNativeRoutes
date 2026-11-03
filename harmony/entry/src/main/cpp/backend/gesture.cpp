#include "gesture.hpp"
#include "valdi/runtime/Attributes/AttributesBindingContext.hpp"
#include "valdi/runtime/Views/ViewAttributeHandlerDelegate.hpp"
#include "valdi_core/cpp/Constants.hpp"
#include "valdi_core/cpp/Utils/TimePoint.hpp"
#include "valdi_core/cpp/Utils/TrackedLock.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include <stdexcept>
#include <limits>

namespace Valdi::Harmony::detail {
namespace {
[[noreturn]] void fail(const std::string& message) {
    throw std::runtime_error("Valdi ArkUI: " + message);
}
void check(int32_t code, const char* operation) {
    if (code != ARKUI_ERROR_CODE_NO_ERROR)
        fail(std::string(operation) + " failed, ArkUI code " + std::to_string(code));
}
}
GesturePlatform::GesturePlatform(ArkUIConfiguration config)
    : configuration(std::move(config)) {}
GesturePlatform::~GesturePlatform() = default;

void GesturePlatform::report(const std::string& message) const noexcept {
    try { configuration.reportError("Valdi ArkUI: " + message); }
    catch (...) { std::terminate(); }
}

Value gestureWithState(const Value& original, int state) {
    // Value maps have shared storage. Copy the map before adding state so
    // snapshots retained for cancellation or queued JS calls remain immutable.
    Value copy;
    if (auto* map = original.getMap()) {
        for (const auto& entry : *map) copy.setMapValue(entry.first, entry.second);
    }
    copy.setMapValue(STRING_LITERAL("state"), Value(int32_t(state)));
    copy.setMapValue(STRING_LITERAL("eventTime"), Value(TimePoint::now().getTime()));
    return copy;
}

void dispatchGesture(GestureNode& node, const Ref<ValueFunction>& function, const Value& event) {
    auto callback = function;
    if (callback == nullptr || callback->ownerIsTearingDown()) return;
    // Preserve @makeMainThreadCallback / SyncWithMainThread, as the official
    // platforms do. Intermediate events may be coalesced; terminal events may
    // not. The JS wrapper bounds main-thread sync waits.
    const auto state = event.getMapValue(STRING_LITERAL("state")).toInt();
    auto result = callback->call(state == 1 ? ValueFunctionFlagsAllowThrottling :
                                ValueFunctionFlagsBoundedMainThreadSync, {event});
    if (!result) node.gesturePlatform()->report(result.error().toString());
}

bool admitGesturePredicate(GestureNode& node, const Ref<ValueFunction>& function, Value event) {
    auto callback = function;
    if (callback == nullptr) return true;
    if (callback->ownerIsTearingDown()) return false;
    DropAllTrackedLocks dropLocks;
    // The pinned JS implementation begins a MainThreadManager batch and runs
    // with MainThreadBatchAllowScope. endBatch can mutate native nodes before
    // this returns; callers must revalidate identity after this call. An
    // explicit JS->UI dispatchSync cannot be pumped by the host dispatcher and
    // may reach this deadline; the call is then rejected, never assumed true.
    auto result = callback->callSyncWithDeadline(kInputSyncCallDeadline,
                                                &event, 1, SyncCallTimeoutPolicy::SkipIfTimedOut);
    if (!result) {
        node.gesturePlatform()->report(result.error().toString());
        return false;
    }
    return result.value().toBool();
}

static Value touchEvent(GestureNode& node, const ArkUI_UIInputEvent* input, int state,
                        bool indexedCentroid = false, bool recognizerPointers = false) {
    if (!input) return gestureWithState(node.lastTouch, state);
    const auto scale = node.gesturePlatform()->configuration.displayScale;
    // SDK 26 recalculates local coordinates using the current native transform,
    // including translation/scale/rotation changed during an active sequence.
    Point physical(OH_ArkUI_PointerEvent_GetCurrentLocalX(input) / scale,
                   OH_ArkUI_PointerEvent_GetCurrentLocalY(input) / scale);
    const auto count = OH_ArkUI_PointerEvent_GetPointerCount(input);
    // In the SDK interruption callback the scalar "current local" accessor
    // returns zero, while indexed current-local positions contain the real
    // input. Use the indexed centroid for admission and multi-touch gestures.
    if (indexedCentroid && count != 0) {
        auto center = pointerCentroid(count, {physical.x, physical.y}, [&](uint32_t i) {
            return GesturePoint {OH_ArkUI_PointerEvent_GetCurrentLocalXByIndex(input, i) / scale,
                                 OH_ArkUI_PointerEvent_GetCurrentLocalYByIndex(input, i) / scale};
        });
        physical = Point(center.x, center.y);
    }
    auto location = node.convertGestureLocation({physical.x, physical.y});
    Point local(location.relative.x, location.relative.y);
    Point absolute(location.absolute.x, location.absolute.y);
    Value event;
    event.setMapValue(STRING_LITERAL("state"), Value(int32_t(state)));
    event.setMapValue(STRING_LITERAL("x"), Value(local.x));
    event.setMapValue(STRING_LITERAL("y"), Value(local.y));
    event.setMapValue(STRING_LITERAL("absoluteX"), Value(absolute.x));
    event.setMapValue(STRING_LITERAL("absoluteY"), Value(absolute.y));
    event.setMapValue(STRING_LITERAL("eventTime"), Value(TimePoint::now().getTime()));
    const auto action = OH_ArkUI_UIInputEvent_GetAction(input);
    uint32_t lifted = count;
    if (action == UI_TOUCH_EVENT_ACTION_UP && count != 0)
        check(OH_ArkUI_PointerEvent_GetChangedPointerId(input, &lifted), "read lifted touch index");
    std::vector<Value> pointers;
    pointers.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
        if (action == UI_TOUCH_EVENT_ACTION_CANCEL || i == lifted) continue;
        // Pointer locations retain native local orientation. Main event
        // location/delta/velocity/rotation use the Valdi logical conversion.
        GesturePoint point {OH_ArkUI_PointerEvent_GetCurrentLocalXByIndex(input, i) / scale,
                            OH_ArkUI_PointerEvent_GetCurrentLocalYByIndex(input, i) / scale};
        Value pointer;
        pointer.setMapValue(STRING_LITERAL("pointerId"), Value(recognizerPointers ?
            static_cast<int32_t>(pointers.size()) : OH_ArkUI_PointerEvent_GetPointerId(input, i)));
        pointer.setMapValue(STRING_LITERAL("x"), Value(point.x));
        pointer.setMapValue(STRING_LITERAL("y"), Value(point.y));
        pointers.emplace_back(std::move(pointer));
    }
    // Valdi int64 maps to the JS Long wrapper; TS requires a plain number.
    event.setMapValue(STRING_LITERAL("pointerCount"), Value(static_cast<int32_t>(pointers.size())));
    event.setMapValue(STRING_LITERAL("pointerLocations"), Value(ValueArray::make(std::move(pointers))));
    return event;
}

static Value gestureEvent(GestureNode& node, GestureKind kind, const ArkUI_GestureEvent* native, int state) {
    const bool derived = kind == GestureKind::Drag || kind == GestureKind::Pinch || kind == GestureKind::Rotate;
    Value event = touchEvent(node, OH_ArkUI_GestureEvent_GetRawInputEvent(native), state, true, derived);
    const auto scale = node.gesturePlatform()->configuration.displayScale;
    if (kind == GestureKind::Drag) {
        event.setMapValue(STRING_LITERAL("deltaX"), Value(logicalDelta(OH_ArkUI_PanGesture_GetOffsetX(native) / scale, node.rtl)));
        event.setMapValue(STRING_LITERAL("deltaY"), Value(OH_ArkUI_PanGesture_GetOffsetY(native) / scale));
        event.setMapValue(STRING_LITERAL("velocityX"), Value(logicalDelta(OH_ArkUI_PanGesture_GetVelocityX(native) / scale, node.rtl)));
        event.setMapValue(STRING_LITERAL("velocityY"), Value(OH_ArkUI_PanGesture_GetVelocityY(native) / scale));
    } else if (kind == GestureKind::Pinch) {
        event.setMapValue(STRING_LITERAL("scale"), Value(OH_ArkUI_PinchGesture_GetScale(native)));
    } else if (kind == GestureKind::Rotate) {
        event.setMapValue(STRING_LITERAL("rotation"), Value(rotationRadians(OH_ArkUI_RotationGesture_GetAngle(native), node.rtl)));
    }
    return event;
}

// Each callback arm carries only its owned lifetime and mounted identity.
// There is no recognizer state machine or cross-node winner ledger here.
using GestureMountPath = std::vector<std::pair<std::weak_ptr<GestureNode>, uint64_t>>;
static GestureMountPath gestureMountPath(std::shared_ptr<GestureNode> node) {
    GestureMountPath result;
    while (node) {
        for (const auto& item : result)
            if (item.first.lock() == node) fail("cyclic mounted gesture parent");
        result.emplace_back(node, node->gestureMountEpoch());
        node = node->gestureParent();
    }
    return result;
}
static bool gestureMountMatches(const GestureMountPath& captured, const std::shared_ptr<GestureNode>& node) {
    auto current = gestureMountPath(node);
    if (captured.size() != current.size()) return false;
    for (size_t i = 0; i < captured.size(); ++i) {
        auto previous = captured[i].first.lock();
        if (!previous || previous != current[i].first.lock() || captured[i].second != current[i].second) return false;
    }
    return true;
}
static int32_t nativeLongPressDuration(double seconds) {
    if (!std::isfinite(seconds) || seconds < 0) fail("longPressDuration must be finite nonnegative seconds");
    if (seconds == 0) return 0; // Explicit native default, not immediate recognition.
    const double milliseconds = std::ceil(seconds * 1000.0);
    if (!std::isfinite(milliseconds) || milliseconds > std::numeric_limits<int32_t>::max())
        fail("longPressDuration exceeds native int32 milliseconds");
    return static_cast<int32_t>(milliseconds);
}
struct GestureSlot {
    std::weak_ptr<GestureSet> owner;
    std::weak_ptr<GestureNode> node;
    GestureKind kind = GestureKind::Tap;
    ArkUI_GestureRecognizer* native = nullptr;
    GestureSequence sequence;
    GestureMountPath mounted;
    bool live = true;
    Value last;
    RootDragEvent lastRoot;
    std::function<void(const RootDragEvent&)> rootAction;
};

struct GestureSet : std::enable_shared_from_this<GestureSet> {
    using Slot = GestureSlot;
    std::weak_ptr<GestureNode> node;
    std::shared_ptr<GesturePlatform> backend;
    std::array<std::shared_ptr<Slot>, gestureCount> slots;
    ArkUI_GestureRecognizer* nativeGroup = nullptr;
    ArkUI_GestureRecognizer* continuousGroup = nullptr;
    std::vector<ArkUI_GestureRecognizer*> handles;
    std::vector<std::pair<ArkUI_GestureRecognizer*, ArkUI_GestureRecognizer*>> edges;
    std::vector<ArkUI_GestureRecognizer*> attached;
    bool live = true;
    bool retired = false;
    uint64_t generation = 0;

    explicit GestureSet(GestureNode& value) : node(value.retainGestureNode()), backend(value.gesturePlatform()), generation(value.gestureGeneration) {}

    bool current(const GestureNode& value) const {
        return live && generation == value.gestureGeneration && value.gestureInputEnabled();
    }
    ArkUI_GestureRecognizer* own(ArkUI_GestureRecognizer* recognizer) {
        if (!recognizer) fail("cannot create native gesture recognizer");
        handles.push_back(recognizer);
        return recognizer;
    }
    ArkUI_GestureRecognizer* group(ArkUI_GroupGestureMode mode) {
        return own(backend->gestures->createGroupGesture(mode));
    }
    void add(ArkUI_GestureRecognizer* group, ArkUI_GestureRecognizer* child) {
        check(backend->gestures->addChildGesture(group, child), "add native gesture to group");
        edges.emplace_back(group, child);
    }
    void attach(GestureNode& value, ArkUI_GestureRecognizer* recognizer, ArkUI_GesturePriority priority = NORMAL) {
        check(backend->gestures->addGestureToNode(value.handle, recognizer, priority, NORMAL_GESTURE_MASK),
              "attach native gesture");
        attached.push_back(recognizer);
    }
    void configure(GestureKind kind, ArkUI_GestureRecognizer* recognizer) {
        auto pointer = std::make_shared<Slot>();
        slots[static_cast<size_t>(kind)] = pointer;
        auto& slot = *pointer;
        slot.kind = kind;
        slot.native = own(recognizer);
        slot.owner = shared_from_this();
        slot.node = node;
        slot.mounted = gestureMountPath(node.lock());
        std::erase_if(backend->nativeSlots, [](const auto& item) { return item.expired(); });
        backend->nativeSlots.push_back(pointer);
        check(backend->gestures->setGestureEventTarget(recognizer,
              GESTURE_EVENT_ACTION_ACCEPT | GESTURE_EVENT_ACTION_UPDATE | GESTURE_EVENT_ACTION_END |
              GESTURE_EVENT_ACTION_CANCEL, &slot, receive), "set native gesture target");
    }
    static bool isContinuous(GestureKind kind) {
        return kind == GestureKind::Drag || kind == GestureKind::Pinch || kind == GestureKind::Rotate;
    }
    ArkUI_GestureRecognizer* create(GestureNode& value, GestureKind kind) {
        auto* api = backend->gestures;
        const auto scale = backend->configuration.displayScale;
        switch (kind) {
            case GestureKind::Tap: return api->createTapGesture(1, 1);
            case GestureKind::DoubleTap: return api->createTapGesture(2, 1);
            case GestureKind::LongPress: return api->createLongPressGesture(1, false, nativeLongPressDuration(value.longPressDuration));
            case GestureKind::Drag: return api->createPanGesture(1, GESTURE_DIRECTION_ALL, 0);
            case GestureKind::Pinch: return api->createPinchGesture(2, 0);
            case GestureKind::Rotate: return api->createRotationGesture(2, 1);
            case GestureKind::RootPan: return api->createPanGesture(1, GESTURE_DIRECTION_HORIZONTAL, 8 * scale);
            default: fail("invalid gesture kind");
        }
    }
    void unlink(ArkUI_GestureRecognizer* parent, ArkUI_GestureRecognizer* child) {
        check(backend->gestures->removeChildGesture(parent, child), "unlink changed gesture");
        std::erase(edges, std::pair {parent, child});
    }
    void disable(Slot& slot) {
        // Before the SDK instantiates a response-chain recognizer this is only
        // a gesture description. Native enable applies to a current recognizer.
        if (OH_ArkUI_IsGestureRecognizerValid(slot.native))
            check(OH_ArkUI_SetGestureRecognizerEnabled(slot.native, false), "disable retiring native gesture");
    }
    void remove(GestureNode& value, GestureKind kind) {
        auto slot = std::exchange(slots[static_cast<size_t>(kind)], nullptr);
        if (!slot) return;
        slot->live = false;
        const bool terminal = bool(slot->sequence.consume(GestureAction::Cancel));
        auto previousEvent = std::move(slot->last);
        auto rootAction = std::exchange(slot->rootAction, {});
        auto previousRoot = slot->lastRoot;
        disable(*slot);
        if (kind == GestureKind::RootPan) {
            check(backend->gestures->removeGestureFromNode(value.handle, slot->native), "remove root gesture");
            std::erase(attached, slot->native);
        } else {
            unlink(isContinuous(kind) ? continuousGroup : nativeGroup, slot->native);
        }
        backend->retiredSlots.push_back(slot);
        std::erase(handles, slot->native);
        if (kind != GestureKind::RootPan) orderNativeGroup();
        // Retain old userdata through an in-progress SDK callback, even when a
        // handler synchronously disables and re-enables this same gesture.
        auto platform = backend;
        backend->configuration.dispatchUI([platform, slot] {
            // Retain inert callback userdata, not ownership of a freed/reused
            // SDK address. Dispose itself may synchronously reenter admission.
            auto* native = std::exchange(slot->native, nullptr);
            if (native) platform->gestures->dispose(native);
        }, false);
        if (!terminal) return;
        if (kind == GestureKind::RootPan) {
            auto root = previousRoot;
            root.phase = RootGesturePhase::Cancelled;
            if (rootAction) rootAction(root);
        } else if (kind != GestureKind::LongPress) {
            dispatchGesture(value, value.gestureConfig[size_t(kind)].action, gestureWithState(previousEvent, 2));
        }
    }
    void orderNativeGroup() {
        // Native combined-gesture docs require double tap before single tap.
        // Reorder descriptions only; existing callback arms stay intact.
        auto edgesCopy = edges;
        for (const auto& edge : edgesCopy) if (edge.first == nativeGroup) unlink(edge.first, edge.second);
        for (auto kind : {GestureKind::DoubleTap, GestureKind::LongPress, GestureKind::Tap})
            if (auto slot = slots[size_t(kind)]) add(nativeGroup, slot->native);
        bool hasContinuous = false;
        for (auto kind : {GestureKind::Drag, GestureKind::Pinch, GestureKind::Rotate})
            hasContinuous |= bool(slots[size_t(kind)]);
        if (hasContinuous) add(nativeGroup, continuousGroup);
    }
    void install(GestureNode& value, GestureKind kind) {
        configure(kind, create(value, kind));
        auto* recognizer = slots[size_t(kind)]->native;
        if (kind == GestureKind::RootPan) attach(value, recognizer);
        else {
            if (isContinuous(kind)) add(continuousGroup, recognizer);
            orderNativeGroup();
        }
    }
    void installPublic(GestureNode& value) {
        nativeGroup = group(EXCLUSIVE_GROUP);
        continuousGroup = group(PARALLEL_GROUP);
        bool populated = false;
        for (size_t i = 0; i < value.gestureConfig.size(); ++i) {
            const auto& config = value.gestureConfig[i];
            if (config.action == nullptr || config.disabled) continue;
            install(value, GestureKind(i));
            populated = true;
        }
        // Attach creates the native recognizer hierarchy immediately. Build
        // every child first; never install an empty description as an arena.
        if (populated) attach(value, nativeGroup, NORMAL);
    }
    void retirePublic(GestureNode& value) {
        auto* previousGroup = std::exchange(nativeGroup, nullptr);
        continuousGroup = nullptr;
        auto previousHandles = std::move(handles);
        handles.clear();
        if (auto root = slots[size_t(GestureKind::RootPan)]) {
            std::erase(previousHandles, root->native);
            handles.push_back(root->native);
        }
        auto previousEdges = std::move(edges);
        edges.clear();
        std::vector<std::shared_ptr<Slot>> previousSlots;
        std::vector<std::pair<GestureKind, Value>> terminals;
        for (size_t i = 0; i < value.gestureConfig.size(); ++i) {
            auto slot = std::exchange(slots[i], nullptr);
            if (!slot) continue;
            slot->live = false;
            if (slot->sequence.consume(GestureAction::Cancel) && slot->kind != GestureKind::LongPress)
                terminals.emplace_back(slot->kind, gestureWithState(slot->last, 2));
            previousSlots.push_back(slot);
            backend->retiredSlots.push_back(std::move(slot));
        }
        for (const auto& slot : previousSlots) disable(*slot);
        if (std::find(attached.begin(), attached.end(), previousGroup) != attached.end()) {
            check(backend->gestures->removeGestureFromNode(value.handle, previousGroup), "detach changed native group");
            std::erase(attached, previousGroup);
        }
        auto platform = backend;
        if (!previousHandles.empty()) backend->configuration.dispatchUI(
            [platform, previousSlots = std::move(previousSlots), previousEdges = std::move(previousEdges),
             previousHandles = std::move(previousHandles)] {
                try {
                    for (auto it = previousEdges.rbegin(); it != previousEdges.rend(); ++it)
                        check(platform->gestures->removeChildGesture(it->first, it->second), "unlink retired public group");
                    for (const auto& slot : previousSlots) slot->native = nullptr;
                    for (auto it = previousHandles.rbegin(); it != previousHandles.rend(); ++it)
                        platform->gestures->dispose(*it);
                } catch (const std::exception& error) {
                    platform->report(error.what());
                    std::terminate();
                }
            }, false);
        // All old public arms are inert before any application reentry. Raw
        // observation and the separately attached host RootPan are retained.
        for (const auto& [kind, event] : terminals)
            dispatchGesture(value, value.gestureConfig[size_t(kind)].action, event);
    }
    void cancel(GestureNode& value) {
        live = false;
        // Clear all active flags before calling user code, permitting reentrant
        // unregister, route mutation, and shutdown without duplicate terminals.
        std::vector<std::pair<GestureKind, Value>> actions;
        std::vector<std::pair<std::function<void(const RootDragEvent&)>, RootDragEvent>> observers;
        for (auto& pointer : slots) {
            if (!pointer) continue;
            auto& slot = *pointer;
            disable(slot);
            slot.live = false;
            backend->retiredSlots.push_back(pointer);
            if (!slot.sequence.consume(GestureAction::Cancel)) continue;
            if (slot.kind == GestureKind::RootPan) {
                auto event = slot.lastRoot;
                event.phase = RootGesturePhase::Cancelled;
                if (slot.rootAction) observers.emplace_back(slot.rootAction, event);
            } else {
                if (slot.kind != GestureKind::LongPress) actions.emplace_back(slot.kind, gestureWithState(slot.last, 2));
            }
            slot.rootAction = {};
        }
        for (auto& action : actions) dispatchGesture(value, value.gestureConfig[static_cast<size_t>(action.first)].action, action.second);
        for (auto& observer : observers) observer.first(observer.second);
    }
    void retire(GestureNode& value) {
        if (retired) return;
        retired = true;
        // The cancellation callback can unmount or shut down the node. Snapshot
        // the attachment list first, then check whether its handle survived.
        auto toRemove = std::move(attached);
        attached.clear();
        cancel(value);
        // Detach before disposing the node. Keep both SDK wrappers and all C
        // userdata alive until after the current native callback has unwound.
        for (auto* recognizer : toRemove) {
            if (value.handle) check(backend->gestures->removeGestureFromNode(value.handle, recognizer), "remove native gesture");
        }
        auto self = shared_from_this();
        backend->configuration.dispatchUI([self] {
            try {
                // Native groups retain the underlying gestures. Remove edges
                // explicitly, then release every independently allocated wrapper.
                for (auto it = self->edges.rbegin(); it != self->edges.rend(); ++it) {
                    check(self->backend->gestures->removeChildGesture(it->first, it->second), "unlink native gesture group");
                }
                self->edges.clear();
                // Groups can release native state during disposal too. Remove
                // all routing identities before the first SDK dispose call.
                for (const auto& pointer : self->slots)
                    if (pointer) pointer->native = nullptr;
                for (auto it = self->handles.rbegin(); it != self->handles.rend(); ++it) self->backend->gestures->dispose(*it);
                self->handles.clear();
            } catch (const std::exception& error) {
                self->backend->report(error.what());
                std::terminate();
            }
        }, false);
    }
    static RootDragEvent rootEvent(const ArkUI_GestureEvent* event, float scale, RootGesturePhase phase,
                                   bool candidate = false) {
        RootDragEvent result;
        result.phase = phase;
        auto* input = OH_ArkUI_GestureEvent_GetRawInputEvent(event);
        result.x = input ? OH_ArkUI_PointerEvent_GetCurrentLocalX(input) / scale : 0;
        result.y = input ? OH_ArkUI_PointerEvent_GetCurrentLocalY(input) / scale : 0;
        if (input && candidate) {
            auto count = OH_ArkUI_PointerEvent_GetPointerCount(input);
            auto center = pointerCentroid(count, {result.x, result.y}, [&](uint32_t i) {
                return GesturePoint {OH_ArkUI_PointerEvent_GetCurrentLocalXByIndex(input, i) / scale,
                                     OH_ArkUI_PointerEvent_GetCurrentLocalYByIndex(input, i) / scale};
            });
            result.x = center.x;
            result.y = center.y;
        }
        result.dx = OH_ArkUI_PanGesture_GetOffsetX(event) / scale;
        result.dy = OH_ArkUI_PanGesture_GetOffsetY(event) / scale;
        result.velocityX = OH_ArkUI_PanGesture_GetVelocityX(event) / scale;
        result.velocityY = OH_ArkUI_PanGesture_GetVelocityY(event) / scale;
        return result;
    }
    static void receive(ArkUI_GestureEvent* event, void* data) noexcept {
        auto* raw = static_cast<Slot*>(data);
        auto self = raw ? raw->owner.lock() : nullptr;
        if (!self) return;
        auto value = self->node.lock();
        if (!value) return;
        try {
            if (!self->current(*value) || !raw->live || !gestureMountMatches(raw->mounted, value)) return;
            auto action = OH_ArkUI_GestureEvent_GetActionType(event);
            const auto nativeAction = action == GESTURE_EVENT_ACTION_ACCEPT ? GestureAction::Accept :
                action == GESTURE_EVENT_ACTION_UPDATE ? GestureAction::Update :
                action == GESTURE_EVENT_ACTION_END ? GestureAction::End : GestureAction::Cancel;
            if (self->slots[size_t(raw->kind)].get() != raw) return;
            const bool discrete = raw->kind == GestureKind::Tap || raw->kind == GestureKind::DoubleTap;
            const auto state = raw->sequence.consume(nativeAction, discrete);
            if (!state) return;
            if (raw->kind == GestureKind::RootPan) {
                auto phase = *state == 0 ? RootGesturePhase::Started : *state == 1 ? RootGesturePhase::Changed :
                    nativeAction == GestureAction::Cancel ? RootGesturePhase::Cancelled : RootGesturePhase::Ended;
                auto root = rootEvent(event, value->gesturePlatform()->configuration.displayScale, phase);
                // CANCEL may carry no raw event. Keep the last real measurement.
                if (nativeAction == GestureAction::Cancel) {
                    root = raw->lastRoot;
                    root.phase = phase;
                }
                raw->lastRoot = root;
                if (*state == 0) raw->rootAction = value->rootDragObserver.onEvent;
                auto callback = raw->rootAction;
                if (*state == 2) raw->rootAction = {};
                if (callback) callback(root);
            } else {
                Value js = nativeAction == GestureAction::Cancel ? gestureWithState(raw->last, *state) :
                    gestureEvent(*value, raw->kind, event, *state);
                raw->last = js;
                auto callback = value->gestureConfig[static_cast<size_t>(raw->kind)].action;
                // Valdi's nonrepeating long-press action is one activation.
                // Native END/CANCEL only consumes the callback sequence.
                if (raw->kind != GestureKind::LongPress || *state == 0) dispatchGesture(*value, callback, js);
            }
        } catch (const std::exception& error) {
            value->gesturePlatform()->report(error.what());
        }
    }
};

static void prepareNativeArms(GestureNode& node) {
    auto self = node.gestureSet;
    auto owner = node.retainGestureNode();
    if (!self || !owner) return;
    bool publicChanged = false;
    for (size_t i = 0; i < self->slots.size(); ++i) {
        auto slot = self->slots[i];
        if (!slot || gestureMountMatches(slot->mounted, owner)) continue;
        slot->sequence.active = false; // No callbacks into the rebound context.
        if (GestureKind(i) != GestureKind::RootPan) {
            publicChanged = true;
            continue;
        }
        self->remove(node, GestureKind::RootPan);
        if (!self->current(node) || node.gestureSet != self) return;
        if (node.rootDragObserver.admit && node.rootDragObserver.onEvent) self->install(node, GestureKind::RootPan);
    }
    if (publicChanged) {
        self->retirePublic(node);
        if (self->current(node) && node.gestureSet == self) self->installPublic(node);
    }
}
static std::shared_ptr<GestureSlot> nativeSlot(GesturePlatform& platform, ArkUI_GestureRecognizer* recognizer) {
    if (!recognizer) return {};
    for (auto it = platform.nativeSlots.rbegin(); it != platform.nativeSlots.rend(); ++it)
        if (auto slot = it->lock(); slot && slot->native == recognizer) return slot;
    return {};
}
static bool decideGestureAttempt(GestureNode& scope, ArkUI_GestureInterruptInfo* info) {
    auto host = scope.retainGestureNode();
    if (!host) return false;
    try {
        if (!host->gestureInputEnabled()) return false;
        auto platform = host->gesturePlatform();
        auto* recognizer = OH_ArkUI_GestureInterruptInfo_GetRecognizer(info);
        auto pointer = nativeSlot(*platform, recognizer);
        if (!pointer) return true; // Built-in/foreign competition belongs to ArkUI and existing host policy.
        auto value = pointer->node.lock();
        auto self = pointer->owner.lock();
        if (!value || !self || !self->current(*value) || !pointer->live || !gestureMountMatches(pointer->mounted, value)) return false;
        auto& slot = *pointer;
        if ((slot.kind == GestureKind::RootPan || slot.kind == GestureKind::Drag) && value->gestureWheelOwns(info))
            return false;
        auto* event = OH_ArkUI_GestureInterruptInfo_GetGestureEvent(info);
        if (!event) return false;
        bool admitted;
        if (slot.kind == GestureKind::RootPan) {
            auto callback = value->rootDragObserver.admit;
            auto root = GestureSet::rootEvent(event, platform->configuration.displayScale, RootGesturePhase::Started, true);
            admitted = callback && callback(root.x - root.dx, root.y - root.dy, root.dx, root.dy);
        } else {
            const auto revision = value->gestureAttributeRevision;
            const auto& config = value->gestureConfig[size_t(slot.kind)];
            admitted = config.action != nullptr && !config.disabled && admitGesturePredicate(*value, config.predicate,
                gestureEvent(*value, slot.kind, event,
                    slot.kind == GestureKind::Tap || slot.kind == GestureKind::DoubleTap ? 2 : 3));
            if (revision != value->gestureAttributeRevision) admitted = false;
        }
        return admitted && self->current(*value) && slot.live && self->slots[size_t(slot.kind)] == pointer &&
            gestureMountMatches(slot.mounted, value);
    } catch (const std::exception& error) {
        host->gesturePlatform()->report(error.what());
        return false;
    }
}

// API1/2 may still invoke callbacks cached by the current event flow after
// null-clear/dispose. Keep inactive weak userdata at platform lifetime, never
// resurrect Node or treat clearing the SDK callback as a memory fence.
class GestureRegistration : public std::enable_shared_from_this<GestureRegistration> {
public:
    std::weak_ptr<GestureNode> owner;
    std::weak_ptr<GesturePlatform> platform;
    ArkUI_NodeHandle handle = nullptr;
    uint64_t ownerIdentity = 0;
    GestureSourceKind kind = GestureSourceKind::View;
    GestureSourcePolicies policies;
    bool live = true;
    bool cleared = false;

    static ArkUI_GestureInterruptResult receive(ArkUI_GestureInterruptInfo* info) noexcept {
        auto* raw = static_cast<GestureRegistration*>(OH_ArkUI_GestureInterrupter_GetUserData(info));
        auto self = raw ? raw->weak_from_this().lock() : nullptr;
        if (!self || !self->live) return GESTURE_INTERRUPT_RESULT_REJECT;
        auto owner = self->owner.lock();
        auto platform = self->platform.lock();
        if (!owner || !platform) return GESTURE_INTERRUPT_RESULT_REJECT;
        try {
            const auto path = gestureMountPath(owner);
            const auto generation = owner->gestureGeneration;
            const auto handle = owner->handle;
            const auto current = [&] {
                return self->live && owner->handle == handle && generation == owner->gestureGeneration &&
                    owner->gestureInputEnabled() && gestureMountMatches(path, owner);
            };
            if (!current()) return GESTURE_INTERRUPT_RESULT_REJECT;
            auto wheel = self->policies.wheelAllows;
            if (wheel && !wheel(*owner, info)) return GESTURE_INTERRUPT_RESULT_REJECT;
            if (!current() || !decideGestureAttempt(*owner, info) || !current()) return GESTURE_INTERRUPT_RESULT_REJECT;
            auto sheet = self->policies.sheetAdmission;
            if (sheet) sheet(*owner, info);
            return current() ? GESTURE_INTERRUPT_RESULT_CONTINUE : GESTURE_INTERRUPT_RESULT_REJECT;
        } catch (const std::exception& error) {
            platform->report(error.what());
            return GESTURE_INTERRUPT_RESULT_REJECT;
        }
    }
};

bool retireGestureSources(GestureNode& node, ArkUI_NodeHandle handle) noexcept {
    auto platform = node.gesturePlatform();
    bool cleared = true;
    for (const auto& token : platform->registrations) {
        if (token->ownerIdentity != node.gestureSourceOwner || (handle && token->handle != handle)) continue;
        token->live = false;
        token->policies = {};
        if (!token->handle || token->cleared) continue;
        const auto rc = platform->gestures2->setGestureInterrupterToNode(token->handle, nullptr, nullptr);
        if (rc == ARKUI_ERROR_CODE_NO_ERROR) token->cleared = true;
        else { cleared = false; platform->report("native admission clear failed; inactive weak userdata retained"); }
    }
    return cleared;
}
void gestureNativeSourceDisposed(GesturePlatform& platform, ArkUI_NodeHandle handle) noexcept {
    for (const auto& token : platform.registrations)
        if (token->handle == handle) { token->live = false; token->handle = nullptr; token->policies = {}; }
}
void installGestureSource(GesturePlatform& platform, GestureNode& node, ArkUI_NodeHandle handle,
                          GestureSourceKind kind, GestureSourcePolicies policies) {
    if (!handle) fail("native admission requires owned node handle");
    if (!node.gestureSourceOwner) node.gestureSourceOwner = platform.nextRegistrationOwner++;
    for (const auto& token : platform.registrations)
        if (token->live && token->handle == handle && token->ownerIdentity == node.gestureSourceOwner) return;
    if (!retireGestureSources(node, handle)) fail("cannot replace uncleared native admission registration");
    auto token = std::make_shared<GestureRegistration>();
    token->owner = node.retainGestureNode();
    if (token->owner.expired()) fail("native admission host retention expired");
    token->platform = node.gesturePlatform();
    token->handle = handle;
    token->ownerIdentity = node.gestureSourceOwner;
    token->kind = kind;
    token->policies = std::move(policies);
    platform.registrations.push_back(token); // Own userdata BEFORE registration.
    const auto rc = platform.gestures2->setGestureInterrupterToNode(handle, token.get(), GestureRegistration::receive);
    if (rc != ARKUI_ERROR_CODE_NO_ERROR) {
        token->live = false;
        fail("register native gesture admission failed, ArkUI code " + std::to_string(rc));
    }
}

class GestureInputRegistration {
public:
    std::weak_ptr<GestureNode> owner;
    uint64_t ownerIdentity = 0;
    ArkUI_NodeHandle handle = nullptr;
    bool live = true;
};
void* gestureInputUserData(GestureNode& node) {
    auto platform = node.gesturePlatform();
    if (!node.gestureSourceOwner) node.gestureSourceOwner = platform->nextRegistrationOwner++;
    for (const auto& token : platform->inputRegistrations)
        if (token->live && token->ownerIdentity == node.gestureSourceOwner && token->handle == node.handle)
            return token.get();
    auto token = std::make_shared<GestureInputRegistration>();
    token->owner = node.retainGestureNode();
    if (token->owner.expired()) fail("native input host retention expired");
    token->handle = node.handle;
    token->ownerIdentity = node.gestureSourceOwner;
    platform->inputRegistrations.push_back(token);
    return token.get();
}
void gestureInputEvent(ArkUI_NodeEvent* event) noexcept {
    auto* token = static_cast<GestureInputRegistration*>(OH_ArkUI_NodeEvent_GetUserData(event));
    if (!token || !token->live) return;
    auto node = token->owner.lock();
    if (node && node->handle == token->handle) gestureInputEvent(*node, event);
}

void refreshGestures(GestureNode& node) {
    auto generation = ++node.gestureGeneration;
    auto previous = std::move(node.gestureSet);
    if (previous) previous->retire(node);
    if (generation != node.gestureGeneration) return;
    const auto platform = node.gesturePlatform();
    if (!node.handle || node.disposing || platform->suspended || platform->shuttingDown || platform->stopped) return;
    auto self = std::make_shared<GestureSet>(node);
    node.gestureSet = self;
    self->installPublic(node);
    if (node.rootDragObserver.onEvent && node.rootDragObserver.admit) self->install(node, GestureKind::RootPan);
    installGestureSource(*platform, node, node.handle, GestureSourceKind::View);
}

static void updateGesture(GestureNode& node, GestureKind kind, bool replace = false) {
    auto self = node.gestureSet;
    if (!self) { refreshGestures(node); return; }
    auto& config = node.gestureConfig[size_t(kind)];
    const bool available = config.action != nullptr && !config.disabled;
    if ((!self->slots[size_t(kind)] && !available) || (self->slots[size_t(kind)] && available && !replace)) return;
    const auto revision = ++node.gestureAttributeRevision;
    self->retirePublic(node);
    // Rebinding a native group can synchronously run application code.
    if (!self->live || node.gestureSet != self || revision != node.gestureAttributeRevision ||
        node.disposing || !node.handle) return;
    self->installPublic(node);
}


RawTerminal consumeRawTerminal(GestureNode& node, const Value& event) {
    RawTerminal terminal {node.touchActive || node.touchPending, gestureWithState(event, 2)};
    node.touchActive = node.touchPending = false;
    ++node.touchGeneration;
    node.touchDeadline.reset();
    return terminal;
}

void deliverRawTerminal(GestureNode& node, const RawTerminal& terminal) {
    if (!terminal.valid) return;
    // The source sequence has already been emptied. Generation changes caused
    // by all(Ended) cannot cause a second terminal. Like UIKit, look up the
    // current onTouchEnd after onTouch returns.
    dispatchGesture(node, node.onTouch, terminal.event);
    dispatchGesture(node, node.onTouchEnd, terminal.event);
}

static void deliverTouch(GestureNode& node, Value event, int state) {
    if (state == 2) {
        auto terminal = consumeRawTerminal(node, event);
        deliverRawTerminal(node, terminal);
        return;
    }
    auto generation = node.touchGeneration;
    if (state == 0) dispatchGesture(node, node.onTouchStart, event);
    if (generation != node.touchGeneration) return;
    dispatchGesture(node, node.onTouch, event);
    if (generation != node.touchGeneration) return;
}


static void scheduleRawTouchDelay(GestureNode& node, uint64_t token, double started, double duration) {
    const double remaining = std::max(0.0, duration - (TimePoint::now().getTime() - started));
    std::weak_ptr<GestureNode> weak = node.retainGestureNode();
    std::weak_ptr<GesturePlatform> owner = node.gesturePlatform();
    node.touchDeadline = std::make_unique<NativeDeadline>(std::min(remaining, 3600.0), [weak, owner, token, started, duration] {
        auto platform = owner.lock();
        if (!platform) return;
        platform->configuration.dispatchUI([weak, token, started, duration] {
            auto value = weak.lock();
            if (!value || value->touchGeneration != token || !value->touchPending || !value->gestureInputEnabled()) return;
            if (TimePoint::now().getTime() - started < duration) {
                scheduleRawTouchDelay(*value, token, started, duration);
                return;
            }
            value->touchPending = false;
            value->touchActive = true;
            dispatchGesture(*value, value->onTouchStart, gestureWithState(value->lastTouch, 0));
            if (value->touchGeneration == token)
                dispatchGesture(*value, value->onTouch, gestureWithState(value->lastTouch, 0));
        }, false);
    });
}

void cancelGestures(GestureNode& node, bool clearCallbacks) {
    auto keepAlive = node.retainGestureNode();
    ++node.gestureGeneration;
    // Retiring a drag may synchronously run JS and flush a nested cancel or
    // re-enable. Snapshot the *old* raw sequence before any such user code.
    auto rawTerminal = consumeRawTerminal(node, node.lastTouch);
    auto previous = std::move(node.gestureSet);
    // Retire and clear the native hooks before any retained action is released.
    if (previous) previous->retire(node);
    deliverRawTerminal(node, rawTerminal);
    if (clearCallbacks) {
        for (auto& config : node.gestureConfig) config = {};
        node.onTouch = node.onTouchStart = node.onTouchEnd = node.hitTest = nullptr;
        node.rootDragObserver = {};
        for (const auto& token : node.gesturePlatform()->inputRegistrations)
            if (token->ownerIdentity == node.gestureSourceOwner) token->live = false;
        node.unregisterGestureInput();
        retireGestureSources(node);
    }
}


void updateTouchRegion(GestureNode& node) {
    auto insets = TouchInsets::resolve(node.touchInsets);
    // The predicate filters the native response region. Only explicit public
    // extensions enlarge it; there is no synthetic unbounded UIKit traversal.
    if (insets.empty()) {
        check(node.gesturePlatform()->api->resetAttribute(node.handle, NODE_RESPONSE_REGION), "reset touch response region");
        return;
    }
    // ArkUI SetResponseRegion uses VP origins and divides percentage dimensions
    // by HUNDRED before creating native percent dimensions. 160 means 160%.
    const double width = node.frame.width, height = node.frame.height;
    const double left = insets.left;
    const double right = insets.right;
    std::array<ArkUI_NumberValue, 4> values {};
    values[0].f32 = -left;
    values[1].f32 = -insets.top;
    values[2].f32 = width > 0 ? std::max(0.0, width + left + right) / width * 100 : 0;
    values[3].f32 = height > 0 ? std::max(0.0, height + insets.top + insets.bottom) / height * 100 : 0;
    ArkUI_AttributeItem item {values.data(), 4, nullptr, nullptr};
    check(node.gesturePlatform()->api->setAttribute(node.handle, NODE_RESPONSE_REGION, &item), "set touch response region");
}

void gestureInputEvent(GestureNode& node, ArkUI_NodeEvent* native) noexcept {
    auto value = node.retainGestureNode();
    if (!value) return;
    try {
        auto* input = OH_ArkUI_NodeEvent_GetInputEvent(native);
        if (!input || !value->handle || value->disposing) return;
        const auto type = OH_ArkUI_NodeEvent_GetEventType(native);
        const auto action = OH_ArkUI_UIInputEvent_GetAction(input);
        if (type == NODE_ON_TOUCH_INTERCEPT) {
            if (!value->gestureInputEnabled()) {
                value->gestureIntercept(input, false);
                return;
            }
            if (action == UI_TOUCH_EVENT_ACTION_DOWN) {
                value->gestureTouchDown();
                // Scroll-end callbacks may synchronously dispose/unmount or
                // change hit testing. Do not consume/cancel the child's DOWN.
                if (!value->handle || value->disposing || !value->gestureInputEnabled()) return;
                prepareNativeArms(*value);
            }
            // The interception callback precedes child hit testing and executes
            // synchronously on the actual DOWN input, never on a synthetic tap.
            auto generation = value->gestureGeneration;
            bool hit = admitGesturePredicate(*value, value->hitTest, touchEvent(*value, input, 3));
            if (!hit || generation != value->gestureGeneration || !value->gestureInputEnabled()) {
                value->gestureIntercept(input, false);
                value->touchRejected = true;
            } else {
                if (action == UI_TOUCH_EVENT_ACTION_DOWN) prepareNativeArms(*value);
                value->touchRejected = false;
                // TriggerOnTouchIntercept installs the returned mode on the
                // FrameNode. Restore the saved policy even after a rejection.
                value->gestureIntercept(input, true);
            }
            return;
        }
        if (type != NODE_TOUCH_EVENT || !value->gestureInputEnabled() || value->touchRejected) return;
        if (!value->handle || value->disposing || !value->gestureInputEnabled()) return;
        // Raw publication delay retains the admitted DOWN until activation;
        // native recognizers still receive the original SDK input directly.
        if (action == UI_TOUCH_EVENT_ACTION_MOVE && value->touchPending && !value->touchActive) return;
        auto event = touchEvent(*value, input, 1);
        value->lastTouch = event;
        const auto count = OH_ArkUI_PointerEvent_GetPointerCount(input);
        if (action == UI_TOUCH_EVENT_ACTION_DOWN) {
            if (value->onTouch == nullptr && value->onTouchStart == nullptr && value->onTouchEnd == nullptr) return;
            auto token = ++value->touchGeneration;
            if (value->touchDelay > 0) {
                // A new DOWN restarts the requested raw publication delay
                // without clearing an already active observer.
                value->touchDeadline.reset();
                value->touchPending = true;
                scheduleRawTouchDelay(*value, token, TimePoint::now().getTime(), value->touchDelay);
            } else {
                value->touchDeadline.reset();
                value->touchPending = false;
                value->touchActive = true;
                deliverTouch(*value, gestureWithState(event, 0), 0);
            }
        } else if (action == UI_TOUCH_EVENT_ACTION_CANCEL || (action == UI_TOUCH_EVENT_ACTION_UP && count <= 1)) {
            if (!value->touchActive && !value->touchPending) return;
            deliverTouch(*value, event, 2);
        } else if (value->touchActive || (value->touchPending && action == UI_TOUCH_EVENT_ACTION_UP)) {
            deliverTouch(*value, event, 1);
        }
    } catch (const std::exception& error) {
        value->gesturePlatform()->report(error.what());
    }
}

bool gestureAttribute(GestureNode& node, const StringBox& name, const Value& value) {
    auto key = name.toStringView();
    auto function = [&]() -> Ref<ValueFunction> {
        if (value.isNullOrUndefined()) return nullptr;
        if (!value.isFunction()) fail(name.slowToString() + " must be a function");
        return value.getFunctionRef();
    };
    for (size_t i = 0; i < gestureNames.size(); ++i) {
        std::string base = gestureNames[i];
        auto& config = node.gestureConfig[i];
        bool wasAvailable = config.action != nullptr && !config.disabled;
        if (key == base) config.action = function();
        else if (key == base + "Predicate") config.predicate = function();
        else if (key == base + "Disabled") config.disabled = value.toBool();
        else continue;
        bool available = config.action != nullptr && !config.disabled;
        // Handler/predicate replacement is a live binding update. Only an
        // availability change alters the corresponding native recognizer.
        if (wasAvailable != available) updateGesture(node, static_cast<GestureKind>(i));
        return true;
    }
    if (key == "onTouch" || key == "onTouchStart" || key == "onTouchEnd") {
        auto callback = function();
        if (key == "onTouch") node.onTouch = std::move(callback);
        if (key == "onTouchStart") node.onTouchStart = std::move(callback);
        if (key == "onTouchEnd") node.onTouchEnd = std::move(callback);
        if (node.onTouch == nullptr && node.onTouchStart == nullptr && node.onTouchEnd == nullptr) {
            auto terminal = consumeRawTerminal(node, node.lastTouch);
            deliverRawTerminal(node, terminal);
        }
        return true;
    }
    if (key == "hitTest") {
        node.hitTest = function();
        updateTouchRegion(node);
        // A replacement predicate applies on the next native hit test; it must
        // not cancel accepted sequences during a normal render.
        return true;
    }
    if (key == "touchEnabled") {
        node.setGestureTouchEnabled(value.toBool());
        return true;
    }
    if (key == "longPressDuration" || key == "onTouchDelayDuration") {
        double duration = value.toDouble();
        if (!std::isfinite(duration) || duration < 0) fail(name.slowToString() + " must be finite nonnegative seconds");
        if (key == "longPressDuration") {
            (void)nativeLongPressDuration(duration);
            if (node.longPressDuration == duration) return true;
            node.longPressDuration = duration;
            updateGesture(node, GestureKind::LongPress, true);
        } else {
            node.touchDelay = duration;
        }
        return true;
    }
    const std::array<const char*, 5> insetNames {"touchAreaExtension", "touchAreaExtensionLeft", "touchAreaExtensionRight",
                                               "touchAreaExtensionTop", "touchAreaExtensionBottom"};
    for (size_t i = 0; i < insetNames.size(); ++i) {
        if (key != insetNames[i]) continue;
        if (value.isNullOrUndefined()) node.touchInsets[i].reset();
        else {
            double points = value.toDouble();
            if (!std::isfinite(points) || std::abs(points) > 1e6) fail("touchAreaExtension must be finite points");
            node.touchInsets[i] = points;
        }
        updateTouchRegion(node);
        return true;
    }
    return false;
}

bool resetGestureAttribute(GestureNode& node, const StringBox& name) {
    auto key = name.toStringView();
    for (const auto* base : gestureNames) {
        if (key == std::string(base) + "Disabled") return gestureAttribute(node, name, Value(false));
        if (key == base || key == std::string(base) + "Predicate") return gestureAttribute(node, name, Value::undefined());
    }
    if (key == "touchEnabled") return gestureAttribute(node, name, Value(true));
    if (key == "onTouchDelayDuration") return gestureAttribute(node, name, Value(0.0));
    if (key == "longPressDuration") return gestureAttribute(node, name, Value(0.0));
    if (key == "onTouch" || key == "onTouchStart" || key == "onTouchEnd" || key == "hitTest" ||
        key.substr(0, std::min<size_t>(key.size(), 18)) == "touchAreaExtension") {
        return gestureAttribute(node, name, Value::undefined());
    }
    return false;
}

void bindGestureAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate) {
    for (const auto* base : gestureNames) {
        binder.bindUntypedAttribute(StringBox::fromCString(base), false, delegate);
        binder.bindUntypedAttribute(StringBox::fromString(std::string(base) + "Predicate"), false, delegate);
        binder.bindBooleanAttribute(StringBox::fromString(std::string(base) + "Disabled"), false, delegate);
    }
    for (const auto* name : {"onTouch", "onTouchStart", "onTouchEnd", "hitTest"})
        binder.bindUntypedAttribute(StringBox::fromCString(name), false, delegate);
    binder.bindBooleanAttribute(STRING_LITERAL("touchEnabled"), false, delegate);
    for (const auto* name : {"longPressDuration", "onTouchDelayDuration", "touchAreaExtension", "touchAreaExtensionLeft",
                             "touchAreaExtensionRight", "touchAreaExtensionTop", "touchAreaExtensionBottom"})
        binder.bindDoubleAttribute(StringBox::fromCString(name), false, delegate);
}

} // namespace Valdi::Harmony::detail
