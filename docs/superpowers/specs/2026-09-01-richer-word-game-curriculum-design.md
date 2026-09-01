# Richer JSON Word-Game Curriculum

## Context

The first JSON-driven word-game release proved the content/runtime boundary,
but its presentation is too sparse. Each category currently has only one quiz
per tier, all quiz cards reuse the category cover, and the pinned Noto SVGs
read as simple emoji rather than inviting learner artwork.

The player also has two independent question prompts. It renders an authored
question such as `Cat. Which is the cat?`, but plays the target item's teaching
cue, `This is a cat.`. Both strings come from JSON, but they are different
fields used by different channels, so the visible and spoken instruction can
disagree by design.

## Decisions

### Artwork

Replace Noto with the 3D PNG style from Microsoft's official Fluent Emoji
repository. Fluent 3D is selected because it is materially richer and more
clip-art-like than Noto, covers the existing everyday vocabulary in one
coherent style, and is MIT licensed. The application will vendor exact files
from pinned revision `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`, retain the
upstream license, record upstream paths and SHA-256 values, and never contact
GitHub at runtime.

Custom generated art was considered. It is the only way to leave emoji
semantics completely, but a 96-image pack would require extensive manual
semantic and style curation. It is deferred rather than creating another
unreviewed generation pipeline. OpenMoji remains visibly emoji-like and adds
CC BY-SA attribution/share-alike obligations, so it is not selected.

The 11 Colors items remain native CSS swatches. Ninety-four distinct Fluent
PNG assets cover the other 96 vocabulary records; intentional semantic aliases
such as alligator/crocodile and sofa/couch retain the learner's authored label
and alt text.

### Curriculum density

Every Simple, Intermediate, and Advanced tier will contain three fixed
six-question quizzes. The catalog therefore grows from 27 quizzes and 162
questions to exactly 81 quizzes and 486 questions while retaining the existing
107 vocabulary items.

Each tier keeps its current six-word target set. Its three quizzes are fixed
introduction, practice, and challenge passes with different authored target
orders and distractor neighborhoods. Each word appears once in each pass.
Question order and choice membership remain enumerable; only the four display
positions are shuffled per play-through.

The first target in each quiz is its derived card cover. The compiler requires
the three first targets in a tier to differ, so every tier has three distinct
JSON-driven thumbnails without another `coverItemId` field.

### One visible and spoken question cue

Category packages move to schema version 2. Every vocabulary item owns two
saved cues:

- `labelAudio`: the teaching/answer cue, such as `This is a cat.`
- `promptAudio`: the question cue, such as `Which is the cat?`

Questions contain only `id`, `targetId`, and the fixed four `choiceIds`.
Prompt and success strings are removed from every question. The player renders
`target.promptAudio.text` and plays that exact same cue on entry, question
advance, replay, and Listen again. Choice Listen controls continue to play
`labelAudio`.

Correct feedback is assembled from the JSON-owned generic success cue followed
by `target.labelAudio`; the same two strings are displayed and played. Wrong
feedback similarly combines the selected item's label cue with the JSON-owned
retry cue. Generic success, retry, and completion cue definitions move from
TypeScript to `content/word-games/player.json`, keeping learner content separate
from presentation code.

This adds one saved prompt MP3 for each of the 107 vocabulary items. Existing
label IDs and bytes remain stable. Audio is generated only through the existing
approved ElevenLabs pipeline; local, browser, operating-system, and macOS text
to speech remain forbidden.

## Authored layout

```text
content/word-games/
  player.json
  fluent-3d-assets.json
  categories/*.json
public/assets/word-games/fluent-3d/*.png
public/assets/audio/word-game-*-label.mp3
public/assets/audio/word-game-*-prompt.mp3
third_party/fluentui-emoji-LICENSE
```

An item has this strict shape:

```json
{
  "id": "cat",
  "label": "cat",
  "alt": "A friendly cat.",
  "visual": { "kind": "fluent-3d", "assetId": "1f431" },
  "labelAudio": {
    "id": "word-game-animals-cat-label",
    "text": "This is a cat."
  },
  "promptAudio": {
    "id": "word-game-animals-cat-prompt",
    "text": "Which is the cat?"
  }
}
```

A question has no independent learner-facing copy:

```json
{
  "id": "find-cat",
  "targetId": "cat",
  "choiceIds": ["cat", "dog", "bird", "fish"]
}
```

`player.json` owns the generic saved cues used by every quiz:

```json
{
  "schemaVersion": 1,
  "successAudio": {
    "id": "narrator-feedback-success",
    "text": "Great job!"
  },
  "retryAudio": {
    "id": "word-game-retry",
    "text": "Listen and try again."
  },
  "completeAudio": {
    "id": "word-game-complete",
    "text": "Great listening! You finished the game."
  }
}
```

## Category-page presentation

On large screens, Simple, Intermediate, and Advanced are three sibling columns.
Each tier panel contains three compact quiz cards with a small, distinct Fluent
thumbnail, the pass title, and `6 questions`. On smaller screens, tier panels
stack; quiz cards remain compact and become side by side when the available
width supports it. The category cover appears only once in the page header.

The page keeps one `h1`; tier names remain `h2` headings and quiz titles are
card text rather than repeated document headings. Existing route headers,
shared controls, keyboard order, focus visibility, and learner-safe status
behavior remain unchanged.

## Validation and generation

The compiler must:

- accept only the strict schema-version-2 category contract;
- reject question-level `prompt` or `success` fields;
- validate both item audio IDs/texts and every referenced saved file;
- require three quizzes per tier, six questions per quiz, identical six-target
  membership across a tier's three passes, and three different first targets;
- validate the pinned Fluent repository, revision, MIT license path, public
  root, exact 256×256 PNG files, hashes, and complete used inventory;
- compile prompt and label cues into the runtime/static-audio catalog;
- derive quiz covers from each quiz's first question target;
- keep deterministic generated TypeScript and stale-output gates.

## Testing

Tests will prove behavior rather than source strings:

- parser tests reject the old duplicated prompt/success shape;
- compiler tests reject missing/mismatched prompt audio and invalid Fluent PNG
  provenance;
- curriculum tests assert 9 categories, 81 quizzes, 486 fixed questions, 107
  items, three distinct quiz covers per tier, and no personal names;
- runtime tests assert quiz covers and both audio roles resolve and freeze;
- component/browser tests assert the displayed question equals the captured
  prompt-audio text, correct and wrong feedback match their played sequences,
  all nine quiz cards render with distinct per-tier thumbnails, and compact
  responsive layouts remain keyboard reachable;
- the final gate runs catalog checks, unit tests, lint, build, and the complete
  Playwright suite.

## Non-goals

- No random question selection, progress persistence, unlocks, scoring, timer,
  speech recognition, spelling, or typing.
- No new vocabulary in this iteration; repeated fixed retrieval passes provide
  the requested quiz volume without another art/audio expansion.
- No runtime media CDN, CMS, new dependency, or image-generation service.
- No local, browser, operating-system, or macOS text-to-speech fallback.
- No direct merge into `main`; integration remains pull-request only.
