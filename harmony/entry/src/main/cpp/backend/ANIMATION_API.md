# Native animation integration contract

Public declarations are in `ArkUIViewManager.hpp`; implementation is in
`ArkUIViewManager.cpp`, compiled against the pinned Valdi and installed SDK 26
headers for x86_64 and arm64.

`tweenRoots(vector<RootTween>, NativeTweenOptions, completion)` starts one real
ArkUI native per-frame animator for all supplied roots and returns a
`NativeAnimator` (`shared_ptr<snap::valdi_core::Animator>`). Include
`valdi_core/Animator.hpp` when calling the returned handle's `cancel()`.
Each RootTween has `root`, `from`, and `to`. Both roots may be mounted under the
same native parent; the host controls stacking/insertion order.

`RootVisualState` contains translationX/Y (Valdi points), scaleX/Y (default 1),
rotation (radians), opacity (default 1). It affects native presentation without
changing the root layout frame or Yoga. The host supplies explicit endpoints;
the backend applies `from` before play and `to` at normal forward completion.
Use `setRootVisualState(root, {})` to restore identity after route cleanup.

Suggested enter pairs, with a host-supplied width/height in points:

* slideRight: incoming translationX width -> 0; optionally outgoing 0 -> -width/4.
* slideUp: incoming translationY height -> 0.
* fade: incoming opacity 0 -> 1, outgoing opacity 1 -> 0.
* zoom: incoming scaleX/Y .92 -> 1, opacity 0 -> 1.

Reverse the appropriate endpoints for back. There is no built-in navigation
ownership or automatic unmount. On completion the host removes the outgoing
root, restores the surviving root, then finalizes its navigation operation.

Options use seconds: duration=.3, delay=0, speed=1, iterations=1 (-1 infinite),
autoreverses=false (alternates each iteration), type=EaseInOut, controlPoints=[]
(or four cubic Bezier coordinates). Autoreverse with two iterations returns to
`from`. Speed scales duration and delay. Cancellation freezes the currently
presented values; restore identity explicitly when desired.
Duration/delay must be finite and nonnegative, speed finite and positive.
Zero duration with zero delay completes synchronously; positive durations
smaller than one millisecond use a real one-millisecond native animation.

All entry points marshal synchronously to UI. Completion receives
`bool cancelled` and runs exactly once on UI, also when explicitly cancelled,
unmounted, or shut down. It may run synchronously for a zero-duration tween or
explicit cancellation. Cancel before destroying anything captured by the
completion. Handle release alone does not cancel an active animation.
The handle's `cancel()` is idempotent and may be called from a worker.
`cancelRootAnimations(root)` also cancels a tween involving another root as
part of the same group. `unmountRoot` cancels before native detach; `shutdown`
cancels before node destruction. UI dispatch with sync=false must enqueue even
when called on UI, because native handle disposal is deferred out of native
callback stacks.
Drain the UI dispatcher after shutdown as well as before it. Suspension
cancels active groups; it does not automatically restart them on resume.
Prefer `ArkUIConfiguration.uiContext` (`ArkUI_ContextHandle`, optional,
default null), borrowed from the host's `OH_ArkUI_GetContextFromNapiValue()`.
Keep the ArkTS UIContext/native handle valid through shutdown and the subsequent
UI drain. The host declares all this manager's roots belong to that UI instance.
The fallback queries `OH_ArkUI_GetContextByNode()` once on the first mounted
root and binds to a shared host NodeContent/native parent. Different mounting
surfaces require explicit context binding. Returned context wrapper pointer
addresses are never used as UI instance identity.

`ArkUIConfiguration::animationDiagnostics` is optional. It is called on UI once
at animation termination with id, native frameCount, at most eight actual
native progress samples, and cancelled. It must not throw. This provides
bounded QA evidence without logging every frame; a nonzero-duration successful
animation should show intermediate values and multiple native callbacks.
No frame samples are synthesized. Device/HAP proof remains host-owned.

Valdi's pinned `IViewManager.createAnimator` arguments are type, controlPoints,
duration, beginFromCurrentState, crossfade, stiffness, damping. The bools are
**not** repeat/autoreverse, and the last doubles are **not** delay/speed.
The native host tween options provide those additional timeline controls.

Valdi properties currently interpolate resolved layout frames, opacity,
backgroundColor, borderRadius, and the upstream composite transform. Plain
label and font/style changes accompanying them apply immediately.
`beginFromCurrentState` uses presentation versus previous logical target.
`crossfade=true` returns an explicit unsupported error. Springs support
positive stiffness/damping (including 220/22) using analytic damped motion
driven by native onFrame callbacks; duration=0 derives a conservative finite
settling interval for the pinned duration-less SpringAnimationOptions.
See README for the feature/limitation details and verification command.
