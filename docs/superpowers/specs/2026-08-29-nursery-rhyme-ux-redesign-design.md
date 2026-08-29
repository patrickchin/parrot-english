# Nursery Rhyme UX Redesign

## Status

Approved in conversation on 2026-08-29. This design supersedes the homepage,
entry-flow, scene-artwork, project-home, and scene-editor presentation in the
Five Little Ducks storyboard and Old MacDonald designs. Their authored lyrics,
timing, guide audio, private recording storage, guardian consent, and deletion
contracts remain unchanged.

## Problem

The current nursery-rhyme experience has four connected presentation problems:

- Five Little Ducks and Old MacDonald appear as separate top-level activities,
  creating five small homepage cards instead of one clear nursery-rhyme area.
- The homepage cards leave most of a desktop viewport empty, use pictures that
  are too small, and force long labels across several short lines.
- Entering an enabled rhyme stops on a Start/Continue disclosure card before
  showing the actual project, adding a click without adding a choice.
- The project and editor views use undersized, hard-to-distinguish scene cards,
  an unaligned right panel, incomplete previous/next navigation, no replay for
  an already-saved line, and a separate Back to full video control that does not
  fit the shared route header.

Old MacDonald's farm presentation is also made from CSS geometric shapes. It
does not meet the illustrated visual standard used elsewhere in the product.
Five Little Ducks uses one repeated environment and tiny composited actors, so
its six scene thumbnails are difficult to distinguish at a glance.

## Goals

- Present four equal learner activities in one desktop row: Lessons, Talk to
  Peppa, Story time, and Nursery rhymes.
- Give homepage artwork most of each card and keep visible labels short enough
  to remain on one line at ordinary desktop widths.
- Introduce one Nursery Rhymes page containing the two current songs.
- Replace every rhyme scene selector image with a distinct generated
  illustration and remove the CSS farm drawing entirely.
- Open an enabled rhyme directly on its full-video project workspace.
- Make the full-video artwork and scene panel align as one intentional layout.
- Use the shared header back control for scene-to-project navigation and make a
  second press return to the application root.
- Let a learner move to both the previous and next line within a scene.
- Let a learner play an already-saved recording after returning to the page.
- Preserve private recording behavior, fixed timing, audio fallbacks,
  accessibility, and responsive containment.

## Non-goals

- Producing encoded video files, exporting a dub, or stitching media on a
  server.
- Creating line-by-line animation, a new animation runtime, or a video editing
  timeline. Full-rhyme playback continues to schedule audio against the
  authored clock while changing the displayed scene illustration.
- Changing lyrics, cue times, recording limits, guide audio, API versions, R2
  recording keys, consent, or account-deletion behavior.
- Adding more nursery rhymes or building a generic content-management system.
- Adding progress requests to the Nursery Rhymes picker. Each rhyme loads its
  own private status only after the learner opens it.

## Information Architecture and Routes

The authenticated learner routes become:

```text
/
└── /dubs
    ├── /dubs/five-little-ducks
    └── /dubs/old-macdonald
```

The homepage links to `/dubs` through one **Nursery rhymes** card. The new
picker has a shared route header back to `/`, a **Nursery rhymes** heading, and
two large illustrated links: **Five Little Ducks** and **Old MacDonald Had a
Farm**. Direct rhyme URLs remain valid and safe authentication return targets.

The rhyme workspace intentionally returns directly to `/` from its project
home instead of adding another mandatory stop at `/dubs`. From a scene editor,
the first header-back press returns to the full-video project in place and the
second header-back press returns to `/`. The browser's ordinary history still
allows a learner who arrived through `/dubs` to revisit the picker.

## Homepage

Desktop at `md` and wider uses one row of four equal cards. The row may consume
the full existing content width rather than being compressed into the center.
Each card contains:

- a generated or existing 3:2 activity image occupying most of the card;
- one short visible label: **Lessons**, **Talk to Peppa**, **Story time**, or
  **Nursery rhymes**;
- one large, high-contrast directional affordance while the entire card remains
  the link target;
- the existing descriptive accessible name where it is clearer than the short
  visible label.

At ordinary desktop width the four labels remain on one line. Phones use two
columns, and short landscape keeps one compact row of four when it fits without
overlap. The page may scroll vertically at ultra-narrow or unusually short
viewports; it must not shrink cards into unreadable tiles or overflow
horizontally.

The Nursery Rhymes homepage artwork is one generated picture-book illustration
showing a mother duck with ducklings near a cheerful farm. It is not a collage
of DOM shapes or nested interactive choices.

## Generated Artwork

Generate twelve wide, text-free, child-friendly picture-book illustrations:

1. one shared Nursery Rhymes cover;
2. six Five Little Ducks scenes: five ducks, four ducks, three ducks, two
   ducks, one duck, and sad mother duck reunited with all five;
3. five Old MacDonald scenes: cows, ducks, pigs, dog, and sheep.

The illustrations share a warm hand-painted storybook style, clear silhouettes,
bright natural colors, gentle expressions, and composition that remains legible
at thumbnail size. Five Little Ducks keeps the same mother duck and duckling
design across all six scenes. Old MacDonald keeps the same farmer, red barn,
and landscape across all five scenes. Every scene differs materially in animal
count, featured animal, pose, weather, or composition so adjacent thumbnails
can be recognized without reading their number.

Use the built-in image generation tool, which does not require an API key. Save
the selected project-bound outputs under an ignored local source directory,
normalize final delivery files to 1536×864 WebP, and publish them to new
immutable keys below:

```text
https://media.parrotbook.com/assets/v5/dubbing/nursery-rhymes-cover.webp
https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-*.webp
https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/scene-*.webp
```

Preflight every target key before uploading, never overwrite an existing
immutable object, set `image/webp` and
`public, max-age=31536000, immutable`, then verify the delivered MIME type,
cache policy, non-empty body, dimensions, and decode.

Each rhyme definition owns ordered scene-artwork metadata: source URL, width,
height, and useful alternative text. The same scene image is used by the full
player, scene editor, and scene selector. This makes the final full-rhyme
presentation exactly the ordered set of still scenes used while recording.

## Entry and Consent States

Status still loads before the workspace appears. When guardian dubbing consent
is enabled, the route transitions directly from loading to the project home,
whether zero or all lines are saved. There is no Start dubbing or Continue
dubbing interstitial.

When consent is disabled or revocation is in progress, the route continues to
show the existing child-readable locked message and no recording controls. A
load failure continues to show the bounded retry action. Removing the enabled
interstitial must not weaken the guardian boundary or trigger microphone access
until the learner explicitly presses Record.

## Project Home

The project home remains the full-rhyme workspace. Its desktop structure is:

1. one spanning title/progress bar;
2. one row whose left column contains the dominant 16:9 illustration and full
   playback action;
3. a right scene panel whose top edge aligns with the illustration and whose
   cards use the available width rather than tiny repeated previews.

Remove the separate Continue Scene action. Every scene card is already a direct
editing choice, and the next incomplete scene can be identified by its status.

Scene cards display the generated illustration, scene title, scene number, and
recording status. Five Little Ducks uses its authored count titles; Old
MacDonald uses its animal titles. Status remains visible through text and an
icon, not color alone. Desktop uses a roomy two-column scene grid. Narrow
screens stack the project artwork and scene panel; short landscape may use a
compact grid as long as all targets stay at least 48 px and remain distinct.

The full-playback button remains a shared `ActionButton` with clear Play/Stop
states and existing focus recovery. Playback advances the displayed artwork by
the current line's scene while scheduling saved clips and guide fallbacks on
the existing authored timeline.

## Scene Editor

Remove the local **Back to full video** text control from the content area. In
scene view, the shared route header renders a `HeaderButton` named **Back to
full video**. It performs the existing in-memory return to the project without
changing the route or losing loaded status. Project and locked views render the
normal `HeaderLink` named **Back to home**.

Desktop places the 16:9 scene illustration and the control panel in one aligned
row. The lyric remains directly associated with the artwork. The panel keeps:

- `Line n of m`;
- **Hear line** for the ElevenLabs guide;
- **Record** / **Stop** / **Record again**;
- waveform and save feedback;
- saved-take playback;
- one bottom navigation row with **Previous** and **Next**.

Previous is disabled on the first line of a scene. Next moves to the next line;
on the final line it returns to the project home as it does today. Both actions
are unavailable during microphone opening, recording, saving, or recoverable
unsaved-take states. Labels remain visible and targets remain at least 48 px.

If the active line is already present in the loaded saved-line map, the panel
shows **Play my recording** and labels the recording action **Record again**,
even when there is no new in-memory Blob. A newly recorded pending preview takes
precedence. Otherwise Play my recording reads only the authenticated private
audio endpoint for that exact rhyme and line; it must not silently play the
guide and call it the learner's recording. The same control becomes **Stop my
recording** during playback.

If private playback returns the existing consent-loss response, the route
returns to the locked state. Other fetch or playback failures keep the editor
open, mark the line as needing a retake for this session, announce a friendly
error, and leave Record again available.

## Component and Data Boundaries

- `HomeMenu` owns only the four top-level activities.
- A focused `NurseryRhymeList` owns the two rhyme choices and shared artwork
  card presentation.
- Rhyme definitions own immutable scene artwork alongside scene titles and
  authored lines.
- `DuckScene` and `FarmScene` become thin illustrated-scene renderers. They map
  the active line to its scene artwork and preserve the existing figure,
  caption, compact, thumbnail, and playing contracts without DOM-drawn actors.
- `DubProjectHome` owns the aligned player and scene panel and no longer owns a
  redundant Continue action.
- `DubSceneEditor` remains presentation-only and receives whether the selected
  line has a saved take plus previous/next callbacks.
- `DubStudio` owns contextual header behavior, media cancellation, private-take
  playback, focus recovery, and state transitions.

Use Tailwind 4 utilities directly in these React components, shared controls
from `src/shared/ui.tsx`, and shared headers from `src/app/AppHeader.tsx`. Do
not add page-specific CSS or duplicate global button/header styles.

## Accessibility and Responsive Requirements

- The homepage has exactly four links inside **Learning activities** and the
  desktop links share one row and equal visual weight.
- The Nursery Rhymes page is a named main section with two independently named
  links and decorative images that do not duplicate spoken labels.
- Generated scene images have stable descriptive alternative text. Scene
  controls include scene number, title, and state in their accessible names.
- Header back controls retain a consistent accessible name as their behavior
  changes by view.
- Previous, Next, guide, recording, saved-take, full-playback, and scene controls
  remain keyboard reachable with visible focus and at least 48 px targets.
- The player and scene panel top edges align within two pixels on desktop.
- At 280–390 px phone widths, 640×360 short landscape, and 1280×900 desktop,
  no content overlaps either shared header, escapes the viewport horizontally,
  or hides the active recording action.
- Hover and focus feedback comes from shared interactive-card, header, and
  action-button primitives rather than bespoke unstyled text controls.

## Testing and Verification

Implementation proceeds test-first. Unit/component tests cover:

- the `/dubs` helper, declared route, safe return target, and two-rhyme picker;
- exactly four homepage activities and the Nursery Rhymes destination;
- immutable, unique, complete scene-artwork metadata for both definitions;
- direct enabled status transition to project and retained locked/error states;
- removal of Start/Continue entry actions and project Continue action;
- contextual header behavior and the absence of a content-level full-video
  back button;
- Previous behavior at first, middle, and final scene lines;
- saved-take control labels, private endpoint playback, cancellation, consent
  loss, error recovery, and Record again state;
- generated scene image selection and accessible captions.

Playwright covers:

- one desktop row of four large homepage cards plus two-column phone fallback;
- image loading, readable labels, card sizing, containment, and no overflow at
  the required responsive viewports;
- navigation from homepage to Nursery Rhymes and into both rhyme routes;
- direct arrival on the full-video project without an enabled interstitial;
- visibly distinct scene artwork URLs, larger scene cards, and project-panel
  alignment;
- editor back twice to `/`, Previous/Next line navigation, and replay of a
  recording loaded before the editor opened;
- shared hover/focus behavior through rendered interactions rather than class
  assertions.

Final verification runs:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

It also verifies all twelve published WebPs by remote headers, dimensions,
non-empty bodies, and decode before the pull request is merged.
