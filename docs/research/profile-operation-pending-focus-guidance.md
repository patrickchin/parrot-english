# Profile question operation feedback and focus guidance

Status: implemented and provisionally retained

Branch: `codex/profile-operation-pending-focus`

Stacked base: `codex/profile-answer-separate-labels` documentation hand-off at
`8eb3149`

Implementation: `1625fff`

Outcome evidence:
[`profile-operation-pending-focus-implementation.md`](./profile-operation-pending-focus-implementation.md)

Research date: 2026-08-24

## Question

When a child starts the profile microphone, saves an answer, skips an optional
question, or leaves setup, how should the question card show progress without
discarding focus, moving the task, repeating requests, or letting late work
change a newer screen?

**Selected answer:** give the question screen one synchronous, abortable
operation owner. Keep the button that began the operation mounted, focused, and
inert with `aria-disabled="true"`; native-disable the other controls
individually. Keep one always-mounted polite status beside **Your answer**, in
the existing label-line footprint, and use four truthful short phases:
**Opening mic…**, **Listening…**, **Writing…**, and **Thinking…**. After a voice
transcript arrives, show **Ready.** until the learner edits or starts the next
operation. Keep the initiating action's name unchanged, so saving does not
repeat its pending words in both the status and button.

This is a bounded question-operation repair. It does not change the 4.2-second
recording policy, saved answer model, acknowledgment, questionnaire, routes,
audio assets, AI behavior, analytics, or caregiver profile editor.

## Audience and scope

The primary audience is a five-to-seven-year-old Pre-A1 learner who may not
read English independently, recognize a microphone symbol, understand browser
permission UI, or know that another tap cannot make a request finish sooner.
A nearby adult may help with permission, but the product must give immediate
and stable feedback in the child task.

In scope:

- microphone permission, recording, transcription, answer save, optional
  question skip, and **Skip for now** from the active question;
- pointer, Enter, Space, synthetic same-task activation, mixed-action bursts,
  and native form submission;
- pending ownership, exact request count, focus, failure, retry, route exit,
  unmount, abort, late settlement, and acquired-track cleanup;
- one stable status slot, copy count, layout shift, scroll extent, target size,
  focus paint, reduced motion, and horizontal overflow; and
- 280x568, 320x640, 390x844, 640x360, and 1440x900 local Chromium evidence.

Out of scope:

- changing the separate setup-screen **Skip for now** operation, the caregiver
  profile editor, browser permission chrome, server-side rollback, or physical
  device recording behavior;
- adding a cancel action, timer, countdown, spinner, toast, modal, or predicted
  remaining time;
- changing the 4.2-second automatic recording duration before a separate
  young-learner timing study; and
- claiming exact assistive-technology speech or child comprehension from DOM,
  Chromium, or screenshots.

## Direct product evidence

### Method

Three independent reviewers inspected the stacked base. The current app was
run with the production-copy six-question fixture and an unresolved
`getUserMedia()` promise in genuine in-app Chromium. Measurements covered focus,
accessible state, exact text ownership, request counts, card/control geometry,
main scroll range, and horizontal overflow. Additional mounted-component
probes held transcription and save work, used same-task activation bursts, and
changed the learner route before late settlement.

These are deterministic local product observations. They are not production
telemetry, a real browser permission-dialog study, physical microphone data,
assistive-technology output, or participant research.

### Reproduced baseline

The current view derives one `disabled` flag from `status !== "idle"` and puts
that flag on the whole fieldset. Chromium immediately removes the activated
microphone or submit button from focus and leaves `BODY` active. The next Tab
reaches the fixed Account control instead of continuing from the active task.

The pending paragraph is a new grid row. It changes both the card's intrinsic
height and its centered position:

| Viewport | Idle to held-microphone result                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 280x568  | Card height 510.5 to 562.5 px; main scroll 0 to 23 px; prompt/field move up 14.75 px; actions move down 37.25 px; card bottom clips |
| 320x640  | Card height 724.5 to 784.5 px; scroll 113 to 173 px; Skip and Next begin below the viewport                                         |
| 390x844  | Card height 603 to 663 px; centered content moves 30 px up and actions 30 px down                                                   |
| 640x360  | Card height 345 to 397 px; scroll 13 to 65 px; only the top 9 px of the actions remains in view                                     |
| 1440x900 | Card height 538 to 598 px; centered content moves 30 px up and actions 30 px down                                                   |

Horizontal overflow remained zero, but lack of horizontal overflow does not
make the vertical movement harmless. The blanket fieldset opacity is 0.75;
disabled descendants add 0.6, so important answer controls can appear at about
0.45 of their original opacity while even the pending feedback is faded.

The state names are also inaccurate at a meaningful boundary. The code sets
**Listening…** before awaiting microphone permission, so an unresolved browser
decision can say Listening indefinitely before a recorder exists. The recorder
then owns a fixed 4.2-second timer. In one 20 ms sampled run, **Listening…** was
observed for roughly four seconds and the later transcription state was too
brief to sample before the request failed; this does not prove it never
painted, only that the current boundary is not deterministic.

Saving renders exact **Peppa is thinking…** twice: once in `role=status` and
once as the renamed submit button. A fast mock can replace the screen before a
screenshot observes this state, while any slower request exposes the duplicate
by construction.

### Activation and lifecycle failures

Rendered native disabling normally intervenes between ordinary sequential
clicks, but it is not a synchronous operation lock. Two `.click()` calls in one
browser task produced two microphone requests; the same pattern produced two
answer-save requests and two **Skip for now** requests. Mixed same-task bursts
such as microphone then Replay can increment the shared generation, make the
real operation stale, and leave the card permanently disabled after work
settles.

The generation counter prevents some stale React writes but does not own the
resources. The question handlers do not pass the abort signals already
supported by recording, transcription, answer save, or skip APIs. A delayed
microphone grant resolved after the gate unmounted, still started a recorder,
and still issued transcription. Route exit followed by late settlement could
write a stale transcript or acknowledgment after re-entry because learner
question work has no route ownership boundary.

## Evidence and claim limits

The HTML Standard defines disabled fieldset descendants as disabled form
controls. Native-disabled controls are normally removed from sequential focus
and suppress queued user-interaction clicks. WAI-ARIA can expose an unavailable
action through `aria-disabled`, but authors must suppress every activation and
provide the appearance themselves. APG says focus typically remains on a
button when its action does not dismiss the current context. This supports a
focusable pending owner with both rendered and domain guards; it does not make
focus retention a universal rule or establish a WCAG 2.4.3 failure. See
[A11Y-13 and A11Y-28](./source-register.md).

WAI-ARIA defines `status` as polite, atomic advisory information and says it
should not receive focus when its content changes. WCAG status-message guidance
supports exposing waiting, progress, and result information without moving
focus. This supports one empty, always-mounted status that changes at meaningful
boundaries. It does not predict VoiceOver, TalkBack, NVDA, or JAWS announcement
order, and the current conditionally mounted status is not automatically a
proven WCAG 4.1.3 failure. See
[A11Y-07, A11Y-08, A11Y-10, and A11Y-28](./source-register.md).

W3C cognitive-accessibility guidance favors rapid recognizable feedback,
short one-idea language, and stable control placement. This supports one compact
phase label in reserved space rather than a new full-width row or duplicated
copy. The guidance is supplemental and uses broader cognitive-accessibility
needs; it is not a controlled study of young multilingual learners. See
[A11Y-03, A11Y-11, and A11Y-12](./source-register.md).

GOV.UK documents slow feedback and involuntary activation as reasons people
submit twice and recommends both timely loading feedback and duplicate
suppression. Parrot must additionally protect the server boundary; a client
abort cannot promise that already-received server work is rolled back. See
[UX-03](./source-register.md).

Media Capture permits a microphone permission promise to remain unresolved.
Parrot therefore cannot give a truthful countdown. The recording signal can
stop an acquired stream and fetch signals can cancel client work, but neither
can retract a browser permission decision or guarantee server rollback. See
[VOICE-01](./source-register.md).

The existing local 100 ms control-acknowledgment budget is a product heuristic,
not a WCAG requirement or developmental threshold. It measures state mutation
and the next animation-frame callback, not photons or child perception. See
[PERF-02 and PERF-03](./source-register.md).

## Selected product contract

1. A synchronous ref owns at most one active question operation before any
   React state update or `await`.
2. Ownership records both phase and initiating action: microphone, submit,
   optional question skip, or question-screen **Skip for now**.
3. The initial voice phase is **Opening mic…**. The recorder reports its actual
   start and changes the phase to **Listening…**. Recorder completion changes
   it to **Writing…** until transcription settles. Saves and skips use
   **Thinking…**.
4. One `role=status` node is mounted beside **Your answer** before any update.
   It remains empty while idle, shows one short phase, and shows **Ready.** after
   a transcript succeeds. It never receives focus.
5. The label/status line keeps the same block height in idle, pending, and
   ready states. No phase inserts another grid row. The exact compact words are
   hypotheses; direct learner and target-AT research can revise them without
   changing ownership.
6. The initiating native button stays the same node, keeps its exact accessible
   name, and uses `aria-disabled=true` without native `disabled`. If it owned
   focus, it retains focus. Its UI handler is inert, and the domain guard
   separately refuses duplicate pointer, Enter, Space, programmatic click, and
   form-submit activation.
7. Every other question control is native-disabled individually while work is
   pending. The fieldset itself is not disabled or faded. This does not trap
   focus: the learner may deliberately move to Account, and settlement must not
   restore or steal focus.
8. Replay and every competing handler consult the same synchronous owner.
   Cross-action bursts cannot invalidate the owner or strand its UI.
9. Voice failure clears pending status, exposes one existing alert, re-enables
   the microphone, and leaves current focus alone. Voice success fills the
   textarea, exposes **Ready.**, unlocks controls, and likewise leaves focus
   alone.
10. Save failure re-enables the same submit action, leaves its focus alone, and
    exposes one alert. Save and skip success let the existing destination own
    focus: acknowledgment heading, next-question heading, or route destination.
11. Recording, transcription, answer save, question skip, and question-screen
    skip receive the owner's AbortSignal. Active-question change, learner-route
    exit, and unmount abort and invalidate ownership. Late work cannot change a
    later question, route, status, value, alert, acknowledgment, or focus; any
    stream acquired after abort is stopped exactly once.
12. Pending feedback is complete by the next measured animation frame and
    within the local 100 ms budget. There is no countdown or artificial delay.
13. Existing exact names, native textarea label, idle DOM/Tab order, 44 px
    targets, focus paint, account clearance, and acknowledgment behavior remain
    unchanged.
14. Card, prompt, textarea, microphone, action, and scroll geometry differ by
    at most one CSS pixel between idle and every pending phase at the five
    target viewports; horizontal overflow remains zero.
15. Start and Replay audio use their own abortable single owner. Replay keeps
    its node and name, exposes full-contrast `aria-disabled` while owned, and
    question work aborts audio before opening the microphone.
16. If an error inserts a row while the initiating form control still owns
    focus, scroll that existing control only to the nearest visible position.
    Do not move focus or scroll for Account/outside focus.

## Options considered

### Keep the disabled fieldset and focus the status

Rejected. WAI-ARIA explicitly treats status as non-focus-taking advisory
information. Moving focus away from the child's action would also require
conditional restoration on success and failure and would preserve the measured
layout jump unless another layout change were made.

### Keep native disabling and restore the initiating control later

Rejected. It accepts lost context during the longest and least predictable
interval, then risks stealing focus back after the learner deliberately moved.

### Put pending text only inside the initiating button

Rejected for this screen. It works well for Lesson Player's wide text action,
but the profile microphone is a narrow icon control. Adding four text labels
would change the answer-row geometry and likely compete with the textarea at
280 px. Renaming only the submit action would also make feedback location vary
by operation.

### Keep the current full-width status row

Rejected. It is clear but measurably adds 52–60 px, clips or pushes actions at
the smallest viewports, and recenters the entire card at larger sizes.

### Use one generic spinner or **Please wait…**

Rejected provisionally. A spinner adds motion without explaining whether the
microphone is opening, recording, or writing. A generic wait hides the current
false **Listening…** boundary rather than correcting it. Short phase words plus
the unchanged action/icon give both state and cause.

### Add Cancel or a countdown

Deferred. Browser permission can remain unresolved and has no product-owned
remaining time. Cancellation policy, whether Skip remains available, and the
4.2-second speaking limit deserve separate child/device research. Account/route
exit remains the bounded escape and must clean up safely.

## Test-first implementation route

1. Extend the deterministic browser fixture with held recorder,
   transcription, answer-save, question-skip, and setup-skip operations plus
   request, abort, settlement, and stopped-track counters.
2. Encode the pending owner, truthful phase, focus, duplicate, cross-action,
   success/failure, route-exit, stale-settlement, timing, reduced-motion, and
   five-viewport geometry contract before changing production.
3. Add a recorder-start callback at the media boundary so **Listening…** begins
   only after `MediaRecorder.start()` succeeds.
4. Implement one question-operation owner in `LearnerProfileGate`, pass its
   signal through every scoped operation, and cancel it at question/route/
   component boundaries.
5. Replace fieldset disabling and conditional full-width statuses with
   individual control states and the stable label-line status.
6. Run focused tests, capture genuine in-app Browser before/after evidence,
   request independent code/accessibility/visual review, then run full
   verification.

## Acceptance and measurement

The branch must establish:

- one request after pointer, Enter, Space, twelve same-task activations,
  `requestSubmit()`, or a mixed action burst;
- no permanently pending state after any owned operation settles;
- **Opening mic…** until permission resolves, **Listening…** only after the
  recorder starts, **Writing…** until held transcription settles,
  **Thinking…** until held save/skip settles, and **Ready.** after transcript
  success;
- one status node and one exact visible occurrence of each current phrase;
- same initiating node and focus through pending and failure, without focus
  restoration after deliberate movement;
- native disabled state on non-owners and `aria-disabled=true` without native
  disabled on the owner;
- abort and no stale UI after active-question change, route exit, and unmount;
- one stop for any late-acquired stream and no post-abort recorder or
  transcription start;
- complete pending DOM feedback and next animation-frame callback in no more
  than 100 ms locally;
- no new animation, and equivalent meaning under reduced motion;
- at most one CSS pixel of card/control/scroll movement across all phases and
  target viewports; and
- unchanged idle semantics, order, target sizes, focus paint, acknowledgment,
  and unrelated routes.

## Limits and follow-up

Automated Chromium can establish request counts, DOM state, focus, timing,
geometry, abort signaling, and mock track cleanup. It cannot establish actual
permission-dialog behavior; microphone hardware; Safari/Firefox differences;
VoiceOver, TalkBack, NVDA, JAWS, Switch Control, or voice-control output;
server rollback; localization, RTL, zoom, or text-spacing behavior; or child
understanding.

The most important direct study should show **Opening mic**, **Listening**,
**Writing**, **Thinking**, and **Ready** one at a time to five-to-seven-year-old
Pre-A1 learners across several home languages and support needs, with a
separate seven-to-ten beginner group. Ask children to point or demonstrate what
is happening and what they should do; do not turn the session into a reading
test. Observe premature speech, repeated taps, waiting, adult-help requests,
and recognition of the browser permission prompt separately.

The 4.2-second automatic recording stop is the next timing question exposed by
this work. Do not call it a WCAG failure without assessing the typed
alternative and timing exceptions, but test whether slow young L2 speakers can
finish naturally and whether an explicit stop action is calmer than a fixed
cutoff.

## 2026-08-24 implementation revision

The selected contract was implemented at `1625fff` and independently reviewed.
The implementation added an explicit Start/Replay playback boundary after code
review found prompt audio could otherwise overlap recording. Accessibility
review then changed two details: focused pending owners remain full opacity,
and an inserted error scrolls only the still-focused in-form retry into nearest
view. Red-then-green Chromium evidence covers the latter at 280x568, 320x640,
and 640x360. See the [implementation memo](./profile-operation-pending-focus-implementation.md)
and [visual manifest](../../artifacts/ux-review/profile-operation-pending-focus/manifest.md).
