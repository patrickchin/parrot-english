# Listening-First Picture Word Games Implementation Plan

> **Execution note:** The user explicitly requested autonomous implementation,
> pull-request creation, and merge. Use strict red-green-refactor and continue
> through image generation, ElevenLabs audio generation, R2 publication, CI,
> and merge without waiting for a checkpoint.

**Goal:** Replace the single reading-heavy word quiz with six selectable,
listening-first picture games that teach 36 first words through premium saved
speech and isolated visuals.

**Architecture:** Keep one immutable topic catalog as content truth. Derive six
deterministic three-choice rounds per topic, render them through a shared player,
and derive static-audio metadata from the same authored sentences. Add a small
topic library plus canonical catalog/player routes. Use generated R2 WebPs for
30 illustrated targets and native CSS swatches for six colors.

**Tech stack:** TypeScript, React, Tailwind 4, saved ElevenLabs `eleven_v3`
audio, ImageGen, Sharp, Cloudflare R2/Wrangler, Node tests, Playwright, Vite,
GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-31-listening-picture-games-design.md`

## Task 1: Pin the topic catalog and deterministic round contract

**Files:** `tests/word-game-catalog.test.mjs`,
`src/games/word-game-catalog.ts`.

- [ ] Write failing tests for exactly six ordered topics and six ordered items
      per topic: Animals, Colors, Body Parts, Food, Toys, and Feelings.
- [ ] Pin every item's exact prompt with the capitalized target label first,
      teaching label, success sentence, stable audio IDs, alt text, and
      image/swatch representation.
- [ ] Pin 36 unique item IDs and 108 unique per-item audio IDs.
- [ ] Assert that all bitmap URLs are immutable
      `https://media.parrotbook.com/assets/v8/word-games/...webp` URLs and every
      color item uses a native swatch instead.
- [ ] Assert that `buildWordGameRounds` returns six three-choice rounds, targets
      every item once, rotates the correct-answer position, and never duplicates
      a choice within a round.
- [ ] Assert the catalog contains none of the retired vague prompts or
      soap/washing/cleanliness content.
- [ ] Run `node --test tests/word-game-catalog.test.mjs` and confirm the expected
      missing-module failure.
- [ ] Implement the smallest readonly catalog, resolver, route builder, and pure
      round builder that makes the focused tests pass.
- [ ] Run the focused test green and commit the catalog slice.

## Task 2: Make the word-game routes a selectable library

**Files:** `tests/app-routes.test.mjs`, `tests/app-shell-ui.test.mjs`,
`tests/product-streamline.test.mjs`, `tests/e2e/home-menu.spec.ts`,
`src/app/app-routes.ts`, `src/app/App.tsx`, `src/app/HomeMenu.tsx`,
`src/games/WordGameList.tsx`, `src/games/WordGameVisual.tsx`.

- [ ] Add failing route tests for `/word-games`, all six known
      `/word-games/:gameId` paths, the `/word-game` compatibility redirect,
      unknown-topic redirect, and safe auth-return handling that rejects
      arbitrary nested paths.
- [ ] Add failing rendered tests for six topic links and Back to home.
- [ ] Add a failing Playwright home-menu expectation that the activity points
      to `/word-games`.
- [ ] Run the focused Node route/shell tests and record the expected red output.
- [ ] Add a catalog-driven library with large topic cards, representative art or
      grouped swatches, short descriptions, shared headers, and shared actions.
- [ ] Register the canonical list/player routes and a replace redirect for the
      legacy singular route; keep static route ordering safe.
- [ ] Update the home card and exact safe-return helpers without broadening the
      allowlist.
- [ ] Run focused route/shell/product tests green and commit the navigation slice.

## Task 3: Replace the quiz with the listening-first picture player

**Files:** `tests/e2e/word-game.spec.ts`,
`src/games/FirstWordsGame.tsx` (delete),
`src/games/WordGamePlayer.tsx`, `src/games/WordGameVisual.tsx`, and narrowly
affected test media mocks in `src/testing/e2e-browser-mocks.ts`.

- [ ] Rewrite the first Playwright scenarios before implementation to require:
      an immediately active first round, prompt replay, three `Choose …` picture
      buttons, three separate `Listen: …` controls, and graceful blocked
      autoplay.
- [ ] Add a red assertion that `Listen: dog` plays “This is a dog.” but leaves
      progress, feedback, and selection unchanged.
- [ ] Add a red wrong-choice assertion for the selected teaching label followed
      by “Listen and try again.”, with the round still open.
- [ ] Assert a wrong choice stays non-punitive and selectable, all three choices
      remain enabled, and the learner can immediately choose the correct card.
- [ ] Add a red correct-choice assertion for the exact complete success sentence
      and automatic advancement after feedback, with no Next/Finish action.
- [ ] Have catalog/static-audio tests prove the exact text-to-ID/source mapping;
      have browser media mocks assert requested saved IDs/sources and state
      separation rather than claiming to inspect MP3 speech content.
- [ ] Add red assertions for six-round completion, Play again, question-heading
      focus, completion-heading focus, replacement cancellation, unmount
      cancellation, and a persistent sound error with continued visual play.
- [ ] Run only the principal Playwright scenario and confirm it fails against the
      retired quiz.
- [ ] Implement one player that resolves its route topic, derives rounds, shows
      the first round immediately, tolerates blocked initial autoplay, and uses
      `playAudioLine` / `playAudioSequence` with one generation-safe
      `AbortController`.
- [ ] Keep the picture selection and audio exploration as sibling buttons; never
      reveal a written answer label beneath the picture.
- [ ] Use calm retry state, explicit success state, real progressbar semantics,
      and no score/penalty language.
- [ ] Remove the old `FirstWordsGame` and all `playDeviceSpeech` usage from this
      product path.
- [ ] Run the focused Playwright behavior scenarios green and commit the player.

## Task 4: Derive and validate the saved word-game speech inventory

**Files:** `tests/static-audio.test.mjs`, `tests/word-game-catalog.test.mjs`,
`lib/static-audio.js`, and any minimal TypeScript declaration needed for the
manifest import.

- [ ] Add failing tests for three saved narrator lines per item plus the two
      generic lines, totaling 110 unique word-game entries.
- [ ] Assert exact `text`, stable IDs/paths, English narrator metadata,
      `energetic-character` voice style, role-specific young-child performance
      `ttsText`, and no collision with existing static audio.
- [ ] Assert every player/catalog audio ID resolves by ID so same-text lines do
      not depend on a linear speaker/text lookup.
- [ ] Run the focused catalog/static-audio tests and confirm the expected red
      count/resolution failures.
- [ ] Derive word-game static entries from catalog data rather than duplicating
      108 sentences in the audio manifest.
- [ ] Add one strict ID resolver if needed by the player; missing IDs must throw.
- [ ] Run the metadata tests green. Do not treat existing-file or decodability
      checks as proof that saved speech matches changed text or delivery;
      Task 5 must replace and audibly inspect every word-game clip.

## Task 5: Generate, inspect, and check in premium English audio

**Files:** `public/assets/audio/word-game-*.mp3`, `tests/static-audio.test.mjs`.

- [ ] Enumerate the 110 expected IDs and confirm they match the exact checked-in
      word-game MP3 inventory that must be replaced.
- [ ] Build an exact repeated `--only=<id>` argument list from manifest entries
      whose IDs start with `word-game-`; fail before generation unless it contains
      exactly the expected 110 unique IDs and no non-word-game ID.
- [ ] Invoke the generator with `--force`, an empty staging `--output-dir`, and
      that exact list. Let the script read the project credential from the
      environment or the worktree's ignored `.dev.vars`; never copy, source,
      print, or commit the key.
- [ ] Generate replacements for all 110 word-game lines with the pinned
      `eleven_v3` default, even though files with those names already exist.
- [ ] If rate limited, resume only missing staged files without `--force`; never
      replace a successful staged clip or fall back to local/system TTS.
- [ ] Verify the exact file inventory, nonzero bytes, MP3 decoding, duration
      sanity, and listen to a representative prompt/label/success/retry sample.
- [ ] Replace the exact checked-in word-game inventory only after staged audio
      passes inspection, then run `node --test tests/static-audio.test.mjs` green
      and commit metadata plus all regenerated MP3s.

## Task 6: Generate and prepare the isolated picture-card artwork

**Staging:** ignored `tmp/imagegen/word-games/v8/`.

**Committed provenance:** `content/media/word-games-v8.json`,
`content/media/prompts/word-games-v8/*.json`.

- [ ] Load the ImageGen prompting guidance and create one ordered 3×2 source
      sheet for each bitmap topic: Animals, Body Parts, Food, Toys, Feelings.
- [ ] Commit each exact prompt in the provenance directory. Prompts must demand one
      centered isolated subject per cell, consistent flat picture-book style,
      warm pale background, navy outline, no people/holding hands/scenes/text,
      and exact left-to-right row ordering.
- [ ] Inspect every sheet at original detail. Regenerate any sheet with a wrong
      item, ambiguous crop, extra object, embedded text, artifact, frightening
      expression, or style mismatch.
- [ ] Crop the five accepted sheets into 30 individual files with Sharp, leaving
      breathing room and no neighboring-cell leakage.
- [ ] Record every crop rectangle and output key in the committed manifest; add
      a per-card checklist for correct subject, margin, and zero adjacent-cell
      leakage.
- [ ] Normalize every public card to a consistent square WebP geometry and
      quality; verify decode, dimensions, unique hash, subject identity, and
      absence of accidental text.
- [ ] Review all 30 derived images as contact sheets before any upload.

## Task 7: Publish and verify immutable word-game media

**Files:** `content/media/word-games-v8.json`,
`content/media/prompts/word-games-v8/*.json`, `scripts/word-game-media.mjs`,
`scripts/publish-word-game-media.mjs`, `tests/word-game-media.test.mjs`,
`package.json`, and catalog URLs in `src/games/word-game-catalog.ts`.

- [ ] Build an explicit 30-entry source-to-key plan for
      `assets/v8/word-games/<topic>/<item>.webp` from the committed manifest.
- [ ] Add red tests for exact inventory, constrained source/prompt paths, unique
      targets/crops, in-bounds crop rectangles, deterministic WebP dimensions,
      immutable headers, dry-run behavior, overwrite refusal, and delivery
      verification.
- [ ] Implement the smallest dedicated media planner/publisher and package script;
      keep original sheets ignored while uploading them and committed prompts to
      the configured private provenance bucket.
- [ ] Preflight every public key through R2 and the media origin; require all 30
      to be absent before writing anything.
- [ ] Upload with `image/webp` and
      `public, max-age=31536000, immutable`, using the configured public bucket
      from the secure project vars.
- [ ] Verify every public URL with cache-busted requests for HTTP 200, exact MIME,
      immutable cache policy, positive length, expected dimensions, and image
      decode. Do not wire or commit a URL that fails delivery verification.
- [ ] Run catalog and web-asset tests green, inspect the real card renderer, and
      commit any final catalog corrections.

## Task 8: Complete responsive and accessible presentation

**Files:** `tests/e2e/word-game.spec.ts`, `tests/e2e/header.spec.ts`,
`src/games/WordGameList.tsx`, `src/games/WordGamePlayer.tsx`,
`src/games/WordGameVisual.tsx`.

- [ ] Add failing accessible containment tests at 280×568, 390×844, 640×360,
      768×360, and 1280×800 for both the library and active player.
- [ ] Require a deliberate 1/2/3-column choice grid: one below 360px, two from
      360px until the tablet breakpoint, and three at tablet/desktop widths.
- [ ] Assert that every picture, Listen control, progress indicator, and route
      header remains horizontally contained and keyboard reachable through
      automatic round transitions.
- [ ] Assert that desktop uses a materially larger active-game surface while the
      route remains a normal scrollable app page rather than exclusive fullscreen.
- [ ] Run the new responsive scenarios red, then tune only Tailwind utilities in
      the React components using shared controls and headers.
- [ ] Run the complete word-game and responsive-header Playwright files green.
- [ ] Open the local app in the in-app browser and manually inspect the library
      plus Animals, Colors, Body Parts, and Feelings at phone, short landscape,
      and desktop sizes; check audio, focus, scroll, console, and image loading.

## Task 9: Full verification and independent review

- [ ] Run focused catalog, audio, app-route, shell, product, static-media, and
      word-game tests.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, and
      `npm run test:browser` with zero failures.
- [ ] Run `git diff --check`, inspect all generated-file counts and hashes, and
      audit `git status` for secrets, staging files, browser artifacts, and
      unrelated changes.
- [ ] Re-read the design spec and review the exact diff against every goal and
      non-goal.
- [ ] Invoke the verification and requesting-code-review skills and dispatch an
      independent reviewer. Fix every confirmed finding with a regression test
      first, then rerun the affected and full gates.
- [ ] Commit the exact verified candidate.

## Task 10: Pull request, CI, merge, and main verification

- [ ] Fetch current `origin/main`, integrate it without force-pushing, and rerun
      affected gates if the base moved.
- [ ] Push `codex/listening-picture-games`, open a pull request with the design,
      content, media, accessibility, and test evidence, and monitor all CI checks.
- [ ] Diagnose any CI failure with the systematic-debugging skill and push only
      verified fixes.
- [ ] Use the finishing-development-branch skill after checks pass, squash-merge
      the PR, delete the remote branch, fetch `origin/main`, and verify that the
      merge commit contains the catalog, UI, all 110 audio files, and final tests.
