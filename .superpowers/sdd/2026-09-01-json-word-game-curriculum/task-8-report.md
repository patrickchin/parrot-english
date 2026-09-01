# Task 8 report: Build gates and obsolete pipeline removal

## Scope and base

- Started from clean `fece8440ea5c314eab120312b749dce03a895acd` on `codex/json-word-game-curriculum` in the assigned linked worktree.
- Implemented Task 8 only. No push, merge, pull request, R2 mutation, audio generation, or Task 9 work was performed.
- Left curriculum JSON, Noto assets/provenance, the compiler, the generator, shared media helpers, all 107 label cues, retry/complete cues, and `narrator-feedback-success.mp3` unchanged.

## TDD evidence

Baseline:

- `npm test` — PASS, 1,697 tests, 0 failures.

RED before production edits:

- `node --test tests/word-game-package-flow.test.mjs tests/ci-workflows.test.mjs` — expected FAIL, 9 passed / 5 failed. Failures proved the combined package scripts/hooks and unconditional workflow command were absent, and that the generated-data runtime/static-audio seams did not yet exist.
- `node --test tests/generate-static-audio.test.mjs tests/static-audio.test.mjs` — expected FAIL, 28 passed / 2 failed. Failures proved lifecycle hooks still used the rhyme-only gate and the exact disk inventory still contained the 72 obsolete cues.

GREEN:

- `node --test tests/word-game-package-flow.test.mjs tests/ci-workflows.test.mjs` — PASS, 14/14.
- The new package-flow test constructs a minimal temporary package root from the existing fixture, appends a second strict JSON category, generates and imports the virtual catalog, and observes the appended category through generated output, runtime resolution, shelf categories, and flattened static-audio data.
- It uses exported pure seams (`createWordGameCatalog` and `createWordGameAudioLines`), real temporary files, and the existing fixture assets; it adds no dependency and makes no source-text/class assertions.

## Package and workflow gates

Added exactly:

- `generate:word-game-catalog`: `node scripts/generate-word-game-catalog.mjs`
- `check:word-game-catalog`: `node scripts/generate-word-game-catalog.mjs --check`
- `check:content-catalogs`: `npm run check:rhyme-catalog && npm run check:word-game-catalog`

Changed `predev:vite`, `predeploy:worker`, `pregenerate:audio:elevenlabs`, `prestart`, `pretest:browser`, and `pretest` to `npm run check:content-catalogs`. `prebuild` preserves the required order:

1. `npm run check:content-catalogs`
2. `node scripts/prepare-workers-ci-metadata.mjs`

The Cloudflare deployment workflow now runs the unconditional `npm run check:content-catalogs` step after FFmpeg installation and before credentials, media publishing, build, and deploy work. Tests retain checks that the step is neither conditional nor non-fatal.

## Exact cleanup and inventories

Read-only prevalidation confirmed all nine allowlisted legacy files were tracked before deletion:

- `content/media/word-games-v8.json`
- five exact files under `content/media/prompts/word-games-v8/`
- `scripts/word-game-media.mjs`
- `scripts/publish-word-game-media.mjs`
- `tests/word-game-media.test.mjs`

The `publish:word-game-media` package script was removed. No shared media helper or remote R2 object was touched.

Before binary cleanup, the exact tracked inventory was 181 word-game MP3s:

- 107 `-label.mp3`
- 36 `-prompt.mp3`
- 36 `-correct.mp3`
- `word-game-retry.mp3`
- `word-game-complete.mp3`

The 72 deletion targets were revalidated as tracked regular files under `public/assets/audio/` with the exact `word-game-…-(prompt|correct).mp3` suffixes before deletion. List hashes were:

- prompt list SHA-256: `2920a406dc369050e4feb38e6e56548ce218a9341fff0fb86a7401f59a0dcd70`
- correct list SHA-256: `48ecc1f38d435a6f1743e9f6afc519c0aa4da1d2e5c64a81bf81e2cbf051ffcf`

After cleanup, the exact disk inventory is 109 word-game MP3s:

- 107 generated item-label cues
- `word-game-retry.mp3`
- `word-game-complete.mp3`
- 0 prompt cues and 0 correct cues

The sorted post-cleanup list SHA-256 is `e1d4922f8496e28e0f8a86b5dec00d8c4846f8078224051c18d9df0662cd6003`. The static-audio test now derives this exact expected inventory dynamically from generated item data plus retry/complete, compares the complete sorted disk list, and decodes every remaining file. Repository searches found no remaining legacy prompt/correct audio references and no obsolete executable pipeline references.

## Verification

- `npm run check:content-catalogs` — PASS.
- `node --test tests/word-game-package-flow.test.mjs tests/ci-workflows.test.mjs tests/word-game-catalog.test.mjs tests/static-audio.test.mjs tests/web-assets.test.mjs` — PASS, 48/48.
- `node --test tests/generate-static-audio.test.mjs` — PASS, 8/8.
- Focused ESLint over all changed code/tests — PASS, 0 warnings/errors.
- `npm run build` — PASS (`tsc --noEmit` and Vite production build). Vite emitted its existing large-chunk advisory only.
- `npm run lint` — PASS with 0 errors and two warnings in unchanged generated `worker-configuration.d.ts` for unused disable directives.
- First post-change `npm test` run had one unrelated timing-sensitive guardian accessibility failure (1,677/1,678); the affected file has no diff, its focused reproduction passed 1/1, and a fresh full `npm test` passed 1,678/1,678.
- `npm run test:browser` was not run because Task 8 changes no responsive UI or rendered UI behavior.
- `git diff --check` — PASS before staging.
- Pre-report status summarized 7 modified files, 81 exact deletions (nine legacy files plus 72 MP3s), and one new package-flow test; forbidden-scope diff checks for curriculum, Noto, compiler, generator, and generated catalog returned empty.

## Concerns

No Task 8 blocker remains. The only observed non-Task-8 noise was the one non-reproducible accessibility test failure noted above and the existing build/lint advisories; no unrelated fix was attempted.
