# Compose Insets version: Android startup measurements, 2026-11-06

Five process restarts on the MEIZU 20 produced a median of **228.12 ms** from
the process anchor to the first root `dispatchDraw` return after the context
render callback. The range was **211.62-299.16 ms**.

This endpoint is neither a semantic Home-label observation nor GPU completion
or display presentation. It must not be treated as the earlier host/edge
experiment's Home-label endpoint.

## Conditions

- Device: `100.76.164.6:5555`, MEIZU 20, Android 16/API 36.
- Installed Release APK:
  `34bf217219bca51e7c23d70238a08a7f247df0c253e4c34cd4bea3cdb4044979`.
- Official Compose WindowInsets version; no Activity-level Insets listener.
- Actual ART state before and after sampling: `speed-profile/cmdline`.
- The existing installed APK was used. No build, reinstall, source change,
  screen recording or native CPU sampling was performed for this measurement.
- One warmup was excluded, followed by five restarts using the same recorded
  Argent Home path. Data, filesystem caches and profile history were retained.
  These are not reboot, fresh-install or storage-cold starts.
- Existing opt-in startup logging was enabled for measurement, then disabled
  and followed by a normal Home launch. Logging has overhead, and its enabled
  root subclass is the existing measurement path, not the default silent root.

The five accepted PIDs are distinct from each other and from the warmup.
Raw startup logs were collected continuously so device log-ring eviction could
not silently remove the beginning of a sample.

## Overall samples

```text
run1: 228.12 ms
run2: 218.79 ms
run3: 211.62 ms
run4: 229.33 ms
run5: 299.16 ms
```

No accepted sample or outlier was removed. Median: 228.12 ms.

## Stage wall durations

| Stage | Median | Min-max |
| --- | ---: | ---: |
| Application `onCreate` | 24.67 ms | 18.80-48.15 ms |
| Load Valdi library | 3.91 ms | 3.58-4.54 ms |
| Register generated native factories | 2.93 ms | 2.06-28.32 ms |
| Construct runtime manager | 3.85 ms | 3.57-5.39 ms |
| Activity `onCreate` | 29.52 ms | 14.64-42.73 ms |
| Explicit `enableEdgeToEdge` call | 27.29 ms | 13.31-40.57 ms |
| Request JS scope to callback arrival | 8.01 ms | 4.04-13.77 ms |
| JS host-startup callback | 38.12 ms | 29.71-54.66 ms |
| Resolve Vision bridge export | 15.62 ms | 12.03-23.91 ms |
| Resolve StartApp export | 8.69 ms | 7.42-16.41 ms |
| Invoke StartApp | 12.79 ms | 8.07-14.19 ms |
| Route-post span to main callback arrival | 38.94 ms | 12.94-53.44 ms |
| Main route-delivery entry to page-create entry | 14.84 ms | 13.63-24.45 ms |
| Synchronous page creation call | 1.86 ms | 1.53-2.11 ms |
| Inflate request to context-render callback | 35.33 ms | 32.47-38.33 ms |
| Context-render callback to subsequent root draw return | 37.20 ms | 26.13-39.17 ms |
| Page-create entry to root draw endpoint | 72.52 ms | 61.99-76.24 ms |

The stage intervals are elapsed wall durations, including waits and scheduling.
They are nested or overlapping and cannot be added into an independent cost
total. Their separately computed medians also do not form a synthetic launch
timeline.

The Vision resolve marker wraps `InstallVisionHost.create(js)`; the invocation
has its own marker. This is not a model-inference or image-processing timing.
The synchronous page-creation call is not complete rendering.

The retained last sample has a 28.32 ms generated-factory registration interval
and a 53.44 ms route-post interval. These are observed fluctuations; no CPU
trace was taken to explain the exact cause or assign the entire overall
difference to either stage.

## Clocks and endpoint semantics

Intervals use `elapsedRealtimeNanos()`. The process anchor comes from
`Process.getStartElapsedRealtime()` and retains millisecond resolution.
The reported numbers are not touch-to-display timings.

The pinned Valdi context-render completion can precede native transaction
submission. The subsequent root draw is stronger than that completion alone,
but it does not inspect Home content or establish a presentation fence.
Repeated measure/layout stages in `summary.json` select their first matching
Home-root event; they are not a summed or maximum business-layout measurement.

All five Home replays passed 4/4, each retaining one idle warning. The warmup
and final logging-disabled replay also passed 4/4 with an idle warning each.
These explicit Home-title/Calculator checks establish eventual destination
readiness, not its exact presentation timestamp.

## Evidence and cleanup

Evidence: `/tmp/valdi-compose-startup-20261106`.

- `before.json` binds the installed package, source hashes and ART state.
- `runs/warmup` is preserved separately and excluded from the statistics.
- `runs/run1` through `runs/run5` retain raw logs, parsed events and results.
- `summary.json` contains all five values, median and range for every marker.
- `runner-observed-summary.json` identifies its contents as parent-observed
  tool results, not raw runner exports.
- `final-state.json` and `validation-final.json` bind the unchanged APK/source,
  final ART state and logging cleanup.

Only the owned filtered logcat was stopped. No user data or profiles were
cleared, and Argent services remain running. These observations do not
establish a percentage speedup relative to older batches or different
measurement endpoints.
