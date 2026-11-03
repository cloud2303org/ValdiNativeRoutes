Round-three source-only supersession of the original and db89 backend freezes.

The final private typed reason API is documented in sheet-backend-max.md;
there are no further host API changes in this handoff. The parent owns all
compiler and test execution.
The initial 21-source freeze and all original proofs are immutable.

Confirmed issues addressed:

1. `finish()` now distinguishes owned cleanup identity from new input
   admission. A touch-disabled root can restore the selected owned scroll
   modes. Cancellation snapshots owned logical ancestry and control/sequence
   identity, calls end once, and rechecks those snapshots before consuming the
   same old sequence. It never traverses a revoked native hostParent or panel
   for cleanup. A changed command generation, disposed/replaced control, or
   changed mount stops the old cancellation. Ordinary unsheeted cancellation
   retains its original path. Restoring properties keeps descendant input
   disabled beneath a disabled logical root.

2. A manual sheet publication supplies one weak session/control/generation
   guard, consumed before enqueue can call runtime. The exact queued notice
   retains it across deferred drain. Actual `NativeScroll::drain()` checks it
   after runtime delivery and before runtime offset correction/drag-target
   handling. Independent reentrant commands/publications do not inherit it.
   Adjacent replacement samples replace their guard; stale/skipped/cleared
   notices remove their guards. No native event ID, timestamp, or equal-float
   deduplication is introduced.

3. Disabling a root/non-scroll ancestor restored selected descendants with
   native scroll interaction disabled. Re-enabling previously updated only
   node.scroll, leaving those descendants disabled after the old chain cleared.
   The actual touchEnabled setter now reconciles scroll properties throughout
   its retained owned logical subtree. Each control keeps its own touchEnabled
   and scrollEnabled flags. A setter revision plus root/control/ancestry
   identity, mount and context guards stop stale work after synchronous
   reentry, replacement or teardown. No borrowed panel traversal authorizes
   property reconciliation, and unrelated subtrees are not visited.

The new fixture includes exact production declarations and bodies extracted
from an explicit backend root. `sheet-backend-p2-boundary.hpp` supplies only SDK,
renderer and runtime callback/lock seams. It does not substitute NativeScroll
cancel, properties, enqueue, drain, queueCommand, specs, queueDragTarget,
scrollInputRoot, scrollDragCurrent or NativeScroll.event.
The touchEnabled branch is copied verbatim from the selected NativeGestures.inc
into a small test wrapper. The actual cancelSubtreeScroll body is included.
Unrelated gesture cancellation remains a boundary shim. NativeScroll.event
editor blur and descendant raw terminal collaborators fail if entered; each
fixture control explicitly disables those features. Navigation, runtime,
NAPI, input, label and wheel sources are not changed.

Source selectors prepared for the parent:

- Pre-reenable app: `/tmp/valdi-sheets-20261103/backend-touch-reenable-prefix/app`
- Pre-reenable fork: `/tmp/valdi-sheets-20261103/backend-touch-reenable-prefix/fork`
- Fixed app: `harmony/entry/src/main/cpp/backend`
- Fixed fork: maintained `valdi/harmony/arkui`

Run the extractor with the selected root, matching unchanged support root,
and a distinct output directory:

```sh
python3 scripts/harmony/tests/sheet-backend-p2-extract.py \
  --backend-root /tmp/valdi-sheets-20261103/backend-touch-reenable-prefix/app \
  --support-root /Users/cloud/project/ValdiNativeRoutes/harmony/entry/src/main/cpp/backend \
  --out /tmp/valdi-sheets-20261103/backend-round3-generated-prefix-app
```

The extractor only writes source text and SHA receipts. It never starts a
compiler. Pre-fix snapshots supply every changed header/body; only unchanged
ScrollState.hpp and WheelArbitration.inc come from the recorded support root.

Proposed serial host invocation for MAIN ONLY, matching the parent's previous
actual-backend ASan/UBSan include setup:

```sh
/usr/bin/clang++ -std=c++20 -O1 -g -UNDEBUG \
  -fsanitize=address,undefined -fno-omit-frame-pointer \
  -idirafter /Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native/sysroot/usr/include \
  -I/tmp/valdi-sheets-20261103/backend-round3-generated-prefix-app \
  -I/Users/cloud/project/ValdiNativeRoutes/.tools/harmony/upstream/valdi_core/src \
  -I/Users/cloud/project/ValdiNativeRoutes/.tools/harmony/upstream/libs/utils/src \
  -Wno-deprecated-declarations -Wno-nullability-completeness \
  scripts/harmony/tests/sheet-backend-p2-native.cpp \
  -o /tmp/valdi-sheets-20261103/backend-round3-p2-prefix-app
```

Use the same exact fixture and boundary for each selector. Change only the
generated `-I` selector and binary output path. Never compile both profiles
concurrently.

Run the pre-reenable cases separately to retain each expected RED:

```sh
/tmp/valdi-sheets-20261103/backend-round3-p2-prefix-app touch-reenable-root
/tmp/valdi-sheets-20261103/backend-round3-p2-prefix-app touch-reenable-ancestor
/tmp/valdi-sheets-20261103/backend-round3-p2-prefix-app touch-reenable-reentry
```

Controls `independent-command`, `ordinary-scroll` and the original P2 cases
should pass on this db89 baseline. Then execute fixed app and fork binaries
with `all`; both must pass. The parent reported historical original pre-P2
app REDs and db89 P2 app ALL GREEN; those results do not validate this new
event-extracting fixture or round-three source.
Recompile all four SDK manager profiles against the superseding source.
The delegated child has not executed these C++ fixtures or any compiler.
Native-device ordering and budget proof remain pending.

All six fresh selectors share the SAME fixture/boundary sources:

- `backend-round3-generated-prefix-app` and `...-prefix-fork`: immutable
  db89 pre-reenable bodies and final typed header, saved in the 33ddd snapshot.
- `backend-round3-generated-sum-app` and `...-sum-fork`: immutable SUM
  allocator with the P2 source candidates and historical bool header.
- `backend-round3-generated-fixed-app` and `...-fixed-fork`: final P2,
  re-enable, MAX+pin and typed-reason bodies/header.

All live under `/tmp/valdi-sheets-20261103`. Generic callback adapters map
historical bool cancellation to lifecycle cancellation so the same body
fixture can compile both baselines without rewriting its assertions.
Use fresh binary names `backend-round3-p2-{selector}` and
`backend-round3-max-{selector}`. The original da719 pre-P2 and all old generated
selectors/proofs remain preserved separately. Only main runs serial commands.
