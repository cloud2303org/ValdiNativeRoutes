# Android traditional View startup comparison

Measured on Meizu 20 on November 6, 2026. This is a bounded startup
experiment, not a completed navigation migration.

## Result

Five process restarts per host, after one excluded warmup per host:

| Observed interval, milliseconds | Compose/Nav3 median | View median |
| --- | ---: | ---: |
| Process start to native draw containing Home title and Calculator | 239.20 | 221.60 |
| Main route-delivery entry to page-creation entry | 31.71 | 15.42 |
| Page request to context-render callback | 39.16 | 35.13 |
| Heaviest initial Home root `onLayout` | 30.14 | 32.25 |
| Main-queue wait for route delivery | 36.46 | 21.44 |
| `Application.onCreate` | 16.58 | 16.88 |
| `Activity.onCreate` | 23.79 | 28.44 |

The primary endpoint improved by 17.59 ms, approximately 7.4%, in this
sample. Its ranges overlap: Compose 219.99-251.07 ms; View
185.47-228.29 ms. Four of the five corresponding View samples were faster.
This small sample supports a modest benefit from the tested host path.
It does not establish a statistically reliable isolated Nav3 cost.

Valdi's native layout remained substantial. Replacing the navigation host
does not remove that work. These results alone do not justify migrating all
navigation to address the reported blank interval.

## Comparison controls

Both entries were packaged in the same Release/R8 APK, using the same
Application, production Valdi native runtime, Hermes bytecode, Home TS
component, services, user account and SQLite data. MainActivity remained
the launcher. The experimental Activity was launched explicitly through
Argent. No application data or filesystem caches were cleared.

The trial reused the existing Navigator and its Compose runtime state.
The View entry avoided Compose UI composition, NavDisplay, Scaffold and
Haze on its initial path. It used a measured native tab row in place of the
Haze bar. Accordingly, the comparison covers that combined host change.
It does not isolate the navigation library.

The authoritative native inset handoff was preserved. Initial page
creation used the measured native bar footprint. All ten measured runs
observed identical Home Calculator text bounds, `(426, 549)-(653, 608)`,
and root size `1080 x 2400`. This is a landmark check, not full visual
parity.

No pre-draw gate, splash deferral, synthetic content or fixed startup delay
was introduced.

## Endpoint and limits

A temporary, common StartupTrace probe inspected the existing native
TextViews after root `dispatchDraw` returned. It recorded the first draw
with both the Home title and Calculator label having positive visible
geometry. It logged no token or other label contents. The same probe ran
in both arms and added observation overhead.

This is stronger than timing an empty root draw, but still does not prove
GPU completion or physical screen presentation. All reported intervals
are elapsed wall time, including queue waits. Nested or overlapping
medians must not be summed.

Order: A1, B1, B2, A2, A3, B3, B4, A4, A5, B5. A is MainActivity; B is
ViewStartupActivity. All ten Home startup replays passed their four steps,
with no failed, errored or skipped steps. Every measured replay retained
a screen-idle warning; Home's visible timer remained active. Home and
Calculator hard identity checks passed. This is not full navigation QA.

The experimental host supports simple Valdi routes. Native routes, sheets,
custom business tab bars and AppUI presentations explicitly end the trial
and return to MainActivity. Route animations and Haze visuals are outside
its parity scope.

The first build hit a Maven network failure in an unchanged native-module
task. The successful host build reused the existing module JARs and kept
the normal code-generation/export checks. A manifest-only packaging
attempt was caught before installation. The installed comparison APK
contains the actual compiled experimental Activity.

## Artifacts and restoration

Evidence root: `/tmp/valdi-view-host-ab-20261106`.

- `candidate/`: external Activity, manifest overlay, keep rule and source hashes.
- `build-overlay.gradle`: temporary Gradle source injection, outside the checkout.
- `comparison.apk`: SHA-256
  `5aaf8ff45b20a611cb9c3034a18ae46cc7136802d875fd218fbadabc2b0d4638`.
- `summary.json`, `runs/*/startup.log`, `runs/*/result.json`: measured events.
- `replay-summary.json`: explicitly labelled parent-observed tool-result summary.
- `artifact-comparison.json`: packaged native libraries and business assets match
  the original APK. OTA fingerprint metadata and the generated ART profiles
  (`assets/dexopt/baseline.prof` and `baseline.profm`) differ. Updates were
  disabled. Both measured hosts share the same comparison APK and profiles.
- `common-probe.kt` and `common-probe.diff`: the temporary shared observation.
- `restored-source-check.json`: all snapshotted checkout sources restored exactly.

The original production APK is preserved as `baseline-production.apk`,
SHA-256
`2cfb26b9e544c16090661a4a8687b6a3103b28d666a34a6788bb84cfd4398a81`.
The final device/package and logging-property restoration result is
recorded separately in `restoration.json`. No permanent navigation switch
or experimental Activity was added to the checkout.

The final installed APK hash matches the original production APK. The normal
Home/Calculator startup check passed again with the existing screen-idle
warning, the SQLite submission count remained 1, and the final process
emitted no StartupTrace markers after restoring the logging property.
