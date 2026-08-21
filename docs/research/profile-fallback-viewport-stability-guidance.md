# Profile Fallback Viewport-Stability Guidance

Last reviewed: 2026-08-21

Branch: `codex/profile-fallback-viewport-stability`

Status: bounded research hand-off; it does not claim an implementation result,
WCAG conformance, or child comprehension

## Question and scope

How should the form-based learner-profile fallback keep its current context and
actions stable at narrow and short viewports while preserving the existing
profile flow?

This note informs four implementation concerns already identified by the
[first-use visual audit](./first-use-visual-hierarchy-audit.md):

1. responsive reflow at 280×568, 390×844, 640×360, and 1440×900;
2. space reservation for the 1024×1024 Peppa image;
3. scroll and focus hand-off when one same-route profile step replaces another;
   and
4. preservation of child-sized pointer targets and beginner-readable context
   while the layout becomes more compact.

It does not authorize changes to profile questions, copy, question order,
bilingual support, audio, transcription, skip behavior, acknowledgment pacing,
API contracts, persistence, or character art. It also does not establish that
every valid translation or generated acknowledgment can fit without vertical
scrolling.

## What the sources support

| Topic | Bounded source claim | Parrot implication | Important limit |
| --- | --- | --- | --- |
| Narrow-width reflow | WCAG 2.2 SC 1.4.10 requires non-excepted horizontal-language content to work without information/function loss or two-dimensional scrolling at a width equivalent to 320 CSS px. Responsive sections may adjust, relocate, or stack if their content remains available. See [A11Y-15](./source-register.md). | Keep profile content inside one page-wide horizontal scroll boundary. At narrow portrait, stack the existing art, prompt, answer, and actions in a logical reading order. | WCAG permits vertical scrolling for this content. The project's 280 px check is stricter than the criterion's 320 px width, and the criterion does not require an entire step to fit in a 360 px-tall viewport. |
| Short-height composition | W3C reflow guidance describes layout adaptation, while WCAG focus guidance requires a logical sequence and protects focused controls from author-created obstruction. See [A11Y-15 and A11Y-16](./source-register.md). | Use a deliberate short/short-wide composition at 640×360: spend horizontal space, reduce empty gaps and illustration size before child text or controls, and keep the focused step origin clear of the account header. | No cited standard selects Parrot's breakpoint or proves that a side-by-side layout is easier for a five-year-old. “Current action visible at scroll zero” is a product acceptance criterion derived from the observed task failure. |
| Image loading and movement | Google web.dev identifies dimensionless images as a common layout-shift cause and recommends intrinsic `width`/`height` or an equivalent reserved `aspect-ratio`. W3C COGA also recommends that controls and content not move unexpectedly during load. See [PERF-04 and A11Y-11](./source-register.md). | Give every profile use of `peppa-happy.webp` its known 1024×1024 intrinsic geometry, keep responsive sizing and `height: auto`/containment, and reserve the same square before decode. Do not block the step on the image. | web.dev is performance guidance, not a normative accessibility rule or child study. A local ≤1 px geometry regression check is deliberately stricter and more diagnostic than claiming a CLS result. |
| Same-route step replacement | WCAG Focus Order requires a sequence that preserves meaning and operation and allows programmatic focus on static content. A WAI-ARIA APG navigation example says that after an activated control replaces SPA content, moving focus to the beginning of the new content—ideally its level-one heading—can confirm the destination. See [A11Y-16](./source-register.md). | On setup → question, question → acknowledgment, and acknowledgment → next question, reset the profile-owned scrollport and focus the new step heading once. Keep the answer/action controls next in DOM and sequential focus order. | The APG example is an illustrative navigation-tree pattern, not a normative rule for every dynamic update. Moving focus on unrelated rerenders or background updates can itself be disruptive. Test the chosen behavior with target assistive technology. |
| Pointer targets | WCAG 2.2 AA SC 2.5.8 sets a 24×24 CSS px minimum with exceptions; AAA SC 2.5.5 uses 44×44 CSS px and notes special value for frequent or sequential-task controls. See [A11Y-05](./source-register.md) and W3C's [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced). | Preserve Parrot's existing 44×44 CSS px floor for **Set up profile**, **Skip for now**, answer entry controls, speech, **Next**, and editor actions even in the compact layout. | Forty-four pixels is a defensible project baseline and the WCAG AAA target, not direct evidence of the optimal size for this child population. CSS pixels are not physical millimetres. |
| Young learners with weak English | Head Start says pictures can help some young children understand instructions, routines, and what happens next. CEFR Pre-A1 guidance supports short action language with visual, gesture, repetition, or reformulation support. W3C COGA recommends common words, visible labels, clear steps, and stable placement. See [LANG-09, LANG-10, A11Y-01, A11Y-02, A11Y-03, and A11Y-11](./source-register.md). | Keep the familiar character, current step heading, visible literal action labels, and one coherent next action together. Make room by reducing decoration and empty space, not by hiding labels, shrinking text, or relying on art alone to explain the task. | Most cited accessibility patterns use disability personas rather than young multilingual learners. Head Start is practitioner guidance, and neither source proves that this Peppa image communicates a specific profile action across languages or cultures. |

## Implementation guidance for this branch

### Reserve the real art geometry

The checked asset
`public/assets/characters/peppa/peppa-happy.webp` is 1024×1024. Apply that
intrinsic ratio to the setup, question, acknowledgment, and profile-editor
images. Width and height attributes are preferable when the intrinsic source
dimensions are known; a square wrapper or `aspect-ratio` can reinforce the
responsive layout, but it should not substitute a different ratio or distort
the picture.

The reserved box should exist before the response decodes. The picture may
continue loading asynchronously because the profile task and its actions do not
depend on image completion.

### Compact by viewport shape, not by child capability

The observed 640×360 defect comes from applying a taller `sm:` composition to a
wide but short screen. A short-wide variant can put a smaller character beside
the step content and use the available width. Narrow portrait can remain a
single logical column.

Compact in this order:

1. remove excess outer padding and empty gaps;
2. reduce the decorative/familiar-character display size;
3. use horizontal space when width is available; then
4. allow controlled vertical scroll for genuinely long content.

Do not compact by reducing the visible child text below the established type
scale, shrinking pointer areas below 44×44 CSS px, hiding **Skip for now**, or
placing controls over the illustration. Visual repositioning must not create a
DOM/focus order that contradicts the apparent reading order.

### Treat each replacement as a new step

The route path does not change, so a pathname-based focus effect cannot restore
the learner's context. Each profile step needs a stable identity that drives one
handoff after the new heading is mounted:

- set the profile scroll container to its visible origin;
- programmatically focus the new `h1` without adding it to the normal Tab
  sequence (`tabIndex={-1}` is appropriate);
- leave the current input or action as the next ordinary focus stop; and
- do not repeat the handoff for loading, audio, text-entry, or other
  same-step rerenders.

The exact scheduling mechanism is an implementation detail. Verification must
show the final scroll and focus state rather than assert a particular React
hook or CSS class.

## Decisions and rejected shortcuts

Retain the following bounded decisions:

- reserve the known square image before decode;
- add portrait-short and short-wide layout behavior to the existing profile
  components;
- reset the profile-owned scroll position and focus the heading at every
  user-initiated step boundary; and
- preserve visible copy, 44 px targets, keyboard activation, and the explicit
  child-paced **Next** behavior.

Reject these shortcuts:

- hiding or delaying the profile controls until the art loads;
- auto-scrolling only to an action while leaving its question/context above the
  viewport;
- solving short height by removing **Skip for now**, truncating the prompt,
  shrinking targets, or reducing child text first;
- moving focus on every rerender instead of once per new step;
- using CSS visual order that disagrees with DOM and focus order; or
- reporting the delayed-image probe as a field CLS or child-usability result.

## Suggested validation

Use rendered behavior and accessible locators rather than source-class
assertions.

### Automated viewport contract

At 280×568, 390×844, 640×360, and 1440×900:

1. hold the Peppa response, record the heading and actions, release/decode it,
   and require each tracked box to move by no more than 1 CSS px;
2. require no document-level horizontal overflow, account-header overlap, or
   clipped profile control;
3. require **Set up profile** and **Skip for now** to be wholly visible from
   profile scroll position zero;
4. activate setup without a test-only scroll helper and require the question
   heading plus complete answer entry to be visible;
5. require the new heading to own focus, the profile scrollport to be at zero,
   and the first answer/action to follow it logically;
6. answer once, verify the acknowledgment is stable and child-paced, activate
   **Next**, and require the next question heading to be visible and focused;
7. require every profile action target to be at least 44×44 CSS px; and
8. confirm keyboard activation and accessible names are unchanged.

Also test a same-step rerender after the learner has moved focus into an answer
control; it must not steal focus back to the heading.

### Human and device follow-up

Automated geometry cannot answer comprehension. Before treating the design as
validated for its audience, observe representative young learners and
caregivers on target phone and tablet hardware. Record whether learners can:

- identify what to do without an adult reading the whole page;
- find setup, skip, answer, speech, and next actions without exploratory
  scrolling;
- recover orientation after each transition; and
- use the controls without frequent missed or accidental taps.

Separately test VoiceOver/Safari and TalkBack/Chrome for heading announcement,
focus visibility, and next-tab order. Add long valid English, Chinese, and other
future translations plus 200% zoom/text-spacing probes before claiming broad
localization or low-vision support.

## Evidence limits

- No source here is a direct usability trial of Parrot English.
- No child, caregiver, multilingual learner, switch user, or screen-reader user
  participated in this research pass.
- WCAG is an accessibility standard, not a developmental curriculum or proof
  that a five-year-old understands the interface.
- COGA patterns are supplemental rather than conformance criteria, and most of
  their personas are adults with cognitive or learning disabilities.
- Head Start visual-support guidance applies to early-learning practice; it
  does not establish that this character picture communicates the profile task.
- web.dev explains browser layout-shift mechanics; its recommendations do not
  select Parrot's exact art size, breakpoint, or ≤1 px test threshold.
- A complete step at 640×360 and successful rendering at 280 px are Parrot
  product requirements. They must not be described as thresholds mandated by
  WCAG 2.2.

## Primary sources

- W3C WAI, [Understanding WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), updated 2026-06-12; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), updated 2026-03-09; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum), updated 2026-06-15; accessed 2026-08-21.
- W3C WAI-ARIA APG, [Navigation Treeview Example: Focus Movement After Content Load](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/), example accessed 2026-08-21.
- Google web.dev, [Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls), last updated 2025-02-07; accessed 2026-08-21.
- W3C COGA, [Ensure Controls and Content Do Not Move Unexpectedly](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p01-unexpected-movement/), content first published 2021, UI posted 2022; accessed 2026-08-21.
- W3C WAI, [Understanding WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced), updated 2026-05-11; accessed 2026-08-21.
- US Office of Head Start, [Visual Supports](https://headstart.gov/children-disabilities/article/visual-supports), accessed 2026-08-21.
- W3C COGA, [Use Clear Words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/) and [Make Each Step Clear](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/), content first published 2021, UI posted 2022; accessed 2026-08-21.
