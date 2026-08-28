# Old MacDonald final-review fix report

## Scope

This bounded round fixes all eight accepted findings from
`.superpowers/sdd/2026-08-28-old-macdonald-dubbing/final-review.md` against
base `b304bdf0392ab4d799f60c3c0db6652476bd02c9`.

## Red/green evidence

1. Status validation: the new bidirectional API test first accepted a complete
   payload for the other rhyme (`Missing expected rejection`), then passed after
   binding validation to the requested `dubId`.
2. Final-scene timing: the new Old MacDonald final-scene test first left
   `ended` at `0` after 28 seconds, then passed with a 28,000 ms scene clock;
   the separate full-rhyme regression confirms 150,000 ms.
3. Pig lyrics and farm semantics: the catalog test first reported the four
   `oink` lines where the required `snort` forms were expected; catalog and farm
   renderer tests pass with stable IDs and source-faithful text.
4. Duck card stability: the legacy project-home test first found visible
   `0 / 4`; Duck cards now retain their accessible status labels/icons while
   only Old MacDonald displays scene count text.
5. Home preview containment: browser geometry first found the Farm scene at
   x=-64 outside its 280 px card; phone, short-landscape, and desktop checks
   now pass with both local previews using a size query container.
6. Guide mock matching: Old MacDonald full playback first recorded no guide
   fetches; the mock now resolves its `guide-line-N` filename suffix to the
   canonical Old MacDonald line ID.
7. Shared-consent mock deletion: the cross-route scenario first returned
   `Continue dubbing` for Old MacDonald after revoke/re-grant; it now starts
   both rhymes empty.
8. Static audio: the strengthened test pins 35 authored slots, exactly 26
   guide IDs/files, no stale prefixed files, non-empty sizes, and ffprobe
   decoding for every file.

## Changed files

- `src/dubbing/dub-api.ts`, `src/dubbing/dub-playback.ts`,
  `src/dubbing/rhyme-catalog.ts`, `src/dubbing/dub-script.ts`
- `src/dubbing/DubProjectHome.tsx`, `src/dubbing/FarmScene.tsx`,
  `src/app/HomeMenu.tsx`, `src/testing/e2e-browser-mocks.ts`
- `tests/dub-api.test.mjs`, `tests/dub-playback.test.mjs`,
  `tests/dub-catalog.test.mjs`, `tests/dub-ui.test.mjs`,
  `tests/farm-scene.test.mjs`, `tests/static-audio.test.mjs`
- `tests/e2e/dubbing.spec.ts`, `tests/e2e/home-menu.spec.ts`
- `public/assets/audio/old-macdonald-v1-guide-line-17.mp3` through `-20.mp3`

## Audio evidence

Regenerated through ElevenLabs with `eleven_v3` and the process-scoped key:

- `old-macdonald-v1-guide-line-17`
- `old-macdonald-v1-guide-line-18`
- `old-macdonald-v1-guide-line-19`
- `old-macdonald-v1-guide-line-20`

The complete Old MacDonald inventory is 26 tracked MP3 files; every file is
non-empty and ffprobe-decodable. Git shows only those four MP3s changed.

## Verification

- Focused Node suites: 102 passing tests (API, playback, catalog, UI, farm,
  static audio, generator).
- Focused browser suites: 85 passing tests (`dubbing.spec.ts` and
  `home-menu.spec.ts`).
- Full unit suite: 1,380 passing tests.
- Full Playwright suite: 507 passing tests (`test-results/.last-run.json` is
  `passed`).
- `npm run build && npm run lint`: exit 0.
- `git diff --check`: clean.

## Commit

`fix: close Old MacDonald final review findings` (the final HEAD is supplied
with this report's delivery).

## Concerns

No remaining product concerns were found. The build emits Vite's existing
large-chunk advisory; lint exits 0 with two unused-disable warnings in the
generated `worker-configuration.d.ts`. Neither is changed by this round.

## Round 2: legacy final-scene timing compatibility

### Root cause

Round 1 replaced the final selected-range fallback from the whole-rhyme end
time to one inferred four-second cue cadence. That gives Old MacDonald's final
scene its required 28,000 ms clock, but Five Little Ducks has an authored
5,200 ms tail after its last cue. The cadence fallback therefore ended the
legacy Duck final scene at 16,000 ms instead of 17,200 ms.

The fix makes the final cue tail definition-owned: Five Little Ducks declares
5,200 ms and Old MacDonald declares 4,000 ms. Playback uses that value only
when a selected canonical range reaches its definition's final line; it has no
rhyme-ID branch. Full-rhyme playback continues to use each definition's
unchanged `durationMs`.

### Red/green evidence

- RED: the focused Duck final-scene regression failed 0/1 with actual
  `[16000]` versus expected `[17200]`.
- GREEN: the same focused regression passed 1/1 after the definition-owned
  tail was wired into the final-range fallback.
- Focused catalog/playback verification then passed 32/32 across two suites.

### Exact timing results

- Five Little Ducks final scene: 17,200 ms.
- Old MacDonald final scene: 28,000 ms.
- Five Little Ducks full rhyme: 98,000 ms.
- Old MacDonald full rhyme: 150,000 ms.
- The existing decoded-audio extension remains intact: a six-second final
  Duck take still extends its selected scene clock to 18,000 ms.

### Round 2 changed files

- `src/dubbing/dub-playback.ts`
- `src/dubbing/dub-script.ts`
- `src/dubbing/rhyme-catalog.ts`
- `tests/dub-playback.test.mjs`
- `.superpowers/sdd/2026-08-28-old-macdonald-dubbing/final-fix-report.md`

No audio, route, UI, storage, API, line ID, cue, or full-rhyme duration changed.

### Fresh round 2 verification

- Focused catalog/playback: 32 tests passed, 0 failed.
- Complete `npm test`: 1,381 tests in 122 suites passed, 0 failed.
- `npm run build && npm run lint`: exit 0; lint reported 0 errors and the two
  existing generated-file warnings.
- Complete `npm run test:browser`: 507 tests passed, 0 failed in 1.9 minutes.
- Static-audio suite: 13 tests passed, 0 failed.
- Media audit: 26 inventory files, 26 tracked, 26 non-empty, 26 ffprobe
  decodable, and 0 changed MP3s.
- `git diff --check`: exit 0.

### Round 2 commit

Focused commit message: `fix: preserve authored dub final tails`. The parent is
`ecd050617fcebb9944215de4579f76ab3d03f56c`; the immutable round 2 HEAD is
reported with delivery because this report is included in that commit.

### Round 2 concerns

No product concerns remain. The existing Vite large-chunk advisory and two
unused-disable warnings in generated `worker-configuration.d.ts` remain
non-blocking and are unrelated to this timing-only round. Playwright also emits
its existing `NO_COLOR`/`FORCE_COLOR` environment warning; all browser tests
pass. No audio was regenerated or modified.
