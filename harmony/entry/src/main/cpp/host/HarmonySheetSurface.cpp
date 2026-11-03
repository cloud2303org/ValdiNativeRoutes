#include "HarmonySheetSurface.hpp"

#include <arkui/native_interface.h>
#include <exception>
#include <initializer_list>
#include <stdexcept>
#include <utility>

namespace ValdiHarmony {
namespace {
constexpr float durationSeconds = 0.45f;
constexpr float omega = 8.0f / durationSeconds;

void check(int32_t status) {
    if (status != ARKUI_ERROR_CODE_NO_ERROR)
        throw std::runtime_error("Harmony sheet ArkUI operation failed");
}

void floats(ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle node, ArkUI_NodeAttributeType type,
            std::initializer_list<float> values) {
    ArkUI_NumberValue storage[9]{};
    int32_t count = 0;
    for (float value : values) storage[count++].f32 = value;
    ArkUI_AttributeItem item{storage, count};
    check(api.setAttribute(node, type, &item));
}

void integer(ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle node, ArkUI_NodeAttributeType type, int32_t value) {
    ArkUI_NumberValue storage{};
    storage.i32 = value;
    ArkUI_AttributeItem item{&storage, 1};
    check(api.setAttribute(node, type, &item));
}

void color(ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle node, uint32_t value) {
    ArkUI_NumberValue storage{};
    storage.u32 = value;
    ArkUI_AttributeItem item{&storage, 1};
    check(api.setAttribute(node, NODE_BACKGROUND_COLOR, &item));
}

void frame(ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle node, float x, float y, float width, float height) {
    floats(api, node, NODE_WIDTH, {width});
    floats(api, node, NODE_HEIGHT, {height});
    floats(api, node, NODE_POSITION, {x, y});
}

float boundedOffset(float value, float height) {
    if (!std::isfinite(value)) throw std::invalid_argument("Sheet offset must be finite vp");
    return std::clamp(value, 0.0f, height);
}

void inContext(ArkUI_ContextHandle context, const std::function<void()>& work) {
    struct Call {
        const std::function<void()>* work;
        std::exception_ptr error;
    } call{&work, {}};
    // SDK26 RunTaskInScope is synchronous. Bind freshly allocated nodes to the
    // supplied window rather than whichever ArkUI instance is currently active.
    check(OH_ArkUI_RunTaskInScope(context, &call, [](void* data) {
        auto& call = *static_cast<Call*>(data);
        try { (*call.work)(); }
        catch (...) { call.error = std::current_exception(); }
    }));
    if (call.error) std::rethrow_exception(call.error);
}
} // namespace

struct HarmonySheetSurface::Scrim {
    std::weak_ptr<HarmonySheetSurface> owner;
    bool receiver = false;
    bool registered = false;
};

struct HarmonySheetSurface::Animation {
    std::weak_ptr<HarmonySheetSurface> owner;
    ArkUI_NativeAnimateAPI_1* api = nullptr;
    ArkUI_AnimatorOption* option = nullptr;
    ArkUI_AnimatorHandle handle = nullptr;
    uint64_t generation = 0;
    float from = 0;
    float target = 0;
    float velocity = 0;
    float currentVelocity = 0;
    bool closing = false;
    Completion completion;

    ~Animation() {
        // Always destroyed on a later UI turn after cancel/finish has unwound.
        if (handle) api->disposeAnimator(handle);
        if (option) OH_ArkUI_AnimatorOption_Dispose(option);
    }
};

HarmonySheetSurface::HarmonySheetSurface(
    ArkUI_NativeNodeAPI_1& nodes, ArkUI_NativeAnimateAPI_1& animations,
    ArkUI_NodeContentHandle content, ArkUI_ContextHandle context,
    Defer defer, std::function<void()> onScrim)
    : _nodes(nodes), _animations(animations), _content(content), _context(context),
      _defer(std::move(defer)), _onScrim(std::move(onScrim)) {}

std::shared_ptr<HarmonySheetSurface> HarmonySheetSurface::create(
    ArkUI_NodeContentHandle content, ArkUI_ContextHandle context,
    Defer defer, std::function<void()> onScrim) {
    if (!content || !context || !defer) throw std::invalid_argument("Sheet needs NodeContent, UIContext and deferred UI queue");
    auto* nodes = static_cast<ArkUI_NativeNodeAPI_1*>(
        OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_NODE, "ArkUI_NativeNodeAPI_1"));
    auto* animations = static_cast<ArkUI_NativeAnimateAPI_1*>(
        OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_ANIMATE, "ArkUI_NativeAnimateAPI_1"));
    if (!nodes || !animations) throw std::runtime_error("Sheet native ArkUI interfaces unavailable");
    auto surface = std::shared_ptr<HarmonySheetSurface>(
        new HarmonySheetSurface(*nodes, *animations, content, context, std::move(defer), std::move(onScrim)));
    inContext(context, [&] { surface->initialize(); });
    return surface;
}

HarmonySheetSurface::~HarmonySheetSurface() {
    detach();
    dispose(); // Also rolls back a partially initialized, unpublished surface.
}

ArkUI_NodeHandle HarmonySheetSurface::makeStack() {
    auto node = _nodes.createNode(ARKUI_NODE_STACK);
    if (!node) throw std::runtime_error("Could not allocate sheet carrier node");
    try { _owned.push_back(node); }
    catch (...) { _nodes.disposeNode(node); throw; }
    check(_nodes.setLengthMetricUnit(node, ARKUI_LENGTH_METRIC_UNIT_VP));
    integer(_nodes, node, NODE_STACK_ALIGN_CONTENT, ARKUI_ALIGNMENT_TOP_START);
    return node;
}

void HarmonySheetSurface::append(ArkUI_NodeHandle parent, ArkUI_NodeHandle child) {
    // Reserve bookkeeping before the SDK mutation so allocation failure cannot
    // leave an untracked live edge.
    _edges.emplace_back(parent, child);
    try { check(_nodes.addChild(parent, child)); }
    catch (...) { _edges.pop_back(); throw; }
}

void HarmonySheetSurface::initialize() {
    _root = makeStack();
    _scrim = makeStack();
    _panel = makeStack();
    _handle = makeStack();
    _bar = makeStack();
    _viewport = makeStack();
    color(_nodes, _scrim, 0x66000000);
    color(_nodes, _panel, 0xFFFFFFFF);
    color(_nodes, _bar, 0xFFD1D5DB);
    floats(_nodes, _panel, NODE_BORDER_RADIUS, {20, 20, 0, 0});
    floats(_nodes, _bar, NODE_BORDER_RADIUS, {2});
    integer(_nodes, _root, NODE_CLIP, 1);
    integer(_nodes, _panel, NODE_CLIP, 1);
    integer(_nodes, _viewport, NODE_CLIP, 1);
    // DEFAULT includes descendants and blocks lower siblings. BLOCK would
    // incorrectly swallow the real Valdi page's controls.
    integer(_nodes, _root, NODE_HIT_TEST_BEHAVIOR, ARKUI_HIT_TEST_MODE_DEFAULT);
    integer(_nodes, _panel, NODE_HIT_TEST_BEHAVIOR, ARKUI_HIT_TEST_MODE_DEFAULT);
    integer(_nodes, _scrim, NODE_HIT_TEST_BEHAVIOR, ARKUI_HIT_TEST_MODE_BLOCK);
    append(_root, _scrim);
    append(_root, _panel);
    append(_panel, _handle);
    append(_panel, _viewport);
    append(_handle, _bar);
    _scrimEvent = std::make_unique<Scrim>();
    _scrimEvent->owner = weak_from_this();
    check(_nodes.addNodeEventReceiver(_scrim, scrimEvent));
    _scrimEvent->receiver = true;
    check(_nodes.registerNodeEvent(_scrim, NODE_ON_CLICK, 0, _scrimEvent.get()));
    _scrimEvent->registered = true;
    // Never expose an unsized or interactive first frame.
    integer(_nodes, _root, NODE_ENABLED, 0);
    integer(_nodes, _root, NODE_VISIBILITY, ARKUI_VISIBILITY_HIDDEN);
    check(OH_ArkUI_NodeContent_AddNode(_content, _root));
    _attached = true;
}

ArkUI_NodeHandle HarmonySheetSurface::viewport() const noexcept {
    return _detached ? nullptr : _viewport;
}

ArkUI_NodeHandle HarmonySheetSurface::interactionNode() const noexcept {
    return _attached && !_detached && !_retired ? _panel : nullptr;
}

void HarmonySheetSurface::layout(const HarmonySheetGeometry& geometry, float closedwardOffset) {
    if (_detached) return;
    auto keepAlive = shared_from_this();
    const float values[] = {geometry.rootWidth, geometry.rootHeight, geometry.panelHeight, geometry.panelTop,
                           geometry.handleHeight, geometry.contentHeight, geometry.keyboardCoveredRemainder};
    for (float value : values) {
        if (!std::isfinite(value) || value < 0) throw std::invalid_argument("Invalid sheet geometry");
    }
    if (geometry.panelHeight > geometry.rootHeight ||
        geometry.handleHeight + geometry.contentHeight > geometry.panelHeight ||
        geometry.panelTop > geometry.rootHeight - geometry.panelHeight)
        throw std::invalid_argument("Incoherent sheet geometry");
    const float directOffset = boundedOffset(closedwardOffset, geometry.panelHeight);
    auto animation = _animation;
    const float oldHeight = _geometry.panelHeight;
    const float oldOffset = _offset;
    Completion completion;
    float target = 0;
    float velocity = 0;
    if (animation) {
        completion = std::move(animation->completion);
        target = animation->closing ? geometry.panelHeight : std::min(animation->target, geometry.panelHeight);
        velocity = animation->currentVelocity;
        cancelAnimation();
    }
    _geometry = geometry;
    _laidOut = true;
    frame(_nodes, _root, 0, 0, geometry.rootWidth, geometry.rootHeight);
    frame(_nodes, _scrim, 0, 0, geometry.rootWidth, geometry.rootHeight);
    frame(_nodes, _panel, 0, geometry.panelTop, geometry.rootWidth, geometry.panelHeight);
    frame(_nodes, _handle, 0, 0, geometry.rootWidth, geometry.handleHeight);
    const float barWidth = std::min(36.0f, geometry.rootWidth);
    const float barHeight = std::min(4.0f, geometry.handleHeight);
    frame(_nodes, _bar, (geometry.rootWidth - barWidth) / 2,
          std::min(10.0f, geometry.handleHeight - barHeight), barWidth, barHeight);
    frame(_nodes, _viewport, 0, geometry.handleHeight, geometry.rootWidth, geometry.contentHeight);
    // Explicit per-corner clip: no reliance on background-only border rounding.
    // ClipType is an integer union member; set its exact SDK representation.
    ArkUI_NumberValue clip[] = {{.i32 = ARKUI_CLIP_TYPE_RECTANGLE}, {.f32 = geometry.rootWidth},
        {.f32 = geometry.panelHeight}, {.f32 = 0}, {.f32 = 0}, {.f32 = 20}, {.f32 = 0},
        {.f32 = 20}, {.f32 = 0}};
    ArkUI_AttributeItem clipItem{clip, 9};
    check(_nodes.setAttribute(_panel, NODE_CLIP_SHAPE, &clipItem));
    // Preserve the currently visible fraction while retargeting an animation.
    applyOffset(animation && oldHeight > 0 ? oldOffset / oldHeight * geometry.panelHeight : directOffset);
    // Numeric open/closed coordinates coincide when panelHeight is zero.
    // Restart with the original intent rather than reclassifying that zero.
    if (animation) startAnimation(target, velocity, std::move(completion), animation->closing);
}

void HarmonySheetSurface::applyOffset(float value) {
    _offset = boundedOffset(value, _geometry.panelHeight);
    floats(_nodes, _panel, NODE_TRANSLATE, {0, _offset, 0});
    const float progress = _geometry.panelHeight > 0 ? 1 - _offset / _geometry.panelHeight : 0;
    floats(_nodes, _scrim, NODE_OPACITY, {progress});
}

void HarmonySheetSurface::enqueue(std::function<void()> work) noexcept {
    // Continuing with discarded/inline work could free SDK callback userdata on
    // its own native stack. A broken dispatcher contract cannot be recovered by
    // a process-global retention list.
    try { _defer(std::move(work)); }
    catch (...) { std::terminate(); }
}

void HarmonySheetSurface::releaseAnimation(std::shared_ptr<Animation> animation) noexcept {
    if (!animation) return;
    enqueue([animation = std::move(animation)] {});
}

float HarmonySheetSurface::cancelAnimation() noexcept {
    ++_generation; // Before SDK Cancel, which may synchronously invoke onCancel.
    auto animation = std::exchange(_animation, {});
    if (animation) {
        animation->completion = {};
        if (animation->handle) OH_ArkUI_Animator_Cancel(animation->handle);
        releaseAnimation(std::move(animation));
    }
    return _offset;
}

void HarmonySheetSurface::animateTo(float closedwardOffset, float velocityVpPerSecond, Completion completion) {
    if (_detached || !_active || !_laidOut) throw std::runtime_error("Sheet animation requires active mounted layout");
    const float target = boundedOffset(closedwardOffset, _geometry.panelHeight);
    startAnimation(target, velocityVpPerSecond, std::move(completion), target == _geometry.panelHeight);
}

void HarmonySheetSurface::animateTo(
    float closedwardOffset, float velocityVpPerSecond, Completion completion, AnimationIntent intent) {
    startAnimation(closedwardOffset, velocityVpPerSecond, std::move(completion), intent == AnimationIntent::Closing);
}

void HarmonySheetSurface::startAnimation(
    float closedwardOffset, float velocityVpPerSecond, Completion completion, bool closing) {
    if (_detached || !_active || !_laidOut) throw std::runtime_error("Sheet animation requires active mounted layout");
    auto keepAlive = shared_from_this();
    const float target = boundedOffset(closedwardOffset, _geometry.panelHeight);
    if (!std::isfinite(velocityVpPerSecond)) throw std::invalid_argument("Sheet velocity must be finite vp/s");
    cancelAnimation();
    auto animation = std::make_shared<Animation>();
    animation->owner = weak_from_this();
    animation->api = &_animations;
    animation->generation = _generation;
    animation->from = _offset;
    animation->target = target;
    animation->closing = closing;
    const float distance = target - _offset;
    animation->velocity = distance == 0 ? 0 : std::clamp(velocityVpPerSecond / distance, -5.0f, 5.0f) * distance;
    animation->currentVelocity = animation->velocity;
    animation->completion = std::move(completion);
    animation->option = OH_ArkUI_AnimatorOption_Create(0);
    if (!animation->option) throw std::runtime_error("Could not allocate sheet animator options");
    check(OH_ArkUI_AnimatorOption_SetDuration(animation->option, 450));
    check(OH_ArkUI_AnimatorOption_SetIterations(animation->option, 1));
    check(OH_ArkUI_AnimatorOption_SetBegin(animation->option, 0));
    check(OH_ArkUI_AnimatorOption_SetEnd(animation->option, 1));
    // SDK26 documents nullptr as LINEAR. We sample the spring ourselves.
    check(OH_ArkUI_AnimatorOption_SetCurve(animation->option, nullptr));
    check(OH_ArkUI_AnimatorOption_RegisterOnFrameCallback(animation->option, animation.get(), animationFrame));
    check(OH_ArkUI_AnimatorOption_RegisterOnFinishCallback(animation->option, animation.get(), animationFinish));
    check(OH_ArkUI_AnimatorOption_RegisterOnCancelCallback(animation->option, animation.get(), animationCancel));
    _animation = animation; // Publish before create/play can reenter.
    try {
        animation->handle = _animations.createAnimator(_context, animation->option);
        if (!animation->handle) throw std::runtime_error("Could not create sheet animator");
        if (_animation != animation || _detached) {
            OH_ArkUI_Animator_Cancel(animation->handle);
            return;
        }
        check(OH_ArkUI_Animator_Play(animation->handle));
    } catch (...) {
        if (_animation == animation) cancelAnimation();
        throw;
    }
}

void HarmonySheetSurface::finishAnimation(bool settled) noexcept {
    auto animation = _animation;
    if (!animation) return;
    auto completion = std::move(animation->completion);
    cancelAnimation(); // Generation is terminal before invoking user code.
    if (completion) {
        try { completion(settled); }
        catch (...) { /* Never unwind user code through the SDK. */ }
    }
}

void HarmonySheetSurface::animationFrame(ArkUI_AnimatorOnFrameEvent* event) noexcept {
    auto* token = static_cast<Animation*>(OH_ArkUI_AnimatorOnFrameEvent_GetUserData(event));
    if (!token) return;
    auto owner = token->owner.lock();
    if (!owner) return;
    // Keep surface AND token beyond the outer SDK callback, even when the
    // callback retires the navigator and drops its last owning reference.
    auto animation = owner->_animation;
    owner->enqueue([owner, animation] {});
    if (!animation || animation.get() != token || token->generation != owner->_generation || owner->_detached) return;
    try {
        const float progress = OH_ArkUI_AnimatorOnFrameEvent_GetValue(event);
        if (!std::isfinite(progress)) throw std::runtime_error("Invalid sheet animator progress");
        const float time = std::clamp(progress, 0.0f, 1.0f) * durationSeconds;
        const float a = token->from - token->target;
        const float b = token->velocity + omega * a;
        const float decay = std::exp(-omega * time);
        token->currentVelocity = decay * (b - omega * (a + b * time));
        owner->applyOffset(token->target + decay * (a + b * time));
    } catch (...) {
        owner->finishAnimation(false);
    }
}

void HarmonySheetSurface::animationFinish(ArkUI_AnimatorEvent* event) noexcept {
    auto* token = static_cast<Animation*>(OH_ArkUI_AnimatorEvent_GetUserData(event));
    if (!token) return;
    auto owner = token->owner.lock();
    if (!owner) return;
    auto animation = owner->_animation;
    owner->enqueue([owner, animation] {});
    if (!animation || animation.get() != token || token->generation != owner->_generation || owner->_detached) return;
    try {
        owner->applyOffset(token->target);
        owner->finishAnimation(true);
    } catch (...) { owner->finishAnimation(false); }
}

void HarmonySheetSurface::animationCancel(ArkUI_AnimatorEvent* event) noexcept {
    auto* token = static_cast<Animation*>(OH_ArkUI_AnimatorEvent_GetUserData(event));
    if (!token) return;
    auto owner = token->owner.lock();
    if (!owner) return;
    auto animation = owner->_animation;
    owner->enqueue([owner, animation] {});
    if (!animation || animation.get() != token || token->generation != owner->_generation) return;
    owner->finishAnimation(false);
}

void HarmonySheetSurface::scrimEvent(ArkUI_NodeEvent* event) noexcept {
    auto* token = static_cast<Scrim*>(OH_ArkUI_NodeEvent_GetUserData(event));
    if (!token) return;
    auto owner = token->owner.lock();
    if (!owner) return;
    owner->enqueue([owner] {});
    if (owner->_detached || !owner->_active || !owner->_inputEnabled ||
        !owner->_laidOut || owner->_offset >= owner->_geometry.panelHeight) return;
    try {
        auto callback = owner->_onScrim; // Reentrant retire may clear the member.
        if (callback) callback();
    } catch (...) { /* Never unwind user code through the SDK. */ }
}

void HarmonySheetSurface::setActive(bool active) {
    if (_detached) return;
    auto keepAlive = shared_from_this();
    if (!active) cancelAnimation();
    _active = active;
    applyInputState();
    integer(_nodes, _root, NODE_VISIBILITY, active ? ARKUI_VISIBILITY_VISIBLE : ARKUI_VISIBILITY_HIDDEN);
}

void HarmonySheetSurface::setInputEnabled(bool enabled) {
    if (_detached || _retired) return;
    auto keepAlive = shared_from_this();
    _inputEnabled = enabled;
    applyInputState();
}

void HarmonySheetSurface::applyInputState() {
    const bool enabled = _active && _inputEnabled;
    integer(_nodes, _root, NODE_ENABLED, enabled ? 1 : 0);
    integer(_nodes, _root, NODE_HIT_TEST_BEHAVIOR,
            enabled ? ARKUI_HIT_TEST_MODE_DEFAULT : ARKUI_HIT_TEST_MODE_BLOCK_DESCENDANTS);
}

void HarmonySheetSurface::detach() noexcept {
    if (_detached) return;
    // Also called from the destructor, where weak_from_this is already expired.
    auto keepAlive = weak_from_this().lock();
    _detached = true;
    _active = false;
    _onScrim = {};
    cancelAnimation();
    if (_scrimEvent) {
        if (_scrimEvent->registered) _nodes.unregisterNodeEvent(_scrim, NODE_ON_CLICK);
        if (_scrimEvent->receiver) _nodes.removeNodeEventReceiver(_scrim, scrimEvent);
        _scrimEvent->registered = _scrimEvent->receiver = false;
    }
    if (_attached) {
        // Do not claim retirement succeeded while a live panel still occupies
        // the dedicated surface. Valid owned NodeContent removal must succeed.
        if (OH_ArkUI_NodeContent_RemoveNode(_content, _root) != ARKUI_ERROR_CODE_NO_ERROR) std::terminate();
        _attached = false;
    }
}

void HarmonySheetSurface::retire() noexcept {
    if (std::exchange(_retired, true)) return;
    auto keepAlive = shared_from_this();
    detach();
    enqueue([owner = std::move(keepAlive)] { owner->dispose(); });
}

void HarmonySheetSurface::dispose() noexcept {
    // No foreign page is disposed: Navigator owns and unmounts viewport's child.
    for (auto edge = _edges.rbegin(); edge != _edges.rend(); ++edge) _nodes.removeChild(edge->first, edge->second);
    _edges.clear();
    for (auto node = _owned.rbegin(); node != _owned.rend(); ++node) _nodes.disposeNode(*node);
    _owned.clear();
    _scrimEvent.reset();
    _root = _scrim = _panel = _handle = _bar = _viewport = nullptr;
    _content = nullptr;
    _context = nullptr;
}

} // namespace ValdiHarmony
