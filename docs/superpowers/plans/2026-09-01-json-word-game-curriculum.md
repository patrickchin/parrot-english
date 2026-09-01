# JSON Word-Game Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-coded word games and generated artwork with a validated JSON curriculum containing 9 categories, 27 fixed tiered quizzes, four shuffled answer positions, and pinned Noto SVGs.

**Architecture:** Strict per-category JSON and a pinned Noto provenance manifest compile deterministically into a generated TypeScript catalog. A small runtime facade resolves categories/quizzes and shuffles only each fixed four-answer tuple; React owns the shelf, category view, and player presentation. Every vocabulary item uses one checked-in saved teaching cue, while existing generic success, retry, and completion cues provide feedback.

**Tech Stack:** Node.js 22, TypeScript 5.9, React 19, Vite 8, Zod 4, Tailwind 4, Node test runner, Playwright, local checked-in SVG/MP3 assets.

**Spec:** `docs/superpowers/specs/2026-09-01-json-word-game-curriculum-design.md`

## Global Constraints

- Work only on a `codex/` feature branch; merge into `main` only through a pull request.
- Use Bob, Mary, Rose, Jack, Ben, or Sam only if authored learner content needs a personal name; this curriculum needs no personal names.
- JSON owns all category, tier, quiz, vocabulary, question, answer, prompt, feedback, alt-text, and media-reference content.
- The initial catalog is exactly 9 categories, 27 quizzes, 162 fixed questions, and 107 unique vocabulary items.
- Every initial category has ordered `simple`, `intermediate`, and `advanced` tiers with one six-question quiz per tier.
- Every question has exactly four fixed same-category choice IDs with its target ID first; only display order is shuffled at runtime.
- Preserve question order, audio cancellation, focus movement, learner-visible errors/statuses, accessibility, and completion behavior.
- Four choices render 2×2 below the `md` breakpoint and four across at `md` and wider.
- Use pinned Google Noto Emoji SVGs from revision `8998f5dd683424a73e2314a8c1f1e359c19e8742`; never hotlink or generate word-game artwork.
- Keep native six-digit hexadecimal swatches for Colors.
- Use one saved teaching cue per item plus existing `narrator-feedback-success`, `word-game-retry`, and `word-game-complete` cues.
- Do not use local, browser, operating-system, or macOS text-to-speech.
- Add no dependency and no page-specific CSS.
- Test rendered behavior with accessible locators; never assert CSS source or class names.
- Missing JSON, SVG, audio, license, hash, or generated output must fail before build/deploy.
- `ELEVENLABS_API_KEY` is an explicit precondition only for Task 4 Step 7. If it is absent, complete Tasks 1–3 and Task 4 Steps 1–6, record the precise boundary, and stop before enabling or generating incomplete production content. Never add silent or device-speech fallback.

---

### Task 1: Strict Word-Game Manifest Schemas

**Files:**
- Create: `scripts/word-game/manifest.mjs`
- Create: `tests/word-game-manifest.test.mjs`

**Interfaces:**
- Consumes: Zod 4 and the exact category/Noto JSON contracts in the spec.
- Produces: `parseWordGameManifest(value, sourcePath)` and `parseNotoAssetManifest(value, sourcePath)` returning normalized plain data; exports `WORD_GAME_ID_PATTERN` for compiler path checks.

- [ ] **Step 1: Write the failing parser tests**

Create a minimal valid category with 12 items and three tiers. Generate each six-question tier with explicit four-choice tuples, then assert both parsers return strict normalized objects:

```js
const category = validCategory();
assert.deepEqual(parseWordGameManifest(category, "/content/animals.json"), category);
assert.deepEqual(
  parseNotoAssetManifest(validNotoManifest(), "/content/noto-assets.json"),
  validNotoManifest(),
);
```

Add table-driven failures for unknown fields, whitespace-only text, unsafe IDs, a filename-shaped asset ID, non-hex colors, non-40-character revision, non-64-character SHA, wrong repository/license/license path, wrong tier IDs/order, wrong quiz/question counts, duplicate choices, target not first, malformed audio IDs, and unsupported visual kinds. Assert the first error includes `sourcePath` and the exact field path.

- [ ] **Step 2: Run the parser tests to verify RED**

Run: `node --test tests/word-game-manifest.test.mjs`

Expected: FAIL because `scripts/word-game/manifest.mjs` does not exist.

- [ ] **Step 3: Implement strict Zod schemas and focused diagnostics**

Use `.strict()` at every object boundary and explicit tuples for fixed shapes:

```js
const id = z.string().regex(WORD_GAME_ID_PATTERN, "must be lowercase kebab-case");
const sixQuestions = z.tuple([
  question, question, question, question, question, question,
]);
const fourChoices = z.tuple([id, id, id, id]);

export function parseWordGameManifest(value, sourcePath) {
  const result = category.safeParse(value);
  if (!result.success) throw manifestError(sourcePath, result.error.issues[0]);
  validateFixedCategoryShape(result.data, sourcePath);
  return result.data;
}
```

Keep filesystem, cross-category, reference, and hash checks out of this parser; Task 2 owns them.

- [ ] **Step 4: Run the parser tests to verify GREEN**

Run: `node --test tests/word-game-manifest.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 5: Run lint for the new files**

Run: `npx eslint scripts/word-game/manifest.mjs tests/word-game-manifest.test.mjs`

Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/word-game/manifest.mjs tests/word-game-manifest.test.mjs
git commit -m "feat: validate word-game JSON packages"
```

### Task 2: Deterministic Package Compiler and Generator

**Files:**
- Create: `scripts/word-game/compiler.mjs`
- Create: `scripts/generate-word-game-catalog.mjs`
- Create: `tests/word-game-compiler.test.mjs`
- Create: `tests/fixtures/word-games/` fixture category, Noto manifest, SVG, license, and tiny MP3 fixture

**Interfaces:**
- Consumes: Task 1 parsers.
- Produces:

```js
compileWordGamePackages({ rootDir, categoryRoot, assetManifestPath, publicRoot, audioRoot })
planWordGameAudio({ rootDir })
serializeGeneratedWordGameCatalog(compiled)
runWordGameCatalogGenerator({ check, rootDir })
```

`compileWordGamePackages` returns `{ assets, categories }` containing JSON-compatible literals only and fails on missing audio. `planWordGameAudio` performs the same schema, reference, artwork, and license validation but returns `{ lines, missingFiles }` instead of failing when an expected MP3 is absent; it is used only to create the missing saved media.

- [ ] **Step 1: Write failing compiler discovery/reference tests**

Build a temporary repository from the fixture and assert:

```js
const compiled = await compileWordGamePackages(pathsFor(tempRoot));
assert.deepEqual(compiled.categories.map(({ id }) => id), ["animals"]);
assert.equal(compiled.categories[0].tiers[0].quizzes[0].questions.length, 6);
assert.equal(compiled.categories[0].items[0].visual.src,
  "/assets/word-games/noto/emoji_u1f431.svg");
assert.equal(compiled.categories[0].items[0].audio.source,
  "/assets/audio/word-game-animals-cat-label.mp3");
```

Add failures for directory/ID mismatch, duplicate category order/ID, duplicate nested IDs, missing/unused item references, missing/unused Noto records, SVG/audio paths outside approved roots, symlinks, missing regular files, mismatched SVG hashes, conflicting global audio IDs/text, and an unexpected file under `public/assets/word-games/noto`. Prove `planWordGameAudio` reports a sorted missing-audio inventory while retaining every non-audio validation failure.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test tests/word-game-compiler.test.mjs`

Expected: FAIL because compiler exports do not exist.

- [ ] **Step 3: Implement safe discovery and cross-record validation**

Resolve and realpath every root before reading children. Reject symlinks before following them. Derive sources only after validation:

```js
function compileAudio(categoryId, line) {
  if (!line.id.startsWith(`word-game-${categoryId}-`)) {
    throw new Error(`${categoryId}: audio id must start with word-game-${categoryId}-`);
  }
  return { ...line, source: `/assets/audio/${line.id}.mp3` };
}

function compileNotoVisual(asset) {
  return { kind: "image", src: asset.publicPath };
}
```

Preserve nested JSON array order. Sort categories by `order`, then ID. Confirm all items are targeted and all listed assets are referenced.

- [ ] **Step 4: Add deterministic serialization tests**

Assert compilation and serialization return identical bytes after shuffled directory enumeration. Assert output begins with:

```ts
// Generated by scripts/generate-word-game-catalog.mjs. Do not edit.
export const GENERATED_WORD_GAME_CATALOG = ${JSON.stringify(compiled.categories, null, 2)} as const;
```

Add generator tests proving atomic generate mode, clean `--check`, stale diagnostics, no write during `--check`, and invalid CLI arguments.

- [ ] **Step 5: Implement serialization and generator modes**

Copy only the nursery generator's small, proven atomic-write/check pattern. The CLI accepts no arguments or exactly `--check`:

```js
const check = process.argv.slice(2).includes("--check");
await runWordGameCatalogGenerator({ check, rootDir });
```

Do not modify `package.json` hooks yet; production packages arrive in Task 4.

- [ ] **Step 6: Run Task 1–2 tests and lint**

Run: `node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs`

Run: `npx eslint scripts/word-game tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs scripts/generate-word-game-catalog.mjs`

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/word-game scripts/generate-word-game-catalog.mjs tests/word-game-compiler.test.mjs tests/fixtures/word-games
git commit -m "feat: compile word-game content packages"
```

### Task 3: Pinned Noto Artwork Provenance

**Files:**
- Create: `content/word-games/noto-assets.json`
- Create: `public/assets/word-games/noto/*.svg`
- Create: `third_party/noto-emoji-svg-LICENSE`
- Create or modify: `THIRD_PARTY_NOTICES.md`
- Create: `tests/word-game-noto-assets.test.mjs`
- Modify: `tests/web-assets.test.mjs`

**Interfaces:**
- Consumes: Task 2 asset-manifest/compiler contract and Noto revision `8998f5dd683424a73e2314a8c1f1e359c19e8742`.
- Produces: one deduplicated, hash-pinned SVG inventory for every non-color item in the spec; the exact public exception matched by `/^assets\/word-games\/noto\/emoji_u[a-f0-9]+(?:_[a-f0-9]+)*\.svg$/`.

- [ ] **Step 1: Write failing provenance and public-asset policy tests**

Assert the manifest constants, full SHA values, exact license bytes, no duplicate public paths, every SVG basename matches its asset ID, and every file hash matches:

```js
assert.equal(manifest.revision,
  "8998f5dd683424a73e2314a8c1f1e359c19e8742");
assert.equal(manifest.repository,
  "https://github.com/googlefonts/noto-emoji");
assert.equal(manifest.license, "Apache-2.0");
```

Update the web-asset test to allow `.svg` only under the exact
`/^word-games\/noto\/emoji_u[a-f0-9]+(?:_[a-f0-9]+)*\.svg$/` pattern while continuing to
assert no other bundled runtime imagery exists.

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `node --test tests/word-game-noto-assets.test.mjs tests/web-assets.test.mjs`

Expected: FAIL because the manifest/license/assets do not exist and local SVGs are disallowed.

- [ ] **Step 3: Create the complete asset inventory**

Map every spec item to the official Noto codepoint. Use native swatches for all
11 color items. Deduplicate repeated assets such as category car/toy car if the
same SVG is intentionally selected. Compute and record each asset as:

```js
const id = "1f431";
const sha256 = createHash("sha256").update(svgBytes).digest("hex");
manifest.assets.push({
  id,
  upstreamPath: `svg/emoji_u${id}.svg`,
  publicPath: `/assets/word-games/noto/emoji_u${id}.svg`,
  sha256,
});
```

The computed value must be the actual downloaded file hash; do not copy a
placeholder or infer it from a Git object ID.

- [ ] **Step 4: Vendor exact upstream SVG and license bytes**

Fetch each file from this derived official revision URL:

```js
const upstreamUrl = `https://raw.githubusercontent.com/googlefonts/noto-emoji/8998f5dd683424a73e2314a8c1f1e359c19e8742/svg/emoji_u${asset.id}.svg`;
```

Fetch the exact `svg/LICENSE` bytes from the same revision. Reject non-200
responses before moving downloaded temporary files into the repository. Do not
optimize or rewrite upstream SVGs.

- [ ] **Step 5: Add the third-party notice**

State the component, official repository, pinned revision, selected `svg/`
paths, Apache-2.0 license, and local license path. Do not claim ownership of the
artwork.

- [ ] **Step 6: Run provenance, compiler-fixture, web-asset, and lint checks**

Run: `node --test tests/word-game-noto-assets.test.mjs tests/word-game-compiler.test.mjs tests/web-assets.test.mjs`

Run: `npx eslint tests/word-game-noto-assets.test.mjs tests/web-assets.test.mjs`

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add content/word-games/noto-assets.json public/assets/word-games/noto third_party/noto-emoji-svg-LICENSE THIRD_PARTY_NOTICES.md tests/word-game-noto-assets.test.mjs tests/web-assets.test.mjs
git commit -m "feat: vendor pinned Noto word-game artwork"
```

### Task 4: Author the Complete Curriculum and Saved Item Audio

**Files:**
- Create: `content/word-games/categories/animals.json`
- Create: `content/word-games/categories/body-parts.json`
- Create: `content/word-games/categories/clothes.json`
- Create: `content/word-games/categories/colors.json`
- Create: `content/word-games/categories/feelings.json`
- Create: `content/word-games/categories/food.json`
- Create: `content/word-games/categories/home.json`
- Create: `content/word-games/categories/toys.json`
- Create: `content/word-games/categories/transport.json`
- Create: `src/games/generated-word-game-catalog.ts`
- Create: 71 missing item-label MP3 files beneath `public/assets/audio`
- Modify: `scripts/generate-static-audio.mjs`
- Modify: `tests/generate-static-audio.test.mjs`
- Modify: `tests/word-game-compiler.test.mjs`
- Create: `tests/word-game-curriculum.test.mjs`

**Interfaces:**
- Consumes: exact curriculum table, fixed-answer pattern, sentence forms, Noto asset IDs, and compiler from Tasks 1–3.
- Produces: generated runtime literals for exactly 9 categories / 27 quizzes / 162 questions / 107 items; one decodable teaching cue per item.

- [ ] **Step 1: Write the failing production-curriculum count/content test**

Read and compile the real content root, then assert:

```js
assert.equal(compiled.categories.length, 9);
assert.equal(flattenQuizzes(compiled).length, 27);
assert.equal(flattenQuestions(compiled).length, 162);
assert.equal(flattenItems(compiled).length, 107);
assert.deepEqual(animalTargets.simple,
  ["cat", "dog", "bird", "fish", "duck", "frog"]);
assert.deepEqual(animalTargets.advanced,
  ["pig", "cow", "horse", "alligator", "elephant", "giraffe"]);
```

Assert every question's target/choices match the fixed pattern from the spec,
all authored strings contain no personal names, and all retired washing/soap
content remains absent.

- [ ] **Step 2: Run the curriculum test to verify RED**

Run: `node --test tests/word-game-curriculum.test.mjs`

Expected: FAIL because production category JSON does not exist.

- [ ] **Step 3: Author all nine strict category files**

Use the exact tier target lists from the spec. For each target tuple
`[a,b,c,d,e,f]`, write the six explicit choice tuples from the spec; do not add
a round-generation shortcut to authored JSON. Preserve current item IDs/audio
IDs/text for the 36 existing items. Add natural teaching forms for new items:

```json
"audio": {
  "id": "word-game-animals-alligator-label",
  "text": "This is an alligator."
}
```

Use “These are …” only for plural items, “This is …” for count/mass/color
items, and “This face is …” for feelings. Prompt and success strings are exact
JSON content, not runtime templates.

- [ ] **Step 4: Write failing content-audio planner CLI tests**

Add tests proving `--word-game-content --list-missing` reads item lines from the
strict JSON compiler, prints sorted missing IDs without requiring an API key or
writing files, and rejects all other static-audio IDs in this mode. Prove
`--word-game-content` supplies only the 107 compiled item lines to generation,
skips the 36 existing files, and attempts exactly the 71 missing IDs.

- [ ] **Step 5: Implement the explicit word-game content generation mode**

Replace the eager static-audio import with a mode-selected dynamic source:

```js
const wordGameContent = args.includes("--word-game-content");
const lines = wordGameContent
  ? Object.fromEntries((await planWordGameAudio({ rootDir })).lines.map((line) => [line.id, line]))
  : (await import("../lib/static-audio.js")).STATIC_AUDIO_LINES;
```

`--list-missing` prints only IDs whose derived file does not exist and exits
before API-key lookup. Normal `--word-game-content` generation retains the
existing skip-if-present behavior and uses this permanent line shape:

```js
{
  speaker: "narrator",
  lang: "en-US",
  src: `/assets/audio/${audio.id}.mp3`,
  text: audio.text,
  ttsText: `[bright, playful teaching delivery for a young child] ${audio.text}`,
  voiceStyle: "energetic-character"
}
```

Do not duplicate learner copy outside JSON.

- [ ] **Step 6: Record and verify the exact missing inventory**

Run: `node scripts/generate-static-audio.mjs --word-game-content --list-missing`

Expected: exactly 71 sorted new item-label IDs; no existing label ID and no
other static-audio ID. Any other count means the curriculum IDs or reuse
contract is wrong and must be fixed before external generation.

- [ ] **Step 7: Verify the external audio precondition without exposing secrets**

Check only presence, never value:

```bash
test -n "${ELEVENLABS_API_KEY:-}" || test -s .dev.vars
```

If absent, write the missing 71-ID inventory to this plan's SDD ledger, mark the
execution externally blocked at Task 4 Step 7, and stop. Do not create empty,
copied, system-TTS, browser-TTS, or mismatched placeholder audio files.

- [ ] **Step 8: Generate only the authorized missing clips**

Run the compiler-backed mode. It sees exactly the 107 item lines, skips the 36
existing files, and generates exactly the 71 missing files:

```bash
npm run generate:audio:elevenlabs -- --word-game-content
```

Use the existing narrator voice, `eleven_v3`, `mp3_44100_128`, and
`energetic-character` settings. Never log the credential.

- [ ] **Step 9: Generate the production catalog**

Run: `npm run generate:word-game-catalog`

Expected: `src/games/generated-word-game-catalog.ts` is created and contains no
missing-asset diagnostic.

- [ ] **Step 10: Verify curriculum and every saved cue**

Run: `node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-curriculum.test.mjs tests/static-audio.test.mjs`

Expected: zero failures; all 107 referenced item cues exist, are non-empty, and
decode.

- [ ] **Step 11: Commit Task 4**

```bash
git add content/word-games/categories src/games/generated-word-game-catalog.ts public/assets/audio scripts/generate-static-audio.mjs tests/generate-static-audio.test.mjs tests/word-game-curriculum.test.mjs tests/word-game-compiler.test.mjs
git commit -m "content: add tiered word-game curriculum"
```

### Task 5: Runtime Catalog, Fixed Questions, and Answer Shuffling

**Files:**
- Modify: `src/games/word-game-catalog.ts`
- Modify: `lib/static-audio.js`
- Modify: `tests/word-game-catalog.test.mjs`
- Modify: `tests/static-audio.test.mjs`

**Interfaces:**
- Consumes: `GENERATED_WORD_GAME_CATALOG` from Task 4.
- Produces: runtime types and the exact functions named in the spec:

```ts
resolveWordGameCategory(categoryId): WordGameCategory | null
resolveWordGameQuiz(categoryId, quizId): WordGameSelection | null
getWordGameCategoryRoute(categoryId): string
getWordGameQuizRoute(categoryId, quizId): string
buildWordGameRounds(selection, random?): readonly WordGameRound[]
```

- [ ] **Step 1: Replace catalog expectations with failing generated-data tests**

Assert deep freeze, exact counts, category/quiz resolution, route strings, one
audio descriptor per item, shared success/retry/complete descriptors, and no
curriculum inventory literal in the runtime facade.

Add deterministic shuffle tests using a sequence RNG:

```js
const rounds = buildWordGameRounds(selection, sequenceRandom([0, 0, 0]));
assert.deepEqual(rounds.map(({ question }) => question.id), authoredQuestionIds);
assert.deepEqual(new Set(rounds[0].choices.map(({ id }) => id)),
  new Set(authoredChoiceIds));
assert.notEqual(rounds[0].choices.indexOf(rounds[0].target), 0);
assert.deepEqual(selection.quiz.questions[0].choiceIds, authoredChoiceIds);
```

Cover random values `0`, near `1`, and each correct display position. Reject a
random function returning values outside `[0, 1)` with a clear TypeError rather
than corrupting the tuple.

- [ ] **Step 2: Run catalog/static-audio tests to verify RED**

Run: `node --test tests/word-game-catalog.test.mjs tests/static-audio.test.mjs`

Expected: FAIL against the old hard-coded topic/triple-audio model.

- [ ] **Step 3: Implement the generated runtime facade**

Map generated literals once, resolve Noto assets/items/questions, and deep-freeze
the result. Implement Fisher-Yates on a fresh copy:

```ts
function shuffled<T>(values: readonly T[], random: () => number): readonly T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!(sample >= 0 && sample < 1)) throw new TypeError("random must return a value in [0, 1)");
    const swapIndex = Math.floor(sample * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
```

The builder resolves only the four JSON choice IDs and preserves the six JSON
question records exactly.

- [ ] **Step 4: Flatten one item cue per vocabulary item into static audio**

Deduplicate by ID and exact text. Keep generic success in its existing static
entry; export a player descriptor pointing to it without registering a duplicate.
Remove prompt/correct inventory expectations.

- [ ] **Step 5: Run Task 5 tests, TypeScript build, and lint**

Run: `node --test tests/word-game-catalog.test.mjs tests/static-audio.test.mjs`

Run: `npm run build`

Run: `npx eslint src/games/word-game-catalog.ts lib/static-audio.js tests/word-game-catalog.test.mjs tests/static-audio.test.mjs`

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/games/word-game-catalog.ts lib/static-audio.js tests/word-game-catalog.test.mjs tests/static-audio.test.mjs
git commit -m "refactor: load word games from generated curriculum"
```

### Task 6: Category and Quiz Routes with Tiered Shelf UI

**Files:**
- Create: `src/games/WordGameCategory.tsx`
- Modify: `src/games/WordGameList.tsx`
- Modify: `src/games/WordGameVisual.tsx`
- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/HomeMenu.tsx`
- Modify: `tests/app-routes.test.mjs`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/product-streamline.test.mjs`

**Interfaces:**
- Consumes: Task 5 category/quiz resolvers and route helpers.
- Produces: `/word-games`, `/word-games/:categoryId`, and `/word-games/:categoryId/:quizId` rendered flows; `WordGameCategory({ category })`.

- [ ] **Step 1: Write failing route and rendered-structure tests**

Assert:

```js
assert.deepEqual(resolveWordGameRouteDecision("animals", undefined, "/word-games/animals"),
  { kind: "category", category: resolveWordGameCategory("animals") });
assert.equal(getWordGameQuizRoute("animals", "advanced-1"),
  "/word-games/animals/advanced-1");
```

Cover all 9 categories/27 quizzes, lowercase canonical matching, encoded IDs,
unknown IDs, extra segments, legacy `/word-game`, and safe return targets.

Rendered tests assert one shelf `h1`, nine category links, one category `h1`,
ordered Simple/Intermediate/Advanced `h2`s, three quiz links, shared header links,
and Noto cover alt text. Do not assert class names.

- [ ] **Step 2: Run route/shell tests to verify RED**

Run: `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs`

Expected: FAIL because the old two-level route directly starts a topic player.

- [ ] **Step 3: Implement route decisions and safe-return validation**

Use separate exact regexes for shelf, category, and quiz shapes. Reject percent
encoded route IDs before lookup. Return:

```ts
type WordGameRouteDecision =
  | { kind: "redirect"; replace: true; to: string }
  | { kind: "category"; category: WordGameCategory }
  | { kind: "game"; selection: WordGameSelection };
```

Unknown/malformed paths replace-redirect to `/word-games`.

- [ ] **Step 4: Implement the shelf and category pages**

`WordGameList` renders category cards only. `WordGameCategory` vertically groups
quiz cards under real tier headings, making advanced quizzes reachable by
scrolling. Use `RouteHeader`, `HeaderLink`, `InteractiveCardLink`,
`WordGameVisual`, Tailwind utilities, and exactly one `h1` per route.

- [ ] **Step 5: Wire App routes and home artwork**

Declare the specific three-segment player route and two-segment category route
without duplicating route resolution. Home uses the Animals cover item exposed
by the JSON catalog.

- [ ] **Step 6: Run Task 6 tests, build, and lint**

Run: `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs`

Run: `npm run build`

Run: `npx eslint src/games src/app/app-routes.ts src/app/App.tsx src/app/HomeMenu.tsx tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs`

Expected: all commands exit 0.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/games/WordGameCategory.tsx src/games/WordGameList.tsx src/games/WordGameVisual.tsx src/app/app-routes.ts src/app/App.tsx src/app/HomeMenu.tsx tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs
git commit -m "feat: add tiered word-game category routes"
```

### Task 7: Four-Choice Player and Reusable Audio Flow

**Files:**
- Modify: `src/games/WordGamePlayer.tsx`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `tests/e2e/word-game.spec.ts`
- Modify or create focused component test beside existing UI tests if needed

**Interfaces:**
- Consumes: `WordGameSelection`, fixed/shuffled Task 5 rounds, and shared player audio descriptors.
- Produces: four accessible choice/listen pairs; 2×2 mobile and four-column desktop layout; stable question order with reshuffle only on Play again.

- [ ] **Step 1: Update browser tests for failing four-choice behavior**

Navigate through `/word-games/animals` to `/word-games/animals/simple-1`. Assert
exactly four `Choose …` and four `Listen: …` buttons, fixed first target `cat`,
and the four authored answer identities regardless of display order.

Update playback expectations:

- initial: target `word-game-animals-cat-label`;
- Listen dog: the same dog label cue and no selection;
- wrong bird: bird label, then `word-game-retry`;
- correct cat: `narrator-feedback-success`, then cat label, then automatic advance;
- completion: unchanged `word-game-complete`.

Complete all six questions by accessible answer name, never by position.

- [ ] **Step 2: Add failing responsive and shuffle-lifecycle checks**

At 280×568 and 390×844 assert four cards render as two rows/two columns by
measuring rendered boxes, not CSS. At 768 and desktop assert one row/four
columns. At 640×360 assert content scrolls and all controls remain reachable.

Capture one play-through's answer order, choose Play again, and assert authored
question order is unchanged. Inject or observe controlled E2E randomness so
the answer order difference is deterministic rather than probabilistic.

- [ ] **Step 3: Run the focused browser spec to verify RED**

Run: `npm run test:browser -- tests/e2e/word-game.spec.ts`

Expected: FAIL against the three-choice topic player and old route/audio cues.

- [ ] **Step 4: Refactor the player to receive a selection**

Build rounds in a state initializer keyed to selection. `playAgain()` calls the
round builder again, resets all player state, focuses the first question, and
plays its target item cue. Do not rebuild rounds on ordinary React renders.

- [ ] **Step 5: Implement the saved-audio sequences**

Use existing `playAudioLine`/`playAudioSequence` cancellation:

```ts
wrong: [choice.audio, WORD_GAME_RETRY_AUDIO]
correct: [WORD_GAME_SUCCESS_AUDIO, round.target.audio]
```

Correct completion advances only after both correct cues settle. A real error
retains `Sound is not available. You can still play.` and visual play remains
usable. Never import device speech.

- [ ] **Step 6: Render four cards and category-aware completion navigation**

Use a two-column grid below `md` and four columns at `md`. Keep picture and
Listen as sibling buttons. Player header and completion return to the selected
category route. One `h1` names the quiz; category/tier context is lower helper
copy only if it provides genuine structure.

- [ ] **Step 7: Run focused browser, build, and lint checks**

Run: `npm run test:browser -- tests/e2e/word-game.spec.ts`

Run: `npm run build`

Run: `npx eslint src/games/WordGamePlayer.tsx src/testing/e2e-browser-mocks.ts tests/e2e/word-game.spec.ts`

Expected: all commands exit 0.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/games/WordGamePlayer.tsx src/testing/e2e-browser-mocks.ts tests/e2e/word-game.spec.ts
git commit -m "feat: play fixed quizzes with four shuffled choices"
```

### Task 8: Build Gates and Obsolete Pipeline Removal

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Create: `tests/word-game-package-flow.test.mjs`
- Modify: `tests/ci-workflows.test.mjs`
- Delete: `content/media/word-games-v8.json`
- Delete: `content/media/prompts/word-games-v8/*.json`
- Delete: `scripts/word-game-media.mjs`
- Delete: `scripts/publish-word-game-media.mjs`
- Delete: `tests/word-game-media.test.mjs`
- Delete: obsolete `public/assets/audio/word-game-*-prompt.mp3`
- Delete: obsolete `public/assets/audio/word-game-*-correct.mp3`

**Interfaces:**
- Consumes: production compiler/generator and migrated one-cue runtime.
- Produces: `generate:word-game-catalog`, `check:word-game-catalog`, and `check:content-catalogs` scripts; unconditional CI/build/test/deploy gate; no ImageGen publishing path.

- [ ] **Step 1: Write the failing package-flow and workflow tests**

Build a temporary seventh/fixture category package solely from JSON + Noto SVG
+ audio fixture and assert it appears in generated output, resolver input, shelf
data, and flattened static-audio data without a React/runtime inventory edit.

Workflow tests assert `check:content-catalogs` runs unconditionally after FFmpeg
setup and before build/deploy. Package tests assert all existing pre-hooks use
that combined command and no `publish:word-game-media` script remains.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test tests/word-game-package-flow.test.mjs tests/ci-workflows.test.mjs`

Expected: FAIL because package hooks still check only nursery content and the
old publisher remains.

- [ ] **Step 3: Add combined content scripts and hook every lifecycle**

Set exactly:

```json
"generate:word-game-catalog": "node scripts/generate-word-game-catalog.mjs",
"check:word-game-catalog": "node scripts/generate-word-game-catalog.mjs --check",
"check:content-catalogs": "npm run check:rhyme-catalog && npm run check:word-game-catalog"
```

Point `predev:vite`, `prebuild`, `predeploy:worker`,
`pregenerate:audio:elevenlabs`, `prestart`, `pretest:browser`, and `pretest` at
`check:content-catalogs`. Preserve any existing second command after the old
rhyme check, such as build-metadata preparation.

- [ ] **Step 4: Delete the obsolete generated-art pipeline**

Remove only the listed word-game manifest/prompts/scripts/test/package command.
Do not delete or mutate remote R2 objects and do not remove shared media helpers.

- [ ] **Step 5: Delete obsolete prompt/correct MP3s and verify exact inventory**

After `rg` proves no runtime/test references remain, delete only files matching
the validated exact suffixes `-prompt.mp3` and `-correct.mp3` under
`public/assets/audio`. Keep every `-label.mp3`, `word-game-retry.mp3`, and
`word-game-complete.mp3`. The static-audio test must compare the exact remaining
word-game file inventory to generated item cues plus shared cues.

- [ ] **Step 6: Run combined catalog, package-flow, workflow, and full unit tests**

Run: `npm run check:content-catalogs`

Run: `node --test tests/word-game-package-flow.test.mjs tests/ci-workflows.test.mjs tests/word-game-catalog.test.mjs tests/static-audio.test.mjs tests/web-assets.test.mjs`

Run: `npm test`

Expected: all commands exit 0.

- [ ] **Step 7: Commit Task 8**

```bash
git add -A
git commit -m "chore: gate JSON word-game content"
```

### Task 9: Full Responsive Verification and Independent Review

**Files:**
- Modify only files required by evidence-backed fixes from verification/review.

**Interfaces:**
- Consumes: Tasks 1–8 complete branch.
- Produces: verified feature branch ready for pull-request creation; no merge.

- [ ] **Step 1: Run generated-content and repository diff checks**

Run: `npm run check:content-catalogs`

Run: `git diff --check origin/main...HEAD`

Expected: both exit 0.

- [ ] **Step 2: Run the complete unit/lint/build gates freshly**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0 with zero failures/errors.

- [ ] **Step 3: Run the complete browser suite freshly**

Run: `npm run test:browser`

Expected: all Playwright projects pass. Inspect artifacts for the word-game
shelf, one category, Simple Animals, and Advanced Animals at phone,
short-landscape, tablet, and desktop sizes.

- [ ] **Step 4: Verify requirements line by line**

Record evidence for: 9/27/162/107 counts; JSON-only content change seam; 4 fixed
answers; question-order stability; shuffled display positions; 2×2 mobile;
Noto-only non-color art; exact provenance/hash/license; one saved cue/item; no
device speech; removed ImageGen pipeline; preserved audio/focus/error behavior.

- [ ] **Step 5: Dispatch an independent whole-branch code review**

Give the reviewer the spec, this plan, `origin/main` base SHA, branch HEAD SHA,
and full diff. Require findings prioritized as Critical/Important/Minor and
require exact file/line evidence. Fix all Critical and Important findings, then
run scoped re-review.

- [ ] **Step 6: Re-run every gate after review fixes**

Run: `npm run check:content-catalogs && npm test && npm run lint && npm run build && npm run test:browser`

Expected: exit 0 with no failures.

- [ ] **Step 7: Prepare pull-request handoff without merging**

Report branch name, commits, verification evidence, external media provenance,
and any remaining Minor review notes. Do not merge into `main`; create or hand
off a pull request only when explicitly requested or through the app's branch
controls.
