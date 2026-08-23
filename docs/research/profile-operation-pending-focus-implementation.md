# Profile question operation feedback and focus implementation

Status: implemented and provisionally retained

Branch: `codex/profile-operation-pending-focus`

Base: `codex/profile-answer-separate-labels` documentation hand-off `8eb3149`

Research commit: `43b1707`

Rendered contract commit: `6ed7bd3`

Implementation commit: `1625fff`

Review date: 2026-08-24

## Outcome

Every asynchronous action on the active profile question now gets one
synchronous owner before React renders or the handler awaits anything. The
child sees one short truthful phase beside **Your answer** without the card
growing or the initiating action changing its name:

- **Opening mic…** while browser permission or stream acquisition is pending;
- **Listening…** only after `MediaRecorder.start()` succeeds;
- **Writing…** while the captured clip is transcribed;
- **Thinking…** while an answer or either skip action is saved; and
- **Ready.** after speech becomes editable text.

The initiating microphone, Next, Skip question, or Skip for now button stays
the same focused, full-contrast node with `aria-disabled="true"`. Competing
question controls are native-disabled individually. Repeated pointer, Enter,
Space, programmatic click, and native form-submit activation cannot create a
second operation.

This is a question-operation and presentation repair. It does not change the
questionnaire, the 4.2-second recording duration, answer storage, server
idempotency, acknowledgments, Chinese copy, AI behavior, or caregiver profile
editor.

## Reproduced baseline

The stacked base disabled the whole fieldset. Chromium removed the activated
microphone or submit action from focus and left `BODY` active; the next Tab
could jump to the fixed Account control. The pending paragraph inserted a new
grid row and grew the card by 52–60 CSS pixels. At 280x568, the duplicated long
save copy made the thinking card 104px taller than idle. At 640x360, only the
top edge of the footer remained visible.

The state boundary also said **Listening…** before microphone permission
resolved. Same-browser-task bursts produced duplicate microphone, answer-save,
and setup-skip requests. A mixed microphone/Replay burst could invalidate the
real work and strand the UI. The handlers did not pass their APIs' existing
AbortSignals, so a late microphone grant could start recording after exit and
late transcription/save work could write into a newer route.

The detailed measurements, standards, source limits, alternatives, and chosen
contract are preserved in the
[guidance memo](./profile-operation-pending-focus-guidance.md).

## Implemented boundary

### One owned operation

`LearnerProfileGate` keeps an `ActiveQuestionOperation` ref containing the
initiating action, one `AbortController`, and the current operation generation.
The ref is acquired synchronously. Every entry point consults it before state
updates, network work, or recording. UI guards and this domain guard are both
required: rendered disabling alone cannot stop several `.click()` or
`requestSubmit()` calls in one task.

Recording, transcription, answer save, optional-question skip, and question
**Skip for now** all receive the owner's signal. Active-question replacement,
learner-route exit, and unmount abort and invalidate current ownership. Every
success, error, and `finally` path first proves that it still owns the current
generation, so even a cancellation-ignoring late promise cannot mutate a new
question, route, value, alert, acknowledgment, status, or focus.

`recordSpeechClip` now accepts an optional `onRecordingStart` callback. It is
called once immediately after `MediaRecorder.start()` succeeds, never during
permission waiting and never after an earlier failure or abort. This is the
truthful transition from **Opening mic…** to **Listening…**.

### Playback does not compete with recording

Question Start and Replay audio now use a parallel abortable playback owner.
Twelve same-task Start or Replay activations create one playback request.
Replay remains the same full-contrast button and exposes `aria-disabled` while
audio owns it, then re-enables on normal finish or abort. Beginning any question
operation first aborts question playback, so Peppa's prompt cannot continue
over a new microphone recording.

### Stable child-facing presentation

The question keeps one empty `role=status` node mounted beside the dedicated
**Your answer** label. Its line has a fixed minimum height, so every compact
phase uses space already present in idle state. The fieldset stays enabled and
unfaded; the textarea and non-owner actions receive their own native disabled
states. Owner buttons keep their existing accessible name, node identity,
focus indicator, and full opacity.

When an error appears, the alert remains a separate full explanation instead
of being squeezed into the status pill. Review found that this inserted row
could move the still-focused retry below a short viewport. An isomorphic layout
effect now scrolls only the already-focused control inside the same form to the
nearest visible position. It never focuses a node and does nothing when the
learner moved to Account or anywhere outside the form.

## Test-first interaction evidence

The deterministic browser fixture can independently hold and settle microphone
permission, recording, transcription, answer save, question skip, setup skip,
and question playback. It records request, pending, resolved, rejected, abort,
and stopped-track counts. A cancellation-ignoring mode deliberately resolves
aborted transcription and save promises late to test the generation guard
rather than merely the mock's `AbortError` behavior.

The rendered contract proves:

- one request after pointer, Enter, Space, twelve same-task activations, twelve
  `requestSubmit()` calls, and mixed-action bursts;
- the same owner node, accessible name, focus, ARIA state, native-enabled state,
  and full opacity through every held phase;
- a deliberate Tab path to Account and Shift+Tab return while ownership is
  retained;
- native disabling of non-owners without a disabled fieldset;
- success hand-off to the next question, acknowledgment, or route destination;
- failure/retry without focus theft, including no restoration after focus was
  deliberately moved;
- late microphone-track cleanup, active recording stop, route-exit aborts, and
  stale transcription/save quarantine;
- question Start/Replay de-duplication, normal Replay re-enable, keyboard
  suppression while owned, and playback abort before recording;
- complete state by the next animation frame and within 100ms locally; and
- no new motion plus stable geometry, focus paint, targets, and overflow at
  280x568, 320x640, 390x844, 640x360, and 1440x900.

The accessibility-review failure path was reproduced before its fix:

| Viewport and owner   | Focus-paint bottom before fix | Viewport bottom | Final scroll position and paint bottom |
| -------------------- | ----------------------------- | --------------- | -------------------------------------- |
| 280x568 Next         | 619.5px                       | 568px           | `scrollTop=53`; 567.5px                |
| 320x640 Skip for now | 699.5px                       | 640px           | `scrollTop=71`; 639.5px                |
| 640x360 Next         | 403px                         | 360px           | `scrollTop=43`; 360px                  |

Account-focused rejection separately preserves Account focus and main
`scrollTop=0`.

## Visual and timing evidence

The [artifact manifest](../../artifacts/ux-review/profile-operation-pending-focus/manifest.md)
indexes 38 genuine in-app Browser screenshots, their exact dimensions and
SHA-256 digests, worktree/fixture provenance, viewport geometry, contrast
measurements, and evidence limits.

The most revealing comparison is the 280x568 save state: the
[base](../../artifacts/ux-review/profile-operation-pending-focus/base/280x568-thinking.jpg)
dims the task, repeats **Peppa is thinking…**, and pushes both footer actions
below the fold; the
[candidate](../../artifacts/ux-review/profile-operation-pending-focus/candidate/280x568-thinking.jpg)
keeps one **Thinking…** pill, full owner contrast, and visible actions. The
same footer-loss correction is visible in the 640x360
[base writing](../../artifacts/ux-review/profile-operation-pending-focus/base/640x360-writing.jpg)
and [candidate writing](../../artifacts/ux-review/profile-operation-pending-focus/candidate/640x360-writing.jpg)
pair.

The measured candidate has zero operation-phase card or scroll-range delta at
all five viewports. This is stronger than saying horizontal overflow is absent:
the prompt, answer field, and actions no longer recenter or separate as work
advances. The 320x640 idle composition still requires 113px of vertical scroll;
the branch removes only the extra 60px caused by pending feedback.

## Independent review decision

Three independent agents reviewed the frozen production diff, test boundary,
semantics, original-resolution captures, narrow/short compositions, focus,
contrast, lifecycle ownership, and child-facing language.

Code review found no actionable production defect. It confirmed synchronous
ownership, signal propagation, stale-result quarantine, playback/recording
exclusion, same-node focus, and the narrowly scoped error-scroll effect.

Accessibility review initially found two issues. Pending owners were too dim,
so each owner now overrides the shared `aria-disabled` opacity to remain fully
legible. It then found the inserted-error clipping measured above; the scoped
nearest-scroll repair passed independent remeasurement and leaves outside focus
and scroll untouched. Final review found no remaining branch blocker.

Visual review found the candidate materially clearer and more compact, with no
current-branch blocker. It retained two product questions rather than disguising
them as implementation success: **Next** begins below the initial 320x640
viewport, and **Skip question** versus **Skip for now** may be too subtle for a
five-year-old beginner.

Retain this branch provisionally. It fixes reproduced focus loss, duplicate
activation, false phase naming, pending layout growth, audio overlap, and stale
lifecycle writes without expanding the product workflow.

## Verification

| Check                                             | Result                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Focused operation-feedback Chromium suite         | 18/18 passed, including three red-then-green error-visibility cases |
| Affected operation and viewport Chromium set      | 37/37 passed                                                        |
| Full component/integration/lifecycle/safety suite | 686/686 passed                                                      |
| Full Chromium suite                               | 311/311 passed                                                      |
| TypeScript and production build                   | Passed                                                              |
| Lint                                              | 0 errors; 2 pre-existing generated-worker warnings                  |
| Diff hygiene                                      | Passed                                                              |
| Research and artifact links                       | 691 local links across 98 Markdown files; 0 missing                 |
| Visual artifacts                                  | 38/38 JPEG types and manifest SHA-256 digests verified              |

These checks ran after the final code-review and accessibility-review fixes,
against `1625fff` plus this documentation hand-off.

## Limits and next questions

Local deterministic Chromium does not establish VoiceOver, TalkBack, NVDA,
JAWS, Switch Control, voice control, Safari, Firefox, real permission dialogs,
physical microphones, slow-device paint, server rollback, safe-area behavior,
zoom/text spacing, localization/RTL, or child understanding.

The five compact phase words are hypotheses. Test them with five-to-seven-year-
old Pre-A1 learners across home languages and support needs, with a separate
seven-to-ten beginner group. Ask children to point to or demonstrate what is
happening rather than testing their ability to read the English label.

Three bounded follow-ups remain:

1. make the primary action discoverable at the initial 320x640 scroll position
   without shrinking targets or making the other four viewports worse;
2. map child-facing operation failures to fixed simple copy instead of exposing
   arbitrary `Error.message`; and
3. test whether children distinguish **Skip question** from **Skip for now**,
   including whether a small bilingual or consequence cue is clearer.

The 4.2-second automatic recording duration remains a separate timing study.
Do not change it from this branch without observing slow young L2 speakers and
comparing a child-controlled stop action.
