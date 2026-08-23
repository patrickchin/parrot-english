# Story Reader child-first control order implementation

Status: implemented and provisionally retained

Branch: `codex/story-reader-child-first-tab-order`

Base: `codex/story-reader-completion-focus` documentation hand-off at
`c2a0a24`

Research commit: `1e8222e`

Implementation commit: `9f74815`

Review hardening: `41697d8`, `3aa57dd`

Review date: 2026-08-24

## Outcome

Story Reader is now a read-only child learning activity. After the current
sentence receives its existing page-arrival focus, ordinary forward navigation
enters only the story controls: **Listen**, then **Next** on page 1; **Back**,
**Listen**, then **Next** or **Finish** on later pages.

The duplicate **Grown-up options** disclosure and personalized-art editor were
removed from every active story page. The complete editor remains on the story
shelf, including upload, guardian consent, generation, deletion, errors, and
status. Saved private artwork still replaces The Red Ball's default page-one
image in Story Reader and the related learner speaking turn.

This is a product-boundary simplification, not an authored Tab-order system. It
adds no focus manager, positive `tabIndex`, key listener, CSS order, duplicate
control, child-facing words, wait, animation, route, API, dependency, or media.

## Measured baseline

The Red Ball's programmatically focused sentence was followed in DOM order by
a native caregiver disclosure and then the story-control navigation. The
result was deterministic:

- page-one **Listen** took two forward moves while the disclosure was closed
  and four while it was open;
- middle/final **Listen** took three and five moves respectively;
- the API-disabled state still rendered an empty focusable disclosure;
- focusing the closed disclosure moved the 640x360 reading pane about 50 px
  and removed the title before the child reached **Listen**; and
- traversing the open form could hide the sentence and prompt at outer-reader
  `scrollTop` 513 on 280x568 and 652 on 1280x800, persisting through playback.

No child control was unreachable. The defect was priority and context: an
optional adult privacy/setup task came before the primary child action and
could move the active learning surface.

## Implemented boundary

`App` still loads personalized-art metadata for authenticated routes and passes
the saved story/page overrides into `StoryReader`. It no longer imports or
composes the editor for that route. `StoryReader` no longer accepts a
`personalizationPanel` prop or renders its disclosure.

`StoryList` remains the editor owner. This also removes the panel's now-dead
`showPreviewArtwork` option and hidden-preview branch: the shelf always shows
the saved preview, while the reader independently shows the saved page art.

A review-driven cleanup-only journey found one adjacent feedback defect. When
generation was disabled but stored private art remained, deletion succeeded
and immediately unmounted the sole panel before its existing success status
could be seen. The shelf now retains a status-only confirmation card after
that deletion. On reload, the card naturally disappears because no stored art
or transient status remains.

Keyboard review then found that native `disabled` moved focus from the pending
delete action to `BODY`. The shelf now uses the established `aria-disabled`
pending-action pattern, guards duplicate activation, keeps the action focused
through the request and a failed retry state, and hands focus once to the
non-sequential visible success status. If the caregiver moves elsewhere during
the request, completion does not steal focus back.

## Test-first evidence

Before production removal, the four new responsive keyboard-order cases all
failed because **Grown-up options** was still present. After removal, all four
passed with exact first/middle/final forward and reverse control sequences,
visible focused controls, silent arrival, and every scroll owner at origin.

The cleanup-only shelf case was also written before its feedback repair. It
failed at the expected visible text—**Personalized story art removed.**—because
the panel had disappeared. The status-only retained state made the same journey
pass without restoring generation controls.

Existing reader tests that deliberately opened the now-removed editor were not
discarded wholesale. Their child-owned contracts remain: read-aloud errors keep
the prompt and recovery visible; short-wide narration and page changes keep the
art and controls fixed; saved art renders; and shelf creation/deletion still
work.

## Visual evidence

Genuine in-app Browser review at 280x568, 390x844, 640x360, and 1280x800 found
that the illustration, title, sentence, prompt, and controls retain their
authored positions. Portrait and desktop readers become deliberately sparse,
but the unused area reads as a calm learning stage rather than an orphaned
slot. The illustration continues to carry the composition's visual weight.

At 640x360, the reading pane changed from 161 px client / 211 px scroll height
to 161 / 161. It has no hidden secondary content for focus to reveal.
Repository Playwright captures after an actual first Tab show the complete
keyboard ring around **Listen** at 280x568 and 640x360 while the pane, reader,
and window remain at zero.

The [artifact manifest](../../artifacts/ux-review/story-reader-child-first-tab-order/manifest.md)
contains four baseline images, four responsive child-only candidates, two
actual-Tab focus candidates, one focused cleanup confirmation, viewport
geometry, provenance, SHA-256 digests, and evidence limits.

## Automated evidence

Rendered coverage proves:

- enabled and disabled readers expose neither the disclosure nor the editor;
- stored art still renders on a direct story URL;
- first, middle, and final pages have the exact native forward and reverse
  child-control order at 280x568, 390x844, 640x360, and 1280x800;
- focused controls remain completely inside the viewport without moving the
  outer reader, inner pane, main, document, body, or window;
- Back, Next, narration, narration replay, completion, and completion replay
  preserve their existing focus, scroll, cancellation, silence, and stale-
  callback contracts;
- art, prompt, and controls stay fixed through short-wide narration and page
  changes;
- the shelf retains enabled generation, saved-art deletion, and a generation-
  disabled cleanup-only path with pending, failure, success, and no-focus-
  stealing keyboard contracts; and
- no horizontal overflow or forbidden story media construction appears.

Final validation after both review-hardening commits:

| Check | Result |
| --- | --- |
| Exact responsive Story Reader order | 4/4 passed |
| Personalized-art shelf journeys | 7/7 passed |
| Independent reader state/page/viewport matrix | 27/27 passed |
| Component, lifecycle, integration, and safety tests | 678/678 passed |
| TypeScript and production build | Passed |
| Lint | 0 errors; 2 generated-worker warnings |
| Research links | 527 local links across 79 Markdown files; 0 missing |
| Visual artifacts | 11/11 JPEG dimensions and SHA-256 digests verified |

The complete Chromium run passed 259/260 cases. The sole failure was the
pre-existing Lesson Player microphone fixture: under parallel load its brief
**Opening mic...** state advanced to **Tap when done** before Playwright could
observe it. A ten-run parallel diagnostic reproduced the race in 5/10 runs.
No Story Reader or personalized-art case failed. The product also drops focus
to `BODY` and duplicates that pending message, so the issue is recorded as the
next stacked improvement rather than hidden behind a retry of this suite.

## Review decision

Independent code review found the saved-override lifecycle intact and no
reader production regression. It requested four bounded corrections, all
accepted: restore the artwork-position assertion that also fixed lint, add an
integrated cleanup-only shelf journey, remove the editor's dead preview-hiding
API, and repair pending/success focus after the new journey exposed `BODY`.
A final repeated review of `41697d8..3aa57dd` found no actionable issue after
30 pending/failure/no-focus-steal repetitions.

Independent visual review passed all four candidate sizes. It requested
focused-**Listen** evidence and softer wording for two product/engineering
inferences; both were incorporated. The focused screenshots use actual
Playwright Tab input and are explicitly distinguished from in-app Browser
captures in the manifest.

Retain provisionally. Roll back or revise if caregivers cannot find or complete
the shelf edit/delete path, if direct-link detours cause unacceptable task
loss, if saved artwork becomes stale or unreliable, or if target-device child
observation shows that the sparser reader looks incomplete rather than calm.

## Limits and next questions

The evidence is deterministic English left-to-right local Chromium. It does
not establish VoiceOver, TalkBack, NVDA, Switch Control, physical keyboard or
touch behavior, Safari/Firefox, zoom or text-spacing behavior, localization,
right-to-left order, safe-area behavior, child comprehension, or caregiver
discoverability. DOM focus and a rendered ring do not prove what a particular
assistive-technology pair announces.

The route tradeoff is intentional: a caregiver entering through a direct story
link must go **Back to stories**, open **Grown-up options**, edit, and re-enter;
the page number is not restored. Observe that workflow before designing a new
caregiver surface.

The next stacked branch is
`codex/lesson-microphone-direct-action-feedback`. Direct reproduction at all
four target sizes found that **Tap to talk** becomes natively disabled while
permission is pending, drops focus to `BODY`, and repeats **Opening mic** in
both the prompt and button with two spinners. The profile-heading reading cue
remains the best visual follow-up. The Story Reader paragraph-semantics defect
needs target assistive-technology evidence before changing its accessible
tree.
