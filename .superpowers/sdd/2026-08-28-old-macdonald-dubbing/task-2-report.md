# Task 2 Report: Parameterize dubbing state and playback

Date: 2026-08-28

## Scope completed

Implemented Task 2 from the approved Old MacDonald dubbing plan by making dubbing state and Web Audio playback definition-aware while keeping Five Little Ducks as the default path.

The required additive interfaces now behave as requested:

- `createInitialDubState(definition = FIVE_LITTLE_DUCKS_DUB)`
- `reduceDubState(state, event, definition = FIVE_LITTLE_DUCKS_DUB)`
- `getDubSceneStatus(state, sceneIndex, definition = FIVE_LITTLE_DUCKS_DUB)`
- `startDubPlayback({ definition = FIVE_LITTLE_DUCKS_DUB, lines = definition.lines, ... })`

No serialized `DubState` fields changed. No event names changed. Existing fallback, omission, consent-loss, scheduler-abort, and cleanup behavior in playback was preserved.

## TDD record

### Red

Added a new reducer test proving the fixed four-line assumptions broke Old MacDonald scene selection and scene status:

- `tests/dub-state.test.mjs`
  - `uses the active rhyme's scene size and line count`

Added a new playback test proving authored-range validation and scene-relative scheduling were still hard-coded to Five Little Ducks:

- `tests/dub-playback.test.mjs`
  - `plays an Old MacDonald scene from scene-relative zero without treating it as the full rhyme`

Confirmed both failures before implementation:

- `node --test tests/dub-state.test.mjs`
- `node --test tests/dub-playback.test.mjs`

### Green

Updated `src/dubbing/dub-state.ts` so scene indexing, scene starts, line lookup, missing-line discovery, scene status, loaded-state restoration, continue behavior, and save/retake bookkeeping all read from the supplied definition instead of fixed duck constants.

Updated `src/dubbing/dub-playback.ts` so canonical-range validation, full-rhyme detection, trailing duration, default line selection, and default private audio URL resolution all use the active definition.

Extended the playback test harness to understand non-`line-N` IDs so the new catalog can be exercised through the existing fake `AudioContext`.

### Refactor / compatibility cleanup

`src/dubbing/DuckDub.tsx` needed a small type-only compatibility adjustment so the existing duck UI could continue passing its resolver into the now definition-aware playback surface:

- widened the resolver helper input to `{ id: string; text: string }`
- widened the temporary `unavailableLineIds` set to `Set<string>`
- annotated the local resolver wrapper against the shared rhyme line shape

This did not change runtime duck behavior.

## Files changed

- `src/dubbing/dub-state.ts`
- `src/dubbing/dub-playback.ts`
- `src/dubbing/DuckDub.tsx`
- `tests/dub-state.test.mjs`
- `tests/dub-playback.test.mjs`

## Verification

Fresh passing checks after the final edit:

- `node --test tests/dub-state.test.mjs tests/dub-playback.test.mjs`
- `npm run build`

Also ran:

- `git diff --check`

Build completed successfully. Vite reported the pre-existing large-chunk warning for `dist/assets/index-G0Fy5BE2.js` over 500 kB after minification; no new build failure resulted.

## Self-review

Checked the final diff specifically for the requested constraints:

- definition arguments remain optional
- Five Little Ducks remains the default
- `DubState` serialized shape is unchanged
- reducer event names are unchanged
- playback fallback and abort branches still have coverage and still pass

No additional behavioral issues found in the changed scope.

## Commit

Commit created after writing this report:

- `refactor: parameterize dubbing playback by rhyme`

