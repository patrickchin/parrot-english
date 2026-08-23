# Story Reader child-first control order guidance

Status: selected for implementation

Branch: `codex/story-reader-child-first-tab-order`

Base: `codex/story-reader-completion-focus` documentation hand-off at
`c2a0a24`

Research date: 2026-08-24

## Question

After Story Reader focuses the current sentence, should a child encounter the
story controls or an optional caregiver personalization editor first—and does
the editor need to exist inside the active reading experience at all?

**Selected answer:** keep the existing sentence-arrival focus, then let native
sequential navigation enter only the child controls: **Listen** on page 1, and
**Back**, **Listen**, then **Next** or **Finish** on later pages. Remove the
duplicated personalized-art editor and **Grown-up options** disclosure from the
active Story Reader. Keep the complete editor on the story shelf and continue
showing already-saved personalized artwork read-only inside the story.

This is a product-boundary simplification, not a claim that WCAG mandates one
exact order. It removes an optional adult task from the child's critical
reading path instead of creating a custom Tab order or a more complicated
sticky layout.

## Audience and scope

The primary audience is a young learner with little English. The current page
already contains a picture, one story line, one short speaking prompt, and the
three controls that operate the story. A photo-upload and guardian-consent form
serves a different user, purpose, language level, and privacy decision.

The same sequential path can also be used by a keyboard, keyboard emulator, or
switch-style input. An avoidable stop matters more when each move is a distinct
action and when moving focus also moves the reading surface.

In scope:

- first, middle, and final Story Reader pages;
- page arrival, Back, Next, completion replay, and read-aloud replay;
- 280x568, 390x844, 640x360, and 1280x800;
- feature-enabled, feature-disabled, closed, and open personalization states;
- child-control order, focus visibility, scroll ownership, and narration
  silence at page arrival;
- preservation of saved personalized artwork in the reader; and
- preservation of the complete caregiver editor on the story shelf.

Out of scope:

- changing story words, prompts, artwork generation, consent, persistence,
  privacy cleanup, routes, audio, timing, or completion focus;
- changing the page sentence's separate accessible-name semantics;
- positive `tabIndex`, Tab interception, a composite toolbar, duplicate
  controls, or a new focus manager;
- redesigning the shelf editor; and
- claiming target assistive-technology output, switch performance, caregiver
  discoverability, or child comprehension from Chromium automation.

## Direct product evidence

### Method

The stacked base at `c2a0a24` was served locally with the repository's
deterministic E2E session fixture. Genuine in-app Chromium Browser inspection
recorded the active element, tree order, focus-target and scroll-owner
rectangles, and arrival screenshots at all four target viewports.

An independent Playwright reproduction used actual forward Tab traversal on
first, middle, and final pages with personalization absent, API-disabled,
enabled-and-closed, and enabled-and-open. It then exercised Back, Next,
narration, completion, and replay. These are local product observations, not
production analytics or participant research.

### Baseline sequence

| Reader state | First page after sentence | Middle page after sentence | Final page after sentence |
| --- | --- | --- | --- |
| Non-personalized story | Listen, Next | Back, Listen, Next | Back, Listen, Finish |
| Red Ball, API disabled | Grown-up options, Listen, Next | Grown-up options, Back, Listen, Next | Grown-up options, Back, Listen, Finish |
| Red Ball, enabled and closed | Same as disabled | Same as disabled | Same as disabled |
| Red Ball, enabled and open | Grown-up options, Upload learner photo, guardian checkbox, Listen, Next | Same adult stops, then Back, Listen, Next | Same adult stops, then Back, Listen, Finish |

The disabled **Generate story art** action is correctly skipped. No child
control is unreachable. The problem is priority and context: **Listen** takes
two forward moves from the first-page sentence while the disclosure is closed,
and four while it is open. On middle and final pages it takes three and five
moves respectively.

The API-disabled Red Ball still exposes an empty focusable summary. `App`
passes a truthy React element to `StoryReader`; the nested panel later returns
`null`, but the reader-owned `<details>` and `<summary>` remain. Fixing only
that empty state would leave the enabled detour unchanged.

### Focus-induced movement

At page arrival, the current sentence is focused and every relevant scroll
position starts at zero. The disclosure precedes the child-controls navigation
in tree order at every viewport.

At 640x360, the closed summary is wholly outside the 161-pixel reading-pane
clip: its 44-pixel box begins at y 246.5 while the pane ends at y 241. The first
forward Tab therefore scrolls the pane about 50 pixels to expose an optional
adult control. The story title disappears, and the sentence loses its visible
arrival marker before the child reaches **Listen**.

With the editor open, sequential traversal has larger consequences:

- at 280x568, the outer reader reaches `scrollTop = 513`; the sentence and
  prompt are gone when focus reaches **Listen** and remain gone through
  playback and replay;
- at 640x360, the inner pane reaches about 488 pixels; activating **Listen**
  happens to reset it because narration owns that inner pane; and
- at 1280x800, the outer reader reaches `scrollTop = 652`; the sentence and
  prompt remain gone through playback and replay because narration resets only
  the inner reading pane.

At 390x844 the complete composition fits and the same sequence does not need to
scroll. Back, Next, and completion replay correctly remount the reader, restore
the sentence focus, close the disclosure, and reset scroll at every size. The
defect is not a general route or focus lifecycle failure.

The [baseline artifact manifest](../../artifacts/ux-review/story-reader-child-first-tab-order/manifest.md)
retains arrival and focused-disclosure captures at 280x568 and 640x360.

## Root cause

The current page sentence is deliberately focusable with `tabIndex=-1`. HTML
therefore allows programmatic focus but omits it from the ordinary sequential
order. When forward navigation starts from that sentence, the browser searches
for the next sequentially focusable area in tree order.

For The Red Ball, `StoryReader` renders a native, focusable `<summary>` inside
the reading pane before the `<nav aria-label="Story controls">`. That tree
order deterministically produces the observed transition. This is not a React
effect race or a missing delay.

The editor is also redundant. `StoryList` already renders the same
`PersonalizedStoryArtPanel` with upload, guardian consent, generation,
deletion, error, status, and preview behavior. It preserves deletion access
when generation is disabled but stored art remains. The reader version is less
complete because it suppresses the preview. The reader separately receives
`personalizedOverrides`, so displaying saved art does not depend on embedding
the editor.

## Selected product boundary

Make Story Reader a read-only learning activity:

1. Keep `usePersonalizedStoryArt()` in the route and continue passing saved
   overrides to the artwork renderer.
2. Stop composing `PersonalizedStoryArtPanel` into `StoryReader`.
3. Remove the reader's `personalizationPanel` prop and disclosure wrapper.
4. Leave `StoryList`, the editor, its API, consent, cleanup, and persistence
   untouched.
5. Use the existing **Back to stories** route when a caregiver wants to edit.

This naturally yields the desired order through native disabled-control and
tree-order behavior. It adds no focus state, key listener, index, CSS ordering,
portal, duplicate control, new words, or dependency.

The tradeoff is explicit: a caregiver who enters through a direct story URL
must go back to the shelf, open **Grown-up options**, edit, and re-enter the
story. Current page context is not preserved through that detour. That cost is
preferable provisionally to placing a privacy-sensitive adult form inside each
page of an active child reading flow, but it needs caregiver observation.

## Transition contract

| Moment | Focus and order | Scroll | Speech |
| --- | --- | --- | --- |
| Page 1 arrives or replays | Sentence; next Tab is Listen, then Next | Every owner at origin | Idle |
| Middle page arrives | Sentence; next Tabs are Back, Listen, Next | Every owner at origin | Idle |
| Final page arrives | Sentence; next Tabs are Back, Listen, Finish | Every owner at origin | Idle |
| Child activates Back/Next | Destination sentence, then that page's child controls | Existing page-origin reset | Idle |
| Child activates Listen | Existing control-state lifecycle | Existing phase-aware inner-pane behavior | Starts only by request |
| Story completes/replays | Existing completion heading, then Listen again; replay returns to page-1 sentence | Existing completion/replay reset | Idle until Listen |
| Caregiver wants art settings | Back to stories, then shelf Grown-up options | Shelf-owned behavior | No reader autoplay |

Already-saved personalized art remains the current page's image on direct and
shelf-originated entry. Story Reader contains no personalization editor,
disclosure, empty placeholder, or related focus stop.

## Options considered

### Move controls before the disclosure in DOM and visual order

Rejected in favor of the simpler boundary. The current short-wide layout keeps
the editor in an independently scrolling row and the controls in a fixed
sibling row. A true source-and-visual reorder requires moving or rebuilding
that relationship with sticky positioning, a portal, popover, or new grid
ownership. It preserves in-context editing but adds meaningful layout,
obscuration, and cross-browser risk for a duplicate feature.

### Change only the feature-disabled state

Rejected as incomplete. It removes an empty disclosure but preserves the adult
detour and scroll movement whenever the deployed feature is enabled.

### Keep the editor but assign positive tabindex values

Rejected. Positive indices produce a second authored order that is fragile
under responsive changes and can diverge from reading and visual order.

### Intercept Tab or add focus sentinels

Rejected. The browser already implements the desired behavior once the
secondary controls leave the reader. Custom key handling would complicate
keyboard, switch, reverse traversal, and assistive-technology behavior.

### Remove the summary from sequential focus only

Rejected while retaining the editor because it would make a visible native
disclosure less keyboard-accessible without providing an equivalent path in
the same context.

### Focus Listen instead of the sentence

Rejected. It would discard the established page-arrival context and reading
marker rather than repair what follows it.

### Keep the current reader

Rejected provisionally. It is operable and not automatically a WCAG failure,
but direct evidence shows an avoidable adult stop displacing the child task,
including persistent context loss at three supported sizes when the editor is
open.

## Standards and evidence boundary

WCAG 2.2 Focus Order requires a sequence that preserves meaning and operation,
allows more than one logical sequence, and does not dictate whether **Listen**
or **Grown-up options** must come first. Its Understanding document recommends
that focus reinforce visual reading order but explicitly says they need not be
identical when the result stays logical. This branch is therefore a Parrot
product decision, not a conformance correction inferred from order alone.

The HTML Living Standard explains the current deterministic behavior:
`tabIndex=-1` permits focus but excludes the sentence from ordinary sequential
navigation, while a native summary participates and tree order resolves the
next stop. APG recommends logical default DOM order and strongly discourages
positive `tabindex`; its disclosure pattern also supports preserving native
keyboard access when a disclosure remains. See [A11Y-23](./source-register.md).

W3C supplemental cognitive guidance recommends making important controls easy
to reach and keeping critical paths short while separating optional steps.
That supports keeping the story task distinct from caregiver setup, but it is
advisory and is not specific to five-year-old multilingual learners. See
[A11Y-04 and A11Y-20](./source-register.md).

An original study of 174 children aged three to five found additional
navigation cost in narrated e-books, particularly for younger and less
tablet-experienced children, and recommended scaffolding. It studied touch
page-turning, not Tab order, switches, screen readers, weak English, or adult
disclosures. It supports minimizing avoidable navigation only indirectly. See
[DEV-03](./source-register.md).

No direct study was found comparing these exact focus orders or editor
locations for Parrot's primary audience.

## Acceptance evidence

Rendered behavior should prove:

- Story Reader exposes no **Grown-up options** or personalized-art form in
  enabled, disabled, stored-art, or direct-link states;
- the shelf retains one complete keyboard-operable editor and cleanup path;
- saved personalized art still replaces the default page-one image;
- page 1 sentence -> Tab -> Listen -> Tab -> Next at every target viewport;
- middle/final sentence -> Back -> Listen -> Next/Finish in both directions;
- Back, Next, narration replay, completion, and completion replay restore the
  existing focus, scroll, and silence contracts;
- the 640x360 reading pane does not move merely to reach a child control;
- focused controls stay visible, unobscured, and inside the reader;
- artwork, prompt, and control geometry remain stable aside from intentional
  removal of the adult disclosure and its scroll height;
- no horizontal overflow or new audio/media construction appears; and
- no positive `tabIndex`, custom Tab handling, duplicate controls, or new
  child-facing copy is introduced.

Genuine in-app Browser review should compare 280x568 and 640x360 before/after
captures, then inspect 390x844 and desktop. The visual question is whether the
reader becomes calmer without looking broken or leaving an unexplained gap.

## Limits and rollback

Automated Chromium can establish DOM order, focus, geometry, and scroll but
not announcement quality, switch effort, or physical-keyboard behavior on
target devices. VoiceOver/Safari, TalkBack/Chrome, NVDA/Firefox or Chrome,
Switch Control, zoom, text spacing, localization, right-to-left layouts, safe
areas, and child/caregiver comprehension remain untested.

Rollback or revise if caregivers cannot discover the shelf editor, if the
route detour causes unacceptable task loss, if privacy cleanup becomes
practically inaccessible, or if saved art no longer appears reliably in the
reader. Prefer a clearly separated caregiver surface over restoring the form
inside the child reading sequence.
