# Android Compose Insets, 2026-11-06

The Android host now uses official Compose
`WindowInsets.systemBars.union(WindowInsets.displayCutout)` directly.

Removed from the Activity:

- The native `OnApplyWindowInsetsListener` and explicit inset request.
- The `findViewById(android.R.id.content)` used to install that listener.
- The nullable Activity Insets state and its page-composition gate.
- The custom `LocalAppWindowInsets` provider and `AppWindowInsets.kt`.

Page Insets and the Haze tab bar read the official Compose Insets. Keyboard
handling still uses `WindowInsets.ime`. The existing Scaffold contract remains:
the Valdi page receives system Insets as numbers and handles its own padding,
while Scaffold supplies the measured bottom-bar footprint. This avoids adding
Scaffold system padding on top of the page's padding.

`enableEdgeToEdge` remains enabled. Home content, API initialization, navigation,
video presentation, and the rendering backend were not changed.

## Executed validation

The Release host was built with the existing production native runtime and
module JARs. Existing JVM tests report 89 total, 9 skipped, 0 failed/errors:
80 non-skipped tests passed.

The Release APK was installed on MEIZU 20 (`100.76.164.6:5555`) with a
data-preserving update. Two executions of the existing four-step Home flow
passed 4/4, with one idle warning in each execution. Both explicit title and
Calculator visibility checks passed. These are bounded Home checks, not full
navigation, keyboard, rotation or video/PiP QA.

Both cold launches were recorded through Argent at 30 fps, with static-frame
trimming disabled. Extracted early identifiable Home frames display top 41,
bottom 81, left/right 0. They do not reproduce the previously captured
zero-to-real-inset transition. Changes in screen coordinates during the
rounded, scaled startup window are distinguishable from internal page padding.

The first capture reached its 35-second cap and was retrieved normally; the
second was explicitly stopped at approximately 40.3 seconds. A 30-fps capture
cannot exclude a shorter missed frame. This is not proof of blank-free launch,
GPU presentation timing, or a startup performance improvement.

## Evidence

Evidence is under `/tmp/valdi-compose-insets-20261106`:

- `before.json`, source snapshots and `source-changes.diff`.
- `build-tests.log` and `artifact.json`.
- `install.log`, installed APK hash and `final-state.json`.
- Both original videos, frame-landmark analysis, and extracted early frames.
- `runner-observed-summary.json`, explicitly a tool-result summary rather
  than a raw runner export.
- `validation-final.json`, binding these files and the source/artifact hashes.

Earlier dated startup reports describe their frozen source and APK versions.
Their native-inset-dispatch marker and Activity composition gate are no longer
part of the current implementation.
