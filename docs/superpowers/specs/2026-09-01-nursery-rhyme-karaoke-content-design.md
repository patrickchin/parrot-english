# Nursery-Rhyme Karaoke Guidance and Content Packages

## Status

Approved progressively in conversation through 2026-09-01. The user asked
the agent to continue autonomously after approving the product behavior,
content-package direction, standards choice, and decision to defer
score-aligned narrator audio.

This design extends the existing six-rhyme dubbing experience. It preserves
the current consent, storage, deletion, route, guide-audio, and saved-take
contracts while replacing scattered authored TypeScript data with validated
per-rhyme packages.

## Problem

The nursery-rhyme editor already plays an authored melody and limits each
recording to the melody phrase's duration. A learner still has two practical
problems:

1. pressing Record starts the performance without enough warning to find the
   first beat; and
2. the page shows a lyric and waveform, but not when each word or melody note
   should be sung.

The content model also makes these improvements unnecessarily difficult.
Rhyme identity, lyrics, scene grouping, artwork, note timing, guide-audio
metadata, and waveform data are spread across several TypeScript modules and
asset directories. Adding a rhyme requires editing application code and
literal tests even though the shelf, routes, Worker, private storage, and
deletion logic are already catalog-driven.

The result should give a learner karaoke-like guidance and let an author add a
rhyme by adding one validated content directory, without adding route or
application code.

## Goals

- Give recording a two-beat audible and visual count-in.
- Open the microphone before the count-in, but start `MediaRecorder` only on
  the melody downbeat so the saved take excludes the count-in.
- Highlight the word that should currently be sung.
- Show the melody as a compact pitch-and-time lane rather than staff notation.
- Keep the lyric, note lane, waveform cursor, melody, and recording duration
  on one score-derived clock.
- Use the guidance while recording, hearing an example, playing a learner
  take, and playing a full rhyme. Preserve score-relative positions for the
  engine's existing scene-range API without reintroducing a separate **Play
  scene** control that the current UI deliberately omits.
- Use a standard score format instead of inventing note and lyric timing
  fields.
- Make one self-contained directory the authored source for each rhyme's
  metadata, score, and guide audio.
- Validate packages before bundling and generate one static catalog that both
  the React application and Cloudflare Worker can import.
- Preserve all deployed rhyme IDs and line IDs because they are private R2
  storage identifiers.
- Keep microphone noise suppression disabled and echo cancellation enabled.

## Non-goals

- Making the existing narrator guide MP3s sing or align word-for-word with the
  score. They remain pronunciation and delivery examples.
- Generating guide vocals, backing-track MP3s, artwork, or MusicXML through a
  hosted service.
- Pitch detection, pitch scoring, pitch correction, grading, or comparison of
  the learner's voice with the melody.
- Time-stretching, trimming, denoising, or mixing the learner's saved audio.
- Baking the melody or count-in into a saved take.
- Displaying staff notation, note names, a piano keyboard, or music-theory
  controls.
- Learner controls for key, tempo, instrument, volume, or count-in length.
- Runtime uploads of new rhyme definitions or an authoring CMS.
- WebVTT, LRC, MIDI/KAR, or subtitle export in this cycle.
- Supporting every legal MusicXML construct. The compiler accepts a small,
  documented, interoperable subset suitable for these monophonic nursery
  melodies and simple accompaniment.

## Standards Decision

WebVTT supports timestamps inside cue text and is suitable for karaoke-style
progressive captions. Standard MIDI Files can store note and lyric events.
Using separate WebVTT and MIDI files here would create two authored timelines
that must be kept synchronized.

MusicXML 4.0 is the canonical score format for this feature. It represents
pitch, rhythm, tempo, lyric syllables attached to notes, held syllables, and
karaoke-oriented lyric line endings in one document. A build compiler derives
both the runtime note schedule and word intervals from that score. WebVTT can
be generated later if another product needs subtitle interchange; it is not a
second authored source.

Use uncompressed UTF-8 `score.musicxml` files rather than compressed `.mxl` so
Git diffs remain inspectable. The relevant specifications are:

- <https://www.w3.org/2021/06/musicxml40/>
- <https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/>
- <https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/end-line/>
- <https://www.w3.org/TR/webvtt1/>

## Authored Content Package

Each rhyme lives in one public static-content directory:

```text
public/assets/nursery-rhymes/twinkle-twinkle/
├── rhyme.json
├── score.musicxml
└── guides/
    ├── twinkle-twinkle-v1-guide-line-1.mp3
    ├── twinkle-twinkle-v1-guide-line-2.mp3
    ├── twinkle-twinkle-v1-guide-line-3.mp3
    └── twinkle-twinkle-v1-guide-line-4.mp3
```

The directory is under the existing `public/assets` static namespace
deliberately. Vite already copies that tree to the deployed static asset
output, and the Worker already treats `/assets/` as static, so guide assets
require no bundler plugin, copy step, runtime import trick, or new SPA-fallback
exception. Publishing the metadata and score is safe; they contain authored
public content, not learner data or credentials.

Artwork remains on immutable, versioned `media.parrotbook.com` URLs and is
referenced by descriptor from `rhyme.json`. Guide MP3 paths are relative to the
package and may be reused by repeated lyric lines. The package contains the
files the application must serve; it does not contain learner recordings.

### `rhyme.json`

The manifest owns application metadata, scene structure, visible text, stable
storage IDs, artwork descriptors, and asset references. It does not own note
or word timing.

```json
{
  "schemaVersion": 1,
  "order": 30,
  "id": "twinkle-twinkle-v1",
  "slug": "twinkle-twinkle",
  "title": "Twinkle Twinkle Little Star",
  "countInBeats": 2,
  "countInMidi": 72,
  "score": {
    "src": "score.musicxml",
    "melodyPart": "P1",
    "playbackParts": ["P1", "P2"],
    "volume": 0.12
  },
  "scenes": [
    {
      "id": "scene-1",
      "title": "A little star",
      "artwork": {
        "src": "https://media.parrotbook.com/assets/v8/dubbing/twinkle-twinkle/scene-1.webp",
        "alt": "A little star shines in the evening sky.",
        "width": 1536,
        "height": 864
      },
      "lines": [
        {
          "id": "twinkle-twinkle-v1-line-1",
          "text": "Twinkle, twinkle, little star,",
          "guide": "guides/twinkle-twinkle-v1-guide-line-1.mp3"
        },
        {
          "id": "twinkle-twinkle-v1-line-2",
          "text": "How I wonder what you are!",
          "guide": "guides/twinkle-twinkle-v1-guide-line-2.mp3"
        }
      ]
    }
  ]
}
```

The route is derived as `/dubs/<slug>`. Scene titles, scene artwork, optional
line artwork, and line order come from the nested scene structure. Runtime
`linesPerScene` is derived; schema version 1 requires every scene in a rhyme to
have the same non-zero line count because the current project and storage UI
assume that invariant.

`countInBeats` is required and must currently equal `2`. `countInMidi` is the
audible click pitch from 0 through 127; it preserves the current per-rhyme
count sound without pretending that a metronome click is a melody lyric note.
Keeping both in the manifest records the content/playback contract without
adding a learner setting. A later schema version may permit another beat count
if a real rhyme needs one.

### `score.musicxml`

The score owns:

- the tempo and metronome beat unit;
- melody pitch and rhythm;
- rests and total score duration;
- optional accompaniment parts;
- lyric syllables and melismas; and
- the beginning and end of every application line.

The part named by `melodyPart` is the only part used for the learner-facing
note lane and lyric timing. `playbackParts` selects the parts synthesized by
the existing Web Audio player. This allows a simple bass or outro part without
showing accompaniment as the melody the learner should follow.

Each line begins with a standard MusicXML `<bookmark>` whose `id` is exactly
the corresponding stable line ID from `rhyme.json`. Normally the final lyric
syllable in the line contains `<end-line/>`, and the end of that note's complete
tied chain bounds the recording phrase. A line with an intentional silent tail
may instead put a marker-only `<lyric><end-line/></lyric>` on its terminal rest;
that lyric must contain no text, `syllabic`, or `extend`, is invalid on a pitched
note, and extends the line without adding a melody or word event. The next
bookmark independently determines the next full-playback cue, and the score
may contain a later unmarked rest or outro after the final recording phrase.
An unmarked rest or outro must never lengthen the final recording.

Lyrics use MusicXML's `single`, `begin`, `middle`, and `end` `syllabic` values.
An `<extend>` continues a syllable over later notes. The compiler groups these
syllables into the visible words from `rhyme.json` and rejects any normalized
text mismatch. Punctuation and display capitalization remain owned by the
manifest; the score owns when each normalized word is sung.

Some current spoken lines contain more words than melody attacks. Authors may
split one unchanged pitch/duration into tied same-pitch note fragments and put
successive lyric words on those fragments. The compiler preserves the fragment
boundaries for word timing but coalesces the complete tie chain back into one
audible/note-lane interval. This supplies distinct non-overlapping word cues
without changing the established melody. An `<extend>` still represents one
word held across later notes; it is not used for successive words.

The accepted MusicXML subset is intentionally small:

- `score-partwise` MusicXML 4.0;
- one score-wide metronome tempo and beat unit;
- ordinary pitched notes, rests, ties, accompaniment chords, and measure
  boundaries;
- one sequential voice per part, with a strictly monophonic `melodyPart`;
- lyric, syllabic, extend, end-line, bookmark, divisions, time, and sound or
  metronome tempo data; and
- no repeats, alternate endings, D.C./D.S. jumps, transposition, tuplets, grace
  notes, multiple lyric verses, or mid-score tempo changes.

Authors must expand repeated sections explicitly. Rejecting unsupported score
features is safer and smaller than silently interpreting them incorrectly.
The compiler coalesces a tied chain into one playback/note-lane interval.

## Build-Time Compiler and Static Registry

Add one Node command, `npm run generate:rhyme-catalog`, that scans
`public/assets/nursery-rhymes/*/rhyme.json` in deterministic slug order. It:

1. strictly validates every manifest;
2. resolves only package-relative score and guide paths;
3. parses and validates the supported MusicXML subset;
4. keeps score positions as rational beat boundaries, converts absolute
   boundaries to milliseconds, and rounds each boundary once;
5. derives absolute line cues, line-relative notes, word intervals, line
   durations, and total duration;
6. verifies guide MP3 existence and decodability using the existing
   FFmpeg/FFprobe toolchain, and derives full guide duration from decoded audio
   frame sample totals rather than container duration metadata;
7. derives the 32 guide-waveform bars now stored by hand using FFmpeg's
   fixed-point MP3 decoder and an explicit integer mono 16 kHz signed 16-bit
   resampler, limited to each line's score duration, padding a short guide with
   silence and ignoring an overlong tail;
8. validates global uniqueness and storage compatibility; and
9. writes a deterministic static TypeScript module under `src/dubbing`.

Use the already-installed Zod package for the strict manifest schema and the
already-installed Happy DOM XML parser in the build command. Do not add a
runtime parser or send MusicXML to the browser. Preflight declarations,
strip only the recognized canonical MusicXML `DOCTYPE` without resolving it,
and walk only the supported elements listed above.

The generated module is checked into Git. The explicit generator command is
the only command that writes it. Vite build, browser tests, the ordinary test
suite, local development, Worker deployment, and static-audio generation run
`generate:rhyme-catalog --check` and fail if the checked-in module is stale.
CI checks before any writer runs. Direct `node --test` remains useful because
the generated module is present in the checkout. The deployment workflow must
install FFmpeg, as the PR verification workflow already does, before running
the check.

A raw `import.meta.glob` is not used. The rhyme catalog is imported by both
Vite and the separately bundled Cloudflare Worker, and an ordinary static
module is the smallest shared boundary that both understand.

The handwritten `rhyme-catalog.ts` becomes a small domain layer over the
generated data. It owns runtime types, normalization/freezing, lookup helpers,
line-to-phrase lookup, and compatibility exports. React components, API
validation, Worker route parsing, R2 reset, account deletion, and learner
deletion continue to consume `DUB_DEFINITIONS` and do not scan files at
runtime.

An append-only, non-derived deployment ledger contains deployed rhyme IDs and
their ordered line IDs. Validation requires every ledger entry to remain
present. Write-mode generation may append genuinely new IDs, but it never
rewrites or removes existing entries; a rename therefore leaves the old ID
unresolved and fails. This creates a durable storage authority while preserving
the promise that a new rhyme needs no handwritten registration. Changing or
removing a ledger entry requires an explicit storage migration.

### Generated runtime shape

The generated data retains the current shape where practical and adds only
the guidance data needed by consumers:

```ts
type DubWordCue = Readonly<{
  startOffset: number;
  endOffset: number;
  atMs: number;
  durationMs: number;
}>;

type DubMelodyNote = Readonly<{
  midi: number;
  atMs: number;
  durationMs: number;
}>;

type DubLine = Readonly<{
  id: string;
  text: string;
  cueMs: number;
  durationMs: number;
  guideAudioId: string;
  guideAudioSrc: string;
  guidePeakBars: readonly number[];
  words: readonly DubWordCue[];
}>;

type DubGuide = Readonly<{
  id: string;
  src: string;
  text: string;
  durationMs: number;
}>;
```

Each definition owns a deduplicated `guides: readonly DubGuide[]` list for
static-audio publishing. Waveform bars remain line-owned because the same
guide clip can be shown against two different score durations; a unique guide
record therefore does not carry ambiguous `peakBars`.

The compiled music score supplies the selected melody notes plus any playback
notes for each line. Existing UI/state code receives flattened lines, scene
titles, scene/line artwork, and `linesPerScene`; it does not need to understand
MusicXML or package paths.

The score compiler also emits `music.countInBeatMs` and
`music.countInDurationMs` from rounded absolute metronome boundaries plus the
manifest's `countInMidi`. Keeping the final duration boundary avoids cumulative
333/334ms rounding drift.

Word cues contain UTF-16 character offsets into the exact manifest `text`.
React slices and interleaves that original string; it never rebuilds a lyric
from score syllables. This preserves whitespace, punctuation, curly quotes,
contractions, and compounds such as `E-I-E-I-O` in visible and accessible
text.

For comparison only, both manifest words and completed MusicXML lyric tokens
are normalized to NFC, lowercased, and given canonical ASCII apostrophes and
hyphens (`‘`, `’`, and `ʼ` become `'`; `‐` and `‑` become `-`). The manifest
is tokenized with
`/[\p{L}\p{N}]+(?:[’‘ʼ'‐‑-][\p{L}\p{N}]+)*/gu`; a MusicXML `single` lyric or
completed `begin`/`middle`/`end` chain must normalize to exactly one such
token. Outer punctuation is ignored, internal apostrophes/hyphens are kept,
and any mismatch is rejected. Match against the original source first, then
normalize only the matched slice, so these comparison keys never replace the
source text or alter its UTF-16 offsets.

## Playback and Recording Clock

`AudioContext.currentTime` remains the authoritative presentation and playback
clock. Melody notes, decoded guide/take audio, elapsed callbacks, word state,
the note cursor, and the target recording stop boundary derive from the same
scheduled `startAt`.

`MediaRecorder` has no scheduled `startAt` API and cannot be sample-locked to
an AudioContext. The coordinator therefore computes one `downbeatAt`, schedules
the melody at that AudioContext time, and invokes `MediaRecorder.start()` at
the boundary on the main thread. This is best-effort browser synchronization,
tested within a small tolerance rather than represented as sample-exact. A
sample-accurate custom capture pipeline would be a separate feature.

For line playback, elapsed time is line-relative. For the playback engine's
scene range and for full playback, the player derives the active line from the
score's absolute cue and passes `elapsedMs - line.cueMs` to consumers. The
current rendered UI exposes full playback, not a separate scene-play button.
Do not add an independent React interval or wall-clock timer.

Replace the recording-only elapsed state with one presentation state that can
represent the selected performance across Record, Hear line, Play my
recording, and full playback. Reset it on cancellation, line change, operation
completion, and the existing consent-loss path.

### Two-beat recording count-in

Recording follows this order:

1. The learner presses Record.
2. The application obtains the microphone stream and prepares the AudioContext.
3. The state enters `counting-in`; the page shows and sounds counts `2`, then
   `1`, at the score's metronome beat duration.
4. Schedule the first melody note for the shared `downbeatAt`; at that boundary
   start `MediaRecorder`, set performance elapsed time to zero, and enter
   `recording`.
5. Stop the recorder and melody at the compiled line duration, then preserve
   the existing preview/upload flow.

Every audible count click uses the shared engine constant
`DUB_COUNT_CLICK_DURATION_MS = 200`, preserving the current click length while
pitch and spacing remain content-derived. Full playback and prepared recording
both use this constant; it is not another manifest setting.

The microphone stream may be open during the count-in so permission and device
startup complete before the downbeat. `MediaRecorder` is not intentionally
started before the downbeat, so the two-beat count-in is not saved. Browser
scheduling can introduce a few milliseconds of start/stop skew; it cannot add
the authored count-in interval to the take. The melody is connected only to
the device output; it is never connected to the recorder's microphone stream.

Stopping, navigating, unmounting, or encountering an audio failure during
count-in cancels scheduled clicks, closes the AudioContext, stops microphone
tracks, produces no blob, and performs no upload. If the application's
existing consent-loss handler is invoked while a count-in is active, it uses
the same cleanup path; this feature does not add revocation polling or a new
consent signal. Cleanup remains idempotent.

During `counting-in`, the Record control becomes an enabled **Cancel** action.
Other media and navigation controls remain locked. Cancelling returns focus to
Record and leaves the previous saved or pending take unchanged.

The shared recorder constraints remain:

```ts
{
  echoCancellation: true,
  noiseSuppression: false
}
```

## Karaoke Presentation

### Timed lyric

Render the visible lyric as word spans whose state is `future`, `active`, or
`past` according to the line-relative score clock. The active word uses a
background/shape or underline plus weight, not color alone. Completed and
future words remain readable.

The scene editor keeps the lyric as its single `h1`. Word spans must preserve
the heading's exact accessible text. Full-project and listen-only playback
already use the rhyme title as their `h1`; there the active lyric is ordinary
caption text over or immediately below the illustrated stage.

Do not put word changes in an ARIA live region and do not announce every
syllable. The existing polite status continues to announce operation and line
changes only.

### Melody lane and shared cursor

Render the melody as a small noninteractive SVG:

- horizontal position and width represent note start and duration;
- vertical position represents relative MIDI pitch within the current line;
- a vertical playhead crosses the timeline; and
- the active note receives a non-color emphasis.

This is intentionally a contour guide, not notation. Hide it from the
accessibility tree because the audible melody, complete lyric, timer, and
progress already provide its information in usable forms. Center a phrase
whose notes all have one pitch instead of dividing by a zero pitch range.

In the editor, the melody lane and playhead are part of the existing waveform
feedback block and share its time axis. Do not add another tall panel. This is
required for the 640x360 short-wide layout. During full and listen-only
playback, show a compact version with the active lyric beneath the stage.

With reduced motion, word states and the playhead update discretely without
animated transitions. The lane is never interactive and creates no new focus
targets.

### Surfaces

- **Count-in:** show `2`, then `1`; lyric and note lane remain at their initial
  state.
- **Recording:** play melody only, advance lyric/note/waveform guidance, and
  capture the microphone-only take.
- **Hear line:** start the existing narrator guide and score melody together;
  guidance follows the score. The narrator may finish early because aligned
  guide-vocal production is deferred.
- **Play my recording:** play the learner take with the score melody and the
  same guidance.
- **Full playback:** advance artwork, active lyric, word highlight, and melody
  lane from the full score clock. Saved takes remain preferred, with the
  existing public-guide fallback. The engine's scene-range path reports the
  same line-relative positions, but no new scene-play control is added.

## Validation and Error Reporting

The generator fails before bundling with the package file and precise field or
score location. It rejects:

- unknown schema versions, missing keys, or extra manifest keys;
- duplicate or unsafe rhyme IDs, slugs, routes, orders, scene IDs, or line IDs;
- changes to the protected deployed rhyme/line ID inventory without an
  explicit migration update;
- empty scenes or unequal line counts within one schema-v1 rhyme;
- unsafe `..`, absolute, or cross-package asset paths;
- missing, empty, or undecodable guide MP3s;
- non-allowlisted artwork origins, mutable artwork paths, missing alt text, or
  invalid dimensions;
- internal XML subsets, entity declarations, or noncanonical `DOCTYPE` values;
- malformed MusicXML or unsupported score constructs;
- missing, extra, duplicated, or out-of-order line bookmarks;
- absent tempo, invalid divisions, nonpositive duration, chords/overlaps in the
  melody part, or MIDI pitches outside 0 through 127;
- score parts named in the manifest that do not exist;
- notes or word intervals outside their line window;
- missing lyric timing, invalid syllabic sequences, or normalized score words
  that do not exactly match the manifest line; and
- line durations greater than 8,000 milliseconds, the schema-v1 limit that
  keeps default MediaRecorder output within the Worker's fixed 512 KiB clip
  boundary; and
- output that is not deterministic or deeply immutable after normalization.

Permit reuse of one normalized guide path and derived guide ID only when every
reference has exactly the same manifest text. Emit one static-audio record for
that file. Reject reuse for different text and reject identical filename stems
from different paths.

Many score editors emit MusicXML's canonical external `score-partwise` 4.0
`DOCTYPE`. The compiler may recognize and strip that exact declaration without
resolving or fetching it. It rejects all other declarations, internal subsets,
and entities before XML parsing.

At runtime, generated content should already be valid. A defensive missing
word schedule displays the complete static lyric; missing melody-lane data
hides the lane. Neither presentation fallback may prevent guide playback or
recording. AudioContext, microphone, decoding, and upload failures keep the
existing child-readable alerts and focus recovery. A melody/count-in startup
failure must not start or upload a recording.

## Asset and Guide-Audio Semantics

Guide audio is explicit content, not inferred from narrator plus text. Each
line references a relative MP3 path, and repeated lines may share it. The
compiler derives a stable guide ID from the filename and generates static-audio
metadata and waveform bars.

The current narrator files were generated as warm, rhythmic speech. Starting
them at the same time as the score does not make them note- or word-aligned.
For example, existing Twinkle guide clips are shorter than their four-second
score phrases. The score is therefore the timing authority; guide audio is an
example. A later feature may add properly sung, score-aligned vocals without
changing private recording storage.

Some existing guide clips are also longer than their melody phrase. Byte-for-
byte migration therefore must not reject or clip them. In one-line Hear mode,
the melody and karaoke guidance stop at the phrase boundary, the final visual
state freezes, and the narrator may finish its decoded clip. Full playback
continues to advance by score cues even if an unaligned narrator tail overlaps
the next line.

No browser, local, or macOS system text-to-speech is introduced. Existing
checked-in guide files are migrated byte-for-byte into their packages.

## Compatibility and Migration

Convert all six existing rhymes in one migration before deleting the scattered
authored constants. Preserve:

- catalog order, rhyme titles, slugs/routes, stable definition IDs, and every
  stable line ID;
- scene grouping and titles from current `origin/main`;
- current scene and per-line artwork URLs, alt text, and dimensions;
- existing guide IDs, guide file bytes, and repeated-line sharing;
- melody pitches, phrase durations, line ordering, volume, bass/outro behavior,
  and total performance order; and
- Five Little Ducks compatibility exports and legacy namespace cleanup.

The new score-derived two-beat lead-in may shift the first full-playback cue to
match the actual musical beat. This is an intentional presentation change;
private object keys do not contain cue times. All other line durations and
relative cues should remain equivalent after integer-millisecond conversion.

`definition.id` is an R2 prefix and `line.id` is part of each object name.
Deployed IDs are immutable under ordinary content edits. Removing or renaming
one requires a separate storage/deletion migration and is not authorized by a
manifest edit.

The shelf, generic React route, response validation, Worker route validation,
R2 status/reset, account deletion, and learner deletion remain catalog-driven.
After migration, adding a normal rhyme requires:

1. adding its package directory;
2. supplying `rhyme.json`, `score.musicxml`, guide MP3s, and artwork URLs;
3. running the catalog generator; and
4. committing the package and generated registry.

No application, Worker, route, or storage source edit is required.

## Implementation Sequencing

Keep the work reviewable as two dependent milestones, each independently
green before continuing:

1. **Content foundation:** add the compiler and validation fixtures, migrate
   all six packages and guide files, generate the static registry, switch
   existing consumers to explicit guide metadata, and prove runtime behavior
   and storage IDs remain unchanged.
2. **Karaoke experience:** add score-derived word timing and playback elapsed
   state, the two-beat recording count-in, shared lyric/note/cursor
   presentation, and rendered responsive/accessibility coverage.

The milestones may be separate pull requests if branch sequencing is useful,
but the second must target a `main` that already contains the first. No direct
feature-branch merge is permitted.

## Testing

### Compiler and package tests

- Compile a minimal valid fixture and compare deterministic normalized output.
- Reject one focused fixture for every manifest, path, asset, MusicXML, lyric,
  timing, and global-uniqueness invariant.
- Verify a held word and a multi-syllable word derive the correct interval.
- Verify a one-pitch phrase and a phrase with accompaniment.
- Verify thirds and sixths are rounded from absolute rational boundaries with
  no cumulative gap or drift.
- Verify the canonical MusicXML `DOCTYPE` is accepted without a fetch while an
  entity/internal subset is rejected.
- Verify an added ID is appended by write mode, while rename/removal of a
  ledger ID fails and check mode never rewrites the registry or ledger.
- Reject a line longer than the schema-v1 eight-second recording limit.
- Verify all six migrated packages preserve protected IDs, routes, order,
  artwork, guide IDs, phrase durations, and expected runtime counts.
- Verify every guide decodes and produces 32 waveform bars; cover both shorter
  and longer guide clips without treating duration mismatch as alignment.
- Verify generated output is current, deterministic, and deeply frozen after
  runtime normalization.
- Use a temporary extra package fixture to prove discovery requires no code
  registration.
- Verify a missing `/assets/nursery-rhymes/...` file returns a static 404 rather
  than the SPA HTML shell.

### Playback and recording tests

- Extend the existing fake AudioContext harness rather than creating a second
  clock implementation.
- Assert exactly two score-tempo count-in events precede the melody downbeat.
- Assert `MediaRecorder.start()` targets the shared downbeat after count-in,
  occurs within the documented fake-clock tolerance, and never starts an
  authored count-in interval early.
- Assert recorded duration excludes count-in and remains within tolerance of
  the compiled line duration.
- Assert early Stop, abort, invocation of the existing consent-loss cleanup,
  setup failure, and unmount close each resource once and never upload a
  count-in-only take.
- Assert Hear line, take playback, the engine's scene-range path, and full
  playback report correct line-relative elapsed time.
- Assert an overlong guide may finish after frozen one-line score guidance and
  does not change the recording phrase duration.
- Assert a short guide may finish before music/guidance reaches the authored
  score boundary; neither clock is stretched to imitate the other.
- Preserve the test that saved audio contains only the microphone stream.
- Preserve `echoCancellation: true` and `noiseSuppression: false` coverage.

### Rendered UI and accessibility tests

- Assert active/past/future word changes at authored boundaries while the
  heading's accessible name remains the complete lyric.
- Assert word changes do not create live-region announcements.
- Assert note geometry, active note, cursor position, and the one-pitch case.
- Assert count-in exposes an understandable visual `2`, then `1`, before the
  recording timer begins.
- Test Record, Hear line, Play my recording, listen-only playback, and full
  playback through accessible locators; preserve the rendered absence of a
  separate **Play scene** control.
- Keep every existing privacy/consent boundary: listen-only makes no private
  request and never opens the microphone.
- Run responsive browser coverage at 280x568, 320x480, 640x360, and desktop;
  assert controls, the full lyric, waveform, note lane, and errors remain
  reachable without horizontal overflow.
- Run `npm run test`, `npm run build`, and `npm run test:browser` before merge.

Tests assert rendered behavior and accessible names, never Tailwind source or
class strings.

## Acceptance Criteria

- A learner who presses Record receives two correctly paced audible/visual
  counts before capture begins.
- The saved take contains no authored two-beat count-in interval and no
  synthesized melody.
- The current word, current melody note, playhead, timer, and automatic stop
  agree with one score-derived clock.
- Guidance works on every agreed playback and recording surface.
- The editor remains usable at 640x360 and its lyric remains the route's single
  `h1`.
- Existing guide audio remains usable but is not represented as score-aligned.
- All six current rhymes behave through generated definitions with unchanged
  storage IDs and privacy behavior.
- A valid seventh package appears on the shelf, routes correctly, and is
  accepted by Worker/API/storage lookup without handwritten registration.
- Invalid content fails before deployment with an actionable source location.

## Deferred Follow-up

If product testing shows that the narrator finishing early is confusing, add a
separate score-aligned guide-vocal production cycle. That work would record or
generate each vocal against the same MusicXML score and validate its duration
and downbeat. It is deliberately not part of this implementation plan.
