# Lesson shelf heading reading-position cue implementation

Status: implemented; final review and full-browser verification pending

Date: 2026-08-24  
Branch: `codex/lesson-shelf-heading-reading-cue`  
Base branch / dependency: `codex/profile-account-label-clearance` at `86f5f72`  
Research and baseline commit: `6619248`  
Rendered-contract commit: `6fc3f3d`  
Implementation commit: `2081cea`

Review-driven visual revision: `297bd4e`

## Outcome

The lesson shelf now gives its programmatically focused **Pick a lesson**
heading one quiet reading-position marker instead of relying on Chromium's
full-width default outline. Direct load, Home pointer activation, Home keyboard
activation, and Talk recovery all reach the same native heading and therefore
the same presentation.

The visible words remain centered at their previous position. Only the heading
box shrink-wraps those words; a static four-pixel blue pill sits twelve pixels
before that box while it owns focus. It is centered through 60% of the heading
height and has fully rounded ends so it does not share the line's complete
caret/quotation-bar silhouette. Blur removes it immediately. In forced colors,
a system-mapped two-pixel outline surrounds the text-sized box and the
decorative marker is absent.

The change adds no copy, icon, sound, animation, timer, request, dependency,
hook, control, or Tab stop. Route focus still uses its existing single next-
animation-frame hand-off with `preventScroll`.

## Reproduced baseline

At base `86f5f72`, the lesson shelf heading was a block spanning its full
`max-w-6xl` header. It had no authored focus presentation. Chromium produced
two contradictory results from the same correct focus lifecycle:

- direct and keyboard arrival matched `:focus-visible` and drew a one-pixel
  `auto` blue rectangle 258, 368, 610, or 1,154 pixels wide at the sampled 280,
  390, 640, and 1440 viewports;
- pointer arrival still focused the native `h1` but did not match
  `:focus-visible`, so it drew no visible cue.

At desktop the outline was 2.67 times the rendered title width. It visually
framed a static page region like a selection or input. The 280-pixel variant
competed with nearly the complete content row. Forced-colors mode retained the
same full-block default at only one CSS pixel.

Instrumented navigation found focus 2.5–10.7 ms after heading insertion. The
heading rectangle stayed identical and pointer/keyboard navigation reported no
post-action cumulative layout shift, identifying a late paint inconsistency
rather than content movement. Full measurements, source mapping, rejected
alternatives, and evidence limits are in the
[guidance memo](./lesson-shelf-heading-reading-cue-guidance.md).

## Implemented boundary

Only the existing lesson `h1` in `LessonList.tsx` changed. It now:

- explicitly retains `tabIndex=-1` and native level-one semantics;
- uses a centered, text-sized box with a viewport-safe maximum width;
- removes the normal UA outline;
- paints a non-interactive `::before` pill on actual `:focus`, sixteen pixels
  before the box, leaving a twelve-pixel gap; it is four pixels wide, centered
  at 60% of heading height, fully rounded, and capped at 96 pixels;
- explicitly disables pseudo-element transitions;
- hides that decoration in forced colors; and
- restores a real two-pixel solid outline with two-pixel offset in forced
  colors.

`RouteFocusManager`, the lesson header, subtitle, cards, My Lessons state,
account header, route action, Story Reader, profile flow, and global focus
system are unchanged. A global route-heading component was deliberately not
introduced because the other headings do not yet share one verified lifecycle
and layout contract.

## Test-first evidence

Six Playwright contracts were added before the implementation. Against the
unchanged baseline, five failed and the preservation-only Tab test passed:

| Contract | Baseline result |
| --- | --- |
| Direct 280x568 localized cue | Failed: heading box exceeded text by 40.22 px |
| Direct 640x360 localized cue | Failed: heading box exceeded text by 248.36 px |
| Pointer-arrived localized cue | Failed: heading box exceeded text by 150.22 px; no authored cue |
| Keyboard-arrived localized cue | Failed: heading box exceeded text by 150.22 px; default closed cue |
| Next Tab reaches first lesson | Passed: the existing negative-tabindex sequence was already correct |
| Forced-colors localized indicator | Failed: default outline was one CSS pixel |

After the one-heading implementation, all six passed. Independent screenshot
review then rejected the first full-height rail as a caret/quotation bar. A
review-driven contract required the wider gap, centered 60% shape, rounded
ends, and empty marker strips both above and below it; all four normal-color
arrival cases failed against the initial rail and passed after revision. Two
additional preservation checks now hold My Lessons loading through initial
focus and require both computed and rendered decorative-marker suppression in
forced colors.

The contracts use accessible roles and names, decoded before/after screenshots,
actual composited pixel contrast, and bounding geometry; none asserts Tailwind
class strings or CSS source. They require:

- exact native heading focus and `tabindex=-1`;
- a continuous four-pixel centered marker at 3:1 or better against the rendered
  background, with rounded-end tolerance, an empty twelve-pixel gap, empty
  strips above and below it, and no closed right perimeter;
- identical heading text-range, subtitle, first-card, Account, Back, scroll,
  and overflow geometry across focus and blur;
- no pseudo-element animation or transition under both motion preferences;
- pointer and keyboard parity;
- first-lesson ownership after one forward Tab; and
- a computed and rendered two-pixel forced-colors outline on both vertical
  edges, with the normal decorative marker absent.

Focused surrounding verification currently passes:

- 7/7 new lesson-shelf cue cases;
- the complete shared-focus cases, including delayed My Lessons settlement;
- 76/76 header, Home, surrounding-page, and Talk recovery cases;
- 686/686 unit, integration, lifecycle, and safety cases;
- production TypeScript/build; and
- lint with zero errors and the two unchanged generated Worker declaration
  warnings.

The required complete `npm run test:browser` run will be recorded after
independent review and any resulting revision.

## Visual and geometry evidence

The candidate title boxes are now 215.78, 215.78, 359.64, and 431.56 pixels
wide at 280x568, 390x844, 640x360, and 1440x900 respectively—equal to the
measured title range instead of the 256–1,152 pixel header span. Their x/y
positions match the baseline title glyph positions. The final pill is exactly
four pixels wide with a twelve-pixel box gap and is 21.59, 21.59, 36, and 43.19
pixels high at those viewports.

Uncropped focused and marker-cleared screenshot pairs cover all four viewport
sizes. The 390x844 focused image uses real pointer navigation. A separate
640x360 capture confirms the forced-colors fallback. Genuine in-app Browser
captures compare the full-width baseline and localized candidate at 1280x720.
The images and their SHA-256 provenance are indexed in the
[artifact manifest](../../artifacts/ux-review/lesson-shelf-heading-reading-cue/manifest.md).

Initial visual inspection found the title stays centered, Account and Back
remain clear, and blur removes paint without moving the heading, subtitle, or
cards. It also caught and rejected the first full-height rail because it looked
like `|Pick a lesson`. The final matrix was regenerated from the centered,
rounded 60% revision. At 640x360 the large heading and card crop remain the
pre-existing short-landscape composition; this branch changes neither.

## Timing and content-shift result

The implementation is focus-dependent CSS paint on the already-owned heading.
It cannot add a request, JavaScript task, timer, animation, or transition. The
focus effect and next-animation-frame schedule are byte-for-byte unchanged.
The new cue is present in the first settled screenshot after that focus and
clears on blur without a delayed frame of authored motion.

This is not a field latency result. Real low-end devices, font loading, route
chunk loading, and assistive-technology announcement timing remain separate
measurement boundaries.

## Limits and follow-up

This branch proves a deterministic rendered behavior in Chromium, not that a
young learner understands the rail. It also does not establish VoiceOver,
TalkBack, NVDA, switch, voice-control, Safari, Firefox, real Windows High
Contrast, zoom/text-spacing, localization/RTL, physical safe-area, or physical-
device results.

Retain provisionally only if independent review and the complete browser suite
stay clear. Revise or roll back if the rail reads as a caret/quotation bar,
touches the title, loses forced-color visibility, moves the title/cards,
changes the next Tab target, or obscures persistent header controls.

The cheapest next external evidence remains a marker/default/no-cue comparison
with low-English learners and caregivers. Ask them to point to what changed
and what they would do next, without teaching or naming the marker first.
