# Lesson JSON Schema Reference

This document describes the implemented lesson JSON format used by built-in
Parrot Lessons and learner-created My Lessons. It is a writer-facing reference
for the contract enforced in `lib/lesson-data.js` and the playback behavior in
`lib/lesson-state.js` and `lib/lesson-scene.js`.

For a shorter, plain-language introduction, start with the
[Lesson Writing Quick Guide](./lesson-writing-quick-guide.md).

## At a Glance

A lesson contains one or more scenes. Each scene contains an ordered list of
steps. A normal character or narrator step plays automatically. A `user` step
waits for the learner to hold the microphone button and speak.

A user step can work in either of two ways:

- Omit `check` to accept the recording and continue without evaluating it.
- Add `check` to evaluate the recording and play a script-selected response for
  correct, incorrect, or empty input.

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
  check?: Check;
};

type Check = {
  maxAttempts: number;
  correct: Response;
  incorrect: Response;
  incorrectFinal: Response;
  noInput?: Response;
  noInputFinal?: Response;
};

type Response = {
  speaker: "peppa" | "dolly" | "narrator";
  dialogue: string;
  emotes?: Record<string, Emote>;
  after: "retry" | "continue";
};

type Emote =
  | "idle"
  | "talking"
  | "listening"
  | "happy"
  | "sad"
  | "surprised";
```

All required text fields must contain non-whitespace text. The runtime permits
extra metadata fields, but only the core fields above affect playback.

## Root Lesson Object

| Field | Type | Required | Runtime meaning |
| --- | --- | --- | --- |
| `title` | string | Yes | Display name in the lesson catalog and player. |
| `childName` | string | Yes | Learner name associated with the lesson. It does not have to appear in dialogue. |
| `goalPhrases` | string[] | Yes | Zero or more non-empty phrases shown as lesson metadata. They do not need matching user steps. |
| `summary` | string | Yes | Short catalog description. There is no fixed sentence count. |
| `detailedSummary` | string | Yes | Longer description. There is no fixed sentence count. |
| `location` | object | Yes | Display metadata containing `name` and `description`. |
| `scenes` | Scene[] | Yes | One or more playable scenes in order. |

The schema does not impose a language, curriculum structure, fixed number of
goal phrases, or fixed number of scenes.

### Location Object

| Field | Type | Required | Runtime meaning |
| --- | --- | --- | --- |
| `name` | string | Yes | Human-readable location name. |
| `description` | string | Yes | Human-readable location description. |

Location text is metadata. Visual selection is controlled by each scene's
`background` ID.

## Scene Object

| Field | Type | Required | Runtime meaning |
| --- | --- | --- | --- |
| `title` | string | Yes | Scene title shown in the lesson HUD. |
| `settingDescription` | string | Yes | Accessible/free-form description of the scene. |
| `background` | string | Yes | ID from `content/catalogs/backgrounds.json`. |
| `characters` | string[] | Yes | Unique visible character IDs for this scene. The array may be empty. |
| `steps` | Step[] | Yes | One or more steps played in array order. |

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

| Field | Type | Required | Runtime meaning |
| --- | --- | --- | --- |
| `speaker` | speaker ID | Yes | Determines who speaks and whether playback waits for the learner. |
| `dialogue` | string | Yes | Text spoken or targeted by this step. |
| `emotes` | object | No | Partial visible-character emote changes. |
| `check` | Check | No | Evaluation and scripted response rules; valid only on a `user` step. |

### Speaker IDs

| ID | Visual | Behavior |
| --- | --- | --- |
| `peppa` | If listed in `characters` | Plays automatically as a character line. |
| `dolly` | If listed in `characters` | Plays automatically as a character line. |
| `narrator` | Never | Plays automatically as a narrator caption. |
| `user` | Never | Waits for press-and-hold microphone input. |

User lines are flexible. They do not need a preceding model line and do not
need to repeat another speaker's dialogue.

### Unchecked User Step

When a user step omits `check`, the app records while the microphone is held but
does not send the recording for evaluation. Releasing the microphone advances
to the next step.

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
6. While a scripted check response is playing, its emotes are applied on top of
   the current scene state.
7. Moving to another scene resets that scene's characters to `idle` before its
   steps are applied.

Only visible scene characters have rendered emotes. For portable scripts, use
only IDs from the scene's `characters` array as emote keys.

## Check Object

A `check` is allowed only when the enclosing step has `"speaker": "user"`.

| Field | Type | Required | Runtime meaning |
| --- | --- | --- | --- |
| `maxAttempts` | integer 1–5 | Yes | Number of unsuccessful attempts allowed before a final response is selected. |
| `correct` | Response | Yes | Played when evaluation returns `correct`. |
| `incorrect` | Response | Yes | Played after a non-final `incorrect` result. |
| `incorrectFinal` | Response | Yes | Played when an incorrect result reaches `maxAttempts`. |
| `noInput` | Response | No | Played after a non-final empty recording. Falls back to `incorrect`. |
| `noInputFinal` | Response | No | Played when empty input reaches `maxAttempts`. Falls back to `incorrectFinal`. |

Only unsuccessful `incorrect` and `noInput` results increase the attempt count.
A correct result selects `correct` immediately. With `maxAttempts: 1`, the first
unsuccessful result selects a final response.

### Outcome Selection

| Evaluation result | Attempts after result | Selected response |
| --- | --- | --- |
| `correct` | Unchanged | `correct` |
| `incorrect` | Less than `maxAttempts` | `incorrect` |
| `incorrect` | At `maxAttempts` | `incorrectFinal` |
| `noInput` | Less than `maxAttempts` | `noInput`, or `incorrect` when omitted |
| `noInput` | At `maxAttempts` | `noInputFinal`, or `incorrectFinal` when omitted |

If the evaluation service itself fails, no response is selected. The player
shows an error and returns to the same user step.

## Response Object

| Field | Type | Required | Runtime meaning |
| --- | --- | --- | --- |
| `speaker` | `peppa`, `dolly`, or `narrator` | Yes | Character or narrator who delivers the response. `user` is not allowed. |
| `dialogue` | string | Yes | Response text to display and play. |
| `emotes` | object | No | Partial emote changes applied while the response plays. |
| `after` | `retry` or `continue` | Yes | Action taken after response playback finishes. |

The `correct`, `incorrectFinal`, and `noInputFinal` responses must use
`"after": "continue"`. Non-final `incorrect` and `noInput` responses may either
retry or continue.

### `after: "continue"`

The player advances to the next step. If the response followed the final step
of a scene, playback starts the next scene. If there are no more steps, the
lesson finishes. The attempt counter resets.

### `after: "retry"`

When the checked user step has a preceding non-user step, the player replays
that step and then returns to the user step. This is useful for replaying a
model line.

When the checked user step is first, or the preceding step is also a user step,
the player returns directly to the same user step. The unsuccessful attempt
count is preserved.

## Complete Checked-Step Example

This example lets Dolly respond to a correct answer, an ordinary miss, an empty
recording, and a final unsuccessful attempt:

```json
{
  "speaker": "user",
  "dialogue": "Can you help me, please?",
  "emotes": {
    "peppa": "listening",
    "dolly": "listening"
  },
  "check": {
    "maxAttempts": 2,
    "correct": {
      "speaker": "dolly",
      "dialogue": "Yes! Well done!",
      "emotes": {
        "dolly": "happy"
      },
      "after": "continue"
    },
    "incorrect": {
      "speaker": "dolly",
      "dialogue": "Almost. Try again!",
      "after": "retry"
    },
    "incorrectFinal": {
      "speaker": "narrator",
      "dialogue": "Good try. Let's continue.",
      "after": "continue"
    },
    "noInput": {
      "speaker": "narrator",
      "dialogue": "I could not hear you. Try again.",
      "after": "retry"
    },
    "noInputFinal": {
      "speaker": "narrator",
      "dialogue": "That is okay. Let's continue.",
      "after": "continue"
    }
  }
}
```

## Complete Lesson Example

```json
{
  "title": "The Helpful Friend",
  "childName": "Mia",
  "goalPhrases": [
    "Can you help me, please?",
    "Thank you!"
  ],
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
      "characters": [
        "peppa",
        "dolly"
      ],
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
          "dialogue": "Can you help me, please?",
          "check": {
            "maxAttempts": 2,
            "correct": {
              "speaker": "peppa",
              "dialogue": "Wonderful asking!",
              "emotes": {
                "peppa": "happy"
              },
              "after": "continue"
            },
            "incorrect": {
              "speaker": "dolly",
              "dialogue": "Listen once more and try again.",
              "after": "retry"
            },
            "incorrectFinal": {
              "speaker": "narrator",
              "dialogue": "Good try. Let us continue.",
              "after": "continue"
            }
          }
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

## Validation and Draft Repair

There are two related boundaries:

### Playable Lesson Validation

Built-in lessons and saved lessons must contain all required root, location,
scene, and step fields. Validation rejects missing or blank required text,
unknown backgrounds, unknown scene characters, duplicate scene characters,
unsupported speakers, invalid visible emotes, malformed checks, and scenes with
no steps.

Extra metadata is permitted, but the player ignores fields it does not know.

### Generated or Pasted Draft Preparation

Generated and pasted My Lesson scripts pass through a repair step before they
are saved. Recoverable problems produce warnings and safe values:

- Missing display text receives a fallback.
- Missing goal phrases become an empty array.
- Unsupported backgrounds use the first available catalog background.
- Unsupported or duplicate scene characters are removed.
- Unsupported speakers become `narrator`.
- Non-object or blank-dialogue steps are removed.
- Invalid supplied emotes become `idle`; omitted emotes remain omitted.
- A check on a non-user step is removed.
- A malformed check on a user step is removed.
- A scene with no playable steps is removed.

Invalid JSON, input larger than the editor's size limit, and a draft with no
playable dialogue remain fatal.

## Built-in and My Lesson Audio

Lesson JSON never contains audio filenames or voice IDs.

- Built-in Parrot Lessons resolve every non-user step and check response by
  exact speaker plus dialogue text in the static audio catalog.
- My Lessons play non-user steps and check responses with browser device speech.
- User steps never play synthesized or saved speech as the learner's voice.

When adding new built-in dialogue or check responses, add the corresponding
saved audio metadata and assets. This requirement does not apply to My Lessons.

## Author Checklist

- Use valid JSON with no comments or trailing commas.
- Provide every required root, location, scene, and step field.
- Use a background ID from the current catalog.
- Put only visible characters in `characters` and keep IDs unique.
- Use `user` only as a speaker, never as a visible character or emote key.
- Omit `emotes` when nothing changes; use a partial map when one character
  changes.
- Put `check` only on a user step.
- Define `correct`, `incorrect`, `incorrectFinal`, and `maxAttempts` for every
  check.
- Use `continue` for correct and final responses.
- Use `noInput` and `noInputFinal` only when silence needs different wording.
- For built-in lessons, ensure every automatic line and response has saved
  audio.

The generation instructions live in
[`worker/prompts/lesson-generator.ts`](../worker/prompts/lesson-generator.ts).
That exported text is the prompt used at runtime. The catalog files under
`content/catalogs` are the source of truth for currently available background,
character, and emote IDs.
