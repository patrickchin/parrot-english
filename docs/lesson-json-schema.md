# Lesson JSON Schema Reference

This document describes the implemented JSON format for built-in Parrot
Lessons. It is a writer-facing reference for the contract enforced in
`lib/lesson-data.js` and the playback behavior in `lib/lesson-state.js` and
`lib/lesson-scene.js`.

For a shorter, plain-language introduction, start with the
[Lesson Writing Quick Guide](./lesson-writing-quick-guide.md).

## At a Glance

A lesson contains one or more scenes. Each scene contains an ordered list of
steps. A normal character or narrator step plays automatically. A `user` step
is an ungraded join-in beat: the app shows its exact phrase, plays a quiet group
cue, and continues without scoring, correction, or retry branching. With
Guardian consent, the app may also save the learner's short recording without
changing playback progress.

Emote maps are optional and partial. Every visible character starts a scene as
`idle`. A later step changes only the emotes it lists; all other visible
characters keep their current emotes.

## Conceptual Type

The core JSON shape is equivalent to this TypeScript-style definition:

```ts
type Lesson = {
  title: string;
  childName: string;
  goalPhrases: string[];
  summary: string;
  detailedSummary: string;
  location: {
    name: string;
    description: string;
  };
  scenes: Scene[];
};

type Scene = {
  title: string;
  settingDescription: string;
  background: string;
  characters: string[];
  steps: Step[];
};

type Step = {
  speaker: "peppa" | "dolly" | "user" | "narrator";
  dialogue: string;
  emotes?: Record<string, Emote>;
};

type Emote = "idle" | "talking" | "listening" | "happy" | "sad" | "surprised";
```

All required text fields must contain non-whitespace text. The runtime permits
extra metadata fields, but only the core fields above affect playback.

## Root Lesson Object

| Field             | Type     | Required | Runtime meaning                                                                                |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| `title`           | string   | Yes      | Display name in the lesson catalog and player.                                                 |
| `childName`       | string   | Yes      | Learner name associated with the lesson. It does not have to appear in dialogue.               |
| `goalPhrases`     | string[] | Yes      | Zero or more non-empty phrases shown as lesson metadata. They do not need matching user steps. |
| `summary`         | string   | Yes      | Short catalog description. There is no fixed sentence count.                                   |
| `detailedSummary` | string   | Yes      | Longer description. There is no fixed sentence count.                                          |
| `location`        | object   | Yes      | Display metadata containing `name` and `description`.                                          |
| `scenes`          | Scene[]  | Yes      | One or more playable scenes in order.                                                          |

The schema does not impose a language, curriculum structure, fixed number of
goal phrases, or fixed number of scenes.

### Location Object

| Field         | Type   | Required | Runtime meaning                      |
| ------------- | ------ | -------- | ------------------------------------ |
| `name`        | string | Yes      | Human-readable location name.        |
| `description` | string | Yes      | Human-readable location description. |

Location text is metadata. Visual selection is controlled by each scene's
`background` ID.

## Scene Object

| Field                | Type     | Required | Runtime meaning                                                      |
| -------------------- | -------- | -------- | -------------------------------------------------------------------- |
| `title`              | string   | Yes      | Scene title shown in the lesson HUD.                                 |
| `settingDescription` | string   | Yes      | Accessible/free-form description of the scene.                       |
| `background`         | string   | Yes      | ID from `content/catalogs/backgrounds.json`.                         |
| `characters`         | string[] | Yes      | Unique visible character IDs for this scene. The array may be empty. |
| `steps`              | Step[]   | Yes      | One or more steps played in array order.                             |

The currently supported background IDs are:

- `episode-garden`
- `meadow-day`
- `meadow-evening`
- `reward`

The currently supported visible character IDs are:

- `peppa`
- `dolly`

`user` and `narrator` are non-visual speaker IDs. Do not put either one in a
scene's `characters` array.

A supported character can speak without being listed in `characters`. Include
the character in `characters` when its sprite or emote changes should be
visible.

## Step Object

| Field      | Type       | Required | Runtime meaning                                                   |
| ---------- | ---------- | -------- | ----------------------------------------------------------------- |
| `speaker`  | speaker ID | Yes      | Selects automatic playback or an ungraded learner join-in beat.   |
| `dialogue` | string     | Yes      | Text spoken by a character or shown for the learner to join in.   |
| `emotes`   | object     | No       | Partial visible-character emote changes.                          |

### Speaker IDs

| ID         | Visual                    | Behavior                                         |
| ---------- | ------------------------- | ------------------------------------------------ |
| `peppa`    | If listed in `characters` | Plays automatically as a character line.         |
| `dolly`    | If listed in `characters` | Plays automatically as a character line.         |
| `narrator` | Never                     | Plays automatically as a narrator caption.       |
| `user`     | Never                     | Shows and plays an ungraded learner join-in beat. |

User lines are flexible. They do not need a preceding model line and do not
need to repeat another speaker's dialogue.

### User Join-in Step

A user step always advances after its fixed join-in beat. The learner may say
the displayed phrase with the group, but the app does not evaluate the audio or
wait for a successful response. Recording occurs only when a Guardian has
enabled it, and capture or storage failures do not block the story.

```json
{
  "speaker": "user",
  "dialogue": "Thank you!"
}
```

### Emote Maps

An `emotes` object maps visible character IDs to supported emote IDs:

```json
{
  "speaker": "dolly",
  "dialogue": "Here you are!",
  "emotes": {
    "dolly": "talking",
    "peppa": "happy"
  }
}
```

Supported emotes are:

- `idle`
- `talking`
- `listening`
- `happy`
- `sad`
- `surprised`

Emote resolution follows these rules:

1. At the beginning of every scene, each visible character is `idle`.
2. Steps are applied in order through the current step.
3. A listed emote replaces that character's current emote.
4. An omitted character keeps its previous emote.
5. An omitted `emotes` object changes nothing.
6. Moving to another scene resets that scene's characters to `idle` before its
   steps are applied.

Only visible scene characters have rendered emotes. For portable scripts, use
only IDs from the scene's `characters` array as emote keys.

## Complete Lesson Example

```json
{
  "title": "The Helpful Friend",
  "childName": "Mary",
  "goalPhrases": ["Can you help me, please?", "Thank you!"],
  "summary": "Peppa asks Dolly for help.",
  "detailedSummary": "Peppa needs help reaching a ball, and Dolly helps her.",
  "location": {
    "name": "Garden",
    "description": "A sunny garden with a tall tree."
  },
  "scenes": [
    {
      "title": "The High Ball",
      "settingDescription": "Peppa and Dolly stand below a ball in a tree.",
      "background": "episode-garden",
      "characters": ["peppa", "dolly"],
      "steps": [
        {
          "speaker": "peppa",
          "dialogue": "My ball is up high!",
          "emotes": {
            "peppa": "sad",
            "dolly": "listening"
          }
        },
        {
          "speaker": "dolly",
          "dialogue": "Can you help me, please?",
          "emotes": {
            "dolly": "talking"
          }
        },
        {
          "speaker": "user",
          "dialogue": "Can you help me, please?"
        },
        {
          "speaker": "dolly",
          "dialogue": "I can help!",
          "emotes": {
            "dolly": "happy"
          }
        },
        {
          "speaker": "user",
          "dialogue": "Thank you!"
        }
      ]
    }
  ]
}
```

## Playable Lesson Validation

Built-in lessons must contain all required root, location, scene, and step
fields. Validation rejects missing or blank required text, unknown backgrounds,
unknown scene characters, duplicate scene characters, unsupported speakers,
invalid visible emotes, and scenes with no steps.

Extra metadata is permitted, but the player ignores fields it does not know.

## Built-in Lesson Audio

Lesson JSON never contains audio filenames or voice IDs.

- Built-in Parrot Lessons resolve every non-user step by exact speaker plus
  dialogue text in the static audio catalog.
- Each user step resolves a separate saved group cue by exact dialogue text;
  the app never substitutes synthesized or saved speech as the learner's voice.

When adding automatic dialogue or a new join-in phrase, add the corresponding
saved audio metadata and assets.

## Author Checklist

- Use valid JSON with no comments or trailing commas.
- Provide every required root, location, scene, and step field.
- Use a background ID from the current catalog.
- Put only visible characters in `characters` and keep IDs unique.
- Use `user` only as a speaker, never as a visible character or emote key.
- Omit `emotes` when nothing changes; use a partial map when one character
  changes.
- Keep every user step short and suitable for an ungraded join-in beat.
- For built-in lessons, ensure every automatic line and join-in cue has saved
  audio.

The catalog files under `content/catalogs` are the source of truth for currently
available background, character, and emote IDs.
