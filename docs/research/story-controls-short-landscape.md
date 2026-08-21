# Story Controls in Short Landscape

Last reviewed: 2026-08-21
Status: implemented on `codex/story-controls-short-landscape`
Audience: young learners using a phone or small tablet sideways

## Question and scope

Can a child see the story picture, current words, and real Back/Listen/Next
controls immediately at 640×360, while longer story and grown-up content still
remain reachable without moving those controls?

This memo covers the reader's short-wide layout, control containment, the
personalized-art panel inside the narrow right pane, and the browser test that
previously hid the defect. It does not redesign the story content or establish
that landscape is a preferred reading orientation.

## Observed problem

The 2026-08-21 visual first-use audit opened **The Red Ball** at 640×360 without
scrolling. The picture, title, story sentence, join-in card, and a non-interactive
**Grown-up options** disclosure filled the reader. The actual story controls
started below the clipped reader:

| Element | Baseline geometry |
| --- | --- |
| Reader | y 64–328; 264 px tall |
| Inner reader scrollport | 256 px tall |
| Story controls | y 352.5–415.5 |
| Scroll needed to reach controls | 104 px with grown-up options collapsed; more when expanded |

The controls were therefore entirely absent on first use. A child could see
**Tap Listen** but could not see the button named **Listen**. The picture grew
with the implicit grid row and scrolled away with the text.

The existing responsive browser test did not catch this. Its horizontal helper
called `scrollIntoViewIfNeeded()` before measuring the controls, which silently
performed the missing child action and converted a first-use failure into a
passing containment check.

## Product rationale

For the primary audience, the stable layer is:

- the picture that carries meaning;
- the literal story sentence;
- the short join-in cue; and
- the three visible story controls.

Grown-up setup and unusually long copy are secondary layers that may scroll.
This follows the repository guidance to keep a short critical path, use a clear
visible label, and preserve at least 44×44 CSS-pixel controls. See
[A11Y-02, A11Y-04, and A11Y-05](./source-register.md). These sources guide the
priority and control contract; the exact two-pane layout is a Parrot design
inference validated by browser geometry.

## Decision implemented

At the existing `short-wide` breakpoint (height at most 620 px and width at
least 560 px):

1. Constrain the story reader to one `minmax(0, 1fr)` row and hide outer
   overflow.
2. Keep the illustration in the fixed left grid cell.
3. Split the right pane into a scrollable content row and an automatic controls
   row.
4. Keep only the content row vertically scrollable, with horizontal overflow
   clipped.
5. Give the controls an opaque story-paper surface so moving copy cannot show
   through them.
6. Slightly reduce only short-wide gaps and join-in padding; preserve the
   established child text sizes.
7. Give the grown-up disclosure an explicit accessible name.
8. Force the optional personalized-art form back to one column inside the
   narrow right pane, even when the viewport also matches the `sm` breakpoint.

Phone portrait behavior remains unchanged: its controls stay fixed to the
safe-area-aware viewport bottom. Normal-height desktop behavior retains the
roomier two-column reader.

## Alternatives rejected

- **Make the whole reader scroll and rely on discovery:** rejected because the
  primary action remains absent and the picture loses its stable meaning.
- **Use a sticky controls row inside the old scrollport:** rejected because the
  oversized implicit row still lets art and content dictate reader geometry,
  and moving copy can remain visible beneath a translucent bar.
- **Hide Grown-up options in landscape:** rejected because secondary does not
  mean unavailable; it can live in the dedicated content scroller.
- **Shrink all child text:** rejected because the problem was containment, not
  an oversized typography token. Long advanced copy may scroll without making
  beginner text harder to read.
- **Replace labels with icon-only controls:** rejected because visible familiar
  words are important for children, caregivers, and assistive technology.
- **Let the old test scroll before checking:** rejected because it measures a
  state the learner has not reached.

## Regression contract

The new 640×360 and 1280×360 browser cases deliberately avoid
`scrollIntoViewIfNeeded()` before their first assertions. They require:

- reader outer scroll position to start at zero with no outer vertical
  overflow;
- the complete controls bar to fit inside the reader;
- every story-control button to be at least 44×44 px;
- Listen to change immediately to Pause without moving the controls;
- opening and scrolling grown-up options not to move the art or controls;
- the personalized-art region not to overflow horizontally; and
- Next to change the page while keeping the controls in the same bounded row.

The original phone/desktop overflow suite remains in place for regression
coverage.

## Measured result and visual evidence

In the final 640×360 browser pass:

| Element | Final geometry |
| --- | --- |
| Reader | y 64–328; 264 px tall |
| Illustration | y 68–324; fixed in the left pane |
| Story controls | y 249–312; fully contained in the right pane |
| Reader outer scroll position | 0 before and after opening grown-up options |
| Grown-up content scroll observed | 231 px while art and controls stayed fixed |

The clean visual-smoke tab logged only Vite connection and React development
messages, with no console errors.

- [Before: controls are below the clipped reader](../../artifacts/ux-review/story-controls-short-landscape/before-640x360.png)
- [After: first-use controls are visible](../../artifacts/ux-review/story-controls-short-landscape/first-use-640x360.jpg)
- [Listening state remains in place](../../artifacts/ux-review/story-controls-short-landscape/listening-640x360.jpg)
- [Grown-up content scrolls behind a fixed child layer](../../artifacts/ux-review/story-controls-short-landscape/grown-up-options-640x360.jpg)
- [Longer title and story copy](../../artifacts/ux-review/story-controls-short-landscape/long-title-640x360.jpg)
- [390×844 portrait regression](../../artifacts/ux-review/story-controls-short-landscape/phone-390x844.jpg)

Final branch validation:

- 610 unit and mounted-lifecycle tests passed;
- all 111 Chromium browser tests passed with four workers in 35.0 seconds;
- the focused story/personalized-art run passed all 17 cases;
- TypeScript and the production Vite build passed;
- lint reported zero errors and the two pre-existing unused-disable warnings in
  generated `worker-configuration.d.ts`; and
- output increased by about 0.09 kB gzip in CSS and 0.06 kB gzip in the deferred
  StoryReader chunk.

The first complete browser run also exposed an unrelated race in the desktop
home-card geometry test: Playwright's non-waiting `.all()` could return an empty
array immediately after navigation even though the failure snapshot contained
all three cards. The test now waits for the accessible link count before taking
bounding boxes. The subsequent complete run passed.

## Measurement and rollback guardrails

Retain the layout while the art, story controls, and current story sentence
remain visible at the supported short-wide sizes. Revise it if:

- a control falls outside the reader at scroll position zero;
- opening secondary content moves or covers the controls;
- the right pane gains horizontal scrolling;
- safe-area insets hide controls on a real device; or
- child observation shows that the inner-content scroll is not discoverable
  when advanced story copy continues below the fold.

Do not treat a Playwright `toBeVisible()` result alone as sufficient: a few
intersecting pixels can be “visible.” Continue comparing complete bounding
boxes.

## Open questions

- Does the 560 px `short-wide` width threshold match the real landscape-device
  distribution?
- Should the right content pane expose a subtle non-text scroll cue when more
  child content remains, or would that compete with Listen?
- How should read-aloud errors fit when both story and grown-up content are
  long?
- Do device safe-area insets change the available 360 px geometry in installed
  PWA or browser chrome modes?
- Can a five-year-old find Listen and Next without grown-up prompting in this
  layout?
