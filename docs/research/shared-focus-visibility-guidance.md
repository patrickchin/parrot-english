# Shared focus visibility guidance

Status: implemented; see the companion implementation evidence

Branch: `codex/shared-focus-visibility`

Base: `codex/contrast-safe-child-actions` at `a851d88`
Research date: 2026-08-21

## Question

Can Parrot replace its single dark-blue authored focus outline with one bounded,
shared indicator that remains easy to find on light child surfaces, the navy
account menu, smooth gradients, and controls beside artwork, without changing
focus order, task behavior, labels, or task/domain timing?

**Selected answer:** use one contiguous two-color indicator for shared
controls: a four-pixel white inner ring and a four-pixel deep-navy outer CSS
`outline`. The existing four-pixel outline offset is retained, but the inner
ring fills that region so normal-color rendering has no transparent gap. The
semantic focus colors `#ffffff` and `#061f3b` are 16.576:1 apart, comfortably
above the 9:1 pair used by W3C Technique C40.

Implementation update, 2026-08-21: the initial research direction put a light
zero-offset outline inside a dark shadow. Rendered review selected the inverse
layer order above because it preserves Parrot's existing eight-pixel external
footprint, gives each band four pixels rather than the two-pixel minimum, and
lets Tailwind's inner ring compose with existing elevation shadows. The real
outer outline remains the independent forced-colors fallback.

This is a bounded repair, not a claim of whole-product WCAG conformance. A
two-color token pair provides a strong reusable design over solid surfaces. It
does not by itself prove every pixel beside an image or gradient, survive every
ancestor filter or opacity, remain unclipped by every container, or match every
forced-colors implementation. Those cases still need rendered and device
evidence.

## Audience and exclusions

The primary product audience remains young learners with little English,
including children who may use a keyboard-like switch interface or share the
task with a caregiver. The repair also matters to sighted keyboard users with
low vision, motor disabilities, attention limitations, short-term-memory
limitations, or executive-function limitations.

This research does not assume that children use a keyboard, understand focus
conventions, or can name either ring color. No child, caregiver, teacher,
low-vision participant, switch user, or assistive-technology user took part in
this pass. WCAG and W3C COGA guidance support perceptibility and consistency;
they do not prove that Parrot's exact indicator is understood by a five-year-old
multilingual learner.

Out of scope for this branch:

- focus order, programmatic focus movement, route transitions, or live-region
  behavior;
- labels, icons, component dimensions, navigation, audio, or task/domain
  timing;
- a complete disabled-control redesign;
- route-specific `focus-within` and focused-heading treatments that do not use
  the shared primitive;
- proving all artwork, overlays, sticky content, or dialogs conform; and
- substituting automated contrast arithmetic for target-browser or user
  observation.

## Observed baseline

At base `a851d88`, `src/shared/ui.tsx` gave `ActionButton`, `ActionLink`, `IconButton`,
`TextButton`, and `TextLink` the same four-pixel `#173c67` outline with a
four-pixel positive offset. `MenuButton` inherits that treatment. The base
rules in `src/styles.css` repeat the same outline for buttons and form fields.
This consistency is useful, but one color cannot cover the current surface
range.

The existing outline is 1.278:1 against the `#204c7f` account-menu surface, so
it nearly disappears there. It is much clearer on white and common sky
surfaces. Because the outline is positively offset, the relevant adjacent
color is normally the page, menu, card, gradient, or image beneath the outline,
not the focused control's fill.

Shared consumers appear in all of the conditions that matter to the repair:

- profile and conversation controls on light-blue gradients;
- account actions inside a solid navy menu;
- text, icon, surface, and filled controls on white cards;
- lesson and story controls near gradients and artwork; and
- raised controls whose existing elevation already uses `box-shadow`.

Some direct route components define separate focus styles. They are evidence
for later inventory, not permission to broaden this first repair beyond the
shared primitive and the base form-field fallback.

## What WCAG 2.2 requires—and what it does not

The success criteria in WCAG 2.2 are normative. W3C Understanding documents
and Techniques explain or demonstrate ways to meet them, but are informative
and are not additional conformance requirements. The existing source-register
entries [A11Y-16 and A11Y-17](./source-register.md) record the existing
focus/contrast sources; [A11Y-18](./source-register.md) records the new
implementation and forced-colors sources used here.

| Requirement | Level | Bounded meaning for Parrot | Important boundary |
| --- | --- | --- | --- |
| SC 2.4.7 Focus Visible | AA | A keyboard-operable interface needs a mode where its keyboard focus indicator is visible. When shown, the indicator must remain visible while focus remains. | This criterion does not prescribe a particular color, outline width, or animation. `:focus-visible` can provide the keyboard mode only if the resulting indicator is actually visible. |
| SC 1.4.11 Non-text Contrast | AA | An authored visual indicator needed to identify the focused state must reach at least 3:1 against its adjacent color or colors. Test the focused rendering, including filters, overlays, and the surface under an outside ring. | Truly inactive components and unmodified user-agent appearance are excepted. A passing control label does not make a failing focus indicator pass. |
| SC 2.4.11 Focus Not Obscured (Minimum) | AA | Author-created content must not entirely hide the focused component. A fully hidden external indicator would also likely fail Focus Visible. | This SC evaluates the component, not automatically every pixel of an external ring. Partial obscuring can pass this SC while still causing a separate contrast failure. |
| SC 2.4.13 Focus Appearance | AAA | When visible, enough indicator area must equal at least a two-CSS-pixel perimeter of the unfocused component, and that area must change by at least 3:1 between the same pixels in focused and unfocused states. | This is **AAA**, not an AA requirement. Its user-agent/background exceptions differ from the inactive-component exception in 1.4.11. Parrot can adopt it as a stronger product target without relabelling it AA. |
| SC 2.4.12 Focus Not Obscured (Enhanced) | AAA | No part of the focused component is hidden by author-created content. | Useful as a review goal, but not part of an AA claim and not solved by a ring color change. |

Two different comparisons therefore matter:

1. **Adjacent contrast for AA:** in the focused state, compare the authored
   indicator with the colors immediately beside it.
2. **Changed-pixel contrast for AAA:** compare the same pixels in focused and
   unfocused screenshots, then count only the area whose change reaches 3:1.

Passing one comparison does not imply passing the other. A border can change
strongly from its old color yet blend into the adjacent page, or stand out from
the page but change too little from its unfocused rendering.

## Why a two-color indicator fits this product

W3C Technique C40 is a sufficient technique for Focus Visible, for using the
indicator to satisfy Non-text Contrast, and for Focus Appearance. It is not the
only conforming method and is not required. Its robust solid-background case
has three important conditions:

- the two indicator colors contrast at least 9:1 with each other;
- each color band is at least 2 CSS px thick; and
- both bands are drawn over the same single solid background.

When those conditions hold, at least one band is guaranteed to reach 3:1
against any solid background. The technique explicitly warns that images,
gradients, and overlapping components may still require pixel-by-pixel review.

The proposed Parrot pair is deliberately shared rather than route-specific;
the implementation should expose it through focus-purpose tokens or one shared
treatment rather than copy the color values into pages:

| Pair or surface | Ratio | Interpretation |
| --- | ---: | --- |
| Light band `#ffffff` / deep band `#061f3b` | 16.576:1 | Exceeds C40's 9:1 two-band condition. Neither color alone is the universal indicator. |
| Current `#173c67` / account navy `#204c7f` | 1.278:1 | Measured defect; the current single outline fails the 3:1 adjacent-color threshold there. |
| Light band / account navy `#204c7f` | 8.744:1 | The light band carries the navy-menu contrast. |
| Deep band / representative sky `#90dcf8` | 10.876:1 | The deep band carries common light-gradient contrast. |
| Deep band / bright pink `#ff467b` | 5.063:1 | The deep band remains distinct where a ring crosses a pink accent. |
| Light band / bright pink `#ff467b` | 3.274:1 | The light band also clears 3:1 for this declared accent, but this is not an image guarantee. |

Ratios use the WCAG 2.2 sRGB relative-luminance formula without rounding a
near-failure into a pass. The colors are selected semantic focus tokens for
this branch, not W3C prescriptions.

## Recommended geometry

Use the selected contiguous implementation:

- an inner four-pixel white Tailwind ring/`box-shadow`; and
- an outer four-pixel deep-navy outline at a positive four-pixel offset.

The inner ring occupies the outline-offset region, so the normal-color order is
control → white band → deep band → surface with no transparent pixels between
the bands. Tailwind's ring variables compose the white band above each named
control-elevation shadow rather than replacing that shadow. The rendered
geometry—not the utility names—is the contract.

The `outline` is essential. Do not implement the indicator with `box-shadow`
alone, and do not remove the outline in favor of an otherwise invisible custom
effect. Raised controls already use an elevation shadow; the inner focus ring
must compose above it rather than replace it or become hidden underneath its
lower edge. The same geometry should apply to filled controls, surface
controls, text controls, icon controls, menu items, and base form fields.

Each selected band is four pixels thick, twice C40's minimum. Do not add
pulsing, route-specific colors, or a second textual instruction merely to make
focus noticeable.

### Offset outlines

WCAG does not require an offset. The Focus Appearance Understanding document
says a small offset can help visibility, but changed transparent gap pixels are
not indicator area. A positive offset also moves the contrast comparison onto
the surrounding page or image and increases clipping/collision risk.

The selected repair keeps the existing positive four-pixel offset while filling
that entire region with the white inner ring. Thus the two normal-color bands
stay contiguous and visibly attached to the control without increasing the
existing outside footprint. For this offset geometry:

- do not count any transparent pixels toward changed area;
- ensure both actual color bands retain the intended thickness;
- sample the surface underneath the displaced bands;
- verify the larger footprint is not clipped by overflow, a viewport edge, a
  dialog, or the account-menu boundary; and
- ensure the indicator still reads as belonging to the focused control.

An indicator inset farther inside a component is a different geometry. W3C's
Understanding guidance notes that an inset two-pixel line away from the outer
edge can be too small for the AAA area calculation; it may need to be thicker.
That is another reason not to silently substitute an inset ring for the shared
outside pattern.

### Images and gradients

The light/deep pair is strong across Parrot's declared white, navy, sky, yellow,
and pink surfaces. It is not a mathematical guarantee across an arbitrary
photograph, character illustration, CSS gradient, semitransparent overlay, or
URL-backed background image.

For every shared control beside non-solid content:

1. reach the control by keyboard at each representative viewport;
2. inspect the whole perimeter, including corners and the lower edge where
   elevation shadows overlap;
3. compare rendered ring pixels with their actual adjacent pixels, not with a
   nominal page token; and
4. if a meaningful portion disappears, place the control/ring on a stable
   opaque local surface or introduce another tested focus-only backing rather
   than inventing a route-specific hue.

The W3C Focus Appearance guidance recommends a two-color indicator or a solid
box with a border for highly variable image/gradient backgrounds. Parrot should
choose the smallest local treatment that leaves the shared indicator intact.
Any such local backing requires its own visual and contrast evidence.

## Interaction states and inactive controls

Keyboard focus can coexist with hover, active/pressed styling, an ancestor
filter, or a focus-retaining `aria-disabled` pending state. The indicator must
not disappear, become time-limited, or be replaced by movement alone in any of
those states.

The shared control transition deliberately excludes `box-shadow`. Otherwise
the white band would fade from transparent to opaque over 150 ms while the dark
outline remained hard to see on the navy menu. A focus-scoped transition
override was rejected because it caused the old ring to fade out after focus
moved, briefly showing two focus locations. Translate and filter feedback can
still animate; both focus bands appear and disappear synchronously. The bounded
trade-off is that shared elevation and segmented-selection shadow changes are
also synchronous rather than transitioning for 150 ms.

The current shared controls use brightness filters and can apply 60% opacity to
disabled or `aria-disabled` controls. Filters and whole-element opacity can
also alter an outline and shadow because the effects are rendered as part of
the element. Test the effective result; do not assume the unfiltered token
ratio survives.

SC 1.4.11 exempts a component that is genuinely unavailable for interaction.
That exception is not a reason to erase location feedback from an
`aria-disabled` control that deliberately remains focused during a pending
operation. Parrot's product contract should keep a stable, visible indicator
there so the learner or caregiver does not lose the interaction point. This is
a usability choice above the inactive-component minimum, not a claim that WCAG
requires every disabled control to retain focus or a 3:1 ring.

Native `disabled` controls normally do not receive sequential keyboard focus;
they should not be made focusable solely to display the new indicator. A full
disabled-palette/opacity repair remains separate. If whole-control opacity
prevents the shared pair from remaining clear in a focus-retaining pending
state, record that bounded failure and revise the pending presentation rather
than falsely reporting a universal focus pass.

## Forced colors and user color preferences

The CSS Color Adjustment Module says forced-colors mode replaces authored
values for properties including `outline-color` with system colors when
`forced-color-adjust` remains at its default `auto`. It also makes
`box-shadow` and `text-shadow` compute to `none`. CSS gradients are removed,
while URL-backed background images can remain.

The implementation contract is therefore:

- keep a real outline at least 2 CSS px thick as an independently sized
  one-band fallback;
- treat the inner white shadow/ring as normal-color reinforcement, never the
  sole focus indicator;
- leave `forced-color-adjust: auto` unless target-browser evidence proves a
  narrow exception is necessary;
- do not assume `getComputedStyle()` reveals the used forced system color—the
  specification distinguishes computed and forced used values; and
- test rendered output with forced colors active, including both light and
  dark/high-contrast palettes on a real supported operating system where
  possible.

With shadows suppressed, the four-pixel offset region becomes transparent and
the mapped four-pixel real outline remains outside it. Browser emulation checks
that the outline is still present and independently sized; it does not prove
the used system color or every real Windows High Contrast palette.

Browser emulation is a useful regression check, not proof of every Windows
High Contrast theme, customized palette, browser, remote desktop, or
assistive-technology combination. If an explicit forced-colors rule is needed,
prefer system color keywords and document the browser evidence. Do not opt the
whole component out of the user's palette merely to preserve Parrot branding.

## Child and cognitive-accessibility rationale

The Focus Visible Understanding document says a visible interaction point can
benefit people with attention, short-term-memory, and executive-process
limitations. W3C COGA's supplemental **Use a Consistent Visual Design** pattern
says similar roles and states, including focus, should use the same style
across a site. These are relevant directions for a child product with many
colorful routes:

- use one stable focus shape instead of asking the learner to relearn a ring
  color on each screen;
- attach the indicator closely to the action it identifies;
- keep it visible without requiring English reading or color naming;
- avoid pulsing, bouncing, or competing animation; and
- preserve the same treatment from child tasks into caregiver/account
  controls.

The COGA pattern is supplemental guidance with cognitive-disability personas,
not a WCAG conformance criterion or a study of young multilingual children.
The focus-indicator repair can improve discoverability while still failing to
show whether a learner knows what **Next**, **Listen**, or an icon means.

## Bounded implementation contract

In scope:

- one shared focus treatment for `controlClassName` and the text-control
  primitive in `src/shared/ui.tsx`;
- the matching base fallback for buttons, inputs, textareas, and selects in
  `src/styles.css`, without page-specific copies;
- all current shared variants, frames, elevations, shapes, and sizes;
- enabled rest, hover, active, keyboard-focus, and retained-focus pending
  renderings;
- light, navy, gradient, and representative image-adjacent placements;
- forced-colors behavior and focus-ring/elevation composition; and
- behavior-based tests and screenshot evidence.

Not changed:

- DOM order, focus order, focus movement, routes, labels, target sizes,
  navigation, audio, task/domain timing, or data;
- component fill/foreground contrast already handled by the preceding branch;
- native disabled focusability or a general disabled palette; and
- unrelated route-specific focus treatments unless a shared consumer cannot be
  validated without a narrowly documented follow-up.

## Validation plan and completion boundary

The following was the pre-implementation target. The implementation automates
the representative same-pixel area cases, synchronous entry/exit timing,
retained pending focus, and computed forced-colors outline fallback described
in the companion evidence memo. Shift+Tab, hover/active combinations,
exhaustive adjacent-pixel contrast, explicit before/after geometry equality,
and a post-pending activation attempt remain follow-up work. Follow the
repository rule: use Playwright and accessible locators; never assert source
strings or Tailwind class names.

### Automated browser contract

1. Reach representative controls with `Tab` and `Shift+Tab`, including a
   button, link, icon button, text control, account-menu item, and form field.
2. Assert focus remains on the expected accessible role/name and that a visible
   indicator persists until focus moves. Pointer click need not show the
   `:focus-visible` treatment.
3. Record rendered outline style, width, offset, color, inner ring/shadow,
   opacity, filter, bounding box, and adjacent surface. Use these as computed
   evidence, not source/class assertions.
4. Require at least 3:1 adjacent contrast for enough authored indicator pixels
   on solid light, navy, and colored surfaces. Check hover+focus and
   active+focus; include a raised control so elevation cannot cover the lower
   ring.
5. For the voluntary AAA target, compare focused and unfocused rendered pixels
   and require at least a two-CSS-pixel-perimeter equivalent whose same-pixel
   change reaches 3:1. Do not infer changed area merely from declared widths.
6. On gradients and image-adjacent placements, sample or inspect the full
   perimeter at controlled deterministic states. A single convenient pixel is
   insufficient.
7. Emulate forced colors and verify the outline remains visible and at least 2
   CSS px thick when the inner shadow/ring is absent. Do not assert an authored RGB
   value that the user agent is expected to replace.
8. Verify the focus effect neither changes control geometry nor creates main
   horizontal overflow at 280×568, 390×844, 640×360, and 1440×900. Check that
   menus, cards, and viewport edges do not clip the indicator.
9. Verify an `aria-disabled` control that intentionally retains focus still has
   a visible, stable indicator and does not activate. Record the inactive
   exception and any remaining opacity limitation rather than claiming a false
   universal ratio.
10. Preserve all existing navigation, profile advancement, lesson/story
    control behavior, reduced-motion behavior, and accessible names.

Suggested real surfaces include **Set up profile** on the learner-profile
gradient, **Speak your answer** as an icon control, a shared action on a
white/card surface, **Sign out** or **Delete account** inside the navy account
menu, a raised lesson/story action near art, and a real input or textarea.

### Human and device follow-up

- Safari/VoiceOver on macOS or iOS, Chrome/TalkBack on Android, and the actual
  supported Windows browser with Windows High Contrast/forced-colors themes;
- keyboard, switch-style navigation, zoom, increased text spacing, small/short
  viewports, glare, and common device display settings;
- light, dark, and user-customized forced-color palettes, not one emulated
  screenshot; and
- observation with children/caregivers who vary in English, vision, motor
  needs, device familiarity, and prior keyboard/switch experience.

Ask participants to move through a small task and point to where the next
keyboard or switch action will occur. Record hesitation, lost-position events,
wrong activation, adult prompts, and calm recovery. Do not require them to name
a color, read a label aloud, or disclose a diagnosis. Do not retain child
audio, identifiers, or unnecessary video.

## Rollback and review signals

Revise or roll back the implementation if:

- either band is clipped or covered on a required shared surface;
- focus is unclear on navy, a deterministic image/gradient placement, or in
  forced-colors mode;
- either focus band replaces a control's elevation or changes its geometry;
- hover, active, an ancestor filter, or a focus-retaining pending state erases
  the indicator;
- route-specific overrides produce inconsistent focus for the same shared
  role; or
- learner/caregiver observation shows more lost-position errors or the ring is
  mistaken for selection, error, or reward feedback.

Retain the repair provisionally only after the focused browser matrix, full
responsive suite, build/lint checks, and genuine in-app Browser screenshots
pass. A passing automated matrix is evidence for the bounded shared treatment,
not whole-product accessibility or child comprehension.

## Rejected shortcuts

- **Change the single outline to white:** rejected because it can disappear on
  white and pale-sky surfaces.
- **Change the single outline to a darker navy:** rejected because one dark
  color still performs poorly on dark menus and artwork.
- **Use route-specific light or dark rings:** rejected as the first repair
  because it is easy to miss consumers and weakens a consistent learned state.
- **Use `box-shadow` alone:** rejected because forced-colors mode commonly
  suppresses it and the CSS specification makes it compute to `none`.
- **Keep the four-pixel offset region transparent and count it as focus area:**
  rejected; the selected inner ring fills it in normal colors, and unchanged
  transparent pixels are not indicator area.
- **Assert only the 16.576:1 band-pair ratio:** rejected because C40's guarantee
  has geometry and solid-background preconditions.
- **Call the two-pixel changed-area rule AA:** rejected because Focus Appearance
  is Level AAA in WCAG 2.2.
- **Hide focus on a retained `aria-disabled` pending action by citing the
  inactive exception:** rejected as a Parrot usability choice; the user still
  needs to know where interaction will resume.
- **Add a pulsing or bouncing ring:** rejected because contrast and a stable
  perimeter are sufficient candidates, while motion can compete with the
  learning task and would add a reduced-motion obligation.

## Evidence limits and unresolved questions

- Will the two-band treatment remain visually distinct when composited with
  every existing raised shadow and ancestor brightness filter?
- Which current shared consumers sit close enough to clipping ancestors or the
  viewport edge to need spacing or a local focus plate?
- Does the 60% whole-control opacity on a focus-retaining `aria-disabled`
  action require a narrowly coupled pending-state revision?
- Which URL-backed images remain beside controls in forced-colors mode, and do
  target browsers expose the same system outline behavior?
- Do the selected four-pixel bands feel clear without being mistaken for
  selection or reward feedback on small physical devices?
- Can children and caregivers identify the current interaction point without
  reading or naming a color, and without mistaking focus for selection?

The next cheapest remaining evidence is a real Windows High Contrast pass,
keyboard/switch observation, and the unautomated state combinations above.
Broader route-specific focus and disabled-palette work should be separate
branches.

## Primary sources

Sources were opened and checked on 2026-08-21.

- W3C, [Web Content Accessibility Guidelines
  2.2](https://www.w3.org/TR/WCAG22/), Recommendation republished 2024-12-12
  (original Recommendation 2023): normative SC 1.4.11, 2.4.7, 2.4.11,
  2.4.12, and 2.4.13.
- W3C WAI, [Understanding Focus
  Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html),
  updated 2026-07-12; [Understanding Non-text
  Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast),
  updated 2026-06-15; [Understanding Focus
  Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html),
  updated 2026-03-09; and [Understanding Focus Not Obscured
  (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html),
  updated 2026-06-15. These documents are informative, not extra conformance
  requirements.
- W3C WAI, [Technique C40: Creating a two-color focus
  indicator](https://www.w3.org/WAI/WCAG22/Techniques/css/C40.html), updated
  2026-01-12, and [Technique C45: Using
  `:focus-visible`](https://www.w3.org/WAI/WCAG22/Techniques/css/C45.html),
  updated 2025-09-25. Techniques are sufficient examples, not required methods.
- W3C, [CSS Color Adjustment Module Level
  1](https://www.w3.org/TR/css-color-adjust-1/), Candidate Recommendation
  Snapshot 2025-12-16. It is on the Recommendation track but is not yet a W3C
  Recommendation; target implementation testing remains necessary.
- W3C COGA, [Use a Consistent Visual
  Design](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p03-consistent-design/),
  content first published 2021-04-29, interface posted 2022-01. This is
  supplemental cognitive-accessibility guidance, not a WCAG success criterion
  or child-product study.
