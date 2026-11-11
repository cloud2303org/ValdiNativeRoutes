# Lottie demo

`valdi/modules/app_pages/src/features/lottie/LottiePage.tsx` is a Valdi
`Page<PageViewModel, State, PageContext>` using the real `<animatedimage>`
element. Its native exports are `VRLottiePage` (iOS) and
`io.valdiroutes.pages.LottiePage` (Android). Open route `lottie` from Home's
"Lottie 动画" button. The app starts directly on Home.

## Offline resource and license

The immutable upstream sample is `demo/gatin/data.json` from
`airbnb/lottie-web`, commit `bede03d25d232826e0c9dca1733d542d8a7754fb`.
The downloaded files remain in `valdi/modules/app_pages/assets/lottie/`:

- `gatin.json`: 37,620 original bytes, SHA-256
  `48724c6f89fc278bfc182e8b70b7f77fb78e0c19819d6ec6aa79cbde432d1f79`.
- `LICENSE.txt`: the complete upstream MIT license, including the
  `Copyright (c) 2015 Bodymovin` notice.
- `source.json`: the pinned origin and metadata.

The animation is 800 × 800, 25 fps and 3.2 seconds; it has no external assets
or fonts. No network request is needed by the page.

The current packager does not include arbitrary JSON resources. Generate the
checked-in TypeScript resource without changing the generic compiler pipeline:

```sh
node scripts/generate-lottie-demo.mjs
node scripts/generate-lottie-demo.mjs --check
```

The generator checks the original JSON SHA-256 and byte length, the MIT file
SHA-256, attribution and metadata. It creates a narrowly scoped color
compatibility derivative, base64-encodes that derivative, and exports the
full license text in `valdi/modules/app_pages/src/features/lottie/demoData.ts`.
`LOTTIE_DEMO_SOURCE` continues to describe the untouched upstream source;
`LOTTIE_DEMO_DERIVATIVE` describes the shipped bytes and conversion.
`LOTTIE_DEMO_BYTE_LENGTH` is the shipped derivative's size.
`--check` is read-only and requires the derivative JSON, conversion receipt
and generated TypeScript to match exactly. Paths resolve relative to the
script, so the invocation does not depend on the working directory.

At page creation, `coreutils/src/Base64` decodes those bytes and
`valdi_core/src/Asset.makeAssetFromBytes` creates a page-owned asset. The full
license ships in the same module and is accessible through “查看 MIT 许可”.
There is no module-level native asset cache.

## Color compatibility derivative

The initial Android run had successful asset-load and progress callbacks but
nearly white animation pixels. Source inspection found that the version 4.0.0
sample stores fill and stroke RGBA channels in the legacy 0–255 range. The
compatibility derivative represents those colors in the 0–1 range expected
by the current Skottie color reader.

`gatin.json`, `LICENSE.txt` and `source.json` remain unchanged. The generator
adds these reproducible files beside them:

- `gatin.skottie.json`: the JSON used by the exported base64 resource;
  38,564 bytes, SHA-256
  `174f9f19a6dc58dc9f839a9b7b5bc08e5f8bcba94c47d04da31f4c1569634092`.
- `gatin.skottie.receipt.json`: original and derivative byte lengths and
  SHA-256 hashes, serialization, conversion name and every changed path,
  shape type, original value and normalized value.

The generator verifies the exact inventory of **35 static `c.k` color arrays**
belonging to `fl` (fill) or `st` (stroke) shapes before conversion:

| Original RGBA | Count | Converted RGBA |
| --- | --- | --- |
| `[255,238,230,255]` | 19 | `[1,238/255,230/255,1]` |
| `[255,159,87,255]` | 15 | `[1,159/255,87/255,1]` |
| `[244,141,71,255]` | 1 | `[244/255,141/255,71/255,1]` |

Every existing RGB(A) channel of an identified color sample is divided by
255. Color-keyframe handling is restricted to `s`/`e` RGB(A) samples inside
a fill/stroke `c.k`; this pinned sample has **zero color-keyframe samples**.
Any change to the pinned source hash or inspected inventory stops generation.
The receipt records decimal channel values and exact paths.

No geometry, transform, opacity, timing, easing, animation version, solid-layer
hex color, or other JSON property is normalized. The generator restores the
converted samples and deep-compares the entire JSON tree with the original
as a check that every other value remains identical. The derivative uses
compact `JSON.stringify` serialization plus one final LF; only the derivative
is reserialized.

The original MIT notice still ships in full and applies to the derivative.
Both rebuilt mobile apps rendered the colored cat. Load/progress callbacks
alone were not accepted as rendering evidence.

## Controls and lifecycle

- Initial state is `PAUSED`, with `advanceRate=0` for a stable first frame.
- Play/pause retains the user's preference. Speed cycles through 1×, 2×,
  0.5× and back to 1×. Loop starts enabled.
- Restart requests 0 seconds and pauses. Seek requests 50% and pauses,
  using the callback duration when available, otherwise the source duration.
  Both actions increment the animated element's key, including repeated
  requests at the same target time.
- `onAssetLoad(success, errorMessage)` supplies loading success/failure.
  `onProgress({time, duration})` supplies the displayed time in seconds.
  The time readout is empty until an actual progress callback arrives; a
  requested seek does not manufacture a successful callback.
- Progress-driven state updates are spaced at least 200 ms apart (at most
  5 Hz), with a cancellable trailing update so the final sample can appear.
  User actions update their own status immediately. Status preserves the
  last semantic action alongside playback preference and load outcome.
- When `viewModel.visible` is false, `advanceRate` becomes zero and pending
  progress UI work is cancelled. Returning to visibility resumes only when
  the user's preference is playing. This covers retained pages hidden by
  navigation, tabs or app background.
- The non-looping end state is derived from a real progress callback at
  the reported duration. Play after that state remounts from the beginning.
- Destroy cancels pending progress work, invalidates callbacks and drops the
  page's asset reference. The host's page teardown removes the animated
  element and its native resource. There is no separate animated-image
  `dispose()` API in the inspected TypeScript contract.
- Callbacks from replaced elements are rejected by generation; callbacks
  after page destruction are ignored. Hidden-page progress is ignored.

The navigation bar stays fixed. The 200 px animation card, controls, source
attribution and optional expanded license live in the remaining scroll area.

Stable accessibility IDs:

| ID | Target |
| --- | --- |
| `lottie-page` | Page root |
| `lottie-canvas` | Animated element |
| `lottie-status` | Playback preference, actual load outcome and last action |
| `lottie-time` | Actual progress callback time/duration in seconds |
| `lottie-play` | Play/pause |
| `lottie-restart` | Reset to zero and pause |
| `lottie-seek` | Seek to 50% and pause |
| `lottie-speed` | Cycle speed |
| `lottie-loop` | Toggle loop |
| `lottie-license` | Expand/collapse complete MIT notice |

## Validation, 2026-11-05

These are historical package/replay results from before the Login removal.
The saved flows now enter from Home; this entry migration has not been replayed.

- Android arm64/API 36 emulator: visible colored cat, initial paused load,
  real progress, pause/reset/repeated midpoint seeks, speed-option cycling,
  loop-off completion, and reset after exit/reopen. Two unchanged structural
  replays passed 58/58, with Home idle warnings. A stale live automation tree
  disagreed with correct screenshots during recording; this remains a tooling
  limitation. The screenshots at zero and midpoint differ at 3,803 pixels
  inside the animation region.
- iOS arm64/iOS 26.5 simulator: visible colored cat, initial paused load,
  midpoint callback at 1.60 seconds, advancing playback, pause/reset/repeated
  seek, and initial state after exit/reopen. Two unchanged replays passed 24/24
  with no warnings. Zero/midpoint screenshots differ at 5,023 pixels inside
  the animation region.
- Debug native apps compiled; Release Hermes modules compiled; generation and
  `--check` passed. There is no measured speed-ratio, frame-rate, acoustic,
  leak-instrumentation, physical-device, or frozen visual-baseline claim.

Saved evidence is under `/tmp/valdi-media-demo-20261105/android-lottie-final/`
and `/tmp/valdi-media-demo-20261105/ios-lottie-final/`. The recorded flows are
under `.argent/e2e/media-android-lottie-final-*` and
`.argent/e2e/media-ios-lottie-final-20261105.yaml`.
The final package hashes and the subsequent final-package replays are indexed
in `/tmp/valdi-media-demo-20261105/validation-final.json`. Earlier child reports
remain separate evidence; the index identifies their artifact and tooling limits.
