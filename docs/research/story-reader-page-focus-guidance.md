# Story Reader page-focus visibility guidance

Status: pre-implementation research guidance

Branch: `codex/story-reader-page-focus-visibility`

Base: `codex/shared-focus-visibility` at `0d08e63`

Research date: 2026-08-22

## Question

When Story Reader moves programmatic focus to the newly shown sentence, can its
visual cue remain clear on the cream reading surface and in forced colors while
looking like a reading-position marker rather than another button or input?

**Selected candidate:** keep the existing focus lifecycle and use a single
three-CSS-pixel brand-blue real outline with a two-pixel offset, a small corner
radius, and a static horizontal containment gutter. The brand-blue/cream pair
is 6.451:1. This branch treats the numeric contrast and area checks as a Parrot
product target for a static reading cue, not as a claim that WCAG's UI-component
contrast requirements necessarily apply to the paragraph.

The candidate must pass visual review before retention. Reject or revise it if
the closed outline still looks actionable, dominates the sentence, causes new
wrapping, touches the progress/prompt chrome, or appears broken where the
short-wide reading column clips overflow.

## Audience and scope

The primary audience remains young learners with little English. The visible
cue must work without a child reading a status label, naming a color, or
understanding a desktop focus convention. It also matters to a caregiver or a
sighted keyboard/switch user who needs to know where the page-changing action
moved the interaction point.

In scope:

- the page-text presentation after initial route load and page changes;
- 280×568 and 390×844 portrait phones and the 640×360 short-wide composition;
- short and three-line page text;
- normal colors and a computed forced-colors fallback;
- rendered changed-area evidence, containment, overflow, and visual review.

Out of scope:

- whether focus should move from **Next** or **Back** to static text at all;
- focus order, `tabIndex`, narration, page routes, controls, live regions, or
  page-change timing;
- story wording, art, prompts, levels, or audio;
- shared control focus styles, new design tokens, or a global abstraction;
- a whole-product WCAG claim; and
- direct child, caregiver, switch-user, or assistive-technology evidence.

## Rendered baseline

At base `0d08e63`, `StoryReader.tsx` gives the page paragraph
`outline-none`, a four-pixel `sky-300` focus ring, and a large rounded corner.
The effect is a `box-shadow`, not a real outline.

The authored sky `#7dd3fc` is 1.603:1 against the cream `#fffaf0` reading
surface. Contrast ratios here use the WCAG 2.2 sRGB relative-luminance formula
without rounding a near-failure into a pass.

Genuine in-app Browser inspection with the local E2E fixture found:

| Route and viewport | Rendered observation |
| --- | --- |
| The Red Ball page 1, 280×568 | The 228×29.7 px paragraph owns focus and matches `:focus-visible` immediately. The complete pale rounded ring reads like an input boundary. Main width remains 280 px. |
| The Red Ball page 2 after pointer **Next**, 390×844 | The 330×29.7 px new paragraph owns focus and matches `:focus-visible`; the ring is therefore ordinary child-facing page-change feedback, not keyboard-only chrome. |
| The Red Ball page 1, 640×360 | The paragraph is 280×33 px inside a 280 px-wide overflow-clipping column. The ring's side overflow is clipped, leaving top and bottom rails. |
| Kite, Come Back! page 4, 640×360 | The 280×99 px three-line paragraph stays visible in the 161 px inner viewport. Its lower edge is 8 px above the prompt, but the ring sides are clipped. The inner column scroll height is 225 px by design. |

The baseline images are retained with the final evidence rather than treated as
numeric input. Pixel calculations should use fresh lossless in-memory browser
screenshots, not compressed review JPEGs.

## Standards boundary

The cited WCAG success criteria are normative; Understanding documents and CSS
specification details are explanatory or technical context.

### Static focus is allowed, but should not become tedious

The W3C Understanding document for SC 2.4.3 says the criterion does not decide
what may receive focus. It explicitly permits static, non-operable content to
receive programmatic focus when the order still preserves meaning and
operation. It also advises avoiding non-operable sequential focus targets that
make keyboard use tedious.

The current paragraph has `tabIndex={-1}`, so it is not an extra sequential Tab
stop. Moving focus to the new sentence follows the visual/reading sequence and
is already tested. Whether returning keyboard users to **Next** would be more
efficient is a separate focus-flow question that needs target screen-reader and
switch observation.

### Do not mislabel the paragraph as a UI component

WCAG defines a user interface component as content perceived as one control for
a distinct function. This paragraph is static story content. Therefore:

- do not record its 1.603:1 ring as a proven SC 1.4.11 failure;
- do not claim the two-pixel-perimeter test is required here by SC 2.4.13;
- do not infer conformance or non-conformance from the proposed 6.451:1 pair.

Parrot can still adopt a three-to-one changed-pixel and two-pixel-perimeter
equivalent as a voluntary visibility target. The reason is product usability:
after an action moves focus, a sighted keyboard/switch user should not lose the
reading position. W3C Focus Visible says a shown keyboard-focus indicator must
not be time-limited, but its normative wording concerns a keyboard-operable
user interface. This branch avoids extending that statement beyond its terms.

### A real outline is the robust fallback

The CSS Color Adjustment Module Level 1 says forced-colors mode maps
`outline-color` to the user's system palette while `box-shadow` computes to
`none` when `forced-color-adjust` remains `auto`. The current ring can therefore
disappear in forced colors. A real outline preserves an independently sized
cue for the user agent to map.

Browser emulation can verify that a non-`none` outline of sufficient computed
width remains. It cannot prove its used system color, every Windows High
Contrast palette, every browser, or a physical display.

## Options considered

### Keep the current pale ring

Rejected. It is low contrast against the declared reading surface, disappears
when forced colors suppresses shadows, is clipped in the short-wide column,
and borrows a rounded field-like boundary for static prose.

### Reuse the shared four-pixel plus four-pixel control indicator

Rejected for this static cue. The shared pair is intentionally conspicuous for
operable controls across unpredictable surfaces. Applying the same eight-pixel
external footprint to one sentence would strengthen the false affordance and
erase the visual distinction between “current reading position” and “press
this.” The story surface is a single known cream color, so a two-color universal
control treatment is unnecessary.

### Remove the visible cue

Rejected for this bounded branch. A keyboard or switch action currently moves
focus away from the activated page control. Removing the only visible result
would make that movement harder to understand, and a shadow-only treatment is
not dependable in forced colors.

### Use only a background highlight or underline

Not selected. A background alone can disappear under forced colors; an
underline can look like a link and compete with the story text. Either could be
reconsidered after child observation if every closed boundary is mistaken for
a control.

### Selected candidate: compact real outline

Use:

- a three-pixel `#315f89` real outline;
- a two-pixel positive offset;
- a small radius rather than the rounded input shape;
- enough static horizontal gutter to keep the five-pixel external extent
  inside the short-wide clipping column; and
- no transition, motion, extra text, icon, or new color token.

The gutter must be present in focused and unfocused presentation so focus does
not cause reflow. It may not make a valid short sentence wrap or increase the
long stress case beyond its current three lines.

## Automated acceptance contract

Follow the repository rule: use Playwright and accessible locators; do not
assert Tailwind source or class strings.

1. On The Red Ball page 1 at 280×568, require the labeled paragraph to be the
   active element and match `:focus-visible` after route-managed focus settles.
2. Compare the focused screenshot with the same stable state after blur. Count
   same-position pixels whose change reaches 3:1, and require at least a
   two-CSS-pixel-perimeter equivalent. Treat this as the voluntary product
   target above, not a WCAG classification.
3. Repeat the rendered-area check for Kite, Come Back! page 4 at 640×360.
   Require the three-line paragraph to remain fully visible above the fixed
   story controls and keep document width at 640 px.
4. Verify the first-page treatment creates no document horizontal overflow at
   280×568, 390×844, or 640×360 and does not change the valid long page beyond
   three lines.
5. After pointer **Next** at 390×844, preserve the existing exact accessible
   label and programmatic focus on page 2.
6. In forced-colors emulation, require the page paragraph to remain focused,
   match `:focus-visible`, and expose a computed non-`none` real outline at
   least two CSS pixels wide. Do not assert an authored RGB value.
7. Preserve existing Story Reader navigation, narration, responsive control,
   overflow, and shared-focus tests.

## Visual review matrix

Capture matched normal-color states in the genuine in-app Browser:

- 280×568, first page focused on initial load;
- 390×844, second page focused after pointer **Next**;
- 640×360, short first-page sentence; and
- 640×360, three-line Kite page.

For every capture, verify the active element and `:focus-visible` before saving.
Review whether the cue is clearly attached to the sentence, stays complete,
leaves progress and prompt breathing room, and looks less like an action or
input than the baseline. Capture dimensions, commits, fixture provenance, and
SHA-256 digests in an artifact manifest.

## Rollback and follow-up

Revise or reject the candidate if it causes wrapping or scrolling regressions,
still looks like an input/action, clips at a required viewport, overwhelms the
story words, disappears in forced-colors emulation, or fails existing behavior.

Even a retained visual cue does not validate the focus lifecycle. A separate
`codex/story-reader-page-focus-flow` experiment should compare the current
sentence handoff with retaining the activated page button plus a concise live
announcement. That experiment needs VoiceOver, TalkBack/NVDA, switch/keyboard,
and child/caregiver observation because the two patterns trade reading context
against repeated Tab effort.

Ask young learners and caregivers to show what they think can be pressed and
where reading continues. Do not ask them to name colors or accessibility
concepts. Record mistaken-action attempts, hesitation, repeated Tabs, lost
position, adult prompts, and calm recovery without retaining child identifiers,
audio, or unnecessary video.

## Primary sources

Sources were opened and checked on 2026-08-22. Existing source-register entries
A11Y-16 through A11Y-18 contain the broader canonical source record.

- W3C WAI, [Understanding Focus
  Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), updated
  2026-03-09. It permits programmatically focused static content when meaning
  and operation remain logical, while warning against tedious non-operable
  focus targets.
- W3C WAI, [Understanding Focus
  Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html),
  updated 2026-07-12; [Understanding Non-text
  Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
  updated 2026-06-15; and [Understanding Focus
  Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html),
  updated 2026-03-09. The Understanding pages are informative, and the latter
  two define their numeric tests around user interface components.
- W3C, [CSS Color Adjustment Module Level
  1](https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties),
  Candidate Recommendation Snapshot 2025-12-16. It specifies forced-color
  adjustment of outline colors and suppression of box shadows; implementation
  and real-device evidence remain necessary.
