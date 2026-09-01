# Richer Word-Game Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Noto with pinned Fluent 3D artwork, expand every tier to three fixed quizzes, and make each displayed question use the exact JSON-owned saved prompt audio.

**Architecture:** Keep the existing strict JSON compiler and generated TypeScript boundary. First replace only the artwork provenance system so the current runtime remains green. Then atomically migrate category packages to schema version 2, add JSON-owned player cues and prompt audio, expand the fixed curriculum, and update the runtime/UI consumers. Finish with package-flow, static-audio, responsive browser, and full repository verification.

**Tech Stack:** Node.js 22, TypeScript 5.9, React 19, Vite 8, Zod 4, Tailwind 4, Node test runner, Playwright, pinned Microsoft Fluent Emoji 3D PNGs, checked-in ElevenLabs MP3s.

**Spec:** `docs/superpowers/specs/2026-09-01-richer-word-game-curriculum-design.md`

## Global Constraints

- Work only on `codex/richer-word-game-curriculum`; merge into `main` only through a pull request.
- Use Bob, Mary, Rose, Jack, Ben, or Sam only if authored learner content needs a personal name; this feature needs no personal names.
- Category JSON schema version 2 owns item labels, alt text, both saved item cues, tiers, quizzes, fixed question order, targets, and answer membership.
- `content/word-games/player.json` owns generic success, retry, and completion cue identities/text.
- The final catalog is exactly 9 categories, 81 quizzes, 486 fixed questions, and 107 unique vocabulary items.
- Every category has ordered `simple`, `intermediate`, and `advanced` tiers; each tier has exactly three six-question quizzes over the same six target IDs.
- The first target differs across a tier's three quizzes and becomes the quiz card cover; do not add a duplicate quiz `coverItemId` field.
- Every question has four fixed same-category choice IDs with its target first; only answer display order is shuffled at runtime.
- The rendered prompt and the initially played, replayed, and Listen-again cue must be the same `promptAudio.text`/asset from JSON.
- Preserve existing label-audio IDs and bytes; generate exactly one new prompt MP3 per vocabulary item through the approved ElevenLabs pipeline.
- Do not use local, browser, operating-system, or macOS text to speech.
- Vendor exact 256×256 Fluent 3D PNGs from `microsoft/fluentui-emoji` revision `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`; retain its exact MIT license and SHA-256 inventory.
- Keep Colors as native six-digit CSS swatches.
- Use Tailwind 4 in React and existing shared controls/headers; add no page-specific CSS or dependency.
- Keep one route `h1`, descending tier headings, keyboard order, focus visibility, errors, live feedback, progress, and audio cancellation.
- Test rendered behavior with accessible Playwright locators; never assert CSS source or class names.
- Missing JSON, PNG, audio, license, hash, or generated output must fail before build/deploy.

---

### Task 1: Replace Noto With Pinned Fluent 3D Artwork

**Files:**
- Modify: `scripts/word-game/manifest.mjs`
- Modify: `scripts/word-game/compiler.mjs`
- Modify: `content/word-games/categories/*.json`
- Replace: `content/word-games/noto-assets.json` with `content/word-games/fluent-3d-assets.json`
- Replace: `public/assets/word-games/noto/*.svg` with `public/assets/word-games/fluent-3d/*.png`
- Replace: `third_party/noto-emoji-svg-LICENSE` with `third_party/fluentui-emoji-LICENSE`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `.gitattributes`
- Modify: `tests/fixtures/word-games/*`
- Modify: `tests/word-game-manifest.test.mjs`
- Modify: `tests/word-game-compiler.test.mjs`
- Replace: `tests/word-game-noto-assets.test.mjs` with `tests/word-game-fluent-assets.test.mjs`
- Modify: `tests/word-game-curriculum.test.mjs`
- Modify: `tests/web-assets.test.mjs`
- Regenerate: `src/games/generated-word-game-catalog.ts`

**Interfaces:**
- Consumes: the current schema-version-1 category/question/audio contract.
- Produces: `parseFluentAssetManifest(value, sourcePath)`; category visuals of `{ kind: "fluent-3d", assetId }`; compiled visuals of `{ kind: "image", src }` under `/assets/word-games/fluent-3d/`.

- [ ] **Step 1: Write failing Fluent manifest and compiler tests**

Replace fixture expectations with an official pinned Fluent record:

```js
const fluentManifest = {
  schemaVersion: 1,
  revision: "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc",
  repository: "https://github.com/microsoft/fluentui-emoji",
  license: "MIT",
  licensePath: "LICENSE",
  assets: [{
    id: "1f431",
    upstreamPath: "assets/Cat/3D/cat_3d.png",
    publicPath: "/assets/word-games/fluent-3d/1f431.png",
    sha256: "5d3fcbbfb0be45d9be0ade47fe4eb1b97d33130fe67d46a8db697e434f13289b",
  }],
};
```

Use a committed 256×256 fixture PNG and its hand-checked literal hash. Assert
the parser rejects `noto-svg`, wrong repository/revision/license/path, unsafe
PNG paths, wrong hashes, non-PNG files, non-256×256 PNGs, symlinks, missing or
unused records, and unexpected files. Name the production break each test
catches; do not assert source text or mocks.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-fluent-assets.test.mjs tests/word-game-curriculum.test.mjs tests/web-assets.test.mjs
```

Expected: FAIL because the parser/compiler still require Noto SVGs and the new
Fluent provenance test/file does not yet exist.

- [ ] **Step 3: Implement the strict Fluent asset contract**

In `manifest.mjs`, accept only:

```js
const visual = z.discriminatedUnion("kind", [
  z.object({ assetId, kind: z.literal("fluent-3d") }).strict(),
  z.object({ color: sixDigitColor, kind: z.literal("swatch") }).strict(),
]);
```

Add `parseFluentAssetManifest`. In `compiler.mjs`, rename Noto-specific roots
and diagnostics to Fluent, derive `/assets/word-games/fluent-3d/${id}.png`, hash
exact bytes, validate the PNG signature and IHDR width/height as 256×256, and
keep the existing no-symlink/no-extra-file protections.

- [ ] **Step 4: Vendor the complete pinned Fluent inventory**

Map the existing 94 codepoint asset IDs to official Fluent 3D upstream paths.
Download only those exact files from the pinned revision, record literal SHA-256
values, and retain the exact upstream `LICENSE`. Preserve learner labels/alts
for semantic aliases. Change only non-color JSON visuals to `fluent-3d`; do not
change items, audio, tiers, quizzes, questions, IDs, or order in this task.

Delete the old Noto manifest, SVG directory, license, tests, notice, and its
path-scoped `.gitattributes` whitespace exception. Update the third-party
notice for Microsoft Fluent Emoji under MIT.

- [ ] **Step 5: Regenerate and verify GREEN**

Run:

```bash
npm run generate:word-game-catalog
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-fluent-assets.test.mjs tests/word-game-curriculum.test.mjs tests/web-assets.test.mjs
npx eslint scripts/word-game tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-fluent-assets.test.mjs tests/word-game-curriculum.test.mjs
npm run build
git diff --check
```

Expected: all pass; generated categories retain 27 quizzes/162 questions and
all non-color image sources point only to the Fluent root.

- [ ] **Step 6: Commit Task 1**

```bash
git add .gitattributes THIRD_PARTY_NOTICES.md content/word-games public/assets/word-games scripts/word-game src/games/generated-word-game-catalog.ts tests third_party
git commit -m "feat: replace word-game emoji with Fluent artwork"
```

---

### Task 2: Expand Fixed Quizzes and Unify Visible/Spoken Prompts

**Files:**
- Create: `content/word-games/player.json`
- Modify: `content/word-games/categories/*.json`
- Modify: `scripts/word-game/manifest.mjs`
- Modify: `scripts/word-game/compiler.mjs`
- Modify: `scripts/generate-static-audio.mjs` only if its existing compiler seam needs the new player/item cues
- Modify: `src/games/word-game-catalog.ts`
- Modify: `src/games/WordGameCategory.tsx`
- Modify: `src/games/WordGamePlayer.tsx`
- Modify: `src/games/WordGameVisual.tsx`
- Regenerate: `src/games/generated-word-game-catalog.ts`
- Create: `public/assets/audio/word-game-*-prompt.mp3` for exactly 107 item IDs
- Modify: `tests/word-game-manifest.test.mjs`
- Modify: `tests/word-game-compiler.test.mjs`
- Modify: `tests/word-game-curriculum.test.mjs`
- Modify: `tests/word-game-catalog.test.mjs`
- Modify: `tests/static-audio.test.mjs`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/e2e/word-game.spec.ts`

**Interfaces:**
- Produces category schema version 2 with `labelAudio` and `promptAudio` on every item and no question `prompt`/`success`.
- Produces `{ categories, player }` from the compiler/generator.
- Produces runtime `WordGameItem.labelAudio`, `WordGameItem.promptAudio`, and `WordGameQuiz.coverItem` derived from its first question.

- [ ] **Step 1: Write failing schema/compiler tests for one-source prompts**

Update the valid fixture to this contract:

```js
const item = {
  id: "cat",
  label: "cat",
  alt: "A friendly cat.",
  visual: { kind: "fluent-3d", assetId: "1f431" },
  labelAudio: {
    id: "word-game-animals-cat-label",
    text: "This is a cat.",
  },
  promptAudio: {
    id: "word-game-animals-cat-prompt",
    text: "Which is the cat?",
  },
};
const question = {
  id: "find-cat",
  targetId: "cat",
  choiceIds: ["cat", "dog", "bird", "fish"],
};
```

Assert schema version 1, item `audio`, and question `prompt`/`success` are
rejected. Assert both audio IDs use the category prefix and exact `-label`/
`-prompt` suffixes. Assert `player.json` is strict and compiler output includes
all generic and item cues.

- [ ] **Step 2: Write failing curriculum/runtime/component tests**

Use literal expected counts and behavior:

```js
assert.equal(categories.length, 9);
assert.equal(quizzes.length, 81);
assert.equal(questions.length, 486);
assert.equal(items.length, 107);
```

For each tier assert three quizzes, six questions each, equal target membership,
different fixed target order, and three different first targets. In runtime
tests assert `quiz.coverItem.id` equals the first question target and everything
is deeply frozen.

Render the real category/player components. Assert nine canonical quiz links,
three tier headings, a different thumbnail alt in each tier card, the question
heading text equals the selected target's `promptAudio.text`, Listen again uses
the prompt cue, choice Listen uses the label cue, and displayed feedback equals
the same cue sequence that playback receives.

- [ ] **Step 3: Run the new focused tests and verify RED**

Run:

```bash
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-curriculum.test.mjs tests/word-game-catalog.test.mjs tests/static-audio.test.mjs tests/app-shell-ui.test.mjs
```

Expected: FAIL on the old schema, 27/162 counts, missing prompt audio, missing
quiz covers, and the old player/category behavior.

- [ ] **Step 4: Implement schema version 2 and compiler outputs**

Parse `player.json` through a strict `parseWordGamePlayerManifest`. Require
exactly three quizzes per tier and six questions per quiz. In compiler reference
validation:

```js
const targetIds = quiz.questions.map(({ targetId }) => targetId);
const firstTargetId = targetIds[0];
```

Require each quiz's target set to equal the tier's first quiz target set,
require different authored orders, and require three distinct first target IDs.
Register `labelAudio`, `promptAudio`, and player cues in the same global audio
ID/text map and static-audio planner. Compile both item cues with saved sources;
do not generate question-level prompt/success fields.

- [ ] **Step 5: Author all fixed JSON quiz passes**

For every current tier target order `[a,b,c,d,e,f]`, retain quiz 1 and author:

```text
quiz 1 targets: [a,b,c,d,e,f]
quiz 2 targets: [c,e,a,f,b,d]
quiz 3 targets: [e,b,d,a,f,c]
```

Give quiz IDs `${tier.id}-1`, `${tier.id}-2`, `${tier.id}-3`. Use unique JSON
titles formed as `${tier.title} ${category.title}: First look`, `${tier.title}
${category.title}: Mix it up`, and `${tier.title} ${category.title}: Quick
check`; descriptions say `6 questions`.
For each pass, explicitly author four unique same-category choices with target
first and rotate distractor neighborhoods; do not generate choices at runtime.

Add exact category-appropriate `promptAudio.text` for every item. Use clear
questions such as `Which is the cat?`, `Which color is red?`, `Which picture
shows the eyes?`, and `Which face looks happy?`. Use no personal names.

- [ ] **Step 6: Plan and generate exactly the missing prompt audio**

Run the existing missing-audio planner and save its printed ID list in the task
report. It must contain exactly 107 `word-game-*-prompt` IDs and no label,
generic, nursery-rhyme, or story ID. Resolve `ELEVENLABS_API_KEY` from the root
worktree `.dev.vars` without printing, copying, or tracking the value. Generate
only the planned files through the approved ElevenLabs CLI, retaining TLS
verification and checked-in voice/model/output defaults.

Verify every new file is non-empty and decodes with FFmpeg. Verify all 107
existing label hashes are unchanged.

- [ ] **Step 7: Update runtime and UI consumers**

Map the generated item cues directly:

```ts
export type WordGameItem = Readonly<{
  id: string;
  label: string;
  alt: string;
  visual: WordGameVisual;
  labelAudio: WordGameAudioLine;
  promptAudio: WordGameAudioLine;
}>;
```

Derive `quiz.coverItem` from its first question target while building the frozen
catalog. Source generic cues from generated player data rather than TypeScript
literals.

In the player, render and play `round.target.promptAudio` for the question and
Listen again. Use `choice.labelAudio` for choice Listen/wrong feedback and
generic success plus `target.labelAudio` for correct feedback. Display the same
concatenated sequence text that is played.

In the category view, lay tier panels out as three sibling columns at large
widths and stack them below that. Render three compact cards per tier using
`quiz.coverItem`, a short title, and `6 questions`; keep the category art only
in the header.

- [ ] **Step 8: Regenerate and verify GREEN**

Run:

```bash
npm run generate:word-game-catalog
npm run check:content-catalogs
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-curriculum.test.mjs tests/word-game-catalog.test.mjs tests/static-audio.test.mjs tests/app-shell-ui.test.mjs
npx eslint content/word-games scripts/word-game src/games tests/word-game-*.test.mjs tests/static-audio.test.mjs tests/app-shell-ui.test.mjs
npm run build
PLAYWRIGHT_PORT=44011 npx playwright test tests/e2e/word-game.spec.ts
git diff --check
```

Expected: all pass with 81 quizzes, 486 questions, 216 exact
`word-game-*.mp3` files (107 label, 107 prompt, retry, complete), and no Noto
reference.

- [ ] **Step 9: Commit Task 2**

```bash
git add content/word-games public/assets/audio scripts src/games tests
git commit -m "feat: enrich fixed word-game curriculum"
```

---

### Task 3: Package Flow, Responsive Evidence, and Final Verification

**Files:**
- Modify: `tests/word-game-package-flow.test.mjs`
- Modify: `tests/word-game-player-build.test.mjs` only if generated data shape changes its real-build fixture
- Modify: `tests/e2e/word-game.spec.ts`
- Modify: documentation only where it still describes Noto, 27 quizzes, or one cue per item

**Interfaces:**
- Consumes: final Task 1–2 artwork, compiler, JSON, audio, runtime, and UI.
- Produces: a JSON-only package-flow proof and complete release evidence.

- [ ] **Step 1: Write failing package-flow assertions**

Extend the temporary-package test so one schema-version-2 JSON category plus
`player.json` flows through generation into runtime category/quiz resolution,
derived quiz covers, and flattened label/prompt/player static audio without
editing React or a runtime inventory. Break the compiler's prompt-audio
collection locally to confirm the test fails for the intended reason, then
restore it before continuing.

- [ ] **Step 2: Add responsive behavior coverage**

At 280×568, 390×844, 640×360, 768×900, and 1280×900, use accessible locators
to assert all three tier headings and nine quiz links are reachable without
horizontal overflow. Measure rendered tier/card positions to prove stacked
small-screen and side-by-side large-screen behavior without asserting classes.

For one animal, color, body-part, and feeling question, capture the real saved
audio ID/text used by the browser mock and assert it matches the visible
question heading. Exercise correct, wrong, Listen again, replay, and route exit
to retain cancellation/focus behavior.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npm run check:content-catalogs
node --test tests/word-game-package-flow.test.mjs tests/word-game-player-build.test.mjs
PLAYWRIGHT_PORT=44012 npx playwright test tests/e2e/word-game.spec.ts
git diff --check origin/main...HEAD
```

Expected: all pass; a production Vite bundle still omits the development-only
word-game RNG hook.

- [ ] **Step 4: Run the complete repository gate**

Run:

```bash
npm run check:content-catalogs
npm test
npm run lint
npm run build
PLAYWRIGHT_PORT=44013 npm run test:browser
git diff --check origin/main...HEAD
```

Expected: zero failures and zero lint errors. Existing generated declaration
warnings and the existing Vite chunk-size advisory may remain if unchanged.

- [ ] **Step 5: Audit final inventories and provenance**

Confirm exactly 9 category JSONs, 81 quizzes, 486 questions, 107 items, 94
Fluent PNGs, and 216 `word-game-*.mp3` files. Confirm all PNG/audio files decode,
every manifest hash matches, the Fluent license/notice is present, the old Noto
manifest/assets/license/notice are absent, no key or `.dev.vars` file is tracked,
and the working tree is clean.

- [ ] **Step 6: Commit Task 3 if integration changes were required**

```bash
git add docs tests src scripts content public THIRD_PARTY_NOTICES.md
git commit -m "test: verify richer word-game experience"
```

If Step 3–5 require no tracked changes, do not create an empty commit.
