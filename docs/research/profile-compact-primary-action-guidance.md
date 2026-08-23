# Profile compact primary-action guidance

Last reviewed: 2026-08-24

Branch: `codex/profile-compact-primary-action`

Stacked base: `codex/profile-operation-pending-focus` documentation hand-off at
`7e6d75a`

Status: implemented and provisionally retained; it does not claim WCAG
conformance or child comprehension

Implementation: `5b2fa73`; acceptance hardening: `7978833`; see the
[implementation record](./profile-compact-primary-action-implementation.md)
and [visual manifest](../../artifacts/ux-review/profile-compact-primary-action/manifest.md)

## Question and boundary

How should the learner-profile question keep its primary **Next** action
discoverable on a 320x640 CSS-pixel phone without making the task harder for a
young beginner who may not know to scroll?

**Selected answer:** keep the action in the existing card and normal document
flow, but reuse the question's already-tested short-screen decorative spacing
below 360 CSS pixels wide. Preserve the prompt, translation, answer area,
control order, font sizes, and full 144x52 **Next** target. Do not add a sticky
footer, nested scroll area, scroll cue, new words, or automatic scroll.

This is a layout-only discovery repair. It must not change the questionnaire,
copy, audio, microphone, answer persistence, pending-operation ownership,
error behavior, focus hand-off, account layer, or route.

## Audience and exclusions

The primary audience is a five-to-seven-year-old Pre-A1 learner who may have
little English, limited reading skill, uneven touchscreen experience, and no
reason to infer that the next task action is below the visible card. A nearby
adult may help, but the ordinary first question should not depend on that help.

The implementation may compact decorative card padding and vertical gaps at a
question-local narrow-width breakpoint. It must not:

- shrink text, artwork, the answer area, or any target;
- place controls over content or outside the question card;
- visually reorder controls away from their DOM and keyboard order;
- assume that one English label or icon is understood by every learner; or
- claim that a viewport contract substitutes for child, device, enlarged-text,
  software-keyboard, or assistive-technology testing.

## Direct product evidence

The production-copy deterministic profile fixture was measured in local
Chromium before any target was focused or scrolled into view.

| Viewport | Active layout variants | Main scroll range | Card | Next | Initial result |
| --- | --- | ---: | --- | --- | --- |
| 280x568 | base + `max-sm` + `short` | 0 px | y=28.75...539.25 | y=479.25...523.25 | complete |
| 320x640 | base + `max-sm` | 113 px | y=14...738.5 | y=658.5...710.5 | wholly below viewport |
| 390x844 | base + `max-sm` | 0 px | y=120.5...723.5 | y=643.5...695.5 | complete |
| 640x360 | `sm` + `short` + `short-wide` | 13 px | y=14...359 | y=299...343 | complete |
| 1440x900 | `sm` + `md` + `lg` + `wide` | 0 px | y=181...719 | y=623...675 | complete |

At 320x640, **Skip for now** ends at y=642.5 and is also clipped by 2.5
pixels. Keyboard focus scrolls the owned main container to 11 pixels for Skip
and then to its full 113-pixel range for Next. The current browser test calls
`scrollIntoViewIfNeeded()` before measuring those actions, masking the initial
discovery defect.

The failure is a breakpoint gap rather than unavoidable content length:

- `short` activates only through 620 CSS pixels of height;
- `sm` begins at 640 CSS pixels of width;
- 320x640 receives neither compact composition;
- the base card keeps 24-pixel padding and 20-pixel visual margins; and
- the 236-pixel footer interior wraps 104-pixel Skip, a 16-pixel gap, and the
  144-pixel Next onto two rows.

A width scan found the three-line English heading and hidden action through
346 pixels. The action becomes complete around 348 pixels because the footer
reflows, and the English heading becomes two lines at 360 pixels. A local
below-360px rule covers the fragile interval and leaves the existing 360px
composition unchanged.

These are deterministic CSS-pixel observations in one local Chromium build,
not device prevalence, production analytics, physical target measurements, or
learner behavior.

## Evidence and limits

### Important actions should be findable

W3C COGA recommends keeping critical-task controls, including submit controls,
visible without scrolling where possible and designing upward from the most
constrained experience. Google guidance for children's apps similarly advises
leading with important content and giving a hint when more content scrolls.
See [A11Y-20 and UX-04](./source-register.md).

This supports making Next initially visible when the existing content can fit.
COGA is supplemental guidance for cognitive accessibility, and Google's page
is practitioner guidance; neither is a comparative trial of this product or
proof that a child will understand **Next**.

### Do not assume touch or prompts are universal skills

A study of 90 children aged two to eight reported that 57% of its four-to-six
group tapped the intended stationary target and that 63% followed one or more
in-app prompts. Only 37% had animation as the most difficult prompt they
actually followed, and the analysis assumed that a child who followed a harder
prompt could follow every easier one. A separate study of 60 children aged
four to six found over 90% trained success with three explicit off-screen
directional prompts. Its mini-map took significantly longer than both the
arrow and border thumbnail; there was no significant arrow-versus-border
completion-time difference. See [UX-05 and UX-06](./source-register.md).

These adjacent studies caution against relying on unprompted discovery and
show that an explicit cue can be a fallback. They do not test page scrolling,
forms, bilingual interfaces, or a hidden submit action. The directional study
used a trained tablet game over repeated sessions; the gesture study used one
school context and did not obtain research-board review. There is no direct
evidence comparing Parrot's compact, sticky, and cue designs.

### Sticky is possible but creates another obstruction boundary

W3C technique C34 explains that sticky headers and footers can consume much of
a short or zoomed viewport and hide keyboard focus, and recommends adapting or
unfixing them by viewport dimensions. Failure technique F110 covers complete
focus obstruction by a sticky region. See [A11Y-29](./source-register.md).

Sticky controls are not prohibited. They are rejected here because the current
content fits with normal-flow spacing, while a docked action would add overlap,
safe-area, scroll-padding, zoom, and short-landscape obligations.

## Options considered

### 1. Reuse existing short decorative spacing below 360px — selected

At widths below 360px, add the existing short-screen values only to:

- card padding: 24px to 12px;
- character/prompt block margins: 20px to 8px, and its gap: 16px to 8px; and
- footer top margin: 8px to 0, and its gap: 16px to 8px.

A runtime-only prototype of the harder optional-question pending fixture
reduced the card from 724.5 to 628.5 pixels and the main range from 113 to 17
pixels. Next remained 144x52 at y=574.5...626.5, with its eight-pixel focus
paint ending at y=634.5. The required first question fit with zero main scroll;
its Next remained 144x52 at y=540.25...592.25.

At 280x568 the values duplicate the already-active `short` utilities. The
390x844, 640x360, and 1440x900 layouts are excluded. The 360x640 guard is also
excluded and already fits. The prototype preserved the 130-pixel answer area
and moved Replay farther from Account.

This is the smallest change that fixes the reproduced initial-visibility
failure without reducing learning or interaction space. Whether it improves
discovery for actual learners remains a direct-research question.

### 2. Compact the form and textarea — rejected

Keeping 24-pixel card padding while reducing the textarea to 80 pixels and
tightening four form gaps also exposes Next. It removes about 38% of the answer
area, affects later questions with longer answers, and changes more task
content to preserve decorative space.

### 3. Move Next before the skip actions — rejected

This can expose Next while leaving one or both exits below the viewport. A CSS
visual order would disagree with keyboard order; a DOM reorder would materially
change the established answer/escape hierarchy. It transfers rather than
removes discovery debt.

### 4. Sticky action footer — rejected

The card does not need one to fit. Sticky positioning would introduce a second
layout owner and could cover fields or focus at short heights, zoom, enlarged
text, or when an error is inserted.

### 5. Scroll cue — contingency only

An explicit arrow can be studied if unpredictable future content still
overflows. It should not be the ordinary solution while the actual action can
fit, and a faint gradient, shadow, color pulse, or English explanation should
not carry the cue alone.

## Exact acceptance contract

1. At 320x640, before any manual or scripted action scroll, the required first
   question keeps heading focus, main scroll at zero, and the complete Next
   border box inside the viewport.
2. Replay, answer, microphone, Skip, and Next retain their DOM and sequential
   keyboard order. Traversing from the heading through Next does not move the
   main scroll from zero.
3. Replay, microphone, Skip, and Next remain at least 44x44 CSS pixels. At
   320x640 and 359x640, Next remains 144x52 rather than inheriting the smaller
   short-screen button size used by the existing 280x568 composition.
4. The change is question-local and uses Tailwind utilities in the component;
   it does not change shared controls or global breakpoint definitions.
5. At 280x568, 360x640, 390x844, 640x360, and 1440x900, the existing containment,
   focus, account-clearance, reflow, layout-stability, and short-landscape
   scroll contracts continue to pass.
6. At 320x640, required and optional questions keep the complete Next target
   visible during idle and every pending phase. Its focus paint is complete
   when Next owns focus in required keyboard traversal or optional thinking.
   An inserted error may minimally scroll its already-focused retry into view
   under the existing error contract.
7. There is no horizontal overflow, nested scroll container, sticky region,
   new animation, new copy, or automatic scroll.

## Measurement and rollback

The deterministic browser gate is initial target containment before focus can
auto-scroll, followed by actual keyboard traversal and a zero-scroll assertion.
The existing responsive and pending-operation suites remain regression gates.

Retain the change only if genuine in-app screenshots confirm that 320x640 is
less cramped but still visually coherent, the complete primary action and
focus paint are visible, and the 280/360/390/short-landscape guards do not
regress. Roll back if text or targets shrink, fields collide, content gains a
nested scroll, pending geometry moves by more than one pixel, or any formerly
complete target clips.

Direct child validation should compare the retained compact screen with the
base and record whether four-to-six-year-old learners find Next without a
prompt, time from completing the answer to activating it, spontaneous scroll,
incorrect taps, adult interventions, and action prediction. Include weak-
English learners, 320x568/640 devices, enlarged text, the software keyboard,
and representative assistive technology. Do not use engagement duration as
the success measure.

## Remaining questions

- Do young weak-English learners predict what **Next** does, or should a later
  branch test a visible conventional arrow and/or Chinese alongside the word?
- Does the software keyboard make the action relationship clear when the
  answer field necessarily fills most of the remaining viewport?
- Should exceptional localization or enlarged-text overflow use an explicit
  cue, a differently composed card, or both?
- Does the compact visual density feel calm on physical 320px-class devices?
- What shared-header rule keeps arbitrary name/email Account labels clear of
  Replay and other route content at narrow widths?
