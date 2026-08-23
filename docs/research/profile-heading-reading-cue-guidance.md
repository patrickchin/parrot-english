# Profile heading reading-position cue guidance

Status: researched; candidate selected; implementation pending

Branch: `codex/profile-heading-reading-cue`

Base: `codex/lesson-microphone-direct-action-feedback` documentation hand-off
at `9739789`

Research date: 2026-08-24

## Question

When profile setup moves focus to each newly shown heading, can the visual cue
remain clear after pointer, touch-like, and keyboard transitions without making
static words resemble a text field?

**Selected candidate:** preserve the existing heading-focus lifecycle and give
all setup, question, and acknowledgment headings one shared, static reading-
position cue: a four-CSS-pixel brand-blue rule whose outer edge starts eight
pixels before the heading's inline start, leaving four clear pixels before the
heading box. Cap the rule at 96 px for defensive long copy. Apply it on
`:focus`, not only `:focus-visible`, and replace it with a real two-pixel,
system-mapped outline in forced-colors mode.

The cue means **the new step starts here**. It is not a control, caret,
selection, validation state, progress signal, or narration tracker. It adds no
words, icon, motion, sound, timer, or new sequential Tab stop.

## Decision revision, 2026-08-24

The research candidate used an eight-pixel outer offset and extended the marker
through the complete heading height. The first coded pass temporarily copied
the Story Reader completion heading's twelve-pixel offset. Genuine in-app
Browser comparison settled both details before the candidate was retained:

1. At 280×568, the question card's inner border begins at x=18 and its heading
   begins at x=30. The twelve-pixel candidate occupied x=18…22 and touched the
   card border. The retained eight-pixel offset occupies x=22…26, leaving four
   pixels to the inner border and four pixels before the heading box.
2. At the same viewport, the retained 160-character compatibility
   acknowledgment is 212×300 px. A 300 px rule occupied 61.5% of its 488 px
   card and looked like a quotation bar rather than a calm arrival cue.
3. The revised marker uses the same 96 px maximum as the ordinary three-line
   setup heading. It remains full height on current production setup, question,
   and short acknowledgment copy, but marks only the beginning of defensive
   long copy. A rendered regression requires zero changed marker-strip pixels
   below that cap.

The forced-colors fallback remains a complete real outline. That mode favors a
robust system-mapped focus location over the normal-color visual distinction.

## Audience and scope

The primary audience is a young learner with little English. The cue therefore
must work as location feedback without requiring the child to read an extra
instruction, identify a color by name, or understand desktop form chrome. It
also matters to sighted keyboard and switch users and to caregivers following
the same route transition.

In scope:

- setup, each question, and each acknowledgment in the form-profile flow;
- initial load plus pointer- and keyboard-initiated step changes;
- 280×568 and 390×844 portrait, 640×360 short landscape, and 1440×900 desktop;
- normal colors, reduced motion, and forced-colors emulation;
- focus, forward Tab order, scroll origin, wrapping, containment, overflow,
  rendered marker visibility, and visual review; and
- the retained 160-character acknowledgment compatibility fixture.

Out of scope:

- changing whether or when the route focuses a heading;
- copy, question order, acknowledgment timing, saved audio, APIs, data,
  validation, or profile persistence;
- changing the shared focus treatment for interactive controls;
- localization, RTL behavior, or a new global visual token;
- a claim of WCAG conformance; and
- direct evidence of child comprehension or assistive-technology speech order.

## Direct product evidence

### Current implementation

`useLearnerProfileStepHeading` resets the owned `main` scrollport and, on the
next animation frame, focuses the current native `h1` once for its step key
with `preventScroll: true`. Setup keys the effect with `"setup"`, questions
with their answer key, and acknowledgments with their operation ID. Every
heading remains `tabIndex={-1}`, so focus can provide route orientation without
adding a normal Tab stop.

The repository's authored global focus treatment applies to buttons and form
fields, not headings. Profile headings therefore rely on browser defaults.
The question card places that browser-rendered heading treatment directly
above a genuine outlined textarea, strengthening the false field affordance.

The current six-question route has thirteen heading arrivals: one setup, six
questions, and six acknowledgments.

### Reproduction at base `9739789`

Fresh deterministic Playwright Chromium inspection found two contradictory
presentations from the same correct focus lifecycle:

| Transition | Active element | `:focus-visible` | Computed outline |
| --- | --- | --- | --- |
| Initial setup load | Setup `h1` | Yes | UA `auto`, 1 px, offset 0 |
| Keyboard **Set up profile** → question | Question `h1` | Yes | UA `auto`, 1 px, offset 0 |
| Pointer **Set up profile** → question | Question `h1` | No | None |
| Keyboard **Next** → acknowledgment | Acknowledgment `h1` | Yes | UA `auto`, 1 px, offset 0 |
| Pointer **Next** → acknowledgment | Acknowledgment `h1` | No | None |
| Pointer transition with forced colors emulated | New `h1` | No | None |

Thus the current cue is not merely unattractive. Depending on input history and
user-agent heuristics, it is either a tight closed rectangle that resembles a
field or no visible arrival cue at all. The native semantics, names, focus,
scroll origin, and route transitions remained correct.

At 280×568, 390×844, 640×360, and 1440×900, the reproduced baseline kept the
main scrollport at zero and created no document or main horizontal overflow.
Those are preservation requirements, not evidence that the current focus
presentation is acceptable.

## Standards and platform boundary

The durable source register entries [A11Y-16, A11Y-17, A11Y-18, A11Y-22, and
A11Y-25](./source-register.md) apply. The following separates standards facts
from Parrot product choices.

### Keep the native, non-sequential heading target

The [HTML Standard's `tabindex`
algorithm](https://html.spec.whatwg.org/multipage/interaction.html#the-tabindex-attribute)
allows a negative value to make an element programmatically focusable while
expressing that it should be omitted from sequential focus navigation. The
[HTML Accessibility API Mappings working
draft](https://www.w3.org/TR/html-aam-1.0/#el-h1-h6) maps `h1` to a heading with
level one. These sources support preserving the current native element and
negative tabindex; they do not mandate that Parrot focus it.

W3C's informative [Focus Order
guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) allows
programmatically focused static content when the sequence still preserves
meaning and operation. The APG [SPA-style navigation
example](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/)
shows focusing a newly displayed level-one heading as one optional pattern and
calls for target assistive-technology testing. Parrot's one-step hand-off is a
product inference from that guidance, not a universal requirement.

### `:focus-visible` cannot own route-arrival feedback

The 22 January 2026 Working Draft of [Selectors Level
4](https://www.w3.org/TR/selectors-4/#the-focus-visible-pseudo) defines
`:focus` as matching the focused element while `:focus-visible` depends on
user-agent heuristics. Its non-normative suggestions explicitly allow a
pointer interaction followed by scripted focus on non-input content not to
match `:focus-visible`. That describes the reproduced profile transition.

[Technique C45](https://www.w3.org/WAI/WCAG22/Techniques/css/C45.html) is a
sufficient keyboard-focus technique, not a ban on `:focus`; it notes that
pointer users can also benefit from a visible focus indicator. Since a child
cannot directly pointer-focus these negative-tabindex headings, styling actual
focus gives every route-trigger modality the same arrival feedback without
adding hover or control affordance.

### Visibility targets are product guardrails

[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
is Level AA and does not prescribe a particular shape. [Focus
Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
provides a Level AAA changed-area target. A profile heading is static context,
not clearly a user-interface component, so this branch will not label its
current presentation a proven SC 1.4.11 or 2.4.13 failure.

Parrot will voluntarily require the normal marker to render at least a three-
CSS-pixel-equivalent changed area across the heading height up to a 96 px cap,
at 3:1 or better against the actual composited card surface. This is a testable
usability guardrail, not child-comprehension evidence or whole-page
conformance.

### Forced colors needs a real outline

The [CSS Color Adjustment Module Level
1](https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties) says
forced-colors mode maps outline color through the user's system palette and
suppresses box shadows when `forced-color-adjust` is `auto`. The decorative
normal-color rule should therefore hide while a real outline of at least two
CSS pixels remains. Browser emulation cannot prove every Windows palette,
physical display, or target browser.

### Live-region risk remains separate

The acknowledgment contains its focused heading inside `aria-live="polite"`.
[WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/#aria-live) defines polite
updates as low-priority suggestions whose presentation may vary by user agent,
assistive technology, and user preference. This visual branch preserves that
structure. It cannot establish whether a target screen reader repeats,
reorders, or overlaps the heading and saved audio.

## Options considered

### Keep the browser default

Rejected. It is browser- and modality-dependent, uses a closed field-like
perimeter when shown, can disappear after pointer transitions, and has no
authored forced-colors guarantee.

### Use only `:focus-visible`

Rejected. It would retain the verified pointer/touch-like gap. The cue is
route-arrival feedback, not merely keyboard modality feedback.

### Reuse the shared two-band control ring

Rejected for normal colors. That ring is intentionally conspicuous around
operable buttons and fields. Giving static headings the same complete boundary
would preserve the exact false affordance this branch addresses.

### Add an icon, spoken cue, instruction, or animation

Rejected. Each adds language, sensory, timing, or attention cost without
repairing the focus presentation. The existing heading already carries the
step's meaning.

### Remove programmatic heading focus

Not selected inside this bounded visual branch. The existing same-route
orientation behavior and forward Tab sequence are coherent and tested. A
target screen-reader/switch study can compare heading focus with first-action
focus later.

### Selected: one shared open reading-position marker

Use the established Story Reader completion grammar:

- a four-pixel `brand-blue` vertical rule;
- place its outer edge eight pixels before the heading box, leaving four pixels
  of card surface before that box;
- keep it full height for ordinary headings and top-align it with a 96 px cap
  for defensive long copy;
- show it on `:focus` and clear it immediately on blur;
- remove the UA outline in normal colors;
- hide the decorative rule and expose a real two-pixel outline with a two-pixel
  offset in forced colors;
- keep all heading boxes and glyph positions unchanged; and
- centralize this presentation and the existing hook in a small
  `LearnerProfileStepHeading` component rather than copying focus utilities
  across three route views.

## Implementation plan

1. Add rendered-behavior tests before implementation. Reuse the decoded-
   screenshot helpers already used for Story Reader reading markers.
2. Prove the tests fail on the browser-default baseline for pointer visibility,
   open-marker shape, and forced-colors fallback.
3. Introduce the smallest shared heading component in
   `LearnerProfileLayout.tsx`; keep the existing hook implementation unchanged.
4. Replace only the three native `h1` call sites with that component while
   preserving text, IDs, typography, layout utilities, and semantics.
5. Run focused tests, then all profile/focus tests, the complete browser suite,
   unit/integration/lifecycle/safety tests, production build, TypeScript, and
   lint.
6. Capture genuine in-app Browser screenshots, inspect them at original
   resolution, invite independent code/accessibility/visual review, and revise
   before retention.

## Automated acceptance contract

Follow the repository rule: locate rendered content accessibly and never
assert Tailwind class strings or CSS source.

1. Setup, question, normal acknowledgment, and 160-character acknowledgment
   retain native level-one heading semantics, exact visible names, existing
   IDs where present, `tabIndex=-1`, and programmatic focus.
2. Pointer and keyboard transitions both render the same open marker even when
   Chromium reports `:focus-visible=false` after pointer activation.
3. Normal-color screenshot deltas contain at least a three-pixel-equivalent
   area at 3:1 or better in the exact left marker strip, across the heading
   height up to 96 px. The marker-to-heading gap, the same strip below that
   cap, and the right edge must have no qualifying change; a complete perimeter
   may not qualify as the normal cue.
4. Moving focus to the first ordinary destination clears the marker. Forward
   Tab remains setup → **Set up profile**, question → **Your answer**, and
   acknowledgment → **Next**.
5. Forced-colors emulation hides the decorative rule and leaves a computed
   non-`none` outline at least two CSS pixels wide. Rendered qualifying pixels
   must occur on both vertical edges; do not assert a particular system color.
6. Focus and blur do not change heading, glyph, card, textarea, art, or action
   rectangles by more than one CSS pixel, change line counts, move the main
   scroll origin, or create horizontal overflow at any target viewport.
7. The normal marker stays inside the card, remains separated from the first
   glyph and card border, stays full-height on ordinary current copy, and never
   exceeds 96 px on defensive long copy.
8. The cue has no CSS transition or animation and looks identical under
   reduced-motion preference.
9. Existing profile persistence, acknowledgment, viewport, shared focus, and
   route suites remain green.

## Visual review matrix

Capture focused and marker-cleared states in the genuine in-app Browser:

- setup at 280×568;
- question after pointer **Set up profile** at 390×844;
- question after keyboard activation at 640×360;
- acknowledgment after pointer submission at 280×568;
- acknowledgment at 640×360;
- the capped 160-character acknowledgment at 280×568; and
- setup or question at 1440×900.

At original resolution, review marker-to-glyph separation, complete marker
height, card containment, competition with the textarea and action, line wraps,
account-header clearance, and whether the cue reads as location rather than an
input or selection. Preserve dimensions, branch/commit provenance, state
measurements, and SHA-256 digests in an artifact manifest.

## Rollback and unresolved questions

Revise or reject the candidate if it changes wrapping or geometry, clips at a
required viewport, disappears after pointer input, resembles a caret or quote
bar, overwhelms the long compatibility heading, weakens interactive focus, or
fails the forced-colors fallback.

Residual validation gates remain:

- VoiceOver, TalkBack, NVDA, switch, voice-control, Safari, Firefox, real
  Windows High Contrast, zoom, text spacing, localization, and RTL;
- whether the question region and same-named focused heading are announced
  redundantly;
- whether the polite acknowledgment live region, heading focus, and saved
  audio repeat or overlap; and
- whether young learners and caregivers interpret the marker as a calm new-
  step location cue rather than punctuation, selection, or decoration.

The cheapest next evidence is a short moderated comparison with low-English
learners and caregivers: after a pointer transition, ask them to point to what
changed and what they would do next, without asking them to name the marker.
