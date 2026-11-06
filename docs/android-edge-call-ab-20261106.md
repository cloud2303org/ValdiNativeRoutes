# Android explicit edge-to-edge call experiment, 2026-11-06

Skipping `enableEdgeToEdge()` did not produce a measured startup improvement
in this bounded MEIZU 20 experiment. The cost of first window-content access
moved into the following `findViewById(android.R.id.content)` call.

## What was tested

The device was `100.76.164.6:5555`, running Android 16/API 36. Both Release/R8
packages target API 37 and use the same production native runtime, business
content and app data.

- A retains `enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)`.
- B omits that invocation.
- Both have identical temporary timing probes, including the Home-specific
  native-label probe used by the earlier host comparison and a new interval
  around `findViewById(android.R.id.content)`.
- Home content, API initialization, authoritative native insets, navigation
  and rendering backend are unchanged. No draw gate or product timer is added.

This tests the explicit AndroidX configuration call. It does **not** test an
old-style non-edge-to-edge window: Android 16 enforces edge-to-edge for this
target SDK. See the Android Developers page, "Behavior changes: Apps targeting
Android 16 or higher", section "Edge to edge opt-out going away", and the
inspected local SDK's `PhoneWindow.isEdgeToEdgeEnforced` implementation.
No target-SDK downgrade or system compatibility override was used.

## Method and endpoint

The accepted order was A1-A3, B1-B5, A4-A5. Each installation had an excluded
warmup launch; Profile installation and actual ART `speed-profile` state were
confirmed before collecting its samples. The ten accepted startup PIDs are
distinct. All updates preserved application data.

The primary endpoint is process anchor to observation of both the Home title
and Calculator TextViews, with positive visible bounds, after native root
`dispatchDraw` returns. This is a semantic native-content marker, not GPU
completion or screen presentation. The shared probe traverses the view tree
and has overhead; absolute numbers are not directly comparable with another
batch that uses different probes.

These are process restarts with caches and profile history retained, not
reboots or storage-cold starts. The order is not randomized, with five samples
per arm. Both APKs report `speed-profile`, but that does not establish identical
per-method compilation.

## Results

Median elapsed wall times:

| Interval | A: call retained | B: call omitted |
| --- | ---: | ---: |
| Process anchor to Home native-label draw | 309.58 ms | 319.81 ms |
| Explicit edge-to-edge section | 37.32 ms | 0.00031 ms |
| Following content-view resolution | 0.0056 ms | 52.38 ms |
| Activity `onCreate` | 40.03 ms | 55.13 ms |

Home endpoint samples, in milliseconds:

```text
A: 309.58, 286.10, 318.72, 325.71, 300.02
B: 323.94, 319.81, 316.83, 271.35, 354.11
```

B's sample median is 10.23 ms later. The overlap and variation do not establish
a general slowdown or a statistically reliable difference. They provide no
evidence of a startup benefit from removing the call.

Every accepted sample has the same root size, 1080 x 2400, and Calculator
bounds `(426, 549)-(653, 608)`. This checks those landmarks; it is not full
pixel parity, keyboard, fullscreen-video, PiP, or older-Android validation.

The ten measured Argent Home replays passed 4/4 each, with one idle warning
per run. B5 warned about a small changing region; A5 had only one stable
interval before timeout. The other eight did not sustain stillness before
the idle timeout. Explicit title and Calculator checks passed.

## Why the cost moves

The inspected AndroidX implementation accesses `window.getDecorView()` inside
`enableEdgeToEdge`. The local Android SDK source also shows:

```text
Activity.findViewById -> getWindow().findViewById
Window.findViewById   -> getDecorView().findViewById
```

Consequently, omitting the earlier call still leaves a later first access to
the decor/content tree. The measured B content-resolution intervals range
from 12.54 to 74.07 ms. This, together with the source path and the preceding
trace audit's inflation slice, supports relocation of window setup rather
than elimination of its cost.

No B CPU trace was captured, so this experiment does not identify the internal
wait dependency or prove that every part of the two intervals is identical
work. It also does not justify removing backward-compatible window setup for
older Android devices.

## Artifact and evidence boundaries

Evidence is under `/tmp/valdi-edge-call-ab-20261106`.

`variant.diff` contains the single invocation difference. All native libraries
match between A and B. The complete APK entry comparison records the changed
DEX, R8-renamed service descriptors, both Baseline Profile assets, and OTA
fingerprint metadata. Profile differences are retained as a comparison limit.
All other common entries match.

The first attempted A1 passed its UI checks but lost startup events from the
device log ring before collection. It is preserved under
`diagnostics/A1-incomplete-logcat-ring` and excluded as unmeasurable. Accepted
samples used a continuous filtered log stream started before launch. No
accepted timing outlier was removed.

Runner summaries explicitly identify themselves as parent-observed tool
results, rather than raw runner exports. Raw startup logs, parsed events,
results, source snapshots, build logs, APKs, mappings, ART dumps and hashes
are retained in the evidence directory.

## Restoration

Temporary product-source edits are restored after each build using exact-byte
snapshots and concurrent-edit guards. The final device restore is bound to the
original production APK:

```text
2cfb26b9e544c16090661a4a8687b6a3103b28d666a34a6788bb84cfd4398a81
```

The installed original APK hash was independently checked after restoration.
ART reports `speed-profile/cmdline`. The logging property is empty, and the
post-compilation original-app Home replay passed 4/4 with one idle warning.
The local Release APK output was restored to the original production bytes.
Final installed hash, ART state, source equality, logging-property cleanup
and the Home check are recorded separately in `final-state.json` and indexed
by `validation-final.json`.
