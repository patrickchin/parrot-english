# Guardian and Learner Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build password-protected, server-enforced guardian mode with dedicated management routes while keeping learner mode limited to learning activities.

**Architecture:** A short-lived `guardian_session_unlock` row makes guardian access a property of the current Better Auth session, not a new account role. One React guardian-access provider synchronizes that state with the shared profile dropdown and route boundaries. Existing learner/profile, My Lessons, and personalized-art APIs keep owner scoping, while one Worker guard rejects their management methods unless the session has a live 15-minute unlock.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, Better Auth 1.6, Cloudflare Workers/D1 rate limits, Drizzle ORM, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-guardian-learner-mode-design.md`

## Global Constraints

- Keep the existing one-account, one-learner data model; do not add households, invitations, PINs, or multiple learner profiles.
- Guardian access lasts exactly 15 minutes and is never extended by ordinary activity.
- Use Better Auth's server-side `verifyPassword`; never store or log the submitted password.
- Fail closed on access-status, unlock, lock, and authorization errors.
- Use Tailwind 4 utilities in React components, shared controls from `src/shared/ui.tsx`, and shared headers from `src/app/AppHeader.tsx`.
- Do not add page-specific CSS; preserve the `src/styles.css` and `src/lesson.css` boundaries in `AGENTS.md`.
- Test rendered behavior with accessible locators, never CSS source or class-name assertions.
- Preserve profile/account keyboard navigation, focus restoration, lesson route cleanup, safe return URLs, owner scoping, photo consent, and account-deletion purge behavior.
- Run `npm run test:browser` for the responsive UI change, plus `npm test`, `npm run lint`, and `npm run build` before completion.

---

### Task 1: Persist guardian unlocks and the selected story level

**Files:**
- Modify: `src/db/schema.ts`
- Create: `migrations/0010_guardian_modes.sql` via Drizzle generation
- Create: `migrations/meta/0010_snapshot.json` via Drizzle generation
- Modify: `migrations/meta/_journal.json` via Drizzle generation
- Create: `tests/guardian-access-schema.test.mjs`
- Modify: `tests/learner-profile-infrastructure.test.mjs`

**Interfaces:**
- Produces: `schema.guardianSessionUnlock` with `sessionId`, `unlockedAt`, and `expiresAt`.
- Produces: `schema.learnerProfile.storyLevel: string`, default `"first-words"`.
- Consumes: existing Better Auth `session` and learner-profile tables.

- [ ] **Step 1: Write failing schema and migration tests**

```js
it("stores one expiring guardian unlock per auth session", () => {
  assert.equal(getTableName(schema.guardianSessionUnlock), "guardian_session_unlock");
  assert.deepEqual(Object.keys(getTableColumns(schema.guardianSessionUnlock)), [
    "sessionId", "unlockedAt", "expiresAt",
  ]);
  const database = createMigratedDatabase();
  const sql = tableSql(database, "guardian_session_unlock");
  assert.match(sql, /session_id[^,]*PRIMARY KEY/i);
  assert.match(sql, /REFERENCES [`"]?session[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i);
  assert.match(sql, /expires_at[^,]*NOT NULL/i);
});

it("adds a constrained default story level to learner profiles", () => {
  const database = createMigratedDatabase();
  const sql = tableSql(database, "learner_profile");
  assert.match(sql, /story_level[^,]*DEFAULT ['"]first-words['"][^,]*NOT NULL/i);
  assert.match(sql, /story_level[^\n]*first-words[^\n]*early-a1/i);
});
```

Update `EXPECTED_MODELS.learnerProfile.properties` to include `storyLevel`
between `age` and `answersJson`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/guardian-access-schema.test.mjs tests/learner-profile-infrastructure.test.mjs
```

Expected: failures because `schema.guardianSessionUnlock` and
`learnerProfile.storyLevel` do not exist.

- [ ] **Step 3: Add the minimal Drizzle models**

Add to `learnerProfile`:

```ts
storyLevel: text("story_level").default("first-words").notNull(),
```

Add its check to the existing learner-profile table callback:

```ts
check(
  "learner_profile_story_level_check",
  sql`${table.storyLevel} in ('first-words', 'repeating-patterns', 'tiny-stories', 'early-a1')`,
),
```

Add the session unlock model:

```ts
export const guardianSessionUnlock = sqliteTable(
  "guardian_session_unlock",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    unlockedAt: integer("unlocked_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("guardian_session_unlock_expires_at_idx").on(table.expiresAt)],
);
```

- [ ] **Step 4: Generate and inspect the named migration**

Run:

```bash
npm run db:generate -- --name guardian_modes
```

Expected: `migrations/0010_guardian_modes.sql` adds `story_level`, rebuilds the
SQLite learner-profile constraint safely, and creates the unlock table/index.
Read the SQL and confirm it preserves every existing learner-profile column and
foreign key.

- [ ] **Step 5: Run schema tests and verify GREEN**

Run:

```bash
node --test tests/guardian-access-schema.test.mjs tests/learner-profile-infrastructure.test.mjs tests/auth-infrastructure.test.mjs
```

Expected: all pass with no migration or foreign-key warnings.

- [ ] **Step 6: Commit the persistence contract**

```bash
git add src/db/schema.ts migrations tests/guardian-access-schema.test.mjs tests/learner-profile-infrastructure.test.mjs
git commit -m "feat: persist guardian session access"
```

---

### Task 2: Add the guardian access service and authenticated API

**Files:**
- Create: `worker/guardian-access.ts`
- Modify: `worker/index.ts`
- Modify: `worker/api-security.ts`
- Modify: `wrangler.jsonc`
- Regenerate: `worker-configuration.d.ts`
- Create: `tests/guardian-access-worker.test.mjs`
- Modify: `tests/api-security.test.mjs`
- Modify: `tests/learner-profile-infrastructure.test.mjs`
- Modify: `tests/worker-auth.test.mjs`

**Interfaces:**
- Produces: `GUARDIAN_ACCESS_TTL_MS = 900_000`.
- Produces: `GuardianAccessPayload = { mode: "learner" } | { mode: "guardian"; expiresAt: string }`.
- Produces: `createGuardianAccessRepository(database, { now })` with `status`, `unlock`, `lock`, and `require` methods.
- Produces: `handleGuardianAccessRequest(input)` for `GET|POST|DELETE /api/guardian-access`.
- Produces: `checkGuardianUnlockRateLimit(request, env, userId)`.
- Consumes: `guardianSessionUnlock`, authenticated `sessionId/userId`, and a request-scoped `verifyPassword(password)` callback.

- [ ] **Step 1: Write failing repository boundary tests**

```js
it("expires guardian access at exactly fifteen minutes", async () => {
  const now = new Date("2026-08-25T08:00:00.000Z");
  const repository = createGuardianAccessRepository(database, { now: () => now });
  const unlocked = await repository.unlock("session-1");
  assert.deepEqual(unlocked, {
    mode: "guardian",
    expiresAt: "2026-08-25T08:15:00.000Z",
  });
  now.setMilliseconds(now.getMilliseconds() + GUARDIAN_ACCESS_TTL_MS);
  assert.deepEqual(await repository.status("session-1"), { mode: "learner" });
});

it("isolates unlock and lock state by session", async () => {
  await repository.unlock("session-1");
  assert.equal((await repository.status("session-2")).mode, "learner");
  await repository.lock("session-1");
  assert.equal((await repository.status("session-1")).mode, "learner");
});
```

- [ ] **Step 2: Write failing endpoint tests**

```js
it("unlocks only after server-side password verification", async () => {
  const passwords = [];
  const response = await handleGuardianAccessRequest({
    database,
    identity: { sessionId: "session-1", userId: "user-1" },
    request: new Request("https://example.test/api/guardian-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "guardian-secret" }),
    }),
    verifyPassword: async (password) => (passwords.push(password), true),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(passwords, ["guardian-secret"]);
  assert.equal((await response.json()).mode, "guardian");
});

it("uses one generic response for an invalid password", async () => {
  const response = await requestUnlock({ verifyPassword: async () => false });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "invalid_password",
    message: "The password did not match this account.",
  });
});
```

Also assert strict JSON keys, an 8 KiB body limit, `Cache-Control: no-store`,
401 for missing sessions, lazy deletion of expired rows, and DELETE lock.

- [ ] **Step 3: Run endpoint tests and verify RED**

Run:

```bash
node --test tests/guardian-access-worker.test.mjs tests/api-security.test.mjs tests/worker-auth.test.mjs
```

Expected: import/export failures for the guardian service and rate limiter.

- [ ] **Step 4: Implement the repository and request handler**

Use this public surface in `worker/guardian-access.ts`:

```ts
export const GUARDIAN_ACCESS_TTL_MS = 15 * 60 * 1000;

export type GuardianAccessPayload =
  | { mode: "learner" }
  | { mode: "guardian"; expiresAt: string };

export type GuardianAccessRepository = {
  status(sessionId: string): Promise<GuardianAccessPayload>;
  unlock(sessionId: string): Promise<GuardianAccessPayload>;
  lock(sessionId: string): Promise<{ mode: "learner" }>;
  require(sessionId: string): Promise<boolean>;
};

export declare function createGuardianAccessRepository(
  database: Database,
  dependencies: { now: () => Date } = { now: () => new Date() },
): GuardianAccessRepository;

export declare function handleGuardianAccessRequest(input: {
  database: Database;
  identity: { sessionId: string; userId: string };
  request: Request;
  verifyPassword: (password: string) => Promise<boolean>;
}): Promise<Response>;

export declare function requireGuardianAccess(input: {
  database: Database;
  sessionId: string;
  now?: () => Date;
}): Promise<Response | null>;
```

`status` and `require` must delete an expired row before returning learner
state. `unlock` writes one fixed `expiresAt = now + GUARDIAN_ACCESS_TTL_MS`.

- [ ] **Step 5: Add the dedicated rate limiter and Worker route**

Add `GUARDIAN_UNLOCK_RATE_LIMITER` with namespace `104206`, limit 5, period 60
to `wrangler.jsonc` and `RateLimitEnv`. Export:

```ts
export function checkGuardianUnlockRateLimit(
  request: Request,
  env: RateLimitEnv,
  userId: string,
) {
  return checkRateLimit(
    env.GUARDIAN_UNLOCK_RATE_LIMITER,
    `${userId}:${getClientAddress(request)}`,
    "Too many password attempts. Wait a minute, then try again.",
  );
}
```

In `createWorker`, authenticate `/api/guardian-access`, rate-limit POST, and
pass a callback that invokes:

```ts
const verified = await auth.api.verifyPassword({
  body: { password },
  headers: request.headers,
});
return Boolean(verified);
```

Normalize Better Auth invalid-credential exceptions to `false`; rethrow
unexpected errors. Reuse the same request-scoped `auth` instance for session
and password verification.

- [ ] **Step 6: Regenerate Cloudflare binding types**

Run:

```bash
npx wrangler types worker-configuration.d.ts --config wrangler.jsonc
```

Expected: `Env` includes `GUARDIAN_UNLOCK_RATE_LIMITER`.

- [ ] **Step 7: Run focused Worker tests and verify GREEN**

Run:

```bash
node --test tests/guardian-access-worker.test.mjs tests/api-security.test.mjs tests/learner-profile-infrastructure.test.mjs tests/worker-auth.test.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit the guardian access API**

```bash
git add worker/guardian-access.ts worker/index.ts worker/api-security.ts wrangler.jsonc worker-configuration.d.ts tests/guardian-access-worker.test.mjs tests/api-security.test.mjs tests/learner-profile-infrastructure.test.mjs tests/worker-auth.test.mjs
git commit -m "feat: add password protected guardian access"
```

---

### Task 3: Enforce guardian management APIs and persist story level

**Files:**
- Create: `lib/story-level.ts`
- Modify: `src/stories/story-catalog.ts`
- Modify: `worker/guardian-access.ts`
- Modify: `worker/index.ts`
- Modify: `worker/learner-profile.ts`
- Modify: `worker/learner-profile-repository.ts`
- Modify: `worker/conversations.ts`
- Modify: `src/learner-profile/learner-profile-api.ts`
- Modify: `tests/guardian-access-worker.test.mjs`
- Modify: `tests/learner-profile-worker.test.mjs`
- Modify: `tests/learner-profile-api.test.mjs`
- Modify: `tests/my-lessons-routing.test.mjs`
- Modify: `tests/personalized-story-art-routing.test.mjs`
- Modify: `tests/conversation-worker.test.mjs`

**Interfaces:**
- Produces: `STORY_LEVEL_IDS`, `StoryLevelId`, and `isStoryLevelId(value)` in `lib/story-level.ts`.
- Produces: `requiresGuardianAccess(pathname, method): boolean`.
- Produces: `saveStoryLevel(storyLevel, options)` client API.
- Extends: `LearnerProfileSummary.storyLevel: StoryLevelId`.
- Consumes: Task 2 `requireGuardianAccess({ database, sessionId })`.

- [ ] **Step 1: Write the failing authorization matrix test**

```js
const guarded = [
  ["GET", "/api/profile"],
  ["PUT", "/api/profile"],
  ["PUT", "/api/profile/preferences"],
  ["POST", "/api/lessons/my"],
  ["POST", "/api/lessons/my/generate"],
  ["PUT", "/api/lessons/my/lesson-1"],
  ["POST", "/api/stories/the-red-ball/personalized-art"],
  ["DELETE", "/api/stories/the-red-ball/personalized-art"],
];
for (const [method, path] of guarded) {
  assert.equal(requiresGuardianAccess(path, method), true, `${method} ${path}`);
}

const learnerSafe = [
  ["GET", "/api/learner-profile"],
  ["GET", "/api/lessons/my"],
  ["GET", "/api/lessons/my/lesson-1"],
  ["GET", "/api/stories/the-red-ball/personalized-art"],
  ["GET", "/api/stories/the-red-ball/personalized-art/asset"],
];
for (const [method, path] of learnerSafe) {
  assert.equal(requiresGuardianAccess(path, method), false, `${method} ${path}`);
}
```

Add Worker routing cases asserting every guarded request returns 403
`guardian_required` without calling its downstream handler, while live unlocks
reach the existing handler.

Add conversation cases asserting `purpose: "profile-edit"` start and stored
profile-edit review return 403 while locked, while onboarding and `small-chat`
continue to start and finalize without guardian access.

- [ ] **Step 2: Write failing story-level API tests**

```js
it("returns and updates the learner's selected story level", async () => {
  const loaded = await loadCompletedProfile();
  assert.equal(loaded.profile.storyLevel, "first-words");
  const saved = await putProfilePreferences({ storyLevel: "tiny-stories" });
  assert.equal(saved.profile.storyLevel, "tiny-stories");
});

it("rejects unknown story levels and extra preference keys", async () => {
  assert.equal((await putPreferences({ storyLevel: "expert" })).status, 400);
  assert.equal((await putPreferences({ storyLevel: "first-words", extra: true })).status, 400);
});
```

- [ ] **Step 3: Run the authorization/profile tests and verify RED**

Run:

```bash
node --test tests/guardian-access-worker.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profile-api.test.mjs tests/my-lessons-routing.test.mjs tests/personalized-story-art-routing.test.mjs tests/conversation-worker.test.mjs
```

Expected: failures because management methods are unguarded and story level is
not serialized or writable.

- [ ] **Step 4: Implement shared story-level validation and profile persistence**

Create:

```ts
export const STORY_LEVEL_IDS = [
  "first-words",
  "repeating-patterns",
  "tiny-stories",
  "early-a1",
] as const;
export type StoryLevelId = (typeof STORY_LEVEL_IDS)[number];
export function isStoryLevelId(value: unknown): value is StoryLevelId {
  return typeof value === "string" && STORY_LEVEL_IDS.includes(value as StoryLevelId);
}
```

Reuse these exports in `story-catalog.ts`. Add `storyLevel` to the profile
repository selection and `clientProfile`. Handle only:

```ts
if (url.pathname === "/api/profile/preferences" && request.method === "PUT") {
  const record = await readJsonRecord(request);
  if (Object.keys(record).length !== 1 || !isStoryLevelId(record.storyLevel)) {
    throw new ApiError(400, "invalid_story_level", "Choose an available story level.");
  }
  const profile = await repository.saveStoryLevel(identity.userId, record.storyLevel);
  return jsonResponse(profilePayload(profile));
}
```

Add the client function:

```ts
export function saveStoryLevel(
  storyLevel: StoryLevelId,
  options?: LearnerProfileRequestOptions,
) {
  return requestJson<ProfileState>(
    "/api/profile/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyLevel }),
    },
    options,
  );
}
```

- [ ] **Step 5: Apply the central Worker guard**

Implement the exact method/path predicate tested in Step 1. In `worker/index.ts`,
after authentication and before rate limits/downstream handlers:

```ts
if (requiresGuardianAccess(url.pathname, request.method)) {
  const denied = await requireGuardianAccess({
    database,
    sessionId: session.session.id,
  });
  if (denied) return denied;
}
```

Return `Response.json({ error: "guardian_required" }, { status: 403,
headers: { "Cache-Control": "no-store" } })` for absent/expired access.

Inside `handleConversationRequest`, check the parsed purpose before creating a
conversation and the stored purpose before reviewing it. Call
`requireGuardianAccess` only when the purpose is `"profile-edit"`; translate a
denial into the handler's normal 403 `{ error: "guardian_required" }` response.
Do not guard onboarding, small chat, or agent-ingest routes.

- [ ] **Step 6: Run guarded API tests and verify GREEN**

Run:

```bash
node --test tests/guardian-access-worker.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profile-api.test.mjs tests/my-lessons-routing.test.mjs tests/personalized-story-art-routing.test.mjs tests/conversation-worker.test.mjs
```

Expected: all pass; existing owner and consent assertions remain green.

- [ ] **Step 7: Commit server authorization and story preference**

```bash
git add lib/story-level.ts src/stories/story-catalog.ts worker/guardian-access.ts worker/index.ts worker/learner-profile.ts worker/learner-profile-repository.ts worker/conversations.ts src/learner-profile/learner-profile-api.ts tests
git commit -m "feat: guard guardian management APIs"
```

---

### Task 4: Build the browser guardian-access state boundary

**Files:**
- Create: `src/auth/guardian-access-api.ts`
- Create: `src/auth/GuardianAccess.tsx`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/learner-profile/learner-profile-api.ts`
- Modify: `src/lessons/my-lessons-api.ts`
- Modify: `src/stories/personalized-story-art-client.ts`
- Modify: `src/conversation/conversation-api.ts`
- Create: `tests/guardian-access-api.test.mjs`
- Create: `tests/guardian-access-ui.test.mjs`
- Modify: `tests/learner-profile-api.test.mjs`
- Modify: `tests/my-lessons-api.test.mjs`
- Modify: `tests/personalized-story-art-client.test.mjs`
- Modify: `tests/conversation-api.test.mjs`
- Modify: `tests/auth-ui.test.mjs`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `loadGuardianAccess`, `unlockGuardianAccess`, and `lockGuardianAccess`.
- Produces: `GuardianAccessProvider` and `useGuardianAccess()`.
- Produces: `notifyGuardianAccessRequired()` for guarded API clients.
- `useGuardianAccess()` returns `{ mode, expiresAt, error, retry, unlock, lock }` where `mode` is `"loading" | "learner" | "guardian"`.
- Consumes: Task 2 API and `AuthGate` session identity.

- [ ] **Step 1: Write failing same-origin client API tests**

```js
it("uses the exact guardian access routes and JSON body", async () => {
  const request = createFetchRecorder({ mode: "guardian", expiresAt: "2026-08-25T08:15:00.000Z" });
  await loadGuardianAccess({ fetch: request.fetch });
  await unlockGuardianAccess("secret", { fetch: request.fetch });
  await lockGuardianAccess({ fetch: request.fetch });
  assert.deepEqual(request.calls.map(({ path, method }) => [method, path]), [
    ["GET", "/api/guardian-access"],
    ["POST", "/api/guardian-access"],
    ["DELETE", "/api/guardian-access"],
  ]);
  assert.equal(request.calls[1].body, JSON.stringify({ password: "secret" }));
});
```

Assert `GuardianAccessApiError` preserves `status`, `code`, and safe message.

- [ ] **Step 2: Write failing provider lifecycle tests**

```js
it("fails closed, expires from the server timestamp, and rechecks on visibility", async () => {
  const states = [];
  const Provider = createGuardianAccessProvider({
    api: fakeApi,
    now: () => clock.now,
    schedule: fakeSchedule,
  });
  renderProvider(Provider, (state) => states.push(state.mode));
  assert.deepEqual(states, ["loading", "guardian"]);
  clock.runAt("2026-08-25T08:15:00.000Z");
  assert.equal(states.at(-1), "learner");
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(fakeApi.loadCalls, 2);
});
```

Add cases for identity changes resetting state, unlock success, unlock failure,
lock failure staying guardian, successful lock becoming learner, stale async
results being ignored, and `notifyGuardianAccessRequired()` synchronizing the
provider back to learner mode.

In each guarded API client test, prove that a real parsed
`403 { error: "guardian_required" }` response emits the synchronization event
before the client's existing typed error is observed. This catches a missing
notification branch rather than asserting on a mock callback.

- [ ] **Step 3: Run client/provider tests and verify RED**

Run:

```bash
node --test tests/guardian-access-api.test.mjs tests/guardian-access-ui.test.mjs tests/learner-profile-api.test.mjs tests/my-lessons-api.test.mjs tests/personalized-story-art-client.test.mjs tests/conversation-api.test.mjs tests/auth-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: missing-module failures.

- [ ] **Step 4: Implement the API client**

Use:

```ts
export type GuardianAccessState =
  | { mode: "learner" }
  | { mode: "guardian"; expiresAt: string };

export class GuardianAccessApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) { super(message); }
}
```

Each request parses JSON defensively, uses `Cache-Control` semantics from the
server, and maps invalid payloads to one retryable client error.

- [ ] **Step 5: Implement one provider with injectable lifecycle dependencies**

Export the production provider and hook:

```ts
export type GuardianMode = "loading" | "learner" | "guardian";

export type GuardianAccessContextValue = {
  mode: GuardianMode;
  expiresAt: string | null;
  error: string;
  retry: () => void;
  unlock: (password: string) => Promise<string | null>;
  lock: () => Promise<string | null>;
};

export declare function GuardianAccessProvider(props: {
  children: ReactNode;
  sessionIdentity: string | null;
}): ReactNode;

export declare function useGuardianAccess(): GuardianAccessContextValue;

export declare function notifyGuardianAccessRequired(): void;
```

Keep test-only clocks and fake APIs in tests. Use `AbortController`, one
operation sequence ref, `setTimeout`, and `visibilitychange`; add no dependency.

When `learner-profile-api`, `my-lessons-api`, `personalized-story-art-client`,
or `conversation-api` parses a 403 payload whose code is `guardian_required`,
call `notifyGuardianAccessRequired()` before throwing its existing typed error.

- [ ] **Step 6: Mount the provider at the signed-in AuthGate boundary**

Wrap `AuthGateView` with `GuardianAccessProvider` using the existing
`getSessionIdentity(session)`. Do not issue guardian-access requests for a null
session. Ensure sign-out and a changed account identity reset state before a new
profile header can render.

- [ ] **Step 7: Run browser-state tests and verify GREEN**

Run:

```bash
node --test tests/guardian-access-api.test.mjs tests/guardian-access-ui.test.mjs tests/learner-profile-api.test.mjs tests/my-lessons-api.test.mjs tests/personalized-story-art-client.test.mjs tests/conversation-api.test.mjs tests/auth-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: all pass with no unhandled promise warnings.

- [ ] **Step 8: Commit the browser state boundary**

```bash
git add src/auth/guardian-access-api.ts src/auth/GuardianAccess.tsx src/auth/AuthGate.tsx src/learner-profile/learner-profile-api.ts src/lessons/my-lessons-api.ts src/stories/personalized-story-art-client.ts src/conversation/conversation-api.ts tests/guardian-access-api.test.mjs tests/guardian-access-ui.test.mjs tests/learner-profile-api.test.mjs tests/my-lessons-api.test.mjs tests/personalized-story-art-client.test.mjs tests/conversation-api.test.mjs tests/auth-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "feat: synchronize guardian access in the app shell"
```

---

### Task 5: Put the identity switch and unlock UI in the shared profile dropdown

**Files:**
- Create: `src/auth/GuardianUnlock.tsx`
- Modify: `src/auth/account-actions.tsx`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/app/AppHeader.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `tests/auth-ui.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`

**Interfaces:**
- Produces: `GuardianUnlockForm`, `GuardianUnlockDialog`, and `GuardianUnlockScreen` sharing one submit contract.
- Extends: account registration to `{ error, learnerName, onOpenProfile }`.
- Consumes: `useGuardianAccess()` and existing `useDialogFocus`/shared controls.

- [ ] **Step 1: Write failing rendered-header tests**

```js
test("learner mode names the learner and exposes only the profile switch", () => {
  const html = renderAccountHeader({
    activeMode: "learner",
    learnerLabel: "Mia",
    guardianLabel: "Patrick",
  });
  assert.match(html, /Mia/);
  assert.match(html, /Learner/);
  assert.match(html, /Guardian/);
  assert.doesNotMatch(html, /AI and saved data|Sign out|Delete account|Learner profile/);
});

test("guardian mode exposes management actions after the switch", () => {
  const html = renderAccountHeader({ activeMode: "guardian" });
  assert.match(html, /Learner profile/);
  assert.match(html, /AI and saved data/);
  assert.match(html, /Sign out/);
  assert.match(html, /Delete account/);
});
```

Add accessible-name assertions for `Profile for Mia, learner mode` and compact
labels, plus learner-name registration cleanup on account/profile changes.

- [ ] **Step 2: Write failing unlock form behavior tests**

```js
it("keeps an incorrect password in the dialog and clears password state", async () => {
  const unlock = async (password) => {
    assert.equal(password, "wrong-password");
    return "The password did not match this account.";
  };
  const view = renderUnlock({ unlock });
  await view.fill("Password", "wrong-password");
  await view.submit("Unlock guardian mode");
  assert.equal(view.alertText(), "The password did not match this account.");
  assert.equal(view.passwordValue(), "");
});
```

Cover pending state, cancel focus restoration, Enter submit, success live
announcement, and network failure remaining learner.

- [ ] **Step 3: Run focused UI tests and verify RED**

Run:

```bash
node --test tests/auth-ui.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

Expected: failures because mode props and unlock components are absent.

- [ ] **Step 4: Expand the existing upward account registration**

Replace `ProfileAccountAction` with:

```ts
export type AccountExperience = {
  error: string;
  learnerName: string | null;
  onOpenProfile: (() => void) | null;
};
```

Keep one provider/setter and one registration hook. `LearnerProfileGate`
registers the completed profile name and profile action together, clearing only
the exact object it registered during cleanup.

- [ ] **Step 5: Build the shared unlock form/dialog/screen**

`GuardianUnlockForm` receives:

```ts
type GuardianUnlockFormProps = {
  autoFocus?: boolean;
  onCancel: () => void;
  onUnlocked?: () => void;
};
```

It calls `useGuardianAccess().unlock(password)`, wipes password in `finally`,
and renders exact copy from the spec. `GuardianUnlockDialog` uses
`useDialogFocus`; `GuardianUnlockScreen` uses `FeaturePlaceholder`/`Card` and
the same form without dialog semantics.

- [ ] **Step 6: Render the switch directly beneath active identity**

Extend `AccountHeader` with active/guardian/learner labels and mode callbacks.
Use one shared `SegmentedControl` labeled `Choose profile mode`, two
`SegmentedButton`s, and selected state. Keep it before the `role="menu"`
account-action list so ARIA menu children remain menu items.

Learner mode renders an empty account-action list; guardian mode renders the
existing four actions. Switching to learner awaits `lock()`: on failure, keep
guardian selected and render the exact lock error from the spec.
When unlock was initiated from the profile dropdown, pass
`onUnlocked={() => navigate("/guardian")}`; a route-level unlock screen omits
that callback and therefore resumes its existing guardian URL.

- [ ] **Step 7: Run profile-dropdown tests and verify GREEN**

Run:

```bash
node --test tests/auth-ui.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

Expected: all pass, including existing Arrow/Home/End/Escape and dialog focus
tests.

- [ ] **Step 8: Commit the shared profile switch**

```bash
git add src/auth/GuardianUnlock.tsx src/auth/account-actions.tsx src/auth/AuthGate.tsx src/app/AppHeader.tsx src/learner-profile/LearnerProfileGate.tsx tests/auth-ui.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
git commit -m "feat: add guardian learner profile switch"
```

---

### Task 6: Add role-specific route boundaries and the guardian dashboard

**Files:**
- Create: `src/app/ModeRouteBoundaries.tsx`
- Create: `src/app/GuardianDashboard.tsx`
- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `tests/app-routes.test.mjs`
- Modify: `tests/product-streamline.test.mjs`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `isGuardianRoute(pathname, search)` and guardian path helpers.
- Produces: `GuardianModeBoundary` and `LearnerModeBoundary` React Router outlet boundaries.
- Produces: `/guardian`, `/guardian/lessons`, and `/guardian/stories` canonical routes.
- Consumes: `useGuardianAccess`, `GuardianUnlockScreen`, existing lesson route-exit registry, and registered learner name.

- [ ] **Step 1: Write failing route-helper tests**

```js
assert.equal(isGuardianRoute("/guardian"), true);
assert.equal(isGuardianRoute("/guardian/lessons"), true);
assert.equal(isGuardianRoute("/guardian/stories"), true);
assert.equal(isGuardianRoute("/profile"), true);
assert.equal(isGuardianRoute("/profile/setup", "?redo=1"), true);
assert.equal(isGuardianRoute("/lessons/my/lesson-1/edit"), true);
assert.equal(isGuardianRoute("/lessons"), false);
assert.equal(getSafeReturnTo("?returnTo=%2Fguardian%2Fstories"), "/guardian/stories");
```

Add rejection cases for lookalike paths and encoded external URLs.

- [ ] **Step 2: Write failing boundary lifecycle tests**

```js
test("locked guardian routes render only the unlock screen", () => {
  const html = renderRoute("/profile", { mode: "learner" });
  assert.match(html, /Unlock guardian mode/);
  assert.doesNotMatch(html, /Save changes|Redo setup questions/);
});

test("guardian mode does not render learner activities", () => {
  const html = renderRoute("/lessons", { mode: "guardian" });
  assert.match(html, /Switch to learner mode/);
  assert.doesNotMatch(html, /Pick a lesson/);
});
```

Cover loading state, same-URL resume after unlock, cancel to `/`, fixed-expiry
transition, route-focus heading, and lesson work cancellation on mode change.

- [ ] **Step 3: Run route/lifecycle tests and verify RED**

Run:

```bash
node --test tests/app-routes.test.mjs tests/product-streamline.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: missing guardian helpers/routes/boundaries.

- [ ] **Step 4: Implement boundaries and route groups**

`GuardianModeBoundary` behavior:

```tsx
if (mode === "loading") return <FeaturePlaceholder busy title="Checking guardian access…" />;
if (mode === "learner") return <GuardianUnlockScreen onCancel={() => navigate("/")} />;
return <Outlet />;
```

`LearnerModeBoundary` renders `<Outlet />` only in learner mode; guardian mode
renders one `Switch to learner mode` action that awaits `lock()` before routing
to `/`. Put activity routes beneath it and management routes beneath the
guardian boundary. Keep login and initial `/profile/setup` outside both, but
route `/profile/setup?redo=1` through the guardian unlock boundary before
`LearnerProfileGate` starts a profile-edit conversation.

- [ ] **Step 5: Build the guardian dashboard**

Render four accessible cards with exact headings `Learner profile`, `My
Lessons`, `Story settings`, and `Account and privacy`. The first three link to
their canonical routes. The fourth explains that AI/data, sign-out, and deletion
are in the profile dropdown. Include one `Switch to learner` action that awaits
server lock. Reuse `RouteHeader`, `ActionLink`, `ActionButton`, and `Card`.

- [ ] **Step 6: Run route/dashboard tests and verify GREEN**

Run:

```bash
node --test tests/app-routes.test.mjs tests/product-streamline.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: all pass without retired-route or safe-return regressions.

- [ ] **Step 7: Commit the route separation**

```bash
git add src/app/ModeRouteBoundaries.tsx src/app/GuardianDashboard.tsx src/app/app-routes.ts src/app/App.tsx tests/app-routes.test.mjs tests/product-streamline.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "feat: separate guardian and learner routes"
```

---

### Task 7: Move custom-lesson management into guardian mode

**Files:**
- Create: `src/lessons/useMyLessons.ts`
- Create: `src/lessons/GuardianLessonManager.tsx`
- Modify: `src/lessons/LessonList.tsx`
- Modify: `src/app/App.tsx`
- Modify: `tests/lesson-list-page.test.mjs`
- Modify: `tests/my-lessons-api.test.mjs`
- Modify: `tests/my-lessons-routing.test.mjs`
- Create: `tests/guardian-lesson-manager.test.mjs`

**Interfaces:**
- Produces: `useMyLessons()` with `{ lessons, phase, retry }` used by both shelves.
- Produces: `GuardianLessonManager` at `/guardian/lessons`.
- Consumes: `loadMyLessons`, route helpers, and `useGuardianAccess().lock()`.

- [ ] **Step 1: Write failing learner-shelf tests**

```js
test("learner lesson list contains play actions and no management actions", () => {
  const html = renderLessonList({ myLessons: [savedLesson] });
  assert.match(html, /Start lesson: Made for Mia/);
  assert.doesNotMatch(html, /Grown-up: edit|Grown-up tools|Make a lesson|Create custom lesson/);
});
```

Keep assertions that ready-made and saved lessons render and that load failure
has a learner-safe retry action.

- [ ] **Step 2: Write failing guardian-manager tests**

```js
test("guardian lesson manager owns current authoring actions", () => {
  const html = renderGuardianLessonManager({ lessons: [savedLesson] });
  assert.match(html, /My Lessons/);
  assert.match(html, /Create custom lesson/);
  assert.match(html, /Edit lesson: Made for Mia/);
  assert.match(html, /Switch and play: Made for Mia/);
  assert.doesNotMatch(html, /Peppa's High Ball/);
});
```

Add a behavior test that `Switch and play` awaits successful lock, stays put on
lock failure, and navigates to the encoded lesson scene only after success.

- [ ] **Step 3: Run lesson tests and verify RED**

Run:

```bash
node --test tests/lesson-list-page.test.mjs tests/my-lessons-api.test.mjs tests/my-lessons-routing.test.mjs tests/guardian-lesson-manager.test.mjs
```

Expected: learner shelf still contains grown-up tools and manager module is
missing.

- [ ] **Step 4: Extract only the shared loading state**

Move the existing abortable load/retry/focus-independent logic into:

```ts
export function useMyLessons() {
  return {
    lessons: MyLessonDescriptor[],
    phase: "error" | "loading" | "ready" | "retrying",
    retry: () => void,
  };
}
```

Keep focus targets inside each consuming page. Do not create a generic catalog
framework.

- [ ] **Step 5: Remove management affordances from `LessonList`**

Delete the edit link and grown-up tools aside. Keep saved custom lesson cards
playable and the existing loading/error status. Ensure the learner page has no
link to create/edit routes.

- [ ] **Step 6: Implement `GuardianLessonManager`**

Use the shared load state to show saved lessons only. Each row/card has Edit and
Switch and play. Provide Create custom lesson. Preserve encoded ID helpers and
the current retry/focus behavior. Register it at `/guardian/lessons`.

- [ ] **Step 7: Run lesson tests and verify GREEN**

Run:

```bash
node --test tests/lesson-list-page.test.mjs tests/my-lessons-api.test.mjs tests/my-lessons-routing.test.mjs tests/guardian-lesson-manager.test.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit lesson experience separation**

```bash
git add src/lessons/useMyLessons.ts src/lessons/GuardianLessonManager.tsx src/lessons/LessonList.tsx src/app/App.tsx tests/lesson-list-page.test.mjs tests/my-lessons-api.test.mjs tests/my-lessons-routing.test.mjs tests/guardian-lesson-manager.test.mjs
git commit -m "feat: move lesson management to guardian mode"
```

---

### Task 8: Move story level and personalized-art management into guardian mode

**Files:**
- Create: `src/learner-profile/LearnerProfileContext.tsx`
- Create: `src/stories/GuardianStorySettings.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `src/stories/StoryList.tsx`
- Modify: `src/stories/usePersonalizedStoryArt.ts`
- Modify: `src/app/App.tsx`
- Modify: `tests/story-catalog.test.mjs`
- Modify: `tests/personalized-story-art-ui.test.mjs`
- Create: `tests/guardian-story-settings.test.mjs`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `LearnerProfileContext` / `useLearnerProfile()` with the loaded profile summary and one replacement callback.
- Produces: `GuardianStorySettings` at `/guardian/stories`.
- Consumes: `profile.storyLevel`, `saveStoryLevel`, existing `PersonalizedStoryArtPanel`, and existing art hook.

- [ ] **Step 1: Write failing learner story-shelf tests**

```js
test("learner story shelf uses the saved level and has no grown-up controls", () => {
  const html = renderStoryList({ storyLevel: "tiny-stories" });
  assert.match(html, /Tiny stories/);
  assert.doesNotMatch(html, /Grown-up options|Pick a story level|Guardian consent|Upload learner photo|Generate story art/);
});
```

Add canonicalization behavior: `/stories?level=early-a1` with a saved
`tiny-stories` profile replaces the URL with `/stories?level=tiny-stories` and
never renders Early A1 cards first.

- [ ] **Step 2: Write failing guardian story-settings tests**

```js
test("guardian story settings owns level and art management", () => {
  const html = renderGuardianStorySettings({ storyLevel: "first-words" });
  assert.match(html, /Story settings/);
  assert.match(html, /Choose story level/);
  assert.match(html, /Personalized story art/);
  assert.match(html, /Guardian consent/);
});
```

Add behavior cases for successful preference save, invalid/server failure
remaining on the prior level, focus/status announcement, and existing
generate/remove consent states.

- [ ] **Step 3: Run story tests and verify RED**

Run:

```bash
node --test tests/story-catalog.test.mjs tests/personalized-story-art-ui.test.mjs tests/guardian-story-settings.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: StoryList still contains grown-up controls and guardian settings/context
modules are missing.

- [ ] **Step 4: Expose the already-loaded learner profile to descendants**

Create a required context:

```ts
type LearnerProfileContextValue = {
  profile: LearnerProfileSummary;
  replaceProfile: (profile: LearnerProfileSummary) => void;
};

const LearnerProfileContext = createContext<LearnerProfileContextValue | null>(null);

export function useLearnerProfile() {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("Learner profile is unavailable.");
  return value;
}
```

Wrap only protected application children after `LearnerProfileGate` has full
profile data. Do not make a second profile request.

- [ ] **Step 5: Simplify the learner `StoryList`**

Read `profile.storyLevel` from context, canonicalize the query, render that shelf, and
delete the grown-up `<details>` block and art-management hook from this page.
Keep learner cards, covers, accessible headings, and reader routes unchanged.

- [ ] **Step 6: Implement `GuardianStorySettings`**

Render the four existing levels with shared `SegmentedControl`. On selection,
call `saveStoryLevel`, update local/context-visible state through the
`LearnerProfileGate` update callback, and announce success. Render the existing
`PersonalizedStoryArtPanel` below it with the same hook and consent behavior.
Register it at `/guardian/stories`.

- [ ] **Step 7: Run story tests and verify GREEN**

Run:

```bash
node --test tests/story-catalog.test.mjs tests/personalized-story-art-ui.test.mjs tests/guardian-story-settings.test.mjs tests/lifecycle/app-lifecycle.test.mjs
```

Expected: all pass and existing art cleanup/focus tests remain green.

- [ ] **Step 8: Commit story experience separation**

```bash
git add src/learner-profile/LearnerProfileContext.tsx src/learner-profile/LearnerProfileGate.tsx src/stories/GuardianStorySettings.tsx src/stories/StoryList.tsx src/stories/usePersonalizedStoryArt.ts src/app/App.tsx tests/story-catalog.test.mjs tests/personalized-story-art-ui.test.mjs tests/guardian-story-settings.test.mjs tests/lifecycle/app-lifecycle.test.mjs
git commit -m "feat: move story settings to guardian mode"
```

---

### Task 9: Verify responsive behavior and update product documentation

**Files:**
- Modify: `src/testing/e2e-browser-mocks.ts`
- Create: `tests/e2e/guardian-mode.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `tests/e2e/home-menu.spec.ts`
- Modify: `tests/e2e/lesson-player.spec.ts`
- Modify: `tests/e2e/surrounding-pages.spec.ts`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `README.md`

**Interfaces:**
- Produces: deterministic E2E guardian access scenarios (`learner`, `guardian`, `unlock-error`, `lock-error`, `expired`).
- Consumes: all prior task UI and API behavior.

- [ ] **Step 1: Add mock access state and route handlers**

Model a mutable per-page guardian state in `e2e-browser-mocks.ts`:

```ts
type MockGuardianAccess = {
  mode: "learner" | "guardian";
  expiresAt?: string;
};
```

Handle exact GET/POST/DELETE `/api/guardian-access`, accept
`e2e-guardian-password`, return the real error payload for any other password,
and return `guardian_required` from guarded mock mutations while learner.
Add `storyLevel` to every completed profile fixture.

- [ ] **Step 2: Write the full mode-switch behavior spec**

```ts
for (const viewport of [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
]) {
  test(`profile switch remains contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /Profile for Mia, learner mode/ }).click();
    const switcher = page.getByRole("group", { name: "Choose profile mode" });
    await expect(switcher).toBeVisible();
    await expectInsideViewport(switcher, viewport);
    expect(await horizontalOverflow(page)).toBe(false);
  });
}
```

Add scenarios for incorrect password, successful unlock, direct guardian deep
link, refresh during valid unlock, fixed expiry, failed lock, successful lock,
focus return, Arrow/Home/End/Escape behavior, learner action absence, guardian
management presence, and no protected-content flash.

- [ ] **Step 3: Add learner activity containment coverage**

At 280x568, 640x360, and 1440x900, switch to learner and open a lesson. Assert
the profile control, Back, start action/HUD, speech, and playback controls remain
inside the viewport and do not overlap. Extend story/home assertions to prove
there are no edit/create/photo/consent actions in learner mode.

- [ ] **Step 4: Run the focused browser specs and verify RED/GREEN during iteration**

Run:

```bash
npx playwright test tests/e2e/guardian-mode.spec.ts tests/e2e/header.spec.ts tests/e2e/home-menu.spec.ts tests/e2e/lesson-player.spec.ts tests/e2e/surrounding-pages.spec.ts
```

Before finalizing each behavior, confirm its new test failed for the missing or
incorrect behavior, then re-run until all focused specs pass.

- [ ] **Step 5: Update product and architecture documentation**

Document the two modes, canonical guardian routes, the 15-minute password
unlock, capability matrix, new Worker endpoint/table, learner story-level
selection, and required verification commands. Remove statements that custom
lesson creation or story settings are embedded grown-up actions on learner
pages.

- [ ] **Step 6: Run the complete verification gates**

Run in this order:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Expected: all commands exit 0 with no test failures, TypeScript errors, ESLint
errors, browser console errors, horizontal overflow, or accessibility regressions.

- [ ] **Step 7: Review the final diff against every spec requirement**

Run:

```bash
git status --short
git diff --check
git diff --stat 3433213..HEAD
rg -n "Grown-up: edit|Grown-up tools|Grown-up options" src
```

Expected: only intentional files are changed; `git diff --check` is empty; no
learner page contains the retired management labels. Manually map each design
spec capability row to one passing Worker or Playwright assertion.

- [ ] **Step 8: Commit docs and final responsive coverage**

```bash
git add src/testing/e2e-browser-mocks.ts tests/e2e docs/design README.md
git commit -m "test: verify guardian learner experience separation"
```
