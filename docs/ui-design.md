# Warm player and voice waveforms

Chosen direction: 04-calm-clubhouse, approved on 2026-10-29. Warm ivory, forest teal,
coral recording controls, and a compact shared header. Desktop uses an action
rail; phones use four large actions in two rows. Keep the video, current
sentence, and listen/record actions prominent. Match the visual
reference while preserving the real video aspect ratio, role choice, line skipping,
retry, completed-take playback, errors, consent, and explicit session reset.

The picture frame follows the source video's metadata instead of stretching to
fill the viewport height. Fit the picture and its 44px neutral control strip
within the available player cell; keep unused space outside the frame. Use a
16:9 placeholder until metadata loads, and preserve the whole picture without cropping.

The requested “sound profile” means the original and learner waveforms with a
moving playhead, rather than music, UI sounds, voice filters, or scoring.

The practice waveform and English words share one horizontal time axis. Words
start beneath their measured speech onsets and highlight while spoken. Closely
spaced words use up to two rows; the timeline pans with the playhead on smaller
screens. The optional Chinese meaning hint remains below. Microphone capture is
confirmed ready while the picture is paused, then the picture starts with no count-in. Capture preroll is aligned to the native
`playing` event and excluded from the learner turn on replay. A cancelled take
keeps the previous accepted recording.
“My recording” replays the matching video turn with the recorded voice and any
pack backing track, using the same scheduler as the assembled dub. The original
voice is muted for that turn; stopping or reaching its end pauses both.

## Signal and alignment

- Original traces retain the maximum absolute PCM sample in each 5 ms window,
  prepared with FFmpeg (mono, 16 kHz). Version 2 metadata replaces the previous
  20 ms RMS envelope; the renderer retains up to 4,000 points per turn rather
  than the previous fixed 240 bins. No decorative waveform samples are added.
- Microphone peaks use the same 5 ms windows in a native AudioWorklet, so samples
  between UI animation frames are preserved. Fractional sample windows avoid
  cumulative drift at 44.1 kHz. The same worklet captures PCM samples and their
  peaks with one sample origin. Takes use standard mono PCM WAV instead of a
  separately encoded MediaRecorder stream, whose startup sample origin differed
  from the live worklet in the measured regression. Both stay in memory.
- Both traces use the same square-root amplitude scale for readable quiet detail;
  neither is independently normalized. This is a peak envelope, not a phoneme
  detector, pronunciation score, or calibrated SPL meter.
- The reference uses the original mix, including music/effects. Input hardware,
  echo cancellation, noise suppression, and browser gain affect microphone levels.
  Compare timing and relative emphasis; absolute vocal loudness is approximate.
- The playhead samples the video clock on every animation frame, without a
  separate easing animation. Saved waveform paths are cached while it moves.
  Takes retain the clip position corresponding to blob sample zero, including
  capture preroll, for both drawing and replay.
  Recording ends at the video turn boundary and pauses the picture before
  the final worklet sample block is received and serialized. Interrupted picture playback cancels the
  attempt and preserves any accepted take; recorded replay stops on interruption
  so its independently scheduled audio cannot run ahead of the picture.
- Replay decodes each take once, keyed by its Blob in a WeakMap. Replacing or
  clearing takes releases that cache entry with the old Blob; failed decodes can
  retry. Listening to one line does not decode unrelated takes.
- Replay schedules the full opening samples before advancing the picture.
  `AudioContext.getOutputTimestamp()` maps render time to predicted audible
  time; older engines use their reported base/output latencies. Both are platform
  estimates, and engines exposing neither fall back to their render clock.
  Device changes or interruptions outside the sync tolerance stop playback.
  Hardware/input processing latency still requires real-device checks.
- The practice graph shows the selected turn. The result graph places recorded
  turns on the full-scene timeline. The cursor follows original playback, live
  recording, take playback, and assembled replay. Reset removes the learner trace;
  cancelling a retake preserves the previously accepted take.

## Storage and authoring

ESA holds app code and manifests plus small numeric waveform metadata. Video,
audio, and thumbnails remain in the existing OSS bucket. Live/saved learner
recordings and waveform envelopes stay in memory and are never uploaded.

After preparing a source clip, run `node scripts/prepare-waveforms.mjs`. It writes
`public/packs/<slug>/waveform-v2.json` and updates each manifest. Scene thumbnail
JPEGs are prepared outside public/ under ignored content/local-dubbing/ and uploaded
separately to the corresponding OSS clip folders. The retired Sintel sample is
kept only as an internal test fixture. The function build continues rejecting media files.

If the reference envelope is absent or invalid, show a readable fallback while
leaving original playback and microphone recording available.

Selected reference: output/imagegen/ui-directions-2026-10-29/04-calm-clubhouse.png.
The mockup is a visual reference, not a replacement for the functioning video,
accessible controls, or real microphone and envelope data.


## Word timing authoring

`Line.words` contains `{text, start, end}` in absolute clip seconds. The words must
reproduce the authored English text, stay within their turn, have positive
ordered intervals, and never overlap. Packs without word timings retain the
full-sentence fallback rather than inventing equal word spacing.

Run `uv run --python 3.12 scripts/align-words.py` on the prepared source media.
It uses TorchAudio 2.6's CTC forced alignment with `WAV2VEC2_ASR_BASE_960H`; the
existing line ranges constrain each alignment. This follows the
[TorchAudio forced-alignment API](https://docs.pytorch.org/audio/2.6.0/tutorials/ctc_forced_alignment_api_tutorial.html).
The model's frame grid is approximately 20 ms; accents, music, and stylized voices
can affect boundaries. Review generated timing against the source before release.
Word labels use the speech onset, not an evenly spaced layout or character count.

The authoring model and source audio stay outside the app build. Only numeric
waveform and timing metadata ship through ESA; audio/video stays in OSS. There
is no learner transcription, voice upload, or runtime model dependency. The
microphone overlay follows the original script timeline; it does not infer which
words the learner said. Regenerating unchanged meme packs preserves word timings.


Verification for the timed waveform update: production build and six Node checks
passed; the full browser suite passed 53 checks with nine WebKit microphone skips.
Checks cover measured word positions on the waveform axis, non-overlapping labels,
active-word highlighting, following the playhead, responsive controls without page
scrolling, live/saved microphone peaks, retries, and synchronized video replay.
Physical phone microphones and WeChat remain unverified.

Playback timing verification (2026-11-06): build and all seven Node checks pass;
full browser suite passes 97 checks with 12 WebKit microphone skips. New checks
sample painted cursor movement against the video clock in Chromium, mobile
Chromium, and WebKit, and exercise delayed recording startup/save completion,
waveform/replay offsets, and interruption without losing an accepted take.

Audio pipeline verification (2026-11-10): build and all ten Node checks pass;
full browser suite passes 104 checks with 11 existing WebKit capture skips.
The new generated-input capture/replay checks run in Chromium, mobile Chromium,
and WebKit without skips. They retain an opening 90 ms pulse through delayed
readiness, preserve right-only stereo input through native mono downmix, compare
WAV sample onset to its waveform, retain prior takes after audio interruption,
and release the microphone on cancellation. An AudioWorklet test tap observes
actual rendered replay PCM and projects its transient through the browser's
output timestamp to the sampled video clock. Measured offsets were 41.2 ms,
45.6 ms, and 7.8 ms respectively (60 ms test limit); each take decoded once
across repeated listens. These are browser-reported output estimates, not a
physical microphone/speaker or headset loopback measurement. Soundtrack
separation was skipped at the user's request; no public pack backing changed.
