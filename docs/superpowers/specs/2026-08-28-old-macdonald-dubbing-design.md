# Old MacDonald Dubbing Design

## Goal

Add **Old MacDonald Had a Farm** as a second learner-facing nursery-rhyme
dubbing project while preserving the existing Five Little Ducks project,
recording behavior, guardian consent boundary, and saved audio privacy model.

The authored lyrics use the traditional five-verse version documented by the
[Scottish Book Trust](https://www.scottishbooktrust.com/songs-and-rhymes/old-macdonald):
cows, ducks, pigs, dog, and sheep. The song is modeled as five scenes with
seven authored lines per scene, including the opening and closing refrain.

## Scope and non-goals

In scope:

- A new route at `/dubs/old-macdonald`.
- A second home-menu entry for the new rhyme.
- Shared, definition-driven dubbing state, playback, scene editor, and project
  home behavior.
- A new farm visual scene with the same accessible scene and playback contract
  as `DuckScene`.
- ElevenLabs narrator guide assets for every unique Old MacDonald lyric.
- Rhyme-specific API validation and private R2 namespaces.
- Shared guardian voice consent and account-deletion cleanup across both
  supported rhymes.
- Regression tests for catalog definitions, routing, API requests, storage,
  state transitions, UI rendering, audio metadata, and browser behavior.

Out of scope:

- A user-authored rhyme builder or arbitrary lyric import.
- A new rhyme picker screen.
- Changing the existing Five Little Ducks lyric, timing, visual behavior, or
  saved-data compatibility.
- A new database table or a separate consent grant for each rhyme.
- Reusing or cloning a protected character voice; guide audio is narrator
  audio generated with the project's configured ElevenLabs narrator voice.

## Content model

Create a rhyme catalog with one immutable definition per supported rhyme. Each
definition owns the values currently spread across `dub-script.ts`, UI copy,
route matching, API validation, storage naming, and scene rendering:

- stable `id` and learner-facing `route`;
- title and scene titles;
- ordered lines with stable line IDs, cue times, and scene membership;
- per-rhyme lines-per-scene and recording duration;
- guide audio lookup prefix;
- a scene renderer or scene-kind identifier;
- visual beat data needed by that renderer.

Keep compatibility exports for Five Little Ducks while migrating shared code to
resolve the active definition explicitly. Existing Five Little Ducks IDs,
line IDs, route, 24-line timing, and API payload shape remain unchanged.

Old MacDonald uses five scenes and seven lines per scene. Its lines are the
traditional cow, duck, pig, dog, and sheep verses. Repeated refrain text is
represented once in guide-audio metadata and referenced by exact text, while
each authored line still has its own stable line ID for recording progress.

## Application flow

`HomeMenu` links directly to the new route. The route renders the shared dubbing
controller with the Old MacDonald definition and farm scene renderer. The
controller loads status using the definition's ID, enters the existing intro /
project / scene flow, and uses the definition for all progress, scene, line,
recording, guide playback, take preview, and full/scene playback calculations.

The project home displays the Old MacDonald title and a `recorded / 35`
progress value. Scene cards display `recorded / 7`, and the line HUD uses the
definition's scene line count rather than the current hard-coded value of four.
The existing Five Little Ducks UI remains visually and behaviorally stable.

The farm renderer is intentionally local and small: a responsive farm
background, farmer, and the currently introduced animals with deterministic
visual beats. It exposes the same compact, thumbnail, and playing states as
the duck renderer, so the shared project home and scene editor do not need
rhyme-specific layout branches.

## API, storage, and consent

The browser API accepts an explicit supported rhyme definition for status,
line upload, audio, consent, and delete requests. Route parsing validates both
the rhyme ID and that a line belongs to that rhyme. Unknown rhyme IDs and
cross-rhyme line IDs return the existing child-safe 404 response.

Worker handlers resolve the definition before reading or writing data. Private
R2 keys remain separated by rhyme ID, for example:

`.../learner-dubs/five-little-ducks-v2/...`

and

`.../learner-dubs/old-macdonald-v1/...`

The existing guardian voice consent record remains the single consent boundary
for all rhyme recordings. Granting consent enables both projects. Revocation
and account deletion enumerate every supported rhyme namespace and retire all
associated markers and line objects, including legacy Five Little Ducks data.
No user recording is copied between rhymes.

## Audio generation

Add exact-text narrator metadata for each unique Old MacDonald line and
generate the corresponding saved MP3s with the existing ElevenLabs generator,
using the configured narrator voice, `eleven_v3`, and the existing warm,
rhythmic nursery-rhyme delivery style. The generator and static-audio tests
must verify every metadata entry resolves to a non-empty file below
`public/assets/audio`.

## Error handling and accessibility

Reuse existing friendly errors for load, save, playback, consent loss, and
reset-in-progress states. A missing or failed guide line follows the existing
per-line playback fallback behavior and does not expose implementation details.

The new route keeps the existing keyboard and screen-reader contracts:

- scene and line controls have stable accessible names and `aria-current`;
- progress exposes the correct maximum and value text;
- playback and recording states are announced through existing live regions;
- focus recovery returns to the same semantic controls after navigation,
  recording, save, and playback completion;
- narrow, short-landscape, and desktop layouts keep controls contained.

## Testing strategy

Add tests before production changes for the new behavior:

- catalog shape, exact Old MacDonald line count, scene grouping, and immutable
  IDs;
- route and API resolution for both rhymes, including cross-rhyme rejection;
- state calculations using definition-specific scene sizes;
- storage namespace isolation and deletion coverage;
- guide metadata and non-empty ElevenLabs audio assets;
- shared project-home and scene-editor rendering for the new title, counts,
  lines, and farm scene;
- browser route reachability and responsive containment for the new rhyme;
- existing Five Little Ducks tests and full build remain green.

Verification commands:

```bash
npm test
npm run build
npm run test:browser
```

