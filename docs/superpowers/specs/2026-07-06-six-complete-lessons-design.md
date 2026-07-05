# Six Complete Lessons Design

**Date:** 2026-07-06

## Goal

Turn the six unfinished lesson topics into fully playable scene-script lessons.
Each lesson follows the current lesson-creator system prompt, keeps `Bella` as
the child name, reuses the existing visual catalog, and includes saved
ElevenLabs audio for every Peppa, Dolly, and narrator line.

## Scope

This change includes:

- six new English-only JSON lessons;
- exactly two goal phrases and five or six scenes per lesson;
- complete character emotes on every dialogue step;
- automatic catalog discovery for all seven playable lessons;
- removal of the three matching `Coming soon` cards;
- static-audio metadata for every new non-user dialogue line;
- ElevenLabs MP3 generation for every new cache entry; and
- validation, audio-coverage, lint, and build verification.

This change does not include:

- new backgrounds, character sprites, or lesson artwork;
- runtime TTS or changes to the audio-cache architecture;
- changes to speech scoring, retry behavior, authentication, or onboarding;
- new visible characters; or
- dynamic child-name substitution. All six files use `Bella` for now.

## Lesson Lineup

The six lessons use the following story and phrase designs:

1. **Garden Colors** — Peppa, Dolly, and Bella look for a red flower in the
   garden. The goal phrases are `What color is it?` and `It is red.`
2. **Snack Time** — Peppa wants an apple from Dolly's snack basket. The goal
   phrases are `May I have an apple?` and `Here you are!`
3. **Playground Words** — Peppa asks for a turn and the friends choose to play
   together. The goal phrases are `Can I have a turn?` and
   `Let's play together!`
4. **Market Day** — Peppa visits Dolly's fruit stand and buys two apples. The
   goal phrases are `How much is it?` and `I'd like two apples, please.`
5. **Picnic Time** — Dolly offers juice at a picnic and Peppa accepts it. The
   goal phrases are `Would you like some juice?` and `Yes, please!`
6. **Bedtime Story** — Peppa becomes sleepy after a quiet story and says good
   night. The goal phrases are `I'm sleepy.` and `Good night!`

Every lesson tells one small story with a clear beginning, action, and happy
ending. Peppa, Dolly, and `user` are the only visible characters. Narrator
instructions, model lines, user repetitions, and final praise remain separate
steps. The final step is a story-specific narrator line that names Bella.

## Lesson Contract and Prompt Compliance

Each new file under `content/lessons` uses exactly the root, location, scene,
and step keys defined by `docs/lesson-creator-system-prompt.md`. Content is
English-only and uses only the global speaker, character, emote, and background
IDs accepted by the validator.

Each lesson has:

- a story-specific title;
- `childName: "Bella"`;
- exactly two goal phrases;
- a one-sentence story summary;
- a three-sentence story-specific detailed summary;
- one consistent main location;
- five or six scenes;
- at least one user speaking turn for each goal phrase; and
- one final narrator praise line containing `Bella`.

The practice model immediately before a user turn uses the same dialogue text
as the user target. Spoken lines stay short and concrete for a five-year-old
beginner. Runtime feedback remains outside the lesson files.

## Visual Reuse

No image files or catalog entries are added. The new lessons select from the
existing backgrounds:

- `episode-garden` for Garden Colors and Market Day;
- `meadow-day` for Snack Time, Playground Words, and Picnic Time;
- `meadow-evening` for Bedtime Story.

Each lesson keeps the same background in every scene so its main location stays
visually consistent. The `reward` background is not used by these six stories.

Scene setting descriptions carry topic-specific objects such as flowers,
snacks, playground equipment, a market stand, picnic items, and bedtime props.
These descriptions preserve story and accessibility context even when the
reused background is generic.

## Catalog and Ordering

The existing Vite glob continues to discover lesson files automatically. The
seven files receive numeric filename prefixes so their deterministic order is:

1. Peppa's High Ball
2. Garden Colors
3. Snack Time
4. Playground Words
5. Market Day
6. Picnic Time
7. Bedtime Story

The current `peppas-high-ball.json` file is renamed with the `01-` prefix; the
six new files use `02-` through `07-`. Lesson IDs are filename-derived and are
not persisted externally, so the ordering change does not require a data
migration. `LessonList` renders the seven discovered entries and removes the
three hard-coded Market Day, Picnic Time, and Bedtime Story preview cards.

## Static Audio

Lesson JSON remains free of audio filenames and provider settings. Every unique
non-user `(speaker, dialogue)` pair resolves through `lib/static-audio.js`.
Existing exact matches such as `Here you are!`, common copy instructions, and
shared feedback are reused rather than generated twice.

New metadata entries use:

- `speaker: "peppa"`, `"dolly"`, or `"narrator"`;
- `lang: "en-US"`;
- one stable, descriptive MP3 filename;
- visible `text` that exactly matches lesson dialogue; and
- `style: "character"` for Peppa and Dolly lines.

Missing files are generated with the existing
`scripts/generate-static-audio.mjs` ElevenLabs path, the project's configured
character-directed voices, and the preferred `eleven_v3` model. The script is
run only for the new IDs. Generation never uses local or macOS system speech.

If ElevenLabs fails for an ID, that ID remains explicitly reported as missing;
the work is not described as fully playable until every referenced MP3 exists.

## Validation and Tests

The catalog test expects the seven numerically ordered lesson IDs and validates
every JSON file through the existing lesson validator. Additional assertions
cover the approved title, child name, goal phrases, and final Bella-specific
praise for each new lesson.

The static-audio coverage test loads every discovered lesson rather than only
Peppa's High Ball. It requires each non-user dialogue line to resolve by exact
speaker and text and requires the referenced MP3 to exist. It also preserves
the no-duplicate `(speaker, text)` cache rule.

Verification runs in this order:

1. focused catalog and static-audio tests;
2. all lesson data, state, scene, and audio tests;
3. the full Node test suite;
4. ESLint; and
5. the TypeScript and Vite production build.

## Risks and Controls

- **Large audio batch:** Reusing identical speaker/text pairs and generating
  only new IDs limits unnecessary ElevenLabs requests.
- **Text/audio mismatch:** Exact speaker-and-text lookup plus whole-catalog
  coverage catches punctuation or wording drift.
- **Generic reused art:** Topic-specific setting descriptions make the story
  coherent while the user-requested no-new-images constraint remains in place.
- **Protected-character voice imitation:** Audio uses the project's existing
  character-directed voice configuration and does not attempt an exact voice
  clone.
- **Lesson prompt drift:** All six files are checked against both the runtime
  validator and the explicit constraints in the lesson-creator system prompt.
