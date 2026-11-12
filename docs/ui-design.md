# Quiet media studio

Taste-skill design pass, 2026-11-11: **Accent ladder**, seed `1986612481`.
The product's film stills, character portraits, and actual voice traces supply
its identity. Forest green marks primary actions, selection, and original voice;
coral identifies recording and the learner's voice. Large surfaces stay neutral.
Keep the existing system/CJK typography and rounded wordmark; use tabular
figures in the playback clock rather than introducing a third typeface.

The library answers “Which scene shall I dub?” with real film artwork and an
immediate start action. The player answers “What do I hear or say next?” with
the picture, actual waveform, current sentence, and large actions. My dubs
answers “Where can I continue?” with the learner's real saved attempts and
honest loading, empty, storage-error, and deletion states.

Use `#f3f5f2` for the light page, white for working surfaces, `#202a24` for ink,
`#214e3a` for the primary, and `#e0ebe2` for selected tints. Surface borders use
`#dce2dc`; interactive outlines use `#7b897e`. Dark mode uses neutral `#171717`
and `#222222` surfaces, light text, and restrained green highlights. Keep the
shared tokens authoritative, including the browser theme color. Panels use
8px corners and controls approximately 6px; menus alone carry a shadow.
Disabled shared controls retain readable text on a quiet neutral fill.

The desktop library keeps its 1100px content grid: four 263px scene columns
and three 16px gaps. Its featured scene is a white bordered panel. Phones use
a compact title/start row, with the real artwork in the scene shelf beneath
the four visible category controls. The player keeps its existing action rail
on desktop and four large actions in two rows on phones. Its practice surface
has the same white fill and fine border as the other routes. Preserve video
aspect ratios, role choice, skipping, retry, replay, errors, and session reset.

The dealt creator-home blueprint requires greetings and metric tiles that do
not belong to this product. Compose the library and saved attempts as media
lists and the player as an object detail, following the skill's app rules.
One shell redraw still produced a sidebar layout; retain the documented
no-sidebar shell because the product has two top-level destinations and the
video needs the width. Keep touch controls at least 44px, above the skill's
desktop administrative-control sizes. Use real catalog and saved data only.

Waveform traces retain solid green/coral outlines at 1.2 viewBox units and
35% fills. Their shapes, timing and amplitude remain actual signal data.

Review status: the library, role-selection and saved-dub previews were inspected
at 1440, 768 and 390px with no measured text-contrast or horizontal-overflow
failures. Library colored area fell from 25.8% to 7.8% on desktop. Tablet color
share comes mainly from the film stills; the empty saved-dubs page deliberately
keeps empty space rather than inventing attempts. Practice actions were checked
at the same widths in light mode and at 1440/390px in dark mode. Source lint has
no failures; the remaining recording pulse, clock formatting and menu-shadow
warnings have functional purposes.

Implementation is isolated on `codex/taste-studio`, based on current GitHub
`main`. The source build passes. The development preview uses port 4322 and
browser verification uses ports 4322/4323, separate from the shared checkout.
The focused appearance and library checks pass all 12 cases across desktop
Chromium, mobile Chromium and WebKit.

Record starts microphone capture directly, without an app permission dialog on
each scene or reset. The browser handles microphone access when needed. Keep
the local-recording notice in the footer and guardian guidance in Help; guardian
authorization before child use remains part of the planned grown-up setup.

Page navigation uses `/library/:folder`, `/dubs`, `/scenes/:slug`, and
`/scenes/:slug/dubs/:dubId`. The root opens the default film library. Audience
selection adds a history entry, and direct scene links return to that scene's
audience folder. Saved dub IDs replace the current scene address without
reloading the player. Each page supports `/en/`, `/zh/`, `/es/`, `/ja/`, and `/ko/`, with the URL
determining the interface language. An unprefixed entry uses the saved browser
preference, defaulting to Chinese, and replaces its address with the prefixed URL.

Approved sitemap:

```text
/                                      Open the preferred language
/en/                                   English scene library
/zh/                                   Chinese scene library
/:language/library/older-audience      Films & animation
/:language/library/younger-age-5       Younger children
/:language/library/older-children      Ages 10–12
/:language/library/teens               Teenagers
/:language/dubs                        My dubs
/en/scenes/patrick                     Patrick scene in English UI
/zh/scenes/friends-cheesecake          Friends scene in Chinese UI
/en/scenes/toy-story-infinity          Toy Story scene in English UI
/:language/scenes/:name/dubs/:dub-id    Continue a saved dub
```

Scene URLs use stable readable names, separate from translated display titles.
An optional catalog `routeSlug` provides a public name that differs from the
scene folder, preserving media locations and the scene references in saved dubs.
"My dubs" is a separate page at `/dubs`, reached through header navigation on
the same row as the language and theme controls. Narrow screens use a navigation
menu in that row. Saved attempts retain continue/delete actions, loading and
storage errors, and an empty state with a route back to scene selection. The
home page omits Help; the dubbing player retains its Help and guardian guidance.
Role selection, recording, and the finished result are steps within the player.

Navigation uses React Router data routing, route matching, redirects, and
navigation blockers. Translations use i18next and react-i18next directly, with
separate interface resources under `src/locales` for English, Chinese, Spanish,
Japanese, and Korean. Scene/role translations and pack-specific notices load from
content packs into i18next's `content` namespace, keyed by record ID. Use stable
semantic keys and named `{{variables}}` for interface messages. `useTranslation()`
renders messages, while `useLanguage()` exposes only the URL language and language
selector action. The navigation adapter preserves the
running recording session when a language or autosave URL changes.

Language switching changes only the prefix, preserving the scene, saved-dub ID,
selected line, unsaved takes, and active recording. Language-only Back/Forward
navigation does not reload the player. Theme remains a separate browser preference.
Pack metadata, application assets, APIs, and OSS media keep their unprefixed URLs.

Browse prerecorded videos using visible, solid category buttons for Films &
animation, Younger children, Ages 10–12, and Teenagers. Each shows its scene
count and a small thumbnail from its videos, and the selected category has a
contrasting fill. Keep every category visible: four across on larger screens,
two columns on phones, without a dropdown.

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
confirmed ready while the picture is paused, then the picture starts with no count-in.
Recording and “My recording” include up to 0.5 seconds of preceding video and
0.5 seconds after the line, stopping before the next speaker. The moving cursor
approaches the shaded target-line range, and original audio remains audible
outside the target line. Capture begins during the lead-in so early speech survives.
Takes keep their original timing and may extend into surrounding gaps; short gaps
are divided halfway between adjacent lines so voices cannot overlap. Replay and
MP4 export use the same limits. Capture startup is aligned to the native
`playing` event. A cancelled take
keeps the previous accepted recording.
“My recording” replays the matching video window with the recorded voice and any
scene backing track, using the same scheduler as the assembled dub. The original
voice is muted for that turn; stopping or reaching the padded window's end pauses both.

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
  recording, take playback, and assembled replay. Starting a new attempt clears
  the current trace and preserves the old attempt in My dubs;
  cancelling a retake preserves the previously accepted take.

## Storage and authoring

ESA holds application code, interface translations, and HTML/CSS assets. The
existing OSS bucket holds the catalog, packs, scene manifests, scene/role
translations, numeric waveform metadata, video, audio, and thumbnails. Content
publishes independently of the application; see [content packs](content-packs.md).
Live audio stays in memory; accepted recordings and waveform envelopes autosave locally in IndexedDB
and are never uploaded. A metadata store lists attempts without reading every
audio file, and a separate media store holds binary audio buffers and optional
selected source video. Binary buffers avoid WebKit's Blob preparation failures.

Each started session receives a random `dub_…` ID. The URL remembers the current
draft after a committed save. Reloading restores its role, current turn,
skipped/recorded dispositions, completion state, and recordings. The My dubs
page opens older attempts and confirms individual deletions. Starting over
keeps the previous session. Media bytes and lesson metadata commit atomically;
the UI reports Saved only after the latest transaction completes. Unsaved or
actively captured work retains the navigation warning. Quota/blocked storage
errors keep current takes in memory and offer retry and a separate tab for
managing saved attempts. Changed scene timings or missing media reject a restore
without overwriting the saved data. Browser storage persistence is requested
where available, and the shelf explains that clearing site data deletes drafts.

Adult testers can download a completed dub as an MP4 from the result screen.
The browser mixes the original scene, backing, and accepted takes locally, then
uses a lazily loaded Mediabunny module to package MP4 with native AAC audio
encoding. Existing H.264 picture packets are copied unchanged, in decode order;
other supported source formats are encoded to H.264 through WebCodecs. This avoids
real-time capture clocks and preserves original picture quality for shipped scenes.
Original audio remains for other characters and skipped turns. No extra
permission gate or backend is added. Export need not wait for the scene to play;
progress, cancel, retry, and a repeat-download link are available. An interruption
or cancellation discards the partial file and preserves the takes. Browsers
without the required MP4 encoder get a readable error. A downloaded file remains
on the tester's device after the session is cleared.

After preparing a source clip, run `node scripts/prepare-waveforms.mjs`. It writes
the waveform file referenced by
`content/packs/<pack_id>/scenes/<slug>/scene.json` and updates each manifest. Scene
thumbnail JPEGs are prepared under ignored `content/local-dubbing/` and uploaded
separately to the corresponding OSS clip folders. Validate and publish the changed
packs after uploading media; no application build is needed for content edits.
The retired Sintel sample is kept only as an internal test fixture. The function
build rejects content packs, scene metadata, waveforms, and media files.

If the reference envelope is absent or invalid, show a readable fallback while
leaving original playback and microphone recording available.

Original visual reference (2026-10-29): output/imagegen/ui-directions-2026-10-29/04-calm-clubhouse.png.
The mockup is a visual reference, not a replacement for the functioning video,
accessible controls, or real microphone and envelope data.


## Word timing authoring

`Line.words` contains `{text, start, end}` in absolute clip seconds. The words must
reproduce the authored English text, stay within their turn, have positive
ordered intervals, and never overlap. Scenes without word timings retain the
full-sentence fallback rather than inventing equal word spacing.

Run `uv run --python 3.12 scripts/align-words.py` on the prepared source media.
It uses TorchAudio 2.6's CTC forced alignment with `WAV2VEC2_ASR_BASE_960H`; the
existing line ranges constrain each alignment. This follows the
[TorchAudio forced-alignment API](https://docs.pytorch.org/audio/2.6.0/tutorials/ctc_forced_alignment_api_tutorial.html).
The model's frame grid is approximately 20 ms; accents, music, and stylized voices
can affect boundaries. Review generated timing against the source before release.
Word labels use the speech onset, not an evenly spaced layout or character count.

The authoring model and source audio stay outside the app build. Numeric
waveform and timing metadata publish with their packs in OSS, alongside
audiovisual assets; ESA serves the player. There is no learner transcription,
voice upload, or runtime model dependency. The
microphone overlay follows the original script timeline; it does not infer which
words the learner said. Regenerating unchanged meme scenes preserves word timings.


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
separation was skipped at the user's request; no public scene backing changed.
