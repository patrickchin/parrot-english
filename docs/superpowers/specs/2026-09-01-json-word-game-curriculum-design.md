# JSON-Driven Word-Game Curriculum

## Context

The current word-game experience is a listening-first picture game with six
hard-coded TypeScript topics, six rounds per topic, three answer choices per
round, and 110 checked-in narrator clips. Five topics use AI-generated artwork
published to immutable R2 URLs; colors use native swatches. The UI and playback
behavior are reusable, but curriculum, round construction, media identity, and
presentation are coupled in `src/games/word-game-catalog.ts`.

The nursery-rhyme system now provides the repository precedent for authored
JSON packages, strict validation, deterministic generated TypeScript, and
build-time stale-catalog checks. Word games will follow that boundary while
remaining materially smaller than the nursery compiler.

This design replaces every generated word-game card with consistent Google
Noto Emoji SVG artwork. Native color swatches remain native because a solid
swatch is the clearest representation of a color and is not generated art.

## Decisions

Three approaches were considered:

1. **Directly import one large JSON file.** This is the fewest lines, but a
   single growing file is difficult to review and cannot safely validate
   cross-file artwork, audio, or route references.
2. **Compile strict per-category JSON packages.** This is selected. It reuses
   the nursery-rhyme architecture, keeps each category independently editable,
   and fails the build before malformed or incomplete learner content ships.
3. **Fetch runtime JSON or add a content service.** This adds deployment,
   caching, failure, and trust-boundary complexity without serving the current
   requirement. It is out of scope.

Question selection is fixed. The only runtime randomness is a Fisher-Yates
shuffle of the four already-authored answer IDs for a question. Tests and
authors can therefore enumerate every question and every possible answer while
learners do not see the correct answer in a predictable position.

## Goals

- Make JSON the complete source of truth for word-game categories, tiers,
  quizzes, vocabulary items, question order, fixed answer sets, prompts,
  feedback, accessibility text, and media references.
- Turn the existing six games into categories containing tiered fixed quizzes.
- Add Home, Clothes, and Transport as daily-life categories.
- Ship Simple, Intermediate, and Advanced quizzes in every category.
- Keep exactly six fixed questions in every initial quiz and exactly four fixed
  possible answers for every question.
- Shuffle only answer positions, once at the beginning of a play-through and
  again when the learner chooses Play again.
- Replace all existing generated bitmap cards with consistent, vendored Noto
  SVG artwork at a pinned upstream revision.
- Preserve native swatches for colors.
- Preserve listening-first play, separate non-selecting Listen controls,
  helpful wrong-answer feedback, automatic correct-answer progression,
  cancellation, focus, errors, and completion behavior.
- Reduce authored speech from three saved clips per vocabulary item to one
  reusable teaching/pronunciation clip per item plus existing generic success,
  retry, and completion cues.
- Preserve every usable existing `word-game-*-label.mp3` file and stable ID.
- Fail the content check when a referenced SVG or saved audio file is missing,
  unsafe, stale, or internally inconsistent.
- Prove through a package-flow test that changing category JSON changes the
  generated runtime catalog without editing React or runtime catalog code.

## Non-goals

- Randomly selecting questions, distractors, tiers, or quizzes.
- Progress persistence, unlock rules, scoring, timers, lives, penalties,
  leaderboards, speech recognition, spelling, or typing.
- A runtime CMS, remote JSON fetch, new database table, or new dependency.
- Hotlinking Noto, Wikimedia, Openverse, or other third-party media.
- Using browser, operating-system, macOS, or local text-to-speech.
- Publishing or deleting existing R2 objects. The old v8 word-game objects may
  remain remotely unreferenced.
- Treating missing audio as an acceptable visual-only fallback for a released
  quiz.

## Initial Curriculum Scope

The initial release contains 9 categories, 27 quizzes, 162 fixed question
instances, and 107 unique vocabulary items. Each category has one six-question
quiz in each of three ordered tiers. Familiar words deliberately recur across
tiers for retrieval practice; later tiers introduce three new words at a time.

| Category | Simple | Intermediate | Advanced |
| --- | --- | --- | --- |
| Animals | cat, dog, bird, fish, duck, frog | cat, dog, bird, pig, cow, horse | pig, cow, horse, alligator, elephant, giraffe |
| Colors | red, blue, yellow, green, orange, purple | red, blue, yellow, black, white, pink | black, white, pink, brown, gray, purple |
| Body Parts | eyes, ears, nose, mouth, hand, foot | eyes, ears, hand, arm, leg, tooth | arm, leg, tooth, tongue, brain, heart |
| Food | apple, banana, carrot, orange, bread, cheese | apple, banana, bread, rice, egg, milk | rice, egg, milk, tomato, potato, sandwich |
| Toys | ball, toy car, doll, kite, blocks, teddy bear | ball, doll, blocks, toy train, drum, puzzle | toy train, drum, puzzle, robot, yo-yo, skateboard |
| Feelings | happy, sad, angry, sleepy, surprised, silly | happy, sad, sleepy, scared, excited, calm | scared, excited, calm, worried, confused, bored |
| Home | bed, chair, door, window, house, key | bed, chair, door, sofa, bathtub, toilet | sofa, bathtub, toilet, shower, mirror, broom |
| Clothes | shirt, shoes, hat, socks, coat, pants | shirt, shoes, hat, dress, shorts, scarf | dress, shorts, scarf, boots, gloves, swimsuit |
| Transport | car, bus, bicycle, train, boat, airplane | car, bus, train, taxi, truck, scooter | taxi, truck, scooter, helicopter, motorcycle, rocket |

The Body Parts and Feelings progressions intentionally use concepts with clear
Noto representations. The Clothes category includes wearable items only. Toy
car, doll, and blocks retain their existing learner-facing words and audio;
their Noto representations are a car, nesting dolls, and bricks respectively.
Alt text names what the learner is intended to identify rather than exposing
the upstream emoji name.

### Fixed Answer Sets

Every quiz JSON explicitly stores six questions and every question explicitly
stores four answer IDs. For a quiz whose ordered target IDs are
`[a, b, c, d, e, f]`, the initial authored answer sets use this reviewable
pattern:

| Question target | Authored answer IDs |
| --- | --- |
| `a` | `[a, b, c, d]` |
| `b` | `[b, c, d, e]` |
| `c` | `[c, d, e, f]` |
| `d` | `[d, e, f, a]` |
| `e` | `[e, f, a, b]` |
| `f` | `[f, a, b, c]` |

The first authored ID is the target for readability, but no authored position
is shown directly. The runtime copies and shuffles the four IDs before resolving
them to answer records. The compiler rejects any question whose target is not
first, whose IDs are not unique, or whose answer does not belong to the same
category.

## Authored File Layout

```text
content/word-games/
  noto-assets.json
  categories/
    animals.json
    body-parts.json
    clothes.json
    colors.json
    feelings.json
    food.json
    home.json
    toys.json
    transport.json
public/assets/word-games/noto/
  emoji_u1f431.svg
  ...
third_party/noto-emoji-svg-LICENSE
THIRD_PARTY_NOTICES.md
```

`noto-assets.json` pins the official repository URL, full 40-character commit,
Apache-2.0 SVG license, upstream license path, and an ordered asset inventory.
Each inventory record contains a lowercase codepoint ID, upstream path, local
public path, and lowercase SHA-256. Multiple vocabulary items may reference one
asset without duplicating the SVG.

The pinned initial revision is
`8998f5dd683424a73e2314a8c1f1e359c19e8742`. Assets come only from the
revision's `svg/` directory and retain its exact license text. The application
never contacts GitHub at runtime.

### Category JSON Contract

Each category file has this strict shape:

```json
{
  "schemaVersion": 1,
  "order": 1,
  "id": "animals",
  "title": "Animals",
  "description": "Listen and find the animals.",
  "theme": "sky",
  "coverItemId": "cat",
  "items": [
    {
      "id": "cat",
      "label": "cat",
      "alt": "A friendly cat.",
      "visual": { "kind": "noto-svg", "assetId": "1f431" },
      "audio": {
        "id": "word-game-animals-cat-label",
        "text": "This is a cat."
      }
    }
  ],
  "tiers": [
    {
      "id": "simple",
      "title": "Simple",
      "description": "Start with familiar animal words.",
      "quizzes": [
        {
          "id": "simple-1",
          "title": "First animals",
          "description": "Six familiar animal words.",
          "questions": [
            {
              "id": "find-cat",
              "targetId": "cat",
              "choiceIds": ["cat", "dog", "bird", "fish"],
              "prompt": "Cat. Which picture is the cat?",
              "success": "Great job! This is a cat."
            }
          ]
        }
      ]
    }
  ]
}
```

Color items replace `visual` with
`{ "kind": "swatch", "color": "#ef4444" }`. No other visual kinds exist in
schema version 1.

Array position is canonical within a category. Only category files have an
explicit `order` because filesystem discovery is unordered. IDs and authored
copy are never derived from English labels. Audio sources and local Noto URLs
are safe mechanical derivations from validated JSON.

## Compiler and Generated Catalog

Add a deliberately small word-game compiler:

```text
scripts/word-game/manifest.mjs
scripts/word-game/compiler.mjs
scripts/generate-word-game-catalog.mjs
src/games/generated-word-game-catalog.ts
```

The compiler:

1. Reads only regular, non-symlink `.json` files directly beneath
   `content/word-games/categories`.
2. Parses every object with strict Zod schemas.
3. Validates cross-record and asset invariants.
4. Confirms every referenced audio file and Noto SVG exists as a regular file
   within its approved root.
5. Confirms every Noto SVG hash matches `noto-assets.json` and every listed SVG
   is used by at least one vocabulary item.
6. Produces JSON-compatible runtime literals sorted by category `order`, then
   category ID; all nested authored order is preserved.
7. Serializes one generated TypeScript constant with a generated-file warning.
8. Writes atomically in generate mode and reports a focused stale diagnostic in
   `--check` mode without writing.

The runtime catalog remains a small TypeScript facade. It imports generated
literals, normalizes and deep-freezes them, derives safe local asset/audio URLs,
exports types, resolves categories/quizzes, builds routes, flattens audio, and
constructs shuffled rounds. It contains no learner curriculum copy or item
inventory.

### Validation Invariants

- Every object is strict; unknown fields fail.
- IDs are lowercase kebab-case and text fields are non-empty after trimming.
- A category filename and `id` must match.
- Category IDs and positive `order` values are globally unique.
- Tier IDs are unique within a category; quiz IDs are unique across a category;
  question IDs are unique within a quiz; item IDs are unique within a category.
- Every initial category has exactly the ordered tier IDs `simple`,
  `intermediate`, and `advanced`.
- Every initial tier contains one quiz. The schema permits additional fixed
  quizzes later without a code change.
- Every quiz has exactly six questions.
- Every question has exactly four unique choice IDs, with `targetId` first.
- Every reference resolves within its category, every question target appears
  once, and every item is used as a target in at least one quiz.
- Audio IDs begin with `word-game-<category>-`, are globally unique by ID, and
  conflicting text for one ID fails. Reuse of the same item audio across
  questions is expected.
- Referenced audio files must be regular `.mp3` files under
  `public/assets/audio`; static-audio tests retain the stronger decode check.
- Noto asset IDs are lowercase hexadecimal codepoint sequences joined with
  underscores. Paths are derived, confined, regular, non-symlink `.svg` files,
  and hashes must match.
- Every Noto asset-manifest record is referenced and every checked-in word-game
  SVG is listed.
- Color values are exactly six-digit hexadecimal CSS colors.
- The authored prompt begins with the capitalized target label followed by a
  period. The authored success text contains the item's exact teaching text.

No deployment ledger is added. Word-game IDs are not persisted, scored, or
stored server-side, so a second append-only registry would be speculative.

## Runtime Types and Shuffling

The runtime exposes:

```ts
type WordGameSelection = Readonly<{
  category: WordGameCategory;
  tier: WordGameTier;
  quiz: WordGameQuiz;
}>;

resolveWordGameCategory(categoryId: string | undefined): WordGameCategory | null;
resolveWordGameQuiz(
  categoryId: string | undefined,
  quizId: string | undefined,
): WordGameSelection | null;
getWordGameCategoryRoute(categoryId: string): string;
getWordGameQuizRoute(categoryId: string, quizId: string): string;
buildWordGameRounds(
  selection: WordGameSelection,
  random?: () => number,
): readonly WordGameRound[];
```

`buildWordGameRounds` never changes question order or membership. It copies
each four-ID tuple and applies standard-library Fisher-Yates using injected
`random = Math.random`. Tests inject deterministic sequences. The player builds
rounds once on mount and rebuilds them only for Play again, so React renders do
not move answers unexpectedly.

## Routes and Navigation

- `/word-games` — ordered category shelf.
- `/word-games/:categoryId` — category page with Simple, Intermediate, and
  Advanced sections in one vertically scrollable view.
- `/word-games/:categoryId/:quizId` — fixed quiz player.
- `/word-game` — replace-redirect to `/word-games`.
- Unknown, encoded, or malformed category/quiz IDs — replace-redirect to
  `/word-games`.

The existing `/word-games/animals` URL remains useful: it now shows all Animals
quizzes rather than silently starting one. Safe auth-return handling accepts
only the shelf, known category pages, known quiz pages, and the legacy singular
route.

The shelf header returns home. Category headers return to Word games. Player
headers return to the selected category. Each route has exactly one `h1`.
Category pages use genuine descending `h2` tier headings and quiz cards.

## Learner Interaction and Layout

The player continues to begin immediately. On each round:

1. The target item's saved teaching/pronunciation cue plays.
2. Four answer cards appear from the question's fixed choice IDs in shuffled
   display order.
3. Each picture button chooses an answer; its sibling Listen button plays only
   that item's saved teaching/pronunciation cue and changes no state.
4. A wrong choice plays that choice's cue followed by the existing
   `word-game-retry` cue and leaves the round open.
5. A correct choice displays the authored success text and plays the existing
   `narrator-feedback-success` cue followed by the target item's cue. Controls
   remain disabled until both settle, then the next fixed question begins.
6. Completion uses the existing word-game completion cue and offers Play again
   or Back to category.

This keeps full natural teaching forms such as “This is a cat,” “These are the
eyes,” “This is red,” and “This face is happy,” while reducing repeated saved
speech. Existing item audio IDs and files remain valid.

The four choices use a two-column grid throughout phone and small-tablet widths,
including 280px and 390px viewports, producing the requested 2×2 mobile layout.
At `md` and wider they use four columns. Short landscapes scroll vertically.
Cards retain child-sized picture and Listen targets, Tailwind utilities,
`RouteHeader`, and shared controls. No page-specific stylesheet is added.

## Noto Artwork and Licensing

All non-color vocabulary uses vendored Noto SVGs. Files are selected from the
official repository's `svg/` directory at the pinned revision, never generated,
hotlinked, or fetched at runtime. The exact upstream SVG license and copyright
notice are retained under `third_party` and summarized in
`THIRD_PARTY_NOTICES.md`.

The old ImageGen pipeline becomes obsolete and is removed:

- `content/media/word-games-v8.json`
- `content/media/prompts/word-games-v8/`
- `scripts/word-game-media.mjs`
- `scripts/publish-word-game-media.mjs`
- `tests/word-game-media.test.mjs`
- the `publish:word-game-media` package script

The application's general preference for R2 runtime imagery remains in force.
The exact `public/assets/word-games/noto/*.svg` directory is a narrow exception:
these are a pinned third-party vocabulary library, checked and licensed as part
of the curriculum, and local delivery avoids a new external publishing step.
The web-asset test allows only that exact directory and continues rejecting
arbitrary bundled images.

## Audio Migration and External Boundary

The existing 36 `word-game-<category>-<item>-label.mp3` files become the reusable
item cues. The obsolete 36 prompt and 36 correct files are removed after tests
and runtime references migrate. Shared files remain:

- `word-game-retry.mp3` — “Listen and try again.”
- `word-game-complete.mp3` — final completion.
- `narrator-feedback-success.mp3` — “Great job!”

The 71 newly introduced vocabulary items require 71 new approved narrator
clips, not 213. They use the existing `eleven_v3`, narrator voice, and
`energetic-character` settings through `scripts/generate-static-audio.mjs`.
Neither a local speech engine nor an unvetted pronunciation website is an
acceptable substitute.

No ElevenLabs credential is present in this worktree. Code, JSON, compiler,
Noto assets, and tests may be developed autonomously, but the content gate must
prevent the expanded generated catalog from being considered releasable until
all 71 files are generated with an authorized credential and pass decode tests.
This is an external media-production dependency, not a reason to weaken the
runtime or tests.

## Build Integration

Add:

```json
{
  "generate:word-game-catalog": "node scripts/generate-word-game-catalog.mjs",
  "check:word-game-catalog": "node scripts/generate-word-game-catalog.mjs --check",
  "check:content-catalogs": "npm run check:rhyme-catalog && npm run check:word-game-catalog"
}
```

Existing predev, prebuild, predeploy, pregenerate-audio, prestart, pretest, and
pretest-browser hooks call `check:content-catalogs`. The generated file is
committed and stale content fails CI.

## Testing

### Manifest and Compiler

- Strict schema errors identify the exact file and field.
- Directory/ID mismatch, duplicates, unsafe IDs, unknown fields, missing
  references, wrong tier shape, question counts other than six, answer counts
  other than four, duplicate choices, non-first targets, conflicting audio,
  unsafe assets, symlinks, missing files, unused files, and hash drift fail.
- Discovery and generated bytes are deterministic.
- `--check` reports stale output and never writes.
- A fixture category added only as JSON appears in compiled categories, routes,
  flattened audio, and shelf data.

### Runtime and UI

- All 9 categories, 27 quizzes, 162 fixed questions, and 107 unique items match
  the authored JSON.
- Question order remains fixed and four answer identities never change.
- Injected random sequences move correct answers through every display position
  without mutating frozen catalog data.
- All known shelf/category/quiz routes resolve; malformed and unknown routes
  redirect safely.
- The library, category page, and player maintain one `h1`, descending category
  structure, shared headers, and accessible names.
- Every Noto SVG renders with its authored alt text; colors remain native
  swatches.
- Initial target, Listen, wrong, correct, replacement cancellation, failure,
  focus, automatic advance, completion, and Play again behavior use only saved
  audio.
- Every referenced MP3 exists, is non-empty, and decodes; no unexpected
  `word-game-*.mp3` files remain after migration.
- Playwright exercises a complete fixed quiz and uses accessible locators to
  prove four choices, answer-position variation, unchanged question order, and
  a 2×2 phone layout at 280×568 and 390×844, plus contained short-landscape,
  tablet, and desktop layouts.

Final verification is `npm test`, `npm run lint`, `npm run build`, and
`npm run test:browser`, followed by independent code review. Browser assertions
inspect rendered behavior and accessibility, never CSS source or class names.

## Acceptance Criteria

1. Editing a category JSON file and regenerating changes the shelf/player
   catalog without a React or runtime-catalog edit.
2. The learner sees 9 categories and 27 fixed tiered quizzes.
3. Every quiz exposes its six authored questions in fixed order and four
   authored answer identities; only their display positions vary.
4. Phone answer choices render as 2×2 and all controls remain accessible.
5. All non-color cards use one pinned, licensed Noto SVG source; no generated
   word-game art remains referenced.
6. Every released vocabulary item has one checked-in, decodable saved cue and
   no local/browser/macOS speech fallback exists.
7. Missing or stale JSON, SVG, audio, generated output, or license provenance
   fails before build/deploy.
8. Existing playback cancellation, focus, errors, learner safety, and completion
   behavior remain intact.
