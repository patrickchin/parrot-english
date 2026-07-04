# Scene-Script Lesson Files Design

**Date:** 2026-07-05

## Goal

Move lesson authoring out of JavaScript and into automatically discovered JSON
files. Each lesson is a sequence of scenes, each scene is a sequence of atomic
dialogue steps, and every step contains exactly one line spoken by exactly one
character.

The design must make lessons easy to add and remove without putting audio or
image filenames in lesson files. It must also leave a clean path for automatic
ElevenLabs speech generation later without implementing that integration now.

## Scope

This change includes:

- one JSON file per lesson;
- automatic lesson discovery and a lesson picker;
- scene, setting, character, dialogue, and emote data;
- global character, emote, and background catalogs;
- a generic scene-script runner;
- press-and-hold microphone interaction for `user` dialogue;
- automatic progression through every other part of the lesson;
- validation with clear errors for malformed lesson data; and
- continued use of the existing saved-audio cache.

This change does not include:

- runtime ElevenLabs API calls;
- automatic creation or persistence of new audio cache files;
- branching dialogue;
- lesson editing inside the application; or
- network-loaded lesson catalogs.

## Authoring Model

Lesson JSON files live in a dedicated lesson-content directory. The filename is
the stable lesson identifier, so the JSON itself does not need an implementation
ID. Array order defines scene and step order.

```json
{
  "title": "Helping in the Garden",
  "scenes": [
    {
      "title": "The Tall Shelf",
      "settingDescription": "A sunny garden with a toy on a high shelf.",
      "background": "meadow-day",
      "characters": ["pig", "parrot", "user"],
      "steps": [
        {
          "speaker": "pig",
          "dialogue": "Oh! I can't reach it.",
          "emotes": {
            "pig": "worried",
            "parrot": "listening",
            "user": "listening"
          }
        },
        {
          "speaker": "user",
          "dialogue": "Can I help you?",
          "emotes": {
            "pig": "hopeful",
            "parrot": "encouraging",
            "user": "speaking"
          }
        }
      ]
    }
  ]
}
```

Lesson JSON contains story and performance direction only. It never contains
audio filenames, image filenames, TTS provider settings, voice IDs, cache keys,
or application state-machine details.

## Global Visual Catalogs

Characters, emotes, and backgrounds are reusable global data rather than being
redefined by each lesson.

The character catalog defines each character ID and display name. The emote
catalog defines the supported semantic emote IDs. The background catalog defines
the supported background IDs and human-readable metadata. Visual asset lookup is
owned by the catalogs or a catalog resolver, not by lesson JSON.

Every character/emote combination used by a lesson must have a pre-generated
visual asset. Every background ID must also resolve to a pre-generated asset.
The catalogs therefore act as the supported authoring vocabulary and as the
boundary between scripts and visuals.

`user` is a required global character ID. It uses the same step and emote format
as every other character. When `user` is the speaker, the runtime additionally
activates the microphone interaction.

## Validation Rules

The catalog loader validates all discovered lessons before exposing them to the
player. A lesson is invalid when any of these conditions is true:

- its title is missing or empty;
- it has no scenes;
- a scene title or setting description is missing or empty;
- a scene background does not exist in the global background catalog;
- a scene has no characters or no steps;
- a scene references an unknown global character;
- a step has an empty dialogue line;
- a step speaker is not one of the scene's characters;
- a step's emote keys do not exactly match the scene's character list;
- a step references an unknown global emote; or
- a required character/emote visual asset is unavailable.

Validation errors identify the lesson filename, scene index, step index, and
invalid field where applicable. Invalid content must not fail later as an
undefined property or missing image.

## Automatic Discovery and Lesson Picker

Vite discovers lesson JSON files eagerly at build time with `import.meta.glob`.
Adding a valid JSON file makes it appear in the picker after the development
server or production build refreshes. Deleting the file removes it. There is no
hand-maintained lesson registry.

The picker displays lesson titles and uses the filename-derived ID as its value.
The first valid lesson in deterministic filename order is the default. Selecting
a lesson resets the runner to that lesson's first scene and first step. Lesson
selection is available before starting and after completion, not while recording
or evaluating speech.

## Script Runner

The player tracks a selected lesson, scene index, step index, and a small runtime
phase. It does not compile scenes back into the old phrase-oriented
`LESSON_STEPS` shape.

For a non-`user` step:

1. Render the chosen scene background.
2. Render every scene character using the complete emote map on the step.
3. Highlight the speaker and show that step's single dialogue line.
4. Resolve and play saved audio for the dialogue.
5. Advance automatically when playback finishes.

For a `user` step:

1. Render the scene and complete emote map in the same way.
2. Display the dialogue as the target line.
3. Wait for the learner to press and hold the microphone button.
4. Begin recording on press and end recording on release or pointer
   cancellation.
5. Evaluate the recording against the step's dialogue.
6. On success, advance automatically.
7. On retryable failure, play/display feedback and return automatically to the
   same `user` step.

Crossing the final step of a scene advances to the first step of the next scene.
Crossing the final step of the final scene completes the lesson. No Next button
is part of normal lesson progression.

Recording must support pointer, touch, and keyboard-accessible press-and-hold
semantics. Releasing outside the button must still stop the active recording.
The app must never play character audio while the learner is recording.

## Scene Presentation

The background comes from the scene's validated background ID, while
`settingDescription` supplies story context and accessible description. The
characters array determines which characters are present. The renderer lays out
the complete scene character set consistently and uses the current step's emote
map to choose each pre-generated character visual.

Only the active step's speaker receives an active speech bubble. `user` is still
part of the visual character set and receives the emote declared by the script;
the microphone control is an additional interaction for that character rather
than a different data model.

## Audio Boundary

Lesson JSON owns spoken text but never audio locations. The player asks an audio
resolver for speech using structured context such as the speaker and dialogue.
For this change, the resolver uses the existing saved static audio catalog and
exact dialogue text.

If saved audio is missing, the player reports a clear audio-unavailable error and
does not crash or silently skip modeled dialogue. A future resolver can implement
the intended order—saved cache first, ElevenLabs generation second, optional file
cache write last—without changing lesson JSON or the script runner.

Chinese saved audio remains subject to the repository rule requiring ElevenLabs
and character-directed voices. This migration does not regenerate audio.

## Migration

The current hard-coded lesson becomes the first scene-script JSON file. Existing
dialogue and coaching text is preserved by turning each spoken line into its own
step. Learner target lines become `speaker: "user"` steps. The old duration hint
does not move into the lesson file because the new runner progresses according
to dialogue playback and microphone interaction rather than estimated scene
seconds.

Current visual and audio assets are retained through the new catalog and resolver
boundaries. The hard-coded `LESSON_STEPS` export is removed after all app and test
consumers use the catalog.

## Error Handling

- Invalid lesson or catalog data is rejected with a path-specific validation
  error.
- A missing cached dialogue line produces a visible audio-unavailable state.
- A microphone permission or support error remains recoverable on the current
  `user` step.
- Recording cancellation returns to the same `user` step without advancing.
- Evaluation failure returns to the same `user` step and preserves the script
  position.
- Changing lessons cancels pending playback and recording before resetting state.

## Testing

Focused tests cover:

- validation of valid lesson/catalog data;
- each invalid catalog, scene, step, speaker, and emote relationship;
- automatic discovery of lesson JSON files;
- deterministic picker ordering and lesson reset behavior;
- automatic non-user step, scene, and lesson progression;
- press, hold, release, cancellation, retry, and success behavior for `user`;
- complete emote-map rendering for every scene character;
- exact-text saved-audio resolution and the missing-audio error state; and
- migration coverage for every dialogue line in the current lesson.

After focused tests pass, run the existing unit suite, lint, and production build.

