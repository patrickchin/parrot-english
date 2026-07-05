# Playback Controls and Voice Polish Design

**Date:** 2026-07-05

## Goal

Polish the scene-script lesson player so the learner is represented only by the
microphone interaction, playback can be controlled by scene, character artwork
does not appear translucent, and Dolly and the narrator use appropriate English
voices.

## Confirmed Decisions

- The learner remains the `user` speaker in lesson JSON but is never rendered as
  an on-screen character.
- Back and Next navigate whole scenes, not individual dialogue steps.
- Pause stops the current activity. The next Play restarts the current scene from
  its first step rather than resuming mid-line.
- During learner turns, the only visible learner representation is the
  microphone prompt.
- Dolly uses a cheerful young British feminine voice.
- The narrator uses a warm adult British storyteller voice with lively but
  measured delivery. The voice may evoke the tone and pacing of the cartoon but
  must not clone an original performer.
- The selected layout is a bottom safe-zone control dock.

## Root Causes

The scene migration introduced each scripted participant, including `user`, into
the generic character renderer. That made the learner avatar, name tag, and a
second user speech bubble appear alongside the microphone panel.

The previous flat lesson player had scene navigation and playback controls, but
those controls and their state events were removed when the old lesson state
machine was replaced. The current scene-script runner auto-advances and has no
manual scene-level control surface.

Dolly and the narrator currently share the Mandarin `Chen` ElevenLabs voice ID,
which causes Dolly's Chinese accent and gives the narrator the wrong character.

The Peppa WebP assets themselves contain broad regions of partial alpha. The
translucency is therefore in the files, not an inactive-character CSS rule.

## Stage Presentation

The visual catalog and lesson contract continue to include `user`. This keeps
lesson authoring explicit: user steps still state the learner's dialogue and the
emote map remains complete for every scripted participant. Presentation code
derives a separate visible-character list that excludes `user` before it
calculates character count, positions, names, and speech-bubble anchors.

Peppa and Dolly are distributed evenly across the stage using the visible count.
Character and narrator lines retain their existing speech presentation. A user
step renders no user avatar, character name, or stage speech bubble; its target
text appears only inside the microphone prompt in the control dock.

The duplicate top flow banner is removed during active playback. The lesson
picker, scene title, progress indicator, build badge, volume control, character
speech, and narrator captions remain.

## Safe-Zone Control Dock

The player reserves space along the bottom edge for a single compact dock. The
character baseline and responsive layouts sit above this reserved area, so the
dock does not cover sprites, names, or dialogue.

The dock always provides:

- Back on the left, disabled in the first scene.
- A Play or Pause control.
- Next on the right, disabled in the final scene.

During a learner turn, a center microphone segment expands within the dock to
show the target phrase and the hold-to-speak action. Recording changes the
segment to a clear active state; evaluation changes it to a non-interactive
checking state. The palette uses the existing navy, warm yellow, white, and
green lesson colors with high contrast. Pink remains an accent instead of the
large dominant microphone fill.

On narrow screens the prompt occupies a full row inside the reserved dock while
the three navigation/playback controls remain together below it. The stage
reserves the resulting larger mobile inset.

At initial load, Play begins scene one. At lesson completion, the center action
becomes Replay Lesson and starts again from scene one.

## Playback and Navigation State

The scene-script state machine gains explicit scene-control events:

- `PLAY_SCENE` starts the current scene at step zero.
- `PAUSE_SCENE` cancels current work, keeps the current scene index, resets its
  step index to zero, and enters a paused state.
- `SCENE_PREVIOUS` moves to the previous scene, step zero, and starts it.
- `SCENE_NEXT` moves to the next scene, step zero, and starts it.
- `REPLAY_LESSON` moves to scene zero, step zero, and starts it.

Scene navigation clamps at lesson boundaries, while the UI also disables the
unavailable direction. Existing automatic progression within a scene remains
unchanged. A scene whose first step belongs to `user` starts in the waiting
phase; otherwise it starts speaking automatically.

Before Pause, Back, Next, lesson selection, or replay changes state, the player
cancels active saved audio, microphone acquisition, recording, and speech
evaluation. Late async results must not advance the new scene. There is no
mid-audio resume state.

## Character Asset Repair

All six Peppa emote assets are repaired, not only the listening pose visible in
the reported screenshot. Each edited WebP must preserve the existing pose,
linework, colors, dimensions, and transparent background while making the
subject visually opaque. Soft antialiased boundary pixels may remain partially
transparent, but broad interior regions may not.

The Dolly assets are left unchanged. The learner assets remain in the global
catalog for schema compatibility but are no longer loaded by the stage.

## ElevenLabs Voices

The audio generator keeps speaker-specific default voice IDs. Dolly and narrator
receive separate English/UK voices selected from the available ElevenLabs voice
catalog according to the approved profiles. Neither may use the Mandarin
`Chen` ID, and the narrator must not reuse Dolly's voice.

The model remains `eleven_v3`, MP3 cache paths remain stable, and lesson JSON
continues to contain text only. Only Dolly and narrator cache files are
regenerated with `--force`; Peppa files are not regenerated. Existing per-speaker
environment overrides continue to take precedence over defaults.

## Accessibility and Error Handling

- Every icon control has an English accessible name and visible focus state.
- Disabled Back and Next buttons expose native disabled behavior.
- The microphone remains operable with pointer hold and Space/Enter hold.
- Recording and evaluation status remains announced through a live region.
- If saved audio fails, the existing error banner remains available and manual
  scene navigation still works.
- If microphone or evaluation fails, the learner returns to a usable prompt and
  can pause, restart, or change scenes.
- Reduced-motion preferences disable microphone pulsing and animated
  transitions as they do today.

## Verification

Automated coverage will verify:

- `user` remains valid script data but is excluded from rendered characters.
- User turns produce only the dock microphone prompt, not a stage bubble.
- Play starts at step zero of the selected scene.
- Pause resets the current scene without changing its scene index.
- Back and Next move one scene, start at step zero, and respect boundaries.
- Replay Lesson restarts at scene zero.
- Control actions cancel pending recording/evaluation paths without allowing
  stale completion events to advance state.
- The dock, navigation controls, playback control, prompt states, and responsive
  safe-area rules exist with accessible labels.
- Dolly and narrator defaults are distinct, are not the Mandarin `Chen` voice,
  and continue to resolve from speaker metadata.
- Every scripted non-user line still resolves to an existing saved MP3.

Manual verification will cover desktop and narrow viewport screenshots at idle,
character speech, narration, learner waiting, recording, evaluating, paused, and
finished states. Peppa asset alpha histograms and rendered screenshots will be
checked to confirm opaque interiors and transparent backgrounds. Dolly and
narrator samples will be auditioned after regeneration to confirm the approved
British voice profiles.

## Out of Scope

- Changing the lesson JSON schema or putting voice IDs/audio filenames into
  lesson files.
- Rendering a learner avatar elsewhere on the stage.
- Seeking or cloning the exact voices of protected cartoon performers.
- Changing Peppa's existing TTS voice or rewriting lesson dialogue.
