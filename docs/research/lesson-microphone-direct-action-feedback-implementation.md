# Lesson microphone direct-action feedback implementation

Status: implemented and provisionally retained

Branch: `codex/lesson-microphone-direct-action-feedback`

Base: `codex/story-reader-child-first-tab-order` documentation hand-off at
`1957e6d`

Research commit: `1091e89`

Deterministic fixture commit: `04f3c1e`

Implementation commit: `be8692d`

Review hardening: `a541fdf`

Review coverage: `b7a3a48`

Review date: 2026-08-24

## Outcome

Lesson Player now gives microphone setup one clear owner. After **Tap to talk**,
the same button stays in the same place and becomes **Opening mic…** with one
spinner. The practice prompt remains **Your turn** and keeps the sentence in
view. The pending action stays focused and perceivable, but every later pointer,
keyboard, or programmatic activation is ignored until the one permission
request settles.

Success reuses the same node as **Tap when done**. Failure reuses it as **Try
mic** and exposes the short recovery sentence through one always-mounted,
failure-only polite status. If the learner has moved focus to Back, failure does
not take it back. Back remains a real escape route, while Skip cannot exploit
the small interval before React commits its disabled presentation.

This branch does not change when permission is requested, what is captured,
speech scoring, the scene order/progression model outside the corrected pending
Skip race, browser permission chrome, the microphone button's **Opening mic…**
wording, other child content, audio, routes, dependencies, or event payload
shape.

## Reproduced baseline

An independent deterministic reproduction exercised ready-made boxed and
generated layered lessons at 280x568, 390x844, 640x360, and 1440x900. All 32
state/viewport observations agreed:

- native `disabled` moved focus from the activated microphone to `BODY`;
- the prompt and action both displayed **Opening mic**, with two spinners;
- the visible action labels were absent from the button's accessible name,
  which stayed fixed as **Microphone**;
- focus stayed on `BODY` after both success and failure;
- twelve synchronous programmatic activations issued six unresolved permission
  requests and reset the authored pending UI; and
- a same-task microphone/Skip burst could advance despite the visually pending
  control state.

The prior test replaced `navigator.mediaDevices` after navigation while the
application's asynchronous E2E bootstrap could still overwrite it. Its
intermediate assertion passed 50/50 serially but only 47/50 with eight workers.
That was a fixture-ownership race, not evidence that a longer wait was needed.

The complete problem definition, standards mapping, alternatives, child-
language caveats, and acceptance contract are in the
[guidance memo](./lesson-microphone-direct-action-feedback-guidance.md).

## Implemented boundary

The E2E bootstrap owns a query-selected delayed microphone scenario and exposes
only deterministic counters plus explicit resolve/reject controls. Its mock
stream counts stopped tracks, making late success and cleanup observable
without test code racing application bootstrap.

`LessonUserPrompt` no longer has an opening phase. `LessonSpeakingControls`
removes the fixed ARIA label, busy state, pressed state, and native disabled
state from the pending microphone. Its visible label is now its accessible
name. Pending uses `aria-disabled="true"`, retains full opacity, omits its click
handler, and keeps the existing reduced-motion behavior.

The domain boundary independently refuses another start while one request or
session is owned. Toggle stops only an actual recording session. Skip refuses a
same-task activation while setup is owned. Rejection checks route generation
and recording sequence before changing current UI; late success cancels its
new stream if the learner has left. These guards make the React presentation a
description of state rather than the sole correctness boundary.

The visible fallback card is a labeled non-live region. A separate
always-mounted **Speaking updates** status starts empty, receives only the
short fallback sentence, and clears on retry. The ordinary **Lesson updates**
status now uses **Your turn. Say…** for the waiting phase and stays byte-for-byte
unchanged through pending, failure, and retry. That avoids both its former stale
**Tap the microphone** instruction and a long scene-summary reannouncement.

## Test-first and race evidence

The first behavior assertion expected the visible **Tap to talk** label to be
the accessible name; it failed against the fixed **Microphone** label before
the product change. Failure-status tests then failed because the visible panel
was mounted as the only status while the persistent status suppressed the
message. A review-driven second red test showed that reusing the general lesson
status would restore its full scene description on retry. The retained design
uses the dedicated empty-before-failure status described above.

The browser contracts now establish:

- one request after a twelve-click burst plus a same-task Skip activation;
- continued suppression for pointer-equivalent `.click()`, Enter, Space, and
  direct programmatic activation while pending;
- unchanged URL/scene, one pending owner, one spinner, and a disabled Skip;
- same DOM node, focus, and accessible-name/ARIA transition through ready,
  pending, success, and focused failure, with a stable rectangle through ready,
  pending, and recording success;
- no focus steal when failure arrives after focus deliberately moves to Back;
- a functional second request after **Try mic**;
- one stopped media track after ordinary completion and after a late resolution
  following route exit;
- exactly one identifier-free `lesson_microphone/ready` event and one speech-
  check event after the rapid burst;
- no running animation under reduced motion; and
- containment, focus-paint bounds, stable geometry, and zero overflow for both
  lesson presentations at all four target sizes.

The timing probe records the complete pending DOM mutation and the next
`requestAnimationFrame` callback. The callback occurs before paint, so neither
the test nor this memo calls it paint latency.

## Timing and visual evidence

Twenty fresh local Chromium pages—five at each target viewport—measured:

| Boundary | Min | Nearest-rank p50 | Nearest-rank p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Activation to complete pending DOM mutation | 1.6 ms | 3.1 ms | 3.3 ms | 3.3 ms |
| Activation to next animation-frame callback | 4.1 ms | 5.6 ms | 7.8 ms | 8.8 ms |

These measurements exclude the browser's permission interval and are local
diagnostics, not a production SLO, physical paint measurement, or child-
development threshold.

Eight uncropped in-app Browser screenshots compare the baseline and retained
candidate at 280x568, 390x844, 640x360, and 1440x900. Review found the first
candidate inherited an opacity reduction that weakened the pending action;
the retained version stays fully opaque. White against the rendered deep green
is 5.789:1. A second visual review found no image defect and corrected the
manifest's desktop-gap, animation, contrast-estimate, and provenance wording.

The [artifact manifest](../../artifacts/ux-review/lesson-microphone-direct-action-feedback/manifest.md)
contains the eight images, measured DOM values, timing samples, SHA-256 hashes,
capture provenance, and evidence limits.

## Automated evidence

Validation on the implementation and review commits plus the final
documentation worktree:

| Check | Result |
| --- | --- |
| Focused microphone/code-review Chromium contracts | 16/16 passed |
| Initial Enter/Space activation contracts | 2/2 passed |
| Core race contracts, repeated three times serially | 15/15 passed |
| Lesson Player plus experience-event Chromium suite | 75/75 passed |
| Recorder, state, event, and lifecycle review set | 94/94 passed |
| Component, lifecycle, integration, and safety tests | 678/678 passed |
| Full Chromium suite | 275/275 passed |
| TypeScript and production build | Passed |
| Lint | 0 errors; 2 generated-worker warnings |
| Research links | 422 local links across 56 Markdown files; 0 missing |
| Visual artifacts | 8/8 JPEG dimensions and SHA-256 digests independently verified |

## Independent review decision

Three independent reviewers examined code, behavior/accessibility, and rendered
visual evidence.

Code review found no remaining production issue after requiring explicit track
cleanup, functional retry, negative focus, next-frame naming, and exactly-once
telemetry evidence. Its final focused runs passed 16/16, 15/15 repeated race
cases, and 94/94 lower-level contracts. The sequence-only check remains a
defensive symmetry guard rather than an independently reachable state outside
route invalidation.

Accessibility review first rejected a newly inserted populated status, then
rejected reusing the general lesson status because retry would restore and
potentially reannounce the long scene summary. Both findings were accepted.
Final review found no remaining automated-contract defect in the dedicated
always-mounted failure status, invariant lesson status, and no-focus-steal
behavior.

The first full-browser run then exposed the helper-owned stale instruction
**Tap the microphone to start speaking** in the ordinary status during fallback.
The retained **Your turn** value now lives in the sole progress-label helper,
with a direct unit contract, rather than as a call-site override.

Visual review rejected the pending action's inherited 0.6 opacity; the retained
full-opacity control was recaptured at all four sizes. Final review found the
eight current images consistent and required only evidence-wording corrections,
which the manifest incorporates.

Retain provisionally. Revise if target assistive technology does not expose the
state changes usefully, a real permission sheet breaks focus/escape behavior,
or direct observation shows that the remaining label is unclear or prompts
premature speech.

## Limits and next questions

The evidence is deterministic local Chromium in English left-to-right. It does
not establish Safari/Firefox behavior, safe-area insets, zoom/text spacing,
VoiceOver, TalkBack, NVDA, Switch Control, voice control, a physical permission
sheet, actual audio capture, production timing, localization, right-to-left
layout, or child/caregiver comprehension. A mounted live region and DOM change
do not prove a particular screen reader announces it.

The next direct study should compare **Opening mic**, **Turning mic on**, and
**Getting ready** without asking children to read aloud. Observe what five-to-
seven-year-old beginner learners think is happening, whether they wait or speak
too early, and whether they tap repeatedly or seek adult help. Compare a
separate seven-to-ten group and test browser permission chrome independently.

The next stacked engineering branch will advance
`codex/profile-heading-reading-cue` to this documentation hand-off before work,
the strongest remaining visual follow-up. It should test a separated reading-
position marker for programmatically focused profile headings without changing
copy, focus ownership, timing, or geometry. The Story Reader paragraph-semantics
issue and completion replay focus clipping remain separate queued investigations.
