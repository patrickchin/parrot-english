# Child-Paced Profile Acknowledgments

Last reviewed: 2026-08-21

Branch: `codex/profile-acknowledgment-control`

Base: `codex/first-use-ux-audit` at `ab95c65`

Implementation: `4dd2ad3`

Status: implemented and retained provisionally; automated, build, and local
in-app visual validation complete; target assistive technology, target devices,
real audio policy, and child/caregiver observation remain open

## Outcome

Each learner-profile acknowledgment now stays until the learner activates the
visible **Next** action. Optional audio can finish, fail, be rejected, be
missing, or fail setup without changing the question or route. The newly shown
message receives focus once, so a same-route content replacement no longer
leaves focus on the document body.

This is a retain decision for the bounded implementation. It removes a
deterministic loss of learner agency without changing the message, profile
data, question sequence, audio content, API, persistence, or visual layout.

## Why this branch existed

At the audit base, `beginAcknowledgmentPlayback` assigned navigation to every
media branch:

| Media outcome | Base behavior |
| --- | --- |
| no audio | call `onNext` after exactly 1,800 ms |
| audio decode/setup failure | schedule the same 1,800 ms advance |
| audio `ended` | call `onNext` immediately |
| audio `error` | call `onNext` immediately |
| rejected `play()` | call `onNext` from the rejection handler |

The visible **Next** action therefore was not the real owner of navigation. A
mounted no-audio audit showed the message disappear after a little over two
seconds while focus initially remained on `BODY`. Generated acknowledgments may
contain up to 160 characters, so the fixed interval was unrelated to language
level, message length, or a learner choice.

The [parallel first-use synthesis](./first-use-ux-audit-synthesis.md) selected
this behavior before layout because a media failure could remove content
immediately and because a stable acknowledgment boundary makes the following
viewport tests deterministic. [A11Y-14](./source-register.md) records the W3C
timing and user-controlled-change sources and their limits.

## Implementation

[`LearnerProfileAcknowledgment.tsx`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx)
now separates playback from progression:

- the playback helper has no timer, delay, navigation callback, or advance
  branch;
- audio end, error, rejected playback, setup failure, and unmount converge on
  one idempotent cleanup;
- cleanup removes both media listeners, pauses the audio, and revokes its
  object URL exactly once;
- malformed base64, unavailable object URLs, and audio construction failure
  remain non-blocking because audio is optional feedback;
- only `ActionButton onClick={onNext}` progresses; and
- the acknowledgment `h1` has `tabIndex={-1}` and receives focus on the next
  animation frame for each new `operationId`.

Animation-frame focus follows the existing route-focus pattern. It cancels a
stale frame during cleanup, avoids the first StrictMode effect rehearsal taking
focus twice, and leaves **Next** as the next ordinary tab stop. Profile-edit
acknowledgments already receive a new `operationId` one at a time, so no gate or
editor state change was required.

The audio effect still follows ordinary React effect semantics: StrictMode can
start, immediately clean, and restart the optional audio attempt during its
development-only setup rehearsal. One attempt survives. A same-operation
object-identity change could also replay audio, although the current gate keeps
that object stable. Neither outcome navigates; defer/reuse changes remain
unjustified without a real audio problem.

## Deterministic browser fixture

The previous E2E server could not reach an acknowledgment outside Playwright
route interception. The test-only browser mock now recognizes
`?parrotE2eProfile=acknowledgment` only when `VITE_PARROT_E2E=1`. It intercepts
exact same-origin GET and answer PUT paths, delegates every other request, and
returns one no-audio final acknowledgment.

That opt-in URL supports both automated tests and reproducible in-app Browser
review without putting scenario logic in the production profile API or relying
on a hidden `Referer` contract. It also gives the next viewport-stability branch
a durable form-profile entry point.

## Verification

### Focused contracts

- no timer is scheduled when audio is missing or base64/object-URL/audio setup
  fails;
- end, error, and rejected playback perform cleanup only;
- stale events and repeated cleanup remain inert;
- one explicit **Next** moves to one next acknowledgment;
- same-operation rerenders do not steal focus back from **Next**;
- StrictMode focuses each new message once;
- rapid same-batch activation cannot skip the second saved-profile
  acknowledgment; and
- the no-audio browser state remains after 2,200 ms, preserves its URL and
  focus, and leaves only after **Next**.

### Results

| Check | Result |
| --- | --- |
| Focused component + lifecycle | 92/92 passed |
| Focused Chromium | 2/2 passed |
| Full unit/integration/lifecycle/safety | 679/679 passed |
| Full Chromium | 195/195 passed |
| TypeScript + production build | passed |
| Lint | 0 errors; 2 generated-file warnings |
| Diff and local Markdown links | passed after documentation |

The initial full unit run correctly caught Chinese test-fixture text in runtime
source through the repository's English-only guard. The fixture did not need a
Chinese prompt to test acknowledgment pacing, so it now uses `promptZh: null`.
The clean full run above followed that correction.

## Visual review

The [artifact manifest](../../artifacts/ux-review/profile-acknowledgment-control/manifest.md)
records five genuine in-app Browser JPEGs and exact provenance.

- 280×568, 390×844, and 1440×900 show one complete character, one focused
  message, and one **Next** action with no main overflow.
- The 390×844 message remained at the same URL after more than 2,200 ms; the
  heading, not `BODY`, owned focus.
- Activating **Next** moved to home and focused **Tap a picture.**
- The initial 640×360 frame honestly exposes 260 px of vertical overflow: the
  focused heading starts at y 336 and **Next** starts at y 476. A second frame
  shows both after scrolling.

The short-landscape result is not a pacing failure and should not be “fixed” by
restoring timed navigation. It confirms the already selected next visual branch:
reserve profile art geometry, add compact short/short-wide compositions, and
reset/focus each profile step within a visible origin.

## Retain, revise, or reject

**Retain provisionally.** The implementation meets its behavioral boundary and
removes the deterministic timer/media navigation defect. It should be revised
if target assistive technology announces the focused heading and polite region
confusingly, or if direct observation shows that learners cannot find **Next**.
The first response to a missed action should be a clearer visible affordance,
not forced timing.

Reject any later change that makes audio availability, media duration, a fixed
reading timer, or animation decide when the learner loses the message.

## Limits and next evidence

- No direct child/caregiver comprehension or task-success session was run.
- The exact acknowledgment language and 160-character output ceiling are
  unchanged and remain a separate content-contract study.
- Real browser autoplay, real generated audio duration, physical output, and
  device audio failure were not exercised visually.
- Screen-reader announcement order, switch input, text zoom/spacing, safe-area
  insets, and broader localization need target testing.
- Production answer latency remains unmeasured; no telemetry was added.

The next stacked branch is `codex/profile-fallback-viewport-stability`. Its
acceptance contract is in the [visual audit](./first-use-visual-hierarchy-audit.md)
and [synthesis](./first-use-ux-audit-synthesis.md): reserve image geometry,
keep setup and question actions visible at 280×568, 390×844, 640×360, and
1440×900, reset profile scroll at step boundaries, and keep the current
child-paced behavior intact.

## Hand-off

```text
Branch: codex/profile-acknowledgment-control
Base branch / dependency: codex/first-use-ux-audit ab95c65
Implementation commit: 4dd2ad3
Hypothesis: explicit Next lets each learner process acknowledgment feedback at their own pace without removing optional audio
Changed: removed timer/media navigation; idempotent audio cleanup; one-time per-operation heading focus; opt-in browser fixture; component/lifecycle/responsive browser contracts
Not changed: message copy, generated-output constraints, profile data/API/persistence, audio content/provider, replay UI, visual layout, telemetry, dependencies, or translations
Tests: 92/92 focused component/lifecycle; 2/2 focused Chromium; 679/679 full unit/integration/lifecycle/safety; 195/195 full Chromium; build and TypeScript passed; lint 0 errors with 2 generated warnings
Screenshots: five in-app Browser JPEGs at 280x568, 390x844, 640x360 initial/scrolled, and 1440x900
Measured result: no implicit advance after 2.2s; heading owns focus; explicit Next alone navigates; no main overflow except the documented 260px vertical short-landscape gap
Retain, revise, or reject: retain provisionally; revise only from target AT or direct learner evidence, never restore media-controlled navigation
Next branch: codex/profile-fallback-viewport-stability stacked on this hand-off
```
