# Android default tab glass

`mode: "default"` (including omitted mode) uses the native `HazeTabBar`.
`mode: "custom"` continues to use the business Valdi component and its existing
full-viewport hit-testing and inset contract. There is no `"haze"` mode.

## Layout and ownership

- `TabsScreen` remembers one `HazeState` per shell ID. The page source and bar
  effect belong to the same Compose root and state. The bar is not its own source.
- `Scaffold` measures the whole bar before composing its body. Its measured
  bottom padding becomes the page's bottom inset; it is **not** applied as layout
  padding to the source. The page remains full viewport and draws behind the bar.
- The bar applies horizontal/bottom system-bar and cutout padding once, outside
  the glass dock. Its 16 dp horizontal and 8 dp vertical floating margins are
  included in the measured footprint. Transparent margins expose page-owned
  content. The dock is at least 64 dp tall and grows with large text.
- Selection calls `navigator.selectTab(shell, route)`. Tabs share the app's
  global navigation stack; each tab is a retained page root, without a child
  back stack. The inner `NavDisplay` receives only the displayed tab entry.
- A cold Valdi target mounts in a transparent preparation slot while the
  displayed page continues drawing. Preparation observes the target's render
  transaction and settled layout, then commits the latest requested selection.
  It never vetoes window drawing. The slot excludes touch, keyboard focus, and
  accessibility input until the page is displayed.
- Previously initialized Valdi roots are reused. Native targets commit without
  a Valdi preparation request. The same selection mechanism serves the custom
  bar; its full-viewport overlay and touch-through contract remain in place.
- Selected/unselected icons retain the existing `resImage` resolver, including
  embedded data, OTA resources, and packaged drawables. Their silhouettes are
  tinted with the active/inactive semantic colors. Native text labels and
  `Role.Tab` selection semantics accompany the icons.
- The dock uses shared `UiDesign`/`uiColors` tokens for rounding, shadow,
  icon/label colors, and interaction feedback. Icons are 24 dp, labels use the
  12 sp body token, and each control has a minimum height of 56 dp.
  Labels remain visible and centered in every state.
- The dock uses Haze 2.1.0 `hazeBlur` with explicit `HazeInput.Sources(hazeState)`.
  Its 20 dp blur and low noise provide a quiet frosted surface. Surface-color
  tint is 78% in light mode and 82% in dark mode, with a 96% fallback tint.
  The outline is a fine semantic border and the shadow is only 2 dp.
- Selected items use the existing `iconWell` token and control-radius rounding.
  Selection fill and foreground transition over 140 ms. There is no refractive
  selected capsule, specular glass rim, stretching indicator, or press scaling.
  `selectable` uses `indication = null`, so there is no additional ripple.
- The Activity and scanner do not wrap content in `MaterialTheme`; no palette
  mapping or `UiTheme` adapter is installed. Native UI reads the existing
  `ThemeTokensStore` through `UiDesign`/`uiColors()` directly. The Valdi palette
  is registered from the same native token tree. The native picker example also
  uses those tokens directly. Material3 component primitives remain available.
  iOS is unchanged.

## Capture path checked in source

The app dependency is `dev.chrisbanes.haze:haze-blur:2.1.0`; the module manifest
aligns its core Haze dependency to `2.1.0`. The current Compose BOM (`2026.09.00`)
maps UI to `1.12.1`; its published Android source archive was inspected.

1. Haze 2.1.0 `HazeSourceNode.draw` records `drawContentSafely()` into a
   `GraphicsLayer` and draws that layer into the window.
2. Compose UI 1.12.1 `AndroidViewHolder` includes a `drawBehind` modifier that
   calls `AndroidComposeView.drawAndroidView(holder, canvas.nativeCanvas)`.
   Native descendant invalidation calls `invalidateOrDefer`, invalidating the
   Compose layer as native content changes.
3. This app's `ValdiPage` hosts a `FrameLayout` containing `ValdiRootView`.
   In the pinned Valdi source, `ValdiRootView` extends `ValdiView`, a `ViewGroup`;
   `ValdiView.dispatchDraw` delegates to `super.dispatchDraw` through `ViewUtils`.
   Its ordinary native drawing is therefore inside the recorded source subtree.

The implementation uses that actual native canvas path, without a screenshot
bitmap, duplicate Valdi context, or tint-only substitute on blur-capable devices.
The shared `HazeInput.Sources` explicitly consumes that source; the experimental
native-window backdrop is not enabled. Haze uses blur where supported and the
explicit surface-color fallback otherwise. Separately
composited `SurfaceView` content is not captured through this path (for example
a camera/video surface). Ordinary Valdi ViewGroup content does not use that
surface boundary.

Primary source references:

- `https://github.com/chrisbanes/haze/blob/2.1.0/haze/src/commonMain/kotlin/dev/chrisbanes/haze/HazeSourceNode.kt`
- `https://github.com/chrisbanes/haze/blob/2.1.0/haze/src/commonMain/kotlin/dev/chrisbanes/haze/HazeInput.kt`
- `https://github.com/chrisbanes/haze/blob/2.1.0/haze-blur/src/commonMain/kotlin/dev/chrisbanes/haze/blur/HazeBlurStyle.kt`
- `https://dl.google.com/dl/android/maven2/androidx/compose/ui/ui-android/1.12.1/ui-android-1.12.1-sources.jar`
- Local pinned Valdi: `valdi/bazel-valdi/external/valdi+/valdi/src/java/com/snap/valdi/views/ValdiView.kt`

## Validation — November 10, 2026 (direct Home entry)

After removing the example Login screen, the Debug APK was installed on Meizu 20.
The installed base APK matched SHA-256
`df158b21b5f16f0c8f6d0ddf8f56939e55cffbeaa138cc8cd67b2802573866ec`.
Cold process restart reached Home without entering credentials. The updated
`android-bottom-bar-20261110` flow passed all 11 checks, including first visits
to Components and Device. One final Device idle check reported a small changing
region; the destination assertions passed. A separately recorded cold-start/tab
path replayed with 11 passing checks and no idle warning.

`android-native-picker-tokens-20261110` also passed all 12 checks: Device → Home →
native picker → Apple result delivered to Home → Device. These checks establish
navigation and result delivery, not frame-time performance or every migrated
feature flow. The current system appearance was retained.

`pnpm test` passed 489 tests; Android assembly/JVM checks passed with 159 tests
passing and 11 existing skips. The iOS Debug build and combined Kotlin/ObjC/C++
binding consistency check passed; no fresh iOS UI replay was performed.
The APK, temporary recorded flow, and verification summary are under
`/tmp/valdi-no-login-20261110`.

## Historical validation — November 10, 2026 (quiet frosted appearance)

These package/replay results predate removal of the example Login screen.
The current `android-bottom-bar-20261110` flow launches directly into Home and
retains first Components/Device tab checks. Its migrated entry was replayed as
described above; the historical 13-check counts below refer to the original flow.

The simplified appearance passed `pnpm build:android -- :app:testDebugUnitTest`:
170 JVM tests total, 159 passed, 11 existing skips, zero failures/errors.
The final APK SHA256 is
`00267f372e3d241b846f5be5979c80a308714cd32787dec944f9ea61279267c0`;
the installed test-device `base.apk` hash matches.

On the API 36 Android test emulator, the login/first-tab replay passed all
13 checks with no failures, errors, skips, or warnings. Light/dark screenshots
were inspected and the original system mode (`no`) restored. The translated
ARM64 cold launch timed out in the launch tool before a UI wait reached Login;
this run does not establish frame-time performance.

Only `HazeTabBar.kt` changed among the Activity/navigation/page source and all
iOS application source in the task baseline. The dock keeps the same measured
footprint and safe padding. The app dependency changes from `haze-glass` to
`haze-blur`, both at 2.1.0. Meizu was initially unavailable. After a subsequent
scoped reconnect, this exact APK was installed on the phone with app data
preserved; the installed hash matched and the app opened successfully to Login.
The tab appearance replay above remains emulator evidence.
Build, APK, source hashes, replay result, and screenshots are saved under
`/tmp/valdi-quiet-tab-20261110/`.

## Historical validation — November 10, 2026 (Regular Glass)

`pnpm build:android -- :app:testDebugUnitTest` passed after the final safe-area
correction: 170 JVM tests total, 159 passed, 11 existing skips, zero failures or
errors. The final APK SHA256 is
`13419824985a2e9a8c58d63ac18d77e7149fa956f9d1773fee49e4245d6912de`.
The installed `base.apk` hash matches on the API 36 Meizu 20 and test emulator.

The Meizu replay passed all 13 login/first-tab checks and all 12 native-picker
round-trip checks, with zero failures, errors, skips, or warnings in either run.
Dynamic Home screens wait for the actual next control after a destination
identity check, rather than full-screen idle: Home intentionally updates its
visible-seconds counter every second. The native picker similarly waits for
the fruit control; result delivery has its own hard assertion. Static
Components/Device destination idle checks remain.

The emulator's earlier replay passed with idle warnings from the live Home
counter, slow sampling, and a small changing native-screen region; those runs
preceded the control-readiness adjustment. They are separate from the final
warning-free Meizu runs. Light/dark appearance was inspected on the emulator
and dark appearance on Meizu. An unrelated floating window interrupted the
Meizu light capture; that capture was discarded and is not evidence.
Meizu's original system night mode (`yes`) and the emulator's original mode
(`no`) were restored.

Evidence is under `/tmp/valdi-glass-regular-20261110/`, including build logs,
hashes, `provenance.json`, and screenshots. The Meizu recording is saved under
`.argent/recordings/screen-recording-100.76.164.6-5555-1794298994018.mp4`;
it finalized normally at 50.2 seconds. No recording remains active. This is
bounded functional/visual evidence, not a frame-time benchmark. Scanner camera
capture, custom tab mode, and older platform rendering fallbacks were not
exercised.

## Historical validation — November 10, 2026 (before Regular Glass)

The floating dock passed `pnpm build:android -- :app:testDebugUnitTest`:
170 JVM tests total, 159 passed, 11 existing skips, zero failures/errors.
The final APK and the installed `base.apk` share SHA256
`0697932e128cb7c3a14c96f1a9febc2401117690ffc4807796b22358510706a2`.

On the API 36 Android test emulator (`sdk_gphone64_x86_64`), the recorded
`android-bottom-bar-20261110` replay passed all 13 checks: local demo login,
Home, first Components selection, and first Device selection. A Home idle
warning remains because its visible-seconds counter changes; destination
identity checks passed. This is functional evidence, not a frame-time benchmark.
The ARM64 APK's translated cold launch timed out in the launch tool before an
explicit UI wait reached Login.

Final light/dark screenshots and build/install receipts are under
`/tmp/valdi-android-bottom-bar-20261110/`. The original system night mode was
restored after inspection. Baseline hashes confirm this appearance task changed
only `HazeTabBar.kt` among the Android navigation and iOS application sources.
The Meizu 20 was offline during that emulator pass. After it reconnected, the
same final APK was installed on the phone (API 36), its installed hash matched,
and all 13 replay checks passed there too. Light/dark appearance was inspected;
the original light system setting was restored. The phone evidence is saved as
`meizu-verification.json`, `meizu-light.png`, and `meizu-dark.png` in the same
evidence directory. These checks do not establish frame-time performance.
Custom mode was not exercised in this run.

## Historical validation (previous appearance)

On November 3, 2026, the parent built the final Android Debug APK and ran all
45 unit tests successfully, including tab selection, sheet nested scrolling,
and ActionSheet result delivery:

```sh
node scripts/project.mjs android :app:testDebugUnitTest --max-workers=2
```

Initial build log: `/tmp/valdi-sheethost-haze-android-build.log`.
After restoring the original tab appearance, the same build/test command passed
again: `/tmp/valdi-tab-original-style-android-build.log`. The final APK was
installed with `adb install -r` on the Meizu 20 (API 36), preserving app data;
Package Manager reports `lastUpdateTime=2026-11-03 15:15:00`.

The phone showed blurred blue page content beneath the glass during scrolling.
This is visual evidence, not a pixel-diff or performance benchmark. The final
style's `tabs-keep-pages` replay passed, and the selected blue label was inspected
on the component tab. All six `res/tab_*` PNGs are byte-identical to HEAD.
Evidence and source hashes: `/tmp/valdi-sheethost-qa/verification.json`.
Final screenshot: `/tmp/valdi-sheethost-qa/meizu-restored-tab-style.png`.

Additional coverage beyond this run:

1. On API 31+, scroll high-contrast Valdi rows or colored native content behind
   the bar. The glass must show blurred, moving source colors, not just the
   uniform tint. A flat white page is insufficient capture evidence.
2. Switch tabs repeatedly, cover/uncover the shell, and background/foreground the
   activity. Check source refresh, icon states, labels, selected route, and
   retained page state.
3. Check light/dark appearance, gesture/three-button navigation, landscape
   cutouts, and enlarged font size. The page inset must equal the measured bar
   footprint, with no double safe area and no final content hidden behind it.
4. The existing `TabBarSelectionTest` passed; its declaration and stale-shell
   checks do not independently prove blur.
5. Exercise custom mode and its empty-overlay touch-through separately; its
   implementation was not edited.
