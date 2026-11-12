# Green Pop Studio

Approved direction, 2026-11-12: a vibrant media studio for independent learners
across ages. Keep a small outline parrot beside the wordmark; scene posters and
character portraits carry the activities rather than a child-specific mascot.
The film still, the learner’s voice, and the sentence being performed are the
product’s visual identity. Keep the existing React, Tailwind, Base UI controls,
content packs, routes, and recording flow.

Use the shared tokens in `src/styles.css` as the authority. Light mode uses
`#f1f7ed` for the page, `#123d2c` forest ink, `#087d4c` for selections and original
waveforms, `#21c878` for the featured green field, and `#c9f1a2` for mint panels.
Yellow `#f8e34c` marks primary actions; pink `#ffa6b5` marks starting a recording.
Keep destructive red for stopping capture, deletion, and errors. Original and
learner waveforms retain their distinct green/coral signal colors, shared scale,
real data, and labels. Never create decorative waveform samples.

Dark mode uses `#14251d` for the page, `#1f3529` for working surfaces, pale forest
text, and mint selection. The green hero, yellow actions, and pink recording
controls keep their legible dark foregrounds in either appearance. Start in light
mode and retain the existing explicit appearance preference across navigation.
The browser theme color follows the actual page background.

Use Avenir Next where installed, with the existing CJK/system fallbacks. Display
and body type share this family; avoid the former rounded preschool typography.
Panels use 16px corners, scene artwork uses 10px corners, and controls use the
shared button geometry. Separate panels with flat fills; only menus and dialogs
carry a shadow. Dialogs use a plain dim backdrop. Keep touch targets at least
44px, visible keyboard focus, selection labels, and readable disabled controls.

The library answers “Which scene shall I dub?” with a split green introduction
and an actual featured poster plus its title and series. Phones stack these
parts and keep the poster visible. The introduction is translated in every
interface language. Retain four visible category controls, show filters,
search, scene counts, group headings, empty states, and source/privacy notices.
The existing four-column desktop, three-column tablet, and two-column phone
shelves keep their established behavior. Posters use their 16:9 frame.

The player keeps its space-efficient desktop action rail and phone action grid,
video fitting, timed captions, role choices, and real waveforms. Use a white or
dark working panel for role selection and dialogue. Yellow marks the next
primary action, pink starts recording, and recording/stop/error states remain
explicit. On narrow player headers, the parrot mark carries the home link while
language, appearance, Help, and Back retain full touch targets.

My dubs uses the same shell and flat surfaces. The empty state uses mint and a
yellow browse action; existing saved attempts keep continue/delete controls,
progress, dates, unavailable-scene information, storage notices, loading, retry,
and deletion confirmation. Help and guardian guidance remain available.

This is an application appearance change. ESA still serves code, OSS still
serves content and media, and recordings remain in this browser’s IndexedDB.

## Visual review, 2026-11-12

Final validation: `npm run build` and all 40 unit tests pass. The final focused
Playwright run passes 89 checks across Chromium, mobile Chromium, and WebKit,
with one existing hardware-only WebKit microphone case skipped. All 19
localized production-route checks pass, for 108 passing browser checks. Tests
used isolated ports 4326/4327. The earlier full-suite exploration was stopped
after 160 passes to fix loading-shell readiness races; the affected language
and subtitle checks pass in the final focused run. The complete 408-case suite
was not rerun to completion.

The final production build was inspected at 1440, 768, and 390px with zero
measured layout or contrast failures. Source style lint reports zero failures
and zero warnings. Screenshots live under
`~/Pictures/Screenshots/Codex/parrot-english/`, including the before/after
library, role selection, light/dark practice, and saved-dub states.

Compared with the preceding library, the hero moves from a 28px rounded scene
title to a 40px Avenir Next introduction; its two lines fit every checked width.
The phone poster is visible instead of omitted. Both versions have zero
horizontal overflow. The final first screen has 22% strong color versus 18%
before, including film artwork.

Three inspector warnings are intentional: the substantial green field and 40px
introduction follow the approved Pop Studio direction; the near-edge show
label is inside its own horizontal filter strip, whose focused controls scroll
into view. Retain those decisions rather than applying the administrative
screen color and type limits to this media browser.

```text
ROUND 2
Seen in one second: a green media library with an immediate dubbing action.
Idea (one sentence): familiar film scenes become invitations to perform in English.
Live thing: choose a scene, perform a character, and replay the actual recording.
Layout words by section: hero=split color and film / discovery=categories and search / scenes=grouped media shelves.
Scores: design 7.6 · usability 8.0 · creativity 7.0 · content 8.0 → overall 7.6
Caps applied: creativity capped at 7 because the studio composition also fits adjacent media products.
Top three problems (most visible first), each with the screenshot and fix:
1. The first typography pass was too heavy in desktop-fold.jpg; reduced the introduction and brand to weight 700.
2. The old phone header forced the wordmark to a tiny size; practice-light-390.png now uses a 44px-tall parrot home link with full-sized adjacent controls.
3. Age-only discovery labels still narrow the apparent audience in mobile-fold.jpg; keep them for this visual change and review level/interest browsing as a separate product decision.
```

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
  prepared with FFmpeg (mono, 16 kHz). Version 2 metadata uses peak amplitudes.
  Canvas rendering retains the largest peak in each displayed pixel column.
  Original and learner signals occupy two aligned lanes with one time axis.
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
  separate easing animation or per-frame React updates. Reference and saved
  signals redraw only when their data, window, size, or appearance changes.
  Live capture appends newly received columns, revisiting only the partial last
  column; uncaptured regions remain blank and the live trace stops at the cursor.
  Recording cancels if the capture/video clock mapping drifts by more than 120 ms.
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
