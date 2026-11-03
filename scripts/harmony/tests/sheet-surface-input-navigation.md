# Independent input gate and actual native carrier / Navigator boundary

This is source-only evidence from the helper implementation child. The child
does not invoke a native compiler, fixture executable, SDK build, HAP tool, or
device. Native results produced separately by the parent's exclusive serial
controller must be matched to these exact source hashes before being cited.

## Resume audit and helper delta

Before resumed edits, `HarmonySheetSurface.hpp`, `.cpp`, and the partial
`sheet-surface-input-native.cpp` were byte-compared to the parent's
`/tmp/valdi-sheets-20261103/resume-20261103-partial-audit/receipt.json`.
All three matched. The helper already contained exactly the intended extension:
`setInputEnabled(bool)` stores an independent flag, applies
`_active && _inputEnabled` to native enabled/hit-test attributes, and participates
in scrim admission. It does not write visibility, cancel, or restart animation.
No further production helper edit was needed after resume.

`setActive(false)` retains its explicit background cancellation/hide behavior.
Foreground resume uses the stored input flag. Detach and retirement make the
input setter inert. Public animation admission, the P2 zero-height terminal
intent fix, geometry, and the explicit interaction panel accessor are preserved.

The pre-extension P2 helper and test source is preserved under
`sheet-surface-input-prefix-20261103/`, with a manifest. Original and P2 receipts
remain immutable. The separate input fixture's resumed correction changes only
one sample from 0.2 to 0.1, keeping the interrupted close short of its resized
endpoint so its later re-enabled scrim assertion has a visible panel to hit.

## Actual-helper and unchanged-host integration

The new fixture files are:

- `sheet-surface-navigation-extract.py`: extracts six production method
  definitions unchanged, without renaming, replacing calls, or substituting
  surface behavior. Each extraction manifest records exact method hashes.
- `sheet-surface-navigation-boundary.hpp`: declares the bounded Navigator class
  and explicit collaborators, then includes the selected production definitions.
- `sheet-surface-navigation-native.cpp`: drives actual
  `HarmonySheetSurface.cpp` and inspects fake-SDK attributes and frame callbacks.

The unchanged methods are `sheetGeometry`, `closeSheet`, `reconcileSheet`,
`finishSheet`, `setActive`, and `layoutSheet`. The SDK boundary is the existing
immutable `sheet-surface-p2-boundary.hpp`, which uses the real SDK declarations.
There is no `SheetSurfaceBoundary` or fake native visibility implementation.

The page/root-mount collaborator adds and removes an external native root in
the real helper's viewport through the fake SDK table. It does not link a real
Valdi backend or VM. Base transitions are explicit no-ops. UI command entry is
synchronous. Input binding/revocation is an explicit lifetime/admission
collaborator. Results use an owned test payload and a queued JS-delivery
collaborator, with assertions that the external root and actual carrier are
already detached before result delivery, and that the context boundary retires
afterward. These boundaries do not establish full runtime/backend integration.

The native fixture asserts requested native `VISIBILITY`, `ENABLED`, and hit-test
attributes, full viewport carrier attachment, whole-panel frame progression,
matching scrim progress, active close retention through reconciliation and
resize retargeting, forced stale scrim rejection, duplicate terminal suppression,
and result-after-detach ordering. The background tests preserve existing host
policy: finish an admitted close synchronously, or cancel an open/drag settle
and hide the retained sheet until foreground returns.

The full-window carrier remains attached while closing and input-disabled.
The fake SDK proves the requested attributes and native callback paths only.
Actual ArkUI sibling/background hit testing, event ordering and device behavior
remain pending; native `NODE_ENABLED=false` alone is not device blocking proof.

## Baseline / fixed host selectors

Use the exact same fixture and boundary with the current helper cpp/header pair
held constant, selecting only the old or fixed host definitions to isolate the
host closing-visibility defect. `SHEET_SURFACE_HEADER` selects the exact helper
header. `SHEET_SURFACE_NAVIGATOR_BODIES` selects the generated host include.

The generated baseline include is
`sheet-surface-navigation-baseline-bodies.inc`, taken from the parent's immutable
`/tmp/valdi-sheets-20261103/host-closing-visibility-prefix/` host snapshot.
The generated fixed include is `sheet-surface-navigation-bodies.inc`, taken from
the live fixed host. A later typed input callback edit outside these six methods
changed the full host file hash. The original generated files were preserved;
`sheet-surface-navigation-resumed-bodies.inc` is extracted from the new immutable
host snapshot at
`/tmp/valdi-sheets-20261103/surface-input-freeze-20261103/HarmonyNavigator.cpp`.
It is byte-identical to the first fixed include. The corresponding
`*-source.json` manifests record full
source hashes, method hashes, and output hashes. The old host attempts a native
HIDDEN visibility write during foreground close; the fixture observes that write
at the SDK boundary.

The parent controller completed native baseline RED (exit -6 at the foreground
closing native VISIBLE assertion) and fixed GREEN (exit 0) using the same fixture,
SDK fake boundary, and helper source. The read-only receipts are
`/tmp/valdi-sheets-20261103/surface-navigation-integration/baseline/receipt.json`
and its `fixed/receipt.json` peer. The new source receipt verifies their core
input hashes and selected generated method bytes against this freeze, and
records their run-log hashes. These are macOS ASan/UBSan fixture executions
against real SDK declarations and fake SDK calls, not an OpenHarmony runtime,
application link, HAP, or device test. The implementation child did not run
these native commands.

To generate another pair of NEW outputs, the source-only command is:

```sh
python3 -B scripts/harmony/tests/sheet-surface-navigation-extract.py \
  --source /absolute/path/to/HarmonyNavigator.cpp \
  --output /new/path/selected-bodies.inc \
  --manifest /new/path/selected-source.json
```

Outputs are created exclusively so historical source evidence cannot be
silently overwritten.

## Reference and limits

The actual iOS `SheetHostView.swift` separates the rendered sheet translation
from `contentFrame.isUserInteractionEnabled` in `setContentInteractionEnabled`.
Its scroll-pan admission checks real descendant UIScrollViews, and
`beginSheetDrag` avoids disabling an active scroll ancestor. These are ownership
and interaction references. This Harmony carrier extension does not claim
identical spring physics, scroll negotiation, or native gesture ordering across
platforms.

`sheet-surface-input-check.mjs` verifies historical snapshots, the resume audit,
unchanged extracted source bytes, and the current freeze digests. It runs only
the existing JavaScript production-scalar geometry tests. Source verification
and JavaScript results are distinct from native execution.
