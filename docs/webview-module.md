# Official WebView module in the local Node pipeline

`valdi/modules/valdi_webview` contains the official Android and iOS WebView
implementation from Valdi commit
`51cec8ae3645c7e778c9f36fbe4b3bffba1ccddf`, copied from
`src/valdi_modules/src/valdi/valdi_webview` in the read-only
`/Users/cloud/project/Valdi-node-only` checkout. The module includes the upstream
MIT license and `PROVENANCE.md`. It uses Android's `android.webkit.WebView` and
iOS's `WKWebView`.

## Public API and integration

The original module ID is `valdi_webview`; the native entry point remains
`valdi_webview/src/WebViewNative`. Its public TypeScript files are unchanged:

```typescript
import { WebView, IWebViewController } from 'valdi_webview/src/WebView';

const controller: IWebViewController = WebView.createController();
controller.setListener({
  onMessage(message) { console.log(message); },
  onLoadFailed(errorMessage) { console.log(errorMessage); },
  onLoadCompleted() { console.log('loaded'); },
});
controller.load({ html: '<html><body>Hello</body></html>' });
```

Attach the controller to the official native custom view:

```tsx
<custom-view
  iosClass="SCValdiWebView"
  androidClass="com.snap.valdi.modules.webview.ValdiWebView"
  controller={controller}
  width="100%"
  height="100%"
/>;
```

The owner must call `controller.setListener(undefined)` and
`controller.dispose()` when its lifecycle ends, for example in `onDestroy()`.
Recycling or detaching the native container does not dispose the controller.
The existing runtime/app policy owns remote network access and platform
transport settings.

`module.json` declares:

- `nativeBuild: "bazel"` and `iosModuleName: "SCCValdiWebView"`.
- `androidClassPath: "com.snap.valdi.modules.webview"` so the generated
  `WebViewNativeModule` and `WebViewNativeModuleFactory` use the official
  package, alongside the explicitly annotated model/proxy names.
- `androidModuleFactory` points to the original
  `com.snap.valdi.modules.webview.WebViewNativeModuleFactoryImpl`.
- `androidViewBinder` points to the original
  `com.snap.valdi.modules.webview.ValdiWebViewAttributesBinder`.
- `iosModuleFactory` is `ValdiWebViewCreateModuleFactory`.

The iOS C function returns the original `SCValdiWebViewNativeModuleFactory`.
Automatic `VALDI_REGISTER_MODULE()` registration and its private registry
include are removed so the host registers exactly one factory through
`SCValdiRuntime`. Runtime imports use the real exported `ValdiRuntime` headers.
All other native implementation logic is preserved.

`BUILD.bazel` uses `node_valdi_module` with the real TS declarations and native
sources, `ios_module_name = "SCCValdiWebView"`, and
`ios_frameworks = ["WebKit"]`. The generated native code compiles against the
existing runtime AAR/XCFramework. It does not build a second runtime.

The root `package.json` enables the module under `valdi.modules`. The shared
test command includes its compilation and page-lifecycle tests. Generated
Android/iOS registration installs the native factories and Android view
binder; the iOS host links `WebKit.framework`. Generic pipeline support passes
`androidClassPath` through normal codegen, isolated module builds, and
dependency codegen; the native module rule accepts `ios_frameworks`.
The explicit `appModule('valdi_webview')` test does not require enabling the app.

The app starts directly on Home, whose "WebView" button opens the application
route `webview`. It loads bundled inline
HTML, reads the document title, sends a webpage message through
`window.Valdi.postMessage`, and reads navigation state. The page installs its
listener before loading and clears it before disposing the controller.
Captured listener, evaluator, and state callbacks are ignored after destruction.
No external website or network connection is required for this check.

## Preserved lifecycle and threading

Android creates the controller without constructing a WebView.
`AndroidWebViewHolder` obtains a `Context` when the native container attaches.
Operations that require a WebView queue on the main thread until attachment;
`getState()` and `evaluateJavaScript()` inspect the existing view instead.
View construction, configuration, detach, and destruction run on the main
thread. `dispose()` clears queued callbacks and destroys the view. The
JavaScript interface holds a weak reference to the controller, and listener
access is synchronized. No automatic controller finalizer was added.

iOS holds navigation/message delegates weakly, and installs a weak script
message handler proxy to avoid a WebKit/controller retain cycle. Main-thread
helpers guard creation, configuration, detach, and release.
`SCValdiWebViewControllerImpl` calls `dispose` from `dealloc`; holder cleanup
captures the WebView rather than resurrecting the holder. The view is retained
by its controller/holder and container while attached. Explicit disposal
removes scripts, handlers, and navigation delegates before releasing the view.

## Concrete behavior boundaries

- This adaptation supports Android and iOS only. It does not copy the upstream
  macOS implementation and adds no HarmonyOS or browser implementation.
- `load({ html })` takes priority over `url`, including an empty HTML string.
  HTML loads have a null base URL; there is no public base-URL setting.
- The official API has no request headers, HTTP method/body, cookie/session
  configuration, custom user agent, navigation interception, file chooser,
  download handling, permission prompts, or popup/new-window management.
  Those features are not supplied by this adaptation.
- The message API is the official `window.Valdi.postMessage(...)` bridge,
  enabled only while a listener is set. Non-string messages are JSON-stringified.
  There is no new origin filter or transport. iOS installs a document-start
  script for all frames; Android injects on bridge configuration and page
  start/finish. Do not assume identical earliest-script timing. On iOS, setting
  the listener after a document has loaded adds a user script for subsequent
  document loads; it does not immediately evaluate that script in the current
  document. Set the listener before loading bridge-using HTML.
- Android does not create a view for `getState()` or `evaluateJavaScript()`.
  Before attachment, state defaults to no history/not loading and evaluation
  reports `"WebView is not available"`. iOS operations can lazily create the
  view before attachment. Both retain their upstream behavior.
- JavaScript evaluation returns a string representation through the optional
  callback. Android forwards `evaluateJavascript`'s JSON text and does not
  provide iOS's `NSError` detail. iOS serializes representable results as JSON,
  can omit a value for null/undefined, and reports WebKit errors. There is no
  promise-returning evaluator or normalized cross-platform JS-error contract.
- `dispose()` ends the holder lifetime. Android clears queued operations
  awaiting attachment, drops subsequent operations requiring creation, and
  reports `"WebView is not available"` for evaluation without a view.
  iOS evaluation after disposal reports `"WebView is disposed"`. Do not reuse
  a disposed controller or assume every in-flight callback completes.
- Listener access is synchronized, but an event that already captured a
  listener can race removal/disposal. There is no stronger cancellation
  guarantee. Android's `@JavascriptInterface` message callback can arrive on a
  WebView bridge thread; this adaptation preserves the generated native proxy
  boundary and does not add app-thread scheduling.
- Android retains the official deprecated `onReceivedError` callback; it does
  not add HTTP status/error classification or match iOS navigation failures.
  Completion and error callbacks remain platform-specific.

## Verification

Run the focused Node tests from `tools/valdi-rolldown`:

```sh
node --import tsx --test webview-module.test.ts
node --import tsx --test webview-page.test.ts
```

The tests use `compileNodeModule` on the real module for debug and release,
inspect unpacked `.valdimodule` assets, separate source maps, release Hermes
headers, and generated Kotlin/ObjC/C++ contracts. The debug fixture executes
the real `WebView` JavaScript with explicit native collaborators to verify
factory forwarding, controller identity, and propagation of construction
errors. It does not create a browser, execute DOM JavaScript, or validate
native navigation, messaging, rendering, or lifetime behavior.

The three page tests execute the transpiled application page with explicit
controller/UI collaborators. They cover listener-before-load ordering, result
forwarding, late callbacks after destruction, and disposal when listener removal
throws. They do not execute WebKit or Android WebView.

With the parent's native-slot authorization, the two module-only build targets
are `//modules/valdi_webview:valdi_webview_android` and
`//modules/valdi_webview:valdi_webview_ios` in `module-build`, in that order.
Record the existing runtime artifact hashes before compiling. Cached runtime
artifact compilation proves compatibility with those artifacts; fresh runtime
export, whole-app linking, and simulator/device acceptance are separate work.
Native acceptance still needs real navigation/HTML loading, history, bridge
messages, evaluator callbacks/errors, and detach/dispose/re-entry on each
platform. No host fixture establishes that acceptance.

### Local verification recorded on November 4, 2026

The focused Node command above passed both tests (debug and release).
The two native targets also passed sequentially, using these commands from
`module-build`:

```sh
bazel --max_idle_secs=60 build \
  //modules/valdi_webview:valdi_webview_android \
  --android_platforms=@snap_platforms//os:android_arm64 \
  --nofetch --repository_disable_download --lockfile_mode=off --noshow_progress

bazel --max_idle_secs=60 build \
  //modules/valdi_webview:valdi_webview_ios \
  --platforms=//:ios_sim_arm64 \
  --nofetch --repository_disable_download --lockfile_mode=off --noshow_progress
```

The Android build took 91.800 seconds; the iOS simulator build took 2.630
seconds. The Android JAR contains the official native implementation, generated
models/proxies/factory, and attributes binder, all under
`com.snap.valdi.modules.webview`. The iOS archive defines
`_ValdiWebViewCreateModuleFactory` and the official implementation classes.
These are library compilation results, without whole-app linking or browser
execution.

Both builds completed with zero error lines. No WebView source warnings were
reported. Android's build also compiled local build tools, which reported
libc++ platform-support, libtool ignored-return-value, and protobuf Java
deprecation warnings. Bazel reported out-of-date external repository caches
because fetching was deliberately disabled. This run did not refresh those
caches or establish compatibility with freshly exported runtime artifacts.
The iOS log had no compiler warnings.

Existing runtime SHA-256 values were identical before and after both builds:

```text
android/app/libs/valdi_runtime.aar
d4a5fa6ad01e647aeac36f75b1956a3621f8393939fa837707abd7cd8f9f800f

ios/Frameworks/ValdiRuntime.xcframework/ios-arm64/ValdiRuntime.framework/ValdiRuntime
ead8bab1db899b02d7d0a3721c15ce71f40279e7b2550a94c251e36d9effac3c

ios/Frameworks/ValdiRuntime.xcframework/ios-arm64_x86_64-simulator/ValdiRuntime.framework/ValdiRuntime
35547c030f9ca9aba5ea8074df56c8eacd361c7452e0acd3cbc8ec2637f96a25
```

The XCFramework tree digest is
`cca86f73346ff5292fab6ef13a2dd2ccdf4078ee7fa637e9ce84a62c8c37751f`
for 513 files. To reproduce it, sort files by relative path, then feed each
UTF-8 relative POSIX path, a NUL byte, and the raw SHA-256 digest of that file
into a SHA-256 hasher. This covers the actual exported headers as well as
binaries and metadata.

Produced libraries:

```text
module-build/bazel-bin/modules/valdi_webview/libvaldi_webview_android.jar
c5d5effb5e5207ff9876127f751ffe29bc0e5bf310131d39362fe1d7dfef1139

module-build/bazel-bin/modules/valdi_webview/libvaldi_webview_ios.lo
67734e6e0c9e26f6c850e8c5aedacb8837b9b64c9cb7f555043d0ce77f806b1f
```

Build logs for this run are `/tmp/valdi-webview-android-build.log` and
`/tmp/valdi-webview-ios-build.log`. After the builds, the process scan found
no active native/Java compiler and only an idle module-build Bazel server.
The exclusive native build slot was released immediately.

### Full application and iOS simulator verification

This is the historical 2026-11-04 validation sequence. Its preparation command
and runtime fingerprint check have since been removed; retain the commands and
logs below as evidence of that run. For current builds, install dependencies,
manually export the runtime, then run `pnpm ios` or `pnpm build:ios`.
The Login entry and return checks described below belong to that historical
package. The saved flow now enters and returns through Home; this entry migration
has not been replayed.

The local application was subsequently prepared against the pinned fork and
built for the arm64 iOS simulator:

```sh
node scripts/cli.mjs prebuild --platform ios
node scripts/project.mjs ios ARCHS=arm64 ONLY_ACTIVE_ARCH=YES
```

The runtime export, all enabled native module libraries, and the final Xcode
application link succeeded. Bazel refreshed both tracked lockfiles' registry
URLs from the previous fork pin to `51cec8ae`; normalizing only that URL prefix
reproduces the original lockfiles exactly, including all recorded values.
The runtime compatibility check passes with these refreshed inputs.

The first two preparation attempts failed downloading the fixed GitHub
archive (`Premature EOF`), before compilation. The successful attempt used a
temporary loopback downloader mapping to the same archive fetched from
GitHub's codeload endpoint. All 7,278 tracked blobs match the exact pinned Git
commit; no fork source or repository URL configuration was changed.
The failed logs remain in `/tmp/valdi-webview-ios-prebuild*.log`.

Argent installed the built `io.valdiroutes.app` on the booted iPhone 17
simulator running iOS 26.5. The first walkthrough and one uninterrupted replay
of `.argent/e2e/webview-ios-offline-20261104.yaml` verified:

- Offline HTML rendered in an actual `WKWebView`.
- `evaluateJavaScript('document.title')` returned `"Valdi WebView"`.
- Evaluating the DOM button's click executed `window.Valdi.postMessage`;
  the native listener received `来自网页的消息`.
- `getState()` returned no back/forward history and `loading=false`.
- Returning to login and reopening reset page state; title evaluation worked
  again with the new controller.

Replay executed all 26 steps: 21 actions/checks passed, five echo steps,
zero failures/errors/skips, in 9.8 seconds. The discovery's first ID-only login
wait failed because the AX projection omits the button container's identifier;
the successful stable-text wait replaced it after recording. The original
discovery recording is preserved with the local evidence.

One replay coordinate exception remains: the back button uses `(0.07, 0.096)`,
derived from its live AX frame, followed by a positive login-screen check.
`native-find-views(label: "返回")` found no matches, the full UIKit hierarchy
has no back identifier/label, and a scratch runner assertion for that text
failed. The shared NavigationBar lacks a stable UIKit identifier for this
target. This is a bounded simulator flow with that documented portability
limit, not a claim of selector-only automation.

Local evidence, screenshots and executable/bundle hashes are in
`.ci/webview-20261104/proof.json`. Build logs are
`/tmp/valdi-webview-ios-prebuild-attempt3.log` and
`/tmp/valdi-webview-ios-app-build.log`. The full local suite passed 183 compiler
and behavior tests, 39 script tests, five upstream rewrite tests, and ten
golden groups; application typechecking and canonical binding checks passed.

This establishes the listed iOS simulator paths in the complete application.
It does not establish Android browser execution, physical-device behavior,
remote HTTP navigation/history/error handling, or leak-free teardown.
