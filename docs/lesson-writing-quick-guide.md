# Lesson Writing Quick Guide

This is the short, non-technical guide for writing a built-in Parrot English
lesson. For every validation rule and field, see the
[Lesson JSON Schema Reference](./lesson-json-schema.md).

## What You Need Before You Start

Decide these things first:

1. **Lesson name:** What should appear on the lesson card?
2. **Child's name:** Who is the lesson for?
3. **Goal phrases:** What useful phrases should the child practise? This list
   can be empty.
4. **Story summary:** What happens in the lesson?
5. **Location:** Where does the lesson happen?
6. **Scenes:** What happens first, next, and last?
7. **Speakers:** Who says each line: Peppa, Dolly, the child, or the narrator?
8. **Join-in lines:** Which short phrases should the child be invited to say
   along with the group?

There is no required number of goal phrases or scenes. A lesson only needs at
least one scene with at least one spoken line.

## Plan the Story

Keep the story itself in the foreground:

1. Give each scene one background and a small on-stage character set.
2. Put dialogue in playback order, including any learner join-in line.
3. Add an emote only when a character changes expression.
4. Put each join-in line directly after the matching character line.
5. Review the scene as a short, continuous cartoon episode before checking it
   in.

## What the JSON Stores

The field names below describe every checked-in lesson file.

| Information                   | Where it goes                  | Example                                 |
| ----------------------------- | ------------------------------ | --------------------------------------- |
| Lesson name                   | `title`                        | `"The Helpful Friend"`                  |
| Child's name                  | `childName`                    | `"Mary"`                                |
| Practice phrases              | `goalPhrases`                  | `["Can you help me?"]`                  |
| Short description             | `summary`                      | `"Peppa asks Dolly for help."`          |
| Longer description            | `detailedSummary`              | `"Peppa needs help reaching her ball."` |
| Location name and description | `location`                     | Garden and a short description          |
| Story sections                | `scenes`                       | One object for each scene               |
| Scene picture                 | A scene's `background`         | `"episode-garden"`                      |
| Visible characters            | A scene's `characters`         | `["peppa", "dolly"]`                    |
| Spoken lines                  | A scene's `steps`              | One step for each line                  |
| Who says a line               | A step's `speaker`             | `"dolly"` or `"user"`                   |
| The words spoken              | A step's `dialogue`            | `"Can you help me?"`                    |
| Character expression changes  | A step's optional `emotes`     | `{ "dolly": "happy" }`                  |

## Speaker Choices

- `peppa`: Peppa speaks.
- `dolly`: Dolly speaks.
- `user`: The child sees an ungraded join-in phrase and may speak along.
- `narrator`: A voice-only narrator speaks.

Only Peppa and Dolly are visible. Put the visible characters for a scene in its
`characters` list. Never put `user` or `narrator` in that list.

## Background Choices

Choose one supported background ID for each scene:

- `episode-garden`
- `meadow-day`
- `meadow-evening`
- `reward`

## Character Expressions

Use `emotes` to change a character's mood for a dialogue line:

- `idle`
- `talking`
- `listening`
- `happy`
- `sad`
- `surprised`

Only list expressions that change. If `emotes` is omitted, the characters keep
their current expressions. At the beginning of a new scene, everyone starts as
`idle`.

## When the Child Speaks

Use `"speaker": "user"` for a child speaking turn.

The app shows the exact phrase, plays a quiet group cue, and continues the
story. It does not score, correct, retry, or treat silence as failure. When a
Guardian has enabled lesson recordings, the app may privately save the short
join-in beat; recording availability or failure never changes lesson progress.

```json
{
  "speaker": "user",
  "dialogue": "Thank you!"
}
```

## Small Complete Example

```json
{
  "title": "Ask for Help",
  "childName": "Mary",
  "goalPhrases": ["Can you help me?"],
  "summary": "Peppa asks Dolly for help.",
  "detailedSummary": "Peppa needs help reaching her ball.",
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
          "speaker": "dolly",
          "dialogue": "Can you help me?",
          "emotes": {
            "dolly": "talking",
            "peppa": "listening"
          }
        },
        {
          "speaker": "user",
          "dialogue": "Can you help me?"
        }
      ]
    }
  ]
}
```

## Where to Put the Lesson

Save the JSON as its own file in `content/lessons`. Built-in automatic lines
and join-in group cues need matching saved audio entries and files under
`public/assets/audio`.

Useful locations:

- Lesson files: `content/lessons`
- Available backgrounds: `content/catalogs/backgrounds.json`
- Available characters: `content/catalogs/characters.json`
- Available expressions: `content/catalogs/emotes.json`
- Full technical reference: `docs/lesson-json-schema.md`

## Final Check

Before checking in the lesson, confirm:

- The lesson has a name, child name, summaries, location, and at least one
  scene.
- Every scene has a supported background and at least one step.
- Every step has a speaker and dialogue.
- `user` and `narrator` are not listed as visible characters.
- Every `user` step contains one short phrase the learner may say along with
  the group.
- The JSON file has no comments or trailing commas.
