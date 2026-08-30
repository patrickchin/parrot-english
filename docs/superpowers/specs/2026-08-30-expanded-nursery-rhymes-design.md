# Expanded Nursery Rhymes and Storytime Artwork

## Status

Approved in advance by the user's explicit autonomous instruction on
2026-08-30. The user asked for more famous nursery rhymes, for every rhyme's
artwork to match the Storytime illustration style, and for the implementation,
pull request, and merge to continue without later approval.

## Problem

The nursery-rhyme shelf has only Five Little Ducks and Old MacDonald. Its art
is painterly and comparatively realistic, while the Storytime shelf uses
simple, rounded, warm watercolor-cartoon illustrations with large friendly
expressions and clear silhouettes. The mismatch makes the two product areas
feel assembled from different visual systems.

The shared dubbing player can already host multiple definition-owned songs,
but the app shell, shelf, saved guide-audio catalog, and score validation still
encode assumptions about the two existing rhymes. The music scheduler also
assumes that every scene repeats the same phrase sequence, which is not true of
short through-composed rhymes such as Twinkle Twinkle Little Star.

## Content Scope

Keep the existing two rhymes and add four widely recognized, public-domain
rhymes:

1. Twinkle Twinkle Little Star — the familiar six-line first verse.
2. Row Row Row Your Boat — the familiar four-line verse.
3. Mary Had a Little Lamb — the familiar first two four-line verses.
4. Humpty Dumpty — the familiar four-line modern version.

This creates a balanced six-card shelf without turning the change into a
content-management system. Lyrics and melodies use traditional/public-domain
sources. We encode pitches, durations, lyrics, and phrase boundaries; no third-
party performance is shipped.

Reference sources:

- Twinkle lyrics: <https://en.wikisource.org/wiki/A_Book_of_Nursery_Songs_and_Rhymes/Twinkle,_Twinkle>
- Twinkle notation: <https://en.wikipedia.org/wiki/Twinkle,_Twinkle,_Little_Star>
- Row lyrics: <https://en.wikisource.org/wiki/Row,_Row,_Row_Your_Boat>
- Row notation: <https://en.wikipedia.org/wiki/Row,_Row,_Row_Your_Boat>
- Mary notation and historical text: <https://en.wikipedia.org/wiki/Mary_Had_a_Little_Lamb>
- Humpty notation and historical text: <https://en.wikipedia.org/wiki/Humpty_Dumpty>

## Goals

- Present six nursery rhymes in one responsive, data-driven shelf.
- Give every new rhyme a complete recording, guide playback, selected-scene,
  and full-playback flow using the existing consent and private-storage model.
- Play each rhyme's distinctive traditional melody, with each spoken guide or
  learner take starting on its matching musical phrase.
- Replace the cover and all 20 scene images with generated Storytime-style
  illustrations.
- Keep one internally consistent cast and setting across each rhyme's scenes.
- Use checked-in ElevenLabs English guide audio for every distinct new line.
- Publish artwork under immutable, versioned media keys and verify its format,
  dimensions, cache policy, and public decode.
- Preserve responsive and accessible dubbing behavior.

## Non-goals

- AI-singing, pitch correction, or time-stretching learner recordings.
- Uploading private recordings to any third party.
- New tempo, instrument, key, or mix controls.
- Downloadable mixed audio or video exports.
- A general nursery-rhyme CMS, media pipeline rewrite, or new dependency.
- More homepage sections or a change to the previously approved homepage grid.

## Catalog and Route Design

`DUB_DEFINITIONS` remains the source of truth. Each new definition has a stable
ID, route, title, lines, equal-sized visual scenes, scene titles, immutable
artwork, saved-guide prefix, and score. The shelf renders this catalog directly.
The app shell registers catalog routes using one generic illustrated scene
adapter; the existing Five Little Ducks compatibility component remains for
legacy imports.

New routes and IDs:

| Rhyme | ID | Route | Scenes × lines |
| --- | --- | --- | --- |
| Twinkle Twinkle Little Star | `twinkle-twinkle-v1` | `/dubs/twinkle-twinkle` | 3 × 2 |
| Row Row Row Your Boat | `row-row-row-your-boat-v1` | `/dubs/row-row-row-your-boat` | 2 × 2 |
| Mary Had a Little Lamb | `mary-had-a-little-lamb-v1` | `/dubs/mary-had-a-little-lamb` | 2 × 4 |
| Humpty Dumpty | `humpty-dumpty-v1` | `/dubs/humpty-dumpty` | 2 × 2 |

All authored names obey the repository name policy; Mary is both traditional
content and an allowed learner-content name.

## Music and Timing

The score contract continues to own count-in notes, line phrases, bass notes,
outro notes, and gain. Phrase lookup gains one backwards-compatible rule:

- a score with `linePhrases.length === linesPerScene` repeats its verse score
  for every scene, preserving Five Little Ducks, Old MacDonald, and Mary;
- a score with `linePhrases.length === lines.length` advances through the whole
  song, supporting Twinkle, Row, and Humpty while keeping multiple visual scenes.

No other score shape is valid. A pure phrase-selection helper is used by both
the main scheduler and final-phrase timing so selected-scene and full playback
cannot diverge.

Timelines retain the existing 800 ms full-playback pre-roll:

- Twinkle: six 4-second phrases, 26-second full clock.
- Row: four child-friendly 4-second 6/8 phrases, 18-second full clock.
- Mary: eight 4-second phrases, 34-second full clock; the four-phrase tune
  repeats for verse two.
- Humpty: four child-friendly 4-second 6/8 phrases, 18-second full clock.

Every voice source and the first note of its phrase share an exact Web Audio
timestamp. Existing recordings remain untouched and private.

## Guide Audio

`lib/static-audio.js` derives distinct nursery-rhyme guide entries from the
catalog instead of adding another rhyme-specific map. Repeated lyrics within a
rhyme reuse the first stable guide ID, just as Old MacDonald does today. New
MP3s are generated with the repository's ElevenLabs workflow and checked into
`public/assets/audio`; no local or operating-system TTS is accepted. Waveform
peaks are derived from the generated files for a complete scene-editor display.

## Artwork Direction and Assets

Use the existing Storytime covers for Hello Cat, The Red Ball, and The Noisy
Little Band as style references. They establish the target: hand-painted
children's picture-book watercolor, rounded simplified characters, large kind
eyes, soft pastel color washes, subtle paper texture, uncluttered backgrounds,
clear foreground action, and a warm, safe mood. Avoid photorealism, glossy 3D,
vector-flat shapes, collage, text, logos, and watermarks.

Generate 21 landscape images:

- one Nursery Rhymes cover;
- six Five Little Ducks scenes;
- five Old MacDonald scenes;
- three Twinkle scenes;
- two Row scenes;
- two Mary scenes;
- two Humpty scenes.

Within each rhyme, later scenes use the accepted first scene as an additional
character reference. Normalize every selected image to 1536×864 WebP, publish
under `assets/v6/dubbing/...`, and never overwrite existing v5 objects. The
cover combines recognizable motifs from the six-rhyme collection without text.

## Shelf Presentation

The nursery shelf adopts the Storytime card rhythm: one column on the smallest
screens, two from 520 px, and three on desktop. Six cards therefore make two
balanced desktop rows. Cards use a large 3:2 crop of the scene artwork, a clear
title, and a full-width pink “Sing & record” action. Accessible link names stay
specific to the rhyme. This keeps the familiar dubbing visual language while
matching the hierarchy and tap-target scale of Storytime.

## Testing and Verification

- Catalog tests pin the six definitions, exact traditional lyrics, routes,
  scene shapes, timing, score shape, and deeply frozen artwork.
- Playback tests pin source-score pitches and verify whole-song phrase lookup
  across scene boundaries.
- Static-audio tests require every distinct authored line to have a checked-in,
  decodable ElevenLabs MP3 and waveform data.
- Route and shell tests require every catalog route to be declared.
- Playwright tests verify all six cards, responsive 1/2/3-column containment,
  navigation into each workspace, scene distinction, and accessible controls.
- Image verification checks all 21 public URLs for status, MIME type,
  immutable cache policy, 1536×864 dimensions, and successful decode.
- Final gates are `npm test`, `npm run lint`, `npm run build`, and
  `npm run test:browser`, followed by a real-browser smoke test and CI.
