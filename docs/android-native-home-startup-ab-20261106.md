# Android native Home startup trial, November 6, 2026

The native menu prototype did not show an overall startup improvement in this
small MEIZU 20 sample. The common Home draw-observation median was 190.84 ms for
the existing Valdi Home and 196.57 ms for the native prototype. The difference
of 5.73 ms is descriptive, not a statistically established regression.

## Comparison

Both arms ran from the same Release APK and kept the existing Application,
Valdi runtime, JS StartApp and route delivery, Compose/Nav3 host, Haze tab bar,
official Compose insets, and immediate Splash exit. Only the Home tab's content
implementation changed. No JS-free startup architecture was tested.

A used the complete existing HomePage. B used a temporary Android View
ScrollView with the same title and seven principal navigation entries. B did
not port Home's database watcher, MMKV operations, auth display, lifecycle
demonstration, or timer. This is a prototype comparison, not a renderer-only
benchmark or an estimate for a complete native Home port.

The experiment lived under `/tmp/valdi-native-home-ab-20261106`. One temporary
MainActivity integration connected it to the Home tab. The original Home TSX,
runtime, navigation implementation and module bindings were not rewritten.

## Measurement

The common observer scans both implementations' native TextViews during
`ViewTreeObserver.OnDrawListener`. It records only after the title and
Calculator entry have positive visible bounds and the title is below the
currently reported native system-bar/cutout top boundary.

This marker precedes view painting and includes the hierarchy-scan/inset-read
overhead. It is not GPU completion, presented pixels, final full-page readiness,
or a desktop-touch-to-content measurement. Five runs per arm do not establish
a general performance difference.

Both accepted arms recorded a fullscreen 1080 by 2400 root, screen origin zero,
title top 150 px and system top inset 116 px. The Calculator TextView bounds
differ because the native menu uses a clickable TextView while Valdi uses a
label within a button container. Visual/workload parity is not claimed.

One final warmup per arm was excluded. The ten measured process restarts ran
in order A1, B1, B2, A2, A3, B3, B4, A4, A5, B5, with distinct PIDs. Data,
filesystem caches and profile history were retained. ART reported
`verify/install` before and after this set. No screen recording or CPU sampling
ran during the accepted measurements.

| Interval | Existing Valdi Home | Native menu prototype |
| --- | ---: | ---: |
| Process anchor to common Home draw observation, median | 190.84 ms | 196.57 ms |
| Same interval, range | 186.01-337.50 ms | 178.33-204.75 ms |
| Route-delivery entry to Home observation, median | 98.32 ms | 80.71 ms |
| Process anchor to route-delivery entry, median | 98.25 ms | 115.87 ms |

The native prototype's route-to-Home stage was 17.61 ms lower at the sample
median. Earlier shared startup and scheduling varied. These separately computed
medians cannot be added into a synthetic launch or used to attribute all
variation to either page implementation.

All five values are retained:

```text
Valdi:  337.50, 190.84, 186.01, 189.80, 228.32 ms
Native: 204.75, 200.49, 182.68, 196.57, 178.33 ms
```

The existing Valdi-only root-draw endpoint had a median of 193.18 ms in this
batch. That is a separate endpoint and has no native-arm equivalent. Older
228-299 ms records used an earlier APK/root observer; 300 ms is not a fixed
current startup time.

## Evidence and limitations

The final diagnostic APK SHA-256 is
`b95a5ebbbeac007f0139d0471cfdd6a4a8896928402960e573d5f73177542a67`.
Its installed hash was verified before and after sampling. All 12 native
libraries match the preceding production APK byte for byte. The complete ZIP
comparison retains DEX, service metadata, baseline profile/profile metadata
and OTA metadata differences. Both measured arms used the same diagnostic APK.

The recorded four-step launch/title/idle/Calculator path passed all ten runs:
40 passed, zero failures, errors or skips. Nine runs retained idle warnings;
the hard title and Calculator checks passed. These are structural destination
checks, not an unqualified smoothness or visual-regression result. The saved
runner summary is explicitly parent-observed tool output, not a raw export.

Earlier probes and warmups are preserved and excluded. R1 could count native
content drawn before the correct inset update; R2's wrapper `dispatchDraw`
missed child-only invalidations. R3 uses the common tree draw observer instead.
The inset observation rule does not change either page's rendering policy.
The prototype can expose an earlier incorrectly inset frame; that frame was
not accepted as correctly positioned Home content.

Release builds and bounded source reviews passed. No full native business
migration or independent statistical replication was performed.

The exact preceding production APK was reinstalled, with installed SHA-256
`1a70b20e02148cd9362cb1ff50fe4edb0ae96b34ca6366d89a383ee9e1e3cbee`.
The scoped source snapshots, OTA fingerprint and logging properties were
restored. A final launch/title/Calculator replay passed 4/4 with one idle warning.
The phone was left on the original Valdi Home. No account or database reset,
commit, or permanent native Home replacement was made.

Independent numeric review reproduced all ten samples and their aggregate
metrics. Its one documentation correction, 115 to 116 px for the native top
inset, is applied here; it does not change timing or sample acceptance.
