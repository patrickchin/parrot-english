# Story Reader completion focus guidance

Status: selected for implementation

Branch: `codex/story-reader-completion-focus`

Base: `codex/story-reader-join-in-visibility` documentation hand-off at
`9d891a7`

Research date: 2026-08-24

## Question

When **Finish story** replaces the last Story Reader page with its completion
screen, where should focus move so a child can understand what changed and
continue without extra English, surprise speech, or an unnecessary Tab stop?

**Selected answer:** focus the existing **Great job!** completion heading once,
before paint, with `tabIndex={-1}` and `preventScroll: true`. Give that static
arrival target the same open, separated brand-blue reading marker already used
for Story Reader page text. Keep the heading outside ordinary sequential focus,
so the next forward Tab reaches **Listen again**. Replaying continues to route
to page 1, reset the reading pane, focus its sentence, and remain silent until
the child chooses **Listen**.

This is an orientation hand-off for a user-requested state replacement. It is
not a dialog, notification, new completion message, narration event, reward,
or global focus abstraction.

## Audience and scope

The primary audience is a young learner with little English. The completion
screen already uses two short familiar signals—**The end!** and **Great job!**—
plus a story-specific sentence and clear actions. The repair should expose that
existing context instead of adding an instruction such as “Choose what to do
next” or relying on a child to infer a browser focus reset.

The hand-off also matters to keyboard, switch, and screen-reader users. When a
focused control disappears, leaving the browser viewport/body as the active
element gives no useful product location. A static heading lets the new state
be encountered before its actions, while keeping the next action one forward
step away.

In scope:

- pointer and keyboard activation of **Finish story**;
- completion entry at 280×568, 390×844, 640×360, and 1280×800;
- a visible normal-color reading marker and a forced-colors fallback;
- heading and action visibility, scroll origin, focus sequence, and replay;
- a regression assertion for page-one focus after **Listen again**; and
- preservation of narration silence until explicit replay listening.

Out of scope:

- completion words, artwork, actions, rewards, sound, animation, or timing;
- modal semantics, a live region, an ordinary `tabIndex=0` stop, or focus
  behavior elsewhere in the app;
- changing the Story Reader page paragraph's accessible-name implementation;
- a whole-product WCAG or assistive-technology claim; and
- direct evidence of child comprehension, celebration preference, or learning.

## Direct product evidence

### Method

The base at `9d891a7` was served locally with the repository's opt-in E2E
session fixture. In a genuine Codex in-app Chromium Browser, The Red Ball's
last page was loaded at each target viewport and **Finish story** was activated.
The document active element, viewport and owned-scroll positions, heading and
action rectangles, and visible focus treatment were inspected after completion
committed. Pointer and keyboard activation were checked independently.

Replay was then activated by pointer and keyboard at the same sizes. A separate
catalog sweep activated pointer replay for every one of the 20 current stories.
These are deterministic local product observations, not analytics, production
performance data, target assistive-technology results, or a child study.

### Verified completion-entry issue

| Viewport | Activation checked | Active element after Finish | Completion heading | Listen again |
| --- | --- | --- | --- | --- |
| 280×568 | Pointer and keyboard | `BODY` | Visible | Fully visible; y 453.328…505.328 |
| 390×844 | Pointer and keyboard | `BODY` | Visible | Fully visible; y 609.328…661.328 |
| 640×360 | Pointer and keyboard | `BODY` | Visible | Fully visible; y 302…354 |
| 1280×800 | Pointer and keyboard | `BODY` | Visible | Fully visible; y 479…531 |

Window, document, body, and main scroll positions remained at zero in every
run. The completion content itself is understandable and the primary replay
action remains available; the defect is the missing orientation hand-off, not
hidden content or broken navigation. At 640×360, **Pick another story** is
below the initial fold, but **Listen again** is complete and the main remains
vertically scrollable. Moving focus to the already-visible heading with
`preventScroll` preserves that deliberate beginning.

The baseline images are retained in
[`artifacts/ux-review/story-reader-completion-focus`](../../artifacts/ux-review/story-reader-completion-focus/manifest.md).
They show no child-visible focus location after completion.

### Disproved replay concern

The originally reported concern was that **Listen again** might return to page
1 without restoring sentence focus. That did not reproduce:

- pointer and keyboard replay at all four target viewports routed to
  `/stories/the-red-ball/pages/1`;
- the page-one sentence was the active element in every run;
- its four-pixel blue reading marker was visible;
- window, document, body, main, outer reader, and inner reading-pane scroll
  positions were all zero; and
- pointer replay passed for all 20 current stories.

The route key remounts `StoryReader`; its existing layout effect resets the
reading pane and focuses the page sentence with `preventScroll`. There is no
product replay fix to make. The missing test should be added as a regression
assertion so the verified contract is not accidentally lost.

## Root cause

Before completion, the focused node is the last page's **Finish story** button.
The click sets `isStoryComplete`, and the completion branch replaces the whole
reader subtree. The button is removed without an authored focus destination.
The browser therefore applies its focus-fixup behavior and the document
viewport, observed through `document.activeElement === document.body`, becomes
the effective focus location.

The completion already has a unique level-one heading and a logical next
action. The root-cause repair is one completion-state focus hand-off, not a
global mutation observer, timer, live region, or persistent hidden element.

## Transition contract

| Moment | Focus | Scroll | Speech |
| --- | --- | --- | --- |
| Last story page arrives | Existing current-page sentence | Existing page-arrival origin | Idle |
| Child activates Finish | **Great job!** heading once | Preserve window, document, body, and completion main origin | Stop any old narration; do not start completion sound |
| Child presses Tab | **Listen again** | No authored scroll change | Idle |
| Child activates Listen again | Existing page-one sentence after route remount | Reader and reading pane at origin | Idle |
| Child activates Listen | Existing narration behavior | Existing phase-aware pane behavior | Begin only on this explicit request |

The completion heading has `tabIndex=-1`, so it is a programmatic arrival
target but not an added stop during ordinary traversal. The focus effect is
keyed to completion state and should not run on unrelated rerenders.

## Visual decision

Use an open four-pixel brand-blue rule in the heading's left margin, with eight
pixels of cream between the rule and the first glyph. This reuses the Story
Reader's established visual grammar for
“reading/context arrived here.” It avoids a closed outline that could make the
static heading resemble a button or form field, and it requires no icon, color
name, or explanatory copy.

The rule should render for programmatic `:focus`, including pointer/touch
activation, because this is state-arrival feedback rather than keyboard-only
control chrome. In forced colors, hide the authored pseudo-element and retain
a real two-pixel outline with two-pixel offset. Automated and visual review
must confirm the marker is not clipped, does not touch the first glyph, does
not change wrapping or card geometry, and does not make the heading appear
interactive.

### Visual-review revision, 2026-08-24

The first implemented candidate copied the page-text marker's four-pixel glyph
gap. Functional checks passed, but independent review of both retained Browser
captures found that a full heading-height bar at that distance optically joined
the text as `|Great job!`. It could be decoded as a capital **I**, caret, or
stray glyph rather than a location cue.

The selected treatment keeps the same open four-pixel rule and moves it four
pixels farther left, leaving eight pixels of cream before the unchanged title.
The rejected captures remain in the artifact manifest. The revision changes no
text position, wrapping, card or action geometry, focus behavior, or timing.

The heading focus box intentionally shrink-wraps the rendered title instead of
spanning its parent column. That keeps the normal-color marker and forced-color
outline local to the words. It changes the focused element's box, but not the
visible glyph position or any surrounding layout. Matched before/after decoded
images and action/card rectangles, rather than a CSS-source assertion, own the
no-visible-shift claim.

## Options considered

### Focus Listen again

Rejected as the default. It is efficient for a repeat action but skips the new
completion context and can make the state replacement sound like only another
button. It remains a rollback option if target assistive-technology testing
finds static heading focus unreliable or excessively verbose.

### Leave focus on the body and rely on the next Tab

Rejected. The browser viewport is not a meaningful product destination and
provides no visible arrival cue. A coincidentally short Tab path does not
explain that the story ended.

### Announce completion through a live region

Rejected for this bounded repair. Focus already provides a direct context
transition. Adding a status message could duplicate output, introduce timing
variation, and add or repeat language without improving the visible experience.

### Give the completion region modal or dialog semantics

Rejected. The screen is a route-local replacement, not an overlaid modal that
must trap focus or restore it to an invoking control.

### Keep the removed Finish button mounted invisibly

Rejected. It would preserve focus on an action that no longer exists visually
or functionally and obscure the true transition rather than own it.

### Add an animation, celebration sound, or automatic replay

Rejected. None is needed to repair orientation; each would add timing,
attention, motion, audio, and child-control questions outside this branch.

## Standards boundary

WCAG Focus Order requires a sequence that preserves meaning and operation, and
its Understanding document explicitly allows programmatic focus on static
content while warning against adding non-actionable content to the ordinary
sequence. The WAI-ARIA APG keyboard-interface guidance says focus should be
discernible and predictable and identifies the active element as essential.
The APG button pattern says a context-changing button may move focus to the
start of the resulting action or context. These sources support an explicit,
logical hand-off; they do not mandate this exact heading.

WCAG Status Messages addresses important dynamic results that do **not** take
focus. This design deliberately takes focus, so it does not need a parallel
live-region message merely to fit that technique. Browser focus fixup explains
the observed body state but is not itself a product accessibility contract.
See canonical register entries [A11Y-16 and A11Y-22](./source-register.md).

The [APG dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
is useful only as adjacent design reasoning: it
distinguishes static contextual focus from first-action focus based on content
complexity. Story completion is not a dialog, and no dialog semantics or focus
trap should be inferred from that comparison.

## Acceptance evidence

Automated rendered behavior should prove:

- pointer and Enter activation of **Finish story** focus the completion heading
  rather than `BODY`;
- the target has `tabIndex=-1`, is fully visible, and leaves all scroll owners
  at origin at 280×568, 390×844, 640×360, and 1280×800;
- the next forward Tab focuses **Listen again**;
- the open marker renders with the expected position, separation, and contrast
  without moving the rendered heading glyphs, card, or actions or introducing
  horizontal overflow;
- forced colors retains a visible focus fallback;
- completion does not start narration;
- pointer and keyboard **Listen again** return to page 1, focus its sentence,
  reset all relevant scroll owners, and remain idle; and
- existing completion copy, artwork, links, responsive containment, and
  horizontal-overflow behavior remain unchanged.

Genuine in-app Browser review should compare the baseline and candidate at
280×568 and 640×360, then inspect 390×844 and desktop behavior. The reviewer
should judge whether the marker reads as an arrival/reading cue rather than a
new action.

## Separate follow-up: paragraph accessible naming

The existing focused page sentence is a `<p>` with `aria-label`.
[WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/#namefromprohibited)
classifies the paragraph role as name-prohibited. That implementation predates
this branch and replay currently depends on its accessible locator. Do not
silently bundle a semantic rewrite into the completion repair. Record a
separate investigation of a nameable current-page wrapper or a valid
description relationship, including actual screen-reader output and locator
migration, before changing it.

## Evidence limits and rollback

No primary study was found that compares heading focus, first-action focus, and
body focus for five-year-old multilingual learners using screen readers or
switch input. Automated Chromium focus proves DOM and rendered behavior, not
announcement wording or order in VoiceOver, TalkBack, NVDA, or other target
technology. Static focus behavior can vary by browser/assistive-technology
pair. English left-to-right copy, zoom, text spacing, safe areas, localization,
and direct child/caregiver comprehension remain untested.

Rollback the completion-specific hand-off if it repeats or interrupts target
announcements, steals focus on later rerenders, changes sequential order,
obscures the primary action, scrolls past the completion start, or makes the
static heading look interactive. Preserve the replay regression either way.
