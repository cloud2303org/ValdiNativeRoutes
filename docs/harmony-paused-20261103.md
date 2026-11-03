# Harmony implementation paused

Date: November 3, 2026.

The user stopped Harmony implementation and requested a separate local branch
containing the current working-tree source and documentation.

- Archive branch: `archive/harmony-paused-20261103`.
- Starting branch: `hermes-v1`.
- Starting commit: `e2aba889`.
- The snapshot includes existing Android/iOS, shared typed-contract, generated
  binding, tooling and Harmony changes. It is a preservation commit, not a
  release or an assertion that every change is complete.
- All active Harmony implementation and audit tasks were interrupted. No native
  compiler or linker process remained in the final stop scan.
- No push, fork synchronization, rollback or deletion was performed.

## State at stop

The minimal native gesture bridge had recorded host sanitizer and two-ABI SDK
checks. Its first current-module simulator HAP was
`19e348c8c9643bb4967a4927977b8397828ca1e17514bef77732a58169fd3d54`
(`io.valdiroutes.gesturebridgeprobe`).

Simulator input reached the raw-touch bridge, but Local/All tap, double-tap and
drag, and Local/Tap-only did not deliver native gesture actions or predicates.
The captured initial 100-record export reconstructs completely with the
supplemental generation-zero converter. This is a failing recognition result.

A narrow native-group attachment correction was in progress when stopped.
The preserved `gesture.cpp` and its fixture contain unvalidated follow-up edits;
they are newer than the tested `27559cbb...` correction freeze and the simulator
HAP above. No corrected simulator pass is claimed. The harness also has a
separate prepared PX-unit correction; that preparation does not resolve the
native recognition result by itself.

System-spring animation integration was being prepared in scratch only.
The replacement was not applied or validated. The existing custom spring code
is not certified as a completed native animation bridge.

Sheet/navigation and broader component alignment remain incomplete. Historical
receipts retain their original source and artifact boundaries.

## Local evidence

Build caches, downloaded reference documents, test HAPs and logs under
`.tools/` and `.ci/` remain locally available and ignored by Git. Temporary
receipts and scratch material under `/tmp/` are also outside this commit.
Relevant local locations include:

- `.ci/harmony/2026-11-03-gesture-native-bridge-sim/`
- `.tools/harmony/gesture-native-bridge-proof/`
- `/tmp/valdi-gestures-native-bridge-p2-20261103/`
- `/tmp/valdi-harmony-system-animation-20261103/`

No new test suite, SDK build or simulator trial was run to create this archive.
Further implementation requires a new user instruction.
