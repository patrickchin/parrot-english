Status: complete on 2026-08-28.

Summary:
- Extracted the existing duck dubbing controller into shared `DubStudio` state/UI orchestration.
- Added a local definition-driven `FarmScene` renderer for Old MacDonald scenes with motion-safe behavior and no remote artwork.
- Parameterized `DubProjectHome` and `DubSceneEditor` with `definition` and `Scene` so counts, titles, scene grids, and line counts derive from authored dub definitions while the existing Five Little Ducks route stays compatible through the `DuckDub` wrapper.
- Added focused tests for the farm renderer and Old MacDonald definition-driven UI while preserving the existing duck dubbing assertions.

Files changed:
- `src/dubbing/DubStudio.tsx`
- `src/dubbing/DubSceneTypes.ts`
- `src/dubbing/FarmScene.tsx`
- `src/dubbing/DuckDub.tsx`
- `src/dubbing/DubProjectHome.tsx`
- `src/dubbing/DubSceneEditor.tsx`
- `src/dubbing/dub-state.ts`
- `worker/dub-storage.ts`
- `worker/account-deletion.ts`
- `tests/farm-scene.test.mjs`
- `tests/dub-ui.test.mjs`

Verification:
- `node --test tests/farm-scene.test.mjs tests/dub-ui.test.mjs`
  - Red: failed first for missing `FarmScene` and hard-coded duck counts/titles.
- `node --test tests/farm-scene.test.mjs tests/dub-ui.test.mjs tests/dub-waveform.test.mjs`
  - Green: 46 passed.
- `npm run build`
  - Passed. Vite still reports the existing large-chunk warning for `dist/assets/index-*.js`.
- `npm run lint`
  - Passed with two existing warnings in `worker-configuration.d.ts` for unused eslint-disable directives.
- `npm run test:browser -- tests/e2e/dubbing.spec.ts`
  - Passed: 65 passed.

Concerns:
- Old MacDonald route and home wiring are intentionally not added here; Task 5 remains responsible for surfacing the new shared studio route in the app shell.
- `worker-configuration.d.ts` still emits two unrelated lint warnings that predate this task.
