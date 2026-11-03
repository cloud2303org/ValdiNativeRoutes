#pragma once

#include "valdi_core/cpp/Utils/Shared.hpp"
#include <arkui/native_node.h>
#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>

namespace Valdi { class View; }
namespace Valdi::Harmony {
class ArkUIViewManager;

// Private native host/backend contract. No JS attributes and no ArkUI node,
// recognizer, receiver or userdata ownership crosses this interface.
//
// All distances are logical Valdi points (ArkUI vp), vertical axis only.
// contentDelta < 0 means a downward finger/content-to-top request.
// sheet offset and velocity > 0 mean closedward (down). Velocity is vp/second.
// The backend normalizes native px/vp before calling these functions.
struct SheetInteractionLifetime {
    const uint64_t generation;
    std::atomic<bool> live{true};
    explicit SheetInteractionLifetime(uint64_t value) : generation(value) {}
    void revoke() noexcept { live.store(false); }
};

// Private native seam only; no JS or generated ABI change. Ordinary native
// gesture cancellation settles with the same host snap policy as release.
// Lifecycle cancellation restores open only while the host owner is valid.
enum class SheetInteractionEndReason { Ended, GestureCanceled, LifecycleCanceled };

struct SheetInteractionBinding {
    std::shared_ptr<SheetInteractionLifetime> lifetime;
    // Borrowed, HOST-OWNED panel (including handle and viewport), exact native
    // parent used by mountRootInParent(root, rootMountParent), and the very
    // UIContext passed to this manager's configuration. Retain all three until
    // unbind returns; revoke/unbind BEFORE removing either native relationship.
    // The backend never reparents or disposes these borrowed nodes.
    ArkUI_NodeHandle panel = nullptr;
    ArkUI_NodeHandle rootMountParent = nullptr;
    ArkUI_ContextHandle context = nullptr;
    // A backend-issued session identifies ONE admitted touch sequence on this
    // root. Begin may reject it. Generic SCROLL_START/FRAME_BEGIN, keyboard,
    // mouse, controller motion, bounce and inertia cannot open a session.
    std::function<bool(uint64_t session)> begin;
    // Input and returned remainder must be finite, same sign (or zero), and
    // abs(remainder) <= abs(input). Host clamps offset to [0, openHeight].
    // Conservation: closedward sheetDelta = remainder - input.
    // Down: deepest scroll + ancestors consume to top FIRST, then sheet takes
    // the remaining budget. Up: sheet restores FIRST, then scroll consumes.
    std::function<float(uint64_t session, float contentDelta)> offer;
    // At most one end/cancel per accepted session, including unbind/background.
    // GestureCanceled uses finite velocity already captured by this session,
    // or explicit zero when no sample exists; never read SDK CANCEL velocity.
    // Multitouch interrupts the single-finger session with GestureCanceled/0.
    // Root/token loss, input disable and teardown use LifecycleCanceled/0.
    // Non-touch inertia never starts or extends a sheet drag after this end.
    std::function<void(uint64_t session, float velocity, SheetInteractionEndReason reason)> end;
};

// Each binding owns a backend root session separate from RootDragObserver.
// Binding replacement/unbind revokes the old token BEFORE any native teardown
// or callbacks. Every callback may synchronously unbind, detach, replace the
// root/token or close the entire runtime. After EVERY callback the backend
// MUST recheck token identity/generation, liveness, root ownership, and session
// before reading/writing ANY native state (including event return values).
// Callbacks capture weak host/session owners, never raw host/ArkUI pointers.
//
// Backend exclusively owns dynamic scroll registration, recognizers, receiver
// userdata and deferred disposal. It chooses ONE structural source per touch:
// native scroll budget OR non-scroll pan, never both. Deepest scroll and its
// ancestors share one backend-owned budget. SDK26 FRAME_BEGIN data[0].f32 is
// amount, data[1].i32 is state; returned data[0].f32 is actual scroll. The SDK
// declares NO globally unique event ID. Timestamp/float equality is not a
// deduplication proof. Nested native ordering needs instrumented live evidence.
// Preserve Refresh priority and native editor/wheel exclusive regions. A
// wrong-start/SELF_ONLY scroll must not jump a parent or blanket-disable it.
void bindSheetInteraction(ArkUIViewManager& manager, const Ref<View>& root,
                          std::shared_ptr<SheetInteractionBinding> binding);

} // namespace Valdi::Harmony
