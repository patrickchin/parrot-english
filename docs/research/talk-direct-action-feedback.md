# Direct Talk action feedback: sound and microphone

Date: 2026-08-21

Branch: `codex/talk-direct-action-feedback`

Base commit: `feacfe1`

Status: implemented at `8e69386`; automated Chromium, component, lifecycle,
type, build, lint, and four-viewport in-app visual validation complete;
target-browser/media interoperability, assistive-technology observation, and
child/caregiver testing remain open

## Question and scope

How should Talk to Peppa acknowledge the two actions that begin directly under
the child's finger or keyboard focus—starting blocked audio and opening the
microphone—without repeating the same message, dropping focus, breaking
browser media activation, or implying that a remote operation has finished?

This is the stacked follow-up to [Talk state clarity](./talk-state-clarity.md).
It covers only the `Starting sound` and `Opening microphone` pending
presentations and the semantics needed to make them safe. It does not change
LiveKit connection logic, microphone permission policy, autoplay policy,
conversation prompts, retry budgets, remote wait thresholds, transcript
handling, audio storage, or the lesson fallback.

Primary audience: roughly five- to seven-year-old English beginners, including
pre-readers and children who use another language at home. A seven-to-ten group
is a useful comparison, not a presumed higher-ability group. English
proficiency, reading confidence, disability, culture, device, and prior
experience must be considered independently of age.

## Decision

Let the pending **button** own the one visible spinner and the one visible
pending label. Keep the same native button mounted and focused, mark it
`aria-disabled="true"`, suppress repeated activation in both the view handler
and the existing domain guard, and retain a stable visible phase in the status
pill. Keep exactly one mounted polite atomic status as the explicit live-region
owner; add the pending detail there only for non-visual acknowledgement. Remove
the duplicate pending caption and status spinner, stop the character float, and
do not advertise a shortcut that is unavailable during the pending state.

For sound recovery, `startAudio()` must remain a direct, synchronous descendant
of the native click activation. It must not move into an effect, timer, task,
animation callback, or code path after an unrelated `await`.

This is a product hypothesis informed by standards and platform contracts. No
source establishes that this exact arrangement or wording is optimal for a
five-year-old multilingual learner.

## Implemented outcome

Commit `8e69386` implements the control-owned model without changing the
production transport, retry, permission, or audio-readiness contracts:

- the direct control is the only visible pending label and spinner;
- the visible status stays **Sound is off** or **Your turn**, while its existing
  atomic polite live region exposes the pending phrase to assistive technology;
- the pending button remains the same focused native button, uses
  `aria-disabled="true"`, and is guarded in both the view and the existing hook;
- shared `ActionButton` behavior suppresses pointer activation and all
  hover/press transitions while `aria-disabled`, including a held Space key;
- captions retain a real Peppa line when one exists, otherwise use the neutral
  unattributed fallback **Peppa is here.**, and never repeat pending copy;
- Peppa is static during both direct pending states;
- the microphone action stops advertising Space while busy and no longer mixes
  a changing action label with `aria-pressed`;
- sound failure returns focus to the retry and adds the literal failure to the
  same live status; and
- sound success moves focus to **Tap, then talk** when it is immediately
  available, or to the named caption region while a missed Peppa line replays.
  The hand-off is conditional on the sound action still owning focus, so it
  does not steal focus after the learner moves elsewhere.

The deterministic E2E transport now includes held microphone permission and
established-track sound interruption cases. They exist only for rendered
state, focus, timing, and motion validation; production timeout behavior is
unchanged.

## Baseline observed at `feacfe1`

The pre-implementation behavior at base commit `feacfe1` was implemented in
[`ConversationSurface.tsx`](../../src/conversation/ConversationSurface.tsx),
[`usePeppaConversation.ts`](../../src/conversation/usePeppaConversation.ts),
and
[`livekit-conversation.ts`](../../src/conversation/livekit-conversation.ts).

### Starting sound

When audio recovery is pending, **Starting sound** appears four times in the
rendered information hierarchy:

1. the status text;
2. the uppercase caption label;
3. the caption sentence; and
4. the disabled button label.

The status and button each spin, while Peppa can continue floating. The
small-screen result is visible in
[`starting-sound-280x568.jpg`](../../artifacts/ux-review/remote-audio-playback/starting-sound-280x568.jpg)
and
[`before-starting-sound-390x844.jpg`](../../artifacts/ux-review/talk-state-clarity/before-starting-sound-390x844.jpg).
The button's geometry is stable, but native `disabled` removes the focused
action from ordinary keyboard focus and blocks its click behavior.

### Opening microphone

When microphone opening is pending, **Opening microphone** appears in the
status and the disabled button, and both regions spin. Peppa can still float in
this direct pending state. The button continues to expose
`aria-keyshortcuts="Space"` even though the global Space action is unavailable
while the operation is busy.

The current hook already provides a valuable second line of defence:
`audioPlaybackBusyRef` and `microphoneBusyRef` are set before the asynchronous
operation and reject repeated domain calls. Audio recovery also calls the
transport's `startAudio()` directly from the action callback. Those contracts
must be preserved.

The screenshots and source inspection establish duplication and motion count.
They do **not** establish that children find the state confusing or what any
screen-reader/browser combination announces.

## Ownership model

Each visible region has one job:

- **Status:** stable turn or availability context, with a static icon.
- **Caption:** meaningful Peppa/learner content, not a second system label.
- **Focused control:** acknowledgement of the direct action and its only busy
  animation.
- **Character:** orientation and personality, static while the action is
  pending.

| Moment | Visible status | Caption | Primary control | Motion |
| --- | --- | --- | --- | --- |
| Sound blocked | **Sound is off**, static volume-off icon | Keep the relevant Peppa line; one brief **Tap for sound.** instruction is allowed before activation when it adds information | Active **Tap for sound** | None |
| Sound starting | Keep **Sound is off**, static; status accessible text also includes **Starting sound.** | Keep meaningful Peppa content; remove the pending system label, sentence, and stale tap instruction | Same focused button becomes **Starting sound**, `aria-disabled="true"` | One button spinner |
| Sound succeeds | Existing conversation phase | Existing meaningful content | Remove or transition the recovery control with deliberate focus hand-off | Existing phase rule |
| Sound fails | **Sound is off**, static; polite failure detail | Keep one literal result, not a technical cause | Same button returns to active **Tap for sound** | None |
| Learner turn, mic closed | **Your turn**, static microphone icon | Peppa's latest prompt | Active **Tap, then talk** | None |
| Microphone opening | Keep **Your turn**, static; status accessible text also includes **Opening microphone.** | Keep Peppa's prompt; remove a stale instruction to tap | Same focused button becomes **Opening microphone**, `aria-disabled="true"` | One button spinner |
| Microphone succeeds | **Listening**, static | Existing learner prompt/transcript | Same button becomes active **I'm done** | None |
| Microphone fails | **Your turn**, static; polite failure detail | Existing literal recovery message | Same button returns to active **Tap, then talk** | None |

If no meaningful sound caption exists, use one neutral, non-action fallback in
the reserved caption slot rather than repeating **Starting sound** or leaving a
stale **Tap for sound** instruction. The exact fallback needs copy review; it
must not invent progress or tell the child that sound is already audible.

## Focus, disabled semantics, and activation guards

Native `disabled` and `aria-disabled` are not interchangeable. HTML prevents
click events queued on a disabled form control, and browsers normally remove a
native disabled button from sequential focus. `aria-disabled` exposes an
unavailable state while allowing the product to retain focus, but it does not
disable behavior or supply disabled styling.

For each pending direct action:

1. Keep the same native `<button>` node, dimensions, and location.
2. Replace native `disabled` with `aria-disabled="true"` only while pending.
3. Begin the event handler with a busy check and return without side effects.
   This must cover pointer activation, native Enter/Space synthesized clicks,
   assistive-technology activation, and a programmatic `.click()`.
4. Retain the hook's busy-ref check as a second independent guard. Set the ref
   before the promise begins, as it is now.
5. Suppress hover, active, and press motion and give the `aria-disabled` state
   an explicit subdued appearance. Shared button CSS currently styles native
   `disabled`; an implementation cannot assume it also styles
   `aria-disabled`.
6. Do not combine `disabled` and `aria-disabled`; that would preserve the focus
   loss this change is intended to avoid.
7. Do not remove the global Back action or disable the whole surface.

The microphone's global Space shortcut is already not installed while the turn
is busy. Its `aria-keyshortcuts="Space"` must also be omitted while pending so
the interface does not advertise an unavailable command.

The microphone is currently an action-labelled button whose visible name
changes between **Tap, then talk** and **I'm done**, while also exposing
`aria-pressed`. The WAI-ARIA Authoring Practices button pattern says a toggle
label should remain constant when `aria-pressed` conveys the state; when the
label changes with the action, `aria-pressed` is not needed. Prefer the literal
changing action labels for this beginner interface and remove `aria-pressed`
from this control. **Your turn** and **Listening** already provide the state.
A stable generic **Microphone** toggle label is a testable alternative, not the
first choice, because it makes the next action less literal.

### Focus after resolution

- During pending and failure/retry, focus stays on the same button.
- Microphone success keeps the same node and changes it to **I'm done**.
- Sound success can remove the recovery control. If it was focused, the
  implementation must deliberately move focus to the next active primary
  action when one exists; otherwise use a stable, named conversation target.
  It must not silently leave focus on `body` or move it to Back.
- A stale promise that settles after Back, unmount, or a newer transport must
  not move focus or update the new screen.

The implementation uses the named caption region as the non-action fallback
only when missed opening audio is replaying and no next turn action exists.
Whether that fallback is the least disruptive destination remains an empirical
assistive-technology question. A live status should not be focused merely to
force it to speak.

## User activation and autoplay continuity

The HTML user-activation model makes transient activation time-limited and
potentially consumable. LiveKit's current JavaScript documentation requires
`Room.startAudio()` to be called from an `onclick` or `ontap` handler; Parrot's
pinned v2.20.0 source performs attached-media playback and audio-context resume
inside that method. Browser autoplay policy and settings still vary.

The safe order is therefore:

1. receive the trusted native button activation;
2. synchronously check the UI busy guard;
3. synchronously enter `startAudioPlayback()`;
4. set the busy ref/state; and
5. call `transport.startAudio()` before any unrelated `await` or task boundary.

A React state update before the transport call does not itself introduce a
task boundary. Moving the call to `useEffect`, `setTimeout`, an animation
completion callback, or another scheduled task does. A microtask or an already
resolved `await` can still run before transient activation expires, but adds
indirection and is outside LiveKit's documented direct click/tap pattern; do
not rely on it. A genuinely delayed continuation can break recovery on stricter
browsers.

Use a native button so pointer, Enter, Space, and assistive-technology
activation converge on its click behavior. Do not implement separate media
start paths for mouse and keyboard. Fulfilment means the browser/room accepted
the readiness operation; it does not prove that a speaker emitted sound or
that the child heard it.

Microphone permission should likewise begin from the explicit button action.
The Media Capture specification permits the permission step to stall if the
user never responds. Keep the pending presentation calm and keep Back usable;
do not add an app countdown or claim that permission is nearly ready. Browser
permission handling and LiveKit abstraction still require target-browser
tests.

## Status and live-region contract

Keep exactly one pre-existing `role="status"` with `aria-live="polite"` and
`aria-atomic="true"` mounted across the transition. Do not add a second live
caption, `role="alert"`, or `aria-busy` for these ordinary pending operations.

The visible status remains **Sound is off** or **Your turn** so it does not
compete with the pending control. A visually hidden suffix inside the same
status supplies **Starting sound.** or **Opening microphone.** when pending.
On failure or success, update this same live region with the existing literal
boundary; do not announce spinner frames or elapsed time.

This creates one explicit live-region owner, but it cannot guarantee one spoken
utterance: some screen readers may also announce the accessible-name or state
change of the focused button. That interaction is implementation-dependent.
Direct VoiceOver, TalkBack, and NVDA observation must decide whether the
result is one useful acknowledgement, an acceptable short echo, or a harmful
duplicate. If it is harmful, revise the semantic split rather than adding
timers or another live region.

## Language, hierarchy, timing, and motion

### Child-simple copy

Keep **Starting sound** and **Opening microphone** for the first implementation
so the experiment isolates ownership and motion rather than changing several
variables at once. Both are short and literal existing labels. **Microphone**
is nevertheless a long technical word for some beginners, so child
comprehension testing should compare:

- **Opening microphone**;
- **Turning on microphone**; and
- **Get ready to talk**.

The last variant may be easier language but may invite a child to speak before
capture begins. Do not adopt it without observation. Avoid **loading**,
**connecting audio**, **unmuting**, **autoplay**, **permission pending**,
**hang on**, and **almost ready**. Do not infer or automatically translate to a
home language; localization needs a chosen locale, translation review, and
layout/comprehension testing.

Icons support the words but never replace them. Color, a spinner, and character
pose are not sufficient state labels.

### Immediate, honest feedback

- Pending feedback should be committed on the first render after activation,
  before the media or permission promise settles.
- Use the existing [performance baseline](./performance-baseline.md) product
  target of p95 at or below 100 ms from activation to the next painted pending
  state in local/staged testing. This is a responsiveness heuristic, not a
  child-comprehension threshold, and does not authorize production child
  telemetry.
- The button's bounding box and control-row height stay stable.
- Do not add fake percentages, countdowns, changing ellipses, or an estimated
  completion time. The client does not know either operation's remaining time.
- Do not add a presentation-layer timeout or automatic retry in this slice.
  An ignored browser permission prompt can remain pending, and Back stays
  available. Any future lifecycle timeout needs its own transport and recovery
  design.

### Motion

- Do not add a new pending color. Use the existing control palette, keep
  text/icon contrast legible, and make `aria-disabled` apparent without making
  color the only cue.
- Default motion: exactly one running busy animation, inside the pending
  button.
- The status icon is static; Peppa and the caption are static.
- `prefers-reduced-motion: reduce`: zero running animations in either pending
  state while text and icons retain the full meaning.
- The pending style has no hover lift, active scale, pulse, bounce, or shimmer.
- Stopping motion must not change artwork dimensions or cause layout shift.

## Evidence and limits

Sources were opened and checked on 2026-08-21. Primary standards and official
platform documentation are used for technical claims; educational sources
inform the evaluation approach rather than proving this design.

| Source | What it supports | Parrot inference and limit |
| --- | --- | --- |
| W3C, [WAI-ARIA 1.2 `aria-disabled`](https://www.w3.org/TR/wai-aria-1.2/#aria-disabled) and [`aria-keyshortcuts`](https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts), Recommendation 2023-06-06 | `aria-disabled` exposes an unavailable but perceivable state; authors must implement behavior and appearance. Shortcuts associated with disabled elements are unavailable. | Retain pending focus with authored guards and stop advertising Space while it is unavailable. ARIA semantics do not prove a browser/AT announcement sequence. |
| W3C WAI, [APG keyboard focusability of disabled controls](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_disabled_controls) and [button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/), accessed 2026-08-21 | Native disabled controls are normally removed from the tab sequence; keeping some unavailable controls focusable is contextual. A button generally retains focus after activation; an `aria-pressed` toggle keeps a stable label. | Keep the direct pending action focusable and remove `aria-pressed` from the changing-label microphone action. APG is design guidance, not direct interoperability evidence or a child study. |
| WHATWG, [HTML disabled form controls](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#enabling-and-disabling-form-controls:-the-disabled-attribute), Living Standard updated 2026-08-21 | A disabled form control prevents queued click events. | Replacing native disabled requires explicit authored suppression. The standard does not choose Parrot's focus strategy. |
| W3C WAI, [Understanding WCAG 2.2 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), updated 2026-05-11, and [ARIA22](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22), updated 2026-01-12 | Status changes can be exposed without focus movement; a pre-existing atomic `status` is one sufficient technique. Overly chatty announcements need user testing. | Keep one polite atomic live region and announce only meaningful boundaries. The Understanding page is informative and neither source guarantees exact spoken output. |
| WHATWG, [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation) and [media autoplay eligibility](https://html.spec.whatwg.org/multipage/media.html#eligible-for-autoplay), Living Standard updated 2026-08-21 | Trusted input can establish transient activation; its duration is user-agent-defined and it can expire or be consumed. A user agent can require transient activation for autoplay. | Keep `startAudio()` in the initiating click call stack and test real browsers. The standard intentionally leaves policy latitude to user agents. |
| LiveKit, [JavaScript client autoplay guidance](https://docs.livekit.io/reference/client-sdk-js/) and [`StartAudio`](https://docs.livekit.io/reference/components/react/component/startaudio/), current documentation accessed 2026-08-21 | `Room.startAudio()` must be called from a click/tap event to satisfy browser policies. | Preserve direct gesture continuity. Current documentation may describe a later SDK than Parrot's v2.20.0; [VOICE-05](./source-register.md) records the pinned source. |
| Chrome, [Autoplay policy](https://developer.chrome.com/blog/autoplay/), official guidance accessed 2026-08-21, and WebKit, [A closer look into WebRTC](https://webkit.org/blog/7763/a-closer-look-into-webrtc/), 2017-07-03 | Audible autoplay and WebRTC media behavior depend on browser policy and user interaction; failed playback needs an explicit control. | Test a persistent recovery action in clean target-browser profiles. These vendor pages are older, and settings, embedding, enterprise policy, and installed-app context can differ. |
| W3C, [Media Capture and Streams `getUserMedia()`](https://www.w3.org/TR/mediacapture-streams/#dom-mediadevices-getusermedia), Candidate Recommendation Draft 2025-10-09 | Permission can be granted or denied, and the algorithm stalls if the user never responds. | Keep Back available and do not show a fake countdown. This specification does not describe LiveKit's full error mapping or each browser's permission UI. |
| W3C COGA, [Use clear words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/), [keep text succinct](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p05-succinct-text/), and [provide feedback](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p10-status-feedback/), published 2021, UI 2022 | Familiar words, short text, and rapid recognizable feedback can reduce cognitive barriers. | Use one short literal pending label. These are supplemental patterns, not WCAG conformance criteria or evidence that Parrot's exact copy is understood by children. |
| W3C, [`prefers-reduced-motion`](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion), Working Draft 2026-02-19, and [WCAG 2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), updated 2026-06-28 | A reduce preference asks authors to remove or replace nonessential motion; persistent motion beside content can distract some users. | Remove parallel busy/decorative motion and make the state complete without animation. One spinner is a product hypothesis, not a WCAG rule. |
| Council of Europe, [CEFR Companion Volume](https://rm.coe.int/cefr-companion-volume-with-new-descriptors-2020/16809ea0d4), 2020, and US Office of Head Start, [Visual Supports](https://headstart.gov/children-disabilities/article/visual-supports), accessed 2026-08-21 | Pre-A1 action instructions are short and simple with visual/gestural support; pictures can help young and dual-language learners understand what to do and what happens next. | Pair literal text with one familiar icon and test by action/pointing rather than reading recall. Neither source validates these labels or this interface. |
| NAEYC, [Developmentally Appropriate Practice core considerations](https://www.naeyc.org/resources/position-statements/dap/core-considerations), 2020 | Decisions should consider developmental commonalities, individuality, and social, cultural, and linguistic context. | Recruit across language and support needs and avoid treating age as ability. This is educational guidance, not a Parrot usability result. |

The durable source mappings are [A11Y-01, A11Y-03, A11Y-08 through
A11Y-13, DEV-02, LANG-09, LANG-10, PERF-02, and VOICE-01, VOICE-04 through
VOICE-10](./source-register.md).

## Acceptance criteria for the implementation branch

### Rendered behavior and semantics

- Each pending state has one visible pending label and one visible spinner,
  both inside its existing primary button.
- The visible status remains **Sound is off** or **Your turn**, uses a static
  icon, and the one mounted polite atomic status contains the pending detail
  for assistive technology.
- The caption contains no **Starting sound** or **Opening microphone** system
  duplication and no stale invitation to tap while activation is suppressed.
- Peppa does not float during either pending state.
- The pending native button has `aria-disabled="true"`, not `disabled`, stays
  in the tab sequence, keeps its node identity and focus, and has an explicit
  visual unavailable state.
- The pending microphone button does not expose `aria-keyshortcuts="Space"`.
- The changing-label microphone action does not expose `aria-pressed`.
- Back stays visible, enabled, keyboard-operable, and outside the pending
  operation's disabled semantics.
- No text, icon, color, or motion claims that sound is physically audible or
  that permission has been granted before the promise resolves.

### Operation and lifecycle

- One click, Enter, Space, or assistive-technology activation starts exactly
  one operation.
- Rapid repeated pointer, keyboard, synthetic click, and global-shortcut input
  during pending starts zero additional operations.
- Both the view guard and the domain busy-ref guard are independently covered
  by tests.
- `transport.startAudio()` remains in the original activation call stack and
  before any unrelated `await`, timer, effect, or queued task.
- Held promises paint pending feedback before settling.
- Local/staged activation-to-pending-paint measurement is p95 at or below
  100 ms on the supported-device test profile.
- Microphone grant changes the same focused control to **I'm done**; denial or
  rejection returns it to an active retry with literal existing recovery.
- Ignoring the browser permission prompt leaves a calm pending state with Back
  usable; the UI does not invent a countdown or auto-retry.
- Sound failure restores **Tap for sound** and focus. Sound success has an
  explicit logical focus hand-off and never leaves focus on `body`.
- Late completion after Back, unmount, or transport replacement causes no
  state, announcement, or focus update on the new screen.

### Layout and motion

- At 280×568, 390×844, 640×360, and 1440×900, the button box and control row
  do not shift between active and pending states; text does not clip, overlap,
  or create horizontal overflow.
- Default motion has exactly one running animation during pending.
- Reduced motion has zero running animations while retaining equivalent text,
  icon, focus, and status semantics.

### Human validation

- In each target browser/assistive-technology pair, focus remains discoverable,
  the pending state is announced at a useful time, repeated activation is a
  no-op, and success/failure has a comprehensible boundary.
- A repeated pending announcement is acceptable only if participants can
  follow it without confusion or interruption. A harmful echo blocks release.
- In direct child observation, most participants can show what is happening
  and whether they should tap again without facilitator explanation. No launch
  threshold should be invented before the study protocol and sample are fixed.

## Test matrix

| Layer | Cases | Evidence required |
| --- | --- | --- |
| Component/SSR | active and pending sound; active, pending, and listening microphone; failure and recovery | Accessible roles/names/states, exactly one status, no duplicate caption, no pending shortcut/pressed state |
| Interaction unit | click, Enter, Space, rapid mixed input, `.click()`, global Space, held resolve/reject | Exactly-once transport call; immediate pending render; UI and domain guards; focus before/after settle |
| Lifecycle unit | permission grant, deny, ignored promise, sound resolve/reject, Back/unmount, stale transport | No late mutation; recovery preserved; no artificial timer; Back remains active |
| Playwright layout | 280×568, 390×844, 640×360, 1440×900; normal and reduced motion | Stable bounding boxes, containment, no overlap/overflow, one animation normally, zero with reduction |
| Real browser/media | Safari on macOS and iOS; Chrome desktop and Android; Firefox desktop; clean profiles with autoplay blocked; real LiveKit room | Gesture-bound recovery works; permission grant/deny/ignore; focus and failure behavior; note policy/settings |
| Assistive technology | VoiceOver/Safari macOS and iOS; TalkBack/Chrome Android; NVDA with Chrome and Firefox; Switch Control or switch-style navigation; voice control | Spoken order/duplication, focus retention, `aria-disabled` announcement, unavailable shortcut, exactly-once activation, success/failure hand-off |

Automated accessibility trees and screenshots are necessary but cannot prove
spoken output, switch behavior, autoplay acceptance, physical audibility, or
child comprehension.

## Direct assistive-technology study

Treat announcement behavior as a release gate, not a best-effort follow-up.
Use the production-shaped control with held promises long enough to hear the
entire sequence. For each target browser/AT pair in the matrix:

1. Navigate to the active action by touch exploration, sequential keyboard or
   switch navigation, and the AT's normal button command.
2. Activate once, without moving focus. Record a human transcription of the
   words and state spoken, their order, and whether speech is interrupted. Do
   not infer this from an accessibility-tree snapshot.
3. Activate again during the held promise with the same command and with the
   advertised global shortcut. Confirm that no new operation starts and note
   whether the disabled state is understandable.
4. Resolve and reject in separate runs. Check focus, the next announced
   action, recovery discoverability, and whether a success hand-off interrupts
   Peppa's audio.
5. Repeat with reduced motion and at the narrow/short viewports; semantics and
   operation count must not change.

The initial candidate intentionally combines a changing focused button name
with a pending suffix in the sole live status because the button owns the
visible state while the status provides a dependable explicit announcement.
That combination is not assumed to be interoperable. If it produces a harmful
echo, compare a second candidate in which the stable status omits the pending
suffix and the focused control is the only programmatic pending owner. Ship
the latter only if every target AT makes the new button name/state discoverable
without moving focus. Do not “fix” an echo with arbitrary announcement delays,
focus churn, or another live region.

Record AT, browser, and operating-system versions, input method, exact human
transcription, operation count, focus destination, and pass/fail. Prefer notes
over audio/video capture; do not include a child's voice or account in this
technical AT study.

## Direct child and caregiver study

Run a small formative moderated study before generalizing the design:

- Recruit five-to-seven-year-old English beginners across more than one home
  language and a range of reading, motor, sensory, and communication support
  needs. Include a separate seven-to-ten comparison group. Record broad bands,
  not an age-derived ability score.
- Obtain appropriate caregiver consent, child assent, safeguarding review, and
  an accessible stop/withdraw path. A caregiver can observe but should not
  translate or coach unless that is the support condition being studied.
- Show the real device layout. Hold each pending state for about 1.5 seconds
  and 5 seconds in counterbalanced tasks, then include success and failure.
- Ask the child to point or choose a picture for “What is happening?” and
  “What do you do now?” Observe re-taps, waiting, premature speech, gaze shifts,
  distress, and recovery. Do not make reading aloud the comprehension test.
- Compare the three microphone phrases separately after the ownership design
  is understood. Watch especially whether **Get ready to talk** causes speech
  before capture begins.
- Ask caregivers whether the state appears calm, whether help was needed, and
  whether the child expected sound or recording to have already started.

Store only coded task outcomes and broad recruitment bands needed for the
question. Do not retain raw child audio, transcripts, video, screenshots,
names, device identifiers, exact birth dates, or exact home-language details
merely for this UI study. If recording is genuinely required, it needs a
separate purpose, consent, access, retention, and deletion review.

## Safety and privacy guardrails

- This presentation change adds no production telemetry, storage, vendor, or
  network request.
- Do not collect raw audio, transcripts, names, identifiers, permission-prompt
  timing, or device details to measure it.
- Do not say or imply **I can hear you**, **Sound is playing**, or equivalent
  until the relevant product evidence exists. Even fulfilled playback cannot
  prove physical output or hearing.
- Do not auto-open the microphone, auto-retry sound, or produce surprise audio
  without the child's explicit action.
- Keep Back and existing finite error recovery available. Do not trap a child
  behind a browser permission prompt.
- Avoid emotional pressure such as **Peppa is waiting**, **Peppa is sad**, or
  urgency intended to drive another tap.
- Legal, privacy, and safeguarding review remain necessary for any study or
  material change to child audio handling; this memo is not legal advice.

## Rejected alternatives

- **Keep native `disabled`.** It blocks click safely but can remove the child's
  just-used control from focus and obscures the direct action's ownership.
- **Use `aria-disabled` without authored guards.** ARIA communicates state; it
  does not stop pointer, keyboard, assistive-technology, or scripted activation.
- **Use `pointer-events: none` as the guard.** It does not cover keyboard,
  assistive-technology, global-shortcut, or programmatic activation and can
  interfere with cursor/touch targeting.
- **Move `startAudio()` into an effect or timer.** This can lose transient user
  activation and break autoplay recovery.
- **Let the status own visible busy feedback while the button stays stale.**
  The direct action under focus would not visibly acknowledge the tap.
- **Remove or remount the pending button.** This loses node identity and focus
  and can cause layout shift.
- **Repeat pending text in the caption.** It adds no content or action and
  competes with the focused control.
- **Use a spinner, color, or Peppa motion without words.** None supplies a
  complete state to low-English, low-vision, reduced-motion, or non-visual
  users.
- **Show two spinners or keep Peppa floating.** Parallel motion does not expose
  more progress and makes the action hierarchy less clear.
- **Add `aria-busy` or an assertive alert.** The status update itself is ready
  to announce, and normal pending feedback is not an urgent interruption.
- **Keep `aria-pressed` while changing the action label.** This conflicts with
  the APG toggle-button label convention and duplicates the state model.
- **Rename the first version to a stable generic Microphone toggle.** It is
  semantically viable but less literal about the child's next action; retain as
  an AT-study alternative.
- **Add a countdown, timeout, or automatic retry.** Permission can wait on the
  user indefinitely, and the client has no truthful remaining-time estimate.
- **Disable the whole screen, including Back.** It turns an ordinary browser
  prompt or media wait into a trap.
- **Play spoken status or surprise confirmation audio.** It can conflict with
  the conversation, bypass autoplay expectations, and cannot help while sound
  itself is blocked.
- **Use technical or hopeful copy.** Terms such as **autoplay**, **unmuting**,
  and **almost ready** are harder to understand or make unsupported promises.

## Implementation boundary and hand-off

Commit `8e69386` stayed within the intended presentation, semantics, guard, and
test boundary. It preserves transport calls, request and operation IDs, both
hook busy refs, permission flow, LiveKit version, and production timing. It
adds no dependency, telemetry, saved data, translation, timeout, or audio
asset.

Automated validation on 2026-08-21 passed:

- 27/27 focused component and mounted-lifecycle tests;
- 10/10 focused Chromium direct-action tests, including a measured
  click-to-pending render below 100 ms for both actions;
- 676/676 full unit, integration, lifecycle, and safety tests;
- 193/193 full Chromium browser tests;
- TypeScript and the production build; and
- lint with zero errors and two generated-file warnings.

The deterministic browser cases hold each operation pending long enough to
inspect it. They verify exactly one visible pending label and running animation,
same-node focus retention, pointer/Enter/Space/programmatic duplicate guards,
success and failure focus destinations, zero running animations with reduced
motion, stable control geometry, and no main overflow at 280×568, 390×844,
640×360, and 1440×900. They do not emulate a real browser permission prompt,
autoplay profile, media device, or assistive technology.

The paired in-app Browser evidence is in
[`artifacts/ux-review/talk-direct-action-feedback`](../../artifacts/ux-review/talk-direct-action-feedback/manifest.md).
The first after-state attempt was unavailable after the Browser binding
disconnected; a later supported session succeeded from documentation descendant
`7e3bf1d`. It captured both pending actions at 280×568, 390×844, 640×360, and
1440×900. Direct inspection confirmed one pending phrase, one spinner, a static
character, retained pending-button focus, and no main overflow. No alternate
screenshot surface or synthetic comparison was substituted. Target-browser
media interoperability, assistive-technology observation, and child/caregiver
study remain open rather than being inferred from this deterministic local
visual pass.

## Open questions and revision triggers

- Does a focused button-name change plus the atomic status produce a duplicate
  announcement in any target AT, and is it harmful in the actual task?
- Is the implemented next-action-or-caption focus hand-off the least disruptive
  result after successful sound recovery across target assistive technologies?
- Which microphone phrase is understood without prompting premature speech?
- Does one spinner improve action comprehension or only visual preference?
- Do children interpret **Sound is off** during **Starting sound** as truthful
  context or as a contradiction?

Revise or roll back the ownership split if direct testing finds repeated
activation, broken audio recovery, lost focus, harmful announcement echo,
premature speech, increased help, or lower recovery success. Preserve those
findings as a dated note rather than silently changing this recommendation.
