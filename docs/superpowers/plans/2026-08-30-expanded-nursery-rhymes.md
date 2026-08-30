# Expanded Nursery Rhymes Implementation Plan

> **Execution note:** The user explicitly requested autonomous implementation,
> pull-request creation, and merge. Use strict red-green-refactor and continue
> through media generation, CI, and merge without waiting for a checkpoint.

**Goal:** Add four famous nursery rhymes, give all six rhymes their recognizable
melodies and complete dubbing flows, replace all nursery artwork with generated
Storytime-style illustrations, and merge the verified result.

**Architecture:** Keep `DUB_DEFINITIONS` as the content source of truth. Extend
the score selector to support either repeating scene phrases or a whole-song
phrase list. Render catalog routes and shelf cards generically. Derive saved
guide metadata from the catalog, check in generated ElevenLabs MP3s, and publish
normalized generated images to immutable R2 keys.

**Tech stack:** TypeScript, React, Tailwind 4, Web Audio, ElevenLabs static TTS,
ImageGen, Sharp, Cloudflare R2/Wrangler, Node tests, Playwright, Vite, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-30-expanded-nursery-rhymes-design.md`

## Task 1: Pin the expanded catalog and score behavior

**Files:** `tests/dub-catalog.test.mjs`, `tests/dub-playback.test.mjs`,
`src/dubbing/dub-melodies.ts`, `src/dubbing/rhyme-catalog.ts`,
`src/dubbing/dub-playback.ts`.

- [ ] Add failing tests for six definitions, exact lyrics/routes/scenes/timings,
      valid repeating-or-whole-song score shapes, and cross-scene phrase lookup.
- [ ] Run focused tests and confirm the expected red failures.
- [ ] Add the four immutable traditional scores and definitions.
- [ ] Add one pure score-phrase selector and use it for scheduling and outro
      timing without changing old-rhyme behavior.
- [ ] Run focused tests green and refactor only proven duplication.

## Task 2: Make guides and application routing catalog-driven

**Files:** `tests/static-audio.test.mjs`, `tests/app-routes.test.mjs`,
`tests/app-shell-ui.test.mjs`, `lib/static-audio.js`, `src/app/App.tsx`,
`src/app/app-routes.ts`, and affected e2e/browser mocks.

- [ ] Add failing tests that every distinct catalog line has one saved guide
      entry and every definition route is declared/rendered.
- [ ] Replace rhyme-specific guide metadata with one catalog-driven builder.
- [ ] Register catalog routes with the shared `DubStudio` and illustrated scene.
- [ ] Update narrow hardcoded test mocks to derive from definitions.
- [ ] Keep compatibility route helpers and Five Little Ducks exports intact.
- [ ] Run route, shell, static-audio metadata, API, worker, and dubbing tests.

## Task 3: Complete and test the six-card shelf

**Files:** `tests/e2e/nursery-rhymes.spec.ts`, relevant rendered UI tests,
`src/dubbing/NurseryRhymeList.tsx`.

- [ ] Add failing accessible tests for all six cards, routes, and balanced
      responsive containment at phone, tablet, and desktop sizes.
- [ ] Render `DUB_DEFINITIONS` directly in a 1/2/3-column Storytime-like shelf.
- [ ] Use large artwork, compact non-wrapping hierarchy where possible, and a
      full-width “Sing & record” control.
- [ ] Run focused component and Playwright tests green.

## Task 4: Generate and verify saved guide audio

**Files:** `public/assets/audio/*.mp3`, `lib/static-audio.js`,
`src/dubbing/dub-waveform.ts`, `tests/static-audio.test.mjs`.

- [ ] Enumerate only missing distinct new-rhyme guide IDs.
- [ ] Generate each file with the repository's ElevenLabs provider and secure
      project key; never print or commit the key.
- [ ] Verify non-empty MP3 files and decode durations.
- [ ] Derive 32-bar waveform peaks from each generated guide.
- [ ] Run static-audio and waveform tests green.

## Task 5: Generate the Storytime-style image set

**Staging:** ignored `content/local-dubbing/2026-08-30/`.

- [ ] Use the three reviewed Storytime images as style references and generate
      first-scene anchors for all six rhymes with no text or watermark.
- [ ] Inspect every anchor at original detail; iterate any mismatch.
- [ ] Generate the remaining scenes using both Storytime and accepted character
      anchors, then generate the combined shelf cover.
- [ ] Inspect all 21 outputs for style, character continuity, scene distinction,
      child safety, and absence of text/artifacts.
- [ ] Normalize selected outputs to 1536×864 WebP and verify metadata/decode.

## Task 6: Publish immutable artwork and wire the manifest

**Files:** `src/dubbing/dub-artwork.ts`, `tests/dub-catalog.test.mjs`; optional
minimal guarded publish/verify script only if it reduces repeated unsafe commands.

- [ ] Add failing artwork-manifest tests for all 21 unique v6 URLs and alt text.
- [ ] Preflight every `assets/v6/dubbing/...` key to avoid overwrite.
- [ ] Publish with `image/webp` and `public, max-age=31536000, immutable`.
- [ ] Verify every public URL's status, headers, dimensions, and decode.
- [ ] Update the manifest and run catalog/render tests green.

## Task 7: Full quality and visual verification

- [ ] Run focused dubbing, API, worker, route, static-media, and UI tests.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, and
      `npm run test:browser`.
- [ ] Start the local app and use a real browser at phone and desktop sizes.
      Verify the six-card shelf, all six routes, scene images, Hear line,
      full/scene playback start-stop, back behavior, focus, and console.
- [ ] Inspect `git diff --check`, generated asset inventory, complete diff, and
      status. Confirm no secret or unrelated change is present.

## Task 8: Review, pull request, CI, and merge

- [ ] Re-read the spec and review the final diff against every goal/non-goal.
- [ ] Use the verification and code-review skills on the exact commit candidate.
- [ ] Commit, fetch latest `origin/main`, integrate without force-pushing, and
      rerun affected gates if the base moved.
- [ ] Push `codex/more-nursery-rhymes`, open a PR with evidence, and monitor CI.
- [ ] Diagnose and fix failures autonomously with ordinary follow-up commits.
- [ ] Squash-merge after required checks pass, delete the remote branch, verify
      the merge on `origin/main`, and mark the active goal complete.
