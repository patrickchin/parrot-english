# Integration report — current main into richer word-game curriculum

Date: 2026-09-01

## Inputs

- Feature parent: `e010145412ea66ec5a6a68219fa440bac38d1ecd`
- Current-main parent: `7b69bc906f44bd2309bcf718d43c330d62073bb3`
- Merge base: `a894394f16afca4a677e6ddf486c765d1b47e2f9`
- Upstream word-game change reviewed directly: `02642c88` (`streamline word quiz feedback`)
- The integration brief, repository instructions, design/plan, Task 1–3 reports,
  conflicted stage-2/stage-3 blobs, and the unrelated nursery-dubbing commits were
  reviewed before resolution.

## Resolution

- Retained the feature's schema-v2 category structure, Fluent 3D assets, fixed
  81-quiz curriculum, prompt cues, generated JSON catalog, deep-frozen runtime,
  responsive tier/card UI, and prompt-parity evidence.
- Applied current main's short word-only label text and replacement label MP3s.
  The colors and food orange records deliberately share
  `word-game-shared-orange-label`; the two category-specific orange label files
  remain deleted.
- Kept player feedback JSON-owned. Correct feedback uses `word-game-correct` /
  `Correct!`; wrong feedback shows and plays only the selected short label;
  correct feedback plays the target label followed by the nonverbal correct cue
  and advances after playback settles.
- Kept prompt audio for the visible question, initial/next/replay playback, and
  the compact icon-only accessible Listen-again control.
- Allowed shared label IDs only through the `word-game-shared-*` contract, while
  prompt IDs remain category-prefixed. Duplicate audio registration is accepted
  only for identical ID/text/source contracts and conflicting reuse is rejected.
- Flattened both item cues plus the catalog-owned player cues into the static
  audio plan. The correct cue is directed as a nonverbal correct-answer ding;
  retry and completion retain their JSON-owned directions.
- Regenerated `src/games/generated-word-game-catalog.ts` only after the source
  manifests and compiler passed; no audio was regenerated and no TTS was used.
- Preserved every unrelated nursery-dubbing path from current main. Seventeen
  paths match `origin/main` byte-for-byte; the shared browser mock matches Git's
  exact three-way merge of main's dubbing changes and the feature's word-game
  playback telemetry.

## Verification

- Conflict-marker scan: no `<<<<<<<`, `=======`, or `>>>>>>>` markers remain.
- Source-only word-game tests before catalog regeneration: 86 passed.
- Focused manifest/compiler/curriculum/catalog/static-audio/package/player-build/
  Fluent suite: 129 passed.
- Isolated word-game Playwright on port 44121: 17 passed.
- `npm run check:content-catalogs`: passed.
- `npm test`: 1,622 passed.
- `npm run lint`: 0 errors; 2 pre-existing warnings in generated
  `worker-configuration.d.ts`.
- `npm run build`: passed; the existing Vite chunk-size warning remains.
- Full `npm run test:browser` on port 44122: 599 passed in 2.4 minutes.
- Final focused media/provenance rerun: 26 passed, including decode of every
  exact word-game MP3 and validation of every Fluent asset.

One focused run initially failed because the automatically merged static-audio
groups omitted current main's `narrator-feedback-success` legacy entry. The
failure was reproduced and traced to that missing upstream block, the exact
current-main entry was restored, and the focused and full gates then passed.

## Inventory and provenance audit

- 9 categories, 27 tiers, 81 quizzes, 486 questions, and 107 item records.
- 106 unique label cue IDs and 107 unique prompt cue IDs.
- 94 tracked Fluent 3D PNGs and exactly 216 tracked word-game MP3s.
- All media decode. Every Fluent PNG matches its pinned SHA-256 and 256×256
  contract. The exact Fluent MIT license hash is
  `c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383`,
  and the pinned revision and attribution remain in `THIRD_PARTY_NOTICES.md`.
- All 106 unique upstream label MP3 blobs plus `word-game-correct.mp3` match
  `origin/main` exactly, including the shared-orange label.
- All 107 prompt MP3 blobs match feature parent `e0101454` exactly.
- Retired Noto production artifacts/references are absent. No `.dev.vars`,
  `.key`, or `.pem` path is tracked.
- Both verification servers exited; neither audit port has a listener.

The required post-commit `git diff --check origin/main...HEAD`, merge-parent,
clean-worktree, and listener checks are recorded by the integration handoff.
