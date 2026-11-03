#pragma once

#include "HarmonySheetGeometry.hpp"

#include <arkui/native_animate.h>
#include <arkui/native_node.h>
#include <cstdint>
#include <functional>
#include <memory>
#include <utility>
#include <vector>

namespace ValdiHarmony {

// UI-thread confined. Owns native nodes, not the page/root mounted in viewport().
// Navigator must unmount that root BEFORE retire(), and retain the dedicated
// NodeContent/UIContext through the queued disposal fence. No backend receivers
// or gesture bindings are installed here.
class HarmonySheetSurface final : public std::enable_shared_from_this<HarmonySheetSurface> {
public:
    // Must enqueue a nonthrowing task on a LATER UI turn, including during host
    // teardown. It must not run inline, discard work, or outlive the SDK context.
    using Defer = std::function<void(std::function<void()>)>;
    using Completion = std::function<void(bool settled)>;
    static std::shared_ptr<HarmonySheetSurface> create(
        ArkUI_NodeContentHandle content, ArkUI_ContextHandle context,
        Defer defer, std::function<void()> onScrim);
    ~HarmonySheetSurface();

    ArkUI_NodeHandle viewport() const noexcept;
    float currentOffset() const noexcept { return _offset; }
    float offset() const noexcept { return _offset; }
    // Positive offset/velocity move downward toward closed; closed=panelHeight.
    // An active animation ignores the caller offset, preserves its current
    // closedward fraction and retargets on resize to its terminal target.
    // For direct drag, cancelAnimation() first, then supply its logical offset.
    void layout(const HarmonySheetGeometry& geometry, float closedwardOffset);
    // Drives the entire panel (including handle/page) AND scrim. Completion is
    // true after exact final native writes, false for an SDK frame/finish error.
    // Explicit cancel, detach and retire revoke completion without calling it.
    // Synchronous allocation/start errors throw to the caller.
    void animateTo(float closedwardOffset, float velocityVpPerSecond, Completion completion);
    float cancelAnimation() noexcept;
    // Background: cancel settle, hide subtree, block all descendant hit tests.
    // Existing open/drag offset is preserved; Navigator decides whether to reset
    // an uncommitted drag before resuming.
    void setActive(bool active);
    // Terminal and idempotent; removes the carrier (and thus panel/scrim) from
    // NodeContent synchronously. retire also queues SDK/node disposal.
    void detach() noexcept;
    void retire() noexcept;

private:
    struct Scrim;
    struct Animation;
    HarmonySheetSurface(ArkUI_NativeNodeAPI_1& nodes, ArkUI_NativeAnimateAPI_1& animations,
                        ArkUI_NodeContentHandle content, ArkUI_ContextHandle context,
                        Defer defer, std::function<void()> onScrim);
    void initialize();
    ArkUI_NodeHandle makeStack();
    void append(ArkUI_NodeHandle parent, ArkUI_NodeHandle child);
    void applyOffset(float value);
    void finishAnimation(bool settled) noexcept;
    void releaseAnimation(std::shared_ptr<Animation> animation) noexcept;
    void enqueue(std::function<void()> work) noexcept;
    void dispose() noexcept;
    static void scrimEvent(ArkUI_NodeEvent* event) noexcept;
    static void animationFrame(ArkUI_AnimatorOnFrameEvent* event) noexcept;
    static void animationFinish(ArkUI_AnimatorEvent* event) noexcept;
    static void animationCancel(ArkUI_AnimatorEvent* event) noexcept;

    ArkUI_NativeNodeAPI_1& _nodes;
    ArkUI_NativeAnimateAPI_1& _animations;
    ArkUI_NodeContentHandle _content;
    ArkUI_ContextHandle _context;
    Defer _defer;
    std::function<void()> _onScrim;
    ArkUI_NodeHandle _root = nullptr;
    ArkUI_NodeHandle _scrim = nullptr;
    ArkUI_NodeHandle _panel = nullptr;
    ArkUI_NodeHandle _handle = nullptr;
    ArkUI_NodeHandle _bar = nullptr;
    ArkUI_NodeHandle _viewport = nullptr;
    std::vector<ArkUI_NodeHandle> _owned;
    std::vector<std::pair<ArkUI_NodeHandle, ArkUI_NodeHandle>> _edges;
    std::unique_ptr<Scrim> _scrimEvent;
    std::shared_ptr<Animation> _animation;
    HarmonySheetGeometry _geometry;
    uint64_t _generation = 0;
    float _offset = 0;
    bool _attached = false;
    bool _active = false;
    bool _laidOut = false;
    bool _detached = false;
    bool _retired = false;
};

} // namespace ValdiHarmony
