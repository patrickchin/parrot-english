# Profile Fallback Viewport Stability

Last reviewed: 2026-08-21

Branch: `codex/profile-fallback-viewport-stability`

Base: `codex/profile-acknowledgment-control` at `7a89a39`

Research commit: `7ef2e35`

Implementation commit: `1152866`

Status: implemented and retained provisionally; automated, production-build,
and local in-app visual validation complete; target devices, assistive
technology, localization, and direct child/caregiver observation remain open

## Outcome

The form-based learner-profile fallback now keeps the current task and its
action visible at the project's four target viewports. It reserves the known
1024×1024 character geometry before image decode, uses a stacked narrow-phone
composition and horizontal short-landscape composition, and restores both
scroll and focus whenever one same-route step replaces another.

The bounded implementation does not change the profile questions, visible
copy, question order, bilingual support, audio, transcription, skip behavior,
API, persistence, or the explicit child-paced acknowledgment policy from the
parent branch.

## Why this branch existed

The base profile applied its `sm:` desktop sizes as soon as a short landscape
reached 640 px wide. A fully loaded 640×360 setup put **Set up profile** below
the viewport. Before the dimensionless Peppa image decoded, the action was
visible; decode moved it 208 px. Activating that hidden action after the browser
scrolled to it then preserved the old offset into the question, leaving the
new heading above the screen.

At 280×568, the base setup did not show **Skip for now**, and the production
question with its bilingual prompt could push the complete answer/action area
below the first frame. The prior child-paced acknowledgment change made these
transitions deterministic enough to test without racing a timer.

The source-backed design boundary is recorded in
[Profile fallback viewport-stability guidance](./profile-fallback-viewport-stability-guidance.md).
It distinguishes standards from product decisions: WCAG Reflow permits
vertical scrolling, while keeping the whole current step visible at 640×360 is
a stricter Parrot task-success guardrail.

## Implementation

### Stable image geometry

All four profile uses of `peppa-happy.webp`—setup, question,
acknowledgment, and editor—now declare the source's intrinsic `width={1024}`
and `height={1024}` and retain responsive containment. The square box therefore
exists before decode; no loader blocks the task.

### Viewport-shaped composition

- The setup reduces outer padding, gaps, and decorative art on short screens.
  At short-wide sizes the character sits beside the heading, explanation, and
  two visible choices.
- The 280 px question keeps a calm stacked reading order: progress, character,
  heading, answer, speech action, skip, then **Next**.
- At 640×360 the character occupies a compact left column while the prompt,
  answer, and actions use the wider right column.
- Acknowledgments use the same short-wide relationship. Grid alignment keeps a
  normal 52 px **Next** action instead of stretching it beside the image.
- Valid acknowledgments over 120 characters use 36 px rather than 48 px type
  at normal-height `sm:` viewports. Short-height screens use 24 px type. Text is
  not truncated, clipped, or put in a nested scrollport, and short ordinary
  desktop acknowledgments retain the original 48 px hierarchy.
- Existing shared controls keep at least a 44×44 CSS px target. No visible
  label is hidden to make the layout fit.

### Same-route context hand-off

`useLearnerProfileStepHeading` gives each setup/question/acknowledgment step one
identity-keyed hand-off. Its layout effect resets the nearest profile `<main>`
to horizontal and vertical origin, then focuses the new `h1` on the next
animation frame with `preventScroll`. Cleanup cancels stale frames.

The question key and acknowledgment operation ID prevent normal typing, audio,
loading, and same-step rerenders from stealing focus. **Next**, the answer
field, and other controls remain in ordinary DOM and tab order.

## Test and review loop

The responsive suite uses accessible locators and rendered boxes rather than
source classes. Its deterministic `viewport-stability` fixture supplies two
questions and one acknowledgment; the separate `long-acknowledgment` fixture
returns exactly 160 English characters.

The tests caught real defects during implementation:

1. the shared account control initially overlapped the 640 px setup heading;
2. the first compact 280 px question forced a tiny character beside a
   three-line heading instead of using the clearer stacked composition;
3. the first acknowledgment grid stretched a one-line heading and **Next** to
   68.75 px and 83.25 px respectively; and
4. the 160-character desktop case left the bottom 3 px of **Next** outside the
   900 px viewport.

Each was corrected before the retained screenshots and full run. An independent
reviewer then reported no remaining Critical or Important findings in the
bounded implementation.

## Verification

| Check | Result |
| --- | --- |
| Focused profile component/lifecycle | 93/93 passed |
| Focused profile Chromium | 14/14 passed |
| Full unit/integration/lifecycle/safety | 679/679 passed |
| Full Chromium | 207/207 passed in 48.9 s |
| TypeScript + production build | passed |
| Production core bundle | 496.93 kB raw / 149.94 kB gzip |
| Lint | 0 errors; 2 generated-file warnings |
| Diff and local Markdown links | passed after documentation |

The delayed-image matrix covers 16 combinations: setup, question,
acknowledgment, and editor at 280×568, 390×844, 640×360, and 1440×900. Each
requires heading/action movement of at most 1 CSS px. The flow matrix also
requires scroll origin, heading focus, complete question controls, 44 px
targets, account clearance, and zero horizontal overflow through
setup → question → acknowledgment → next question.

## Visual evidence

The [artifact manifest](../../artifacts/ux-review/profile-fallback-viewport-stability/manifest.md)
records twelve before/after in-app Browser JPEGs, provenance, exact geometry,
and limits.

The most important measured change is the 640×360 transition:

| State | Base | After |
| --- | --- | --- |
| Setup | primary action below the viewport | heading y 77–137; both choices end by y 283 |
| First question after setup | retained `scrollTop = 216`; heading y −45.5–−0.5 | `scrollTop = 0`; focused heading y 103.25–140.75 |
| Complete answer/action area | required scrolling in the base composition | textarea ends y 248.75; Skip/Next end y 300.75 |
| Acknowledgment | heading and Next continued below the initial frame | heading y 117.5–147.5; Next y 190.5–242.5 |

The 280×568 setup now shows **Set up profile** and **Skip for now** ending at y
448 and 496. The exact 160-character boundary also fits without outer scroll:
its 280 px Next ends at y 508, and its 1440 px Next ends at y 743.

## Retain, revise, or reject

**Retain provisionally.** The branch fixes reproducible content movement,
hidden-action, retained-scroll, and focus failures while preserving the
profile's behavior and data boundary.

Revise if target VoiceOver, TalkBack, NVDA, switch, text-spacing, zoom, safe-area,
or translated-content testing exposes a new obstruction. Preserve explicit
actions and the logical DOM order; do not respond by hiding Skip, truncating
text, restoring timed acknowledgment navigation, or auto-scrolling only to a
control while hiding its question.

## Limits and next evidence

- No child, caregiver, teacher, or accessibility practitioner participated.
- The 160-character phone state is technically reachable but visually dense.
  It is evidence for a separate common-word, short-generated-acknowledgment
  contract, not evidence that a beginner can understand ten lines of feedback.
- The deterministic fixtures do not exercise the real Chinese prompt, longer
  future translations, 200% zoom, text spacing, safe-area insets, or physical
  devices.
- Screen-reader announcement order for focused headings inside the polite
  acknowledgment region still needs target testing.
- Local geometry does not establish field CLS, production latency, learning
  benefit, or WCAG conformance.

The selected next stacked branch is a contrast-safe child-action improvement.
The current default white-on-pink text treatment is 3.27:1 for normal-size
labels; it should reach at least 4.5:1 without losing the familiar pink action
affordance or weakening focus/disabled states. The generated-acknowledgment
language contract remains the next content-focused branch after that bounded
shared-control decision.

## Hand-off

```text
Branch: codex/profile-fallback-viewport-stability
Base branch / dependency: codex/profile-acknowledgment-control documentation hand-off 7a89a39
Research commit: 7ef2e35
Implementation commit: 1152866
Hypothesis: reserved art, viewport-shaped composition, and one-time step focus keep the current profile task visible without changing its flow
Changed: intrinsic image geometry; short and short-wide layout; step-keyed scroll/focus hand-off; length-aware valid acknowledgment layout; deterministic multi-step/long-copy fixtures; rendered regression matrix
Not changed: profile questions/copy/order, bilingual support, audio/transcription, skip behavior, API/persistence, telemetry, dependencies, or explicit acknowledgment pacing
Tests: 93/93 focused component/lifecycle; 14/14 focused Chromium; 679/679 full unit/integration/lifecycle/safety; 207/207 full Chromium; TypeScript/build passed; lint 0 errors with 2 generated warnings
Screenshots: twelve in-app Browser JPEGs and manifest in artifacts/ux-review/profile-fallback-viewport-stability
Measured result: <=1px delayed-image movement across 16 surface/viewport cases; zero-scroll visible flow at 280x568, 390x844, 640x360, and 1440x900; exact 160-character boundary remains visible with Next
Retain, revise, or reject: retain provisionally
Next branch: contrast-safe child actions stacked on this documentation hand-off
```
