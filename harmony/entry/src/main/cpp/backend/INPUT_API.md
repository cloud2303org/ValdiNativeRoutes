# Native input contract (SDK 26 / staged pinned Valdi)

`textfield` / `ArkUITextField` use `ARKUI_NODE_TEXT_INPUT`;
`textview` / `ArkUITextView` use `ARKUI_NODE_TEXT_AREA`. Valdi frames
measure/layout the native editor inside the existing custom wrapper.

Supported contract:

- `value`, `placeholder`, `font`, `color`, `placeholderColor`, `enabled`,
  `characterLimit`, `selection: [start, end]`, interactive `focused`,
  `closesWhenReturnKeyPressed`, `textAlign`, `selectTextOnFocus`.
- Pinned official keyboard names are `contentType`, `returnKeyText` for fields
  and `returnType` for areas (`linereturn` by default). No `keyboardType`,
  `secureTextEntry`, or `editable` aliases. Supported content types are
  `default`, `number`, `phoneNumber`, `email`, `url`, `passwordVisible`,
  `noSuggestions`, plus field-only `password`, `passwordNumber`,
  `numberDecimal`. `url`, `passwordVisible`, and `noSuggestions` use NORMAL:
  this SDK has no URL keyboard or per-editor suggestion policy here.
  `numberDecimalSigned` is rejected. `join` maps to SEND and `continue`
  maps to NEXT because the SDK has no exact labels for these.
- `font` uses the shared `FontResolver.hpp` and global module-font registry.
- Common `accessibilityId` sets `NODE_ID` on the actual editor (on the wrapper
  for ordinary views); `accessibilityLabel` uses `NODE_ACCESSIBILITY_TEXT`.
  `NODE_ACCESSIBILITY_ID` is a read-only numeric SDK ID and is not assigned.
  Common category roles use `NODE_ACCESSIBILITY_ROLE` (`image-button` maps
  to BUTTON; `header` maps to TEXT, with no exact header semantic in this API).
- `autocapitalization` and `autocorrection` accept and validate the pinned
  official values, including LoginPage's `none`. SDK 26 exposes no corresponding
  native C node setters, so these are advisory and IME policy remains
  platform-controlled. No composition-disabling substitute is used.
- Events `onChange`, `onEditBegin`, `onReturn`, `onWillDelete`,
  `onSelectionChange` carry `{text, selectionStart, selectionEnd}`.
  `onEditEnd` adds `reason` (0 unknown, 1 return, 2 dismiss).
  Numbers are ordinary JS numbers; offsets/limits count UTF-16 code units.
- `onWillChange` receives committed candidate text/selection through
  `ValueFunctionFlagsCallSync`. Undefined accepts the candidate unchanged.
  An object replaces text/selection, with range clamping. Native replacements
  run under a suppression guard. Programmatic value/selection writes bypass
  user processing. The bounded setter-echo policy below also excludes their
  deferred notifications from change events. They explicitly publish the final clamped
  `selection` store, including a caret shortened by a smaller `value`, while
  suppressing native selection echoes and user selection actions.
- Native state updates use `ViewNode::valueChanged`, which calls
  `updateAttributeWithoutUpdate`, for `value`, `selection`, `focused`.
  Begin follows actual native EDIT_CHANGE; requesting focus is not a begin.
  Native blur or stopping a focused editor on detach/suspension ends that
  session once. Cleanup consumes the session and unregisters receivers before
  publishing focus or invoking the captured end action. Idle stops emit no end.

SDK boundaries:

- Preview/composition events must not enter the processor or committed state.
  Same-text commit events remain meaningful (IME can commit without changing
  text). Native C pre-insert/pre-change hooks cannot replace arbitrary changes
  universally. Process committed change-with-preview events then correct under
  guard rather than vetoing through an unrelated C hook.
- ArkUI's committed-change payload does not identify programmatic origin.
  Its after-layout task uses the current listener/content, and the C bridge
  resolves targetId/userData from the current registration at delivery.
  Unregister/set/register and changing targetId cannot fence these callbacks.
  Native subscriptions therefore remain stable during setters; the stack guard
  prevents synchronous JS processing, while acknowledgements consume the same
  pending records used for delayed callbacks.
- `InputSetterEchoes` is an explicit bounded fallback, not a general
  text-equality deduplicator. Each actual native text/selection write records a
  monotonically numbered generation before setting either attribute. At most
  eight generations are retained. Each record initially has a provisional 500ms
  monotonic deadline to cover synchronous callbacks. After all native setters
  return, a still-valid write completes its own surviving ticket once, giving
  its remaining channels strictly less than 500ms from completion. Time spent
  blocking inside native UI/IME setters therefore does not consume that deferred
  window. Completion never recreates a cancelled, consumed, evicted or
  expired-and-pruned record, never refreshes a newer ticket, and never rearms
  acknowledged channels. A reentrant observation may still prune an expired
  provisional record during a long native call; completion cannot resurrect it.
  A matching text acknowledgement consumes that generation
  and all superseded text expectations once (layout may coalesce setters).
  Selection expectations are separate and one-shot, including a text setter's
  temporary end caret and its final explicit range. Programmatic selection is
  published directly through the Valdi store; filtered echoes cannot roll it
  back or invoke user selection actions. Equality alone with `committed.text`
  never suppresses a native commit.
- Any preview (including an empty marked range), DID_INSERT/DID_DELETE,
  WILL_DELETE, paste/cut, editor touch DOWN or hardware key DOWN cancels pending
  expectations before user processing. The extra insert/delete hooks are
  observation-only post-edit hooks; they do not veto or transform input.
  A nonmatching committed text also cancels old expectations. Selection alone
  retires selection expectations on a mismatch but cannot prove text origin.
  Key/touch UP does not cancel corrections written by that same user operation.
  Stop/detach clears the ledger, while native blur alone does not: a setter's
  deferred content notification can arrive after blur.
- Narrow ambiguity remains: a genuine same-text commit with no observable user
  hook or preview, before the expected echo and within its 500ms window, is
  indistinguishable and may consume that one pending text acknowledgement.
  After it is consumed, expired, evicted, or cancelled, same-text commits run
  onWillChange/onChange normally. Conversely, SDK echoes later than 500ms,
  from evicted generations, repeated without a new setter, or arriving after
  user cancellation are treated as native edits. A user edit can coalesce with
  a queued setter; these payloads expose no reliable split or origin. This
  policy prefers preserving observed user/composition work over suppressing
  every possible setter echo. A matching selection without observable user
  activity has the analogous bounded ambiguity.
- TextArea NEW_LINE does not emit ON_SUBMIT. A single inserted committed newline
  can be detected conservatively; paste and composition must be excluded.
  Keyboard Enter and a one-character newline paste without a paste event cannot
  be distinguished by the C committed-change payload alone.
- C ON_SUBMIT only exposes the action enum, with no `keepEditableState`.
  `BLUR_ON_SUBMIT` is configured, but this cannot promise that every native IME
  preserves editing for nonclosing returns. No synthetic begin or refocus loop.
- TextArea has no password input type. Secure multiline entry is rejected.
  Native `onWillDelete` is best effort: it is not a universal deletion hook and
  may be absent for IME/cut/replacement/empty-field paths.
- `enabled=false` stops input and disables the native editor. Native read-only
  selection parity (`selectable`) is not implemented.
- Native edits are observed after commit; processor correction is not atomic
  pre-edit filtering. SDK callback ordering and keyboard behavior require the
  parent's HAP/device pass. This child performs object/symbol/link validation.

Lifecycle: UI-thread native calls only. Retain editor/owner during callbacks,
invalidate the generation on content/focus replacement or retirement, and
revalidate after synchronous JS. Rebinding actions alone preserves an accepted
native edit and its captured processor/change/selection actions. New sequences
use the replacement actions. Detach, suspension, and disposal stop editing and
unregister receivers before freeing userdata. A later mount reattaches callbacks.

`tests/input-state.cpp` exercises these production session, programmatic-write,
bounded echo and commit helpers under ASan/UBSan through `verify-objects.py`.
Regressions cover deferred set/clear without processor/change delivery,
correction echoes, synchronous acknowledgement, post-echo same-text commits,
composition/activity cancellation, coalesced and successive generations,
separate final/temporary selection feedback, exact expiry, eviction, and
generation-specific exception/reentry cleanup. Completion regressions simulate
a two-second native setter followed by an echo 15ms after return, assert exact
499ms/500ms expiry from completion, and cover one-shot completion, partial/full
acknowledgement, cancellation, eviction, pruning and newer-write reentry. Run
`python3 harmony/entry/src/main/cpp/backend/tests/input-negative-controls.py`
to inject fifteen representative regressions into temporary copies and verify
that the assertions reject each one. These host checks do not execute ArkUI.

Parent device evidence on November 2, 2026 is separate from helper validation:
the fixture's immediate double-setState rollback was fixed outside this backend,
and the r2 HAP now accepts `abc` correctly. In
`.ci/harmony/2026-11-02-elements/input-probe-runtime.log`, plain ArkTS and plain
CAPI also accept `abc`. The CAPI probe's programmatic `xyz` write finishes at
12:55:51.409 with setter/register codes 0 and new targetId 1002; its deferred
change arrives at 12:55:51.416 labelled 1002, with preview offset -1.
Clear finishes at 12:55:53.474 with targetId 1003 and produces a matching empty
change at 12:55:53.479 labelled 1003. These show current-registration relabelling
on the installed SDK, consistent with OpenHarmony-6.0-Release
`interfaces/native/node/node_model.cpp` (`HandleInnerNodeEvent`) and
`frameworks/core/components_ng/pattern/text_field/text_field_pattern.cpp`
(`AddTextFireOnChange`). The upstream branch is explanatory source evidence,
not proof of the exact installed SDK binary revision.

The parent owns the final rebuilt HAP/device pass. This source change does not
claim that the rebuilt HAP has already passed, nor does it rewrite real typing
or infer hardware append behavior from separate replacement tool calls.

The parent subsequently verified the frozen source hashes in the r3 HAP
(`a538388ed030679f67f5c18c3e378af2000f223b9b53e503a61c6fe9a889c50b`).
`qa-054.log` / `qa-055.log` still show a focused `abc` editor moving from
Changes=1 to Changes=2 after programmatic `Native 42`, with selection [3,3].
`input-r3-runtime-failure.log` records its processor/change at
13:09:50.404 / 13:09:50.412. In contrast, `qa-057.log` / `qa-058.log` show a
fresh never-focused editor accepting the same programmatic value with
Changes=0 / begin=0 / end=0. The r3 focused path therefore failed despite the
host regression checks.

Temporary native diagnostics subsequently captured successful focused changes
in `input-ledger-focused-trace.log` and `input-ledger-second-trace.log`.
They show selection setters blocking for 94ms, 117ms and 150ms. The first
`Native 42` echo matches 15ms after the setter returns, with 390ms left on the
old pre-setter deadline and no intervening cancellation. Focused keyboard-zero
programmatic writes also passed in the later trace. Parent checks additionally
observed the Unicode range clamp, key-right selection and one terminal Back.
These successful traces do NOT prove the cause of the original r3 failure:
no failing expired-ticket trace has been captured. The attempted ten-write
sequence in `input-ledger-repeat.log` did not execute because its Windows
command exceeded the encoding/length limit; it is not repeated-pass evidence.

Completion-anchored expiry is scoped hardening of the source-established timing
budget, not a claim that the original device failure's root cause is proven.
All temporary diagnostic logging, text fingerprints, helper state and the
backend Hilog dependency have been removed. The parent must rebuild and repeat
the focused/nonfocused paths on this final noninstrumented source.
