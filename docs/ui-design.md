# Warm player and voice waveforms

Chosen direction: 04-calm-clubhouse, approved on 2026-10-29. Warm ivory, forest teal,
coral recording controls, and a compact shared header. Desktop uses an action
rail; phones use four large actions in two rows. Keep the video, current
sentence, and listen/record actions prominent. Match the visual
reference while preserving the real video aspect ratio, role choice, line skipping,
retry, completed-take playback, errors, consent, and explicit session reset.

The requested “sound profile” means the original and learner waveforms with a
moving playhead, rather than music, UI sounds, voice filters, or scoring.

The practice waveform sits immediately above the English line and its optional
Chinese hint. Recording starts as soon as microphone permission and video readiness
allow, with no count-in. A cancelled take keeps the previous accepted recording.
“My recording” replays the matching video turn with the recorded voice and any
pack backing track, using the same scheduler as the assembled dub. The original
voice is muted for that turn; stopping or reaching its end pauses both.

## Signal and alignment

- Original traces are actual 20 ms RMS windows prepared from the normalized clip
  with FFmpeg (mono, 16 kHz), not decorative or randomly generated waves.
- Live microphone traces use Web Audio analyser RMS samples aligned to recording
  elapsed time. Saved takes retain the same envelope for replay and retakes.
- Both traces share one fixed dBFS display scale (−54 to −3 dBFS); neither is
  independently normalized. The plot is a coarse loudness envelope, not a raw
  sample waveform, phoneme detector, pronunciation score, or calibrated SPL meter.
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
`public/packs/<slug>/waveform-v1.json` and updates each manifest. Four thumbnail
JPEGs are prepared outside public/ under ignored content/local-dubbing/ and uploaded
separately to the corresponding OSS clip folders. Sintel retains its existing
licensed poster. The function build continues rejecting media files.

If the reference envelope is absent or invalid, show a readable fallback while
leaving original playback and microphone recording available.

Selected reference: output/imagegen/ui-directions-2026-10-29/04-calm-clubhouse.png.
The mockup is a visual reference, not a replacement for the functioning video,
accessible controls, or real microphone and envelope data.
