# First-Use Visual Hierarchy Audit

Last reviewed: 2026-08-21

Status: evidence audit; no product implementation on this branch

Base commit: `7e3bf1d`

Audience: young beginner English learners, especially approximately five to
seven years old and learners who do not yet read English independently

## Decision

The home, ready-made lesson shelf, first story shelf, story reader, and Talk
surface now have a coherent child-facing hierarchy: concrete art, a short
heading, and one obvious route or turn action. The largest remaining first-use
visual failure is the **form-based learner-profile fallback**.

At 640×360, its fully loaded setup screen puts **Set up profile** entirely below
the viewport. While the Peppa image is still loading, that same action is
temporarily visible and then moves down by 208 px when the image decodes. After
the browser scrolls to the action and the learner starts, the first question
heading is retained above the viewport while the answer controls remain in
view. At 280×568, the question is visible, but its textarea and icon-only speech
control cross the fold and **Next** is entirely below it.

The next bounded implementation should therefore be a
**learner-profile fallback viewport-stability** branch. It should reserve the
Peppa image geometry, add compact short and short-wide layouts, and reset/focus
the profile step at setup → question and acknowledgment → question boundaries.
It should not change profile data, question content, voice behavior, or the
acknowledgment policy in that same slice.

The next two independent slices should make acknowledgments child-paced and
repair normal-size white text on the pink action color. Both are documented
below rather than silently folded into a geometry branch.

## Scope and evidence method

This audit asks which remaining child-facing first-use surface has the largest
avoidable hidden action, content movement, language burden, or uncertain wait.
It covers:

- learner home;
- ready-made lesson choice and lesson introduction;
- first story choice and reader entry;
- Talk and real-time profile setup presentation;
- the form-based profile setup, question, and acknowledgment screens; and
- the first visible action and transition between those screens.

Account creation, the account menu, profile editing after onboarding, custom
lesson authoring, and the detailed AI/data dialog are grown-up surfaces and are
not ranked as child first-use choices here.

Evidence came from three layers:

1. Current React source and accessible Playwright/unit contracts at `7e3bf1d`.
2. Existing review images, inspected at their saved resolution. No new
   screenshot was created for this audit.
3. A deterministic local Chromium geometry probe using the repository's Vite
   E2E environment, accessible locators, the real profile components, and a
   mocked `experienceMode: "form"` profile payload. The probe used 280×568,
   390×844, 640×360, and 1440×900 at device scale 1. A second pass held the
   Peppa image request before allowing it to decode, so the measured movement
   has a known cause rather than being inferred from a final screenshot.

In this memo:

- **Observed** means the behavior is directly present in source, a test, a
  saved image, or the deterministic rendered probe.
- **Hypothesis** means the likely child effect still needs observation with
  the intended learners and caregivers.

The source rationale is deliberately narrow. [LANG-03 and
LANG-05](./source-register.md) support short, picture-supported tasks and
demonstrated instructions. [A11Y-01 through A11Y-04, A11Y-11, and
A11Y-12](./source-register.md) support literal words, visible labels, clear
steps, short paths, stable placement, and a manageable amount of content.
[A11Y-05](./source-register.md) supplies the normative accessibility baseline,
while [PERF-01 and PERF-02](./source-register.md) distinguish layout stability
and immediate control acknowledgment from child-comprehension evidence. None
of these sources proves that Parrot's exact art or wording works for a
five-year-old multilingual learner.

## What is already working

### Home

The home choice layer now contains 11 visible English words excluding the
product name and account control, three real route previews, and three
full-card links. The current source gives each image intrinsic dimensions and
a fixed preview container in
[`HomeMenu.tsx`](../../src/app/HomeMenu.tsx), lines 19–45 and 47–139.

Existing evidence covers the requested sizes:

- [280×568 portrait](../../artifacts/ux-review/nonreading-first-use/after-home-280x568.jpg)
- [390×844 portrait](../../artifacts/ux-review/nonreading-first-use/after-home-390x844.jpg)
- [640×360 short landscape](../../artifacts/ux-review/nonreading-first-use/after-home-640x360.jpg)
- [1280×900 desktop](../../artifacts/ux-review/nonreading-first-use/after-home-1280x900.jpg)

The rendered contract in
[`home-menu.spec.ts`](../../tests/e2e/home-menu.spec.ts), lines 3–159, requires
all three picture choices to load and remain wholly inside 280–390 px phones
and short-wide screens without page scrolling or horizontal overflow. This is
a substantially stronger first-use contract than the profile fallback has.

### Lesson choice and introduction

The ready-made lesson shelf uses the whole picture card as the start link and
keeps custom/grown-up tools below it. At 280 px the first cards form a
single-column picture-and-copy row; at 390 px they form a two-column shelf.

- [280×568 lesson shelf](../../artifacts/ux-review/repeated-talk-recovery/lesson-shelf-280x568.jpg)
- [390×844 lesson shelf](../../artifacts/ux-review/responsive-shelf-art/after-lessons-390x844.jpg)
- [640×360 integrated lesson shelf](../../artifacts/ux-review/child-first-ux-integration/lesson-shelf-640x360.jpg)

[`surrounding-pages.spec.ts`](../../tests/e2e/surrounding-pages.spec.ts), lines
165–311, checks picture size, card-wide activation, initial reachability,
desktop row geometry, scrolling, and horizontal overflow. The lesson
introduction then models **1. Listen** and **2. Talk** beside familiar icons and
one **Let's go!** action in
[`LessonPlayerUi.tsx`](../../src/lessons/LessonPlayerUi.tsx), lines 216–275.

The shelf still presents several equal lesson choices, which may be too much
choice for some supported early learners. That is a child-study hypothesis,
not the next code change: every option is reachable and its picture, phrase,
and whole-card action are already observable and tested.

### Story choice and reader

The first story shelf gives the initial story one large picture, its title, and
one visible **Listen** label. The reader keeps the picture, short line,
join-in cue, and Back/Listen/Next layer visible in portrait and short landscape.

- [390×844 first story shelf](../../artifacts/ux-review/responsive-shelf-art/after-stories-390x844.jpg)
- [390×844 reader](../../artifacts/ux-review/story-controls-short-landscape/phone-390x844.jpg)
- [640×360 reader](../../artifacts/ux-review/story-controls-short-landscape/first-use-640x360.jpg)

The existing story evidence is strong enough that another layout change would
be lower confidence than fixing the untested profile fallback.

### Talk and real-time profile setup

The current Talk component reuses one responsive grid for ordinary chat,
real-time onboarding, and profile editing. It gives those purposes distinct
headings and finish labels in
[`ConversationSurface.tsx`](../../src/conversation/ConversationSurface.tsx),
lines 103–119, while the same component owns the stable state, character,
caption, and action slots at lines 577–995.

Current automated contracts cover 280×568, 390×844, 640×360, and 1440×900,
including direct-action timing, containment, focus, and reduced motion. The
saved baseline and after-state Talk images have exact provenance in the
[`talk-direct-action-feedback` manifest](../../artifacts/ux-review/talk-direct-action-feedback/manifest.md).
The after-state frames were added by parallel evidence work during the final
audit pass and were visually inspected at all four sizes. They show one pending
phrase and spinner, a stable caption, and no obvious clipping. They support the
decision not to reopen Talk hierarchy in this branch; they are still staged
test scenarios, not child-observation evidence.

The deployed Worker setting selects real-time setup first
([`wrangler.jsonc`](../../wrangler.jsonc), line 17). The form audited below is
still a real child path: it is used when real-time setup is disabled and when a
learner leaves the onboarding conversation for its form fallback
([`LearnerProfileGate.tsx`](../../src/learner-profile/LearnerProfileGate.tsx),
lines 665–725).

## Measured profile-fallback geometry

### Fully loaded setup

The setup card uses desktop-sized `sm:` padding and a 208 px character as soon
as the viewport reaches 640 px, but it has no `short` or `short-wide` override
([`LearnerProfileGate.tsx`](../../src/learner-profile/LearnerProfileGate.tsx),
lines 297–319). The main scrollport is intentional, but the primary action is
not initially discoverable at the key short-landscape target.

| Viewport | Main client / scroll height | Setup-card height | **Set up profile** box | Fully inside viewport? |
| --- | ---: | ---: | ---: | --- |
| 280×568 | 568 / 650 px | 622 px | y 492–544 | Yes |
| 390×844 | 844 / 844 px | 540 px | y 548–600 | Yes |
| 640×360 | 360 / 692 px | 628 px | y 496–548 | **No** |
| 1440×900 | 900 / 900 px | 628 px | y 600–652 | Yes |

**Observed:** at 640×360, the first screen shows the large Peppa art and only
part of the heading before the action. The learner must scroll before any
setup/skip choice can be made.

**Hypothesis:** a young learner may interpret the character and heading as a
finished or waiting screen, especially when the English action is not visible.
The geometry proves hidden placement, not the learner's interpretation.

### Cold image movement

The setup, question, and acknowledgment Peppa images have CSS widths but no
HTML `width` or `height` attributes:

- setup: [`LearnerProfileGate.tsx`](../../src/learner-profile/LearnerProfileGate.tsx),
  lines 300–305;
- question: [`LearnerProfileQuestion.tsx`](../../src/learner-profile/LearnerProfileQuestion.tsx),
  lines 76–81; and
- acknowledgment:
  [`LearnerProfileAcknowledgment.tsx`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx),
  lines 95–104.

The shared source is a 1024×1024 WebP. Holding that request produced this setup
movement:

| Viewport | Action before decode | Action after decode | Vertical movement | Main scroll-height change |
| --- | ---: | ---: | ---: | ---: |
| 390×844 | y 476–528 | y 548–600 | +72 px | 844 → 844 px |
| 640×360 | y 288–340 | y 496–548 | **+208 px** | 484 → 692 px |

At 640×360, the primary action changes from wholly visible to wholly below the
viewport when the picture loads. The heading moves by the same 208 px. This is
directly measured content movement, not a claim derived from the missing
attributes alone.

The current home avoids this class of movement by supplying intrinsic image
dimensions. Reusing that established pattern is preferable to adding a loader
or delaying the whole screen.

### First question

The question view gives the textarea a minimum height of 112 px and all
remaining width, while the speech action is an unlabeled-on-screen 52 px-wide
icon strip that stretches to the textarea height
([`LearnerProfileQuestion.tsx`](../../src/learner-profile/LearnerProfileQuestion.tsx),
lines 97–132). The visible name exists only in `aria-label="Speak your answer"`.

With the actual first English and Chinese question:

| Viewport | Main scroll height / scroll top | Question heading | Textarea and speech action | **Next** |
| --- | ---: | ---: | ---: | ---: |
| 280×568 | 790 / 0 px | y 222–372, fully visible | y 482–612, crosses fold | y 696–748, below fold |
| 640×360 after activating the off-screen Start | 602 / 242 px | y -98–-8, **above viewport** | y 78–208, fully visible | y 232–284, fully visible |

The 640 px result includes the browser scrolling to the off-screen Start action
before activation. The profile scrollport retains that position when the
question replaces the setup card; it does not return the learner to the new
question. A touch user's exact scroll offset can differ, but the component has
no step-boundary reset or local focus lifecycle.

At 390×844 and 1440×900, the complete question card fits. This is therefore a
short-viewport defect, not evidence that the component always fails.

The only end-to-end setup browser case currently uses 320×568 and checks that
the heading and two buttons are Playwright-visible
([`surrounding-pages.spec.ts`](../../tests/e2e/surrounding-pages.spec.ts), lines
617–671). It does not check complete boxes, cold image movement, the question,
the acknowledgment, 280 px, short landscape, or desktop. The static tests in
[`learner-profile-ui.test.mjs`](../../tests/learner-profile-ui.test.mjs), lines
98–160 and 923–952, verify content and branches but cannot catch geometry.

## Ranked unresolved opportunities

### 1. High — keep profile context and the first action in view

**Observation:** the loaded 640×360 setup action is below the viewport; its
cold-load position moves by 208 px; the first question retains a scroll offset
that leaves its heading above the viewport; and the 280×568 **Next** action is
below the initial fold.

**Hypothesis:** this is more likely to stop an early learner than the remaining
choice density on the already picture-led shelves, because there is no visible
alternative action or meaning-bearing task while the setup control is hidden.

This ranks first because it is a reproducible task-boundary failure with a
small, reversible presentation fix.

### 2. High — let the learner control acknowledgment timing

Each saved form answer replaces the question with a Peppa acknowledgment and a
visible **Next** action. The same screen also advances without that action:

- audio `ended` calls `onNext`;
- audio `error` calls `onNext`;
- a rejected `play()` promise calls `onNext`; and
- missing or unusable audio schedules `onNext` after 1,800 ms.

That behavior is explicit in
[`LearnerProfileAcknowledgment.tsx`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx),
lines 15–74 and 77–112. The tests intentionally encode both audio-end advance
and timed no-audio advance in
[`learner-profile-ui.test.mjs`](../../tests/learner-profile-ui.test.mjs), lines
244–325. Calling the fallback interval “readable” in a test name does not
establish readability for a young multilingual learner.

**Observation:** the visible Next button is not the sole owner of advancement,
and a blocked/rejected playback attempt can remove the screen immediately.

**Hypothesis:** a child who needs longer to connect the spoken praise, picture,
and next step can lose the message or be moved into a new question before
orienting. Automatic flow may feel conversational to some learners, so direct
observation should compare it with explicit advancement; it should not be
treated as validated merely because it is fast.

The bounded follow-up should make audio feedback independent from navigation:
play or fail safely, then remain until **Next** is activated. That work should
also hand focus to the next question heading because the pathname does not
change and [`RouteFocusManager.tsx`](../../src/app/RouteFocusManager.tsx), lines
8–24, will not run again.

### 3. High — repair normal-size white text on pink

The shared default action treatment is white text on `#ff467b`
([`styles.css`](../../src/styles.css), lines 4–12, and
[`ui.tsx`](../../src/shared/ui.tsx), lines 58–130). Using the WCAG relative
luminance formula, that pair is **3.27:1** at rest. White on the existing
`#d62f70` rose token is **4.67:1**.

The 3.27:1 pair is sufficient for a non-text icon's 3:1 requirement, but not
for normal-size text's 4.5:1 requirement. Affected first-use examples include:

- **Set up profile**;
- question and acknowledgment **Next**;
- the story-shelf **Listen** label at `text-base` in
  [`StoryList.tsx`](../../src/stories/StoryList.tsx), lines 108–120; and
- other shared default-size action labels.

This is a token/source calculation, not screenshot color sampling. It does not
measure display calibration or hover filtering. It is nevertheless a concrete
rest-state contrast defect, not a child-comprehension hypothesis. Use a
contrast-safe action token or the existing rose for text-bearing controls,
then test computed foreground/background colors rather than Tailwind classes.

### 4. Medium-high — make speaking a visible, primary answer path

The form question correctly provides bilingual text, saved English audio, a
replay action, speech transcription, and an editable fallback. Those are
useful capabilities. Their visual order, however, says **type first**:

- the textarea owns most of the card's answer area;
- **Your answer** labels the textarea;
- the microphone has no visible words;
- recording lasts a fixed 4.2 seconds in
  [`speech-recorder.ts`](../../src/media/speech-recorder.ts), lines 1 and
  205–314;
- recording and transcription add a status row below the textarea; and
- saving shows **Peppa is thinking…** both in that row and on the disabled
  submit action
  ([`LearnerProfileQuestion.tsx`](../../src/learner-profile/LearnerProfileQuestion.tsx),
  lines 134–173).

**Observation:** the interface devotes substantially more visible width to
typing than speech and relies on an icon-only child action. The tests require
the textarea through every status and check only the speech action's accessible
name ([`learner-profile-ui.test.mjs`](../../tests/learner-profile-ui.test.mjs),
lines 98–132).

**Hypothesis:** a pre-reader or learner who cannot type English may not identify
the intended voice path or know that recording stops automatically. An
emerging reader aged approximately 7–10 may value the editable transcript, so
the answer is not to delete typing. A later bounded hierarchy change should
give speech a visible label such as **Tap, then speak**, keep one in-place
listening/writing state, and demote typing to an explicit alternative. Age must
not be used as a proxy for whether the learner can type English.

### 5. Medium — simplify setup language and nonessential motion

Excluding the account control, the form setup entry contains 30 visible English
words: a six-word heading, an 18-word explanation, and two three-word actions.
It uses the abstract terms **personalize** and **profile** before the bilingual
questions begin. The generic waving Peppa picture establishes character but
does not show what information will be asked for. Unlike the questions, this
entry has no Chinese line or explicit audio.

**Hypothesis:** the pink primary action and Peppa picture may still be enough
for some children to start, but a low-English learner cannot recover the
purpose, duration, or skip meaning from the text alone. A later copy study
should compare one literal child sentence plus a visible grown-up route with
the current explanation; shortening must not hide that setup asks for profile
information.

The Peppa image also runs the 2.8-second `animate-float` loop indefinitely on
setup, question, and acknowledgment screens. The deterministic probe found one
persistent animation after transition activity settled at every reviewed
size. Reduced-motion CSS stops it, but there is no ordinary pause control
([`styles.css`](../../src/styles.css), lines 20–31 and 192–200). [A11Y-09](./source-register.md)
supports removing nonessential indefinite motion beside reading/form content.
Static profile-form Peppa is the lower-risk default unless child observation
shows a comprehension purpose for the loop.

### 6. Research-only — validate lesson choice density before redesigning it

The 390×844 lesson shelf shows four complete cards and part of the next row.
Each card contains art, title, a target phrase, part count, and a play symbol.
This is visibly denser than the one-card-at-a-time story entry. It may increase
decision effort for supported early learners, while older or more independent
beginners may prefer the choice.

The present layout remains reachable, picture-led, and strongly tested. Do not
hide lessons or invent an automatic recommendation without child/caregiver
evidence. First measure whether learners can select a lesson, describe what
they expect to do, and recover from a mistaken choice.

## Recommended bounded implementation

Suggested branch: `codex/profile-fallback-viewport-stability`

Suggested base: `codex/first-use-ux-audit` after this memo

### Hypothesis

If the profile fallback reserves its character geometry, uses a compact layout
for short screens, and restores the new step's visual/focus origin, then the
learner will always see the setup action or current question before being asked
to scroll, without changing the profile flow.

### Product changes

1. Add the source image's intrinsic `width={1024}` and `height={1024}` to the
   setup, question, and acknowledgment images. Keep their responsive CSS size;
   do not add a blocking image loader.
2. Add explicit `short` and `short-wide` presentation to the existing profile
   components:
   - compact the setup image, gaps, and padding;
   - use the available horizontal space at 640×360 instead of applying the
     tall `sm:` composition;
   - keep the question prompt beside a smaller character in short landscape;
   - reduce only empty space and illustration size before reducing child text;
     and
   - keep setup, skip, answer, and acknowledgment actions at least 44×44 px.
3. On setup → question, question → acknowledgment, and acknowledgment → next
   question, reset the profile-owned scrollport to the top and move focus to
   the new heading. Do not rely on a route-path effect because the pathname is
   unchanged.
4. Preserve current copy, question order, bilingual prompt, saved audio,
   transcription, skip behavior, API contracts, and acknowledgment
   auto-advance in this branch. Those boundaries keep the first change
   reviewable; the timing policy remains the next independent behavior slice.

### Rendered acceptance contract

Use accessible Playwright locators and rendered boxes, not source-class
assertions. At 280×568, 390×844, 640×360, and 1440×900:

- delay the Peppa response, then require heading/action geometry to change by
  no more than 1 px when it decodes;
- require **Set up profile** and **Skip for now** to be wholly visible at
  scroll position zero;
- activate setup without `scrollIntoViewIfNeeded()` and require the new
  question heading plus the complete answer entry to be visible;
- require the new heading to own focus and the profile scrollport to begin at
  zero;
- progress through one acknowledgment and require the next question heading
  to be visible/focused rather than above the viewport;
- require no document-level horizontal overflow or overlap with the account
  control; and
- retain complete keyboard activation, accessible names, and a 44 px target
  floor.

The focused suite belongs in a dedicated profile-first-use browser file or a
clearly isolated section of `surrounding-pages.spec.ts`. The existing static
profile tests should add the intrinsic image attributes and semantic content
contract, but responsive behavior must remain a browser assertion.

### Retain, revise, or reject

- **Retain** if every first action and new-step heading is stable at the four
  targets with no data/voice behavior change.
- **Revise** if long valid translated prompts need a scrollable content area;
  keep the current question and primary answer action together rather than
  shrinking the text.
- **Reject** a layout that merely auto-scrolls to a button while leaving the
  question above the viewport, or that hides the skip route to make the card
  fit.

## Follow-up order after the bounded branch

1. **Child-paced acknowledgment:** audio completion/error must not navigate;
   explicit Next advances once and focuses the next step.
2. **Contrast-safe child actions:** replace normal-size white-on-pink text with
   a ≥4.5:1 treatment across setup, stories, and shared controls.
3. **Voice-first form hierarchy:** add a visible speech label and one stable
   record/transcribe state while retaining editable typing as an alternative.
4. **Copy and motion study:** test a shorter setup explanation, grown-up cue,
   and static Peppa with early learners and emerging readers.
5. **Direct observation:** compare unprompted task starts and recovery on home,
   lessons, stories, Talk, and profile fallback; do not optimize for taps or
   session length.

## Limitations

- No child, caregiver, teacher, speech-language professional, or accessibility
  practitioner participated in this audit.
- The rendered probe used headless Chromium, deterministic data, device scale
  1, and no browser chrome or safe-area inset. It establishes DOM geometry, not
  real-device behavior or child comprehension.
- The form mode is a fallback in the current deployed configuration, not every
  learner's first profile experience. A fallback still needs to work when the
  real-time path is unavailable or declined.
- No profile screenshot exists in the current artifact set. The memo records
  exact rendered boxes but does not present an invented visual comparison.
- Talk after-state screenshots exercise deterministic delayed actions rather
  than real autoplay recovery, microphone permission, or transport latency.
- The delayed-image probe isolates one real movement cause but is not a field
  CLS sample, network benchmark, or low-memory-device measurement.
- Contrast ratios are calculated from declared rest-state colors. They do not
  cover every opacity, antialiasing, hover, pressed, disabled, or display state.
- VoiceOver, TalkBack, NVDA, switch input, 200% zoom, increased text spacing,
  localization beyond the current Chinese prompts, target-browser media
  permissions, and real acknowledgment audio duration remain untested.
- The planning ranges of approximately 4–6 and 7–10 describe research cohorts,
  not capability rules. Reading, typing, speaking, attention, motor control,
  home language, and support needs must be checked separately.

## Hand-off record

```text
Branch: codex/first-use-ux-audit
Base branch / dependency: codex/talk-direct-action-feedback documentation hand-off 7e3bf1d
Evidence: this memo only; no product or test change
Observed: profile fallback setup action falls below 640x360 after a 208px cold-image shift; the first question loses its heading after retained scrolling; acknowledgment navigation is owned by audio/timer as well as Next; white on the default pink action token is 3.27:1
Hypothesis: stable short-viewport profile steps will reduce first-use uncertainty more reliably than another shelf redesign
Recommended next branch: codex/profile-fallback-viewport-stability
Not changed: UI, profile flow, copy, audio, API, persistence, telemetry, dependencies, or screenshots
Validation for this memo: current-source inspection, existing-artifact review, deterministic four-viewport Chromium geometry probes, declared-color contrast calculation, git diff --check, and local Markdown target check
Limits: no direct child/caregiver/AT/real-device evidence and no new screenshot
Next question: After viewport stability, can explicit child-paced acknowledgment preserve conversational warmth without timed navigation or extra live-region noise?
```
