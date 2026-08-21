# Repeated Talk Failure: Picture-Led Lesson Fallback

Last reviewed: 2026-08-21

Branch: `codex/repeated-talk-recovery`

Base: `ee5ba00` (`codex/talk-wait-recovery-message` documentation hand-off)

Implementation commit: `d48c38f`

Status: implemented and independently audited; not child-tested

## Question and scope

After **two consecutive finite Talk to Peppa failures**, what should a young
multilingual learner who may not read English independently see and be able to
do?

This memo covers the child-facing recovery after the existing finite
start/reply/reconnect boundary. It does not redesign ordinary waiting, add an
offline mode, add typed AI chat, choose a production analytics sink, or claim
that the exact threshold or copy is established by research.

Here, **consecutive** means that no current assistant response signal to a
learner turn occurred between the two failures. An opening greeting and merely
reaching **Your turn** do not reset the sequence. Leaving the route or receiving
that response signal does. Repeat-audio and finish failures are different tasks
and do not increment it. The signal means that the transport produced a Peppa
response; it does not prove that the child heard it.

## Recommendation

After the first failure, retain one implemented retry: **Try again** after an
immediate error or **Try chat again** after a timed boundary.
After the second consecutive failure, stop making the same remote action the
only way forward. Keep the truthful phase result, but replace retry with one
picture-supported route to the existing lesson shelf:

| Element | Second-failure presentation |
| --- | --- |
| Status | **Chat paused** |
| Result | Keep the phase-specific result, such as **Peppa did not answer.** |
| Main visual | The same ready-made lesson cover used for **Play a lesson** on Home, with a familiar Play mark |
| Primary action | **Play a lesson** → `/lessons` |
| Exit | Existing header **Back** |
| Busy motion | None |

Do not auto-open a lesson, auto-play an explanation, or show another competing
button beside the primary action. Back already preserves the choice to leave,
and a learner can choose Talk to Peppa again from Home later.

This is the smallest implementable hypothesis because Parrot already has all
of the destination pieces:

- Home uses the exact label **Play a lesson**, a Play icon, and
  `01-peppas-high-ball-384.webp`/responsive variants to introduce `/lessons`;
- the lesson shelf is picture-led and keeps ready-made lessons usable even if
  the optional My Lessons request fails; and
- lesson microphone and speech-check failures already offer the unscored
  **Done** path, so a live conversation service is not the only way to continue
  practising.

Call this a **non-live-chat fallback**, not an offline fallback. Saved lesson
audio and images may still need a successful asset request if they are not
cached.

## What the evidence supports

The evidence supports the direction, not Parrot's exact second-attempt rule,
words, art, or route.

| Evidence | Supported direction | Important limit |
| --- | --- | --- |
| W3C COGA [Use clear words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/) and [Keep text succinct](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p05-succinct-text/), published 2021 / UI 2022, accessed 2026-08-21 | Use common words in errors and one idea per short sentence | Supplemental cognitive-accessibility guidance, not a child comprehension study |
| W3C COGA [Provide feedback](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p10-status-feedback/) and [Clearly identify controls](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p05-clear-controls/), published 2021 / UI 2022, accessed 2026-08-21 | Keep a recognizable result and a large, visibly labelled action | Does not choose the number of attempts or validate Parrot's icon |
| GOV.UK Design System, [There is a problem with the service pages](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/), accessed 2026-08-21 | Use concise, non-technical failure copy and link to another service when it can achieve the user's goal | Public-service guidance based on a five-adult-user test; not a child learning trial |
| US Office of Head Start, [Visual Supports](https://headstart.gov/children-disabilities/article/visual-supports) and [Supporting Transitions Both Big and Small](https://headstart.gov/publication/supporting-transitions-both-big-small), accessed 2026-08-21 | Pictures can help young children understand what to do and what happens next; visual cues are especially useful when dual-language learners cannot rely on language alone | Early-learning practitioner guidance, not evidence for a particular app card or transition |
| CAST, [Universal Design for Learning Guidelines 3.0: Action & Expression](https://udlguidelines.cast.org/action-expression/) and [vary methods for response](https://udlguidelines.cast.org/action-expression/interaction/response-navigation-movement/), 2024, accessed 2026-08-21 | No single response or communication mode works for every learner; offer a viable way to continue that does not depend on live voice | A voluntary education framework, not WCAG conformance or Parrot efficacy evidence |
| UNICEF Innocenti, [Responsible Innovation in Technology for Children](https://www.unicef.org/innocenti/projects/responsible-innovation-technology-children), phase 2 report 2024, accessed 2026-08-21 | Preserve agency, choice, competence, and access rather than trapping the child in a failing loop | Most participants were 6–13 and the subject was digital play, not a five-year-old's AI error recovery |
| NAEYC, [Developmentally Appropriate Practice core considerations](https://www.naeyc.org/resources/position-statements/dap/core-considerations), 2020, accessed 2026-08-21 | Consider development, individual characteristics, language, culture, and context together | Broad birth-through-eight educational guidance, not an interface prescription |
| UNICEF Innocenti, [Children's best interests in digital policy and practice](https://www.unicef.org/innocenti/reports/childrens-best-interests-digital-policy-and-practice), April 2026, accessed 2026-08-21 | Validate the inference with children across cultures instead of treating adult judgment as sufficient | Consultation findings are broad and do not test Parrot's proposed state |

The W3C WCAG 2.2 [Consistent Help explanation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html)
uses a three-unsatisfactory-attempt chatbot example. It is not evidence for
Parrot's threshold: that example concerns finding human support, and Talk to
Peppa is a learning activity rather than a support chatbot. **Two** remains a
product hypothesis chosen to bound repetition after one explicit retry.

## Parrot inference and state contract

The following is a product proposal, not a source finding.

1. Count a child-visible terminal Talk failure when recovery would otherwise
   restart the whole chat. Include bounded connecting, reply, and reconnect
   failures; include an immediate start/transport failure only if its copy can
   be separated from the first-retry instruction.
2. Keep the first terminal state unchanged: truthful phase result, static sad
   Peppa cue, and **Try chat again**.
3. Reset the count only after a current assistant speech/transcription signal
   arrives while the runtime is awaiting a response to the learner, or after
   the learner leaves the Talk route. An opening greeting and reaching **Your
   turn** do not reset it. This transport signal is not proof of audible output.
4. On the second consecutive terminal state, retain its phase result and
   **Chat paused**, but show the static lesson-cover cue and **Play a lesson**
   in the same reserved figure/control regions.
5. Activating **Play a lesson** must synchronously invalidate the current
   operation, detach pending starts, release the local conversation claim, and
   initiate exactly-once retirement before navigating to `/lessons`. The
   network retirement may settle after navigation. The action must not create
   an AI lesson, start audio, or choose content without another learner action.
6. Keep the counter in memory for the current route visit. Do not persist,
   transmit, or associate it with the learner profile.

Phase-specific result text should remain literal:

| Failed phase | Result to retain on the second failure |
| --- | --- |
| Start / connect | **Peppa cannot talk now.** or **The chat did not start.** |
| Reply wait | **Peppa did not answer.** |
| Reconnect | **The chat stopped.** |

If immediate-error copy currently says **Tap Try again**, remove that action
sentence only in the alternative state. Never tell the child to tap a control
that is no longer present.

## Visual, language, accessibility, and timing requirements

- Reuse the exact lesson cover/action mapping from Home rather than inventing
  a new help symbol. Familiarity is the hypothesis; recognition still needs
  observation.
- Keep one visible action label. The picture and Play icon support the label;
  neither replaces it, and color is not the only cue.
- Keep the result and action in the existing stable caption/control slots. Do
  not add a modal, toast, countdown, expanding diagnostic panel, or layout
  jump.
- Use a static visual. The terminal state must have no spinner, pulse, or
  character float, including without relying on reduced-motion preference.
- Preserve at least the current 44 CSS pixel child target and containment at
  280×568, 390×844, and 640×360.
- Keep the mounted polite atomic status and announce one boundary, for example
  **Chat paused. Peppa did not answer. Play a lesson.** Do not move focus merely
  because the timer ended and do not use `aria-busy` on the status.
- When the child taps the action, paint pressed/navigation feedback in the
  immediate interaction frame. The fallback must not add another wait before
  acknowledging the tap.
- Do not translate from an inferred home language in this slice. A wrong or
  unreviewed translation can add confusion. Test the picture/copy first, then
  study optional, grown-up-selected language support separately.

## Rejected alternatives

- **Keep offering only Try chat again.** Rejected because the product already
  observed the same bounded failure after an explicit retry; another identical
  dominant action creates a loop without preserving the learning goal.
- **Auto-open the first lesson.** Rejected because a failure should not choose
  a new activity for the child. It also makes the cover a transition notice
  rather than a meaningful choice.
- **Show Try chat again and Play a lesson side by side.** Rejected for the
  smallest slice because it restores competing controls on the 280 px layout.
  Back already supplies an escape and a later retry route.
- **Add typed chat.** Rejected because it assumes reading and writing, adds a
  new child-content/data path, and requires a separate AI safety evaluation.
- **Use Story time as the only fallback.** Rejected because a ready-made lesson
  better preserves the active language-practice goal. Story time can remain a
  choice from Home.
- **Make Ask a grown-up the only path.** Rejected because it blocks a usable
  independent learning route and Parrot has no concrete support surface to
  offer. Grown-up help should become available if the lesson path also cannot
  run, but that is a separate design.
- **Say the internet is off, promise Try later, or show a countdown.** Rejected
  because the client does not know the cause or restoration time.
- **Auto-play a spoken error.** Rejected because output may also be unavailable
  and surprise audio is not required to make the picture-led action usable.

## Evaluation plan

### Automated and visual contract before a child study

- deterministically force two consecutive failures across start, reply, and
  reconnect paths, including mixed failure types;
- prove one successful Peppa response resets the count, while **Your turn**
  alone does not;
- require the first terminal state to offer **Try chat again** and the second
  to offer only **Play a lesson** in the control row, with header Back intact;
- prove the previous conversation is retired once and `/lessons` opens without
  starting audio or making a new AI request;
- check the exact polite status, keyboard activation/focus, reduced motion,
  44 px target, overlap, viewport containment, and outer scroll; and
- capture 280×568, 390×844, and 640×360 screenshots for first failure, second
  failure, and the resulting lesson shelf.

### Formative child/caregiver study

Run a consented, safeguarded formative study with roughly six to eight
child/caregiver pairs. Include early learners around five to seven, more than
one home language, varied reading confidence, and relevant access needs. Use
interpreters or a caregiver's home language; English answers are not a study
requirement.

Use deterministic simulated failures and a demo account:

1. Let the child start Talk to Peppa and encounter the existing first failure.
2. Ask them to show, not necessarily say in English, what they think they can
   do. Let them choose retry.
3. Simulate the second failure. Ask again without translating the UI first.
4. Observe whether they identify and activate the lesson path, understand that
   the activity will change, and can start a ready-made lesson.
5. Ask the caregiver what they believe happened and whether the screen blames
   the child, promises something untrue, or needs an adult-help route.

Record only task outcome, first selected action, mis-taps, adult prompt or
translation needed, child/caregiver interpretation, and researcher-noted signs
of confusion or distress. Treat this as formative evidence, not a percentage
claim about all children. Stop the task if the child is frustrated; do not
manufacture a third failure for engagement.

Retain the hypothesis only if children can discover the lesson action from the
combined picture, label, and layout without being told where to tap, and they
understand that it changes activities. Revise if the cover looks like Peppa has
answered, if children keep searching for retry, if the shelf adds a confusing
extra step, or if caregivers consistently need to translate. Roll back if the
alternative can strand the child more often than the existing Back route.

Do not use time-on-app, repeated taps, or lesson starts as engagement goals.
If response time is recorded during local/study testing, measure only the
second boundary-to-visible-action and action-to-route-paint intervals.

## Safety and privacy constraints

- Do not record child audio, transcripts, names, identifiers, home language,
  screenshots, or video merely to evaluate this fallback.
- Obtain appropriate caregiver consent, child assent, safeguarding review, and
  an approved retention/deletion plan before collecting study media or direct
  quotes. Prefer facilitator-coded notes when sufficient.
- Do not enable a production event sink for this experiment. A later field
  event would require a separate review of purpose, notice/consent, processor,
  network metadata, aggregation, retention, and deletion.
- Never frame failure as the child's speaking mistake. Avoid **Try harder**,
  **Peppa is sad**, relationship pressure, or a prompt to stay longer.
- The fallback creates no new AI request and must not claim that a lesson is
  offline, that progress was saved, or that a child was heard.

## Implemented result and verification

The implementation follows the recommendation with a session-only
`voiceRetryUsed` state/ref pair and an explicit `restart` versus `finish`
recovery phase. The cap applies only to ordinary Talk to Peppa. Onboarding and
profile editing retain reusable voice recovery; lifecycle tests prove a third
activation still starts a third request in both flows.

The first Talk failure keeps one matching retry. If that retry also reaches a
bounded connect/reply/reconnect failure before Peppa responds to a learner turn,
the same reserved presentation regions show:

- **Chat paused** in the polite atomic status;
- the literal phase result in the caption;
- the shared ready-made lesson cover as a static cue; and
- one **Play a lesson** action, with persistent header **Back**.

The cover deliberately has no button-like badge because only the labelled
action is interactive. The action uses the darker shared lesson rose; measured
white-text contrast is 4.667:1 at rest and 4.555:1 in rendered hover/active
states. The small caption label is also at least 4.54:1 in the reviewed target
backgrounds. The terminal view has no spinner, character float, pulse, alert,
or `aria-busy` state.

The change also fixes an adjacent failure-action mismatch: a failed Finish now
offers only **Finish chat again** (or the purpose-specific equivalent), not a
restart button beside Finish. A failed Finish followed by a successful Finish
is covered through completion.

Validation on the implementation commit:

- 674/674 unit, integration, lifecycle, and safety tests passed across 90
  suites;
- 182/182 Chromium browser tests passed, including repeated immediate failure
  at 280×568, 390×844, and 640×360, timed connect and reply boundaries, exact
  live-status text, reduced motion, 44 px minimum action height, containment,
  route navigation, and destination-heading focus;
- TypeScript and the production build passed; the built core was 494.04 kB raw
  / 149.29 kB gzip and `ConversationSurface` was 17.45 kB raw / 5.68 kB gzip;
- lint passed with zero errors and the same two generated declaration warnings;
- 196/196 local links across 29 research Markdown files and all five JPEG
  types/dimensions passed; and
- three independent read-only audits found and verified fixes for the
  profile-flow retry regression, false Play affordance, and rest/hover/active
  contrast before reporting no remaining blocker.

Reviewed local Chromium evidence:

- [first failure at 280×568](../../artifacts/ux-review/repeated-talk-recovery/first-failure-280x568.jpg)
- [second failure at 280×568](../../artifacts/ux-review/repeated-talk-recovery/second-failure-280x568.jpg)
- [second failure at 390×844](../../artifacts/ux-review/repeated-talk-recovery/second-failure-390x844.jpg)
- [second failure at 640×360](../../artifacts/ux-review/repeated-talk-recovery/second-failure-640x360.jpg)
- [resulting lesson shelf at 280×568](../../artifacts/ux-review/repeated-talk-recovery/lesson-shelf-280x568.jpg)

These are deterministic mock-transport screenshots, not evidence about real
LiveKit reliability, a target screen reader, physical-device safe areas, or
child comprehension. The second-failure threshold and the particular cover,
copy, and shelf destination remain reversible hypotheses pending the formative
study above.

### Implementation hand-off

```text
Branch: codex/repeated-talk-recovery
Base branch / dependency: codex/talk-wait-recovery-message documentation hand-off ee5ba00
Implementation commit: d48c38f
Hypothesis: after one explicit voice retry also fails, one familiar picture-led lesson route preserves the learning goal better than another identical retry loop
Changed: small-chat-only session retry budget; current learner-reply response reset; explicit restart/finish recovery phases; picture-led Play a lesson fallback; shared Home lesson mapping; matching Finish retry; cleanup-before-navigation; rose contrast and caption-label contrast; responsive, focus, motion, live-region, race, and purpose-isolation contracts; five screenshots
Not changed: retry threshold research status; AI/LiveKit provider behavior; server APIs or persistence; production telemetry; localization; automatic lesson choice or playback; onboarding/profile retry budget; child audio or transcript collection
Tests: 674/674 unit/integration/lifecycle/safety tests; 182/182 Chromium tests; TypeScript, production build, diff checks, 196/196 local links across 29 research Markdown files, and JPEG integrity passed; lint 0 errors with 2 existing generated-file warnings
Screenshots: five JPEGs in artifacts/ux-review/repeated-talk-recovery at 280x568, 390x844, and 640x360
Measured result: first failure exposes one retry; second consecutive small-chat failure exposes one static Play a lesson route; exact live status and destination focus are preserved; 44 px floor, containment, zero terminal animation, and >=4.5:1 action/label contrast hold at reviewed targets; stale/hung starts are detached and retired without blocking navigation; onboarding/profile retries stay reusable
Risks / limitations: deterministic mocks and Chromium only; response signal is not proof of audible output; server retirement may finish after navigation; threshold, picture comprehension, language, target assistive technology, real networks/devices, and direct child/caregiver outcomes remain untested
Retain, revise, or reject: retain as a bounded reversible recovery hypothesis; revise after the documented child/caregiver study
Next question: Can Talk show one child-facing state at a time without duplicate text, multiple spinners, or unnecessary character motion?
```

## Open questions

- Is the familiar lesson cover sufficient for a learner who has not yet seen
  Home, or should the action itself contain a compact thumbnail?
- Does navigating to the shelf preserve agency, or does one more choice make a
  direct ready-made lesson preferable for the youngest learners?
- Should a third failure on the next route expose concrete grown-up help, and
  what useful help can Parrot truthfully provide?
- For older beginners, would a respectful text-choice practice mode add value,
  or would it change the activity and safety boundary too much?
