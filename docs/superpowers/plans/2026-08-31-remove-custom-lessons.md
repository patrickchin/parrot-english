# Custom Lessons Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely remove the current My Lessons/custom-lesson capability and its stored D1/R2 data paths while preserving built-in lessons and unrelated personalization.

**Architecture:** Delete the vertical custom-lesson feature instead of masking it. First remove learner and Guardian entry points, then collapse lesson and recording contracts to the built-in catalog, remove the worker/schema capability, and add a separately invokable, guarded R2 data-purge utility. Existing migrations remain immutable; one forward migration drops the current table.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, Cloudflare Workers/D1/R2, Drizzle, Node test runner, Playwright, Tailwind 4.

**Spec:** [docs/superpowers/specs/2026-08-31-remove-custom-lessons-design.md](../specs/2026-08-31-remove-custom-lessons-design.md)

## Global Constraints

- Treat “customize and personal lessons” as the existing My Lessons/custom lessons/Made for you feature only; do not remove personalized story art.
- Preserve built-in lesson audio, full-scene artwork, join-in recording consent, and built-in `parrot` recording behavior.
- Do not add dependencies or replacement feature flags.
- Keep historical migration files and snapshots unchanged; add one forward migration for `learner_lesson` removal.
- The private R2 bucket is shared. Delete only keys matching `personalized-story-art/<account>/lesson-recordings/my/...` or `personalized-story-art/<account>/learners/<learner>/lesson-recordings/my/...`.
- The R2 purge utility must be dry-run by default and require an explicit `--execute` flag; do not run remote deployment, migration, or purge as part of local verification.
- Follow `AGENTS.md`: retain Tailwind/shared UI conventions and run `npm run test:browser` for responsive UI changes.
- Preserve learner-supplied names and the authored-name pool rules in all remaining lesson content.

---

## File structure

- `src/app/app-routes.ts` becomes the built-in-only lesson route contract.
- `src/app/App.tsx`, `src/app/GuardianDashboard.tsx`, and `src/lessons/LessonList.tsx` retain only visible built-in lesson navigation.
- `src/lessons/lesson-recording-api.ts` and `src/lessons/lesson-recording-queue.ts` retain only built-in recording slots.
- `worker/index.ts`, `worker/api-security.ts`, `worker/guardian-access.ts`, and `worker/build-info.ts` lose custom-lesson capability and configuration wiring.
- `worker/lesson-recording-catalog.ts`, `worker/lesson-recordings.ts`, and `worker/lesson-recording-storage.ts` retain the built-in upload path and drop only My-specific branches.
- `src/db/schema.ts` and a new migration remove `learner_lesson` without editing migration history.
- `scripts/purge-custom-lesson-recordings.mjs` is an auditable, explicit one-time R2 cleanup utility using Cloudflare’s object REST API.
- Tests move from validating My Lessons to asserting its absence and validating unchanged built-in behavior.

### Task 1: Remove all visible custom-lesson routes and screens

**Files:**

- Modify: `src/app/App.tsx`, `src/app/app-routes.ts`, `src/app/GuardianDashboard.tsx`, `src/lessons/LessonList.tsx`, `src/app/AccountDeleteDialog.tsx`
- Delete: `src/lessons/GuardianLessonManager.tsx`, `src/lessons/LessonCreator.tsx`, `src/lessons/LessonGuiEditor.tsx`, `src/lessons/LessonScenePreview.tsx`, `src/lessons/lesson-creator-script.ts`, `src/lessons/my-lessons-api.ts`, `src/lessons/useMyLessons.ts`
- Delete: `tests/guardian-lesson-manager.test.mjs`, `tests/lesson-creator-ui.test.mjs`, `tests/lesson-gui-editor-ui.test.mjs`, `tests/lesson-scene-preview-ui.test.mjs`, `tests/my-lessons-api.test.mjs`, `tests/my-lessons-hook.test.mjs`
- Modify: `tests/app-routes.test.mjs`, `tests/app-shell-ui.test.mjs`, `tests/lesson-list-page.test.mjs`, `tests/product-streamline.test.mjs`

**Interfaces:**

- Consumes: existing built-in `resolveParrotLessonRouteDecision`, `LessonList`, `GuardianDashboard`, and `ApplicationRoutes`.
- Produces: no `/guardian/lessons`, `/lessons/my/create`, or `/lessons/my/:lessonId` browser route; no Guardian card, shelf section, client hook, or feature-only UI module.

- [ ] **Step 1: Add absence assertions to rendered route and shelf tests**

  Add observable assertions before deleting implementation:

  ```js
  assert.equal("getGuardianLessonsPath" in routes, false);
  assert.equal("getMyLessonCreatePath" in routes, false);
  assert.equal("resolveMyLessonRouteDecision" in routes, false);
  assert.doesNotMatch(html, /Made for you|My Lessons|custom lesson/i);
  ```

  In the Guardian dashboard test, render `GuardianDashboardView` and assert its headings are `Manage learners`, `Story settings`, `Voice dubbing`, and `Account & privacy`, with no `My Lessons` heading or manage-lessons link.

- [ ] **Step 2: Run the focused tests to prove the new contract is red**

  Run:

  ```bash
  node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/lesson-list-page.test.mjs tests/product-streamline.test.mjs
  ```

  Expected: failures mentioning still-exported My Lesson helpers, My Lesson markup, and the current Guardian card.

- [ ] **Step 3: Delete feature entry points and make navigation built-in-only**

  Apply these minimal structural changes:

  ```tsx
  // src/app/App.tsx: retain only the built-in routes
  <Route element={<LessonList />} path="/lessons" />
  <Route element={<ParrotLessonRedirect />} path="/lessons/parrot/:lessonId" />
  <Route
    element={<ParrotLessonSceneRoute />}
    path="/lessons/parrot/:lessonId/scenes/:sceneNumber"
  />
  ```

  Remove lazy imports, imports, route patterns, and route elements for the creator,
  manager, and My lesson player. Remove My lesson paths/helpers/decisions from
  `app-routes.ts`, the My shelf, its fetch/retry status, the dashboard card, and
  My Lessons account-deletion wording. Delete every now-unreferenced component
  and its sole test file with `apply_patch` deletion blocks.

- [ ] **Step 4: Run focused tests and a type build**

  Run:

  ```bash
  node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/lesson-list-page.test.mjs tests/product-streamline.test.mjs
  npm run build
  ```

  Expected: all named tests pass and TypeScript reports no removed component or
  helper import.

- [ ] **Step 5: Commit the self-contained UI deletion**

  ```bash
  git add src/app src/lessons tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/lesson-list-page.test.mjs tests/product-streamline.test.mjs
  git commit -m "refactor: remove custom lesson screens"
  ```

### Task 2: Collapse lesson-player and browser recording contracts to built-ins

**Files:**

- Modify: `src/app/App.tsx`, `src/app/app-routes.ts`, `src/lessons/LessonList.tsx`, `src/lessons/lesson-recording-api.ts`, `src/lessons/lesson-recording-queue.ts`
- Modify: `tests/app-routes.test.mjs`, `tests/lesson-recording-api.test.mjs`, `tests/lesson-recording-queue.test.mjs`, `tests/e2e/lesson-player.spec.ts`
- Delete from test coverage: My lesson-specific player and queue cases

**Interfaces:**

- Consumes: the Task 1 built-in-only routes and the existing saved-audio player.
- Produces: `getLessonPath(lessonId)` and `getLessonScenePath(lessonId, sceneIndex)` always target `/lessons/parrot`; `LessonRecordingSlot` contains only `lessonId`, `sceneIndex`, and `stepIndex`.

- [ ] **Step 1: Make the built-in-only route and recording tests fail**

  Replace source-dependent test fixtures with these final expectations:

  ```js
  assert.equal(
    routes.getLessonScenePath("01-peppas-high-ball", 0),
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
  );

  assert.equal(
    request.calls[0][0],
    "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
  );
  assert.equal("X-Parrot-Lesson-Revision" in request.calls[0][1].headers, false);
  ```

  Delete cases that construct `source: "my"` or `lessonRevision`, then add a
  queue concurrency case with two different built-in lesson/scene/step slots.

- [ ] **Step 2: Run the focused client tests and observe source-contract failures**

  Run:

  ```bash
  node --test tests/app-routes.test.mjs tests/lesson-recording-api.test.mjs tests/lesson-recording-queue.test.mjs
  ```

  Expected: failures because callers still pass source and revisions, and the
  queue key still includes a source.

- [ ] **Step 3: Make the player and recording client explicitly built-in-only**

  Replace source dispatch with the saved-audio path:

  ```tsx
  const audioLine = getLessonAudioLine(state, currentLesson);
  if (!audioLine) return;
  startPlayback = (signal, onPlaybackControl) =>
    playAudioLine({ ...audioLine, onPlaybackControl, signal });
  ```

  Remove `LessonSource`, `source`, and `lessonRevision` from the player and
  route-decision props. Make route helpers accept only a lesson ID. In the
  recording browser API, use a fixed `parrot` URL segment and remove the revision
  header/result branch. Change queue keys to:

  ```ts
  JSON.stringify([slot.lessonId, slot.sceneIndex, slot.stepIndex])
  ```

  Do not delete `src/media/device-speech.ts`; the word game and stories still use
  it.

- [ ] **Step 4: Verify player and recording behavior**

  Run:

  ```bash
  node --test tests/app-routes.test.mjs tests/lesson-recording-api.test.mjs tests/lesson-recording-queue.test.mjs tests/device-speech.test.mjs
  npx playwright test tests/e2e/lesson-player.spec.ts
  npm run build
  ```

  Expected: built-in playback and queued recording checks pass, and no My lesson
  test remains in the player spec.

- [ ] **Step 5: Commit the compact shared contract**

  ```bash
  git add src/app/App.tsx src/app/app-routes.ts src/lessons/LessonList.tsx src/lessons/lesson-recording-api.ts src/lessons/lesson-recording-queue.ts tests
  git commit -m "refactor: make lesson playback built-in only"
  ```

### Task 3: Delete the custom-lesson worker capability and configuration

**Files:**

- Modify: `worker/index.ts`, `worker/api-security.ts`, `worker/guardian-access.ts`, `worker/build-info.ts`, `lib/lesson-data.js`, `lib/lesson-visual-catalog.ts`, `src/lessons/lesson-catalog.ts`, `wrangler.jsonc`, `worker-configuration.d.ts`, `vite.config.ts`, `src/app/AboutDialog.tsx`
- Delete: `worker/my-lessons.ts`, `worker/my-lessons-repository.ts`, `worker/lesson-generator.ts`, `worker/prompts/lesson-generator.ts`, `worker/model-config.ts`, `lib/lesson-language.js`
- Delete: `tests/my-lessons-routing.test.mjs`, `tests/my-lessons-worker.test.mjs`, `tests/lesson-generator.test.mjs`, `tests/lesson-creator-prompt.test.mjs`, `tests/lesson-language.test.mjs`
- Modify: `tests/worker-delivery.test.mjs`, `tests/guardian-access-worker.test.mjs`, `tests/api-security.test.mjs`, `tests/build-info.test.mjs`, `tests/auth-infrastructure.test.mjs`, `tests/lifecycle/accessibility-lifecycle.test.mjs`

**Interfaces:**

- Consumes: Task 1 browser removal and existing Worker API dispatch.
- Produces: `/api/lessons/my` requests are unmatched API 404s; `BuildInfo` no longer carries `backend.details.models.lessonScript`; no `LESSON_GENERATION_RATE_LIMITER` binding or generator model remains.

- [ ] **Step 1: Add negative worker and build-info contract tests**

  Add an unknown-API assertion before removing routing:

  ```js
  const response = await worker.fetch(
    new Request("https://example.test/api/lessons/my"),
    env,
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
  ```

  Update the build-info expected backend payload to omit `details` entirely and
  assert that its serialized JSON does not contain `lessonScript`. Assert that
  `RateLimitEnv` and generated Worker types do not mention
  `LESSON_GENERATION_RATE_LIMITER`.

- [ ] **Step 2: Run focused worker tests to prove the feature still exists**

  Run:

  ```bash
  node --test tests/worker-delivery.test.mjs tests/guardian-access-worker.test.mjs tests/api-security.test.mjs tests/build-info.test.mjs tests/auth-infrastructure.test.mjs
  ```

  Expected: custom API path returns its current auth/handler behavior, and tests
  still discover generator configuration.

- [ ] **Step 3: Remove the endpoint, generator, rate limit, and presentation wiring**

  Delete the custom handler import, environment/dependency types, `isMyLessonPath`
  helper, dispatch branch, generator rate-limit call, Guardian access rules, and
  build-info model field. Remove the R2 rate-limit binding from `wrangler.jsonc`,
  then regenerate exactly with:

  ```bash
  npx wrangler types --config=wrangler.jsonc
  ```

  Delete the generator/repository modules and tests. Remove `prepareLesson`, its
  draft type, and `LESSON_BACKGROUNDS` only after their feature-only callers are
  gone. Keep `createLessonCatalog` and built-in schema validation. Remove custom
  lesson privacy/model rows from `AboutDialog` and the Vite mock build-info
  response.

- [ ] **Step 4: Verify that the Worker has no custom capability**

  Run:

  ```bash
  node --test tests/worker-delivery.test.mjs tests/guardian-access-worker.test.mjs tests/api-security.test.mjs tests/build-info.test.mjs tests/auth-infrastructure.test.mjs tests/lesson-data.test.mjs
  npm run build
  ```

  Expected: all routes/configuration tests pass; built-in lesson data validation
  remains covered without `prepareLesson` tests.

- [ ] **Step 5: Commit the worker capability removal**

  ```bash
  git add worker lib src/lessons/lesson-catalog.ts src/app/AboutDialog.tsx vite.config.ts wrangler.jsonc worker-configuration.d.ts tests
  git commit -m "refactor: remove custom lesson worker APIs"
  ```

### Task 4: Remove My-specific recording server branches and the D1 table

**Files:**

- Modify: `worker/lesson-recording-catalog.ts`, `worker/lesson-recordings.ts`, `worker/lesson-recording-storage.ts`, `worker/learner-deletion.ts`, `src/db/schema.ts`
- Create: the Drizzle-generated forward migration and current schema snapshot for dropping `learner_lesson`
- Modify: `tests/lesson-recording-worker.test.mjs`, `tests/lesson-recording-storage.test.mjs`, `tests/guardian-access-schema.test.mjs`, `tests/learner-deletion.test.mjs`, `tests/multiple-learners-migration.test.mjs`
- Delete or trim: tests that insert `learner_lesson` solely to exercise a My Lesson branch

**Interfaces:**

- Consumes: Task 2 `LessonRecordingSlot` with no source/revision and Task 3 removal of the My repository.
- Produces: recording routes accept `/api/lesson-recordings/parrot/<lesson>/scenes/<scene>/steps/<step>` only; `resolveLessonRecordingTarget` returns built-in target text only; no active schema table named `learner_lesson`.

- [ ] **Step 1: Add server-side rejection and migration end-state tests**

  Add a handler test for a valid-format My route that expects `404/not_found`:

  ```js
  const response = await handleLessonRecordingRequest({
    database,
    env,
    identity,
    request: new Request(
      "https://example.test/api/lesson-recordings/my/lesson-1/scenes/0/steps/0",
      { method: "PUT" },
    ),
  });
  assert.equal(response.status, 404);
  ```

  In the migration suite, apply all production migrations to the test database
  and assert `SELECT * FROM learner_lesson` fails with SQLite’s missing-table
  error. Add a storage test that built-in object keys are fixed under
  `/lesson-recordings/parrot/` and contain no lesson-generation metadata.

- [ ] **Step 2: Run the recording and migration tests to establish red state**

  Run:

  ```bash
  node --test tests/lesson-recording-worker.test.mjs tests/lesson-recording-storage.test.mjs tests/guardian-access-schema.test.mjs tests/learner-deletion.test.mjs tests/multiple-learners-migration.test.mjs
  ```

  Expected: My routes remain accepted or table queries still work, so the new
  absence assertions fail.

- [ ] **Step 3: Retain only the built-in recording data flow and generate a forward migration**

  Make route parsing accept only the literal `parrot` source. Make the catalog
  resolve only the imported built-in lesson JSON and return `{ targetText }`.
  Remove revision/generation checks, My-specific metadata, and
  `deleteLessonRecordingsForLesson`. Keep consent generation, upload fencing,
  account/learner deletion guards, retry behavior, and generic recording-prefix
  cleanup.

  Remove the `learnerLesson` Drizzle table and the legacy deletion SQL entry.
  Generate the forward migration from the schema:

  ```bash
  npm run db:generate -- --name remove-learner-lessons
  ```

  Confirm its SQL is exactly a table drop for `learner_lesson`, with no changes to
  historical migration files. If the generator emits any unrelated schema change,
  stop and reconcile the schema snapshot before proceeding.

- [ ] **Step 4: Verify built-in recording and migration behavior**

  Run:

  ```bash
  node --test tests/lesson-recording-worker.test.mjs tests/lesson-recording-storage.test.mjs tests/guardian-access-schema.test.mjs tests/learner-deletion.test.mjs tests/multiple-learners-migration.test.mjs
  npm run build
  ```

  Expected: only built-in recording requests can persist, profile/account cleanup
  still handles built-in keys, and all migrations end without `learner_lesson`.

- [ ] **Step 5: Commit the schema and recording simplification**

  ```bash
  git add worker src/db/schema.ts migrations tests
  git commit -m "refactor: remove custom lesson recordings and data"
  ```

### Task 5: Add the guarded R2 custom-recording purge utility

**Files:**

- Create: `scripts/purge-custom-lesson-recordings.mjs`
- Create: `tests/purge-custom-lesson-recordings.test.mjs`
- Modify: `package.json`, `README.md` or a deployment runbook section with the exact dry-run and execute commands

**Interfaces:**

- Consumes: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `--bucket <name>`, and optional `--execute`.
- Produces: `isCustomLessonRecordingKey(key)`, paginated Cloudflare REST listing, dry-run count output, explicit sequential deletion, and a zero-match verification pass.

- [ ] **Step 1: Write failing unit tests for exact key matching and pagination**

  Test both legal shapes and nearby non-targets:

  ```js
  assert.equal(
    isCustomLessonRecordingKey(
      "personalized-story-art/user/learners/learner/lesson-recordings/my/a/scene-0/step-0.audio",
    ),
    true,
  );
  assert.equal(
    isCustomLessonRecordingKey(
      "personalized-story-art/user/learners/learner/lesson-recordings/parrot/a/scene-0/step-0.audio",
    ),
    false,
  );
  ```

  Mock two list pages with distinct cursors. Assert dry-run makes no DELETE
  requests, execute deletes only target keys, and a repeated/missing next cursor
  rejects before deletion continues.

- [ ] **Step 2: Run the new script test and verify it fails to import**

  Run:

  ```bash
  node --test tests/purge-custom-lesson-recordings.test.mjs
  ```

  Expected: module-not-found failure for the new purge utility.

- [ ] **Step 3: Implement a dependency-free Cloudflare REST purge command**

  Export a strict matcher and use the R2 objects endpoint with a `prefix` of
  `personalized-story-art/`, `per_page=1000`, and each response cursor. Build
  object URLs by encoding individual key segments while retaining `/` separators:

  ```js
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
  const objectUrl = `${base}/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodedKey}`;
  ```

  Require non-empty account ID/token/bucket values. With no `--execute`, print the
  exact match count and keys but make no DELETE requests. With `--execute`, delete
  each exact key, reject unsuccessful API envelopes, then perform a fresh paginated
  scan and require zero matches. Add the script as:

  ```json
  "purge:custom-lesson-recordings": "node scripts/purge-custom-lesson-recordings.mjs"
  ```

- [ ] **Step 4: Verify utility behavior without remote mutation**

  Run:

  ```bash
  node --test tests/purge-custom-lesson-recordings.test.mjs
  npm run purge:custom-lesson-recordings -- --help
  ```

  Expected: mocked dry-run/execute/pagination tests pass; help output documents
  `--bucket` and `--execute`; no Cloudflare API credentials are required for help.

- [ ] **Step 5: Commit the audited cleanup utility**

  ```bash
  git add scripts/purge-custom-lesson-recordings.mjs tests/purge-custom-lesson-recordings.test.mjs package.json README.md
  git commit -m "feat: add custom lesson recording purge utility"
  ```

### Task 6: Remove legacy mocks, browser coverage, and current documentation

**Files:**

- Modify: `src/testing/e2e-browser-mocks.ts`, `vite.config.ts`, `src/app/AccountDeleteDialog.tsx`, `README.md`, `docs/README.md`, `docs/lesson-json-schema.md`, `docs/lesson-writing-quick-guide.md`, `docs/design/audio-and-content-pipeline.md`, `docs/design/personalized-story-art.md`, `docs/design/product-experience.md`, `docs/design/technical-architecture.md`, `docs/deployment/multiple-learner-rollout.md`
- Delete: `tests/e2e/lesson-creator.spec.ts`
- Modify: `tests/e2e/account-sign-out-feedback.spec.ts`, `tests/e2e/guardian-mode.spec.ts`, `tests/e2e/guardian-route-traversal.spec.ts`, `tests/e2e/header.spec.ts`, `tests/e2e/lesson-player.spec.ts`, `tests/e2e/multiple-learners.spec.ts`, `tests/e2e/personalized-story-art.spec.ts`, `tests/e2e/shared-control-contrast.spec.ts`, `tests/e2e/shared-focus-visibility.spec.ts`, `tests/e2e/surrounding-pages.spec.ts`

**Interfaces:**

- Consumes: Tasks 1–5 final contracts.
- Produces: browser fixtures and documentation that know only built-in lesson routes/recordings; historical migration and superseded `docs/superpowers` records remain intentionally untouched.

- [ ] **Step 1: Convert browser tests to absence/retained-behavior checks**

  Replace custom-flow test blocks with accessible assertions such as:

  ```ts
  await expect(page.getByRole("heading", { name: "My Lessons" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create custom lesson" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Story settings" })).toBeVisible();
  ```

  Remove the creator spec and My Lesson API mock state/routes from both the Vite
  mock server and `e2e-browser-mocks.ts`. Preserve built-in recording-media mocks
  with a fixed `parrot` source and remove revision/change outcomes.

- [ ] **Step 2: Run the affected browser subset and record failing stale references**

  Run:

  ```bash
  npx playwright test tests/e2e/guardian-mode.spec.ts tests/e2e/guardian-route-traversal.spec.ts tests/e2e/lesson-player.spec.ts tests/e2e/surrounding-pages.spec.ts tests/e2e/multiple-learners.spec.ts
  ```

  Expected: any remaining custom selector, request interception, or fixture fails
  until the cleanup is complete.

- [ ] **Step 3: Remove current documentation and mock references**

  Delete My Lessons/custom creation/generator/table/API claims from current
  product and deployment documentation. Keep built-in audio and recording facts.
  Rewrite account-deletion copy to list only retained private data. Do not edit
  historical migrations or prior `docs/superpowers` plans/specs; the current
  removal spec is the approved historical explanation for this deletion.

- [ ] **Step 4: Run browser subset and a scoped dead-reference scan**

  Run:

  ```bash
  npx playwright test tests/e2e/guardian-mode.spec.ts tests/e2e/guardian-route-traversal.spec.ts tests/e2e/lesson-player.spec.ts tests/e2e/surrounding-pages.spec.ts tests/e2e/multiple-learners.spec.ts
  rg -n -i "My Lessons|custom lesson|/api/lessons/my|/lessons/my|LESSON_GENERATION_RATE_LIMITER|lessonScript" src worker lib scripts tests README.md docs --glob '!docs/superpowers/**'
  ```

  Expected: browser subset passes. The scan has no live source/test/current-doc
  matches, except the intentional purge utility name and its test/runbook text.

- [ ] **Step 5: Commit the docs and browser test cleanup**

  ```bash
  git add src/testing vite.config.ts src/app/AccountDeleteDialog.tsx README.md docs tests/e2e
  git commit -m "docs: remove custom lesson references"
  ```

### Task 7: Verify the whole repository and prepare the safe production handoff

**Files:**

- Modify only when verification finds a real regression: files owned by Tasks 1–6
- Review: `git diff`, generated migration, test output, and exact R2 purge commands

**Interfaces:**

- Consumes: completed Tasks 1–6.
- Produces: verified repository removal plus a non-executed production sequence: deploy runtime removal, apply the D1 migration, dry-run R2 purge, execute R2 purge, verify zero rows/keys.

- [ ] **Step 1: Run formatting and static checks**

  Run:

  ```bash
  git diff --check
  npm run lint
  npm run build
  ```

  Expected: no whitespace errors, lint errors, or TypeScript/build failures.

- [ ] **Step 2: Run all unit and Worker tests**

  Run:

  ```bash
  npm test
  ```

  Expected: the complete Node test suite passes, including the migration and purge
  utility tests.

- [ ] **Step 3: Run the complete responsive browser suite**

  Run:

  ```bash
  npm run test:browser
  ```

  Expected: all Playwright tests pass at required narrow, short-landscape, and
  desktop viewports without custom-lesson routes or controls.

- [ ] **Step 4: Verify the forward migration without remote mutation**

  Create a dedicated temporary local D1 persistence directory, apply migrations,
  and inspect the end state:

  ```bash
  task_tmp_dir=$(mktemp -d)
  npx wrangler d1 migrations apply parrot-english --local --persist-to "$task_tmp_dir"
  npx wrangler d1 execute parrot-english --local --persist-to "$task_tmp_dir" --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learner_lesson'"
  ```

  Expected: migration application succeeds and the final query returns no rows.
  Remove only the explicit temporary directory after inspection.

- [ ] **Step 5: Perform a final diff/reference review and commit verification fixes**

  Run:

  ```bash
  git status --short
  git diff --check HEAD
  rg -n -i "My Lessons|custom lesson|/api/lessons/my|/lessons/my|learner_lesson" src worker lib scripts tests README.md docs --glob '!docs/superpowers/**' --glob '!migrations/**'
  ```

  Inspect each remaining match. It must be either the intentional one-time purge
  artifact/runbook or an approved historical migration. Commit only real
  verification fixes with:

  ```bash
  git add -A
  git commit -m "test: verify custom lesson removal"
  ```

  The production handoff must preserve this order, but is not executed by these
  local commands:

  ```bash
  npm run deploy:worker
  npx wrangler d1 migrations apply parrot-english --remote
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run purge:custom-lesson-recordings -- --bucket parrot-english-personalized-story-art
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run purge:custom-lesson-recordings -- --bucket parrot-english-personalized-story-art --execute
  ```
