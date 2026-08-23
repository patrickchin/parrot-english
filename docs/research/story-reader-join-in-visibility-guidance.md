# Story Reader join-in visibility guidance

Status: selected for implementation

Branch: `codex/story-reader-join-in-visibility`

Base: `codex/static-profile-acknowledgment-audio` documentation hand-off at
`6ca36e7`

Research date: 2026-08-23

## Question

At 640×360, can Story Reader keep the current sentence visible while it is
read and then expose the complete **Say it** task exactly when a young learner
needs to join in—without shrinking language, moving keyboard focus, moving the
art or controls, or adding another instruction?

**Selected answer:** preserve the sentence-first arrival at scroll origin. When
device narration reaches the join-in phrase, move only the existing inner
reading pane by the smallest immediate vertical distance that fully exposes the
yellow prompt. Keep it there for **Your turn**, pause, and resume. Reset that
pane to its origin on replay and page arrival. If read-aloud fails, show the
recovery alert immediately after the prompt and reveal it by the same minimum-
distance rule so the phrase and fallback direction remain together—even when
the later grown-up personalization panel is open.

This is phase-aware task presentation, not decorative motion and not automatic
page navigation. It adds no words, visual style, timer, focus target, state,
dependency, or analytics.

## Audience and scope

The primary audience is a young child with little English, potentially unable
to infer that a clipped yellow edge means more content exists below. The
speaking phrase is the task, not optional detail. A child should not need to
read an extra “scroll” direction, understand a scrollbar, or move focus away
from the familiar Listen control to find it.

In scope:

- all 122 currently checked-in story pages;
- the 640×360 short-wide reading pane, with spot checks at portrait, wider
  short, and desktop viewports;
- device-speech phase boundaries, completion, pause/resume, replay, page
  changes, cancellation, stale callbacks, and read-aloud failure;
- failure adjacency while the optional grown-up personalization panel is open;
- preservation of sentence focus at page arrival and control focus after a
  child activates Listen; and
- rendered geometry, overflow ownership, reduced-motion behavior, and visual
  evidence.

Out of scope:

- changing story text, join-in phrases, labels, art, or narration speed;
- adding sticky content, a disclosure cue, a new focus stop, or a larger
  short-wide layout redesign;
- splitting or adding saved narration assets;
- localization, right-to-left layout, text zoom, or a whole-product
  accessibility claim; and
- direct evidence of child comprehension, pronunciation, hearing, or learning.

## Direct product evidence

### Method

The current branch base was served locally with the repository's opt-in E2E
session fixture. A Chromium Browser viewport was set to exactly 640×360. Every
catalog page was loaded directly so page-arrival focus and scroll origin were
consistent. For each yellow prompt, the sweep found its nearest ancestor whose
computed vertical overflow was `auto` or `scroll`, then intersected the two
rendered bounding rectangles.

A prompt counted as fully visible when its visible height was within one CSS
pixel of its rendered height; partly visible when the intersection was greater
than zero but below that threshold; and hidden when the intersection was zero.
The label and phrase descendants were measured separately to distinguish a
visible border/padding sliver from usable task content. Sentence line count was
derived from rendered paragraph height divided by computed line height.

This is deterministic repository/browser evidence. It is not telemetry, a
field performance result, an accessibility-conformance result, or a child
study.

### Result at page arrival

| Sentence shape | Pages | Full prompt | Partial prompt | Hidden prompt |
| --- | ---: | ---: | ---: | ---: |
| One rendered line | 50 | 47 | 3 | 0 |
| Two rendered lines | 70 | 0 | 70 | 0 |
| Three rendered lines | 2 | 0 | 1 | 1 |
| **All catalog pages** | **122** | **47** | **74** | **1** |

Therefore 75 of 122 prompts are partly or wholly outside the visible reading
pane. On 26 pages, neither the small prompt label nor the join-in phrase has
any visible pixels; only border, padding, or nothing is exposed.

The most useful stress pages are:

| Route | Sentence | Rendered prompt evidence |
| --- | --- | --- |
| `/stories/kite-come-back/pages/4` | Three lines | About 4 of 67.5 px is exposed; neither **Tap Listen** nor **Stop and ask!** is visible. The same sliver remains when narration reports **Your turn** because narration state does not own scroll. |
| `/stories/the-picnic-blanket-search/pages/1` | Three lines | 0 of about 95 px is exposed. |
| `/stories/robo-tries/pages/6` | One line | The complete prompt remains visible and serves as the no-regression threshold case. |

The retained baseline image is
[`before-kite-page-4-640x360.jpg`](../../artifacts/ux-review/story-reader-join-in-visibility/before-kite-page-4-640x360.jpg).

## Root cause

The short-wide composition intentionally fixes the artwork and Story controls
while giving title, progress, sentence, prompt, and optional secondary content
one inner vertical scrollport. That containment repaired the earlier problem
where the primary controls were off-screen.

The remaining defect is ownership, not capacity:

1. page arrival focuses the sentence with `preventScroll: true`, correctly
   preserving scroll origin;
2. narration changes only `narrationState` and prompt label text;
3. no narration boundary changes the inner pane's scroll position; and
4. the browser therefore keeps the prompt clipped even when the child reaches
   **Listen and say it** or **Your turn**.

The outer reader, art, and controls already have the desired geometry. The
smallest root-cause repair is to let the existing narration/page lifecycle own
the existing inner pane's scroll position.

## Phase contract

| Moment | Inner pane | Focus | Visible priority |
| --- | --- | --- | --- |
| Direct page arrival, Next, Back | Reset to `scrollTop = 0` before paint | New sentence retains programmatic focus | Title/progress and the complete sentence |
| Listen or Listen again begins | Reset to origin immediately | Activated Listen/Pause button stays focused | Complete sentence while it is modeled |
| Device speech moves from sentence to join-in phrase | Apply the minimum immediate delta before starting the second utterance | Pause button stays focused | Complete yellow prompt while the modeled phrase begins |
| Narration completes | Keep/reapply prompt visibility | Existing control focus stays put | **Your turn** and the complete phrase |
| Pause or resume | Do not change scroll | Existing Pause/Resume button behavior | Preserve the phase the child paused |
| Current read-aloud failure | After commit, minimally reveal the alert placed directly after the prompt | Existing Listen button stays focused | Complete prompt plus the short “read together” recovery, without closing a later grown-up panel |
| Replay, retry, or a new page | Reset to origin | Existing action/page-arrival focus rules | Start the sequence again rather than inheriting old scroll |

All scroll writes are immediate. No smooth behavior, transition, timeout,
animation, or motion-preference branch is needed.

## Lifecycle and race ownership

`playbackGenerationRef` already owns cancellation. `stopNarration()` increments
that generation before aborting current playback. The implementation should
keep every reveal after the existing generation check:

- after the first device utterance resolves and before the join-in utterance is
  started;
- after final narration completion; and
- after a non-abort failure belonging to the current generation.

That order matters. A React effect keyed only to `narrationState` would run
after the second device utterance has already been handed to speech synthesis,
could mis-handle a paused join-in phase, and makes stale ownership harder to
audit. A late callback from page A must never scroll page B or start page A's
join-in phrase.

The current catalog contains no non-null `narrationAudioId`. The retained
combined-audio compatibility path has no sentence/join-in cue boundary, so it
can reveal the task at completion but cannot honestly time the reveal to the
modeled phrase. If saved story narration is introduced, use split assets or cue
metadata rather than guessing from duration.

## Minimal implementation shape

Use three DOM refs: the existing inner reading pane, prompt, and conditional
recovery alert. A small file-local helper compares a target and pane's
bounding-rectangle top and bottom edges and changes `scrollTop` only by the
clipped distance. Direct `scrollTop` assignment is immediate and confines
movement to the owned pane.

Do not use `scrollIntoView()`: it is allowed to move ancestor scroll containers
and would make the fixed reader/page geometry harder to guarantee. Do not add a
test ID or new landmark just to locate the pane; tests can find the prompt by
its accessible label and walk to the behavioral overflow owner.

A layout-phase page effect should reset the pane before focusing the sentence,
preventing the previous page's revealed task from flashing at the new page's
first paint. An isomorphic layout-effect alias avoids a server-render warning.
Put the error immediately after the prompt and before the optional grown-up
details. A layout-phase error effect reveals the newly committed alert. An
immediate attempt against the existing alert also covers a same-message retry
whose clear-and-restore updates are batched and therefore do not retrigger an
effect. Do not close or reset an adult-open details panel.

## Options considered

### Permanently show or pin the prompt

Rejected for this branch. It spends scarce short-height space throughout the
sentence phase and can obscure or compress the text. Sticky content can also
cover focused or manually scrolled content. A larger layout study may revisit
it, but the current defect has a lifecycle boundary already available.

### Reveal the prompt on initial page arrival

Rejected. It would repair the later task by hiding part of the sentence before
the child has heard it, reversing the intended model → join → try sequence.

### Add “scroll down,” a fade, chevron, or more-content badge

Rejected. A cue still makes a pre-reader discover and perform an extra action,
adds language or a visual convention, and does not expose the task itself.

### Shrink the sentence, prompt, or spacing

Rejected. All 70 two-line sentences currently fail, so small compression has
no robust boundary. Smaller learner text would trade reading usability for
layout and still fail on the 95 px stress card.

### Make the scroll pane or prompt a new sequential Tab stop

Not selected. The page sentence already receives route-managed focus and the
Listen control is keyboard operable. The selected control-driven flow exposes
the prompt without adding an unexplained stop for every page. Manual keyboard
scrolling and target assistive technology still need broader observation.

### Use a narration-state effect

Rejected. It is too late for the start of the device join-in utterance, can
react to pause/resume rather than a true phase boundary, and weakens the
existing generation guard.

## Standards boundary

W3C COGA advises making important tasks and information visually prominent and
available without scrolling where possible, and using clear structure and cues
to expose relationships. Treating this prompt as phase-relevant primary task
content is Parrot's design inference. The COGA patterns are supplemental, not
WCAG requirements or evidence that this exact behavior helps five-year-olds.
See [A11Y-20](./source-register.md).

WCAG Reflow allows one-axis vertical scrolling for ordinary horizontal-language
content. This 640×360 clipping result does not by itself prove a failure of SC
1.4.10. Focus Not Obscured protects focused user-interface components; the
static yellow prompt is neither currently focused nor established as a UI
component, so the clipping is not evidence of SC 2.4.11 failure. Existing
register entries [A11Y-15 and A11Y-16](./source-register.md) retain those
limits.

ACT rule `0ssw9k` is an informative, partial check for keyboard reachability of
applicable scroll containers. It does not mandate `tabindex="0"`, and it notes
that another keyboard-operable mechanism can satisfy WCAG even when the ACT
rule reports failure. This branch should verify the existing keyboard Listen
path but must not claim whole-browser keyboard or WCAG conformance. See
[A11Y-21](./source-register.md).

## Acceptance evidence

Automated behavior should prove:

- the second device utterance starts only after the prompt is fully exposed;
- replay resets the pane before the first utterance starts;
- successful completion keeps the prompt exposed;
- pause/resume does not move the pane;
- a current-generation failure exposes the recovery end of the pane;
- an open grown-up panel remains open while the complete prompt and adjacent
  recovery alert are exposed;
- page changes reset to origin and focus the new sentence before paint;
- a stale completion after navigation cannot scroll the new page or start an
  extra utterance; and
- the Listen/Pause control retains focus throughout child-initiated narration.

Rendered checks should preserve:

- complete prompt visibility at join-in and **Your turn** on Kite page 4 at
  640×360;
- complete prompt and recovery visibility with The Red Ball's grown-up panel
  open after a simulated speech failure at 640×360;
- scroll origin and complete sentence visibility on arrival and replay;
- the fixed art and controls, outer-reader scroll position, target sizes, and
  horizontal overflow contract;
- the already-full Robo threshold prompt;
- portrait and desktop behavior where no inner overflow correction is needed;
- an immediate result under `prefers-reduced-motion: reduce`; and
- all 122 catalog prompts at completion, with no page whose current prompt is
  partly or wholly clipped.

## Measurement and safety guardrails

Success is task availability, not engagement: at the modeled join-in/Your-turn
phase, current prompt visible height should be within one CSS pixel of its
height on every current page. The scroll must occur at the same synchronous
phase boundary as UI feedback; no elapsed-time claim is needed because there is
no wait or animation.

Rollback if the change moves the outer reader, artwork, controls, or document;
hides the current sentence on page arrival; changes focus; causes a stale page
callback to move the new page; adds motion; or leaves any current prompt clipped
at its participation phase.

No child data, audio, transcript, identifier, telemetry, persistence, provider,
or network behavior changes.

## Limits and follow-up

The evidence is English, left-to-right, deterministic Chromium at selected
viewports. It does not cover physical devices, Safari/Firefox, browser zoom,
increased text spacing, virtual keyboards, safe areas, translations, RTL,
screen-reader announcement order, switch access, manual scroll discoverability,
or actual child/caregiver understanding.

The cheapest next evidence is a short moderated task with young multilingual
learners: after tapping Listen on a long page, can they locate and repeat the
phrase without an adult pointing or saying “scroll”? Record task completion and
confusion, not time-on-app or child audio.

## Branch record

Research commit: `160ac63`

Implementation commit: `5464b9d`

Review coverage follow-up: `af4c9d5`

Tests: 678/678 unit, integration, lifecycle, and safety tests; 244/244 full
Chromium tests, including an executable 122-page current-catalog sweep;
TypeScript and production build passed; lint reported zero errors and two
pre-existing generated-file warnings; 399 local Markdown links, three JPEG
payloads/dimensions/digests, and `git diff --check` passed

Screenshots: one baseline and two retained in-app Browser JPEGs with SHA-256
digests under `artifacts/ux-review/story-reader-join-in-visibility`

Retain, revise, or reject: retain provisionally as a phase-aware inner-pane
visibility repair, pending the implementation memo's direct child, device,
browser, and assistive-technology follow-ups

Next question: reproduce the independent completion-to-replay focus concern,
then compare its impact with the queued profile-heading reading cue before
selecting the next stacked implementation.
