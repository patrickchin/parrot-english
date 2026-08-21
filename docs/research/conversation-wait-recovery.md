# Conversation Wait and Terminal Recovery

Last reviewed: 2026-08-21

Branch: `codex/talk-wait-recovery-message`

Base: `f11bde7` (`codex/first-audible-feedback` documentation hand-off)

Implementation commit: `5366776`
Status: implemented and validated by the local automated suite; real-service,
assistive-technology, representative-device, and direct child validation pending

## Question

After a learner stops talking, how should Parrot show that an AI reply is still
pending, then make a finite response failure recoverable for a young learner
who may not read English independently?

## Implemented decision

Keep ordinary waiting calm and stable. When the bounded response wait ends,
replace the old learner transcript with the actual result, stop presenting the
interface as busy, and put one literal restart action in the same control slot:

| Element | Terminal presentation |
| --- | --- |
| Status | **Chat paused** |
| Caption | **Peppa did not answer.** |
| Primary action | **Try chat again** |
| Busy motion | None |
| Supporting visual | Static retry icon and sad Peppa pose |
| Exit | Persistent header **Back** |

This exact wording is a Parrot design hypothesis, not a finding from the cited
sources. It is the smallest truthful adjustment to the current restart
behavior and still needs task-based testing with children and caregivers.

## Repository finding and implementation

The timed feedback helper already returned a finite recovery state. For a
thinking turn, it eventually returned **Chat paused**, the explanation **Peppa
did not answer**, and a retry action. Two baseline presentation rules hid or
contradicted that result:

1. Baseline [`selectCaption`](../../src/conversation/ConversationSurface.tsx)
   chose `liveTranscript` before the timed feedback text while the top-level
   status remained `thinking`. A learner who had a transcript therefore
   continued to see **You said** and their old words after the response wait
   had failed.
2. [`ConversationStatus`](../../src/conversation/ConversationSurface.tsx)
   treated every `thinking` state as busy, even after the timed helper had
   replaced active waiting with a retry action. The spinner then said “still
   working” while the button said “work stopped; restart it.”

The recovery button calls the existing conversation `start()` operation. That
operation ends the previous conversation, clears turns and transcript, and
starts a new chat. **Try chat again** is therefore more accurate than the
shorter **Try again** unless a future change retries only the unanswered turn.

The implementation keeps the existing state machine and makes the timed result
authoritative at the presentation boundary:

- `showLearnerAnswer` preserves **You said** only during the first 1.8 seconds
  of an ordinary thinking wait. The caption then advances to **Wait for
  Peppa.**, **Still waiting for Peppa.**, and finally the result-only **Peppa
  did not answer.**
- `waitCycle` increments whenever a new timed operation starts. The timer hook
  keys its state and cleanup to both status and cycle, so retrying a connection
  while it is still named `connecting` begins at zero instead of inheriting the
  previous timeout.
- A feedback action ends the visual busy presentation. The status replaces the
  spinner with a static retry or Back icon and includes both the terminal result
  and exact action once as screen-reader-only text inside the existing polite
  atomic status. The live region deliberately has no `aria-busy` attribute, so
  assistive technology need not defer its intermediate text updates.
- A recovery action selects the existing error/sad Peppa image as a supplemental
  visual cue, hides the contextual Finish action, and gives **Try chat again**
  the full control row. The route header's **Back** action remains available.
- Before replacement Start, the hook finishes a known prior conversation and
  waits for that retirement to complete. A lifecycle coordinator spans hook
  remounts: it records only the newest claimable Start per owner, defers stale
  cleanup while that response is unknown, preserves a backend-reused current
  ID, and finishes only a distinct orphan with `superseded_start`. A detached
  request may still reconcile if it returns, but it cannot make later retries
  wait forever.

## What the sources support

The evidence supports design directions, not the exact Peppa sentence or timer.

| Evidence | Supported direction | Limit |
| --- | --- | --- |
| [A11Y-01, A11Y-11](./source-register.md) | Use common words, simple sentence structure, one idea per sentence, and a stable layout | W3C COGA is supplemental cognitive-accessibility guidance, not a child-language comprehension trial |
| [A11Y-02, A11Y-06](./source-register.md) | Keep a visible action label and pair it with one familiar visual cue; do not rely on icon, color, or motion alone | No cited source establishes that Parrot's retry icon or character pose is understood by this audience |
| [A11Y-03](./source-register.md) | Give rapid feedback for the child's action and recognizable success or failure at each meaningful process step | It does not prescribe Parrot's phase names or response timeout |
| [A11Y-07, A11Y-08, A11Y-10](./source-register.md) | Expose waiting and its terminal result through a persistent programmatic status without moving focus; avoid repeated live-region chatter | Screen-reader and browser combinations still require direct testing |
| [A11Y-09](./source-register.md) | Remove or replace nonessential motion for reduced-motion users; persistent movement can distract | WCAG does not say that every loader is prohibited, and it does not choose a Peppa animation |
| [LANG-09](./source-register.md) | Give a Pre-A1 learner one short action and support it with visuals, repetition, or reformulation | The CEFR descriptor does not cover Parrot's exact copy, five-year-olds specifically, or interface failure recovery |
| [UX-01, UX-02](./source-register.md) | Say that a service failed in concise non-technical language, preserve relevant state, and give a useful next step without invented availability claims | GOV.UK guidance is for public services and mostly adults, not a child voice-learning product |
| [DEV-02](./source-register.md) | Treat development, language, culture, experience, and individual access needs together | It does not define a universal “five-year-old” reading or interaction level |

## Implemented state contract

### 1. The learner ends their turn

- Paint **Thinking** immediately so the stop action is visibly acknowledged.
- Keep **Wait for Peppa** in the reserved control slot while work is active.
- Keep the final learner transcript visible as short-term confirmation for the
  first 1.8 seconds. It does not override a later wait or recovery message.
- Do not claim **Peppa heard you** or that sound will definitely arrive. The
  client only knows that the turn was committed and no assistant signal has
  arrived yet.

### 2. The wait is longer than expected

- Keep the live-region status name **Thinking** while the visible caption
  advances to **Wait for Peppa.** and then **Still waiting for Peppa.** The
  latter is shorter than the baseline **This is taking longer than usual.** and
  avoids the comparative word “usual.” The staged copy remains unvalidated
  with children.
- Do not show a percentage, countdown, or promised return time unless the
  system can support it. The current client cannot know when or whether an
  assistant response will arrive.

The existing 1.8-second, adaptive usual-reply, and 15–23-second milestones are
product heuristics. None of the sources above validates those exact thresholds
for young children. Keep a finite terminal boundary, but tune it from
representative-device latency and child observation rather than presenting it
as a developmental standard.

### 3. The bounded response wait ends

- Replace **You said** and the old transcript in the primary caption with
  **Peppa did not answer.** The transcript is context for a pending turn, not
  the result of a failed one.
- Change the status once to **Chat paused**.
- Replace the disabled waiting control with the active **Try chat again**
  button in the same reserved slot.
- Remove the spinner and pulsing dot. Motion is truthful while work is active;
  after the product has chosen a terminal action, ongoing motion contradicts
  that state. Do not put `aria-busy` on the live status at either stage: it
  describes an incomplete DOM update and may defer the very announcements this
  design needs.
- Keep the route header's **Back** action as the escape. Hide the contextual
  Finish action so **Try chat again** occupies the full control row and remains
  the only dominant action.

### 4. The learner chooses retry

- Acknowledge the tap immediately with the existing **Getting ready** state.
- Disable or coalesce the action only while that one restart request is active.
- Reset the timed feedback cycle even when the technical status remains
  `connecting`.
- If the restart also reaches its finite failure boundary, restore a usable
  action. Do not leave an endless disabled spinner.
- After repeated failure, a future design should offer grown-up help or a
  non-voice practice path. This branch should not invent that path or claim the
  network is at fault.

## Copy decision

| Candidate | Decision | Reason |
| --- | --- | --- |
| **Peppa did not answer.** | Prefer | Short subject–verb–object result; states only what the client observed |
| **Tap “Try chat again” below.** | Remove from the caption | Repeats the visible button, adds reading, and depends on screen position |
| **Try chat again** | Retain for the current action | The implementation restarts the whole chat; the label names that scope |
| **Try again** | Use only if retry semantics become local and unambiguous | Shorter, but currently hides that the conversation restarts |
| **This is taking longer than usual.** | Avoid in the child path | Longer, comparative, and not actionable |
| **Peppa is still thinking.** | Do not prefer | Simple, but anthropomorphizes an unknown pipeline state |
| **Something went wrong.** | Avoid | Does not identify the failed result |
| **The server timed out.** | Reject | Technical, causally over-specific, and not useful to the child |
| **Peppa cannot talk now.** | Reserve for start/connection failures | A missing response does not prove that speech is generally unavailable |

The implementation uses the same visible and accessible button name. Its
retry-arrow icon supports the label but remains supplemental.

## Motion, layout, and color

- The implementation keeps the caption, status, and control regions in place
  when the wait becomes terminal. It replaces content inside those slots rather
  than adding a modal, toast, or row.
- A spinner appears only while the timed operation is pending. A static retry
  symbol and active full-width button are the terminal cues.
- With `prefers-reduced-motion: reduce`, the words and control state must still
  communicate waiting and recovery when spin, pulse, or character float is
  removed.
- Do not encode terminal failure only through red, a sad character, or a
  stopped animation. The visible result and action must remain present.
- One dominant recovery action remains in the control row. The header Back
  control supplies the secondary exit without competing beside it.

## Programmatic feedback

- The implementation keeps one pre-existing, atomic, polite `role="status"`
  for the meaningful transition from **Thinking** to **Chat paused**.
- The same status includes the terminal explanation as screen-reader-only text
  followed by the exact action, **Try chat again** or **Back**. It does not
  create a competing `alert` for the timeout.
- The status never receives `aria-busy`. WAI-ARIA defines that state for an
  element whose DOM update is incomplete, and assistive technology may wait for
  it to become false before exposing changes. A seconds-long AI or network wait
  is not the live region's own incomplete update.
- The timer does not move focus. DOM order and the stable control slot remain
  so keyboard and switch users can reach the new action predictably.
- Test actual announcement order. Markup inspection alone cannot establish how
  VoiceOver, TalkBack, or another assistive technology will speak an update.

## Non-reading and multilingual boundary

Shorter English reduces one barrier; it does not make the screen non-reading.
The implemented state still depends on a combination of position, Peppa's pose,
a familiar retry symbol, and the visible label. None is proven to communicate
“the reply failed; restart the chat” to a five-year-old beginner.

Do not add automatic spoken failure audio without a separate design and audio
reliability review. The conversation audio path may be the failed modality,
surprise audio conflicts with user control, and a new recording introduces its
own loading and localization states. First test whether the stable visual
action works; if it does not, evaluate a user-triggered, locally available
multimodal cue.

## Implemented validation

### Automated behavior

The new Chromium contract covers four response-recovery viewports: 280×568,
390×844, 640×360, and 1440×900. It verifies:

- brief learner-answer confirmation, followed by **Wait for Peppa.** and
  **Still waiting for Peppa.**;
- the terminal result replacing the transcript and excluding the old
  position-relative instruction;
- one full-width, enabled **Try chat again** action, no contextual Finish
  action, no alert, and the persistent route-header Back action;
- no `aria-busy` on the live region, an active spinner while work is pending,
  and zero status animations with a static retry cue at the terminal boundary;
- the sad Peppa asset as a supplemental terminal cue;
- stable control-row and control-group geometry, a recovery target at least
  44 CSS pixels high, viewport containment, and no outer page scroll;
- retry reaching a new learner turn, then a new response wait without the old
  terminal timer or transcript;
- a same-status connection retry restarting its clock at zero; and
- zero running status, Peppa, or retry animations in the tested reduced-motion
  terminal state.

Mounted lifecycle contracts separately verify that a distinct late Start is
finished with `superseded_start`; a backend-reused current ID is preserved with
either response order in one hook and across a real unmount/remount; distinct
remounted responses clean up only after the new Start settles; known prior,
Back, and unmounted sessions retire before replacement; retirement failure can
be retried; a never-settling superseded request cannot block a third Start; and
Back flushes a held distinct stale ID without waiting for a newer hung request
to return. The fixed-feedback unit contract covers exact stage text and
boundaries.

Final local verification:

| Check | Result |
| --- | --- |
| Full unit, integration, lifecycle, and safety suite | 665/665 passed in 90 suites; 3.3 s |
| Full Chromium suite | 178/178 passed; 40.0 s |
| Focused wait-recovery Chromium file | 6/6 passed; about 3.0 s |
| Production build / TypeScript | Passed; CSS 82.75 kB raw / 14.55 kB gzip; ConversationSurface 16.10 / 5.33; core index 493.16 / 149.08; LiveKit 468.82 / 121.41 |
| Lint | 0 errors; the same 2 existing unused-disable warnings in generated `worker-configuration.d.ts` |
| Diff and asset checks | `git diff --check`, 190/190 local links across 28 research Markdown files, TypeScript, and JPEG type/dimension checks passed |
| Independent lifecycle/accessibility audit | No merge blockers; focused unit/lifecycle 79/79 and wait-recovery Chromium 6/6 passed |

### Visual evidence

Seven local Chromium JPEGs record the implemented state sequence. Six are
280×568 and the short-landscape terminal view is 640×360:

- [Learner answer confirmed](../../artifacts/ux-review/conversation-wait-recovery/answer-confirmed-280x568.jpg)
- [Wait for Peppa](../../artifacts/ux-review/conversation-wait-recovery/waiting-280x568.jpg)
- [Still waiting](../../artifacts/ux-review/conversation-wait-recovery/still-waiting-280x568.jpg)
- [Chat paused, 280×568](../../artifacts/ux-review/conversation-wait-recovery/chat-paused-280x568.jpg)
- [Chat paused, 640×360](../../artifacts/ux-review/conversation-wait-recovery/chat-paused-640x360.jpg)
- [Getting ready after retry](../../artifacts/ux-review/conversation-wait-recovery/getting-ready-after-retry-280x568.jpg)
- [Recovered learner turn](../../artifacts/ux-review/conversation-wait-recovery/recovered-280x568.jpg)

The screenshots and browser checks use deterministic local fixtures and a fake
clock. They prove the rendered state sequence, copy, geometry, and synthetic
recovery behavior; they do not prove real AI latency or service recovery.

### Child and caregiver check still required

Run a short, moderated failure-recovery task with approximately 4–6 and 7–10
year-old beginners across varied home languages and access needs:

1. Let the child complete one spoken turn.
2. Trigger a delayed response, then the terminal state, without explaining it.
3. Ask what they think happened and what they would do next.
4. Record whether they identify and activate the intended action, whether an
   adult translates, and which cue they used.
5. Compare **Try chat again** with a future semantics-matched **Try again** only
   if both buttons perform the action their labels imply.

Do not retain child audio or transcripts for this UI study by default. Record
task outcome and de-identified misunderstanding categories under an approved
research protocol.

## Evidence boundary and open questions

- No cited study tests this exact failure state with Parrot's target audience.
- The exact response timeout is not child-validated.
- Browser validation uses a deterministic mock transport and fake clock, not a
  real agent, LiveKit room, slow network, provider failure, or late audio race.
- The suite is Chromium-only. VoiceOver/Safari, TalkBack/Chrome, switch access,
  terminal keyboard traversal, 200% zoom, and increased text spacing remain
  untested.
- The polite atomic status, screen-reader-only result, and exact recovery action
  are programmatically present without `aria-busy`, but actual announcement
  order and interruption behavior are not established without target assistive
  technology.
- **Chat paused** may imply resumable state even though the current action
  restarts the conversation; compare it with **Chat stopped** in child testing.
- A stopped spinner and sad Peppa pose are truthful supplemental distinctions,
  not proof that the learner understands the retry icon or emotion.
- It is unknown whether showing the final transcript for 1.8 seconds reassures
  a learner or makes its timed replacement feel like lost content.
- Serialized retirement and same-ID-safe superseded-Start reconciliation across
  mounted, unmounted, failed, and never-settling mock lifecycles are covered,
  but deployed service observability is not.
- It is unknown when repeated failure should switch from retry to grown-up help
  or non-voice practice.

Retain the change if terminal failure is always visible, static, and actionable
without exposing technical language. Revise the copy or multimodal cue if
children cannot identify the next action without adult translation.

## Implementation hand-off

```text
Branch: codex/talk-wait-recovery-message
Base branch / dependency: codex/first-audible-feedback documentation hand-off f11bde7
Implementation commit: 5366776
Hypothesis: staged plain-language waiting followed by one static, result-first restart state helps a young beginner distinguish a slow reply from a failed one
Changed: brief transcript confirmation; staged Wait for Peppa / Still waiting copy; result-only terminal caption; announceable live status with a static terminal cue and exact action; full-width restart with persistent header Back; sad Peppa cue; per-operation waitCycle reset; serialized prior-session retirement; same-ID-safe and remount-safe superseded Start reconciliation without hung-request deadlock; responsive/reduced-motion browser contracts; seven screenshots; research record
Not changed: response timer thresholds; AI/LiveKit provider behavior; production telemetry or retention; conversation persistence contract; non-voice fallback; localization; saved lesson or profile data
Tests: full unit/integration/lifecycle/safety suite 665/665; full Chromium suite 178/178; independent focused unit/lifecycle audit 79/79; focused wait-recovery Chromium 6/6
Build: TypeScript passed; CSS 82.75 kB raw / 14.55 kB gzip; ConversationSurface 16.10 / 5.33; core index 493.16 / 149.08; LiveKit 468.82 / 121.41
Screenshots: seven JPEGs in artifacts/ux-review/conversation-wait-recovery, six at 280x568 and one terminal state at 640x360
Measured result: deterministic tests show the transcript for the initial acknowledgement, expose two calm wait stages, replace it at the finite boundary, stop busy motion, preserve layout and Back, restart the timer on retry, serialize known prior-session retirement across remounts, preserve a reused current ID in either response order, close only a distinct superseded Start, keep later retries live when an older request never settles, and flush a held stale ID when Back detaches a newer hung request
Risks / limitations: mock transport and fake time only; Chromium only; no real service, target assistive technology, representative device/network, localization, or child/caregiver comprehension evidence
Retain, revise, or reject: retain provisionally; revise words, timing, or multimodal cue after representative child and accessibility testing
Next question: Can a young multilingual non-reader identify that Peppa did not answer and use Try chat again without adult translation, and when should repeated failure switch to grown-up help or non-voice practice?
```
