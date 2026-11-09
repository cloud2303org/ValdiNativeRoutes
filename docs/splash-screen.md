# Startup splash on Android and iOS

Both hosts implement `app_foundation/src/splash/SplashScreen`. No application
installer or Expo/React Native dependency is required.

```ts
import * as SplashScreen from 'app_foundation/src/splash/SplashScreen';

// Call during startup, before awaiting application resources.
const held = SplashScreen.preventAutoHide();
// Once those resources are ready:
SplashScreen.hide();
```

These methods synchronously update native policy: `preventAutoHide()` returns
a boolean, and `hide()` returns void. Errors throw synchronously. Native UI
work happens on main without blocking the caller. Repeated holds are
idempotent; a hold after dismissal returns false. `hide()` still requires a
fresh first-content acknowledgement, so it cannot expose an unready page.
There is no fixed duration, initialization delay, or default exit fade.

Without a manual hold, the host automatically hands off to the selected
initial page. The selected Valdi page and any custom tab-bar root must be
attached, have positive dimensions, and reach their own
`renderer.onNextDraw`. Context update completion only fences JS root creation;
it does not itself signal readiness. On Android the draw hook reaches native
pre-draw; on iOS it reaches a Core Animation transaction completion. Neither
signal proves GPU completion or presentation.

Identity, model/geometry and hide-policy revision checks reject stale
acknowledgements, including stale errors. iOS retains the assigned view-model
object for identity comparison; model updates must continue replacing that
object. The current synchronous native picker uses its appearance/layout
transaction rather than waiting for a nonexistent Valdi root. A future
asynchronous native screen needs an explicit meaningful-content signal
instead of using appearance alone.

## iOS resources and ownership

`ios/ValdiRoutes/Info.plist` names `SplashScreen` as `UILaunchStoryboardName`.
The system launch screen and the app-owned loading overlay use the same
`ios/ValdiRoutes/Startup/SplashScreen.storyboard`, matching Expo's storyboard
reuse pattern. This host uses Valdi readiness instead of React's
content-appeared notification.

Edit the shared `assets/app-icon.png` to replace the mark. Its path is declared
once as `valdi.app.icon` in `package.json`. The normal native build generates
the iOS `AppIcon.appiconset` and `SplashLogo.imageset` under
`ios/Generated/AppAssets.xcassets/` from that PNG. No PDF is used.
The storyboard's image view remains 288 points square; edit the storyboard
to change placement, display size or its `#F3F4F6` background.
The image set and app icon set are generated outputs of the same source, so
neither requires manual maintenance.

`StartupSplashState.swift` owns application-lifetime policy.
`StartupSplashScreen.swift` supplies the generated native factory and a
controller-scoped overlay with weak asynchronous callbacks. The overlay is
installed before runtime startup, moved above the window's content after
attachment, and removed immediately once the current content is ready.
Layout, safe-area delivery and JS rendering continue underneath it.

The LaunchScreen is supplied by iOS; application code cannot keep the system
launch screen alive directly. The matching overlay supplies manual control.
This handoff does not accelerate runtime initialization.

## Android resources

Android uses AndroidX `core-splashscreen`. Both the application icon and startup
theme reference the generated `@mipmap/ic_launcher` PNG resources, from the
same `valdi.app.icon`. Edit the startup theme for its background. The Activity
removes the system splash directly through the exit callback.
See [Android details](android-splash-screen.md).

Launch storyboards, native code and image resources require a new native app
build. They are not JS-only OTA changes.

## Validation on November 6, 2026

The iOS Debug simulator App and Android R8 Release APK both built after the
runtime exports and canonical bindings were refreshed. The focused tests
passed: 20 Swift policy regressions and 11 Node tests covering the shared
facade/draw hook and native-module access. Android's JVM task was up to date;
its retained reports contain 101 passes and nine skips.

Argent on the iOS 26.5 simulator verified automatic handoff to Login. An
isolated copied App, with only its bundled startup JS patched for diagnostics,
called the real synchronous hold API, opened an iOS full-screen detail route,
and later called the real hide API. The overlay stayed above the attached
detail content while held and disappeared after hide. The replay passed.
Another isolated App selected the existing native picker as its initial page;
its handoff and replay passed, with one idle warning about a small changing
region. These prototypes did not modify production source or add product
timers. The ordinary App was restored and its executable, modules and launch
resource hashes matched the built copy.

The Windows Android emulator received the new APK without clearing data;
the installed APK hash matched, and its launch-to-Login replay passed.
No physical iPhone or MEIZU installation was performed for this change.
Custom tab-bar startup is source-reviewed but has no new runtime test here.
These checks are functional startup handoff checks, not startup-speed
measurements. Evidence and recordings are indexed under
`/tmp/valdi-ios-splash-20261106/REPORT.md`.
