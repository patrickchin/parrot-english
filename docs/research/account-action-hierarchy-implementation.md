# Account action hierarchy implementation

Status: implemented and provisionally retained

Date: 2026-08-24

Branch: `codex/account-action-hierarchy`

Base branch / dependency: `codex/lesson-shelf-heading-reading-cue` at
`080dbbb`

Research, baseline, and prototypes: `796f875`

Rendered behavior contract: `a2fb815`

Initial implementation: `b73a92c`

Review-driven refinement and evidence: `8ab298a`

Research contract:
[`account-action-hierarchy-guidance.md`](./account-action-hierarchy-guidance.md)

Visual evidence:
[`account-action-hierarchy/manifest.md`](../../artifacts/ux-review/account-action-hierarchy/manifest.md)

## Outcome

The Account menu no longer gives routine **Sign out** and irreversible
**Delete account** identical bright-pink weight. Sign out now follows the two
ordinary account utilities on their established neutral surface. Delete comes
last, after a twelve-pixel structural break, on a pale-rose surface with a
literal dark-red label. The stronger filled deep-rose treatment is reserved
for the existing password-enabled **Delete account now** confirmation.

The menu still opens on **Learner profile**, exposes the same name and email,
and preserves its existing declared ARIA menu/button semantics. Sign out
remains direct. Delete
still opens the same named dialog with loss explanation, password requirement,
disabled-until-complete final action, duplicate guard, Cancel, Escape, focus
trap, and opener focus return. No request, callback, route, auth state,
deletion data boundary, label, icon, sound, timer, animation, or dependency
changed.

This is primarily a caregiver hierarchy improvement, but the menu remains
visible from child activities. The quieter initial deletion treatment also
avoids turning a dangerous action into the most saturated child-attracting row.

## Reproduced baseline and rejected alternatives

At base `080dbbb`, menu order was **Learner profile**, **AI and saved data**,
**Delete account**, **Sign out**. Delete and Sign out were adjacent 184x44
bright-pink rows with the same dark text, shape, elevation, and four-pixel gap.
The baseline already had sufficient target geometry, label contrast, focus
paint, tested arrow/Home/End/Escape keyboard behavior, and a staged deletion
dialog; the defect was false visual equivalence and grouping.

Three isolated real-code worktrees compared the cheapest plausible changes:

| Prototype | Result | Decision |
| --- | --- | --- |
| B1, neutral Sign out only | Delete became the menu's sole saturated, first-gaze action; the fused gap remained. | Rejected. |
| B2, neutral Sign out plus separated muted Delete | Increasing consequence was visible without making deletion primary; only the final confirmation became strongly destructive. | Selected. |
| B3, neutral Sign out plus separated neutral Delete | Calm, but Delete depended more heavily on red words and English reading. | Rejected in favor of B2's second surface cue. |

The selected B2 prototype used an eight-pixel destructive break. Independent
original-resolution review found that the complete focus paint exactly
consumed that space. A review-driven red contract required twelve pixels; the
final implementation leaves four visible navy pixels between the focused row
and its neighbor while retaining 28 pixels below the panel at 640x360.

## Implemented boundary

Three production components changed:

- `src/shared/ui.tsx` adds one `dangerSurface` variant to the shared control
  primitive. It reuses the existing surface elevation and interaction model
  with Tailwind's opaque pale-rose background and dark-red foreground.
- `src/app/AppHeader.tsx` renders Sign out before Delete, leaves Sign out on the
  default neutral surface, renders Delete with `dangerSurface`, and adds eight
  pixels of top margin on top of the menu's ordinary four-pixel grid gap.
- `src/app/AccountDeleteDialog.tsx` uses the existing filled `rose` variant for
  the enabled final action instead of the general brand-pink default.

No page-specific copy of the shared menu control, global CSS rule, color token,
or new component was introduced.

## Test-first and diagnostic evidence

The initial rendered contracts were written before production edits. Against
the baseline they failed on the exact old order and equal destructive/routine
chrome. After the selected implementation they require, at 280x568, 390x844,
640x360, and 1440x900:

- exact DOM and visible order **Learner profile**, **AI and saved data**,
  **Sign out**, **Delete account**;
- Sign out chrome equal to an existing neutral utility and Delete different
  from both, with an opaque light surface rather than a new saturated primary;
- 184x44 rendered targets and a twelve-pixel destructive gap versus each
  ordinary four-pixel gap;
- End reaching Delete and ArrowUp reaching Sign out;
- stronger final confirmation chrome than both muted Delete and Cancel;
- visible, contained focus in ordinary and forced colors; and
- no changed sign-out or deletion outcome.

The review-driven twelve-pixel contract was also observed red: it expected at
least 12 pixels and measured the selected prototype's 8 pixels. After the
single `mt-1` to `mt-2` implementation change, the hierarchy and forced-colors
cases passed and every candidate screenshot was regenerated.

The first full browser run exposed a separate test-settlement race in the
pre-existing long-identity stress case: 328/329 cases passed, while one case
opened Account before the route's documented next-animation-frame heading
focus had settled. The later heading focus then owned the page instead of the
menu's first item. The trace showed the localized **Pick a lesson** arrival
marker, and the exact test reproduced the symptom once in 25 parallel runs.
The test now waits for that existing route-arrival focus boundary before
simulating a visible user's Account activation. The same 25-run stress command
then passed 25/25. Product focus arbitration for an exceptionally early user
input remains a separately recorded question; this hierarchy branch does not
silently change the global route-focus algorithm.

## Rendered result

| Viewport | Panel | Target | Ordinary / destructive gap | Bottom clearance |
| --- | --- | --- | --- | --- |
| 280x568 | 208x270 at `x=62, y=62` | 184x44 | 4px / 12px | 236px |
| 390x844 | 208x270 at `x=168, y=74` | 184x44 | 4px / 12px | 500px |
| 640x360 | 208x270 at `x=422, y=62` | 184x44 | 4px / 12px | 28px |
| 1440x900 | 208x270 at `x=1204, y=96` | 184x44 | 4px / 12px | 534px |

Rendered normal-state text contrast is 5.73:1 for neutral Sign out, 7.61:1
for muted Delete, and 4.67:1 for the enabled final confirmation. Dedicated
tests also cover rest, hover, active, focus, disabled, opacity, filters,
translucent menu compositing, and forced colors rather than inferring state
quality from these three normal-state figures.

The evidence bundle contains 13 baseline captures, 13 real-code prototype
captures, 14 deterministic final PNG captures, and one genuine 1280x720
in-app Browser JPEG. An encoding audit corrected baseline and B3 filenames
from `.png` to `.jpg` because their unchanged bytes were JPEG. The manifest
records every final path, actual type, dimensions, state, source branch, and
SHA-256.

## Timing and content-shift result

The implementation adds static DOM order and CSS paint only. It introduces no
new request, event handler, timer, animation, programmed wait, state hook, or
effect, and it does not alter post-activation auth/deletion request logic.
Shared controls retain their existing interaction transitions. The panel grows
eight CSS pixels relative to baseline and opens as the same overlay; the
underlying lesson layout does not shift, though human finding and selection
time can still change.

At 390x844, a candidate-only 20-sample Chromium harness measured from a DOM
click through two `requestAnimationFrame` callbacks. Menu opening measured
13.8 ms median and 14.22 ms p95; deletion-dialog opening measured 12.6 ms
median and 14.57 ms p95, with a 23.4 ms maximum. Without a paired baseline,
this two-frame settlement proxy is neither a paint timestamp nor evidence of
equal latency. It is not a claim about physical input latency, low-end
hardware, browser event delivery, screen-reader announcements, or production
network time.

Sign out still closes the menu before its conditional **Signing out…** row can
be seen. That existing response-feedback concern is deliberately queued as a
separate timing improvement instead of being hidden inside this hierarchy
change.

## Independent review

The first independent code/test review reported no correctness, shared-control,
auth/deletion, keyboard, contrast, or regression finding. Its fresh checks
passed 686 unit/lifecycle cases, 52 affected browser cases, two route-outcome
cases, TypeScript, and `git diff --check`.

Independent original-resolution visual review gave a ship judgment. It found
the candidate materially calmer and clearer than baseline, B1, and B3; targets,
focus, forced colors, content overlay, short-landscape containment, and final
confirmation all remained usable. Three observations drove follow-up:

1. The eight-pixel focus gap was refined to twelve and recaptured.
2. The in-app evidence was renamed to identify its real first-item focus state
   instead of implying a pointer-only modality.
3. The inherited deletion explanation contains abstract caregiver English,
   especially **deletion marker**; plain-language and localization research is
   now a separate backlog item because simplifying that disclosure without
   checking the actual data boundary could become misleading.

The reviewer then rechecked the twelve-pixel matrix and retained the ship
judgment: a four-pixel separator now survives normal and forced-color focus,
the 208x270 short panel retains 28 pixels below it, and no target, wrapping,
shift, overlap, or hierarchy regression appeared. A transient desktop chevron
frame in the pointer artifact was recaptured only after its transform finished.

Independent accessibility/research review found no defect in the selected
color/order/spacing hierarchy, its WCAG 3.3.4 framing, or source support for the
GOV.UK, Apple, and USWDS inferences. It did identify four documentation and
future-product boundaries that were corrected rather than hidden:

- the popup's current Tab behavior is not a complete APG composite menu;
- password-first deletion-dialog focus does not prove assistive technology
  announces the consequence copy;
- the proposed caregiver study needed exactly eight participants, paired
  counterbalanced baseline/candidate conditions, a timing boundary, preferred-
  language instructions, and actual English-reading screening; and
- candidate-only two-frame timing cannot establish equal paint latency, while
  human finding time can change even without a new programmed delay.

The source register and guidance now state those limits, and each product
question has a dedicated backlog entry. Final clean-tree verification is
recorded in the completed hand-off below.

## Final verification

The final commands ran against source/evidence commit `8ab298a` after the
twelve-pixel refinement and screenshot recapture:

- `npm test`: 686/686 tests in 89 suites passed;
- `npm run test:browser`: 329/329 Chromium cases passed in 1.4 minutes;
- `npm run build`: TypeScript and Vite production build passed; the existing
  chunk-size advisory remained informational;
- `npm run lint`: zero errors and the same two generated Worker declaration
  warnings;
- final affected header/contrast run: 52/52 passed;
- accessibility lifecycle run: 7/7 passed;
- post-settlement long-identity stress run: 25/25 passed;
- all 41 manifest entries decoded with the named format and dimensions and
  matched SHA-256;
- all 99 local links across the seven branch Markdown files resolved; and
- `git diff --check` passed.

Three independent final reviews covered code/tests, original-resolution visual
evidence, and accessibility/research claims. After the documented review-driven
changes, each reported no remaining actionable finding.

## Limits and follow-up

This branch establishes deterministic hierarchy and interaction behavior in
Chromium. It preserves, but does not establish conformance of, the popup's
pre-existing `menu`/`menuitem` pattern: native menu-item buttons still remain
in the ordinary Tab sequence instead of implementing APG composite-menu Tab
exit and roving focus. That semantics decision is queued separately rather
than obscured by passing arrow-key tests.

It also does not establish low-English caregiver comprehension, child first-
gaze attention, accidental physical activation, localization/RTL copy,
VoiceOver, TalkBack, NVDA, switch or voice control, Safari, Firefox, real
Windows High Contrast palettes, zoom/text-spacing, physical touch size, or
low-end-device latency.

Retain provisionally while the menu continues to expose literal labels,
staged confirmation, 44px targets, contained focus, and the measured short-
landscape clearance. Revise if Sign out appears disabled, Delete again becomes
the most magnetic row, any focus paint fuses or clips, a target shrinks, or a
caregiver predicts the wrong consequence.

The cheapest external evidence is the paired formative design specified in the
[guidance memo](./account-action-hierarchy-guidance.md): exactly eight
caregivers, actual account-settings English-reading screening, preferred-
language instructions, four/four counterbalanced baseline/candidate order,
synthetic resettable accounts, and a menu-visible-to-first-selection timing
boundary. Record first selection, prediction, hesitation, completion, and
whether any neutral row appears unavailable; never expose a child to an
executable deletion task.

## Hand-off record

```text
Branch: codex/account-action-hierarchy
Base branch / dependency: codex/lesson-shelf-heading-reading-cue at 080dbbb
Commits: 796f875, a2fb815, b73a92c, 8ab298a
Hypothesis: separating routine exit from staged deletion can improve consequence prediction without making deletion the menu's visual primary
Changed: shared muted-destructive surface; menu order and 12px group break; final confirmation color role; rendered contracts and evidence
Not changed: visible labels, account identity, auth/deletion callbacks or requests, password gate, focus algorithms, routes, child activity content, audio
Tests: order, chrome, target geometry, grouping, keyboard sequence, contrast states, forced colors, dialog escalation, failure recovery, CJK/RTL short menus, route outcomes, and full regression suite
Screenshots / traces: artifacts/ux-review/account-action-hierarchy/manifest.md
Measured result: 184x44 targets; 4px ordinary and 12px destructive gaps; 28px minimum sampled panel clearance; 5.73:1, 7.61:1, and 4.67:1 normal-state text contrast; <=14.57ms local p95 settlement proxy
Risks / limitations: direct caregiver/child comprehension, localization, target AT and browsers, physical forced colors/devices, and field latency remain untested
Retain, revise, or reject: retain provisionally after selecting B2 and increasing its gap from 8px to 12px in visual review
Next question: can a slow Sign out request expose immediate, stable, plain feedback without reopening the menu or shifting the child activity?
```
