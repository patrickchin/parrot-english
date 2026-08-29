# Nursery Rhyme Melody and Voice Alignment

## Status

Approved in advance by the user's explicit autonomous instruction on
2026-08-29. The user asked for the implementation, pull request, and merge to
be completed without waiting for later approval. This design supersedes only
the generic-music and fixed Old MacDonald timing sections of the earlier Five
Little Ducks and Old MacDonald designs.

## Problem

The two nursery rhymes currently play every voice line over the same repeating
eight-note oscillator pattern. That pattern is unrelated to either song, so it
does not sound like Five Little Ducks or Old MacDonald and cannot reinforce a
learner's sense of the rhyme.

The shared four-second line grid happens to match the four musical phrases in a
Five Little Ducks verse. It does not match Old MacDonald. A traditional Old
MacDonald verse places the seven authored line starts at 0, 8, 16, 18, 20, 22,
and 24 seconds on a 120 BPM clock. Starting those lines every four seconds makes
the voice, scene changes, and melody drift apart.

The checked-in ElevenLabs guide clips are valid, expressive spoken recordings,
but no ElevenLabs key is available in the environment or project secrets for a
new generation pass. Learner recordings are private and must never be uploaded
to a music or pitch-correction service.

## Source Material

Use traditional score data rather than a third-party sound recording:

- Five Little Ducks uses the C-major melody published as notation on
  <https://en.wikipedia.org/wiki/Five_Little_Ducks#Music>, slowed to 120 BPM
  for a child-friendly four-second phrase.
- Old MacDonald uses the public-domain score at
  <https://commons.wikimedia.org/wiki/File:Old_MacDonad_Had_a_Farm.pdf>,
  cross-checked against the CC0 note timeline at
  <https://tunvox.com/music-sheet/old-macdonald-had-a-farm>.

Only note pitches, durations, and phrase boundaries are encoded. No external
recording is copied or shipped.

## Goals

- Make each rhyme immediately recognizable from its own melody.
- Start every guide or learner recording on the first beat of its matching
  musical phrase.
- Keep voice, melody, visuals, scene playback, and full playback on one Web
  Audio clock.
- Give Old MacDonald its real variable phrase lengths instead of seven equal
  four-second slots.
- Keep the guide clips, private learner recordings, recording API, consent,
  storage keys, and deletion lifecycle unchanged.
- Continue playback with the authored melody when one or more voice clips are
  unavailable.
- Add no runtime dependency and require no external API key.

## Non-goals

- Regenerating the existing ElevenLabs guide clips.
- Turning a learner's spoken recording into singing, changing its pitch, or
  time-stretching it.
- Uploading private audio to any third party.
- Producing downloadable mixed MP3/video exports.
- Adding tempo, key, instrument, or volume controls to the learner UI.
- Reworking the nursery-rhyme screens or artwork.

## Approaches Considered

### One complete backing-track file per rhyme

A rendered asset could sound consistent, but selected-scene playback would
need offset decoding and seeking, longer learner clips would outlive the file,
and every timing edit would require regenerating and recommitting media. It is
also a second clock unless playback is carefully rebased.

### New AI-sung vocals and generated music

This could produce a fully sung result, but no key is available, short TTS
singing prompts are not reliably pitch-exact, and it cannot safely or
appropriately transform private learner recordings. It would make the feature
dependent on a generation service without solving the core learner-alignment
contract.

### Definition-owned score on the existing Web Audio clock

This is the selected approach. Each rhyme owns a compact, immutable score made
of line-relative MIDI notes and durations. The existing player schedules the
score and decoded voice sources against the same `startAt` value and authored
line cues. It works for guide audio, private audio, missing audio, full
playback, and selected scenes without a new service or dependency.

## Score Model

Add `src/dubbing/dub-melodies.ts` with these immutable concepts:

```ts
type DubMelodyNote = Readonly<{
  atMs: number;
  durationMs: number;
  midi: number;
}>;

type DubMelodyPhrase = Readonly<{
  bassMidi: number;
  durationMs: number;
  notes: readonly DubMelodyNote[];
}>;

type DubMusicScore = Readonly<{
  countIn: readonly DubMelodyNote[];
  linePhrases: readonly DubMelodyPhrase[];
  outroMidi: readonly [number, number];
  volume: number;
}>;
```

`DubDefinition` requires one `music` score. `linePhrases.length` equals
`linesPerScene`; phrase selection uses the line's index within its scene, so a
single verified verse score repeats across all authored scenes.

Melody notes use a soft triangle oscillator with a short attack and release.
Each phrase adds one quiet sine bass pulse for warmth and beat clarity. A full
rhyme gets a two-note count-in during its existing 800 ms pre-roll; selected
scene playback begins directly on its first melody note. A soft tonic/fifth
outro fills only an authored or decoded tail after the last phrase. The score's
definition-owned gain keeps music clearly behind the voice.

## Phrase Timelines

### Five Little Ducks

Keep the existing global cues and 98-second full duration. At 120 BPM, every
line owns one eight-beat, four-second phrase. The four score phrases repeat for
all six scenes:

```text
scene line starts: 0s, 4s, 8s, 12s
scene phrase end: 16s
```

The existing 800 ms global pre-roll remains. The final selected scene retains
its existing 17.2-second authored clock, and a decoded six-second last take may
extend it to 18 seconds as before.

### Old MacDonald Had a Farm

Use a 120 BPM, 32-second verse and these phrase starts relative to each scene's
first line:

```text
line 1  Old MacDonald ... E-I-E-I-O       0s   (8s phrase)
line 2  And on his farm ... E-I-E-I-O     8s   (8s phrase)
line 3  With a ... here                   16s   (2s phrase)
line 4  And a ... there                   18s   (2s phrase)
line 5  Here a ..., there a ...           20s   (2s phrase)
line 6  Everywhere a ...                  22s   (2s phrase)
line 7  Old MacDonald ... E-I-E-I-O      24s   (8s phrase)
```

Global line cues begin at 800 ms and repeat this shape every 32 seconds. The
five-scene full duration becomes 162 seconds: 800 ms pre-roll, 160 seconds of
music, and a 1.2-second ending tail. `finalCueTailMs` becomes 9.2 seconds so a
selected final scene includes its complete eight-second last phrase and ending
tail.

## Playback and Synchronization

`scheduleDubAudio` remains the voice scheduler. `scheduleDubMusic` becomes
definition-aware and receives the selected canonical lines, cue offset, final
playback duration, output node, and shared `startAt`.

For every selected line:

1. find the line's canonical definition index;
2. select the phrase by `index % linesPerScene`;
3. schedule each melody note at
   `startAt + (line.cueMs - cueOffsetMs + note.atMs) / 1000`;
4. schedule the decoded voice source at
   `startAt + (line.cueMs - cueOffsetMs) / 1000`.

The first note and voice therefore share an exact timestamp. Guide and private
sources use the same rule. Voice clips are not clipped, pitch-shifted, or
otherwise modified; the contract is phrase-start alignment with a
musically-correct backing score.

All created oscillators remain in the player's existing cancellation and
failure-cleanup collection. A score setup failure stops already-created music
and voices and closes the context exactly once. Missing or undecodable voice
clips do not remove the melody or visual clock.

## Accessibility and Privacy

There is no UI or focus change. Existing Play/Stop labels and reduced-motion
behavior remain authoritative. Music starts only after the learner explicitly
starts playback.

Private learner recordings remain same-origin authenticated fetches decoded in
the browser. They are never persisted in a new location, inspected for pitch,
or sent to an external service.

## Testing and Verification

- Domain tests pin Old MacDonald's variable phrase cues, 32-second scene grid,
  162-second full duration, and immutable score shape.
- Playback tests assert literal source-score pitches and start times for one
  Five Little Ducks scene and one Old MacDonald scene.
- Playback tests assert each line's first melody note and voice share the same
  Web Audio timestamp.
- Existing selected-scene, full-duration, missing-audio, cancellation, consent,
  and scheduler-failure tests remain green with the new oscillator inventory.
- Type checking, lint, build, the complete Node suite, and browser suite run
  before the pull request.
- A local browser smoke test verifies both rhyme workspaces still expose the
  existing accessible playback controls and produce no console error when
  playback starts.

