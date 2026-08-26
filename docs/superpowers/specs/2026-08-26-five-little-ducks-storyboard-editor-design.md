# Five Little Ducks Storyboard Editor Design

## Status

Approved in conversation on 2026-08-26. This design supersedes the linear
recording and verse-preview UX in the existing Five Little Ducks design. It
does not replace that document's authored rhyme, private storage, privacy,
account-deletion, or media-validation requirements.

## Problem

The current dubbing activity behaves like a wizard. It selects one line, asks
the learner to record it, advances to the next line, and only exposes the full
performance after all 24 lines are complete. Four-line verse previews improve
feedback speed, but the experience still feels like completing a long form
rather than creating a video.

The replacement should feel like a simple video project. The full video is the
home screen, six authored scenes are always available, and each scene contains
four independently recorded voice clips. A learner can play the whole draft at
any time, choose any scene, and choose any line without following a forced
sequence.

## Goals

- Make the full 98-second video the persistent project home.
- Keep the main 16:9 video visually dominant on desktop.
- Present the rhyme as six selectable four-line scenes.
- Let the learner select and replace any of the four lines in a scene.
- Make incomplete full-video and scene previews useful by combining saved
  learner takes with the existing ElevenLabs guide audio.
- Preserve immediate voice replay, the decoded waveform, private R2 saving,
  reload resume, and grown-up deletion controls.
- Preserve clear child-facing actions and responsive accessibility.

## Non-goals

- A multitrack timeline, draggable clips, trimming, splitting, volume curves,
  filters, or scene reordering.
- Multiple saved takes, take history, undoing a replacement, or choosing among
  several takes.
- Rendering, downloading, exporting, or publicly sharing a mixed video.
- A new storage format, D1 editor document, R2 bucket, API version, or database
  migration.
- Importing YouTube clips or protected cartoon footage.
- A recording countdown.

## Product Model

The project keeps the existing fixed authored model:

- one dub, `five-little-ducks-v2`;
- 24 canonical line slots;
- six canonical scenes, each containing four contiguous lines;
- one current R2 take per line;
- a 98-second authored full-video timeline;
- the existing checked-in ElevenLabs guide for every authored line;
- the existing duck animation and original background music.

The existing R2 status response remains the durable project document. A line
is recorded when its canonical slot is saved. A scene's status derives from
its four line slots:

- **Not started:** zero saved lines;
- **In progress:** one to three saved lines, displayed as `n / 4`;
- **Done:** four saved lines;
- **Needs retake:** a saved line failed private playback during this browser
  session and generated audio was substituted.

`Needs retake` is session-local. No new server metadata is introduced. After a
reload, the scene is shown as recorded until playback detects the bad take
again.

## Entry and Grown-up Confirmation

The route still begins with the existing private-recording disclosure and
grown-up confirmation. Confirmation is required before a new clip can be
uploaded. After confirmation, the route always opens the project home instead
of jumping to the first missing line.

Existing recordings load before the home appears, so the player, project
count, scene statuses, and Continue action are accurate immediately.

## Project Home

The desktop home is one full-width creation workspace rather than a phone-like
card or a two-screen comparison.

It contains:

1. The shared route header and a compact project bar with **Five Little
   Ducks** and `n of 24 voice clips recorded`.
2. A dominant 16:9 player centered in the available workspace.
3. Standard, unambiguous full-video controls labeled **Play full video** and
   **Stop full video**.
4. A compact six-scene dock beneath the player. Every scene is a separate
   selectable control with a thumbnail, scene number, and status.
5. One primary **Continue Scene n** action when at least one line is missing.
   It selects the first scene with a missing line in authored order and opens
   that scene's first missing line.

The learner can ignore Continue and open any scene directly. Selecting a
completed scene opens its first line for review. When all 24 lines are saved,
the Continue action is replaced by the non-interactive status **All scenes
recorded**; the full-video player and all scene controls remain available.

The home does not show waveforms, per-line clip rows, example audio controls,
recording controls, edit menus, or a full multitrack timeline.

## Draft Playback

The whole video is always playable, even with no learner recordings.

Before playback, each canonical line resolves independently:

- a saved line uses its authenticated private R2 audio endpoint;
- an unfinished line uses its existing static ElevenLabs guide asset.

The playback scheduler decodes both source types and schedules them against the
same authored clock and original music bed. The duck scene advances from the
same elapsed time. The project is labeled **Draft** while generated lines are
present and becomes **Your dub** when all 24 learner takes are usable.

If a saved take cannot be fetched or decoded, playback resolves that one line
again with the generated guide, marks its scene **Needs retake**, and continues
the video. If both the private take and its generated fallback fail, animation
and music continue through that line without voice and a non-blocking error
identifies the affected scene and line.

Stopping, changing view, choosing a scene, starting guide audio, or starting a
recording cancels current project playback and releases Web Audio resources.

## Scene Recorder

Selecting a scene replaces the project home with a focused scene recorder on
the same route. **Back to full video** is always visible and returns to the
project home without losing saved progress.

Desktop uses the scene video on the left and the active-line controls on the
right. The view contains:

- the scene title and `n of 4 recorded`;
- a large scene preview with **Play this scene** and **Stop this scene**;
- four separate line selectors with recorded, generated, selected, and
  needs-retake states;
- the selected line's full lyric;
- **Hear example**;
- a fixed recording action that changes in place among **Record line**,
  **Stop recording**, and **Record again**;
- the saved or pending take's real waveform and **Hear my voice** when
  available.

Opening an incomplete scene selects its first missing line. Opening a completed
scene selects its first line. Selecting another line is always allowed when no
recording or save operation is active.

There is no Next requirement and no automatic navigation after saving. The
learner remains on the saved line so they can hear it, record it again, play the
scene, select another line, or return to the full video. Scene and project
status update as soon as the save succeeds.

## Recording Behavior

**Hear example** plays the existing ElevenLabs guide for only the selected
line. Starting a recording stops guide, take, scene, or full-video playback.

Pressing **Record line** requests microphone access. There is no countdown.
As soon as access is ready, capture begins and the button becomes **Stop
recording** in the same location. The selected scene may animate silently
during capture; guide audio and background music do not play through speakers,
which avoids recording them back through the microphone.

Capture keeps the existing six-second maximum and may be stopped earlier. The
returned Blob immediately receives an object URL, waveform decode, and local
voice replay. It is uploaded to the selected canonical line slot. A successful
upload atomically replaces the previous take and causes all later scene and
full-video playback to use the new R2 audio.

The product remains single-take: it does not retain the prior R2 object after a
successful replacement.

## Browser State and Component Boundaries

The current reducer's sequential wizard phases are replaced with editor state
that models orthogonal concepts:

- route view: confirmation, project home, or scene recorder;
- selected scene and selected line;
- saved line map from the existing status API;
- session-local needs-retake line IDs;
- exclusive operation: idle, guide playback, microphone opening, recording,
  saving, local-take playback, scoped playback loading, scoped playback, or
  deletion;
- pending Blob recovery for the selected line after a recoverable save error.

Pure reducer events perform selection, navigation, saved-state updates, and
operation transitions. Media objects, AbortControllers, object URLs, audio
contexts, microphone sessions, and generation tokens remain in the controller
layer rather than reducer state.

`DuckDub.tsx` remains the route controller but no longer owns one monolithic
view. The implementation should introduce focused domain components such as:

- `DubProjectHome` for the dominant player and scene dock;
- `DubSceneEditor` for one scene and its active line;
- `DubSceneDock` for the six scene selectors and statuses;
- `DubLineSelector` for the four line states;
- shared scoped playback and recording controls.

The exact filenames may change during planning, but the project home, scene
editor, transport, and state reducer must remain separately understandable and
testable. Components use Tailwind utilities, shared controls from
`src/shared/ui.tsx`, and the shared route header. `DuckScene` and
`DubTakeWaveform` are reused.

## Playback Architecture

`startDubPlayback` is extended from "fetch every selected line from the private
audio endpoint" to "schedule a canonical range using an audio source resolver."
The resolver receives a line and returns its preferred source plus generated
fallback. The scheduler remains responsible for:

- validating that a scope is one canonical contiguous authored range;
- decoding sources;
- rebasing four-line scene cues;
- scheduling voices and the existing music bed on one Web Audio clock;
- reporting elapsed time for the duck animation;
- running through the decoded final take's tail for scoped scene playback;
- preserving the fixed 98-second full-video boundary;
- cancelling fetches, sources, animation frames, timers, and the audio context
  through one idempotent stop function.

Project and scene playback use the same scheduler. Line example and local take
replay continue to use the existing single-line audio helper.

## Saving and Recovery

The private v2 API, R2 envelope, consent header, validation, reset fencing, and
account-deletion behavior do not change.

Recoverable failures stay in the selected editor context:

- microphone unsupported or denied: keep the selected line and restore focus
  to **Record line**;
- temporary upload failure: retain the new Blob and its waveform and offer
  **Save again**;
- rejected or invalid recording: discard only that pending Blob and offer
  **Record again**;
- guide failure: keep visible text authoritative and recording enabled;
- saved take fetch/decode failure during scoped playback: substitute generated
  audio, mark the line **Needs retake**, and keep playback running;
- generated fallback failure: continue animation and music, announce the exact
  missing line, and keep editing available;
- route exit or unmount: stop media tracks and audio immediately.

Line and scene selection, return to project, and destructive actions are
disabled while the microphone is opening, recording is active, a Blob is
saving, or an unsaved Blob is waiting for Save again. This prevents the only
in-memory copy of a new take from being abandoned accidentally. The learner can
resolve that state by saving again or recording again.

Delete controls remain inside closed **Grown-up options** and retain the
existing confirmation and whole-dub deletion semantics.

## Responsive Presentation

Desktop presents a full-width workspace with a dominant 16:9 player and the
six-scene dock beneath it. The scene recorder uses a wide two-column layout
with the video left and focused controls right.

At narrow phone widths, the project video stacks above a horizontally
scrollable scene dock. The scene recorder stacks the video, four line
selectors, lyric, and active-line controls in that order. The interface remains
a responsive web workspace rather than using phone-shaped cards.

At short landscape sizes, the project video and compact scene dock must remain
inside the viewport without colliding with the shared header. The scene editor
may use two columns, but the active line and primary recording action must stay
visible without overlaying the video.

No supported viewport may horizontally overflow the page, hide the selected
scene or active action, or place controls over the route/account headers.

## Accessibility

- Player controls use explicit scopes: **Play full video**, **Stop full
  video**, **Play this scene**, **Stop this scene**, **Hear example**, and
  **Hear my voice**.
- Scene and line selectors are separate buttons rather than containers with
  nested interactive children.
- The selected scene and line use `aria-current`; visual state is not conveyed
  by color alone.
- Accessible names include scene number, line number, and recorded/generated/
  needs-retake state.
- Focus moves to the scene heading after scene selection, to the line heading
  after line selection, and back to the appropriate actionable control after
  recording, saving, playback, and errors.
- One polite live region announces navigation, progress, saving, and playback.
  Actionable media and upload failures use an alert.
- All learner controls retain a minimum 48 px target and visible text.
- `prefers-reduced-motion` disables decorative duck animation without disabling
  audio playback or progress updates.

## Verification

Implementation proceeds test-first. Unit and component coverage must include:

- editor navigation and operation transitions without sequential Next logic;
- first-missing scene and line selection;
- scene status derivation and immediate status updates after save;
- per-line private/generated source resolution;
- private-source fetch and decode fallback to the guide;
- full-video and four-line mixed-source scheduling;
- scene tail duration, fixed full-video duration, stopping, and cleanup;
- pending Blob preservation and save/re-record recovery;
- accessible names and live-status copy for all line and scene states.

Playwright coverage must include:

- confirmation opening the project home rather than a line wizard;
- playing a fully generated draft with zero saved lines;
- playing a mixed full draft and a mixed four-line scene;
- Continue selecting the first missing scene and line;
- selecting any scene and any line out of authored order;
- recording with no countdown, stopping, saving to the selected R2 slot,
  immediate local replay, replacement, and reload;
- staying on the same line after save rather than auto-advancing;
- returning to the full-video home at any safe point;
- transient upload retry and rejected-take recovery;
- corrupt private audio falling back to generated audio and marking Needs
  retake without stopping playback;
- keyboard focus after selection, success, failure, and playback completion;
- desktop, 280-390 px phone, and 640x360 short-landscape containment, target
  size, overlap, and overflow checks.

Before completion, run the focused dubbing tests, the complete unit suite,
`npm run test:browser`, `npm run build`, `npm run lint`, and `git diff --check`.
An independent review must check the final diff against this specification.

## Acceptance Criteria

The redesign is complete when:

1. The project opens on the full-video home after confirmation.
2. The full video and every scene play at any completion level using learner
   audio where usable and ElevenLabs audio elsewhere.
3. The learner can open any scene, select any of its four lines, record with no
   countdown, replay the take, replace it, and return home without forced
   advancement.
4. The desktop video is visually dominant with a compact six-scene dock.
5. Existing v2 recordings, APIs, R2 privacy, deletion, and reload resume remain
   compatible.
6. Failures preserve usable progress and do not unnecessarily stop the draft.
7. Responsive and accessible behavior passes the defined browser coverage.
