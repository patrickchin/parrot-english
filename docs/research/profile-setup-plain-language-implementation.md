# Profile setup plain-language implementation

Status: implemented and provisionally retained

Branch: `codex/profile-setup-plain-language`

Base: `codex/profile-heading-reading-cue` documentation hand-off at `eaaff12`

Research commit: `fb17e6e`

Language-contract commit: `7d88707`

Initial implementation commit: `cec4860`

Review hardening: `a10e839`, `0c8df94`

Review date: 2026-08-24

## Outcome

The form-profile gate now starts with the literal task **Answer 6 questions**,
the primary action **Start questions**, and two short facts: **We save your
answers. A grown-up can change your name and age.** The count comes from the
loaded questionnaire rather than a hard-coded production number.

An interrupted setup no longer pretends to be new. After one saved answer it
says **Answer 5 more questions** and **Continue questions**; the remaining count
and singular/plural grammar come from `progress.total` and
`progress.answered`. **Skip for now** remains unchanged.

Two short meaning units stay visually intact when the explanation wraps: **A
grown-up** and **name and age**. Their normal spaces and reading order are
unchanged.

The fresh state contains 20 visible instructional/action words instead of 30,
a 33% reduction. More importantly, it removes **quick**, **personalize**,
**Learner profile**, and **get to know you**. It replaces a timing promise,
product jargon, and relationship framing with a literal action and a bounded
saved-data statement.

The change adds no new dependency, request, timer, motion, sound, route, data
field, persistence behavior, question, or Tab stop. It preserves the existing
art, card primitives, heading focus lifecycle and reading-position cue, action
order, and optional exit.

## Reproduced baseline

The previous gate asked the child to **Help Peppa get to know you**, described
**a few quick questions to personalize chats and lessons**, referred to the
internal **Learner profile**, and offered **Set up profile**. At 280x568 this
produced a three-line heading, five-line explanation, and approximately
464-pixel-high card before the child reached the clearer one-question-at-a-time
bilingual flow.

The baseline also used the same fresh-start copy after an interrupted setup.
A profile with one of six answers saved returned to **Set up profile**, gave no
remaining count, and then opened directly on question 2.

The evidence, source mapping, rejected options, and exact acceptance contract
are in the [guidance memo](./profile-setup-plain-language-guidance.md).

## Truthfulness correction

The first implementation draft said answers were saved **for chats and
lessons** and that a grown-up could change the answers. Independent code and
accessibility reviewers checked that sentence against the actual data paths and
rejected it.

All six form responses are persisted, but current chat startup receives only
name, age, and the separately edited About description. Current generated
lessons receive the learner name. The grown-up editor directly exposes name,
age, and About, not the four saved preference responses. Expanding data use or
editing merely to make the draft sentence true would have been the wrong fix.

The retained sentence therefore claims only what the repository supports:
answers are saved, and a grown-up can change name and age. The collection of
four preference responses that current chat and lesson paths do not consume is
now an explicit data-minimization/product follow-up.

## Implemented boundary

`LearnerProfileSetupView` receives the loaded answered and total counts. It
derives a fresh/resumed presentation without new state:

- zero answered: **Answer _n_ question(s)** and **Start questions**;
- one or more answered: **Answer _n_ more question(s)** and **Continue
  questions**; and
- both states: the same exact saved-data sentence and **Skip for now**.

The deterministic viewport fixture now reads all six question texts and
translations from the versioned production questionnaire instead of copying a
single prompt into `src`. Its completed editor response is coherent at 6/6 and
contains six snapshots. A separate one-answer state renders the resume
contract. Audio transport and timing remain stubbed, so the fixture is described
as production-copy, not full production runtime.

## Test-first and review evidence

The initial exact-copy unit contracts failed against the unchanged gate before
production code was edited, then passed with the first candidate. Review drove
two additional red/green corrections:

1. An exact sentence contract failed against the unsupported chats/lessons and
   all-answers-editable promise, then passed after the sentence was narrowed.
2. A one-answer resume contract failed because the gate still rendered
   **Answer 6 questions** and **Start questions**. It passed after answered
   progress became presentation input; a five-answer case separately protects
   **Answer 1 more question** singular grammar.
3. Final visual review found **A** stranded from **grown-up** at 280x568 and
   **age.** alone at 1440x900. A rendered phrase-line contract failed before the
   two meaning units were grouped, then passed without changing the sentence.

Rendered Playwright coverage now exercises fresh and resumed setup at 280x568,
390x844, 640x360, and 1440x900. It checks exact accessible names, initial
heading focus, first-Tab ownership, 44x44 minimum targets, account clearance on
the setup card, containment, zero horizontal overflow, and the unchanged
secondary action. The existing multi-step suite continues through the exact
production bilingual first prompt, acknowledgment, and question 2. Delayed-art
and reduced-motion geometry coverage remains intact.

The fixture initially placed literal Mandarin characters in `src`, which the
English-only shipped-UI guard correctly rejected. Reading the checked-in
questionnaire instead keeps translations in their versioned content boundary,
and the guard passes without weakening it.

The first final Chromium run passed 284/285. The only failure was an inherited
focus/blur equality helper observing the intentionally floating profile art at
y=99.99 and y=100. A 20-run parallel reproduction still failed 3/20 after the
animation was paused, always by exactly 0.01 CSS pixel on transformed art. The
retained helper pauses document animations, permits at most 0.02 pixel on only
that art-y comparison, and keeps every other scene rectangle exact. The case
then passed 20/20 and the full suite passed 285/285. This changes no product
motion or geometry.

## Timing and visual evidence

This branch changes synchronous rendering only. It adds no asynchronous work or
feedback boundary, so no latency benchmark would be meaningful. The heading
focus cue is present after the existing one-animation-frame hand-off, and the
next Tab reaches the visible primary action as before.

Ten uncropped genuine in-app Browser JPEGs compare the old and retained setup
at 280x568, 640x360, and 1440x900, then cover resume and the exact bilingual
first prompt. At 280x568, the fresh card falls from approximately 464 to 382 CSS
pixels and moves from y=52…515 to y=93…475. The retained heading wraps to two
lines and the explanation to three. The 280-pixel resume card is 412 pixels
high; its three-line heading and approximately 206x52 **Continue questions**
action remain complete. At 640x360 and 1440x900, both hierarchy and actions
remain contained without scrolling or horizontal overflow.

The [artifact manifest](../../artifacts/ux-review/profile-setup-plain-language/manifest.md)
contains all images, dimensions, state and geometry notes, capture provenance,
SHA-256 digests, and evidence limits.

## Automated evidence

| Check | Result |
| --- | --- |
| Final setup-copy component suite | 38/38 passed |
| Final responsive profile viewport suite | 13/13 passed |
| Repeated focus-geometry stabilization case | 20/20 passed |
| Full component, lifecycle, integration, and safety suite | 680/680 passed |
| Full Chromium suite | 285/285 passed |
| TypeScript | Passed |
| Production build | Passed |
| Lint | 0 errors; 2 generated-worker warnings |
| Research links | 598 local links across 88 Markdown evidence files; 0 missing |
| Visual artifacts | 10/10 JPEG types, dimensions, and SHA-256 digests verified |

## Independent review decision

Three independent reviewers examined the source change, accessible behavior,
data claims, responsive rendering, test boundary, and original-resolution
images.

Code and accessibility review rejected the first data-purpose sentence as an
unsupported product promise. Their repository trace also caught the incoherent
2/6 completed fixture and its stale name prompt. The accepted revision narrows
the copy and makes the fixture derive a complete six-question state from the
versioned content.

Accessibility review also found the stale resume language. The accepted
revision gives interrupted setup a remaining count and **Continue questions**,
with singular and all-four-viewport rendered coverage.

Visual review found no regression in the setup state and supported retention:
the 280-pixel card is materially shorter, while 640-pixel short landscape and
desktop retain clear hierarchy and contained actions. Its final revision keeps
**A grown-up** and **name and age** together, removing the two orphaned wraps
without changing card height. It also exposed a
separate pre-existing defect: **Account for Mia** obscures **Replay question**
by 44x9.25 CSS pixels at 280x568 and 21.78125x24 at 640x360. That failure is
preserved in the evidence and promoted to the next stacked branch rather than
hidden or silently bundled into this copy change.

Retain this branch provisionally. The exact words remain a hypothesis, not
proof of comprehension.

## Limits and next questions

Local deterministic Chromium does not establish target Safari/Firefox or
physical-device behavior, safe-area insets, zoom or text-spacing resilience,
right-to-left layout, localization quality, actual audio output, or VoiceOver,
TalkBack, NVDA, switch, and voice-control behavior.

Most importantly, fewer and more literal English words do not establish that a
5–7-year-old Pre-A1 learner or pre-reader understands **save**, **grown-up**,
**name**, **age**, or the numeric count. A moderated session should ask learners
to show what the primary button will do and explain in their preferred language
what happens to answers. A caregiver task should test the same factual boundary
without treating completion speed or preference as comprehension.

The next implementation should remove the compact account/replay obstruction.
Separate research should decide whether the four currently unused preference
answers should stop being collected or receive an explicit, editable, reviewed
purpose before they influence the experience.
