# Contrast-Safe Child Actions

Last reviewed: 2026-08-21

Branch: `codex/contrast-safe-child-actions`

Status: bounded research hand-off; it does not claim an implementation result,
complete WCAG conformance, or child comprehension

## Question and scope

How should Parrot repair the shared pink treatment used by child-facing actions
without turning a contrast correction into an unrelated visual redesign?

This note covers:

- enabled action-label contrast in rest, hover, active, and keyboard-focus
  states;
- required action icons and authored focus indicators where non-text contrast
  applies;
- the disabled/inactive exceptions and Parrot's stricter product choice;
- visible action cues that do not depend on color alone; and
- rendered regression checks for shared controls and the two direct shelf
  action cues.

It does not authorize changes to copy, control size, page layout, profile flow,
lesson behavior, audio, generated content, or persistence. Progress bars,
decorative pink artwork, the decorative authentication mark, and a broader
palette or dark-mode audit remain separate. Fixing one shared treatment must
not be reported as whole-product WCAG conformance.

The primary audience remains young beginner English learners, including
children who cannot independently read much English. WCAG supplies an
accessibility floor; it does not establish which color a five-year-old prefers
or whether a learner understands an action.

## Current Parrot evidence

The shared `brand` action in
[`ui.tsx`](../../src/shared/ui.tsx) renders white foreground on
`brand-pink`. [`styles.css`](../../src/styles.css) defines that pink as
`#ff467b`. The shared sizes include 14 px and 16 px labels, and the directly
styled lesson **Play** and story **Listen** cues also use normal-size white text
on that pink. They therefore need the normal-text threshold; a large-text
exception cannot repair the shared treatment.

### Independent ratio calculation

The calculation below uses the WCAG 2.2 sRGB relative-luminance formula, the
current constant `0.04045`, and the unrounded source colors—not screenshot
sampling:

1. `#ff467b` has sRGB bytes `(255, 70, 123)`.
2. Its linearized channels are approximately `(1, 0.0612460542,
   0.1980693196)`.
3. Relative luminance is
   `0.2126R + 0.7152G + 0.0722B = 0.2707037829`.
4. White has relative luminance `1`.
5. Contrast is `(1 + 0.05) / (0.2707037829 + 0.05) = 3.2740493132:1`.

Thus the existing pair is **3.27:1** when reported to two decimals. It exceeds
3:1 but fails 4.5:1; it is not close enough to round into a pass, and WCAG says
threshold values must not be rounded up.

For comparison, these are candidate/product calculations rather than colors
recommended by W3C:

| White text on | Relative luminance | Unrounded contrast | Interpretation |
| --- | ---: | ---: | --- |
| Current pink `#ff467b` | 0.2707037829 | 3.2740493132:1 | Passes 3:1, fails 4.5:1 |
| Existing rose `#d62f70` | 0.1749902395 | 4.6668691145:1 | Passes 4.5:1 at rest, with little room for lightening |
| Candidate action pink `#c52765` | 0.1426094008 | 5.4514473120:1 | Passes 4.5:1 with more state margin |
| Existing shadow pink `#b92259` | 0.1217961145 | 6.1118960889:1 | A possible darker state, not a required choice |

The current shared hover treatment applies `brightness(1.05)` to most brand
controls. A rest-state pass alone is therefore insufficient. Under a simple
clamped-channel calculation, lightening `#d62f70` by 5% produces approximately
`#e13176`, only **4.28:1** against white. CSS filters operate on the rendered
element or subtree, and opacity composites with the actual backdrop, so every
authored state needs browser-level verification. The safest testable design is
an explicit state color or a non-color change, not an unmeasured brightness or
whole-control opacity effect.

## What WCAG 2.2 requires

The normative success criteria are in WCAG 2.2. The linked Understanding pages
explain them but are informative rather than additional conformance rules. See
[A11Y-17](./source-register.md) for the durable mapping.

| Area | Standards requirement | Parrot implication | Important boundary |
| --- | --- | --- | --- |
| Ordinary text | SC 1.4.3 (Level AA) requires at least 4.5:1 for text and images of text. | Every enabled normal-size child action label must remain at least 4.5:1 in every state where the label is shown. | Passing one token at rest does not cover hover, focus, active, gradients, transparency, filters, or overlays. |
| Large text | Large-scale text may use 3:1. The explanatory threshold is at least 18 pt (about 24 CSS px) when not bold or at least 14 pt (about 18.5 CSS px) when bold. | Do not use this exception for a shared action color: compact, default, header, card, and short-viewport labels are below it. Use a 4.5:1 floor across the shared enabled label system. | Font weight, computed size, and unusual/thin faces matter. A visually big button does not make its text “large text.” |
| Incidental and inactive text | SC 1.4.3 exempts text that is part of an inactive component, decorative, invisible to everyone, or incidental in a complex picture; logotypes are also exempt. | A genuinely unavailable native-disabled or correctly guarded `aria-disabled` action can fall within the inactive exception. | A low-contrast enabled action is not inactive. A control does not become exempt merely because it is loading, visually muted, or inconvenient to activate. |
| Text in states | The Understanding document says 1.4.3 also applies to text displayed on hover or keyboard focus. | Hover/focus must not lighten an enabled label below 4.5:1. Active/pressed text should be held to the same product contract. | A transient state can still fail; short duration is not an exception. |
| Color alone | SC 1.4.1 (Level A) says color cannot be the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element. | Keep a visible literal label on primary child actions. Use text, a familiar icon, shape/context, focus outline, elevation/movement, or another non-hue cue for action and state. | High luminance contrast does not by itself make “red means stop” or “green means ready” understandable without another cue. |
| Component and icon contrast | SC 1.4.11 (Level AA) requires 3:1 against adjacent colors for visual information required to identify a UI component or state, with exceptions for inactive and unmodified user-agent presentation. | A required icon, custom border, selection mark, or focus indicator must retain 3:1 against its adjacent color. | W3C's examples say a button already identified by position, text style, or context need not have a separately contrasting outline merely to look button-like. Decorative icons are not required information. |
| Keyboard focus | SC 2.4.7 (Level AA) requires a visible keyboard focus indicator. W3C explains that authored focus indication is also subject to non-text contrast. | Preserve a persistent, obvious focus ring and verify it against the actual adjacent surface at every representative placement. | SC 2.4.13 Focus Appearance is Level AAA. Its changed-area and 3:1 focused/unfocused requirements can guide a robust ring, but must not be mislabeled as an AA rule. |
| Hover | W3C explains that a supplemental hover effect need not itself achieve 3:1 merely to identify hover because pointer position already does that; it must not make the component, focus, or selection indicator lose required contrast. | Treat hover as optional reinforcement. Never put an instruction or essential state only on hover, especially for touch-first children. | This hover nuance does not relax the 4.5:1 requirement for text visible during hover. |

## Cognitive and early-childhood guidance

W3C COGA's [clear visible label pattern](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/)
says labels should use common words, remain visible, sit beside the relevant
control, and be available to assistive technology. Its
[clear words pattern](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/)
also prioritizes common words in labels and instructions. These are
supplemental cognitive-accessibility patterns, not WCAG success criteria and
not studies of young multilingual learners. They support retaining a short
visible action label while the palette changes; they do not validate Parrot's
exact English. See [A11Y-01 and A11Y-02](./source-register.md).

The US Office of Head Start says pictures and visual supports can help some
young children understand what to do and what happens next, including when
verbal instructions are difficult. That supports pairing one familiar icon or
picture with the visible label, not replacing the label with a colored circle
or assuming every child interprets the same icon. See
[LANG-10](./source-register.md).

NAEYC asks early-learning decisions to consider developmental commonalities,
the individual child, and social, cultural, and linguistic context. Therefore
the contrast fix should be consistent for everyone, while comprehension claims
wait for observation with children who differ in English proficiency, vision,
device, language, and prior interface experience. See
[DEV-02](./source-register.md).

## Bounded product decisions

### 1. Separate action pink from decorative pink

Keep `#ff467b` available for decoration where a separate audit finds it
appropriate. Do not globally darken every radial gradient, progress fill,
character mark, or decorative accent merely to fix text-bearing actions.

Introduce or map a semantic **action** fill for shared `brand` controls and for
the direct lesson **Play** and story **Listen** cues. A safe implementation can
use `#c52765` (5.45:1 with white) as the enabled action pink. The existing
`#d62f70` rose (4.67:1) is also valid at rest only if every lightening filter and
ancestor effect is removed or replaced and every resulting state is verified.
The exact palette choice is a Parrot product decision, not a WCAG prescription.

### 2. Make state treatments explicit

For enabled pink actions:

- keep white label/icon contrast at least 4.5:1 in rest, hover, active, and
  focus states;
- prefer translation, elevation, border/outline, or an explicitly tested
  darker fill over `brightness()`;
- do not allow an interactive card's ancestor filter to lighten a nested
  **Play** or **Listen** cue below the threshold;
- keep the action's accessible name and visible words stable unless the action
  itself changes; and
- preserve reduced-motion behavior so state still has a visible non-motion
  cue.

Do not use pink-versus-rose hue alone to communicate enabled, selected,
recording, success, error, or destructive meaning. Keep programmatic state and
a visible word, icon/shape, or other redundant cue.

### 3. Keep disabled actions readable by product choice

WCAG exempts genuinely inactive controls from the text and non-text contrast
criteria. Parrot should not treat that exception as a target because a young
learner may still need to read **Wait**, understand what will become available,
or recognize why tapping has no effect.

Use an explicit disabled presentation with a readable foreground/background,
no hover/active movement, reduced or removed elevation, correct native
`disabled` or guarded `aria-disabled` semantics, and a literal state label when
the control communicates waiting. Avoid whole-control opacity over variable
page gradients. Aim for 4.5:1 for visible disabled labels as a Parrot product
contract, while documenting that this exceeds the WCAG inactive-component
minimum. Do not make a disabled control look enabled merely to gain contrast.

### 4. Preserve and verify focus independently

Keep the shared four-pixel `brand-ink` focus outline unless rendered evidence
shows it fails against an adjacent surface. Because the outline is offset, its
relevant adjacent color is normally the page/card surface underneath the ring,
not automatically the button fill. Gradients and overlapping accents require
testing at the actual placement. A two-color indicator is the robust fallback
when one ring color cannot guarantee adjacent contrast across surfaces.

Focus must remain visible for as long as keyboard focus remains. A hover,
active, disabled, or loading style must not erase it. The visible label and
focus ring provide separate information: one says what the action does; the
other says where keyboard input will act.

## Implementation boundary for the stacked branch

In scope:

- semantic action-state color tokens in `styles.css`;
- the `brand` presentation shared by `ActionButton`, `ActionLink`, and
  `IconButton` in `src/shared/ui.tsx`;
- any shared hover/active/disabled rule that changes the rendered child-action
  colors;
- the direct **Play** cue in `LessonList.tsx` and **Listen** cue in
  `StoryList.tsx`; and
- rendered contrast, focus, semantics, target-size, and screenshot evidence.

Out of scope:

- the decorative authentication **P**, decorative pink gradients, and
  non-action character art;
- lesson/story progress bars, which need their own non-text contrast review;
- changing labels, icons, routes, control dimensions, or interaction timing;
- using color to introduce new semantic variants; and
- claiming that an automated contrast pass proves readability or
  comprehension.

Because the shared `brand` primitive also reaches grown-up surfaces, inventory
all rendered consumers before implementation. A shared correction may improve
those surfaces, but it must not silently change destructive/success semantics
or collapse the separate `rose`, `navy`, `success`, and `surface` variants.

## Suggested validation

Follow the repository rule: test rendered behavior with Playwright and
accessible locators; do not assert Tailwind class names or CSS source text.

### Automated contract

1. Render representative shared text actions at compact, default, header,
   large, and hero sizes. Include a button and link, plus at least one nested
   shelf cue.
2. Locate actions by role and accessible name. Read the rendered foreground,
   effective background, opacity, and filter in rest, hover, active, focus, and
   disabled/`aria-disabled` states.
3. Calculate ratios from the effective rendered sRGB colors without rounding.
   Require at least 4.5:1 for every enabled state containing text.
4. If a CSS filter, transparency, gradient, image, or ancestor effect prevents
   reliable computed-color evaluation, remove that ambiguity from the action
   treatment or validate rendered pixels at controlled interior sample points.
   Do not compare only declared tokens.
5. For icon-only brand actions, require any icon necessary to identify the
   action to reach 3:1 against its adjacent fill. Keep its accessible name.
6. Reach each action by keyboard and require a persistent visible focus
   indicator. Check the authored indicator at 3:1 against its actual adjacent
   colors and ensure hover/active styles do not suppress it.
7. Verify state meaning is still available without hue: visible label or
   necessary icon, correct accessible name, correct `disabled` or
   `aria-disabled` state, no activation while unavailable, and no essential
   instruction that appears only on hover.
8. Preserve every existing minimum target box and action behavior. Contrast
   work must not alter navigation, profile advancement, lesson progression, or
   audio timing.

Run representative child routes at 280×568, 390×844, 640×360, and 1440×900.
Include at least profile setup/question/acknowledgment, lesson shelf, story
shelf, lesson player controls, and Talk. Capture rest and keyboard-focus
screenshots at phone and short-wide sizes, plus any state whose visual result
cannot be inferred from the rest image.

### Human and device follow-up

Test Safari/VoiceOver and Chrome/TalkBack or the actual supported equivalents
for focus sequence, announced names/states, zoom, increased text spacing,
forced colors, and platform contrast settings. Automated ratios do not show
whether a focus ring is easy to find in a busy scene or whether an action still
looks tappable.

In child/caregiver observation, ask learners to show which control they would
tap rather than asking them to name a color or read a label aloud. Include
children with weak English, different home languages, and varied vision/motor
needs. Record task choice, hesitation, mistaken taps, adult prompts, and calm
recovery without retaining child audio, identifiers, or unnecessary video.

## Rejected shortcuts

- **Declare the label large text:** rejected because many shared and direct
  action labels render at 14–16 px, and shared responsive sizes can shrink.
- **Keep `#ff467b` for text because it passes 3:1:** rejected because 3:1 is the
  large-text/non-text threshold, not the normal-text AA threshold.
- **Reuse `#d62f70` and keep `brightness(1.05)`:** rejected because the rest
  pair passes narrowly while the lightened approximation falls to 4.28:1.
- **Change the global decorative pink token:** rejected because it broadens a
  child-action fix into unrelated artwork and progress changes.
- **Test only the default state or declared color:** rejected because text
  shown on hover/focus also needs contrast and rendered filters/opacity change
  the effective result.
- **Fade disabled controls with opacity and cite the exception:** rejected as a
  Parrot product choice because unavailable labels can still orient a child.
- **Use darker pink as the only selected/error/success cue:** rejected because
  SC 1.4.1 requires a visible alternative when color conveys meaning.
- **Remove the focus outline to simplify the palette:** rejected because
  keyboard focus must remain visible and its indicator has its own contrast
  obligation.

## Evidence limits

- No child, caregiver, low-vision user, color-vision-deficient user, or
  assistive-technology user participated in this research pass.
- The token calculations use specified sRGB colors. They do not measure display
  calibration, glare, ambient light, font rasterization, or every composite
  pixel in a gradient.
- WCAG contrast improves perceptibility for many users but does not prove a
  child understands a word, icon, character, or learning task.
- COGA patterns predominantly use cognitive/disability personas, not a sample
  of five-year-old multilingual learners. Head Start supplies early-learning
  practitioner guidance, not a Parrot interface trial.
- The proposed 4.5:1 disabled-label target is a Parrot product decision above
  the inactive-component exception, not a WCAG requirement.
- This bounded branch cannot establish whole-page or whole-product conformance.
  Progress indicators, artwork, error/success states, custom editors,
  translations, and target assistive technologies still need their own review.

## Primary sources

- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/),
  Recommendation republished 2024-12-12 (original Recommendation 2023);
  accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Contrast
  (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
  updated 2026-06-01; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Use of
  Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), updated
  2025-09-16; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Non-text
  Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast),
  updated 2026-06-15; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Focus
  Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html),
  updated 2026-07-12; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Focus
  Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html),
  updated 2026-03-09; accessed 2026-08-21.
- W3C COGA, [Use Clear Visible
  Labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/)
  and [Use Clear
  Words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/),
  content first published 2021, UI posted 2022; accessed 2026-08-21.
- US Office of Head Start, [Visual
  Supports](https://headstart.gov/children-disabilities/article/visual-supports),
  accessed 2026-08-21.
- NAEYC, [Developmentally Appropriate Practice: core
  considerations](https://www.naeyc.org/resources/position-statements/dap/core-considerations),
  position statement 2020; accessed 2026-08-21.
