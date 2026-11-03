#pragma once

#include "valdi/runtime/Interfaces/IViewManager.hpp"
#include "valdi/runtime/Views/View.hpp"
#include "valdi_core/cpp/Utils/Bytes.hpp"
#include "valdi_core/cpp/Utils/Result.hpp"

#include <arkui/native_node.h>

#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace Valdi::Harmony {
struct SheetInteractionBinding;

namespace detail {
struct Backend;
struct Node;
}

struct AnimationDiagnostics {
    uint64_t id = 0;
    uint64_t frameCount = 0;
    // Bounded samples of actual native onFrame progress (at most 8).
    std::vector<float> progressSamples;
    bool cancelled = false;
};

// Root presentation values are separate from Yoga/custom-node layout frames.
// Translation is in Valdi points, rotation is in radians; scale pivots at center.
struct RootVisualState {
    float translationX = 0;
    float translationY = 0;
    float scaleX = 1;
    float scaleY = 1;
    float rotation = 0;
    float opacity = 1;
};

struct RootTween {
    Ref<View> root;
    RootVisualState from;
    RootVisualState to;
};

enum class RootGesturePhase { Started, Changed, Ended, Cancelled };

struct RootDragEvent {
    RootGesturePhase phase = RootGesturePhase::Started;
    // Root-local physical direction, in Valdi points (velocity in points/sec).
    float x = 0;
    float y = 0;
    float dx = 0;
    float dy = 0;
    float velocityX = 0;
    float velocityY = 0;
};

struct RootDragObserver {
    // Runs synchronously on UI at native PAN admission. Return false to reject.
    // x/y are the original DOWN point; dx/dy the displacement at admission.
    std::function<bool(float x, float y, float dx, float dy)> admit;
    std::function<void(const RootDragEvent&)> onEvent;
};

struct NativeTweenOptions {
    double duration = 0.3; // seconds per iteration, before speed scaling
    double delay = 0;      // seconds, before speed scaling
    double speed = 1;
    int iterations = 1;   // total plays, -1 = infinite
    bool autoreverses = false; // alternate direction on each iteration
    snap::valdi_core::AnimationType type = snap::valdi_core::AnimationType::EaseInOut;
    std::vector<double> controlPoints; // empty or cubic [x1,y1,x2,y2]
};

struct ArkUIConfiguration {
    // Physical pixels per Valdi point (normally Harmony display density).
    float displayScale = 1.0f;
    // Optional borrowed UIContext from OH_ArkUI_GetContextFromNapiValue.
    // All this manager's roots must belong to this instance. Host retains the
    // ArkTS UIContext/native handle until shutdown and UI cleanup have drained.
    ArkUI_ContextHandle uiContext = nullptr;
    std::function<bool()> isUIThread;
    // sync=true must finish before returning, propagate exceptions, and run inline on UI.
    // sync=false MUST enqueue (even on UI), never invoke inline.
    // The dispatcher must remain alive until the manager AND all views are released.
    std::function<void(DispatchFunction, bool sync)> dispatchUI;
    // Optional per-runtime worker admission for PNG snapshots. Never run inline
    // or on UI. true transfers work for exactly one eventual invocation; false
    // rejects without retaining/invoking work (e.g. an expired runtime holder).
    // Snapshot completion may run on that worker or on UI for cancellation.
    // It never dispatches back to UI after shutdown. No backend-owned worker.
    std::function<bool(DispatchFunction)> dispatchWorker;
    // Called on UI for failures in C callbacks, which cannot throw into ArkUI.
    std::function<void(const std::string&)> reportError;
    // Optional, UI-thread, once per terminal animation; no per-frame logging.
    // Must not throw. Frame samples come only from native animator callbacks.
    std::function<void(const AnimationDiagnostics&)> animationDiagnostics;
    // Optional UI-thread bundle font lookup returning owning bytes. Installed
    // before bootstrap. Rendering and measurement share process registrations.
    std::function<Result<BytesView>(const StringBox& module, const StringBox& name)> loadFontData;
};

class ArkUIView final : public View {
public:
    explicit ArkUIView(std::shared_ptr<detail::Node> node);
    ~ArkUIView() override;
    snap::valdi_core::Platform getPlatform() const override;
    // UI thread only. Borrowed; never dispose/reparent this node directly.
    ArkUI_NodeHandle nativeNode() const;
    const std::shared_ptr<detail::Node>& backendNode() const;
    VALDI_CLASS_HEADER(ArkUIView)

private:
    std::shared_ptr<detail::Node> _node;
};

// Opaque Valdi NativeNode / legacy NativeView token. Owns the logical node,
// never a cached ArkUI pointer or its backend. May outlive unmount/shutdown.
// The backing view accessor is UI-only and never waits for a busy tree lock.
class ArkUIViewNodeRef final : public ValdiObject {
public:
    ArkUIViewNodeRef(const Ref<ViewNode>& node, std::weak_ptr<detail::Backend> backend,
                     bool inPlatformReference);
    ~ArkUIViewNodeRef() override;
    bool isInPlatformReference() const { return _inPlatformReference; }
    Result<Ref<View>> getView() const;
    VALDI_CLASS_HEADER(ArkUIViewNodeRef)

private:
    Ref<ViewNode> _viewNode;
    Weak<ViewNodeTree> _tree;
    std::weak_ptr<detail::Backend> _backend;
    bool _inPlatformReference;
};

class ArkUIViewManager final : public IViewManager {
public:
    explicit ArkUIViewManager(ArkUIConfiguration configuration);
    ~ArkUIViewManager() override;

    // These calls marshal synchronously to UI. The host retains the root and
    // keeps NodeContent/native parent alive until unmountRoot() returns.
    Ref<View> createRootView();
    void mountRoot(const Ref<View>& root, ArkUI_NodeContentHandle content);
    void mountRoot(const Ref<View>& root, ArkUI_NodeContentHandle content, int index);
    void mountRootInParent(const Ref<View>& root, ArkUI_NodeHandle parent, int index = 0);
    void unmountRoot(const Ref<View>& root);
    // Valdi intentionally never sends setViewFrame() for its root.
    // Call with the same point dimensions/direction as ViewNodeTree::setLayoutSpecs().
    void setRootSize(const Ref<View>& root, Size size, bool isRightToLeft = false);
    // UI thread only. Opt-in full-viewport overlay: empty root/layout areas
    // pass to siblings; interactive descendants keep normal hit testing.
    void setRootHitTestPassthrough(const Ref<View>& root, bool enabled);
    void setSuspended(bool suspended);
    // Synchronous UI marshaling. Both roots must already be mounted and sized.
    // The returned snap::valdi_core::Animator handle exposes cancel().
    // Completion runs once on UI, bool=true for cancellation, including unmount/
    // shutdown. Keep its captures valid until cancellation/shutdown returns.
    NativeAnimator tweenRoots(const std::vector<RootTween>& tweens, const NativeTweenOptions& options,
                              std::function<void(bool cancelled)> completion);
    void setRootVisualState(const Ref<View>& root, const RootVisualState& state);
    void cancelRootAnimations(const Ref<View>& root);
    // Internal host integration, no JS attributes. NORMAL native PAN gives a
    // descendant's admitted gesture priority. {} unregisters and cancels.
    void setRootDragObserver(const Ref<View>& root, RootDragObserver observer);
    // Terminal and idempotent. Call after draining/destroying the Valdi tree,
    // before destroying the UI dispatcher or host NodeContent.
    void shutdown();
    static ArkUI_NodeHandle nativeNode(const Ref<View>& view);

    PlatformType getPlatformType() const override;
    RenderingBackendType getRenderingBackendType() const override;
    StringBox getDefaultViewClass() override;
    Ref<ViewFactory> createViewFactory(const StringBox&, const Ref<BoundAttributes>&) override;
    void callAction(ViewNodeTree*, const StringBox&, const Ref<ValueArray>&) override;
    NativeAnimator createAnimator(snap::valdi_core::AnimationType, const std::vector<double>&,
                                  double, bool, bool, double, double) override;
    std::vector<StringBox> getClassHierarchy(const StringBox&) override;
    void bindAttributes(const StringBox&, AttributesBindingContext&) override;
    float getPointScale() const override;
    Value createViewNodeWrapper(const Ref<ViewNode>&, bool) override;
    bool supportsClassNameNatively(const StringBox&) override;
    Ref<IViewTransaction> createViewTransaction(const Ref<MainThreadManager>&, bool) override;
    Ref<IBitmapFactory> getViewRasterBitmapFactory() const override;

private:
    friend void bindSheetInteraction(ArkUIViewManager&, const Ref<View>&,
                                    std::shared_ptr<SheetInteractionBinding>);
    std::shared_ptr<detail::Backend> _backend;
};

} // namespace Valdi::Harmony
