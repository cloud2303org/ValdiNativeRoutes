# Android startup Profile and main-thread audit, 2026-11-06

This audit investigates startup work without changing Home content, API
initialization, navigation, the authoritative WindowInsets handoff, or root
layout-spec retention. All device work used the MEIZU 20 at
`100.76.164.6:5555`. Windows emulator timings are not inputs to this report.

Evidence directory:
`/tmp/valdi-startup-profile-audit-20261106`.

## Scope and measurement boundaries

The original production APK is:

- File: `/tmp/valdi-production-startup-20261105/app-production.apk`
- SHA-256: `2cfb26b9e544c16090661a4a8687b6a3103b28d666a34a6788bb84cfd4398a81`
- Package: `io.valdiroutes.app`
- Release/R8 host and production native runtime; local signing retained.

The ten compiler-state measurements used this same APK and retained app data.
They restarted the process, retaining filesystem caches and profile history.
They are not reboot, fresh-install, or storage-cold measurements.

Their endpoint is the first native root `dispatchDraw` return after the
context-render callback. It is not a semantic Home-content check, GPU
completion, or presentation timestamp. It cannot be compared directly with
the Home-label draw endpoint in
[the earlier host experiment](android-view-host-ab-20261106.md).

All stage durations are elapsed wall time. They include waits and scheduling,
and nested or overlapping intervals must not be added as independent costs.

## Insets are necessary but do not explain the whole interval

The earlier A1-A5 baseline logs show real insets arriving at
104.11-121.05 ms after the process anchor. Page creation began at
152.74-189.14 ms; the semantic Home-label draw mark arrived at
219.99-251.07 ms. The top and bottom system insets were 116 and 70 physical
pixels.

Thus the first content is not simply an immediate render at the moment safe
area data arrives. Route delivery, host composition, Valdi rendering, native
layout and drawing still follow. This finding does not justify seeding zero
insets or removing the existing handoff.

The old A1-A5 route-post spans all started after edge-to-edge and Activity
`onCreate` returned. That statement is limited to those five runs.

## ART state and packaged Profile

The original installed APK initially reported:

```text
arm64: [status=verify] [reason=install]
```

Its packaged Baseline Profile is valid and bound to its DEX. Decoding finds
8,095 methods and 2,495 classes. There are no explicit entries owned by the
retained `App`, `MainActivity`, `ValdiHost`, or generated `HomePage` classes.
The inspected merged rule inputs are explained by cached library rules.

The original R8 mapping is unavailable. Consequently this is not proof of
zero app-related coverage: repackaged helpers and inlined code cannot be
excluded. Nor does a later comparison APK's `startup:false` metadata establish
the original APK's Startup Profile/Dex layout.

ART compilation affects Java/Kotlin DEX execution. These observations do not
establish changes in Hermes TypeScript execution or native C++ compilation.

## Compiler-state comparison

The order was three `verify` runs, three `speed-profile` runs, two more
`verify` runs, then two more `speed-profile` runs. Actual ART dumps accompanied
the changes. No native profiler ran during these ten samples.

Median wall durations:

| Marker | verify | speed-profile |
| --- | ---: | ---: |
| Process anchor to root draw endpoint | 227.48 ms | 210.70 ms |
| `enableEdgeToEdge` call | 29.22 ms | 28.52 ms |
| Route-post span | 47.14 ms | 32.81 ms |
| Inflation request to context-render callback | 34.01 ms | 34.55 ms |
| Route-main entry to page-create entry | 20.52 ms | 16.80 ms |

The root-endpoint median difference is 16.77 ms, or 7.37%. The 318.80 ms
`verify1` result remains included. Five samples per state, sequential ordering,
retained caches and profile history support a descriptive association with
compiler state, not a general speedup or attribution to packaged rules alone.

The ten saved Home replays passed their four steps and retained idle warnings.
They establish route readiness checks, not a frame-by-frame blank-free launch.

Three current runs have route-post spans beginning before edge and `onCreate`
finish: `verify1`, `verify2`, and `speedprofile5`. Their post/edge-end/onCreate-end
times are respectively 130.77/137.25/138.83 ms, 92.67/99.07/100.56 ms, and
98.53/110.48/111.74 ms. This does not make edge the dominant cause of route
delay. The span begins immediately before `main.post`, rather than at a
separately captured enqueue instant.

## What the native trace actually attributes

A temporary, nondebuggable Release diagnostic APK added only shell profiling
permission through an external manifest overlay. Product source bytes and
45 native/business payload entries matched the original. Its distinct DEX,
mapping and Profile assets are recorded separately; it is not the original
APK used for the compiler comparison.

The analyzed startup process is PID 9625. PID 8976 is the old process and is
excluded from startup attribution. The restarted process has 93 CPU samples,
but none have a usable callsite. The trace therefore supports Android trace
slice and scheduling attribution, not a ranked Java method hotspot claim.

In this one diagnostic startup:

- `enableEdgeToEdge` took 34.88 ms wall time.
- Its nested `inflate` slice took 26.71 ms wall time.
- Main-thread states within edge were 5.83 ms Running, 27.26 ms Sleeping,
  1.69 ms uninterruptible sleep, and about 0.10 ms runnable.
- The `inflate` slice itself included only 1.69 ms Running and 24.97 ms
  Sleeping. One continuous sleeping interval was 24.18 ms.
- An explicitly named DisplayManager/RenderThread monitor-contention slice
  took about 1.37 ms. It does not explain the separate 24.18 ms wait.
- Blocked-function and waker fields are absent for the long wait, so the
  specific dependency remains unresolved.

Cached Activity 1.13.0 bytecode first accesses `window.getDecorView()` inside
the edge call. Local SDK source shows that this can create the decor/content
parent. Combined with the nested inflation slice, the marker includes window
initialization; it is not solely status-bar styling. The trace does not expose
the inflated resource ID or prove an OEM-specific cause.

The diagnostic route-post span was 18.49 ms. Within it, the main thread had
8.92 ms Running and 9.13 ms Sleeping, plus about 0.44 ms in other states.
It overlapped the initial window traversal, including:

- A 7.82 ms `relayoutWindow` slice and Surface/display setup.
- Approximately 0.42 ms inset dispatch and 0.76 ms native layout.
- Compose recomposition slices of 1.46 ms and 0.27 ms; the first only
  partially overlaps the route-post span.

These nested slice durations are not additive. They show real competing
startup work, but do not support calling the whole queue delay Compose
recomposition or attributing it to Nav3.

Trace processing used the already installed Argent trace-processor WASM
offline. An earlier analyzer result for another app was rejected; only the
package/PID-bound trace and SQL output are used here.

## Final restoration and verification

The temporary diagnostic APK was replaced using a data-preserving update.
The installed `base.apk` SHA-256 was checked against the original production
APK. The local `android/app/build/outputs/apk/release/app-release.apk` was
also restored to those original bytes.

The first post-install Profile broadcast returned 0, and a compile command
reported success while ART still showed `verify`. This failed restoration
attempt is preserved. After a normal original-app launch, the broadcast
returned 1; compilation and a new ART dump confirmed:

```text
arm64: [status=speed-profile] [reason=cmdline]
```

The final Home replay passed 4/4 with one idle warning. Data was not cleared.
Startup logging is disabled (`log.tag.ValdiStartup` is empty). Temporary
profiling is absent from the restored APK, and all eight checked product
source hashes match their pre-audit snapshot. The owned logcat was stopped;
Argent services remain available.

## Remaining optimization work

An app-owned launch Profile is a reasonable next experiment, using the actual
launch path and a repeatable semantic Home endpoint. First validate generated
rule coverage and actual ART application, then compare the same endpoint
under controlled runs. The current experiment does not implement such a
Profile or predict its benefit.

The unresolved long wait inside window inflation needs a usable stack or
wait dependency before changing window setup. Moving decor access only to
relocate the marker, dropping edge-to-edge, suppressing the initial draw, or
rewriting navigation is not an evidence-backed fix from this audit.

Raw inputs, failed attempts, query outputs, original/diagnostic APK bindings
and final state are indexed by `validation-final.json` in the evidence
directory. The evidence review independently reproduced all 18 metrics from
the ten raw logs; it was source/evidence review, not a fresh device rerun.
