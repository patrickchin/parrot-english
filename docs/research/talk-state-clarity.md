# Talk State Clarity: One Primary Signal at a Time

Last reviewed: 2026-08-21

Branch: `codex/talk-state-clarity`

Base: `b0f6147` (`codex/repeated-talk-recovery` documentation hand-off)

Status: implemented at `17c1711` and validated locally; after-state in-app
screenshots, target assistive-technology checks, and child/caregiver testing
remain open

## Question and scope

Can Talk to Peppa make each turn and wait easier for a young multilingual
learner to read at a glance by showing one primary state signal, while retaining
immediate feedback, finite recovery, stable layout, and accessible status
announcements?

This is a presentation-layer implementation. It does not change conversation
lifecycle states, wait thresholds, retry budgets, LiveKit or AI behavior,
prompts, audio, data retention, or the lesson fallback. The implemented slice
simplifies remote-operation and remote-turn states: `connecting`,
`thinking`, `speaking`, `reconnecting`, and `saving`. Microphone-opening and
autoplay-recovery controls are audited here but deferred because changing their
pending controls can affect focus and gesture-bound media behavior.

Primary audience: roughly five- to seven-year-old English beginners, including
pre-readers and children who use another language at home. A comparative
seven-to-ten group should be included in formative evaluation. Age is not an
ability score: reading confidence, English proficiency, culture, disability,
device, and prior familiarity can vary within either group.

## Baseline observable problem

The present screen has sensible regions—a status pill, character, caption, and
reserved control row—but some states make all of them report the same wait.
This is visible presentation duplication, not only repeated source strings.

| Baseline state | Simultaneous presentation |
| --- | --- |
| `connecting` | **Getting ready** with a spinning status icon; a caption labelled **Getting ready**; floating Peppa |
| early `thinking` | **Thinking** with a spinning status icon; the child's final words; disabled **Wait for Peppa** with a second spinner; floating Peppa |
| later `thinking` | **Thinking** with a spinning status icon; **Wait for Peppa.** or **Still waiting for Peppa.**; disabled **Wait for Peppa** with a second spinner; floating Peppa |
| `speaking` | **Peppa's turn**; Peppa's caption; disabled **Listen to Peppa**; floating Peppa |
| `reconnecting` | **Trying again** with a spinning status icon; a caption that also says **Trying again**; disabled **Trying again** with a second spinner; floating Peppa |
| `saving` | **Finishing chat** or **Saving your answers** with a spinner; a caption that repeats finishing or saving; floating Peppa |
| sound start | **Starting sound** in the status, caption, and disabled button; two spinners; floating Peppa |
| microphone start | **Opening microphone** in the status and disabled button; two spinners |

In the most repetitive ordinary wait, the child can see the same instruction in
two places and three simultaneous motion sources. The disabled control looks
like the place to act but cannot be activated. That may be read as emphasis,
or it may look like a frozen button; the code and screenshots cannot establish
which interpretation children make.

The existing design also has important strengths to preserve:

- Start, microphone, and stop actions paint named feedback immediately.
- One persistent polite atomic status exposes meaningful phase changes.
- Captions preserve Peppa's speech and the learner's live/final transcript.
- A finite wait replaces busy motion with a truthful result and one recovery
  action.
- Back remains available, and the caption/control slots already reserve space
  across narrow and short layouts.

## Recommendation

Use a **phase, content, action** hierarchy:

1. The status pill owns the short phase name. During an active remote wait, it
   owns the only progress animation.
2. The caption owns meaningful content: Peppa's words, the learner's words, or
   one short detail that does not repeat the phase label. A system caption does
   not need a second uppercase copy of the status.
3. The control row contains an action only when the child can act. While the
   child must wait or listen, use an inert, `aria-hidden` reserved-height
   placeholder instead of a disabled status-shaped button.
4. Peppa remains static whenever the status spinner is active. Character
   motion must not become a second progress indicator.
5. Keep the existing semantic status and finite recovery. Simplification must
   not mean silent waiting, a hidden failure, focus movement, or removed exits.

This rule does not require each region to disappear. It requires each region to
have one job. **Thinking** plus **You said: red ball** is complementary;
**Thinking**, **Wait for Peppa**, and a second **Wait for Peppa** are competing
expressions of the same state.

## Evidence and its limits

Sources were opened and checked on 2026-08-21. They support the direction, not
Parrot's exact layout, copy, animation count, or age-group outcome.

| Source | What the source supports | Parrot inference and limit |
| --- | --- | --- |
| W3C COGA, [Provide Feedback](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p10-status-feedback/), content first published 29 April 2021, UI posted January 2022 | Each process step should give rapid, visible, programmatically determinable feedback so a user knows an action was processed | Keep immediate named phase feedback. The pattern does not require the same feedback in three visible regions and is not a study of young language learners. |
| W3C COGA, [Avoid Too Much Content](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o5p03-manageable-quantity/), content first published 29 April 2021, UI posted January 2022 | A simple interface with unnecessary content removed can reduce cognitive overload, anxiety, and loss of focus | Remove a disabled control that adds no action and repeats the wait. The cited personas are not young children, and the source does not prescribe one spinner. |
| W3C COGA, [Keep Text Succinct](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p05-succinct-text/) and [Ensure Controls and Content Do Not Move Unexpectedly](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p01-unexpected-movement/), content first published 29 April 2021, UI posted January 2022 | Remove unnecessary words; keep controls and content stable while loading or refreshing | Replace repeated wording inside existing slots rather than collapsing the layout. Supplemental guidance does not validate Parrot's exact words or geometry. |
| W3C WAI, [Understanding WCAG 2.2 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), updated 11 May 2026 | Waiting, progress, result, and error messages can be exposed to assistive technology without moving focus; overly chatty live regions are a user-testing risk | Keep one polite status and announce meaningful boundaries only. The document is informative; browser and screen-reader behavior still needs direct observation. |
| W3C WAI, [Understanding WCAG 2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), updated 28 June 2026 | Persistent moving content alongside other content can distract some people; a loading animation can be meaningful, but the criterion does not make every loader essential | Keep one truthful progress cue and remove parallel decorative/busy motion. This proposal should not claim that one spinner is a WCAG requirement. |
| W3C, [Media Queries Level 5: `prefers-reduced-motion`](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion), Working Draft 19 February 2026 | A `reduce` preference asks authors to remove or replace nonessential motion | Preserve a text/icon state when animation is suppressed. The document is a Working Draft and does not identify the best default motion for children. |
| Council of Europe, [CEFR Companion Volume](https://rm.coe.int/cefr-companion-volume-with-new-descriptors-2020/16809ea0d4), 2020 | At Pre-A1, understanding short, simple action instructions can depend on slow delivery and visual/gestural support | Keep one short visible action when action is possible. It does not test a five-year-old, Peppa copy, or application waiting states. |
| US Office of Head Start, [Visual Supports](https://headstart.gov/children-disabilities/article/visual-supports), accessed 2026-08-21 | Pictures can help young children understand what to do and what happens next when verbal instructions are difficult | Keep character pose and layout as supplemental orientation, but do not assume animation improves comprehension. This is practitioner guidance, not a Parrot UI trial. |
| NAEYC, [Developmentally Appropriate Practice core considerations](https://www.naeyc.org/resources/position-statements/dap/core-considerations), 2020 | Decisions for birth-through-eight learners must consider developmental commonalities, each child, and social, cultural, and linguistic context | Evaluate with multilingual children and caregivers instead of labelling one presentation universally “for five-year-olds.” It is educational guidance, not an interface prescription. |

The first six W3C sources correspond to [A11Y-03, A11Y-09, A11Y-10,
A11Y-11, and A11Y-12](./source-register.md); the learner evidence corresponds
to [LANG-09, LANG-10, and DEV-02](./source-register.md).

## Implemented state presentation and deferred targets

The following is a Parrot product hypothesis, not a source finding. Existing
transport transitions and timer thresholds remain authoritative.

| State | Status (phase) | Caption (content/detail) | Control row | Motion |
| --- | --- | --- | --- | --- |
| Ready | **Ready to talk**, static | Existing simple start prompt; do not add another readiness label | **Talk to Peppa** | Existing character float may remain; no busy indicator |
| Sound blocked | **Sound is off** with a static volume-off icon | Retain the relevant Peppa line or one brief sound instruction; do not add another **Sound is off** label | Active **Tap for sound** | No busy motion; use a static Peppa pose so movement does not imply audible speech |
| Sound starting | Programmatic **Starting sound** status; the eventual direct-control design may make the visible pill quiet while the focused control owns progress | Retain the relevant Peppa line or prior sound result; do not repeat **Starting sound** | Focus-preserving, activation-suppressed **Starting sound** pending control | One control spinner only in the eventual direct-control design; no character float |
| Connecting | **Getting ready** with one spinner | **Starting the voice chat.** initially; later **Still getting ready.** without a repeated uppercase phase label | Reserved inert space | Status spinner only; Peppa static |
| Learner turn, mic closed | **Your turn**, static | Peppa's latest words or the current prompt | **Tap, then talk** | No busy motion |
| Microphone opening | Programmatic **Opening microphone** status; the eventual direct-control design may make the visible pill quiet while the focused control owns progress | Retain Peppa's prompt; do not repeat **Opening microphone** | Focus-preserving, activation-suppressed **Opening microphone** pending control | One control spinner only in the eventual direct-control design; no character float |
| Learner turn, mic open | **Listening**, static | **Your words** plus live transcript or **Say your answer.** | **I'm done** | No busy motion |
| Thinking, first 1.8 s | **Thinking** with one spinner | **You said** plus the final learner transcript | Reserved inert space; contextual Finish may remain if already allowed | Status spinner only; Peppa static |
| Thinking, ordinary wait | **Thinking** with one spinner | **Wait for Peppa.**, then the existing finite **Still waiting for Peppa.** detail | Reserved inert space; no disabled **Wait for Peppa** | Status spinner only; Peppa static |
| Peppa speaking | **Peppa's turn** with a static volume icon | **Peppa** plus the actual spoken line | Inert primary slot; no disabled **Listen to Peppa**; existing contextual Finish remains | No loader; do not introduce new speaking motion in this slice |
| Reconnecting | **Trying again** with one spinner | **The chat stopped.**, then **Still trying.**; omit a duplicate uppercase **Trying again** label | Inert primary slot; existing contextual Finish remains where already allowed | Status spinner only; Peppa static |
| Saving/finishing | Existing purpose-specific phase with one spinner | Keep one brief social close or delayed detail, not another copy of the phase label | Reserved inert space; omit group semantics when it has no real action | Status spinner only; Peppa static |
| Finite wait/error | Existing **Chat paused** or **Finish paused**, static | Literal result such as **Peppa did not answer.** | One existing retry, lesson, Finish, or Back action | No busy motion; unchanged |

The 1.8-second transcript boundary and later wait milestones are existing
product heuristics, not developmental standards. This branch should not retune
them. The simplification must preserve the later **Still waiting** change and
finite terminal boundary so a static character is not mistaken for a frozen
application.

### Direct-control states deferred from the first slice

**Opening microphone** and **Starting sound** currently duplicate state text
and spinners between the status and the pending button. They are not safe to
change incidentally:

- microphone activation has a pressed/disabled/focus contract; and
- autoplay recovery must remain visibly associated with a user gesture, and
  its control calls `startAudio()` directly from that gesture.

A follow-up should choose one progress owner per direct action: either the
control owns its spinner while the status remains programmatic, or the visible
status owns progress while the control retains a stable, focus-safe pending
shape. That choice needs keyboard, switch, VoiceOver, and browser autoplay
testing. The first remote-state slice can still remove the exact duplicated
waiting/speaking control without touching these paths.

The table records the recommended follow-up direction: let the focused direct
control own the visible spinner and pending label, keep the persistent status
available programmatically, suppress duplicate activation with
`aria-disabled` plus explicit click and keyboard guards rather than dropping
focus, retain caption content, and stop the character float. ARIA conveys state
but does not block activation by itself. The original `startAudio()` call must
remain directly inside the initiating user gesture. This is a design target,
not permission to change the gesture-bound paths in the first slice.

### Caption repetition policy

Do not repeat the exact status as a caption label merely “for accessibility.”
The persistent live status makes the phase programmatically determinable;
duplicating it in a non-live caption does not add that semantic exposure and a
second live caption would make announcements noisier.

A caption may intentionally reinforce the same situation only when it has a
different content job:

- **Thinking** plus **You said: red ball** preserves the learner's words.
- **Thinking** plus **Still waiting for Peppa.** gives a finite later-wait
  update without renaming the phase.
- **Trying again** plus **The chat stopped.** gives cause/result and
  current phase separately.
- **Chat paused** plus **Peppa did not answer.** separates the boundary from
  the literal result.

Actual Peppa or learner speech is not rewritten merely to avoid a coincidental
shared word. Exact system-label duplication should otherwise be removed unless
target-user or assistive-technology testing establishes a concrete benefit.

## Accessibility and announcement contract

- Keep exactly one pre-existing `role="status"` with `aria-live="polite"` and
  `aria-atomic="true"`. Do not move focus for ordinary phase changes.
- Do not add `aria-busy` to the status. The status DOM update is complete even
  while the remote operation is pending; deferring its announcement would
  suppress useful feedback.
- Keep captions outside a competing live region. A growing transcript must not
  generate repeated announcements. Sparse later-wait details live as visually
  hidden text inside the existing atomic status, so the same single live region
  announces meaningful milestones without making the caption live.
- Announce meaningful boundaries: action acknowledged, learner turn, Peppa
  turn, later-wait detail, reconnecting, finite recovery, and finished. Do not
  announce spinner frames, character movement, or an inert placeholder. When a
  final learner transcript is visibly retained, do not duplicate it in the
  status; if that transcript is empty, announce the literal wait detail.
- The placeholder replacing the disabled wait control is not a control and has
  no accessible name or role. It exists only to preserve geometry.
- Keep the exact visible and accessible names of real actions aligned. Back,
  Finish, Retry, lesson fallback, microphone, repeat audio, and sound recovery
  remain keyboard-operable.
- Do not rely on motion, color, or character pose alone. With animation
  removed, phase text and static icon must still distinguish waiting,
  listening, speaking, and recovery.
- Verify announcement order with actual assistive technology. DOM inspection
  and accessibility snapshots cannot prove what VoiceOver or TalkBack speaks.

## Timing and motion rules

- Preserve the existing immediate paint after Start, microphone, stop, Retry,
  and Finish. A wording reduction must not delay acknowledgement until a
  network response.
- Preserve the existing timer reset rules and terminal boundaries. This branch
  changes presentation only.
- At most one *busy* animation is visible during a remote operation. For the
  first slice, that is the status spinner.
- Peppa's float is off whenever `connecting`, `thinking`, `reconnecting`, or
  `saving` is active. A static state-specific pose remains visible.
- `prefers-reduced-motion: reduce` leaves zero running status, control, and
  character animations in every tested remote-wait state.
- Stopping a decorative animation must not swap image sources, resize the
  figure, move the caption, or change the control-row height.
- Do not add a percentage, countdown, changing ellipsis, progress bar, or
  promised completion time. The client does not know remote completion
  progress.

## Color, hierarchy, and language

- Do not add a new color. Existing status, learner-turn, and recovery colors
  remain supplemental to text and icon.
- Preserve the large character and caption hierarchy. Simplification should
  create calmer negative space, not make a new diagnostic panel prominent.
- Use the short phase word once. A second line is allowed only when it contains
  distinct information, such as the learner transcript or the reason a retry
  began.
- Avoid causally unsupported copy such as **Bad internet**, relational pressure
  such as **Peppa is sad**, or comparative language that is difficult for an
  English beginner.
- Do not infer or automatically translate into a home language. Any localized
  state vocabulary requires a grown-up-selected locale, translation review,
  and its own truncation and comprehension checks.

## Rejected alternatives

- **Remove every status word and use animation alone.** Rejected because it
  makes meaning depend on vision and motion, and removes programmatically
  determinable waiting feedback.
- **Keep the disabled wait button because it fills space.** Rejected because an
  inert placeholder can preserve the same geometry without looking actionable
  or repeating the instruction.
- **Move all wait copy into the disabled button.** Rejected because phase
  feedback should not be represented as an unavailable action, and a disabled
  control has weaker focus and announcement behavior.
- **Use both spinners but slow one down.** Rejected because two progress cues do
  not communicate more progress; speed would add an unsupported meaning.
- **Animate Peppa instead of showing a status spinner.** Rejected for this
  slice because character motion is ambiguous and disappears under reduced
  motion. The named status remains the reliable signal.
- **Delete the caption while waiting.** Rejected because the learner's words,
  reason for reconnecting, and later-wait detail carry information distinct
  from the phase. Removing the whole region also risks layout shift.
- **Freeze every character state everywhere.** Rejected as unnecessary scope.
  The first hypothesis removes simultaneous motion during remote processing;
  the value of calm character motion during ready, listening, or speaking needs
  separate observation.
- **Change timers while simplifying the screen.** Rejected because it would
  confound visual clarity with wait duration and recovery behavior.
- **Auto-play a spoken status.** Rejected because the audio path may be the
  pending or failed modality, surprise audio adds interruption, and new saved
  recordings require a separate language/audio design.

## Automated and visual acceptance criteria

Use rendered behavior and accessible locators, not class-name assertions.

### State semantics

- In `thinking`, the page has one polite atomic status with the visible phase
  **Thinking**, one caption with either the learner's final words or the current
  wait detail, and no button named **Waiting for Peppa** or **Wait for Peppa**.
- In `speaking`, the actual Peppa caption and **Peppa's turn** status remain,
  with no disabled **Listen to Peppa** button.
- In `reconnecting`, **Trying again** appears as the status phase once; the
  caption retains **The chat stopped.** or **Still trying.**; no disabled
  **Trying again** button exists.
- Connecting and saving retain immediate named status and finite recovery.
- Terminal wait recovery, repeated-failure lesson fallback, Back, Finish,
  Repeat, microphone, and sound-recovery behavior remain unchanged.
- The reserved placeholder has no role, accessible name, tab stop, click
  handler, or disabled-button semantics.

### Motion and geometry

- With ordinary motion, `connecting`, `thinking`, `reconnecting`, and `saving`
  expose exactly one running busy animation; neither the character nor control
  region has a running animation.
- With reduced motion, those states expose zero running animations while the
  same visible phase text and static icon remain.
- Capture deterministic state screenshots at 280×568, 390×844, 640×360, and
  1440×900. Include early thinking, later thinking, speaking, reconnecting,
  and at least one terminal recovery comparison.
- At each viewport, the header, status, character, caption, and control group
  remain visible without overlap or horizontal outer-page overflow. Short
  landscape retains the two-column composition.
- The control slot's bounding box and the caption's position do not jump when a
  wait becomes speaking, learner turn, or recovery. Allow only subpixel
  rounding, not a visible reflow. The slot receives group semantics only while
  it contains a real child or Finish action.
- Test 200% zoom and increased text spacing manually or in a dedicated browser
  fixture before claiming broad accessibility.

### Timing and regression

- A deterministic held Start and held learner response paint their named phase
  in the immediate interaction task; use the existing 100 ms product
  acknowledgement hypothesis only as a regression budget, not a child standard.
- Fake-clock tests still reach every existing later-wait and terminal boundary
  at the same elapsed times.
- Removing the disabled controls does not start, stop, retry, or finish a
  conversation and does not change request counts.
- A screen-reader spot check covers **Thinking** → **Peppa's turn** → **Your
  turn**, **Trying again** → recovery, and the repeated-failure lesson action.

## Implementation and validation result

Implementation commit `17c1711`, with four-viewport terminal-caption geometry
strengthened at `b5c00b4`, retains the existing state machine and timer
milestones while giving each visible region one job:

- the persistent polite atomic status owns the phase and sole remote-wait
  spinner;
- the caption owns Peppa speech, learner transcript, cause, social close, or a
  distinct wait detail, without a repeated phase label;
- the primary control slot is inert during passive waiting or listening, keeps
  its responsive 48/56/64 px height, and exposes no empty named group when no
  real action exists;
- Peppa is static during `connecting`, `thinking`, `reconnecting`, and
  `saving`; speaking motion remains an explicit future question; and
- sparse wait milestones remain inside the one live status for assistive
  technology, including the empty-transcript edge case.

The deterministic baseline audit counted three simultaneous animations during
ordinary Thinking and two during Connecting. Current Chromium behavior exposes
one running status animation in `connecting`, `thinking`, `reconnecting`, and
`saving`, zero in the character and control slot, and zero total under reduced
motion. Four-viewport checks at 280×568, 390×844, 640×360, and 1440×900 keep the
caption and responsive control-slot boxes stable across remote wait, Peppa
speech, learner turn, and terminal recovery. The first browser pass exposed an
8 px desktop placeholder mismatch; matching the large control's responsive
height removed it.

Validation passed:

- 674/674 unit, integration, lifecycle, and safety tests in 90 suites;
- 189/189 Chromium tests, including active reduced motion, running-animation
  counts, accessible group presence/absence, sparse live-status detail, and
  four-viewport geometry;
- TypeScript and production build; final core bundle 494.04 kB raw / 149.30 kB
  gzip and ConversationSurface 16.98 kB raw / 5.67 kB gzip;
- lint with zero errors and the same two generated-declaration warnings; and
- diff checks, 200 local research-document links, 206 local links when the
  artifact manifest is included, and six valid baseline JPEGs.

The [visual evidence manifest](../../artifacts/ux-review/talk-state-clarity/README.md)
links the six baseline captures. They show Ready, Starting sound, ordinary
Thinking at three viewports, and terminal lesson recovery. After-state capture
could not be completed because the in-app browser lost its local-page binding
and rejected the replacement local navigation under its URL security policy;
no alternate capture surface was substituted. Therefore current-state visual
inspection, the screen-reader sequence, 200% zoom/text spacing, real transport
and target-browser behavior, and child/caregiver comprehension remain open.
The implementation is retained provisionally, not claimed as child-validated.

## Formative child/caregiver study

Run a safeguarded, moderated comparison with approximately six to eight
child/caregiver pairs. Include early learners around five to seven, a smaller
comparative seven-to-ten group, more than one home language, varied reading
confidence, and relevant access needs. Do not require an English verbal answer;
the child can point or act.

Use deterministic fixtures with identical scripts and delays. Counterbalance
the existing and simplified presentation so one design is not always seen
after the child has learned the task.

1. Let the child start Talk and end one spoken turn.
2. Hold **Thinking** first briefly and then beyond the existing usual-reply
   milestone. Ask, “What can you do now?” without naming a control.
3. Let Peppa speak. Observe whether the child waits/listens or searches for the
   removed disabled button.
4. Simulate reconnecting and then successful recovery. Ask the child to show
   what they think is happening.
5. Show one finite failure only after the ordinary sequence, then confirm the
   existing active recovery remains discoverable.
6. Ask the caregiver which presentation made the next expected behavior
   clearer and whether either looked frozen, broken, urgent, or blaming.

Record only the presented variant/order, intended behavior identified
(wait/listen/talk/choose recovery), first tap target or no tap, facilitator or
caregiver prompt needed, misunderstanding category, and optional coarse
time-to-first-action. Record accessibility accommodations needed for the task,
not a diagnosis. Treat notes as formative evidence rather than a population
effect estimate.

Retain the hypothesis if the simpler screen does not reduce recognition of
waiting or Peppa's turn, does not make the app look frozen, and removes attempts
to activate the status-like disabled control. Revise if children need a visual
wait target or if **Thinking** is not understood. Do not conclude that a result
for one home language, age, or access profile generalizes to all learners.

## Safety and privacy limits

- Do not collect child audio, transcripts, names, account/session/conversation
  identifiers, home language, exact age, screenshots, video, eye tracking, or
  raw interaction traces merely to compare these layouts.
- Obtain appropriate caregiver consent, child assent, safeguarding review, and
  a documented retention/deletion plan before any study. Stop if a child is
  distressed or frustrated.
- Prefer facilitator-coded, de-identified task outcomes. If an approved study
  needs a direct quote or media, consent, access, purpose, and deletion require
  separate review.
- Do not add a production analytics sink for this branch. Existing local
  deterministic timing and browser assertions are sufficient for the first
  implementation decision.
- Do not optimize for longer sessions, repeated taps, or more retries. The
  intended outcomes are comprehension, calm waiting, correct next action, and
  reliable recovery.

## Rollback and revision signals

Rollback or restore a clearer cue if any of the following is reproducible:

- children more often interpret a wait as a frozen app or abandon a recoverable
  turn;
- children more often tap the character, caption, or empty control slot while
  Peppa is thinking or speaking;
- the removed disabled control was serving a discoverable non-reading purpose
  that the status/caption combination does not replace;
- target assistive technology fails to announce a meaningful phase transition,
  or simplifying markup creates duplicate or missing announcements;
- the control slot collapses, content shifts, focus is lost, or a real action
  moves under the learner's pointer;
- ordinary motion shows more than one busy cue, reduced-motion shows a running
  animation, or a static state cannot be distinguished without color; or
- direct microphone, autoplay, retry, Finish, Back, or lesson-fallback behavior
  changes despite being outside the slice.

Revise rather than roll back if the visual hierarchy is calmer but one exact
word, icon, later-wait detail, or character pose is consistently misunderstood.

## Implementation hand-off

```text
Branch: codex/talk-state-clarity
Base branch / dependency: codex/repeated-talk-recovery documentation hand-off b0f6147
Implementation commit: 17c1711
Geometry evidence follow-up: b5c00b4
Hypothesis: one named phase, one meaningful caption, and only actionable controls will make remote Talk states calmer and easier to parse than repeated wait text, disabled pseudo-actions, and simultaneous busy motion
Smallest first slice: remove WaitingTurnControl from thinking/speaking/reconnecting while retaining its reserved height; omit duplicate system-caption labels; stop character float during connecting/thinking/reconnecting/saving; keep the status as the sole remote-wait spinner
Preserve: lifecycle and timers; captions/transcripts; polite atomic status; immediate action acknowledgement; Finish/Back/Retry/lesson fallback; direct microphone and autoplay pending controls
Evidence obtained: behavior tests; fake-clock boundaries; running-animation counts; stable four-viewport geometry; reduced motion; accessible state sequence in rendered DOM; six baseline screenshots
Evidence still open: after-state screenshots; VoiceOver/TalkBack sequence; 200% zoom and increased text spacing; real target-device/browser transport; child/caregiver formative follow-up
Not authorized by research: new timers, spoken status, localization inference, production telemetry, AI/LiveKit changes, or a claim of child comprehension
Retain, revise, or reject: retain provisionally; revise if visual, assistive-technology, or child evidence triggers a rollback signal above
```

## Open questions

- Does the target audience understand **Thinking**, or would a more concrete
  phrase or picture communicate “wait for Peppa” better?
- Does keeping the learner's final transcript visible throughout Thinking help
  recognition, or does the existing later-wait replacement feel more alive?
- Does the empty reserved control slot look calm or broken to a pre-reader?
- Should Peppa remain static during speaking as well as remote waits, or does
  restrained character motion help children identify the speaker?
- Which region should own progress during gesture-bound **Starting sound** and
  focus-sensitive **Opening microphone** states?
- Are the same defaults appropriate for older beginners, or should adaptation
  follow reading/language support needs rather than age bands?
- What announcement order do VoiceOver/Safari and TalkBack/Chrome produce on
  the target devices?
