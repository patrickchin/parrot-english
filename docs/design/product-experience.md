# Product Experience Design

## Summary

Parrot English is a one-page, full-screen English speaking experience for young
children. A lesson plays like a short interactive episode: characters act out a
situation, a character models a useful line, the learner repeats it, and a
voice-only narrator gives brief feedback.

All child-facing dialogue and narration is in English. The current lesson
advances automatically except when the learner must press and hold the
microphone button to speak.

## Roles

The global character catalog contains three visible roles:

- `peppa`: a story character.
- `dolly`: a story character who frequently models the learner's line.
- `user`: the learner, rendered and animated like every other visible
  character.

`narrator` is a global voice-only speaker. Narrator steps appear as captions and
never add a visible character or emote entry.

## Lesson and Scene Structure

Each lesson is an independent JSON file in `content/lessons`. The app discovers
those files automatically and lists them in the lesson picker, so authors can
add or remove lessons without changing application code.

A lesson contains five to eight scenes. Each scene provides:

- a title;
- a free-form setting description;
- a chosen pre-generated background ID;
- the visible character IDs;
- an ordered list of steps.

Each step has one speaker and exactly one line of dialogue. It also selects one
pre-generated emote for every visible character, including `user`. The global
emote set is intentionally small: `idle`, `talking`, `listening`, `happy`,
`sad`, and `surprised`.

## Automatic Lesson Loop

The implemented loop is:

1. The learner or adult selects a lesson and presses Start.
2. Character and narrator steps play automatically in script order.
3. A user step waits with an obvious hold-to-talk control.
4. The learner holds the microphone button, speaks, and releases it.
5. The app evaluates the recording after the microphone stops.
6. The narrator gives audible English feedback.
7. Success advances automatically.
8. The first unsuccessful attempt replays the preceding character model, then
   returns to the same user step.
9. A second unsuccessful attempt receives feedback and continues the story.
10. Final narrator praise completes the lesson and offers Play again.

No character or narrator audio plays while recording or evaluating.

## Hold-to-Talk State

Microphone access is not requested when the lesson starts. It is requested only
when the learner presses and holds the speaking button.

The user turn must:

- show the exact target line prominently;
- label the idle action as “Press and hold to speak”;
- label the active action as “Release when you finish”;
- support pointer and keyboard press-and-hold interaction;
- show a clear checking state after release;
- announce the turn and errors through accessible live regions;
- stop all media tracks before speech evaluation begins.

## Visual Design

The app uses a fixed full-screen stage, a selected catalog background,
transparent character sprites, rounded speech surfaces, and large tactile
controls. Character placement is generic and based on each character's slot in
the current scene, rather than hard-coded names.

Design constraints:

- Keep controls and target text large enough for children and touch input.
- Keep character speech visually tied to the active speaker.
- Present narrator speech separately from character bubbles.
- Use more than color alone to identify recording and checking states.
- Respect reduced-motion preferences.
- Pre-generate every supported character/emote asset.

## Content Boundaries

Lesson JSON is text and catalog IDs only. It never stores image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
asset paths, and the static audio manifest owns the optional saved-speech cache.
