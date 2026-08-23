# Lesson microphone direct-action feedback guidance

Status: selected for implementation

Branch: `codex/lesson-microphone-direct-action-feedback`

Base: `codex/story-reader-child-first-tab-order` documentation hand-off at
`1957e6d`

Research date: 2026-08-24

## Question

When a child taps **Tap to talk** and the browser is still opening the
microphone, which part of Lesson Player should explain the wait, and how should
the action behave until permission succeeds or fails?

**Selected answer:** keep the lesson prompt stable as **Your turn** and let the
same microphone button own the one visible pending signal: **Opening mic…**
with one spinner. Keep that exact button focused and in place with
`aria-disabled="true"`, suppress every later activation in both the rendered
control and the recording domain, and reactivate the same node as **Tap when
done** or **Try mic** when the request settles.

This is a bounded feedback and interaction repair. It does not change when
Parrot requests permission, what is recorded, how speech is evaluated, the
browser's permission prompt, lesson progression, or the visible pending words.
The words remain an explicit research question for children who know little
English.

## Audience and scope

The primary audience is a five-to-seven-year-old beginning English learner.
Some learners may not read the label independently, recognize a microphone
icon, understand browser permission UI, or know that another tap cannot make a
hardware request complete faster. A nearby adult may help with device
permission, but the product feedback must remain useful without technical
English.

In scope:

- the ready-made boxed and generated layered Lesson Player;
- pointer, Enter, Space, synthetic activation, and immediate repeated
  activation;
- pending, success, denial, unsupported, route exit, and Skip races;
- focus ownership, accessible name/state, visible copy, spinner count, reduced
  motion, geometry, overflow, and acknowledgement time;
- 280x568, 390x844, 640x360, and 1440x900; and
- a deterministic E2E-owned unresolved microphone request.

Out of scope:

- changing permission policy, recording duration, speech checks, lesson words,
  routes, audio, art, analytics payloads, dependencies, or browser chrome;
- inventing a countdown or predicted permission duration;
- replacing **Opening mic…** before direct learner research;
- claiming screen-reader announcement order from DOM inspection; and
- claiming that a rendered action or icon is understood by a child.

## Direct product evidence

### Method

The stacked base at `1957e6d` was exercised with a held `getUserMedia()` promise
and the repository's deterministic lesson/session fixtures. An independent
Playwright reproduction covered both boxed and layered lessons at all four
target viewports. It measured the active element, node identity, labels,
spinners, animations, geometry, scroll, overflow, request count, and the time
from activation to the pending DOM mutation and next animation frame.

These are local Chromium observations. They are not production telemetry,
assistive-technology results, permission-dialog measurements, or participant
research.

### Baseline result

All eight lesson/presentation/viewport combinations reproduced the same
contract:

| Observation | Base result |
| --- | --- |
| Focus after activation | Native-disabled microphone loses focus to `BODY` |
| Visible pending owners | Prompt and button both say **Opening mic** |
| Running motion | Two spinners; zero animations with reduced motion |
| Button semantics | Fixed accessible name **Microphone**, `aria-busy=true`, `aria-pressed=false`, native `disabled` |
| Node identity | The same button DOM node survives pending and settlement |
| Success | Focus remains on `BODY`; button becomes **Tap when done** visually |
| Failure | Focus remains on `BODY`; same node becomes **Try mic** |
| Layout | No horizontal overflow, control overlap, or product-owned scroll |
| Pending DOM mutation | 2.0–3.2 ms after activation |
| Next animation frame | 4.3–8.7 ms after activation |
| Pointer / Enter / Space | One permission request for each single activation |

The timing result says the current React acknowledgement is fast on this local
machine. It does not make the feedback clear: the action loses focus and two
parts of the screen compete to explain the same wait.

With a held request, two synchronous programmatic clicks create one permission
request and then immediately remove the authored pending state. The UI returns
to **Tap to talk** while that browser request remains unresolved. In a 12-click
burst, the current alternating start/finish behavior issued six unresolved
requests. A same-task microphone activation followed by Skip can also advance
to the next scene even though the rendered Skip button is intended to be
disabled during setup.

### Root cause

`LessonUserPrompt` treats `opening` as its own visual phase, so it duplicates
the button's label and spinner. `LessonSpeakingControls` gives the action native
`disabled`, which prevents normal activation but removes the currently focused
control from sequential focus. The fixed `aria-label="Microphone"` also hides
all three visible action labels from the accessible name.

At the domain boundary, `recordingActiveRef` means both “a request is opening”
and “a recording session exists.” `handleToggleRecording` treats either state
as a stop. During setup, `finishRecording()` finds no session, aborts local
ownership, and hides the pending presentation even though the underlying
browser permission promise may not settle. The rendered disabled Skip state has
no equivalent synchronous handler guard before React commits.

The existing browser test has a separate fixture race. Application bootstrap
awaits a dynamic import of the E2E mocks after navigation has completed. A test
that immediately replaces `navigator.mediaDevices`, before waiting for rendered
Lesson Player, can be overwritten later by the imported instant-success mock.
That makes the intended intermediate state scheduling-dependent. A held query
scenario owned by the E2E bootstrap is the deterministic boundary; a longer
timeout or retry would only disguise the race.

## Evidence and limits

WAI-ARIA defines `aria-disabled` as a perceivable unavailable state but leaves
activation suppression and visual treatment to the author. The WAI-ARIA Authoring
Practices explain that native disabled form controls leave the Tab sequence,
while an `aria-disabled` control can remain discoverable and focused. The
button pattern assigns Enter and Space activation and recommends keeping focus
on a button when the surrounding context remains. This supports a focusable
pending action with explicit guards; it does not guarantee actual announcement
behavior or prescribe child-facing words. See
[A11Y-13](./source-register.md).

WCAG 2.2 Success Criterion 2.5.3 requires the accessible name of a control to
contain its visible text label. Its Understanding guidance connects this match
to speech input, text-to-speech output, and reduced cognitive load. Removing the
fixed **Microphone** label lets **Tap to talk**, **Opening mic…**, **Tap when
done**, and **Try mic** each be both the visible and accessible action. This is
a standards conformance correction, not evidence that young learners understand
the words. See [A11Y-24](./source-register.md).

ARIA permits assistive technologies to delay exposing changes within an
`aria-busy=true` region. Status-message guidance supports exposing meaningful
waiting or result boundaries without moving focus. The button's complete
pending label appears in one render, so this branch does not mark it busy and
does not add a second visible or live pending owner. Whether its focused-name
change is announced well enough still requires VoiceOver, TalkBack, and NVDA
testing. See [A11Y-08 and A11Y-10](./source-register.md).

The HTML Living Standard says native-disabled controls prevent queued
user-interaction click events. Once native `disabled` is removed, styling and
`pointer-events` alone cannot own correctness; a direct event guard and a
synchronous domain guard are both required. See
[A11Y-13](./source-register.md).

Media Capture and Streams permits permission to grant, deny, fail, or remain
unresolved and does not constrain completion order across multiple
`getUserMedia()` requests. This supports one outstanding request, a real route
escape, and no countdown. It does not prescribe Parrot's feedback design or
browser prompt. See [VOICE-01](./source-register.md).

Google's RAIL model treats roughly 100 ms as a general immediate-response
budget. Parrot reuses p95 <=100 ms from activation to pending paint as a product
heuristic only. Human permission time is explicitly excluded. This is neither
a developmental threshold nor a production SLO. See
[PERF-02](./source-register.md).

W3C supplemental cognitive-accessibility guidance favors clear visible labels,
short text, consistent placement, and rapid recognizable feedback. This
supports one stable action rather than two competing pending labels, but the
guidance primarily concerns cognitive accessibility and is not a controlled
young-learner interface study. See
[A11Y-01, A11Y-02, A11Y-03, A11Y-11, and A11Y-12](./source-register.md).

One 2024 usability study of a serious speech game observed ten Farsi-speaking
children with speech sound disorders, mean age 4.6. The children did not infer
that they should click the microphone and needed spoken instruction. This is
narrow evidence for retaining a visible action cue beside the icon—not for
Parrot's words, pending behavior, English learners, or accessibility. The
sample was small, convenience recruited, and clinically specific. See
[DEV-04](./source-register.md).

## Selected product contract

1. The prompt remains **Your turn**, with its microphone icon and practice
   sentence, throughout microphone setup.
2. The existing microphone button owns the only visible **Opening mic…** label
   and spinner.
3. The same button node, rectangle, and focus remain stable while the request
   is pending.
4. Pending uses `aria-disabled="true"`, no native `disabled`, no `aria-busy`,
   and no `aria-pressed`.
5. The button's visible text supplies its accessible name. No fixed ARIA label
   overrides **Tap to talk**, **Opening mic…**, **Tap when done**, or **Try mic**.
6. The rendered handler performs no operation while pending. The recording
   domain separately returns while a start is owned and stops only when an
   actual recording session exists.
7. Skip remains visibly/native disabled during setup, and its domain handler
   independently refuses a same-task stale activation. Back remains available
   as the real escape route.
8. A stale resolved or rejected permission request cannot alter a newer
   request, route, scene, or feedback state.
9. Success reactivates the same focused button as **Tap when done**. Failure
   reactivates it as **Try mic** without moving focus back if the learner has
   deliberately focused something else.
10. Pending paints on the first render after activation; no fake remaining
    time is shown.
11. Reduced motion retains the icon, text, state, and layout but removes spinner
    animation.
12. The prompt, controls, artwork, and viewport remain free of new shift,
    overlap, clipping, and horizontal overflow at every target size.

## Options considered

### Keep native disabled and restore focus after settlement

Rejected. It accepts an avoidable loss of interaction context during the most
uncertain interval and requires focus movement later. It can also steal focus
back after a learner intentionally moves elsewhere.

### Put pending feedback only in the prompt

Rejected. The prompt describes whose turn and which phrase to practise; the
button is the direct action that owns hardware setup. Moving the action state
away from the activated control weakens the visible cause-and-effect link.

### Keep both pending signals for emphasis

Rejected provisionally. Two identical labels and two spinners add detail
without adding a distinct decision, and they divide attention between the
practice target and the action.

### Add an elapsed timer, cancel button, or automatic timeout

Rejected for this branch. The browser permission request can remain open
indefinitely and Parrot does not own its decision interval. Back already offers
route escape. A new time policy would require separate product, platform, and
cleanup research.

### Announce a second live-region sentence

Deferred pending target assistive-technology testing. The changing focused
button name may be sufficient; a simultaneous status may echo it. The existing
Lesson updates region includes full scene context and should not atomically
reannounce that content for this short boundary.

### Change **Opening mic…** now

Deferred. **Mic** is an abbreviation and **opening** may be unfamiliar or
nonliteral to a beginning learner. **Turning mic on** is more literal but longer;
**Getting ready** is simpler but may prompt speech before capture is ready.
Changing words alongside interaction ownership would make the branch harder to
evaluate.

## Implementation plan

1. Extend `src/testing/e2e-browser-mocks.ts` with a query-selected, externally
   controllable held microphone promise and exact request count.
2. In `tests/e2e/lesson-player.spec.ts`, first encode pending ownership,
   accessible names/states, same-node focus, repeated-activation guards,
   success/failure settlement, first-paint timing, reduced motion, and
   responsive geometry. Confirm the product assertions fail on this base.
3. In `src/lessons/LessonPlayerUi.tsx`, remove the prompt's opening phase and
   duplicate spinner, then replace native microphone disabling and fixed ARIA
   semantics with the selected direct-action contract.
4. In `src/app/App.tsx`, distinguish a pending request from an actual recording
   session in toggle and Skip handlers, and prevent stale settlement from
   mutating current ownership.
5. Run focused behavior tests, then the relevant unit/lifecycle checks and full
   Chromium suite.
6. Capture genuine in-app Browser before/after screenshots at all four target
   viewports and inspect pixels, focus, geometry, overflow, and motion.
7. Obtain independent code, behavior, and visual review; record corrections,
   verification commands, hashes, limitations, and the next backlog choice in
   a separate implementation memo.

## Acceptance and measurement

Rendered behavior must establish:

- exactly one visible **Opening mic…** owner and one running spinner;
- unchanged **Your turn** prompt and practice sentence;
- pending feedback on the next frame and in under 100 ms locally;
- no running spinner animation with reduced motion;
- one `getUserMedia()` request after pointer, Enter, Space, repeated synthetic
  activation, or a mixed same-task activation burst;
- pending remains pending until that one request resolves, rejects, or the
  route exits;
- the microphone is the same focused DOM node through pending and settlement;
- the pending accessible name contains its visible label and exposes
  `aria-disabled=true`, without native disabled, busy, or pressed semantics;
- success exposes **Tap when done** and failure exposes **Try mic** on that node;
- Skip cannot advance during the render gap or pending state, while Back still
  exits safely;
- no stale request changes a later scene or newer request;
- no layout shift, overlap, obscured control, product-owned scroll, or
  horizontal overflow at the four viewports in boxed and layered lessons; and
- unrelated lesson audio, evaluation, fallback, route, and analytics behavior
  remains unchanged.

The local 100 ms measurement excludes CI scheduling and the browser's human
permission interval. Final evidence must report actual samples and failures,
not only the threshold.

## Child-language follow-up

The next direct study should compare **Opening mic**, **Turning mic on**, and
**Getting ready** with five-to-seven-year-old beginner learners across several
home languages and support needs, plus a separate seven-to-ten comparison
group. Do not ask children to read the options aloud. Show one state at a time,
ask them to point or demonstrate what is happening and what they should do,
and observe premature speech, repeated taps, waiting, and requests for adult
help. Test the browser permission prompt separately because its wording,
locale, and placement are outside Parrot.

## Limits and rollback

Automated Chromium can establish state, focus, request count, geometry, and
motion. It cannot establish VoiceOver/Safari, TalkBack/Chrome, NVDA, Switch
Control, voice control, physical-device permission behavior, child
comprehension, or caregiver recovery. Local timing is not field latency.

Revise if target assistive technologies fail to announce the pending or retry
action, if retaining focus traps or confuses a user, if browser/platform
behavior requires a true cancel control, or if child observation shows that the
remaining words or icon do not explain the action. Prefer a short single status
boundary after direct AT evidence over restoring duplicate visible feedback.
