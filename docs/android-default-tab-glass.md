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
- The bar applies horizontal/bottom system-bar and cutout padding once, inside
  the glass effect. That padding is included in the measured footprint. The
  56 dp row is the original control size, not an estimate sent to the page.
- Selection still calls `navigator.selectTab(shell, route)`. Page creation,
  retention, context lifetime, and custom-tab ownership are unchanged.
- Selected/unselected icons retain the existing `resImage` resolver, including
  embedded data, OTA resources, and packaged drawables. Native text labels and
  `Role.Tab` selection semantics accompany the icons. No Material3 pill indicator.
- Appearance matches the repository's previous `MainActivity.kt` tab bar:
  24 dp icons, 11 sp labels, 2 dp icon/label gap, `#2563EB` selected text,
  `#6B7280` unselected text, a 0.5 dp separator, 24 dp blur and 60% white tint.
  `selectable` explicitly uses `indication = null`; there is no ripple or
  pressed-state surface. Existing `res/tab_*` images are unchanged.

## Capture path checked in source

The dependency is explicitly `dev.chrisbanes.haze:haze:1.7.2`, matching the
adjacent ExpoNativeRoutes app. The current Compose BOM (`2026.09.00`) maps UI to
`1.12.1`; its published Android source archive was inspected.

1. Haze 1.7.2 `HazeSourceNode.draw` records `drawContentSafely()` into a
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
The opaque `HazeStyle.backgroundColor` is the backing beneath the captured layer;
the white tint **over** the captured layer is translucent.

Haze 1.7.2 enables blur on API 31+. API 28–30 use its explicit high-contrast scrim
fallback. Separately composited `SurfaceView` content is not captured through
this path (for example a camera/video surface). Ordinary Valdi ViewGroup content
does not use that surface boundary.

Primary source references:

- `https://github.com/chrisbanes/haze/blob/1.7.2/haze/src/commonMain/kotlin/dev/chrisbanes/haze/HazeSourceNode.kt`
- `https://github.com/chrisbanes/haze/blob/1.7.2/haze/src/androidMain/kotlin/dev/chrisbanes/haze/HazeNode.android.kt`
- `https://github.com/chrisbanes/haze/blob/1.7.2/haze/src/commonMain/kotlin/dev/chrisbanes/haze/HazeStyle.kt`
- `https://dl.google.com/dl/android/maven2/androidx/compose/ui/ui-android/1.12.1/ui-android-1.12.1-sources.jar`
- Local pinned Valdi: `valdi/bazel-valdi/external/valdi+/valdi/src/java/com/snap/valdi/views/ValdiView.kt`

## Validation handoff

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
