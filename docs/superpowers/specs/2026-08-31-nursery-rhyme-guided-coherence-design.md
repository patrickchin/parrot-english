# Nursery Rhyme Guided-Coherence Refresh

## Status

Approved in conversation on 2026-08-31. This is the first implementation
cycle under the continuing Nursery Learning Dummies UI/UX improvement goal.
In the product, that learner-facing area is named **Nursery rhymes** and lives
at `/dubs`.

This design narrowly supersedes four presentation decisions in the historical
`2026-08-29-nursery-rhyme-ux-redesign-design.md` at commit `ab4742d`:

- project and listen-only views return to `/dubs`, not directly to `/`;
- the interface says **whole rhyme** and **scene**, not **full video** or
  **scene video**;
- the project provides one guided Start/Continue action in addition to free
  scene choice; and
- recording-disabled learners may play the public whole-rhyme guide instead of
  seeing an empty locked card.

The six-rhyme catalog, stable definition and line IDs, artwork, lyrics, music
timing, private recording endpoints, guardian consent, and deletion contracts
remain unchanged. Five Little Ducks keeps its existing compatibility component
and persisted v2 identifiers.

## Problem

The current experience is visually warm and the line editor is already a good
atomic hear-record-next flow, but the surrounding journey does not yet feel
coherent:

- the picker promises **Sing & record**, while recording-disabled learners
  reach a sparse dead end;
- the project offers every scene with equal weight but does not say where a
  new or returning learner should begin;
- long rhymes, especially Old MacDonald, present a large workload without a
  recommended next step;
- raw counts such as `0 / 24`, **Done**, and **Retake** feel operational rather
  than encouraging;
- project navigation skips the rhyme shelf, breaking the learner's mental map;
- still illustrations are repeatedly described as video;
- long titles and scene choices lose hierarchy on narrow and short screens;
  and
- several accessible names, contrast choices, current-item semantics, and live
  announcements need correction.

The refresh should make the next useful action obvious without turning a
creative activity into a rigid wizard. It should also make consent-off behavior
useful while keeping private voice data rigorously unavailable.

## Experience Principles

1. **Guide, then allow choice.** Offer one recommended next action while
   preserving direct access to every scene.
2. **Listening is public; recording is private.** Guardian consent gates the
   microphone, saved takes, uploads, and private playback—not checked-in guide
   audio.
3. **Use the learner's vocabulary.** Describe the thing on screen as a rhyme,
   scene, picture, line, or recording. Do not imply encoded video.
4. **Make progress feel achievable.** Use short, human-readable phrases and
   warm completion feedback rather than a dashboard of terse counters.
5. **Do not hide important information to make it fit.** Titles and errors may
   wrap; the page may scroll vertically; controls must not clip or overflow.
6. **Keep the strong editor intact.** Improve its language, contrast, and
   announcements without redesigning the proven hear-record-next interaction.
7. **Prefer the existing system.** Reuse Tailwind 4 utilities, shared controls,
   route headers, catalog data, artwork, playback, and reducer patterns. Add no
   dependency, page-specific CSS, analytics system, or reward framework.

## Goals

- Set an accurate expectation on the Nursery Rhymes picker.
- Restore clear shelf → rhyme → scene wayfinding.
- Give enabled learners a deterministic Start/Continue path to the first work
  that needs attention.
- Let recording-disabled learners listen to a whole rhyme using public guide
  audio, with no route to private media or recording controls.
- Replace ambiguous video language throughout visible copy, accessible names,
  errors, and status announcements.
- Make progress, retake, scene completion, and whole-rhyme completion clearer
  and more encouraging.
- Improve label-in-name behavior, contrast, current-step semantics, live-region
  behavior, focus recovery, target sizing, and error visibility.
- Make the project useful at 640×360 without sacrificing the richer artwork
  cards on phones and desktop.
- Validate behavior, privacy boundaries, accessibility, and responsive layout
  with unit/component tests and rendered Playwright checks.

## Non-goals

- Changing the rhyme catalog, lyrics, learner names, guide voices, audio files,
  musical scores, recording duration, artwork, or media keys.
- Changing worker consent enforcement, private object keys, API versions,
  account deletion, or R2 behavior.
- Adding per-line listen-only editing, a karaoke mode, encoded video, exports,
  scoring, streaks, badges, confetti, recommendations, or a new content system.
- Reworking the homepage, guardian settings, authentication header, shared
  control system, or lesson player.
- Solving every possible future Nursery Rhymes enhancement in this cycle. A
  fresh rendered audit after delivery will identify the next evidence-backed
  cycle.

## Information Architecture and Vocabulary

The learner journey is:

```text
/
└── /dubs                         Nursery Rhymes shelf
    └── /dubs/:rhyme              Whole-rhyme project or listen-only view
        └── in-memory scene view  Recording editor when consent is enabled
```

The picker header continues to return home. A rhyme's project and listen-only
views use a `HeaderLink` with visible text **Nursery rhymes**, accessible name
**Back to Nursery rhymes**, and destination `/dubs`. The scene editor uses the
existing in-memory `HeaderButton`, renamed **Back to whole rhyme**. It returns
to the project without discarding loaded progress. Browser history remains
ordinary and direct rhyme URLs remain valid. Code uses the existing
`getNurseryRhymesPath()` helper rather than duplicating the route string.

Use the following vocabulary consistently:

| Current wording | New wording |
| --- | --- |
| Full video | Whole rhyme |
| Full video player | Whole rhyme player |
| Play/Stop/Loading full video | Play/Stop/Loading whole rhyme |
| Back to full video | Back to whole rhyme |
| Scene video | Scene picture |
| The video could not start | The rhyme could not start |

This replacement applies to visible labels, `aria-label` values, live status
messages, tests, and errors. Internal playback scope values may remain stable
when changing them would add migration risk without learner benefit.

## Nursery Rhymes Shelf

Keep the current six catalog-driven cards and responsive 1/2/3-column grid.
Add one short expectation sentence below the heading:

> Choose a rhyme to listen. With a grown-up's permission, you can sing and
> save your recording.

The sentence explains both routes before a learner commits to a card. The
visible card continues to contain the rhyme title and **Sing & record** action.
Remove the title-only custom `aria-label` from each card so its native
accessible name includes the same visible words. The artwork remains
decorative inside the named link.

Do not add progress fetching, sorting, recommendation badges, or consent checks
to the shelf. A rhyme loads its own status only after navigation, preserving
the current privacy and performance boundary.

## Enabled Project Experience

### Header and progress

Show the full rhyme title. It may wrap on narrow screens and must not be
truncated. Place a compact progress phrase next to or below it according to
available width:

- no saved lines: **Ready to start**;
- partial progress: **N of M lines ready**; and
- complete: **All M lines ready**.

The progress element remains a semantic `progressbar` with numeric
`aria-valuemin`, `aria-valuenow`, and `aria-valuemax`. Its `aria-valuetext`
matches the human-readable visible phrase.

### Recommended next action

Add one primary action between the whole-rhyme player and the scene choices.
It never replaces the scene grid:

- with no saved lines or retakes: **Start with Scene 1**;
- when the first actionable scene needs a retake: **Fix Scene N**;
- otherwise: **Continue with Scene N**; and
- when every scene is complete: omit the action and emphasize whole-rhyme
  playback plus the completion message. **Play whole rhyme** is then the main
  available action; no replacement CTA is added.

The target is derived only from current saved and needs-retake state. Iterate
scenes in catalog order and choose the first whose `getDubSceneStatus` result
is not `done`. Inside that scene, select the first line marked for retake; if
none, select the first unsaved line; if the learner explicitly opens a complete
scene, select its first line. This logic uses `definition.linesPerScene` and
works for all six definitions without a Five Little Ducks special case.

The derivation belongs in a small pure state helper so the project, scene-open
transition, and tests share one rule. It must not rename or reinterpret stable
line IDs.

### Scene choices and feedback

Scene cards remain direct buttons with scene number, title, illustration, state
icon, and state text. Replace terse text with:

- **Ready to start**;
- **N of M lines ready**;
- **Scene ready**; or
- **Needs a new take**.

The selected scene button uses `aria-current="step"`, not `page`. Its accessible
name contains scene number, the full title, and the full state. Text and icon
communicate state without relying on color.

When the selected scene is complete and the project is shown, display
**Scene N is ready — great singing!** When every scene is complete, display
**Your whole rhyme is ready — great singing!** This is derived presentation,
not a transient reward state, animation, or gamification system. Whole-rhyme
completion takes precedence so the two messages never appear together.

Whole-rhyme playback retains the existing illustrated timeline, saved-take
preference, guide fallback, Stop state, cancellation, and focus recovery. Only
its language and surrounding hierarchy change.

## Recording-Disabled Listen-Only Experience

Replace the consent-only `locked` presentation state with a semantically clear
`listen-only` view. Status loading and load-error retry remain separate.

The listen-only view contains:

- the full rhyme title;
- the whole-rhyme illustration player;
- **Play whole rhyme** / **Stop whole rhyme**;
- a short message: **You can listen now. Ask a grown-up to turn on voice
  recording if you want to sing and save your own version.**

It does not render scene-opening controls, the line editor, Record, Record
again, Play my recording, Save, microphone affordances, guardian controls, or
private progress. Whole-rhyme playback advances the existing scene artwork so
the state still feels like the same activity rather than a denial page.

Guide-only playback must have an explicit audio resolver that returns only the
checked-in public guide asset for each catalog line. It must never inspect
`state.saved`, construct `/api/dubs/.../audio`, request a private take, upload,
or call `getUserMedia`. This explicit path is a privacy guarantee and prevents
future refactors from accidentally reusing private-preferred playback logic.
Guide failures in this view do not mark lines for retake or create private
progress. Export this pure boundary as `resolveGuideOnlyDubLineAudioSource` so
it can be tested independently from browser mocks.

The worker remains unchanged: recording-disabled status still returns no saved
line information, and private audio and upload endpoints continue to enforce
current guardian consent. Public guide audio begins only after the learner
presses Play.

If consent is lost during private playback or recording, cancel private media,
recording sessions, object URLs, pending blobs, and requests first; clear saved
state; then transition to listen-only. A private 403/409 must continue to cause
that transition rather than silently falling back to a guide and calling it the
learner's take.

If initial status loading fails, keep the bounded error and retry view because
the application does not yet know which experience applies. If public guide
playback fails, reset the Play control, restore focus, and show one child-
readable alert without exposing technical details.

## Scene Editor Refinements

Preserve the current illustrated scene, lyric heading, Hear line, recording
waveform, saved-take playback, Previous/Next navigation, operation locking,
save recovery, and focus behavior.

Make these focused changes:

- rename the illustration region **Scene picture** and the header action
  **Back to whole rhyme**;
- use the existing shared `ActionButton` `variant="brand"` for Record instead
  of the white-on-rose `variant="rose"`; do not change either global token;
- keep recording state visible through icon, text, timer, and progress—not
  color alone;
- allow complete child-readable error text to wrap on short screens rather
  than line-clamping it away; and
- keep visible errors as `role="alert"`, but do not copy the same error into the
  polite status region. Operational updates such as microphone opening,
  saving, and playback remain polite status messages.

No microphone request occurs until the learner explicitly presses Record.
Every interactive control remains at least 48×48 CSS pixels.

## Responsive Layout

### Phones and regular-height screens

The shelf keeps its current one-column layout below 520 px. Project title and
progress may stack so long titles remain visible. The project keeps one
vertical reading order: title/progress, whole-rhyme player, playback and
recommended action, then rich illustrated scene cards. Vertical scrolling is
allowed; horizontal overflow, overlapping headers, nested horizontal
carousels, and clipped actions are not.

### Short-wide screens

At the existing `short-wide` condition, including 640×360, the project becomes
a purpose-built split workspace:

- the title/progress row spans the available width;
- the left column contains the 16:9 stage and 48 px playback action;
- the right column contains the recommended action and a two-column grid of
  compact scene buttons; and
- six scenes fit as three rows of controls with at least 48 px height.

Short-wide scene buttons show scene number, a one- or two-line title, and a
compact text/icon state. They omit thumbnail artwork and the visually heavy
**Choose a scene** heading; the navigation retains an accessible name. The
full title stays in each button's accessible name even when visible text must
wrap to two lines.

Use `minmax(0, ...)`, `min-width: 0`, and the existing page scroller to contain
long content. Do not introduce a horizontally scrolling carousel or an
independent scene-panel scroller in the project view. Rich illustrated scene
cards remain on phones with normal height and on desktop.

The existing short-wide scene editor layout and its vertical control-panel
scroll remain. Error text must wrap and remain fully reachable within that
existing controls flow; the one-project-scroller rule does not remove this
editor behavior.

## Accessibility Requirements

- Every card's accessible name contains its visible rhyme title and
  **Sing & record** label in the same order.
- Header, playback, recommended-action, scene, guide, record, take, save,
  Previous, and Next controls keep visible keyboard focus.
- All targets are at least 48×48 CSS pixels at 280–390 px phone widths,
  640×360 short landscape, and desktop.
- Record text meets WCAG AA contrast in its rendered enabled state; disabled,
  hover, focus, and active behavior continues to come from the shared control.
- Project selection uses `aria-current="step"`; route navigation alone uses
  page semantics.
- Progress exposes a meaningful accessible value and readable visible text.
- Status icons are redundant to text, decorative scene images do not duplicate
  button names, and full scene titles remain available to assistive technology.
- Errors are announced once. Polite operational messages are not made chatty
  by repeating visible progress on every render.
- Programmatic focus returns to the relevant playback or heading control after
  playback completion, scene entry, scene exit, cancellation, and recoverable
  errors as it does today.
- Full titles, completion messages, and errors remain readable at zoom and
  narrow widths without horizontal scrolling.
- Existing reduced-motion behavior remains intact; this cycle adds no required
  animation.

## Component and State Boundaries

- `NurseryRhymeList` owns shelf expectation copy and correctly named catalog
  cards.
- `DubProjectHome` owns whole-rhyme hierarchy, human progress copy, the
  recommended action, completion feedback, rich/compact scene presentation,
  and the selected-step semantics.
- A focused `DubListenOnly` presentation owns the recording-disabled message,
  illustration player, and whole-rhyme playback action. It has no recording or
  private-media props.
- `DubSceneEditor` remains presentation-only and receives the same recording
  operations with refined labels and shared button styling.
- `dub-state` owns the `listen-only` view and pure first-actionable-scene/line
  selection rules.
- `DubStudio` owns status loading, explicit guide-only versus private-preferred
  playback selection, media cancellation, consent-loss transition, contextual
  header behavior, live status text, and focus recovery.
- `worker/dubs.ts`, `dub-api.ts`, the catalog, saved media, and public assets do
  not change unless tests expose a pre-existing contract violation.

Use Tailwind 4 utilities directly in React components, shared controls from
`src/shared/ui.tsx`, and shared headers from `src/app/AppHeader.tsx`. Keep
`src/styles.css` and `src/lesson.css` within their existing repository-defined
boundaries.

## Performance and Resilience

- Add no runtime dependency, media asset, font, animation package, or network
  prefetch.
- Continue lazy-loading scene thumbnails on rich project cards.
- Fetch/decode public guide audio only after a playback gesture.
- Never preflight or enumerate private takes in listen-only mode.
- Reuse the existing playback scheduler and scene artwork timeline rather than
  building a second player.
- Preserve cancellation and stale-generation guards so rapid navigation cannot
  restart old media or update an unmounted view.
- Keep every error recoverable through the existing retry, Record again, Save,
  Stop, or navigation action appropriate to that state.

## Testing and Verification

Implementation proceeds test-first. Existing assertions that deliberately
encode the superseded behavior must be updated rather than worked around.

### Pure state and component coverage

- `tests/dub-state.test.mjs` covers `LOADED` into project/listen-only, the first
  actionable scene for empty, partial, needs-retake, and complete projects, and
  first retake/missing line selection within a scene for definitions with
  different `linesPerScene` values. One case places an earlier unsaved line and
  a later retake in the same scene and proves that the retake wins, as required
  by the selection rule.
- `tests/dub-ui.test.mjs` updates its existing rendered component contracts for
  new vocabulary, `/dubs` project navigation, progress and scene copy,
  Start/Continue/Fix/complete states, selected-step semantics, and the absence
  of private controls in listen-only. It does not assert Tailwind classes or
  treat source text as evidence of visual behavior.
- Existing catalog, audio, playback, and Five Little Ducks compatibility tests
  continue to pin stable IDs and persisted behavior.
- A pure resolver test iterates every line of every `DUB_DEFINITIONS` entry and
  proves `resolveGuideOnlyDubLineAudioSource` returns a checked-in public guide
  URL, has no `/api/dubs/` source or fallback, and cannot be influenced by any
  saved-state map.

### Browser coverage

- `tests/e2e/nursery-rhymes.spec.ts` verifies all six cards and that each
  accessible name contains the visible title and **Sing & record**.
- `tests/e2e/dubbing.spec.ts` verifies shelf → project → scene → whole rhyme →
  shelf navigation; empty, partial, retake, scene-complete, and rhyme-complete
  guidance; and consistent whole-rhyme terminology.
- Recording-disabled coverage presses **Play whole rhyme** and asserts public
  guide requests only: zero microphone calls, zero private audio URLs, zero
  uploads, zero private recording controls, and zero guardian controls.
- Consent-loss coverage confirms private media is cancelled and cleared before
  listen-only guide playback becomes available.
- Accessibility coverage verifies one alert for an error, accurate current-step
  state, full accessible scene titles, visible focus, 48 px targets, and
  rendered Record contrast without inspecting CSS source or class names.
- Responsive coverage renders at 280–390 px phone widths, 320×480 short phone,
  390×844 phone, 640×360 short landscape, and 1280×900 desktop. It checks full
  title visibility, header clearance, wrapping, action and scene containment,
  no overlap, no horizontal overflow, and one project scroll path. At 640×360,
  the stage, playback action, recommended action, and first and last scene
  choices are visible without scrolling in the normal enabled-project state.
  For the project heading, its rendered scroll dimensions fit its client box
  and it has no ellipsis, proving the visible title—not only its accessible
  name—is complete. Compact scene-card titles occupy at most two visible lines;
  their accessible names retain the complete title.

Playwright uses accessible locators and rendered geometry. It does not assert
Tailwind classes or stylesheet source.

### Final gates

Run:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Then perform a real-browser audit of the shelf, enabled project, listen-only
project, editor, completion state, and error state at phone, 640×360, and
desktop sizes. Inspect the console and network log, and confirm the listen-only
network boundary directly. Record remaining usability findings as candidates
for the next continual-improvement cycle rather than silently expanding this
one.

## Acceptance Criteria

1. A learner can explain from the shelf that every rhyme is listenable and
   recording needs grown-up permission.
2. A new or returning enabled learner has one obvious next action and can still
   choose any scene directly.
3. Recommended navigation opens the earliest retake or unsaved line in catalog
   order and behaves correctly for all six rhyme shapes.
4. A recording-disabled learner can play the public whole rhyme but cannot see
   or trigger microphone, upload, saved-take, private-audio, guardian, or scene-
   editor behavior.
5. Project and listen-only back navigation returns to `/dubs`; scene back
   returns to the whole rhyme in memory.
6. No learner-facing or accessible UI describes the illustrated rhyme as a
   video.
7. Progress and completion use the approved child-readable phrases, with
   semantic values and non-color state cues.
8. Picker labels, Record contrast, current-step semantics, focus, target size,
   error visibility, and announcement behavior meet the requirements above.
9. Long titles and all required actions are usable without overlap or
   horizontal overflow at the required viewports; 640×360 uses the compact
   split project and one page scroll path.
10. Stable catalog IDs, Five Little Ducks v2 compatibility, private recording
    behavior, consent enforcement, audio timing, and existing artwork remain
    intact.
11. All unit, lint, build, browser, rendered, console, and privacy-network gates
    pass before the cycle is considered complete.
