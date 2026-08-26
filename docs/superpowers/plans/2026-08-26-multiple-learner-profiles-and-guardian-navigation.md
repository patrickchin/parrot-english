# Multiple Learner Profiles and Guardian Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give one password-protected Guardian account multiple isolated learner profiles, repair every Guardian navigation dead end, and keep learner mode free of sibling and grown-up controls.

**Architecture:** Better Auth continues to identify the Guardian account. A new D1 selection row binds each auth session to one owned learner profile, and the Worker resolves that profile before invoking learner-data handlers. The rollout is expand → compatibility Worker → enable, with the original learner retaining legacy R2 paths and all new learner data using profile-scoped ownership.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind 4, Cloudflare Workers, D1/SQLite, Drizzle ORM, private R2, Node test runner, React lifecycle harness, and Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-multiple-learner-profiles-and-guardian-navigation-design.md`

## Global Constraints

- One Better Auth user is the Guardian account; one auth session has at most one active learner.
- Only a live session-specific Guardian unlock may list, create, or select learners.
- Learner mode must never render sibling names or learner-management controls.
- Profile, onboarding, lessons, conversations, art, consent, and voice clips are learner-scoped.
- Authentication, Guardian unlock, rate limits, tombstones, and account deletion remain account- or session-scoped.
- Missing, stale, or foreign learner selections fail closed; never guess among siblings.
- Existing art keys remain exact. Existing dub keys belong only to the marked legacy learner.
- Do not expose individual learner deletion in this release.
- Do not add dependencies, avatars, themes, invitations, Guardian PINs, or household abstractions.
- Use Tailwind utilities and shared controls from `src/shared/ui.tsx`; route headers come from `src/app/AppHeader.tsx`.
- Browser tests use accessible locators and cover 280x568, 320x568, 390x844, 640x360, and 1440x900.
- Production must deploy the compatibility commit before applying the uniqueness-removal migration.

## File structure

### New files

- `worker/request-identity.ts` — account identity, selected learner resolution, and the selection-required result.
- `worker/learner-profiles.ts` — Guardian-only roster, creation, and session-selection HTTP boundary.
- `worker/learner-story-art-generation-lease.ts` — profile-scoped story-art CAS leases without changing the legacy lease table during compatibility.
- `src/learner-profile/GuardianLearnerProfiles.tsx` — dedicated Guardian roster and add/select/manage UI.
- `tests/multiple-learners-migration.test.mjs` — expansion, gap-write, enable, backfill, constraint, and exact-data migration evidence.
- `tests/learner-identity.test.mjs` — session selection and fail-closed identity resolution.
- `tests/learner-profiles-worker.test.mjs` — Guardian authorization and roster mutation API.
- `tests/guardian-learner-profiles.test.mjs` — rendered manager behavior and accessibility.
- `tests/e2e/multiple-learners.spec.ts` — end-to-end multi-profile, isolation, navigation, and viewport coverage.
- `docs/deployment/multiple-learner-rollout.md` — mandatory two-release production runbook and rollback floor.

### Existing files with changed responsibilities

- `src/db/schema.ts` and `migrations/0012_*`, `0013_*` — compatible learner ownership and staged cardinality change.
- `worker/index.ts` — authenticate once, keep account identity for Guardian/account routes, resolve learner identity for learner-data routes.
- `worker/learner-profile-repository.ts`, `worker/my-lessons-repository.ts`, `worker/conversation-repository.ts`, and art/dub repositories — query by account plus learner profile.
- `worker/account-deletion.ts` — enumerate and fence every learner dub namespace before the account cascade.
- `src/learner-profile/LearnerProfileGate.tsx` — distinguish Guardian rendering from learner readiness and reset state on profile selection.
- `src/app/app-routes.ts`, `src/app/App.tsx`, and `src/app/ModeRouteBoundaries.tsx` — mode-aware return and fallback policy.
- `src/app/AppHeader.tsx` and Guardian pages — expose the management hub and active learner context without exposing siblings in learner mode.
- `src/testing/e2e-browser-mocks.ts` — store separate roster, active profile, lessons, art, consent, and dub state per learner.

---

### Task 1: Repair Guardian route exits and fallbacks

**Files:**
- Modify: `src/app/app-routes.ts:23-55,60-74,139-217`
- Modify: `src/app/App.tsx:139-169,1240-1418`
- Modify: `src/app/ModeRouteBoundaries.tsx:27-96`
- Modify: `src/lessons/LessonCreator.tsx:359-391`
- Modify: `src/lessons/LessonEditor.tsx:61-94`
- Test: `tests/app-routes.test.mjs`
- Test: `tests/app-shell-ui.test.mjs`
- Test: `tests/lesson-creator-ui.test.mjs`
- Test: `tests/lesson-editor-ui.test.mjs`
- Test: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `getGuardianLearnersPath(): "/guardian/learners"`.
- Produces: `getSafeGuardianReturnTo(search: string): string`, returning a valid Guardian destination or `/guardian`.
- Produces: a mode-aware wildcard target and a Guardian-dashboard escape in `LearnerModeBoundary`.

- [ ] **Step 1: Write route-policy failures**

Add table-driven assertions to `tests/app-routes.test.mjs`:

```js
assert.equal(getGuardianLearnersPath(), "/guardian/learners");
assert.equal(getSafeGuardianReturnTo(""), "/guardian");
assert.equal(
  getSafeGuardianReturnTo("?returnTo=%2Fguardian%2Fstories"),
  "/guardian/stories",
);
for (const value of ["/", "/lessons", "/guardian/profile", "https://evil.test/"]) {
  assert.equal(
    getSafeGuardianReturnTo(`?returnTo=${encodeURIComponent(value)}`),
    "/guardian",
  );
}
```

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```bash
node --test tests/app-routes.test.mjs
```

Expected: import or assertion failures for the two new route helpers.

- [ ] **Step 3: Add the shared Guardian route policy**

Implement the exported helpers in `src/app/app-routes.ts` and add the manager to both Guardian route arrays:

```ts
export function getGuardianLearnersPath() {
  return "/guardian/learners" as const;
}

export function getSafeGuardianReturnTo(search: string) {
  const safe = getSafeReturnTo(search);
  if (!safe) return getGuardianPath();
  const { pathname } = new URL(safe, RETURN_TO_ORIGIN);
  if (!isGuardianRoute(pathname) || getGateRouteKind(pathname)) {
    return getGuardianPath();
  }
  return safe;
}
```

- [ ] **Step 4: Write rendered navigation failures**

Add assertions that:

```js
assert.equal(screen.getByRole("link", { name: "Back to lessons" }).getAttribute("href"), "/guardian/lessons");
assert.ok(screen.getByRole("link", { name: "Back to Guardian dashboard" }));
assert.equal(router.state.location.pathname, "/guardian");
```

Cover creator Back, editor Back, successful creator Save, successful editor Save, unknown Guardian URL, Guardian profile Back/Cancel/Save with no return, and the learner-route mismatch boundary.

- [ ] **Step 5: Run rendered tests and verify RED**

Run:

```bash
node --test tests/app-shell-ui.test.mjs tests/lesson-creator-ui.test.mjs tests/lesson-editor-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: the current `/lessons`, learner-scene, `/`, and missing-dashboard actions fail the new expectations.

- [ ] **Step 6: Route every Guardian exit through the shared policy**

Use `getGuardianLessonsPath()` for creator/editor Back and successful Save. In `AuthenticatedApplication`, use:

```ts
const safeReturnTo = guardianRoute
  ? getSafeGuardianReturnTo(location.search)
  : getSafeReturnTo(location.search) ?? "/";
```

Pass a mode-aware wildcard target into `ApplicationRoutes`, and add this secondary boundary action without locking:

```tsx
<ActionLink to={getGuardianPath()}>Back to Guardian dashboard</ActionLink>
```

Keep `Switch to learner mode` as the only action that calls `lock()`.

- [ ] **Step 7: Run focused route verification**

Run:

```bash
node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/lesson-creator-ui.test.mjs tests/lesson-editor-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit the independently deployable route repair**

```bash
git add src/app/app-routes.ts src/app/App.tsx src/app/ModeRouteBoundaries.tsx src/lessons/LessonCreator.tsx src/lessons/LessonEditor.tsx tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/lesson-creator-ui.test.mjs tests/lesson-editor-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "fix: keep guardian navigation inside guardian mode"
```

### Task 2: Expand D1 ownership without breaking the singleton Worker

**Files:**
- Modify: `src/db/schema.ts:39-89,207-518`
- Create: `migrations/0012_multi_learner_expand.sql`
- Modify: `migrations/meta/_journal.json`
- Create/modify generated migration snapshot under `migrations/meta/`
- Create: `tests/multiple-learners-migration.test.mjs`
- Modify: `tests/learner-profile-infrastructure.test.mjs:210-368`

**Interfaces:**
- Produces: `learnerProfile.legacyStorageOwner`.
- Produces: nullable `learnerProfileId` on lessons, conversations, and story art.
- Produces: `sessionLearnerSelection`, `learnerSessionBypass`, `learnerDubConsent`, and `learnerStoryArtGenerationLease` Drizzle tables.
- Preserves: `learner_profile_auth_user_id_unique`, `personalized_story_art_user_story_unique`, and all legacy tables during compatibility.

- [ ] **Step 1: Write the pre-0012 migration fixture**

In `tests/multiple-learners-migration.test.mjs`, load migrations through `0011`, seed one ordinary account, one profile-less account, two sessions, bypass, lesson, conversation, art, art lease, and granted dub consent:

```js
const before = readMigrations().filter(({ name }) => name < "0012_");
for (const migration of before) database.exec(migration.sql);
seedLegacyAccount(database, { userId: "guardian-1", profileId: "learner-1" });
seedProfilelessAccount(database, { userId: "guardian-2", sessionId: "session-2" });
```

Assert after applying only `0012`:

```js
assert.deepEqual(
  database.prepare("SELECT id, auth_user_id, legacy_storage_owner FROM learner_profile ORDER BY auth_user_id").all()[0],
  { id: "learner-1", auth_user_id: "guardian-1", legacy_storage_owner: 1 },
);
const generatedLegacy = database
  .prepare("SELECT id, auth_user_id, legacy_storage_owner FROM learner_profile WHERE auth_user_id = ?")
  .get("guardian-2");
assert.match(generatedLegacy.id, /^legacy-[0-9a-f]{32}$/);
assert.equal(generatedLegacy.legacy_storage_owner, 1);
assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
```

- [ ] **Step 2: Run the migration test and verify RED**

```bash
node --test tests/multiple-learners-migration.test.mjs
```

Expected: missing migration/table/column failures.

- [ ] **Step 3: Add expansion schema models**

Add these exact ownership shapes to `src/db/schema.ts`:

```ts
export const sessionLearnerSelection = sqliteTable("session_learner_selection", {
  sessionId: text("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }),
  authUserId: text("auth_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  learnerProfileId: text("learner_profile_id").notNull().references(() => learnerProfile.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const learnerSessionBypass = sqliteTable(
  "onboarding_learner_session_bypass",
  {
    sessionId: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
    learnerProfileId: text("learner_profile_id").notNull().references(() => learnerProfile.id, { onDelete: "cascade" }),
    skippedAt: integer("skipped_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.learnerProfileId] })],
);
```

Mirror the existing consent and lease fields in `learner_dub_consent` and `learner_story_art_generation_lease`, replacing their global keys with `(learner_profile_id, auth_user_id)` and `(learner_profile_id, story_id)` respectively.

- [ ] **Step 4: Write the expansion SQL**

Create `0012_multi_learner_expand.sql` with this order:

```sql
ALTER TABLE learner_profile ADD COLUMN legacy_storage_owner integer NOT NULL DEFAULT 1 CHECK (legacy_storage_owner IN (0, 1));
CREATE UNIQUE INDEX learner_profile_id_user_unique ON learner_profile(id, auth_user_id);
CREATE UNIQUE INDEX learner_profile_legacy_storage_owner_unique ON learner_profile(auth_user_id) WHERE legacy_storage_owner = 1;

INSERT INTO learner_profile (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
SELECT 'legacy-' || lower(hex(randomblob(16))), user.id, NULL, 'not_started', 1
FROM user
WHERE NOT EXISTS (SELECT 1 FROM learner_profile WHERE learner_profile.auth_user_id = user.id);

ALTER TABLE learner_lesson ADD COLUMN learner_profile_id text REFERENCES learner_profile(id) ON DELETE CASCADE;
ALTER TABLE conversation_session ADD COLUMN learner_profile_id text REFERENCES learner_profile(id) ON DELETE CASCADE;
ALTER TABLE personalized_story_art ADD COLUMN learner_profile_id text REFERENCES learner_profile(id) ON DELETE CASCADE;
```

Backfill each child through the marked legacy learner, create the four new tables, copy bypass/consent/lease values byte-for-byte, and backfill all existing sessions. Add profile-scoped lookup indexes for lessons and conversations plus `personalized_story_art_profile_story_unique` on `(learner_profile_id, auth_user_id, story_id)`. Keep the old singleton indexes as well. The exceptional generated legacy profile deliberately has no preferred name; never copy the Guardian account name into learner identity.

- [ ] **Step 5: Generate and inspect migration metadata**

Run:

```bash
npm run db:generate
```

If Drizzle creates a differently numbered SQL file, preserve the handwritten staged SQL as `0012_multi_learner_expand.sql`, keep the generated snapshot consistent with `src/db/schema.ts`, and remove only the duplicate generated SQL file with `apply_patch`.

- [ ] **Step 6: Prove exact backfill and compatibility indexes**

Extend the migration test with:

```js
assert.equal(row("learner_lesson", "lesson-1").learner_profile_id, "learner-1");
assert.equal(row("conversation_session", "conversation-1").learner_profile_id, "learner-1");
assert.equal(row("personalized_story_art", "art-1").r2_object_key, LEGACY_ART_KEY);
assert.equal(row("learner_dub_consent", "learner-1").grant_generation, "grant-1");
assert.ok(indexNames(database, "learner_profile").includes("learner_profile_auth_user_id_unique"));
assert.ok(indexNames(database, "personalized_story_art").includes("personalized_story_art_user_story_unique"));
```

- [ ] **Step 7: Run expansion verification**

```bash
node --test tests/multiple-learners-migration.test.mjs tests/learner-profile-infrastructure.test.mjs
```

Expected: PASS with zero foreign-key violations and all singleton indexes retained.

- [ ] **Step 8: Commit the expansion migration**

```bash
git add src/db/schema.ts migrations/0012_multi_learner_expand.sql migrations/meta tests/multiple-learners-migration.test.mjs tests/learner-profile-infrastructure.test.mjs
git commit -m "db: expand schema for multiple learners"
```

### Task 3: Resolve the active learner once per authenticated request

**Files:**
- Create: `worker/request-identity.ts`
- Create: `worker/learner-profiles.ts`
- Modify: `worker/index.ts:45-417`
- Modify: `worker/guardian-access.ts:168-230`
- Modify: `wrangler.jsonc:16-21`
- Modify: `worker-configuration.d.ts`
- Create: `tests/learner-identity.test.mjs`
- Create: `tests/learner-profiles-worker.test.mjs`
- Modify: `tests/learner-profile-worker.test.mjs`

**Interfaces:**
- Produces: `AccountIdentity`, `LearnerIdentity`, `LearnerIdentityResolution`, and `resolveLearnerIdentity`.
- Produces: Guardian-only roster routes; POST/PUT remain disabled unless `MULTI_LEARNER_PROFILES_ENABLED === "1"`.
- Consumes: expansion tables from Task 2.

- [ ] **Step 1: Write resolver failures**

Create tests for these exact cases:

```ts
assert.deepEqual(await resolveLearnerIdentity(db, account("session-a")), {
  status: "selected",
  identity: expectedLearner("learner-a"),
});
assert.deepEqual(await resolveLearnerIdentity(db, account("session-b")), {
  status: "selection_required",
});
```

Seed and assert: zero profiles creates/selects the first unnamed legacy learner; concurrent zero-profile resolutions converge on one profile and one selection; one profile auto-selects; two profiles without a selection require Guardian choice; two sessions select independently; stale and foreign selections fail closed.

The zero-profile branch is a system compatibility path for the account's initial learner, not a Guardian roster mutation. It preserves first-run onboarding for an account created after the migration. Guardian `Add learner` always creates an additional, explicitly named profile.

- [ ] **Step 2: Run resolver tests and verify RED**

```bash
node --test tests/learner-identity.test.mjs
```

Expected: missing module/type failures.

- [ ] **Step 3: Implement the central identity types and resolver**

Create `worker/request-identity.ts`:

```ts
export type AccountIdentity = {
  sessionId: string;
  userId: string;
  userName: string | null;
};

export type LearnerIdentity = AccountIdentity & {
  learnerProfileId: string;
  learnerName: string | null;
  legacyStorageOwner: boolean;
};

export type LearnerIdentityResolution =
  | { status: "selected"; identity: LearnerIdentity }
  | { status: "selection_required" };
```

Use an ownership join between `sessionLearnerSelection`, `session`, and `learnerProfile`. Create/select an unnamed legacy profile only when the account owns zero profiles, using an idempotent insert/select sequence that tolerates concurrent first requests. Auto-select only when the owned profile count is exactly one. A present invalid selection returns `selection_required` without repair.

- [ ] **Step 4: Write Worker routing and Guardian-policy failures**

Assert:

```js
assert.equal((await request("GET", "/api/learner-profiles", lockedSession)).status, 403);
assert.equal((await request("POST", "/api/learner-profiles", unlockedSession, { name: "Mia" })).status, 404);
assert.equal((await request("GET", "/api/learner-profile", multiProfileSession)).status, 409);
assert.deepEqual(await response.json(), { error: "learner_selection_required" });
```

Also assert that `GET /api/learner-profiles` on a fresh session with one learner returns that learner's ID as `activeProfileId`, and on an exceptional zero-profile account first creates/selects the single unnamed legacy learner before returning the roster.

- [ ] **Step 5: Route account and learner identities separately**

In `worker/index.ts`, construct one account object:

```ts
const accountIdentity: AccountIdentity = {
  sessionId: session.session.id,
  userId: session.user.id,
  userName: session.user.name?.trim() || null,
};
```

Handle `/api/learner-profiles` before learner resolution. For profile, browser conversation, My Lessons, story art, and dub routes, resolve once and return:

```ts
return Response.json(
  { error: "learner_selection_required" },
  { status: 409, headers: { "Cache-Control": "no-store" } },
);
```

Trusted agent conversation routes continue passing `identity: null` and use the stored conversation row.

- [ ] **Step 6: Add the compatibility roster handler**

`GET /api/learner-profiles` first uses the same central resolution path, so zero/one-profile initialization cannot disagree with learner APIs, then returns:

```ts
{
  activeProfileId: selected?.learnerProfileId ?? null,
  profiles: profiles.map(({ id, name, age, profileStatus, createdAt }) => ({
    id,
    name: name?.trim() || "Learner",
    age,
    profileStatus,
    createdAt: createdAt.toISOString(),
  })),
}
```

Require Guardian access for GET/POST/PUT. Add `MULTI_LEARNER_PROFILES_ENABLED: "0"` to `wrangler.jsonc` for an explicit compatibility release, and return 404 for POST/PUT until that value is `"1"`.

- [ ] **Step 7: Run focused identity and routing tests**

```bash
node --test tests/learner-identity.test.mjs tests/learner-profiles-worker.test.mjs tests/learner-profile-worker.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit the compatibility identity boundary**

```bash
git add worker/request-identity.ts worker/learner-profiles.ts worker/index.ts worker/guardian-access.ts wrangler.jsonc worker-configuration.d.ts tests/learner-identity.test.mjs tests/learner-profiles-worker.test.mjs tests/learner-profile-worker.test.mjs
git commit -m "feat: resolve the active learner per session"
```

### Task 4: Isolate profiles, onboarding bypasses, and custom lessons

**Files:**
- Modify: `worker/learner-profile.ts:41-230,800-930`
- Modify: `worker/learner-profile-repository.ts:1-188`
- Modify: `worker/my-lessons-repository.ts:1-120`
- Modify: `worker/my-lessons.ts:120-310`
- Modify: `tests/learner-profile-worker.test.mjs`
- Modify: `tests/my-lessons-worker.test.mjs`
- Modify: `tests/my-lessons-routing.test.mjs`

**Interfaces:**
- Consumes: `LearnerIdentity` from Task 3.
- Produces: profile payloads with immutable `id`.
- Produces: profile-specific bypass and lesson repository methods.

- [ ] **Step 1: Write same-account sibling isolation failures**

Seed two profiles for one user and assert:

```js
assert.equal((await loadProfileAs("session-a")).profile.id, "learner-a");
assert.equal((await loadProfileAs("session-b")).profile.id, "learner-b");
assert.equal(await canBypass("session-a", "learner-b"), false);
assert.deepEqual((await listLessonsAs("session-a")).lessons.map(({ id }) => id), ["lesson-a"]);
assert.equal((await getLessonAs("session-a", "lesson-b")).status, 404);
```

Also assert that a legacy null-profile lesson is visible only when `legacyStorageOwner` is true.

- [ ] **Step 2: Run profile/lesson tests and verify RED**

```bash
node --test tests/learner-profile-worker.test.mjs tests/my-lessons-worker.test.mjs tests/my-lessons-routing.test.mjs
```

Expected: sibling rows currently leak through `auth_user_id` queries.

- [ ] **Step 3: Scope the profile repository**

Change the repository signatures to:

```ts
findProfile(identity: LearnerIdentity)
loadProfile(identity: LearnerIdentity)
hasSessionBypass(identity: LearnerIdentity)
canBypass(identity: LearnerIdentity)
skipSession(identity: LearnerIdentity)
saveStoryLevel(identity: LearnerIdentity, storyLevel: LearnerStoryLevelId)
```

Query both `learnerProfile.id` and `learnerProfile.authUserId`. Consult or dual-write the old bypass row only for `legacyStorageOwner`; every learner uses `(sessionId, learnerProfileId)` in the new bypass table.

- [ ] **Step 4: Return the immutable profile ID**

Add this field in `clientProfile`:

```ts
return {
  id: profile.id,
  name: profile.name,
  // existing bounded client fields
};
```

Remove learner-facing `ensureProfile`; first profile creation belongs to the resolver and additional creation belongs to the Guardian roster.

- [ ] **Step 5: Scope My Lessons**

Use these repository signatures:

```ts
create(identity: LearnerIdentity, source, lesson)
findOwned(id: string, identity: LearnerIdentity)
updateOwned(id: string, identity: LearnerIdentity, lesson)
listOwned(identity: LearnerIdentity)
```

Every query requires `authUserId` and `learnerProfileId`. Compatibility reads may include `learner_profile_id IS NULL` only for the legacy learner. Use `identity.learnerName` for generation; remove the Guardian account-name fallback.

- [ ] **Step 6: Run focused profile/lesson verification**

```bash
node --test tests/learner-profile-worker.test.mjs tests/my-lessons-worker.test.mjs tests/my-lessons-routing.test.mjs
```

Expected: PASS for both different-account and same-account isolation.

- [ ] **Step 7: Commit learner profile and lesson ownership**

```bash
git add worker/learner-profile.ts worker/learner-profile-repository.ts worker/my-lessons-repository.ts worker/my-lessons.ts tests/learner-profile-worker.test.mjs tests/my-lessons-worker.test.mjs tests/my-lessons-routing.test.mjs
git commit -m "feat: isolate learner profile and lesson state"
```

### Task 5: Bind conversations permanently to the starting learner

**Files:**
- Modify: `worker/conversation-repository.ts:115-528`
- Modify: `worker/conversations.ts:148-382`
- Modify: `worker/livekit-token.ts:45-90` only if its types still import the old identity declaration
- Modify: `tests/conversation-worker.test.mjs`
- Modify: `tests/conversation-infrastructure.test.mjs`

**Interfaces:**
- Consumes: immutable `conversationSession.learnerProfileId` from Task 2.
- Produces: `loadBrowserConversation(conversationId, identity)` and `loadConversationWithTurns(conversationId)`.
- Preserves: trusted agent authorization by secret plus stored conversation ID.

- [ ] **Step 1: Write conversation sibling/race failures**

Assert:

```js
assert.notEqual(startA.conversation.id, startB.conversation.id);
assert.equal((await browserGet("session-b", startA.conversation.id)).status, 404);
await selectProfile("session-a", "learner-b");
await agentEnd(startA.conversation.id);
assert.equal(profile("learner-a").profileStatus, "completed");
assert.equal(profile("learner-b").profileStatus, "not_started");
```

Cover active reuse, browser GET, finish, review, trusted turns/facts/end, and a legacy null-profile conversation visible only to the legacy learner.

- [ ] **Step 2: Run conversation tests and verify RED**

```bash
node --test tests/conversation-worker.test.mjs tests/conversation-infrastructure.test.mjs
```

Expected: active reuse and browser ownership currently use only the account user ID.

- [ ] **Step 3: Persist learner identity at conversation creation**

Include `learnerProfileId: identity.learnerProfileId` in the insert and in active reuse:

```ts
and(
  eq(conversationSession.authUserId, identity.userId),
  eq(conversationSession.learnerProfileId, identity.learnerProfileId),
  eq(conversationSession.scenarioKey, scenario.key),
  inArray(conversationSession.status, ["starting", "active"]),
)
```

- [ ] **Step 4: Separate browser and trusted-agent loads**

Implement:

```ts
loadBrowserConversation(conversationId: string, identity: LearnerIdentity)
loadConversationWithTurns(conversationId: string)
```

The browser method checks account plus active learner. Trusted callbacks load the conversation by ID after the existing bearer-secret check.

- [ ] **Step 5: Finalize the stored learner, not the current selection**

Replace the user-wide profile lookup with:

```ts
const existingProfile = await profileRepository.findProfileById(
  owned.conversation.learnerProfileId,
  owned.conversation.authUserId,
);
```

Browser review first proves the conversation matches the active learner. The actual profile update uses the immutable conversation learner ID, so a later selection cannot redirect writes.

- [ ] **Step 6: Run focused conversation verification**

```bash
node --test tests/conversation-worker.test.mjs tests/conversation-infrastructure.test.mjs
```

Expected: PASS with existing Guardian review rules unchanged.

- [ ] **Step 7: Commit conversation ownership**

```bash
git add worker/conversation-repository.ts worker/conversations.ts worker/livekit-token.ts tests/conversation-worker.test.mjs tests/conversation-infrastructure.test.mjs
git commit -m "feat: bind conversations to learner profiles"
```

### Task 6: Isolate personalized story art and generation leases

**Files:**
- Modify: `worker/personalized-story-art-repository.ts:1-55`
- Modify: `worker/personalized-story-art.ts:50-770`
- Create: `worker/learner-story-art-generation-lease.ts`
- Modify: `tests/personalized-story-art-schema.test.mjs`
- Modify: `tests/personalized-story-art-worker.test.mjs`
- Modify: `tests/personalized-story-art-routing.test.mjs`

**Interfaces:**
- Consumes: `LearnerIdentity` and profile-scoped art/lease tables.
- Produces: learner-specific keys for new generations while preserving stored legacy keys.

- [ ] **Step 1: Write same-story sibling failures**

Assert that two learners can own the same story ID independently:

```js
assert.notEqual(artA.r2ObjectKey, artB.r2ObjectKey);
assert.match(artB.r2ObjectKey, /\/learners\/learner-b\//);
assert.equal((await readArt("session-a", artB.storyId)).r2ObjectKey, artA.r2ObjectKey);
assert.equal((await deleteArt("session-a", artB.storyId)).status, 204);
assert.ok(await bucket.head(artB.r2ObjectKey));
```

Also assert the migrated legacy row serves its exact old key only to the legacy learner and two sibling leases do not conflict.

- [ ] **Step 2: Run art tests and verify RED**

```bash
node --test tests/personalized-story-art-schema.test.mjs tests/personalized-story-art-worker.test.mjs tests/personalized-story-art-routing.test.mjs
```

Expected: global `(auth_user_id, story_id)` ownership collides or leaks.

- [ ] **Step 3: Scope art rows and keys**

Change repository methods to receive `LearnerIdentity` and require:

```ts
and(
  eq(personalizedStoryArt.authUserId, identity.userId),
  eq(personalizedStoryArt.learnerProfileId, identity.learnerProfileId),
  eq(personalizedStoryArt.storyId, storyId),
)
```

For the marked legacy learner only, also recognize a compatibility row whose `learner_profile_id` is null, and opportunistically attach it to that learner before mutating it. A nonlegacy learner never reads a null-profile row. Generate new keys with:

```ts
return `personalized-story-art/${encodeURIComponent(identity.userId)}/learners/${encodeURIComponent(identity.learnerProfileId)}/${encodeURIComponent(storyId)}/versions/${encodeURIComponent(objectId)}.${extension}`;
```

Never rewrite `row.r2ObjectKey` for migrated rows.

- [ ] **Step 4: Add profile-scoped CAS leases**

Keep `worker/personalized-story-art-generation-lease.ts` as the unchanged compatibility authority for the old account-scoped table. Intentionally create the separate `worker/learner-story-art-generation-lease.ts` as the authority for the new profile-scoped table; import both explicitly at the handler so their conflict targets cannot be confused. Give the new repository these methods:

```ts
acquire(identity, storyId, token, leaseExpiresAt)
trackCandidate(identity, storyId, token, candidateR2ObjectKey)
finalize(identity, storyId, token, input)
release(identity, storyId, token)
recoverExpired(identity, storyId, now)
```

Bind every SQL statement to `learnerProfileId`, `authUserId`, and `storyId`. Use the legacy lease repository only for a migrated legacy lease until it expires or is released.

- [ ] **Step 5: Run focused art verification**

```bash
node --test tests/personalized-story-art-schema.test.mjs tests/personalized-story-art-worker.test.mjs tests/personalized-story-art-routing.test.mjs
```

Expected: PASS, including existing deletion/generation race tests.

- [ ] **Step 6: Commit art ownership**

```bash
git add worker/personalized-story-art-repository.ts worker/personalized-story-art.ts worker/learner-story-art-generation-lease.ts tests/personalized-story-art-schema.test.mjs tests/personalized-story-art-worker.test.mjs tests/personalized-story-art-routing.test.mjs
git commit -m "feat: isolate learner story art"
```

### Task 7: Isolate dub consent/storage and fence all profiles on account deletion

**Files:**
- Modify: `worker/dub-storage.ts:1-72`
- Modify: `worker/dub-consent.ts:1-154`
- Modify: `worker/dubs.ts:120-1110`
- Modify: `worker/account-deletion.ts:1-246`
- Modify: `tests/dub-consent.test.mjs`
- Modify: `tests/dub-worker.test.mjs`
- Modify: `tests/dub-routing.test.mjs`
- Modify: `tests/account-deletion.test.mjs`

**Interfaces:**
- Produces: `createDubStorageKeys(identity: LearnerIdentity): DubStorageKeys`.
- Produces: consent methods accepting `LearnerIdentity`.
- Produces: `listLearnerStorageIdentities(database, userId)` for deletion fencing.

- [ ] **Step 1: Write sibling dub and deletion failures**

Assert:

```js
assert.equal((await dubStatus("legacy-session")).recordedCount, 1);
assert.equal((await dubStatus("new-session")).recordedCount, 0);
assert.match(newLearnerPut.key, /\/learners\/learner-b\/learner-dubs\//);
assert.ok(await bucket.head(legacyKey));
assert.ok(await bucket.head(newLearnerKey));
```

For account deletion, hold one upload in the legacy prefix and one in each of two learner prefixes; after deletion completes, assert every marker/slot is a non-audio `account-deleting` fence and no recording bytes remain.

- [ ] **Step 2: Run dub/deletion tests and verify RED**

```bash
node --test tests/dub-consent.test.mjs tests/dub-worker.test.mjs tests/dub-routing.test.mjs tests/account-deletion.test.mjs
```

Expected: all learners currently share the account-level consent and key functions.

- [ ] **Step 3: Derive one storage-key object per learner**

Add:

```ts
export type DubStorageKeys = {
  markerKey: string;
  objectKey(lineId: string): string;
  objectPrefix: string;
  retiredLegacyMarkerKey: string | null;
  retiredLegacyObjectKey(lineId: string): string | null;
};
```

`createDubStorageKeys` returns the exact existing account-level paths for the legacy owner and this root for other learners:

```ts
`personalized-story-art/${encodeURIComponent(identity.userId)}/learners/${encodeURIComponent(identity.learnerProfileId)}/learner-dubs/${DUB_ID}/`
```

- [ ] **Step 4: Scope consent without creating two CAS authorities**

Change `status`, `grant`, `beginRevocation`, `finishRevocation`, and `requireCurrentGrant` to accept `LearnerIdentity`. The legacy owner continues using `guardian_dub_consent` during compatibility; nonlegacy learners use `learner_dub_consent`. Never fall back to the legacy table for a nonlegacy learner.

- [ ] **Step 5: Pass derived keys through every dub operation**

At the handler boundary:

```ts
const storage = createDubStorageKeys(input.identity);
```

Replace raw `userId` key derivation in status, audio, upload, reset, revocation, legacy retirement, and post-write fencing. Preserve account tombstone checks by `identity.userId`.

- [ ] **Step 6: Enumerate profiles before account deletion cascades**

Add:

```ts
export async function listLearnerStorageIdentities(
  database: Database,
  userId: string,
): Promise<Array<Pick<LearnerIdentity, "userId" | "learnerProfileId" | "legacyStorageOwner">>>;
```

Build the deletion closure from the legacy namespace once plus every nonlegacy learner namespace. Keep the broad account-prefix sweep, then persist all marker and line-slot fences.

- [ ] **Step 7: Run focused media/deletion verification**

```bash
node --test tests/dub-consent.test.mjs tests/dub-worker.test.mjs tests/dub-routing.test.mjs
node --test tests/account-deletion.test.mjs
```

Expected: PASS for existing race coverage plus sibling isolation.

- [ ] **Step 8: Commit media ownership and deletion fencing**

```bash
git add worker/dub-storage.ts worker/dub-consent.ts worker/dubs.ts worker/account-deletion.ts tests/dub-consent.test.mjs tests/dub-worker.test.mjs tests/dub-routing.test.mjs tests/account-deletion.test.mjs
git commit -m "feat: isolate learner media and deletion fencing"
```

### Task 8: Establish and document the compatibility rollback floor

**Files:**
- Create: `docs/deployment/multiple-learner-rollout.md`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Modify: `tests/ci-workflows.test.mjs`
- Modify: `tests/learner-profile-infrastructure.test.mjs`

**Interfaces:**
- Produces: a production-recorded compatibility commit SHA and a deployment guard that refuses enable migration without an explicit compatibility acknowledgment.
- Consumes: Tasks 2–7.

- [ ] **Step 1: Write deployment-order failures**

Assert the workflow contains a compatibility gate before D1 migration application:

```js
assert.match(workflow, /MULTI_LEARNER_COMPATIBILITY_DEPLOYED/);
assert.ok(
  workflow.indexOf("Verify multi-learner compatibility release") <
    workflow.indexOf("Apply D1 migrations"),
);
```

- [ ] **Step 2: Run deployment tests and verify RED**

```bash
node --test tests/ci-workflows.test.mjs tests/learner-profile-infrastructure.test.mjs
```

Expected: no compatibility release gate or runbook exists.

- [ ] **Step 3: Record the staged deployment procedure**

The runbook must contain these exact phases:

```text
1. Deploy the compatibility commit with 0012 and MULTI_LEARNER_PROFILES_ENABLED=0.
2. Verify /api/build-info reports that exact commit and run the singleton smoke checks.
3. Set repository variable MULTI_LEARNER_COMPATIBILITY_DEPLOYED to that commit SHA.
4. Deploy the enable commit containing 0013 and MULTI_LEARNER_PROFILES_ENABLED=1.
5. Never roll back below the recorded compatibility SHA after 0013 applies.
```

Include commands using `git rev-parse HEAD`, `wrangler d1 migrations list parrot-english --remote`, and the existing deploy workflow.

- [ ] **Step 4: Add the workflow precondition**

Expose the repository variable to the job and fail before migrations when `0013_multi_learner_enable.sql` is present but the variable is empty, is not an ancestor of the deploying commit, does not contain `0012`, or already contains `0013`:

```yaml
env:
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  MULTI_LEARNER_COMPATIBILITY_DEPLOYED: ${{ vars.MULTI_LEARNER_COMPATIBILITY_DEPLOYED }}

- name: Verify multi-learner compatibility release
  if: ${{ inputs.media_only != true }}
  run: |
    if test -f migrations/0013_multi_learner_enable.sql; then
      test -n "$MULTI_LEARNER_COMPATIBILITY_DEPLOYED"
      git cat-file -e "$MULTI_LEARNER_COMPATIBILITY_DEPLOYED^{commit}"
      git merge-base --is-ancestor "$MULTI_LEARNER_COMPATIBILITY_DEPLOYED" HEAD
      git cat-file -e "$MULTI_LEARNER_COMPATIBILITY_DEPLOYED:migrations/0012_multi_learner_expand.sql"
      if git cat-file -e "$MULTI_LEARNER_COMPATIBILITY_DEPLOYED:migrations/0013_multi_learner_enable.sql" 2>/dev/null; then
        exit 1
      fi
    fi
```

This does not replace the two releases; it prevents an accidental one-shot production deploy.

- [ ] **Step 5: Run the compatibility checkpoint**

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0 while singleton indexes still exist and profile creation remains disabled.

- [ ] **Step 6: Commit and record the compatibility SHA**

```bash
git add docs/deployment/multiple-learner-rollout.md .github/workflows/deploy-cloudflare.yml tests/ci-workflows.test.mjs tests/learner-profile-infrastructure.test.mjs
git commit -m "docs: establish multi learner compatibility release"
git rev-parse HEAD
```

Do not try to write this SHA back into the same commit: amending would change it. At production release time, deploy this exact commit, verify `/api/build-info`, then store the printed SHA in the `MULTI_LEARNER_COMPATIBILITY_DEPLOYED` repository variable as the durable rollout record. Rerun `git show --check HEAD` locally.

### Task 9: Remove singleton uniqueness and enable Guardian roster mutations

**Files:**
- Modify: `src/db/schema.ts:207-468`
- Create: `migrations/0013_multi_learner_enable.sql`
- Modify: `migrations/meta/_journal.json`
- Create/modify generated migration snapshot under `migrations/meta/`
- Modify: `worker/learner-profiles.ts`
- Modify: `wrangler.jsonc:16-21`
- Modify: `worker-configuration.d.ts`
- Modify: `tests/multiple-learners-migration.test.mjs`
- Modify: `tests/learner-profiles-worker.test.mjs`
- Modify: `tests/personalized-story-art-schema.test.mjs`

**Interfaces:**
- Produces: multiple `learner_profile` rows per `auth_user_id`.
- Produces: `POST /api/learner-profiles` and `PUT /api/learner-profiles/:id/active` when the release flag is `1`.
- Requires: the compatibility deployment from Task 8 already live before production applies this task.

- [ ] **Step 1: Extend the migration test with gap writes and final indexes**

After applying `0012`, insert a null-profile lesson, conversation, and art row, a new session and legacy session bypass, and newer legacy dub-consent/art-lease generations. Then apply `0013` and assert:

```js
assert.equal(unmappedCount(database, "learner_lesson"), 0);
assert.equal(unmappedCount(database, "conversation_session"), 0);
assert.equal(unmappedCount(database, "personalized_story_art"), 0);
assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
assert.ok(!indexNames(database, "learner_profile").includes("learner_profile_auth_user_id_unique"));
assert.ok(!indexNames(database, "personalized_story_art").includes("personalized_story_art_user_story_unique"));
assert.equal(selectedLearner(database, "gap-session"), "learner-1");
assert.equal(learnerBypass(database, "gap-session", "learner-1").skipped_at, GAP_SKIPPED_AT);
assert.equal(learnerConsent(database, "learner-1").grant_generation, "gap-grant");
assert.equal(learnerLease(database, "learner-1", "story-1").generation_token, "gap-lease");
```

- [ ] **Step 2: Run enable tests and verify RED**

```bash
node --test tests/multiple-learners-migration.test.mjs tests/learner-profiles-worker.test.mjs
```

Expected: missing 0013, uniqueness still present, POST/PUT disabled.

- [ ] **Step 3: Write the catch-up and enable migration**

Repeat every expansion backfill to catch writes from an old Worker: create a missing unnamed legacy profile, attach null-profile lessons/conversations/art to the marked legacy profile, add selections only for sessions whose account owns exactly one learner, and copy/refresh legacy onboarding bypass, dub consent, and story-art lease state into their profile-scoped tables. Fail the migration when any learner-owned child row or any live single-learner session remains unmapped:

```sql
CREATE TABLE multi_learner_backfill_assertion (
  failures integer NOT NULL CHECK (failures = 0)
);
INSERT INTO multi_learner_backfill_assertion
SELECT
  (SELECT count(*) FROM learner_lesson WHERE learner_profile_id IS NULL) +
  (SELECT count(*) FROM conversation_session WHERE learner_profile_id IS NULL) +
  (SELECT count(*) FROM personalized_story_art WHERE learner_profile_id IS NULL) +
  (SELECT count(*) FROM session s
     WHERE NOT EXISTS (SELECT 1 FROM session_learner_selection sls WHERE sls.session_id = s.id)
       AND 1 = (SELECT count(*) FROM learner_profile lp WHERE lp.auth_user_id = s.user_id));
DROP TABLE multi_learner_backfill_assertion;

DROP INDEX learner_profile_auth_user_id_unique;
DROP INDEX personalized_story_art_user_story_unique;
```

Keep legacy tables and nullable columns for the rollback/session-expiry window. Preserve the new per-profile uniqueness/indexes and add final account/profile lookup indexes after dropping only the two singleton indexes.

- [ ] **Step 4: Enable atomic create/select and ownership-checked select**

Validate an exact `{name}` body, bound the preferred name with the existing privacy helper, and batch profile creation with current-session selection:

```ts
await database.batch([
  database.insert(learnerProfile).values({ ...newProfile, legacyStorageOwner: false }),
  database.insert(sessionLearnerSelection).values(selection).onConflictDoUpdate({
    target: sessionLearnerSelection.sessionId,
    set: { learnerProfileId: profileId, authUserId: identity.userId, updatedAt: now },
  }),
] as const);
```

For PUT, perform an ownership-checked `INSERT ... SELECT`/equivalent query; a foreign or missing ID returns the same 404.

- [ ] **Step 5: Turn on the final release flag**

Add:

```json
"MULTI_LEARNER_PROFILES_ENABLED": "1"
```

to `wrangler.jsonc` and its generated Worker environment type. Tests must prove absent/`0` disables mutation and `1` enables it.

- [ ] **Step 6: Run final server enable verification**

```bash
node --test tests/multiple-learners-migration.test.mjs tests/learner-identity.test.mjs tests/learner-profiles-worker.test.mjs tests/personalized-story-art-schema.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit the enable boundary**

```bash
git add src/db/schema.ts migrations/0013_multi_learner_enable.sql migrations/meta worker/learner-profiles.ts wrangler.jsonc worker-configuration.d.ts tests/multiple-learners-migration.test.mjs tests/learner-profiles-worker.test.mjs tests/personalized-story-art-schema.test.mjs
git commit -m "feat: enable multiple learner creation"
```

### Task 10: Add client contracts and resettable active-learner state

**Files:**
- Modify: `src/learner-profile/learner-profile-api.ts:42-299`
- Modify: `src/learner-profile/LearnerProfileContext.tsx:1-28`
- Modify: `src/learner-profile/LearnerProfileGate.tsx:117-401,603-950,1113-1427`
- Modify: `src/auth/account-actions.tsx:11-60`
- Modify: `src/auth/AuthGate.tsx:189-319,549-770`
- Modify: `tests/learner-profile-api.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `LearnerProfileSummary.id` and the roster client types/functions.
- Produces: `useLearnerSelection()` with authoritative active-profile reload.
- Produces: an explicit selection-required learner state without sibling data.

- [ ] **Step 1: Write client contract failures**

Assert exact method/path/body behavior:

```js
await loadLearnerProfiles({ fetch: fakeFetch });
assert.deepEqual(calls[0], ["/api/learner-profiles", { method: "GET" }]);
await createLearnerProfile("Mia", { fetch: fakeFetch });
assert.equal(JSON.parse(calls[1][1].body).name, "Mia");
await selectLearnerProfile("learner/a", { fetch: fakeFetch });
assert.equal(calls[2][0], "/api/learner-profiles/learner%2Fa/active");
```

Assert a 409 `learner_selection_required` from `/api/learner-profile` becomes `{ mode: "selection-required" }` rather than a generic load error.

- [ ] **Step 2: Run API tests and verify RED**

```bash
node --test tests/learner-profile-api.test.mjs
```

Expected: missing types/functions and missing 409 mapping.

- [ ] **Step 3: Add roster and selection client types**

Define:

```ts
export type GuardianLearnerProfileSummary = {
  id: string;
  name: string;
  age: number | null;
  profileStatus: LearnerProfileSummary["profileStatus"];
  createdAt: string;
};

export type LearnerProfileRoster = {
  activeProfileId: string | null;
  profiles: GuardianLearnerProfileSummary[];
};
```

Add `loadLearnerProfiles`, `createLearnerProfile`, and `selectLearnerProfile` using the existing `requestJson` and Guardian-required notification behavior.

- [ ] **Step 4: Write gate lifecycle failures**

Cover:

```js
assert.ok(screen.getByText("Ask a grown-up to choose a learner"));
assert.equal(screen.queryByText("Mia"), null);
assert.ok(renderGuardian("/guardian", incompleteProfile).getByText("Guardian dashboard"));
assert.equal(renderLearner("/lessons", incompleteProfile).location.pathname, "/profile/setup");
```

Also resolve an old profile request after selecting a new profile and assert it cannot replace the new state.

- [ ] **Step 5: Add an always-available selection context**

Keep `useLearnerProfile()` non-null for existing consumers. Add:

```ts
export type LearnerSelectionContextValue = {
  activeProfileId: string | null;
  reloadSelectedLearner(expectedProfileId: string): Promise<LearnerProfileSummary>;
};

export function useLearnerSelection(): LearnerSelectionContextValue;
```

`reloadSelectedLearner` increments the operation ID, aborts question/profile/conversation work, clears drafts and acknowledgments, reloads the active profile, and rejects if the returned profile ID differs from `expectedProfileId`.

- [ ] **Step 6: Separate Guardian render permission from learner readiness**

Pass `guardianRoute` and `learnerManagerRoute` into the gate. Permit Guardian dashboard/manager/editor for incomplete profiles. In learner mode, keep incomplete profiles on setup. For selection-required state, render only the grown-up prompt in learner mode; Guardian management redirects to `/guardian/learners` until a learner is selected.

Key learner-specific descendants:

```tsx
<LearnerProfileProvider key={data.profile.id} profile={data.profile} replaceProfile={replaceProfile}>
  {children}
</LearnerProfileProvider>
```

- [ ] **Step 7: Implement form-mode redo instead of falling through**

On `/guardian/profile/setup?redo=1` with form mode, load `ProfileState.questions`, present the current question through `LearnerProfileQuestionView`, save each answer through `saveProfileAnswer`, and navigate through the Guardian-safe return target. Do not render the route's `null` element.

- [ ] **Step 8: Run focused client lifecycle verification**

```bash
node --test tests/learner-profile-api.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit active-learner client state**

```bash
git add src/learner-profile/learner-profile-api.ts src/learner-profile/LearnerProfileContext.tsx src/learner-profile/LearnerProfileGate.tsx src/auth/account-actions.tsx src/auth/AuthGate.tsx tests/learner-profile-api.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "feat: make learner selection explicit in the profile gate"
```

### Task 11: Build the Guardian learner manager

**Files:**
- Create: `src/learner-profile/GuardianLearnerProfiles.tsx`
- Create: `tests/guardian-learner-profiles.test.mjs`
- Modify: `src/app/App.tsx:1240-1333`
- Modify: `src/app/GuardianDashboard.tsx:15-117`
- Modify: `tests/app-shell-ui.test.mjs`

**Interfaces:**
- Consumes: roster API and `useLearnerSelection()` from Task 10.
- Produces: `/guardian/learners`, add/select/manage behavior, focus recovery, and selection announcements.

- [ ] **Step 1: Write the rendered manager contract**

Render a two-profile roster and assert:

```js
assert.ok(screen.getByRole("heading", { name: "Learner profiles" }));
assert.ok(screen.getByText("Current learner"));
assert.ok(screen.getByRole("button", { name: "Use Noah" }));
assert.ok(screen.getByRole("button", { name: "Manage Mia's details" }));
assert.ok(screen.getByRole("textbox", { name: "Preferred name" }));
```

Add mutation tests proving success announces `Now managing Noah`, failure preserves Mia and refocuses `Use Noah`, and managing inactive Noah selects/reloads before navigating to the encoded Guardian profile return.

Creation must select and authoritatively reload the new profile, then open `/guardian/profile?returnTo=%2Fguardian%2Flearners`. A successful plain selection moves focus to the page's active-learner context heading; a failed selection leaves focus on the initiating button.

- [ ] **Step 2: Run manager tests and verify RED**

```bash
node --test tests/guardian-learner-profiles.test.mjs tests/app-shell-ui.test.mjs
```

Expected: missing component/route failures.

- [ ] **Step 3: Build the view and container**

Export:

```ts
export function GuardianLearnerProfilesView(props: {
  activeProfileId: string | null;
  error: string;
  isLoading: boolean;
  pendingProfileId: string | null;
  profiles: GuardianLearnerProfileSummary[];
  statusMessage: string;
  onAdd(name: string): void;
  onManage(profile: GuardianLearnerProfileSummary): void;
  onRetry(): void;
  onSelect(profile: GuardianLearnerProfileSummary): void;
})
```

Use a semantic `<ul>`, one heading per card, visible `Current learner` text, a labelled preferred-name input, one persistent polite live region, and one alert. Preserve server creation order.

- [ ] **Step 4: Make mutations authoritative and stale-safe**

The container owns one mutation token and `AbortController`. After create/select, call `reloadSelectedLearner(result.activeProfileId)` before updating the status or navigating. Ignore a superseded result. On failure, keep the prior active ID and restore the initiating button's focus.

Because the central resolver guarantees an initial compatibility learner, the Add form is solely for additional learners and always requires the Guardian-supplied preferred name.

- [ ] **Step 5: Register the route and dashboard entry**

Add `/guardian/learners` to `APPLICATION_ROUTE_PATTERNS` and `ApplicationRoutes`. Make the first Guardian dashboard card `Learner profiles`, linking to `getGuardianLearnersPath()`, and keep a separate active-learner details action.

- [ ] **Step 6: Run focused manager verification**

```bash
node --test tests/guardian-learner-profiles.test.mjs tests/app-shell-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the manager**

```bash
git add src/learner-profile/GuardianLearnerProfiles.tsx src/app/App.tsx src/app/GuardianDashboard.tsx tests/guardian-learner-profiles.test.mjs tests/app-shell-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "feat: add guardian learner profile manager"
```

### Task 12: Identify the active learner across every Guardian surface

**Files:**
- Modify: `src/app/AppHeader.tsx:62-111,113-501`
- Modify: `src/auth/AuthGate.tsx:220-319`
- Modify: `src/app/GuardianDashboard.tsx:15-155`
- Modify: `src/lessons/GuardianLessonManager.tsx:27-208`
- Modify: `src/lessons/LessonCreator.tsx:381-402`
- Modify: `src/lessons/LessonEditor.tsx:84-105`
- Modify: `src/stories/GuardianStorySettings.tsx:21-189`
- Modify: `src/dubbing/GuardianDubbingSettings.tsx:26-238,426-443`
- Modify: `src/learner-profile/ProfileEditor.tsx:43-75`
- Modify: `src/app/AboutDialog.tsx:257-300`
- Modify: `src/app/AccountDeleteDialog.tsx:81-85`
- Modify: `tests/auth-ui.test.mjs`
- Modify: `tests/guardian-lesson-manager.test.mjs`
- Modify: `tests/guardian-story-settings.test.mjs`
- Modify: `tests/guardian-dubbing-settings.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`

**Interfaces:**
- Produces: `GuardianLearnerContextLabel({ learnerName })` in the shared header module.
- Produces: Guardian menu navigation to dashboard/roster/details and explicit switch-to-active-learner.
- Preserves: learner menu with only `Grown-up access`.

- [ ] **Step 1: Write header and page-context failures**

Assert Guardian menu order and learner absence:

```js
assert.deepEqual(
  menuItems.map((item) => item.textContent.trim()),
  ["Guardian dashboard", "Learner profiles", "Manage Mia's details", "Switch to Mia", "AI and saved data", "Sign out", "Delete account"],
);
assert.equal(renderLearnerHeader().queryByText("Noah"), null);
```

For each Guardian page, assert visible `Managing Mia` and name-specific consent/art copy.

- [ ] **Step 2: Run identity/accessibility tests and verify RED**

```bash
node --test tests/auth-ui.test.mjs tests/guardian-lesson-manager.test.mjs tests/guardian-story-settings.test.mjs tests/guardian-dubbing-settings.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

Expected: missing roster/dashboard menu items and generic learner copy.

- [ ] **Step 3: Add the shared management context label**

In `AppHeader.tsx`:

```tsx
export function GuardianLearnerContextLabel({ learnerName }: { learnerName: string }) {
  return (
    <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-brand-blue sm:text-sm">
      Managing {learnerName.trim() || "Learner"}
    </p>
  );
}
```

Use it on the dashboard, learner details, lessons manager/creator/editor, story settings, and dubbing settings.

- [ ] **Step 4: Wire the Guardian menu destinations**

Extend `AccountHeader` with:

```ts
onOpenGuardianDashboard: () => void;
onOpenLearnerProfiles: () => void;
```

Render the approved menu order. Keep the Guardian account holder as the trigger identity, show `Managing {learnerName}` inside its menu, and keep learner mode's single grown-up gateway unchanged.

- [ ] **Step 5: Make account/privacy copy plural-safe**

Update About and Delete copy so it says the Guardian account removes or controls all learner profiles and their saved data. Dubbing and personalized-art copy names the active learner, never an unspecified sibling.

- [ ] **Step 6: Run focused Guardian identity verification**

```bash
node --test tests/auth-ui.test.mjs tests/guardian-lesson-manager.test.mjs tests/guardian-story-settings.test.mjs tests/guardian-dubbing-settings.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

Expected: PASS with accessible menu keyboard order and live announcements.

- [ ] **Step 7: Commit the shared Guardian context**

```bash
git add src/app/AppHeader.tsx src/auth/AuthGate.tsx src/app/GuardianDashboard.tsx src/lessons/GuardianLessonManager.tsx src/lessons/LessonCreator.tsx src/lessons/LessonEditor.tsx src/stories/GuardianStorySettings.tsx src/dubbing/GuardianDubbingSettings.tsx src/learner-profile/ProfileEditor.tsx src/app/AboutDialog.tsx src/app/AccountDeleteDialog.tsx tests/auth-ui.test.mjs tests/guardian-lesson-manager.test.mjs tests/guardian-story-settings.test.mjs tests/guardian-dubbing-settings.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
git commit -m "feat: identify the managed learner across guardian pages"
```

### Task 13: Prove browser isolation, responsive UX, documentation, and final integration

**Files:**
- Modify: `src/testing/e2e-browser-mocks.ts`
- Create: `tests/e2e/multiple-learners.spec.ts`
- Modify: `tests/e2e/guardian-mode.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `tests/e2e/surrounding-pages.spec.ts`
- Modify: `tests/e2e/lesson-creator.spec.ts`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/design/personalized-story-art.md`
- Modify: `docs/deployment/multiple-learner-rollout.md`

**Interfaces:**
- Produces: deterministic per-learner browser mock storage and complete Playwright evidence.
- Produces: authoritative product/architecture/deployment documentation matching the implemented model.

- [ ] **Step 1: Split the browser mock's personalized state by learner**

Model:

```ts
type MockLearnerState = {
  profile: LearnerProfileSummary;
  lessons: Map<string, MyLessonDescriptor>;
  art: Map<string, PersonalizedStoryArtState>;
  dub: MockDubState;
};

type MockAccountState = {
  activeProfileId: string | null;
  learners: Map<string, MockLearnerState>;
};
```

Persist the roster and active ID in `sessionStorage`. Guard all three roster endpoints with `currentGuardianAccess()`. Make every existing learner API resolve the selected learner before reading its store.

- [ ] **Step 2: Add deterministic browser scenarios**

Support query/config scenarios named:

```text
multiple
selection-required
select-error
create-error
stale-selection
```

`stale-selection` must hold the first selection response until a newer selection and reload complete.

- [ ] **Step 3: Write multi-learner Playwright journeys**

Add tests for:

```ts
await expect(page.getByRole("heading", { name: "Learner profiles" })).toBeVisible();
await page.getByRole("button", { name: "Use Noah" }).click();
await expect(page.getByText("Now managing Noah")).toBeVisible();
await page.reload();
await expect(page.getByRole("listitem").filter({ hasText: "Noah" })).toContainText("Current learner");
```

Also prove add/manage, two-session persistence semantics, no sibling name in learner menu/page source, direct manager password gate, incomplete learner behavior, select/create failure focus, stale-result suppression, form redo, mode-aware wildcard, Guardian dashboard escape, creator/editor Back and Save, and invalid/self-referential Guardian returns.

Run a learner-route matrix over home, conversation practice, lesson shelves/playback, story shelves/reading, progress, profile setup, and Five Little Ducks dubbing. On every route, assert that no Guardian dashboard/profile/roster/settings/account action is rendered. On the dubbing route specifically, assert there is no grown-up or Guardian-consent checkbox; missing consent renders only a learner-safe `Ask a grown-up` state whose gateway leads to the password boundary.

- [ ] **Step 4: Add the responsive matrix**

For 280x568, 320x568, 390x844, 640x360, and 1440x900, use accessible locators and assert roster cards, account menu, shared header, active context, and primary actions are visible/scrollable without overlap or horizontal overflow:

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
  await page.evaluate(() => document.documentElement.clientWidth),
);
```

- [ ] **Step 5: Run focused Playwright verification**

```bash
npx playwright test tests/e2e/multiple-learners.spec.ts tests/e2e/guardian-mode.spec.ts tests/e2e/header.spec.ts tests/e2e/surrounding-pages.spec.ts tests/e2e/lesson-creator.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Update authoritative documentation**

Replace the one-account/one-learner statements with the session-selected model. Document `/guardian/learners`, per-learner lessons/conversations/art/consent/dubs, no-selection behavior, legacy R2 ownership, account deletion across learner prefixes, and the exact compatibility/enable deployment sequence.

- [ ] **Step 7: Run the required final gates in order**

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Expected: all commands exit 0. Preserve full output summaries for the final handoff.

- [ ] **Step 8: Run the completion audit**

For every product invariant and verification bullet in the specification, record the proving test/file/command in a temporary checklist. Confirm:

```bash
git diff --check
git status --short
git log --oneline --decorate -15
```

Expected: no whitespace errors, only intentional changes, and the compatibility commit precedes the enable commit.

- [ ] **Step 9: Commit browser evidence and documentation**

```bash
git add src/testing/e2e-browser-mocks.ts tests/e2e/multiple-learners.spec.ts tests/e2e/guardian-mode.spec.ts tests/e2e/header.spec.ts tests/e2e/surrounding-pages.spec.ts tests/e2e/lesson-creator.spec.ts docs/design/product-experience.md docs/design/technical-architecture.md docs/design/personalized-story-art.md docs/deployment/multiple-learner-rollout.md
git commit -m "test: prove multiple learner guardian flows"
```

- [ ] **Step 10: Request final review and locally merge**

Use `superpowers:requesting-code-review`, address every Critical/Important finding, rerun affected tests, then use `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch`. After confirming the main worktree is clean and still points to the expected base, merge this branch into local `main` without pushing or deploying.
