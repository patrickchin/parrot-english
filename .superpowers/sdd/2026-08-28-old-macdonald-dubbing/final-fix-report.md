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
