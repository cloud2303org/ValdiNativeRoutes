# P2 terminal-intent fix and explicit interaction carrier

This supersedes the original source freeze only for `HarmonySheetSurface.hpp`
and `.cpp`. `HarmonySheetGeometry.hpp` is unchanged. This implementation child
has not invoked a native compiler, native fixture, build, packaging, or device.
The parent's independent round-two review and serial native RED/GREEN run are
separate future evidence.

The confirmed defect was an opening animation admitted at positive panel height,
then restarted by layout at valid zero height. Its numeric target became equal
to panelHeight (both zero), and public `animateTo` reclassified it as closing.
Restoring positive geometry before finish therefore animated to closed and
reported successful completion there.

Public `animateTo(offset, velocity, completion)` is unchanged. It classifies a
new request once, then calls private `startAnimation(..., closing)`. Layout
restarts pass the original `Animation::closing` explicitly. Zero-height layouts
cannot change an existing session's terminal intent, even after repeated
collapse. This patch preserves the existing admission behavior for a brand-new
numeric request at zero height; a fresh zero coordinate is not an additional
public open/closed command.

An SDK finish while the current panel is zero height still writes exact zero
and delivers success once. Completion is not deferred waiting for positive
geometry. The generation is terminal before user completion runs. A reentrant
host layout chooses the offset for the intent it already owns; a reentrant new
animation gets a fresh generation. Old duplicate/canceled terminals must not
write into either restored layout or the new animation.

The separately approved `interactionNode() const noexcept` returns the explicit
helper-owned panel while attached and not retired/detached. It remains valid
while backgrounded, and returns nullptr immediately on detach or retirement.
The host need not derive this node through `getParent`; backend binding remains
responsible for validating its root, panel, context, and mount identity.

Exact historical evidence, preserved before helper edits:

- `sheet-surface-p2-prefix-20261103/manifest.json` inventories byte-identical
  copies of all three old helper files and every source/test/doc listed by the
  original receipt, plus that receipt itself. Paths beneath this directory
  reproduce the original workspace-relative paths.
- Original `sheet-geometry-20261103-source-receipt.json` remains unchanged:
  SHA-256 `9018356eda3ae58554fc289ca78e0e06382ecf978a01775b529fa517382eaf1d`.
- `sheet-surface-p2-regression-frozen-20261103/manifest.json` inventories the
  identical new regression fixture and fake-SDK boundary, frozen before the
  production helper edit. Both copies have the same workspace-relative layout.

The native regression is `sheet-surface-p2-native.cpp`, which includes
`sheet-surface-p2-boundary.hpp`. This boundary includes real SDK declarations
through the selected real helper header and fakes SDK calls; it does not
reimplement the surface or geometry helper.

For the parent's baseline run, compile the immutable pre-fix `.cpp` from the
historical tree, adjacent to its immutable pre-fix `.hpp` and geometry header.
Set `SHEET_SURFACE_HEADER` to that exact old `.hpp` path (a quoted include token),
and `SHEET_SURFACE_TEST_INTERACTION_NODE=0`. For the fixed run, compile the
current `.cpp` adjacent to its current `.hpp`, select that current header, and
enable the accessor controls (default 1). Do not compile old `.cpp` against new
`.hpp`. The P2 regression body and boundary stay byte-identical between runs;
only helper inputs/header selection and the accessor-only gate differ.

The unconditional body covers opening and closing positive-to-zero-to-positive
with one and three zero layouts, stale/duplicate terminal callbacks, exact final
native panel/scrim writes, collapsed finish completion once, and restoration
with or without fresh-animation/retirement reentry. Accessor-only controls check
explicit panel identity, distinction from the viewport, background, detach,
retire, and retirement inside an actual scrim callback.

`sheet-surface-p2-check.mjs` verifies historical and identical-fixture hashes,
runs only the existing JavaScript production-scalar geometry checks, and emits
superseding source provenance. No JavaScript result is a native RED/GREEN result.
`sheet-surface-p2-20261103.patch` is the exact production patch from the old
snapshot to the fixed helper source.
