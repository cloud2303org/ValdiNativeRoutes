# Android startup splash

Android uses AndroidX `core-splashscreen` 1.2.0 with the app's generated PNG icon and
the existing page background. `valdi.app.icon` in `package.json` selects the shared
source (`assets/app-icon.png`). The launcher Activity installs the starting
theme before `super.onCreate`. The normal application theme, Compose
WindowInsets and renderer remain unchanged.

When ready to exit, the Activity immediately removes the splash through the
AndroidX exit callback. No exit animator runs in this callback, so the default
system splash reveal is skipped. Launcher window-entry animations are separate.

## Automatic handoff

The default requires no page-level installation or hide call. An Activity-owned
pre-draw listener keeps the starting window while composition and asynchronous
Valdi work continue. It waits for the selected initial page and any custom
Valdi tab bar to attach, receive positive layout dimensions and reach
`renderer.onNextDraw`.

`waitUntilAllUpdatesCompleted` is used only to find the created JS root. It is
not treated as content ready. The next-draw hook travels through the native
transaction and Android pre-draw callback. It means ready for drawing, not GPU
completion or pixels presented.

Root identity, view-model revision and dimensions invalidate stale readiness.
Activity disposal removes the gate and its route subscription. Callbacks use
weak references and cannot release a replaced root. Startup failures handled
by the host release the gate into a native error message.

There is no fixed display duration, initialization timer, synchronous wait or
additional Splash Activity. The page and tab bar continue using official
Compose Insets; the content-view lookup is for draw control only.

## Manual control

The public entry is `app_foundation/src/splash/SplashScreen`:

```ts
import * as SplashScreen from 'app_foundation/src/splash/SplashScreen';

// During application startup, before awaiting other initialization:
const held = SplashScreen.preventAutoHide();

// After required application resources are ready:
SplashScreen.hide();
```

Both methods call the generated native proxy synchronously. `preventAutoHide()`
returns a boolean after updating the hold; `hide()` returns void after
releasing it. Errors throw synchronously. There are no Async aliases or
Promise results.

The policy uses a short synchronized critical section shared with Android
pre-draw. View operations are posted to the main thread without waiting for
that thread. Each hide advances the readiness revision immediately, so a
pre-draw racing with hide cannot accept an earlier draw acknowledgement even
before the posted UI wake-up runs. A fresh acknowledgement is still required.
Stale success and error callbacks are discarded; accepting a startup failure
checks the same revision atomically with the terminal state transition.
Returning from hide does not mean content is displayed or the system exit
animation has finished, and it cannot bypass the initial-content check.

Repeated prevent calls are idempotent rather than reference counted.
`preventAutoHide()` returns false after the initial splash has left.
Later route changes do not show it again. Do not block the synchronous
`startApp()` route declaration waiting for the resource-loading task.

The wrapper acquires a generated native proxy lazily on both Android and iOS.
See [the shared SplashScreen contract and iOS resources](splash-screen.md).
The historical validation below predates the iOS implementation.

## Fixed-size root layout

All routed page roots and the custom tab overlay enable
`setRetainsLayoutSpecsOnInvalidateLayout(true)`. Content invalidation reuses
the parent-provided constraints instead of asking Android to supply the same
constraints again. Android can still submit changed dimensions and RTL.

Routes no longer support sheet presentations. AppUI bottom-sheet components
keep their independent sizing policy. This is a newly enabled fixed-size
root optimization; available history did not establish that it had previously
been enabled and removed. It is not a measured startup-speed improvement.

## Initial asynchronous version verification on November 6, 2026

The ARM64 production Valdi runtime and R8 Release APK built successfully.
The APK uses the local debug signing key for installation compatibility.
Node checks passed 333 tests; Android JVM checks passed 91 tests with nine
skips, including 11 startup-policy tests. Canonical codegen checking and
`git diff --check` also passed.

The APK was installed over the existing app on MEIZU 20 without clearing data.
The installed `base.apk` SHA-256 matches the built artifact:
`797521b1c3157f7c0f7005e30b93c32be7b4c9d89f7412ec6c2e8913b6929fa4`.
One recorded launch reached the signed-in Home page, retaining the existing
single submission. The recording includes the splash-to-Home transition.
This is one launch observation, not a two-pass visual regression result or a
startup-performance measurement. Manual hold/hide has policy and JS-boundary
test coverage, but has not been exercised through a business startup flow on
the phone.

The Windows emulator installation stalled and package-manager queries timed
out. Its reboot command also timed out; completion was not confirmed. The
user redirected installation to MEIZU 20, so no Windows runtime success is
claimed for this APK. Evidence is under `/tmp/valdi-splash-20261106`.

The synchronous API revision is tracked separately under
`/tmp/valdi-splash-sync-20261106`. The earlier APK hash and phone observation
above apply to the initial asynchronous version.

For the synchronous revision, the production ARM64 runtime and R8 Release
APK build passed. Node checks passed 334 tests. JVM checks passed 97 tests
with nine skips, including all 17 startup-policy tests. The stale-error
regression was observed failing before the fix, then passed with the same
assertion. A second bounded source review found no remaining concrete P1/P2
issue. This revision has not been installed or exercised on a device.
