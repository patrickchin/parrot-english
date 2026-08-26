## Task 6 report: Target all Guardian settings without changing learner mode

### Outcome

- My Lessons, custom lesson creation/editing, Story settings, and Voice dubbing now resolve their learner from `useGuardianLearnerTarget` and render feature data only inside a ready, non-null learner target.
- All lesson list/load/generate/create/update links and requests preserve `learnerProfileId`; Back and successful saves return to the targeted Guardian lesson manager.
- Story profile/preferences and personalized art requests use the explicit target without reading or replacing the active learner context.
- Dubbing status, consent, and deletion use the explicit target. Settings no longer lock, switch learner mode, or expose switch-and-play actions; they link to Manage learners instead.
- Deterministic E2E state now isolates lessons, story preferences/art, and dubbing by learner while retaining Mia as `activeProfileId`.

### RED evidence

1. `node --test tests/app-routes.test.mjs tests/guardian-lesson-manager.test.mjs tests/lesson-creator-ui.test.mjs tests/lesson-editor-ui.test.mjs tests/guardian-story-settings.test.mjs tests/guardian-dubbing-settings.test.mjs`
   - Exit 1: 79 tests, 67 passed, 12 failed.
   - Failures showed missing targeted route/query propagation, unscoped active-Mia requests, absent selector behavior, and missing invalid-target fences.
2. `npx playwright test tests/e2e/multiple-learners.spec.ts --grep "targets Noah" --project=chromium`
   - Exit 1: 3 failed.
   - Each settings page lacked the shared target selector and could not prove Noah-specific data/mutations while Mia stayed in learner mode.

### GREEN verification

- `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/guardian-lesson-manager.test.mjs tests/lesson-creator-ui.test.mjs tests/lesson-editor-ui.test.mjs tests/guardian-story-settings.test.mjs tests/guardian-dubbing-settings.test.mjs`
  - 92 passed, 0 failed.
- `npx playwright test tests/e2e/multiple-learners.spec.ts --grep "targets Noah" --project=chromium`
  - 3 passed, 0 failed.
- `npx playwright test tests/e2e/multiple-learners.spec.ts --grep "targets Noah through lesson" --project=chromium --repeat-each=5`
  - 5 passed, 0 failed after making the post-refresh assertion wait for app/mock bootstrap.
- `npx playwright test tests/e2e/dubbing.spec.ts tests/e2e/lesson-creator.spec.ts tests/e2e/personalized-story-art.spec.ts tests/e2e/guardian-learner-target.spec.ts --project=chromium`
  - 78 passed, 0 failed.
- `npm test`
  - 1321 passed, 0 failed.
- `npm run lint`
  - Exit 0; 0 errors and 2 existing warnings in generated `worker-configuration.d.ts`.
- `npm run build`
  - Exit 0; TypeScript and Vite production build succeeded (existing large-chunk advisory only).
- `git diff --check`
  - Exit 0.

`npm run test:browser` completed with 403 passed and 41 failed before the final reload-bootstrap test fix. One failure was the Task 6 lesson E2E race; it was fixed and then passed 5/5 in parallel repetition and in the final 3/3 targeted run. The remaining 40 failures are pre-existing Task 5 route/assertion migrations already assigned to Task 9; affected Task 6 browser surfaces are green as listed above.

### Self-review

- Confirmed each feature hook/component is mounted only for `ready` with non-null learner ID and learner name; loading, error, empty, and invalid phases cannot issue feature requests.
- Confirmed every feature request in the five settings/lesson surfaces receives `learnerProfileId` and target changes abort/unmount stale work.
- Confirmed no targeted settings code imports the active learner context, replaces the active profile, invokes Guardian locking, or exposes a learner-switch mutation.
- Confirmed the selector remains visible and accessible, names both Mia and Noah in E2E, and identifies the editing target.
- Confirmed only Task 6 implementation/tests/report are staged; the untracked design and plan documents remain untouched and uncommitted.

### Commit

`feat: target guardian settings by learner` (this report is included in the Task 6 commit; SHA is recorded in the handoff).
