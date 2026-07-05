# Scene-Script Lesson Files Design

**Date:** 2026-07-05

## Goal

Move lesson authoring out of JavaScript and into automatically discovered JSON
files. Each lesson is a short, immersive English story made of scenes. Each
scene is a sequence of atomic dialogue steps, and every step contains exactly
one line spoken by exactly one speaker.

The lesson creator system prompt must emit this JSON contract directly. Lesson
files contain story and performance direction, never audio or image filenames.
The runtime must retain a clean path to automatic ElevenLabs speech generation
later without implementing that integration now.

## Scope

This change includes:

- one JSON file per lesson;
- automatic lesson discovery and a lesson picker;
- the child name, two goal phrases, short and detailed summaries, location,
  scenes, and steps;
- English-only dialogue, instruction, feedback, and narration;
- a restored English narrator speaker;
- global character, emote, and background catalogs;
- a generic scene-script runner;
- press-and-hold microphone interaction for `user` dialogue;
- automatic progression through every other part of the lesson;
- validation with clear errors for malformed lesson data;
- migration of the current lesson into the new English-only contract;
- updating the lesson creator system prompt to output valid JSON in this
  contract; and
- continued use of saved audio as a cache outside lesson JSON.

This change does not include:

- runtime ElevenLabs API calls;
- automatic creation or persistence of new audio cache files;
- branching story dialogue;
- lesson editing inside the application; or
- network-loaded lesson catalogs.

## Lesson Contract

Lesson JSON files live in a dedicated lesson-content directory. The filename is
the stable lesson identifier, so the JSON itself does not need an implementation
ID. Array order defines scene and step order. The abbreviated example below
shows the exact field shape for one scene; a valid generated lesson supplies
four to seven additional scenes under the same `scenes` array.

```json
{
  "title": "Helping in Peppa's Playroom",
  "childName": "Bella",
  "goalPhrases": [
    "Can you help me, please?",
    "Thank you!"
  ],
  "summary": "Peppa cannot reach her ball, and her friends help her.",
  "detailedSummary": "Peppa finds her ball on a shelf that is too high to reach. Dolly flies up and brings the ball down after Peppa asks for help. Peppa thanks Dolly, and they happily return to playing.",
  "location": {
    "name": "Peppa's playroom",
    "description": "A bright playroom with a tall toy shelf, a large window, and a soft green rug."
  },
  "scenes": [
    {
      "title": "The High Shelf",
      "settingDescription": "Peppa stands beside the high shelf while Dolly and the user watch.",
      "background": "playroom-day",
      "characters": ["peppa", "dolly", "user"],
      "steps": [
        {
          "speaker": "peppa",
          "dialogue": "Oh! I can't reach it.",
          "emotes": {
            "peppa": "sad",
            "dolly": "listening",
            "user": "listening"
          }
        },
        {
          "speaker": "narrator",
          "dialogue": "Let's ask for help with Dolly!",
          "emotes": {
            "peppa": "listening",
            "dolly": "happy",
            "user": "listening"
          }
        },
        {
          "speaker": "dolly",
          "dialogue": "Can you help me, please?",
          "emotes": {
            "peppa": "listening",
            "dolly": "talking",
            "user": "listening"
          }
        },
        {
          "speaker": "user",
          "dialogue": "Can you help me, please?",
          "emotes": {
            "peppa": "listening",
            "dolly": "listening",
            "user": "talking"
          }
        }
      ]
    }
  ]
}
```

The JSON contains story and performance direction only. It never contains audio
filenames, image filenames, TTS provider settings, voice IDs, cache keys, or
application state-machine details.

## Language and Story Rules

The child-facing lesson is fully immersive in English:

- every character line is English;
- every `user` target line is English;
- every narrator instruction and feedback line is English;
- no Chinese translation, coaching, instruction, feedback, or narration appears
  in lesson JSON or the player UI; and
- parent input to the lesson creator may still be Chinese or English.

Each generated lesson follows the pedagogical shape already established by the
lesson creator prompt:

- exactly two short, useful goal phrases;
- between five and eight scenes;
- one simple location and one short story;
- one short summary plus a lesson-specific detailed summary of about three
  sentences covering the story's situation, action, and happy ending;
- a clear beginning, simple action, and happy ending;
- short beginner-level lines, normally two to seven words;
- narrator-led practice instructions and feedback;
- no more than one retry for each `user` line; and
- one final narrator praise line using the child's name.

The final praise is the final step of the final scene. No review, recap, or
additional activity follows it.

Both summary fields describe only what happens inside the story. They do not
mention teaching, practising, target phrases, learner performance, the user's
English, or generic celebration of learning. The detailed summary must be
specific enough that it would not make sense unchanged in a different lesson.

## Global Visual Catalogs

Characters, emotes, and backgrounds are reusable global data rather than being
redefined by each lesson.

The initial visual character IDs are `peppa`, `dolly`, and `user`. The old
generic IDs `pig` and `parrot` are not used. Additional visible characters may
only appear after they have been added to the global character catalog and their
visual assets have been generated.

`narrator` is a global voice-only speaker. It can own a dialogue step but does
not appear in a scene's visible `characters` array and does not require an emote
asset. Narrator dialogue is presented as narration rather than as an on-stage
character bubble.

The global emote vocabulary is intentionally small:

- `idle`
- `talking`
- `listening`
- `happy`
- `sad`
- `surprised`

Lesson creators cannot invent nuanced synonyms such as `hopeful` or
`encouraging`. Each visible character must have a pre-generated asset for every
supported emote before that character is available to lessons.

The background catalog defines supported background IDs and their pre-generated
visual assets. Each scene contains both a validated background ID and a
free-form `settingDescription`. The ID makes the scene renderable; the
description preserves story context and accessible detail.

Visual asset lookup is owned by the global catalogs or a catalog resolver, not
by lesson JSON.

## Validation Rules

The catalog loader validates all discovered lessons before exposing them to the
player. A lesson is invalid when any of these conditions is true:

- its title, child name, short summary, detailed summary, location name, or
  location description is missing or empty;
- its detailed summary does not contain three sentences;
- it does not contain exactly two non-empty goal phrases;
- it contains fewer than five or more than eight scenes;
- a scene title or setting description is missing or empty;
- a scene background does not exist in the global background catalog;
- a scene has no visible characters or no steps;
- a scene references an unknown global visual character;
- a step has an empty dialogue line or contains Chinese characters;
- a step speaker is neither `narrator` nor one of the scene's visible
  characters;
- a `user` step does not include `user` in the scene's visible characters;
- a step's emote keys do not exactly match the scene's visible character list;
- a step references an emote outside the six-value global vocabulary; or
- a required character/emote visual asset is unavailable.

Validation errors identify the lesson filename, scene index, step index, and
invalid field where applicable. Invalid content must not fail later as an
undefined property or missing image.

## Lesson Creator System Prompt

`docs/lesson-creator-system-prompt.md` remains the source prompt for creating
lessons, but its output instructions and examples change from Markdown to strict
JSON matching the lesson contract above.

The prompt retains its current rules for child age, English difficulty, two goal
phrases, five-to-eight-scene stories, location consistency, retry limit, and
final narrator praise. It expands the current short-summary rule to require both
the existing one-sentence `summary` and a three-sentence, story-only
`detailedSummary`. Neither summary may describe instruction, practice, learner
performance, or language learning. The prompt also receives or embeds the
currently allowed character, emote, and background IDs. Generated lessons may
use only those IDs.

The prompt must explicitly require:

- valid JSON only, with no Markdown fences or commentary;
- a one-sentence `summary` and a three-sentence, lesson-specific
  `detailedSummary` covering only the story's situation, action, and ending;
- one speaker and one dialogue line per step;
- `user` as the learner speaker ID;
- `peppa` and `dolly`, never `pig` and `parrot`;
- `narrator` for English instructions, feedback, and final praise;
- a complete emote map for every visible character on every step;
- only the six supported emotes;
- both a setting description and a supported background ID per scene; and
- English-only child-facing content even when the parent writes in Chinese.

The existing two example lessons are rewritten as valid JSON examples so the
model sees the exact output shape rather than a parallel prose format.

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

The player tracks a selected lesson, scene index, step index, attempt count, and
a small runtime phase. It does not compile scenes back into the old
phrase-oriented `LESSON_STEPS` shape.

For a non-`user` step, including narration:

1. Render the chosen scene background.
2. Render every visible scene character using the complete emote map.
3. Present the step as a character bubble or voice-only narrator caption.
4. Resolve and play saved audio for the dialogue.
5. Advance automatically when playback finishes.

For a `user` step:

1. Render the scene and complete emote map in the same way.
2. Display the dialogue as the target line.
3. Wait for the learner to press and hold the microphone button.
4. Begin recording on press and end recording on release or pointer
   cancellation.
5. Evaluate the recording against the step's dialogue.
6. On success, play the English narrator success feedback and advance
   automatically.
7. On the first failure, play the English narrator retry instruction, replay the
   immediately preceding model line, and return automatically to the same
   `user` step.
8. On the second failure, play the English narrator continuation feedback and
   advance automatically.

Crossing the final step of a scene advances to the first step of the next scene.
Crossing the final step of the final scene completes the lesson. No Next button
is part of normal lesson progression.

Recording supports pointer, touch, and keyboard-accessible press-and-hold
semantics. Releasing outside the button still stops the active recording. The
app never plays character or narrator audio while the learner is recording.

## Scene Presentation

The background comes from the scene's validated background ID, while
`settingDescription` supplies story context and accessible description. The
characters array determines which visual characters are present. The renderer
lays out the complete visible character set consistently and uses the current
step's emote map to choose each pre-generated character visual.

Only a visible active speaker receives an active speech bubble. Narrator steps
use an English narration caption. `user` remains part of the visual character
set and receives the emote declared by the script; the microphone control is an
additional interaction for that character rather than a different data model.

## Audio Boundary

Lesson JSON owns spoken text but never audio locations. The player asks an audio
resolver for speech using structured context such as the speaker and dialogue.
For this change, the resolver uses saved static audio and exact dialogue text.

The migrated lesson must not play existing Chinese prompt or feedback audio.
English narrator lines and feedback needed by the migrated lesson are saved
outside lesson JSON using the existing audio-generation workflow. This is
content migration, not runtime ElevenLabs integration.

If saved audio is missing, the player reports a clear audio-unavailable error and
does not crash or silently skip modeled dialogue. A future resolver can implement
the intended order—saved cache first, ElevenLabs generation second, optional file
cache write last—without changing lesson JSON or the script runner.

## Migration

The current hard-coded lesson is replaced by an English-only scene-script lesson
that follows the lesson creator prompt's story structure. Existing useful English
dialogue may be retained, but Chinese coaching and feedback are not migrated.
Narrator instructions, feedback, and final praise become explicit English
`narrator` steps or runner feedback.

Each spoken line becomes its own step. Learner target lines become
`speaker: "user"` steps. Every step contains the complete six-value-compatible
emote state for the visible characters. The old duration hint does not move into
the lesson file because the new runner progresses according to dialogue playback
and microphone interaction rather than estimated scene seconds.

Current applicable visual and English audio assets are retained through the new
catalog and resolver boundaries. Missing required visual emotes and English
narration cache assets are generated ahead of use. The hard-coded
`LESSON_STEPS` export is removed after all app and test consumers use the catalog.

## Error Handling

- Invalid lesson or catalog data is rejected with a path-specific validation
  error.
- A missing cached dialogue line produces a visible audio-unavailable state.
- A microphone permission or support error remains recoverable on the current
  `user` step.
- Recording cancellation returns to the same `user` step without advancing.
- Evaluation failure preserves the current script position and attempt count.
- Changing lessons cancels pending playback and recording before resetting state.

## Testing

Focused tests cover:

- validation of the complete lesson contract and global catalogs;
- enforcement of one-sentence short summaries and three-sentence detailed
  summaries;
- system-prompt requirements that prohibit summaries about teaching, practice,
  learner performance, or generic language-learning praise;
- enforcement of exactly two goal phrases and five to eight scenes;
- rejection of Chinese child-facing dialogue;
- rejection of `pig`, `parrot`, unsupported speakers, and unsupported emotes;
- enforcement of complete per-step emote maps;
- automatic discovery of lesson JSON files;
- deterministic picker ordering and lesson reset behavior;
- automatic character, narrator, scene, and lesson progression;
- press, hold, release, cancellation, retry, and success behavior for `user`;
- the one-retry maximum and automatic second-failure continuation;
- complete emote-map rendering for every visible scene character;
- narrator-caption rendering;
- exact-text saved-audio resolution and the missing-audio error state;
- absence of Chinese UI, feedback, and audio references in the migrated lesson;
- system-prompt requirements and valid JSON example outputs; and
- migration coverage for every step in the initial lesson.

After focused tests pass, run the existing unit suite, lint, and production build.
