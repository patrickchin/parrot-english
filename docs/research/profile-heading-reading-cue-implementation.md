# Profile heading reading-position cue implementation

Status: implemented and provisionally retained

Branch: `codex/profile-heading-reading-cue`

Base: `codex/lesson-microphone-direct-action-feedback` documentation hand-off
at `9739789`

Research commit: `24f1a33`

Rendered contract commit: `998d4c5`

Implementation commit: `0cd03f6`

Review hardening: `3d28aec`

Review date: 2026-08-24

## Outcome

Profile setup now gives every programmatically focused step heading the same
quiet reading-position cue: an open four-pixel blue rail, separated from both
the card border and heading box. Setup, each question, and each acknowledgment
share the presentation. The default eight-pixel heading gap has one compact
portrait-question exception so the rail also stays four pixels inside the card.
Pointer, keyboard, and initial-load routes no longer depend on Chromium's
`:focus-visible` heuristic to show arrival feedback.

The rail follows the complete height of ordinary production headings and is
top-aligned with a 96-pixel cap for defensive long acknowledgment copy. In
forced colors, the decorative rail disappears and a real two-pixel outline
with a two-pixel offset takes over.

The change adds no words, icon, motion, sound, timer, control, Tab stop, or
focus delay. It does not change profile copy, question order, saved audio,
persistence, route timing, card geometry, typography, or focus ownership.

## Reproduced baseline

The existing focus lifecycle was correct: each new native `h1` received
one-time programmatic focus with `preventScroll`, stayed out of sequential Tab
order through `tabIndex=-1`, and reset the owned main scrollport. The complete
six-question route creates thirteen such arrivals.

Its visual feedback was not stable. Fresh Chromium reproduction showed a tight
one-pixel UA `auto` outline after initial-load and keyboard transitions. After
pointer transitions, the same focused static heading could have
`:focus-visible=false` and no outline at all, including under forced-colors
emulation. On question screens, the closed variant sat just above the genuine
outlined answer field and could make the heading resemble another input.

No baseline viewport at 280x568, 390x844, 640x360, or 1440x900 had horizontal
overflow or a displaced main scroll origin. Those properties became explicit
preservation requirements rather than reasons to retain the browser default.

The standards mapping, product inference, rejected options, source links, and
complete acceptance contract are in the
[guidance memo](./profile-heading-reading-cue-guidance.md).

## Implemented boundary

`LearnerProfileStepHeading` is a small wrapper-free shared domain component in
`LearnerProfileLayout.tsx`. It always renders the native `h1`, owns the existing
`useLearnerProfileStepHeading` hook, enforces the existing negative tabindex,
and accepts the same intrinsic heading properties. The setup, question, and
acknowledgment views now supply only their step key and existing typography,
ID, and visible child text.

The normal cue is a non-interactive pseudo-element on actual `:focus`. Its
outer edge normally begins twelve pixels before the heading box; because it is
four pixels wide, it leaves eight clear pixels before the box and before the
first glyph in left-aligned/shrink-wrapped states. The compact portrait
question uses an eight-pixel offset instead, leaving four pixels to its card's
inner border and four to the heading box. The rail is top-aligned, follows
`height: 100%`, and stops at 96 pixels. It explicitly has no transition or
animation.

Normal colors remove the UA outline. The forced-colors variant hides the
pseudo-element and restores a real complete outline, allowing system color
mapping instead of preserving the authored blue.

## Test-first evidence

The first five rendered behavior contracts were run against the unmodified
baseline. Four failed as intended: setup/pointer, question/keyboard, and
forced-colors states lacked the selected marker or fallback, and the long-copy
state had no marker. The existing Tab-sequence preservation contract passed.

After the shared component was introduced, all five passed. Review-driven
red/green revisions then shaped and hardened the retained result:

1. A 160-character acknowledgment test required no marker pixels below 96
   pixels. It failed against the first full 300-pixel rail with 816 CSS px² of
   changed area below the cap, then passed after the cap was implemented.
2. The first uniform twelve-pixel offset touched the 280-pixel question card;
   its exact marker-strip contract failed until an eight-pixel candidate left
   four pixels of clearance on both sides.
3. Independent review then found the uniform eight-pixel candidate visually
   joined shrink-wrapped/left-aligned text as `|Thank you!` and
   `|What's your name?`. Short-wide and portrait-acknowledgment contracts
   failed against that position, then passed with the default twelve-pixel
   offset and the compact question-only exception.
4. A computed-presentation contract failed because the global reduced-motion
   rule left `transition-property: all` on the pseudo-element. The retained
   cue explicitly uses `transition-property: none` and has no animation name
   under both ordinary and reduced-motion preferences.
5. Review coverage now requires native level-one semantics, exact visible text,
   the retained question ID, complete qualifying marker rows, and stable
   heading text-range, card, art, textarea, and action rectangles across focus
   and blur. User-agent `:focus-visible` outcomes remain observations rather
   than brittle pass/fail assertions.

The final rendered contracts cover pointer and keyboard transitions through
setup, question, and acknowledgment; ordinary and 160-character copy;
marker-cleared controls; exact forward Tab order; normal and forced colors;
280x568, 390x844, and 640x360; focus/blur scene geometry; card containment;
scroll origin; horizontal overflow; contrast and row continuity; open shape;
cap behavior; static presentation in both motion preferences; and a real
forced-colors outline on both vertical edges. Locators use accessible roles and
names; no test asserts Tailwind source or class strings.

## Timing and visual evidence

This branch intentionally preserves the existing next-animation-frame focus
handoff. It adds only CSS paint tied to focus and introduces no timer, request,
effect, or animation. There is therefore no new asynchronous feedback boundary
to benchmark. The visible cue is present in the first screenshot taken after
the already-owned heading focus settles.

Thirteen uncropped genuine in-app Browser screenshots compare the baseline and
candidate and cover additional candidate-only states at 280x568, 390x844,
640x360, and 1440x900. The first uniform twelve-pixel offset touched the card's
inner border on the 280-pixel question. The interim uniform eight-pixel offset
fixed containment but recreated a caret/stray-letter effect beside short and
left-aligned headings. The retained responsive rule gives ordinary headings an
eight-pixel text gap while the compact question retains four pixels on both
sides. A first full-height rail occupied 300 pixels, or 61.5% of the long-copy
card; the retained 96-pixel rail occupies 19.7% and reduces the quotation-bar
effect without claiming a particular child interpretation.

The [artifact manifest](../../artifacts/ux-review/profile-heading-reading-cue/manifest.md)
contains the images, exact dimensions, state and geometry notes, SHA-256
digests, capture provenance, modality caveat, and evidence limits.

## Automated evidence

Validation on `3d28aec` plus the final documentation worktree:

| Check | Result |
| --- | --- |
| Final focused profile/focus Chromium suite | 41/41 passed |
| Full Chromium suite | 280/280 passed |
| Component, lifecycle, integration, and safety tests | 678/678 passed |
| TypeScript | Passed |
| Production build | Passed |
| Lint | 0 errors; 2 generated-worker warnings |
| Research links | 446 local links across 59 Markdown evidence files; 0 missing |
| Visual artifacts | 13/13 JPEG types, dimensions, and SHA-256 digests verified |

## Independent review decision

Three independent reviewers examined production code, rendered contracts,
accessibility behavior, durable claims, and original-resolution images.

Code and visual review rejected the implementation commit's uniform four-pixel
heading gap. At 640×360 question/acknowledgment and the 280×568 short
acknowledgment, the rail visually joined the first glyph like a caret or
capital **I**. The accepted revision restores the eight-pixel Story Reader gap
by default and keeps the smaller offset only for the compact question whose
card cannot contain the larger one. All ten after images were recaptured.

Code review also rejected pass/fail assertions for Chromium's current
`:focus-visible` heuristic. Those observations remain in the reproduction, but
the durable tests now assert the product result—an open rendered cue after
both pointer and keyboard paths—without freezing user-agent policy. It also
requested stronger full-height evidence; the final pixel contract requires
qualifying marker width on every row except a one-pixel raster tolerance.

Accessibility review found that native level, exact text, the question ID,
full-scene geometry, and motion claims were broader than the initial tests.
The accepted coverage constrains the three shared call sites as level-one
headings, preserves exact text/ID/negative tabindex, compares heading text,
card, art, textarea, and action rectangles across focus/blur, and verifies no
animation name or transition property under ordinary and reduced-motion
preferences. The latter test first exposed the global reduced-motion rule's
one-millisecond `transition-property: all`; the retained pseudo-element now
explicitly has no transition.

Visual evidence review also caught that Browser-emitted JPEG bytes initially
had `.png` suffixes. They were renamed before entering Git, then the final
thirteen-file inventory, dimensions, and hashes passed independent review.

Final code, accessibility, and visual re-reviews reported no actionable
finding. Retain provisionally, subject to the direct learner, target assistive-
technology, browser/device, text-spacing, localization, and RTL work below.

## Limits and next questions

The evidence is deterministic local Chromium in English left-to-right. It does
not establish behavior in Safari or Firefox, real Windows High Contrast,
VoiceOver, TalkBack, NVDA, switch access, voice control, safe-area insets,
physical-device rendering, zoom, text spacing, localization, right-to-left
layout, or a particular live-region/heading announcement order.

Most importantly, a standards-consistent visible cue is not child-comprehension
evidence. A short moderated study should compare the retained cue with the
browser default and no cue. After pointer-led step changes, ask young low-
English learners to point to what changed and what they would do next without
asking them to read or name the marker. Observe whether it looks like a caret,
selection, quotation mark, or input; include caregivers and a separate older-
beginner group.

The acknowledgment heading remains inside a polite live region. Target
assistive-technology tests should establish whether focus and the live update
repeat, reorder, or overlap before changing either semantic contract.
