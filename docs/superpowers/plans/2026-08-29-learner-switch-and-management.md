# Learner Switch and Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make learner management CRUD-only and move the explicit learner choice into every Guardian-to-learner mode transition, with safe individual learner deletion.

**Architecture:** A shared modal loads the Guardian roster, keeps the candidate choice local, then uses the existing cross-tab-safe selection mutation before locking Guardian mode. Individual deletion uses a durable profile tombstone, session selection-required markers, learner-scoped R2 closure/fences, and the existing SQL cascades; tombstoned learners remain visible only in the management roster for retry.

**Tech Stack:** React 19, React Router 7, Tailwind 4, TypeScript 5.9, Cloudflare Workers/D1/R2, Drizzle ORM, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-learner-switch-and-management-design.md`

## Global Constraints

- `Manage learners` creates, edits, and deletes profiles but never changes learner mode.
- Every switch flow requires a fresh, visible learner choice and one adjacent confirmation.
- Selection happens before Guardian locking; navigation happens only after both succeed.
- The last non-deleting learner returns `409 last_learner` and is never removed.
- Tombstoned profiles cannot be selected or used by targeted learner APIs.
- Never sweep a sibling's R2 subtree or promote a sibling to legacy storage owner.
- Use Tailwind utilities and shared controls; preserve accessible modal focus behavior.
- Add no dependency.

---

### Task 1: Shared learner-mode chooser

**Files:**
- Create: `src/app/LearnerModeSwitchDialog.tsx`
- Create: `tests/learner-mode-switch.test.mjs`
- Modify: `src/app/GuardianDashboard.tsx`
- Modify: `src/app/ModeRouteBoundaries.tsx`
- Modify: `tests/product-streamline.test.mjs`

**Interfaces:**
- Consumes: `loadLearnerProfiles()`, `useLearnerSelection().selectLearner(profileId)`, `useGuardianAccess().lock()`, `useDialogFocus()`.
- Produces: `LearnerModeSwitchDialog({ destination, onBeforeNavigate, onClose, returnFocusRef })`.

- [ ] **Step 1: Write failing chooser behavior tests**

Cover the actual dialog with providers and controlled fetch responses. Prove that opening only performs `GET /api/learner-profiles`, Cancel performs no selection or lock, no radio is initially checked, and confirmation orders mutations:

```js
assert.deepEqual(operations, [
  "select:learner-noah",
  "lock",
  "before-navigate",
]);
assert.equal(currentRoute(container), "/");
```

Update the dashboard render test to expect the trigger but no old selection copy.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/learner-mode-switch.test.mjs tests/product-streamline.test.mjs
```

Expected: failure because `LearnerModeSwitchDialog` and chooser semantics do not exist.

- [ ] **Step 3: Implement the minimal chooser and route integration**

Implement one modal with a protected roster load, local `selectedProfileId`, radio choices, retryable load error, and this confirmation order:

```ts
await selectLearner(selectedProfileId);
const lockError = await lock();
if (lockError) {
  setError(lockError);
  return;
}
onBeforeNavigate?.();
navigate(destination);
```

Dashboard and learner-route boundary triggers only open this modal. Remove their direct lock handlers. The boundary passes the current learner-route URL as `destination`; dashboard passes `/`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all pass with no console warnings.

- [ ] **Step 5: Commit**

```bash
git add src/app/LearnerModeSwitchDialog.tsx src/app/GuardianDashboard.tsx src/app/ModeRouteBoundaries.tsx tests/learner-mode-switch.test.mjs tests/product-streamline.test.mjs
git commit -m "feat: choose learner while switching modes"
```

### Task 2: CRUD-only Manage learners presentation

**Files:**
- Create: `src/learner-profile/LearnerDeleteDialog.tsx`
- Modify: `src/learner-profile/GuardianLearnerProfiles.tsx`
- Modify: `tests/guardian-learner-profiles.test.mjs`

**Interfaces:**
- Consumes: `GuardianLearnerProfileSummary.deletionPending` from Task 3 and a container `onDelete(profile)` callback completed in Task 5.
- Produces: roster cards with `Edit {name}` and `Delete {name}` only; `LearnerDeleteDialog` calls `onDelete(profile.id)` after explicit confirmation.

- [ ] **Step 1: Write the failing rendered behavior test**

Change the manager behavior test to assert:

```js
assert.doesNotMatch(html, /Learner mode|Use .* in learner mode|Managing /);
assert.match(html, /aria-label="Edit Mia&#x27;s profile"/);
assert.match(html, /aria-label="Delete Mia"/);
assert.match(html, /aria-label="Edit Noah&#x27;s profile"/);
assert.match(html, /aria-label="Delete Noah"/);
```

Add a lifecycle test proving opening and cancelling the delete dialog performs no mutation and restores focus.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test tests/guardian-learner-profiles.test.mjs
```

Expected: failure on the present `Use in learner mode` control and missing Delete actions.

- [ ] **Step 3: Implement the management-only view**

Remove `onSelect`, selection focus/status, active badges, and selection copy from the view. Render Edit and Delete in each card. Disable final-learner deletion with explanatory text, and render `Finish deleting {name}` when `deletionPending` is true. Build the confirmation with `useDialogFocus`, `ActionButton`, `role="dialog"`, and `aria-modal="true"`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all manager tests pass after obsolete selection tests move to Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/learner-profile/LearnerDeleteDialog.tsx src/learner-profile/GuardianLearnerProfiles.tsx tests/guardian-learner-profiles.test.mjs
git commit -m "refactor: keep learner management administrative"
```

### Task 3: Durable learner-deletion state and identity blocking

**Files:**
- Modify: `src/db/schema.ts`
- Create: `migrations/0015_learner_profile_deletion.sql`
- Create: `migrations/meta/0015_snapshot.json`
- Modify: `migrations/meta/_journal.json`
- Create: `tests/learner-deletion-schema.test.mjs`
- Modify: `worker/request-identity.ts`
- Modify: `worker/learner-profiles.ts`
- Modify: `tests/learner-identity.test.mjs`
- Modify: `tests/learner-profiles-worker.test.mjs`

**Interfaces:**
- Produces: `learnerProfileDeletionTombstone`, `learnerSelectionRequired`, `isLearnerDeletionPending(database, profileId)`, and roster summaries with `deletionPending: boolean`.
- The tombstone stores `learnerProfileId`, `userIdHash`, `legacyStorageOwner`, `generation`, `requestedAt`, and `storageKeysJson`.

- [ ] **Step 1: Write failing schema and identity tests**

Prove migration constraints, cascade behavior of the session marker, and these identity results:

```js
assert.equal((await resolveOwnedLearnerIdentity(db, account, tombstonedId)), null);
assert.deepEqual(await resolveLearnerIdentity(db, markedSession), {
  status: "selection_required",
});
```

Prove the roster retains a tombstoned row with `deletionPending: true`, while `PUT /active` returns generic 404 for it.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test tests/learner-deletion-schema.test.mjs tests/learner-identity.test.mjs tests/learner-profiles-worker.test.mjs
```

Expected: missing tables/types and tombstoned identities still resolve.

- [ ] **Step 3: Implement schema, migration, and resolution guards**

Add the Drizzle tables, run `npm run db:generate`, and normalize the generated migration name to `0015_learner_profile_deletion.sql`. Resolve owned/session learners only when no matching tombstone exists. Check `learnerSelectionRequired` before the one-profile compatibility fallback. Make selection atomically upsert `session_learner_selection` and delete the session marker.

Roster rows include:

```ts
{
  id,
  name,
  age,
  profileStatus,
  createdAt,
  deletionPending: tombstoneProfileId !== null,
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts migrations worker/request-identity.ts worker/learner-profiles.ts tests/learner-deletion-schema.test.mjs tests/learner-identity.test.mjs tests/learner-profiles-worker.test.mjs
git commit -m "feat: persist learner deletion state"
```

### Task 4: Race-safe Worker deletion endpoint

**Files:**
- Create: `worker/learner-deletion.ts`
- Create: `tests/learner-deletion.test.mjs`
- Modify: `worker/account-deletion.ts`
- Modify: `worker/dub-storage.ts`
- Modify: `worker/lesson-recording-storage.ts`
- Modify: `worker/learner-profiles.ts`
- Modify: `worker/guardian-access.ts`
- Modify: `worker/index.ts`
- Modify: `worker/conversations.ts`
- Modify: `worker/dubs.ts`
- Modify: `worker/lesson-recordings.ts`
- Modify: `worker/personalized-story-art.ts`
- Modify: `worker/learner-story-art-generation-lease.ts`
- Modify: `tests/worker-auth.test.mjs`

**Interfaces:**
- Produces: `prepareLearnerDeletion({ bucket, database, identity, profileId, wait })` and exact `DELETE /api/learner-profiles/:profileId` dispatch.
- Consumes: common exported `deleteWithRetry`, `persistFence`, `runBoundedFenceWrites`, and storage closure helpers extracted from account deletion.

- [ ] **Step 1: Write failing endpoint and deletion lifecycle tests**

Cover exact authorization, generic 404s, `last_learner`, `learner_busy`, inactive/active deletion, concurrent last-two deletes, sibling SQL/R2 preservation, legacy root cleanup, held dub/recording/art writes, transient/persistent R2 errors, idempotent retry, and concurrent account deletion. Assert a successful active deletion returns `activeProfileId: null`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test tests/learner-deletion.test.mjs tests/learner-profiles-worker.test.mjs tests/worker-auth.test.mjs tests/account-deletion.test.mjs
```

Expected: DELETE is not routed and cleanup helpers/tombstone behavior are missing.

- [ ] **Step 3: Implement the endpoint and cleanup closure**

Parse only `^/api/learner-profiles/([^/]+)$`, enforce the 128-byte decoded ID limit, and add DELETE to `requiresGuardianAccess`. Atomically start/resume a tombstone only when an untombstoned sibling exists and no `starting`/`active` conversation exists. Insert selection-required markers and remove selections for the target.

Persist the closure, delete non-fenced objects, and fence canonical dub slots, listed recording keys, and art candidate/previous keys. For a legacy owner, include root compatibility namespaces/rows but never `learners/{siblingId}/`. Delete the learner row only after all cleanup succeeds. Every write/token path refuses a tombstoned identity at its last database authority boundary. Account deletion unions unfinished learner closures into its own fence set.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all pass, including held-write and retry cases.

- [ ] **Step 5: Commit**

```bash
git add worker tests/learner-deletion.test.mjs tests/learner-profiles-worker.test.mjs tests/worker-auth.test.mjs tests/account-deletion.test.mjs
git commit -m "feat: delete learner profiles safely"
```

### Task 5: Client deletion mutation and reconciliation

**Files:**
- Modify: `src/learner-profile/learner-profile-api.ts`
- Modify: `src/learner-profile/LearnerProfileContext.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `src/learner-profile/GuardianLearnerProfiles.tsx`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `tests/learner-profile-api.test.mjs`
- Modify: `tests/guardian-learner-profiles.test.mjs`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `deleteLearnerProfile(profileId, options)` and `useLearnerSelection().deleteLearner(profileId)`.
- Delete returns `Promise<LearnerProfileRoster>` and uses the same mutation queue/change signal as selection.

- [ ] **Step 1: Write failing API and lifecycle tests**

Prove exact URL encoding/method, active deletion clearing shared profile state, inactive deletion preserving the active profile, 409 error copy, ambiguous failure reconciliation, and double-submit suppression. The browser mock must mirror `deletionPending`, final-learner rejection, and session selection clearing.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test tests/learner-profile-api.test.mjs tests/guardian-learner-profiles.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: delete API/context members are missing.

- [ ] **Step 3: Implement the client mutation**

Add:

```ts
export function deleteLearnerProfile(profileId: string, options?: LearnerProfileRequestOptions) {
  return learnerProfilesRequest(
    `/api/learner-profiles/${encodeURIComponent(profileId)}`,
    { method: "DELETE" },
    options,
  );
}
```

Run deletion through `runLearnerMutation`, publish a changed marker on committed success, and reconcile with `startActiveLearnerLoad()` when the active profile disappears. Keep the card/dialog mounted with error feedback on rejected cleanup so retry uses the same profile ID.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/learner-profile src/testing/e2e-browser-mocks.ts tests/learner-profile-api.test.mjs tests/guardian-learner-profiles.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "feat: connect learner deletion management"
```

### Task 5a: Close the Guardian unlock bypass and disclose dubbing scope

**Files:**
- Modify: `worker/guardian-access.ts`
- Modify: `src/auth/GuardianUnlock.tsx`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `src/dubbing/GuardianDubbingSettings.tsx`
- Modify: `src/app/AboutDialog.tsx`
- Modify: `src/app/AccountDeleteDialog.tsx`
- Modify: `tests/guardian-access-worker.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Modify: `tests/guardian-dubbing-settings.test.mjs`
- Modify: `tests/e2e/guardian-mode.spec.ts`
- Modify: `tests/e2e/dubbing.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `tests/e2e/surrounding-pages.spec.ts`

**Interfaces:**
- Preserves the account-password Guardian model and the single per-learner dubbing consent.
- Produces fail-closed empty/wrong-password behavior and accurate all-rhyme consent disclosure.

- [ ] **Step 1: Write failing security and disclosure regressions**

Prove an empty password returns `401 invalid_password`, never creates an
unlock, and cannot submit from either unlock UI. Prove the one dubbing grant is
described as covering both Five Little Ducks and Old MacDonald, and that grant
and revocation affect both learner routes.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test tests/guardian-access-worker.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/guardian-dubbing-settings.test.mjs
```

Use a freshly verified explicit Playwright port for the relevant Guardian,
dubbing, header, and surrounding-page cases.

- [ ] **Step 3: Implement the smallest fail-closed fix**

Require every submitted password to pass the Worker verifier; add native form
validation and matching mock behavior. Update Guardian-facing consent,
status, clip-count, privacy, and destructive copy to describe all voice-dubbing
rhymes without changing the consent schema.

- [ ] **Step 4: Run focused and full verification**

Run the focused commands, `npm test`, `npm run test:browser`, lint, both builds,
and diff checks. Request a fresh scoped security review.

- [ ] **Step 5: Commit**

```bash
git add worker/guardian-access.ts src/auth/GuardianUnlock.tsx src/testing/e2e-browser-mocks.ts src/dubbing/GuardianDubbingSettings.tsx src/app/AboutDialog.tsx src/app/AccountDeleteDialog.tsx tests
git commit -m "fix: require guardian password verification"
```

### Task 6: Migrate end-to-end flows and product copy

**Files:**
- Modify: `tests/e2e/multiple-learners.spec.ts`
- Modify: `tests/e2e/guardian-mode.spec.ts`
- Modify: `tests/e2e/guardian-route-traversal.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `tests/e2e/shared-focus-visibility.spec.ts`
- Modify: `tests/e2e/shared-control-contrast.spec.ts`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Modify: `src/app/AboutDialog.tsx`
- Modify: `src/app/GuardianDashboard.tsx`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/deployment/multiple-learner-rollout.md`

**Interfaces:**
- Consumes: final chooser, manager, mock, and Worker contracts from Tasks 1–5.
- Produces: complete browser coverage with no old `Use in learner mode` setup path or stale copy.

- [ ] **Step 1: Replace old selection setup and add final E2E assertions**

Use this interaction everywhere a test changes learner mode:

```ts
await page.getByRole("button", { name: "Switch to learner" }).click();
const dialog = page.getByRole("dialog", { name: "Who is learning now?" });
await dialog.getByRole("radio", { name: "Noah" }).check();
await dialog.getByRole("button", { name: "Start learner mode as Noah" }).click();
```

Add inactive and active deletion cases, refresh persistence, final-learner disabled behavior, responsive containment, Escape/focus restoration, and chooser failure recovery.

- [ ] **Step 2: Run focused browser files and verify RED locators**

```bash
npx playwright test tests/e2e/multiple-learners.spec.ts tests/e2e/guardian-mode.spec.ts tests/e2e/guardian-route-traversal.spec.ts tests/e2e/header.spec.ts tests/e2e/shared-focus-visibility.spec.ts tests/e2e/shared-control-contrast.spec.ts
```

Expected: old direct-switch and `Use in learner mode` locators fail until migrated.

- [ ] **Step 3: Finish copy and documentation migration**

Replace every claim that `Use in learner mode` lives in Manage learners with the chooser contract. Remove documentation saying individual deletion is unavailable, and document final-learner rejection, deletion-pending retry, legacy cleanup, and Guardian-only confirmation.

- [ ] **Step 4: Run focused Node and browser verification**

```bash
node --test tests/product-streamline.test.mjs tests/guardian-learner-profiles.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
npx playwright test tests/e2e/multiple-learners.spec.ts tests/e2e/guardian-mode.spec.ts tests/e2e/guardian-route-traversal.spec.ts tests/e2e/header.spec.ts tests/e2e/shared-focus-visibility.spec.ts tests/e2e/shared-control-contrast.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app docs tests
git commit -m "test: cover explicit learner switching"
```

### Task 7: Full verification and integration readiness

**Files:**
- Modify only files required by failures attributable to this branch.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a clean, reviewable branch ready for PR.

- [ ] **Step 1: Run all required verification**

```bash
npm test
npm run test:browser
npm run lint
npm run build
npm run build:agent
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Fix only branch-caused regressions test-first**

For each real regression, add or narrow the smallest behavior test, observe the expected failure, patch the shared root cause, and rerun the focused test before repeating Step 1.

- [ ] **Step 3: Review the whole branch**

Compare `origin/main...HEAD` against the spec, inspect security and ownership checks, accessible names, pending and error paths, and verify no unrelated user changes are present.

- [ ] **Step 4: Commit verification fixes if any**

```bash
git add -A
git commit -m "fix: close learner switch review findings"
```

Skip this commit only when Step 1 and review require no changes.
