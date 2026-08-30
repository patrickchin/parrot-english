# Nursery-Rhyme Recording Melody Synchronization

## Status

Approved in chat on 2026-08-31. This design extends the existing synchronized
nursery-rhyme playback score into the line-level recording workflow. It does
not replace the score, lyrics, guide audio, storage contract, or consent model.

## Problem

All six nursery-rhyme projects already synthesize their traditional melodies
during scene and full-video playback. The line editor is inconsistent:

- `Hear line` plays only the saved guide voice;
- recording captures against silence and always allows six seconds;
- `Play my recording` plays only the learner's voice;
- the waveform and timer assume that same fixed six-second window.

This makes it difficult for a learner to enter on the correct beat, sing at the
authored pace, or judge whether a take will align with the finished rhyme.
Several Old MacDonald phrases are two or eight seconds, while the other current
rhymes use four-second phrases, so one global recording duration cannot match
the music.

## Goals

- Play the selected line's recognizable melody while the learner records.
- Start the recording and first melody note together after microphone startup.
- Stop automatically when that exact authored phrase ends.
- Derive the timer, progress bar, and waveform window from the selected phrase.
- Play the same phrase behind `Hear line` and `Play my recording`.
- Keep line, scene, and full-rhyme playback on the same score data.
- Apply the behavior to Five Little Ducks, Old MacDonald, Twinkle Twinkle,
  Row Row Row Your Boat, Mary Had a Little Lamb, and Humpty Dumpty.
- Preserve private, microphone-only saved takes and all current consent,
  storage, deletion, and upload behavior.
- Add no runtime dependency, generation service, or new media asset.

## Non-goals

- Baking the melody into an uploaded learner recording.
- Generating or checking in MP3/WAV backing tracks.
- Adding an instrument, key, tempo, or volume control.
- Adding a line-level count-in. The melody and capture begin together.
- Changing lyrics, score notes, guide voices, artwork, routes, or Guardian
  settings.
- Pitch-correcting, time-stretching, trimming, or otherwise transforming a
  learner's voice.
- Changing the existing full-rhyme two-note count-in.

## Approaches Considered

### Reuse the existing authored Web Audio score

This is the selected approach. Every definition already owns an exact melody
made of line-relative notes and phrase durations. Reusing it gives the editor
the same tune and timing as final playback, requires no network dependency, and
automatically follows future score corrections.

### Render and check in backing-track files

Rendered files could provide richer instrumentation, but they would duplicate
the score's timing authority. Every score or cue edit would require regenerated
media, and individual-line playback would require reliable seeking or a large
set of per-line assets. This adds maintenance without improving the required
alignment contract.

### Mix music permanently into each saved take

A baked mix would make the clip self-contained, but it would fix one music
balance forever, make later score corrections ineffective, and double the
melody when the existing full player overlays its score. It would also create
different semantics for legacy voice-only takes. The learner's saved clip must
therefore remain microphone-only.

## Phrase as the Single Timing Source

The fixed `DubDefinition.recordingMs` field and Five Little Ducks' shared
recording-duration constant are removed from the dubbing domain. A single
catalog helper resolves a canonical line to its `DubMelodyPhrase`:

1. find the line's index in the definition;
2. if the score has one phrase per authored line, use that index;
3. otherwise require one phrase per scene line and use
   `lineIndex % linesPerScene`;
4. reject a foreign line or malformed score.

The selected phrase's `durationMs` controls recording, the visible timer,
progress, and waveform scale. The present catalog consequently exposes line
windows of two, four, or eight seconds. Those numbers are not copied into UI
code; changing a phrase duration changes every consumer automatically.

The full and selected-scene player uses the same resolver, removing its private
copy of phrase-selection logic. This prevents playback and recording from
silently choosing different musical phrases.

## Line Performance Playback

The existing Web Audio player remains responsible for decoded guide/private
voice sources, melody oscillators, gain, cancellation, and context cleanup. It
is extended to support a canonical one-line performance and a deliberately
voice-free music-only performance.

- `Hear line` resolves the checked-in guide and schedules it with the selected
  phrase on one Web Audio clock.
- `Play my recording` resolves the pending object URL or authenticated saved
  take and schedules it with that same phrase.
- Scene and full-video playback retain their current behavior.
- A music-only line performance performs no audio fetch or decode, so recording
  startup does not depend on a guide or private clip.

All line actions use the definition-owned music volume. There is no music on
the nursery-rhyme shelf, no autoplay, and no new learner-facing toggle.

## Recording Flow and Synchronization

Pressing `Record` follows this sequence:

1. cancel any guide, take, scene, full-video, or previous recording operation;
2. prepare and resume the line's Web Audio music context while the click is
   still the initiating learner action;
3. open the microphone and create the existing microphone-only MediaRecorder;
4. once both are ready, start the recorder and schedule the first melody note
   in the same synchronous start path;
5. enter the visible recording state only after both starts succeed;
6. drive elapsed progress from that start and clamp it to the resolved phrase
   duration;
7. stop and save when the phrase reaches its authored end.

The music start path has no fetch, decode, or artificial pre-roll. MediaRecorder
and Web Audio cannot share a sample clock through standard browser APIs without
rerouting and re-encoding the microphone, so the contract is same-turn start
with no intentional offset. This preserves the original microphone bytes and
gives the learner perceptually aligned capture without a new audio-processing
pipeline.

Manual `Stop` remains available. It stops both melody and capture and saves the
shorter take, matching the current early-stop behavior. Automatic completion
must use the phrase duration rather than a global timeout. Navigation, retake,
route change, learner change, and unmount stop both resources and follow the
existing discard rules.

## User Interface and Accessibility

The editor retains its current layout and shared controls. Only timing-derived
copy changes:

- idle feedback reads `Melody length: 0:02`, `0:04`, or `0:08` as appropriate;
- active feedback reads `Recording with melody`;
- the timer continues to show elapsed and total time, with the phrase duration
  as its accessible maximum;
- the progress bar and waveform use that same duration.

`Starting…`, `Stop`, `Record again`, save recovery, focus restoration, and
accessible button names keep their current behavior. No status relies on color
alone. Full and scene playback labels remain unchanged.

## Audio Isolation and Privacy

The music connects only to the device output. MediaRecorder continues to record
only the microphone stream, with the existing echo-cancellation and
noise-suppression constraints. The browser may still pick up faint physical
speaker bleed on some devices, but the application never routes or mixes the
music signal into the saved stream.

No learner audio is sent to a new endpoint or third party. Existing and new
takes use the same authenticated upload, private playback URL, R2 envelope,
consent generation, and deletion lifecycle. Existing voice-only takes need no
migration and receive the melody when replayed in the updated editor.

## Failure and Cancellation Behavior

- If the score is malformed or Web Audio cannot prepare or start, recording
  does not proceed and no take is saved. The editor reports that the melody
  could not start and offers the existing Record action for retry.
- If microphone startup fails, the prepared music context is closed before the
  existing microphone error is shown.
- If music scheduling fails after MediaRecorder starts, the session is
  cancelled and its blob is discarded.
- If guide or take loading fails, the existing guide/take error behavior is
  preserved; the app does not silently play an unsynchronized voice-only line.
- Abort and cleanup remain idempotent. Every oscillator, decoded source,
  animation frame, timer, object URL, media track, and AudioContext is owned by
  the current media generation and released at most once.
- Upload and save-retry failures happen after recording has ended and therefore
  retain the current local-preview recovery behavior.

## Implementation Boundaries

Expected production changes are limited to the existing dubbing and recording
components:

- `src/dubbing/rhyme-catalog.ts` owns canonical line-to-phrase resolution and
  no longer carries a fixed recording duration;
- `src/dubbing/dub-script.ts` drops the obsolete shared six-second constant;
- `src/dubbing/dub-playback.ts` reuses the resolver and provides synchronized
  one-line voice-plus-melody and music-only playback;
- `src/dubbing/DubStudio.tsx` coordinates prepared music with recording and
  routes guide/take playback through the line player;
- `src/dubbing/DubSceneEditor.tsx` renders phrase-derived duration and status;
- `src/dubbing/DubTakeWaveform.tsx` accepts the selected phrase duration rather
  than importing a global constant.

No Worker, database, migration, API, route, consent, static-audio manifest, or
media-generation script change is required.

## Testing and Verification

Domain tests will verify that every line in every definition resolves to the
correct frozen phrase and that malformed or foreign inputs fail closed.

Web Audio tests will verify:

- one-line guide and take sources start with the first melody note;
- music-only recording playback performs no fetch or decode;
- two-, four-, and eight-second phrases report and stop at their authored end;
- manual stop and abort stop music exactly once and close the context;
- score/start failures clean up without leaving audio running;
- existing scene and full-video timing remains unchanged.

React tests will verify phrase-derived labels, timer maxima, progress, waveform
duration, coordinated record/music start, automatic completion, early stop,
failure handling, save recovery, and unmount cleanup.

Playwright coverage will use accessible locators to exercise recording on
representative two-, four-, and eight-second lines, confirm the melody starts
through the instrumented Web Audio mock, and preserve the current narrow,
short-landscape, and desktop containment checks. It will also smoke-test all
six rhyme routes through the shared behavior.

Final verification runs focused dubbing tests, the complete Node suite,
TypeScript/Vite build, lint, and `npm run test:browser`. The final diff must
contain no generated audio, guide-audio, database, or Worker changes.
