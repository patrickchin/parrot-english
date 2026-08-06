# Lesson Writing Quick Guide

This is the short, non-technical guide for creating a Parrot English lesson.
Custom lessons use the app's GUI editor after AI generation or JSON import, so
you do not need to edit JSON by hand. For every validation rule and field, or
for preparing an import or built-in lesson file, see the
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
8. **Speaking checks:** Which child lines should be checked, and what should
   happen when the child says them correctly or incorrectly?

There is no required number of goal phrases or scenes. A lesson only needs at
least one scene with at least one spoken line.

## Build the Story Visually

The lesson studio keeps the story itself in the foreground:

1. Use the **Storyboard** strip to choose a scene. Each thumbnail shows its
   background and on-stage characters.
2. Watch the **Live scene preview** while you work. It shows the selected
   dialogue line, speaker, character moods, and background together.
3. Choose backgrounds, characters, and moods from illustrated cards. You do
   not need to remember catalog IDs.
4. Use the **Dialogue timeline** below the preview to choose the line you want
   to edit. Add, remove, or move lines to change playback order.
5. Open **Scene title and notes**, **Lesson setup and goals**, or speaking
   feedback only when you need their text fields. These details are kept out of
   the main visual workflow but remain fully editable.

On a phone, swipe the storyboard sideways; the live preview appears above the
controls for the selected scene.

## What the GUI Edits

The editor labels these concepts in plain language. The field names below are
also useful when importing JSON or maintaining a built-in lesson.

| Information | Where it goes | Example |
| --- | --- | --- |
| Lesson name | `title` | `"The Helpful Friend"` |
| Child's name | `childName` | `"Mia"` |
| Practice phrases | `goalPhrases` | `["Can you help me?"]` |
| Short description | `summary` | `"Peppa asks Dolly for help."` |
| Longer description | `detailedSummary` | `"Peppa needs help reaching her ball."` |
| Location name and description | `location` | Garden and a short description |
| Story sections | `scenes` | One object for each scene |
| Scene picture | A scene's `background` | `"episode-garden"` |
| Visible characters | A scene's `characters` | `["peppa", "dolly"]` |
| Spoken lines | A scene's `steps` | One step for each line |
| Who says a line | A step's `speaker` | `"dolly"` or `"user"` |
| The words spoken | A step's `dialogue` | `"Can you help me?"` |
| Character expression changes | A step's optional `emotes` | `{ "dolly": "happy" }` |
| Speaking result responses | A user step's optional `check` | Correct and incorrect replies |

## Speaker Choices

- `peppa`: Peppa speaks.
- `dolly`: Dolly speaks.
- `user`: The child is asked to speak into the microphone.
- `narrator`: A voice-only narrator speaks.

Only Peppa and Dolly are visible. Put the visible characters for a scene in its
`characters` list. Never put `user` or `narrator` in that list.

## Background Choices

Choose one illustrated background card for each scene. Imported JSON uses the
matching ID:

- `episode-garden`
- `meadow-day`
- `meadow-evening`
- `reward`

## Character Expressions

Choose a character portrait to change that character's mood for the selected
dialogue line. Imported JSON stores the choice in `emotes`:

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

### No Speaking Check

Omit `check` when the child should speak without being graded. The lesson
continues when the child releases the microphone.

```json
{
  "speaker": "user",
  "dialogue": "Thank you!"
}
```

### With a Speaking Check

Add `check` when the app should listen and choose a response:

- `maxAttempts`: How many unsuccessful tries are allowed, from 1 to 5.
- `correct`: What someone says when the answer is correct.
- `incorrect`: What someone says before the final unsuccessful try.
- `incorrectFinal`: What someone says on the final unsuccessful try.
- `noInput`: Optional special reply when nothing was heard.
- `noInputFinal`: Optional final reply when nothing was heard.

Each reply chooses:

- `speaker`: Peppa, Dolly, or narrator.
- `dialogue`: What that speaker says.
- `after`: `retry` to try again or `continue` to move on.
- `emotes`: Optional expression changes.

Correct and final replies must use `"after": "continue"`.

## Small Complete Example

```json
{
  "title": "Ask for Help",
  "childName": "Mia",
  "goalPhrases": [
    "Can you help me?"
  ],
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
      "characters": [
        "peppa",
        "dolly"
      ],
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
          "dialogue": "Can you help me?",
          "check": {
            "maxAttempts": 2,
            "correct": {
              "speaker": "peppa",
              "dialogue": "Great asking!",
              "emotes": {
                "peppa": "happy"
              },
              "after": "continue"
            },
            "incorrect": {
              "speaker": "dolly",
              "dialogue": "Listen and try again.",
              "after": "retry"
            },
            "incorrectFinal": {
              "speaker": "narrator",
              "dialogue": "Good try. Let us continue.",
              "after": "continue"
            }
          }
        }
      ]
    }
  ]
}
```

## Where to Put the Lesson

### My Lesson

Choose **Create a Lesson** on the Home page. You can also use the Create action
in **Lessons → My lessons**. Use **Make with AI** for the simple topic flow, or
**Import JSON** to bring in a complete script. Both paths open the same GUI
editor, where you can change lesson details, scenes, backgrounds, characters,
speakers, dialogue, expressions, and speaking checks without editing raw JSON.
Start with the storyboard and live preview, then expand lesson setup, scene
notes, or speaking feedback only when needed. Review any warnings and save the
lesson. My lessons use the device's available speech voice, so no audio files
are needed.

### Built-in Parrot Lesson

Save the JSON as its own file in `content/lessons`. Built-in automatic lines
and speaking-check replies need matching saved audio entries and files under
`public/assets/audio`.

Useful locations:

- Lesson files: `content/lessons`
- Available backgrounds: `content/catalogs/backgrounds.json`
- Available characters: `content/catalogs/characters.json`
- Available expressions: `content/catalogs/emotes.json`
- Full technical reference: `docs/lesson-json-schema.md`
- Lesson generator instructions: `worker/prompts/lesson-generator.ts`

## Final Check

Before saving, confirm:

- The lesson has a name, child name, summaries, location, and at least one
  scene.
- Every scene has a supported background and at least one step.
- Every step has a speaker and dialogue.
- `user` and `narrator` are not listed as visible characters.
- Every `check` is attached to a `user` step.
- Correct and final replies continue rather than retry.
- If you are importing or maintaining a JSON file, it has no comments or
  trailing commas.
