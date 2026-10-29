# Warm player and voice waveforms

Chosen direction: 04-calm-clubhouse, approved on 2026-10-29. Warm ivory, forest teal,
coral recording controls, and a compact shared header. Desktop uses an action
rail; phones use four large actions in two rows. Keep the video, current
sentence, and listen/record actions prominent. Match the visual
reference while preserving the real video aspect ratio, role choice, line skipping,
retry, completed-take playback, errors, consent, and explicit session reset.

The requested “sound profile” means the original and learner waveforms with a
moving playhead, rather than music, UI sounds, voice filters, or scoring.

The practice waveform and English words share one horizontal time axis. Words
start beneath their measured speech onsets and highlight while spoken. Closely
spaced words use up to two rows; the timeline pans with the playhead on smaller
screens. The optional Chinese meaning hint remains below. Recording starts as soon as microphone permission and video readiness
allow, with no count-in. A cancelled take keeps the previous accepted recording.
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
  cumulative drift at 44.1 kHz. Saved takes keep these peaks in memory.
- Both traces use the same square-root amplitude scale for readable quiet detail;
  neither is independently normalized. This is a peak envelope, not a phoneme
  detector, pronunciation score, or calibrated SPL meter.
- The reference uses the original mix, including music/effects. Input hardware,
  echo cancellation, noise suppression, and browser gain affect microphone levels.
  Compare timing and relative emphasis; absolute vocal loudness is approximate.
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
