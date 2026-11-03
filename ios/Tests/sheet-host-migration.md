# iOS shared sheet migration

`BottomSheet`, `ScrollBottomSheet`, `ListBottomSheet`, `ColumnPicker`, `TimePicker`,
`NativeActionSheet`, and the existing AppUI sheet presenters now use `SheetHostView`. The
transplanted scroll negotiation, critical spring and scrim are the actual shell.
BottomSheet retains its public content/header/footer/actions and keyboard padding.
Its existing header supplies the handle; the shell's handle is disabled for that
host only. Navigation continues to use the default shell handle and its existing
75% or compact detent calculations.

`OverlayPresenter` still owns registration, top/covered state and close results.
A user gesture requests a controlled close; if the caller leaves `open` true,
the shell springs back. An accepted close keeps the full-screen hit shield and
registration until the shell settles. Reopening cancels the pending completion.
Navigation/unmount interrupts the spring and reports through the existing
presenter force-removal path. `dismissible` gates user gestures, not programmatic
closure. Covered sheets cannot respond to the shell recognizer or scrim.

Content and scroll layouts measure their existing Auto Layout column at the host
width. Scroll height caps at the existing 85% limit (full available height while
avoiding the keyboard); list remains a fixed viewport without an outer scroll.
Bottom safe-area/keyboard clearance remains in the column once. Dynamic column
layout requests a new detent measurement. The inner content stack also requests
a refit when scrolling content changes without resizing the viewport or panel;
the public `content` property remains typed as `UIStackView`.
The shell's default sizing and automatic
first presentation are unchanged for navigation; controlled overlays explicitly
present and can reuse the shell after closing.

`NativeActionSheet` mounts a `ScrollBottomSheet` in the presenter's window and
keeps its async/callback APIs. Buttons preserve IDs, disabled/destructive states
and optional SF Symbol icons; cancel is a pinned footer. A supplied `OverlayScope`
receives the shared presenter's registration/update/remove calls. Without one,
a local scope supplies top status. Completion follows physical close; forced
navigation/unmount clears a pending selection and preserves its cancellation
reason. AppPresenters' action-sheet function needs no behavior change.

The background difference is intentional existing configuration: navigation uses
SheetHostView's white surface and default scrim; AppUI components configure
UiTheme.surface/UiTheme.scrim and their sheet radius. This migration preserves
those settings and makes no unrelated navigation styling change.

## Validation status and commands

On November 3, 2026, the focused hosted UIKit target built and passed all six
XCTest cases (zero failures) on simulator
`1F4AB5E1-D782-420A-81A8-2AF0AFE8AA67`, using the parent's authorized build slot.
Evidence: `/tmp/valdi-sheet-host-ios-content-refit-20261103/command-1.log` and
`/tmp/valdi-sheet-host-ios-content-refit-20261103/results.xcresult`.
The dynamic scroll sizing assertion remains unchanged: growing the body from
120 to 1200 points must increase the sheet to its capped height. The parent's
rendered-keyframe hit-testing regression also passes unchanged.
No full Valdi/runtime build or physical-device QA was performed in this run.
After the NativeActionSheet migration, the expanded hosted suite passed all
12 tests with zero failures on the same simulator on November 3, 2026.
Evidence: `/tmp/valdi-sheet-host-ios-action-sheet-run-20261103/command-1.log`
and `/tmp/valdi-sheet-host-ios-action-sheet-run-20261103/results.xcresult`.
This includes the six ActionSheet lifecycle, selection, scope, cancellation,
and layout tests as well as the unchanged original six sheet tests.

From repository root:

```sh
xcrun swiftc -frontend -parse ios/ValdiRoutes/SheetHostView.swift ios/ValdiRoutes/NativeRoutesUI/BottomSheet.swift ios/Tests/SheetHostMigrationTests.swift
python3 ios/Tests/run-sheet-host-tests.py
```

After the parent grants a native build slot and selects/boots a simulator through
Argent:

```sh
python3 ios/Tests/run-sheet-host-tests.py --run --udid "$IOS_SIMULATOR_UDID"
```

The runner generates an isolated XcodeGen test project using the actual UIKit
sources and saves commands, logs and an xcresult in its printed temporary
directory. A generated minimal UIKit application executes `UIApplicationMain`;
the XCTest bundle is hosted using `TEST_HOST`/`BUNDLE_LOADER` and an app target
dependency. The host source and project live only in the temporary directory.
It does not build or link the Valdi runtime. Tests cover controlled
scrim dismissal, completion after the spring, close shielding, covered/locked
interaction, reopening during exit, forced removal during exit, fit/capped/list
geometry, dynamic content, keyboard-notification padding, picker shell reuse,
rendered-position hit testing, and navigation default geometry.

Still required: full application integration validation and interactive QA
for drag-to-scroll handoff (including inverted scrolls), picker wheel drags,
keyboard show/hide and focus reveal, safe-area clearance, edge-to-edge image
preview, title/footer changes, stacked overlays, rotation/resize during settling,
and navigation 75%/compact sheets. Verify `showBottomSheet()` and picker async
results arrive once after physical close, and navigation/unmount cancels them.
The focused hosted tests do not establish physical-device or Release behavior.
