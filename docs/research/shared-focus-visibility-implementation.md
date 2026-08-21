# Shared focus visibility implementation

Status: implemented and provisionally retained

Branch: `codex/shared-focus-visibility`

Base: `codex/contrast-safe-child-actions` at `a851d88`

Research commit: `2c988b3`

Implementation commit: `d5e1bdc`

Review date: 2026-08-21

## Outcome

The shared keyboard-focus treatment now remains visually identifiable across
the tested light, navy, gradient, selected, raised, and image-adjacent
placements without changing component size, focus order, labels, navigation,
or domain behavior.

The implementation introduces semantic light and dark focus tokens and renders
a contiguous pair:

1. a four-CSS-pixel white inner ring, implemented as the Tailwind ring shadow;
2. a four-CSS-pixel deep-navy real outline at a four-pixel offset.

The inner ring fills the outline-offset region. Normal-color order is therefore
control → white → deep navy → surrounding surface, with no transparent gap.
The focus footprint remains the same eight CSS pixels outside the control that
the previous four-pixel, four-pixel-offset outline occupied. The two focus
colors are 16.576:1 apart.

## Problem and hypothesis

The prior shared `#173c67` outline was clear on pale child surfaces but only
1.278:1 against the account menu's `#204c7f` navy. The same single-color
treatment also disappeared on the dark Story Reader header. A single light
replacement would create the inverse problem on white and pale-sky surfaces.

The bounded hypothesis was that a stable two-color treatment could preserve
Parrot's playful surface colors while making the keyboard interaction point
findable without extra English, motion, or route-specific ring choices.

## Implementation decisions

- `--color-focus-light: #ffffff` and `--color-focus-dark: #061f3b` express the
  purpose of the colors instead of borrowing a decorative token.
- Shared actions, links, menu controls, icon buttons, text actions, segmented
  controls, and base button/input/textarea/select fallbacks use the same
  rendered geometry.
- The real outline is retained as an independently sized fallback. In
  forced-colors mode, the browser suppresses `box-shadow`, while the real
  outline remains available for system-color mapping.
- Existing elevation shadows remain composed under the Tailwind focus ring;
  neither focus band changes layout geometry.
- `box-shadow` is excluded from the shared 150 ms transition property.
  Translate and filter feedback may still transition, but both focus bands now
  appear and disappear with the focused style instead of arriving late or
  lingering after focus moves. The bounded collateral change is that shared
  elevation and segmented-selection shadow changes are now synchronous too.

No labels, DOM order, routes, lesson/story content, data, audio, navigation,
target size, or production dependency changed.

## Feedback timing finding

The first candidate was visually correct after settling but transitioned the
white band from transparent over 150 ms. In one exploratory local Chromium run
against the navy-menu **Learner profile** item, a focus-event sample and later
computed-style samples measured the ring at 0 px/transparent initially, about
1.203 px and 30% opacity after 16 ms, about 2.731 px and 68.2% opacity after 50
ms, and the full four pixels after 150 ms. These intermediate values diagnose
the transition; they are not a performance benchmark or retained trace. The
committed regression instead requires the initial focused shadow to equal its
200 ms settled value.

After excluding `box-shadow`, the white band is already four pixels and fully
opaque synchronously and remains so at 16 ms. It also disappears immediately
when focus leaves, avoiding two simultaneous focus locations. A focus-scoped
alternative preserved ordinary shadow transitions on entry but made the old
ring fade out for 150 ms on exit; it was rejected. The branch changes focus,
elevation-shadow, and segmented-selection-shadow presentation timing, not a
task or domain timeout.

## Automated evidence

The new behavior-based Playwright contract uses accessible locators and stable
route-driven focus. It compares focused and unfocused screenshots at matching
pixels, counts changes of at least 3:1, and requires at least the area of a
two-CSS-pixel perimeter using the rendered target geometry.

The unchanged base failed exactly two of 12 cases:

- account-menu **Learner profile**: 0 qualifying CSS px² versus 857 required;
  strongest same-position change 1.280:1;
- Story Reader **Back**: 0 qualifying CSS px² versus 327 required; strongest
  same-position change 1.000:1.

The implementation passes all 12 cases, covering:

- dark account-menu and Story Reader header controls;
- a light profile action, transparent text action, textarea, and icon button;
- a story-card link and selected segmented tab;
- an image-adjacent lesson action at 1440×900, with 640×360 retained as visual
  evidence;
- synchronous focus entry and exit without a fading second location;
- a focus-retaining `aria-disabled` My Lessons retry; and
- a forced-colors emulation check that `:focus-visible` retains a computed
  non-`none` real outline at least two CSS pixels wide.

Full validation at `d5e1bdc`:

| Check | Result |
| --- | --- |
| Focus regression | 12/12 passed; a separate focused repeat run passed 18/18 |
| Unit/integration/lifecycle/safety | 679/679 passed in 90 suites |
| Full Chromium browser suite | 230/230 passed in 47.1 seconds |
| Production build | Passed; core 497.00 kB raw / 149.97 kB gzip, CSS 86.75 kB raw / 15.08 kB gzip |
| Lint | 0 errors; 2 pre-existing generated-file warnings |
| Patch integrity | `git diff --check` passed |

## Visual evidence

The [artifact manifest](../../artifacts/ux-review/shared-focus-visibility/manifest.md)
records 13 genuine in-app Browser JPEGs, their source commits, deterministic
mock provenance, accessible targets, viewports, and SHA-256 digests. Matched
before/after evidence covers the 280×568 profile action, 390×844 navy account
menu, and 390×844 dark Story Reader header. Additional candidate images cover
form/text/icon controls, a selected tab, a story card at the viewport edge, and
lesson artwork at 640×360 and 1440×900.

No reviewed candidate showed main horizontal overflow, clipped shared focus,
or changed control geometry. This is bounded visual evidence, not proof across
every arbitrary artwork pixel or physical display.

## Interpretation and boundaries

Retain the shared treatment provisionally. It repairs the two observed
dark-surface failures, makes focus feedback immediate, preserves existing
component geometry, and passes the current routed regression matrix.

The evidence must not be overstated:

- the pixel test supports a same-position changed-area target inspired by WCAG
  2.4.13; it is not an exhaustive adjacent-pixel audit or a whole-product WCAG
  conformance assessment;
- deterministic gradients and image placements are samples, not a guarantee
  for every future image or composited surface;
- forced-colors testing verifies computed outline presence and size in browser
  emulation, not the used system color, Windows High Contrast palettes, or a
  real target device;
- the retained-focus pending case checks persistence, not a universal contrast
  claim for every whole-control opacity/filter combination;
- Safari, Firefox, target mobile devices, VoiceOver, TalkBack, NVDA, switch
  input, zoom, text spacing, glare, and physical display behavior remain
  untested; and
- no child or caregiver has yet shown that the ring communicates “where the
  next action will happen” without being mistaken for selection, error, or a
  reward.

## Follow-up

`StoryReader.tsx` has a separate programmatic page-text focus treatment using
sky against cream; its measured pair is about 1.603:1 and it does not consume
the shared control primitive. Custom lesson/editor focus styles and any
focus-retaining whole-control opacity interactions also need their own bounded
inventory rather than being silently claimed as fixed here.

The next cheapest visual follow-up is a small stacked branch for the Story
Reader page-text focus cue, including a decision about whether that
programmatic reading-position cue should look like an interactive selection.
The already-prioritized generated profile-feedback language contract should
then shorten the normal 160-character acknowledgment case for young English
beginners.
