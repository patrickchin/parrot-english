# Shared Guest Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-visitor anonymous accounts with one permanent shared guest account so every guest sees the same data and sign-out revokes only the current session.

**Architecture:** Seed one fixed non-anonymous Better Auth user and one completed learner named Sam. A small custom Better Auth endpoint creates ordinary sessions for that fixed user after Turnstile succeeds. Existing user-ID ownership makes all durable guest data shared, while existing session-scoped learner selection remains per browser. The client uses ordinary Better Auth sign-out, and both the UI and Better Auth deletion hook prevent deletion of the fixed shared identity.

**Tech Stack:** React 19, TypeScript, Better Auth 1.6, Cloudflare Worker/D1, Drizzle ORM/Kit, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-shared-guest-account-design.md`

## Global Constraints

- Start implementation from the current detached HEAD by creating `codex/shared-guest-account`; merge into `main` only through a pull request and never merge the feature branch directly.
- Keep the feature deliberately simple: one identity, one shared data set, current last-write behavior, no reset job, partitioning, locking, quota, or historical-anonymous migration.
- Use only Bob, Mary, Rose, Jack, Ben, or Sam for authored learner names. The seeded learner is Sam.
- Keep Tailwind utilities in React components and use existing shared controls and headers. Do not add page-specific global CSS.
- Keep one `h1` per route and preserve the Account & privacy information for the shared account; omit only destructive account controls.
- Test rendered behavior with Playwright and accessible locators, never CSS source or class names. Run `npm run test:browser` because Account & privacy rendering changes.
- Do not generate or modify audio.

---

### Task 1: Fixed identity constants and idempotent D1 seed

**Files:**
- Create: `lib/shared-guest.ts`
- Create with Drizzle Kit: `migrations/0019_shared_guest_account.sql`
- Create with Drizzle Kit: `migrations/meta/0019_snapshot.json`
- Modify through Drizzle Kit: `migrations/meta/_journal.json`
- Create: `tests/shared-guest-migration.test.mjs`
- Modify: `tests/learner-identity.test.mjs`
- Modify: `tests/learner-profile-worker.test.mjs`
- Modify: `tests/learner-profiles-worker.test.mjs`
- Modify: `tests/account-deletion.test.mjs`

**Interfaces:**
- Produces: stable browser-safe constants for the shared user, internal email, and seeded learner.
- Produces: one non-anonymous `user` row and one completed legacy-owner `learner_profile` row, with no credential `account`, pre-created `session`, or `session_learner_selection` row.
- Preserves: production migrations remain present in the standard D1 test fixture; unrelated tests scope whole-table assertions to their own account instead of hiding the seed.

- [ ] **Step 1: Create the feature branch**

Run:

```bash
git status --short
git switch -c codex/shared-guest-account
```

Expected: the branch starts at the current HEAD containing the approved spec and this plan; no unrelated tracked changes are present.

- [ ] **Step 2: Write the failing shared-seed migration test**

Create `tests/shared-guest-migration.test.mjs` with a real in-memory SQLite database and every production migration:

```js
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SHARED_GUEST_EMAIL,
  SHARED_GUEST_LEARNER_ID,
  SHARED_GUEST_LEARNER_NAME,
  SHARED_GUEST_USER_ID,
} from "../lib/shared-guest.ts";
import { readTestMigrations } from "./helpers/test-migrations.mjs";

test("seeds one reusable shared guest identity without credentials", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    const migrations = readTestMigrations();
    for (const migration of migrations) database.exec(migration.sql);

    const user = {
      ...database
        .prepare(
          `SELECT id, name, email, email_verified, is_anonymous
             FROM user WHERE id = ?`,
        )
        .get(SHARED_GUEST_USER_ID),
    };
    assert.deepEqual(
      user,
      {
        email: SHARED_GUEST_EMAIL,
        email_verified: 0,
        id: SHARED_GUEST_USER_ID,
        is_anonymous: 0,
        name: "Guest",
      },
    );

    const profile = database
      .prepare(
        `SELECT id, auth_user_id, legacy_storage_owner, name,
                onboarding_status, completed_at, answers_json
           FROM learner_profile WHERE id = ?`,
      )
      .get(SHARED_GUEST_LEARNER_ID);
    assert.equal(profile.auth_user_id, SHARED_GUEST_USER_ID);
    assert.equal(profile.legacy_storage_owner, 1);
    assert.equal(profile.name, SHARED_GUEST_LEARNER_NAME);
    assert.equal(profile.onboarding_status, "completed");
    assert.ok(profile.completed_at);
    assert.deepEqual(JSON.parse(profile.answers_json), {
      schemaVersion: 2,
      questionnaireVersion: 2,
      responses: {},
      legacyAnswers: null,
      description: null,
    });
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM account WHERE user_id = ?")
        .get(SHARED_GUEST_USER_ID).count,
      0,
    );
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM session WHERE user_id = ?")
        .get(SHARED_GUEST_USER_ID).count,
      0,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);

    const seed = migrations.find(
      ({ name }) => name === "0019_shared_guest_account.sql",
    );
    assert.ok(seed);
    const beforeReplay = {
      profile: {
        ...database
          .prepare("SELECT * FROM learner_profile WHERE id = ?")
          .get(SHARED_GUEST_LEARNER_ID),
      },
      user: {
        ...database
          .prepare("SELECT * FROM user WHERE id = ?")
          .get(SHARED_GUEST_USER_ID),
      },
    };
    database.exec(seed.sql);
    assert.deepEqual(
      {
        ...database
          .prepare("SELECT * FROM user WHERE id = ?")
          .get(SHARED_GUEST_USER_ID),
      },
      beforeReplay.user,
    );
    assert.deepEqual(
      {
        ...database
          .prepare("SELECT * FROM learner_profile WHERE id = ?")
          .get(SHARED_GUEST_LEARNER_ID),
      },
      beforeReplay.profile,
    );
  } finally {
    database.close();
  }
});
```

Also import `SHARED_GUEST_LEARNER_ID`, `SHARED_GUEST_LEARNER_NAME`, and
`SHARED_GUEST_USER_ID` in `tests/learner-identity.test.mjs`, then add a runtime
resolver test proving a new session for the seeded account auto-selects Sam:

```js
it("auto-selects seeded Sam for a new shared guest session", async () => {
  insertSession(state, "shared-guest-session", SHARED_GUEST_USER_ID);

  assert.deepEqual(
    await resolveLearnerIdentity(
      database,
      account("shared-guest-session", SHARED_GUEST_USER_ID, "Guest"),
    ),
    {
      status: "selected",
      identity: {
        sessionId: "shared-guest-session",
        userId: SHARED_GUEST_USER_ID,
        userName: "Guest",
        learnerProfileId: SHARED_GUEST_LEARNER_ID,
        learnerName: SHARED_GUEST_LEARNER_NAME,
        legacyStorageOwner: true,
      },
    },
  );
});
```

Import the same constants in `tests/learner-profile-worker.test.mjs`, insert a
normal session row for `SHARED_GUEST_USER_ID`, and add a request-level Worker
test that uses the real learner-profile handler. A `GET /api/learner-profile`
for that session must return:

```js
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.profile.id, SHARED_GUEST_LEARNER_ID);
assert.equal(payload.profile.name, SHARED_GUEST_LEARNER_NAME);
assert.equal(payload.profile.profileStatus, "completed");
assert.equal(payload.question, null);
assert.equal(payload.canBypass, true);
```

This request-level case proves both automatic single-profile selection and the
runtime contract that a new shared guest enters completed Sam without setup.

- [ ] **Step 3: Run the new test and verify the missing constants fail first**

Run: `node --test tests/shared-guest-migration.test.mjs`

Expected: FAIL because `lib/shared-guest.ts` does not exist.

- [ ] **Step 4: Add the fixed, non-secret identity constants**

```ts
export const SHARED_GUEST_USER_ID = "shared-guest-user";
export const SHARED_GUEST_EMAIL = "shared-guest@parrotbook.invalid";
export const SHARED_GUEST_LEARNER_ID = "shared-guest-sam";
export const SHARED_GUEST_LEARNER_NAME = "Sam";
```

Re-run: `node --test tests/shared-guest-migration.test.mjs`

Expected: FAIL because the fixed rows and `0019` migration are still absent.

- [ ] **Step 5: Generate a custom data migration through Drizzle Kit**

Run: `npm run db:generate -- --custom --name shared_guest_account`

Expected: Drizzle creates `migrations/0019_shared_guest_account.sql`, writes the unchanged-schema `migrations/meta/0019_snapshot.json`, and records `0019` in `migrations/meta/_journal.json`. Keep the generated snapshot and journal entry even though the migration changes only data.

- [ ] **Step 6: Fill the generated migration with the idempotent seed**

```sql
INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `is_anonymous`)
VALUES (
  'shared-guest-user',
  'Guest',
  'shared-guest@parrotbook.invalid',
  0,
  0
)
ON CONFLICT (`id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `learner_profile` (
  `id`,
  `auth_user_id`,
  `legacy_storage_owner`,
  `name`,
  `story_level`,
  `answers_json`,
  `skipped_question_keys_json`,
  `onboarding_status`,
  `completed_at`
)
VALUES (
  'shared-guest-sam',
  'shared-guest-user',
  1,
  'Sam',
  'first-words',
  '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"legacyAnswers":null,"description":null}',
  '[]',
  'completed',
  (unixepoch('subsecond') * 1000)
)
ON CONFLICT (`id`) DO NOTHING;
```

- [ ] **Step 7: Prove the seed and its second application succeed**

Run: `node --test tests/shared-guest-migration.test.mjs`

Expected: PASS with one fixed user, one completed Sam profile, valid foreign keys, no credential, and no pre-created session.

- [ ] **Step 8: Expose existing whole-table assumptions**

Run:

```bash
node --test tests/learner-identity.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profiles-worker.test.mjs tests/account-deletion.test.mjs
```

Expected: FAIL only where tests count or list all `learner_profile` rows and now see the legitimate shared Sam seed.

- [ ] **Step 9: Scope those assertions to the account under test**

Use account-bound queries, without changing the production migration fixture:

```sql
SELECT auth_user_id, legacy_storage_owner, name, onboarding_status
FROM learner_profile
WHERE auth_user_id = 'user-a'
```

```sql
SELECT count(*) AS count
FROM learner_profile
WHERE auth_user_id = ?
```

Apply the first form to the zero-profile list assertion in `tests/learner-identity.test.mjs`. Apply the second form to the two remaining identity counts (`user-a`), the two profile-worker counts (`user-1`), the two roster-worker counts (`user-a`), and the post-account-deletion count (`USER_ID`). Do not delete or filter the shared seed in `createTestD1Database()`.

- [ ] **Step 10: Re-run the seed and affected persistence suites**

Run:

```bash
node --test tests/shared-guest-migration.test.mjs tests/learner-identity.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profiles-worker.test.mjs tests/account-deletion.test.mjs
```

Expected: PASS.

- [ ] **Step 11: Commit the seed**

```bash
git add lib/shared-guest.ts migrations/0019_shared_guest_account.sql migrations/meta/0019_snapshot.json migrations/meta/_journal.json tests/shared-guest-migration.test.mjs tests/learner-identity.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profiles-worker.test.mjs tests/account-deletion.test.mjs
git commit -m "feat: seed shared guest account"
```

### Task 2: Turnstile-protected Better Auth shared-session endpoint

**Files:**
- Create: `worker/shared-guest-auth.ts`
- Modify: `worker/auth.ts`
- Modify: `tests/worker-auth.test.mjs`

**Interfaces:**
- Produces: Better Auth plugin endpoint `POST /api/auth/sign-in/shared-guest`.
- Consumes: the fixed seeded user; it never creates a fallback user.
- Produces: a fresh normal Better Auth session and signed session cookie for every successful request.
- Protects: shared-user deletion is rejected by Better Auth's `beforeDelete` hook before account cleanup or R2 work begins.

- [ ] **Step 1: Replace anonymous-plugin expectations with failing shared-endpoint tests**

In `tests/worker-auth.test.mjs`:

- import `SHARED_GUEST_USER_ID` and `sharedGuestAuth`;
- expect a plugin with ID `shared-guest` and no plugin with ID `anonymous`;
- expect captcha endpoints `['/sign-in/shared-guest', '/sign-up/email']`;
- change the missing-CAPTCHA request from `/api/auth/sign-in/anonymous` to `/api/auth/sign-in/shared-guest`;
- assert `/api/auth/sign-in/anonymous` and `/api/auth/delete-anonymous-user` return `404` after the anonymous plugin is removed.

Add an integration test that uses `createTestD1Database()` and temporarily makes the Turnstile site-verify fetch return:

```js
Response.json({ success: true, action: "account_access" })
```

Call the shared endpoint twice and assert:

```js
assert.equal(first.status, 200);
assert.equal(second.status, 200);
assert.equal(firstBody.user.id, SHARED_GUEST_USER_ID);
assert.equal(secondBody.user.id, SHARED_GUEST_USER_ID);
assert.notEqual(firstBody.token, secondBody.token);
assert.match(first.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
assert.match(second.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
assert.deepEqual(
  {
    ...state.sqlite
      .prepare(
        `SELECT user_id, count(*) AS count, count(DISTINCT token) AS tokens
           FROM session WHERE user_id = ? GROUP BY user_id`,
      )
      .get(SHARED_GUEST_USER_ID),
  },
  { user_id: SHARED_GUEST_USER_ID, count: 2, tokens: 2 },
);
```

Add a missing-seed case that deletes `SHARED_GUEST_USER_ID`, submits a valid Turnstile proof, expects a contained `500` Better Auth error, and verifies no replacement user or session was created.

Directly invoke `sharedGuestAuth().endpoints.signInSharedGuest` with a minimal
endpoint context whose `findUserById` returns the fixed user and whose
`createSession` returns `null`. Assert the rejected `APIError` has status code
`500` and body code `SHARED_GUEST_SESSION_FAILED`. This covers the contained
session-creation failure that a real D1 adapter cannot naturally produce.

For the Turnstile integration cases, save `globalThis.fetch`, install a
site-verify stub that returns the valid `account_access` action, and restore the
original fetch in `finally`. Send `origin: https://example.test`,
`content-type: application/json`, `cf-connecting-ip`, and
`x-captcha-response` headers on each sign-in request.

Add a deletion-guard integration case: sign in once, then send the returned
cookie to `POST /api/auth/delete-user` with `{}`. Include the cookie,
`origin: https://example.test`, `content-type: application/json`, and
`cf-connecting-ip` headers so Better Auth reaches the deletion hook. Expect
`403 SHARED_GUEST_DELETE_FORBIDDEN`, assert the cleanup dependency was not
called, and assert both shared user and session rows remain.

Update the existing ordinary deletion-hook test to invoke `beforeDelete` with a
non-shared user and assert its cleanup dependency still receives that user's ID.

- [ ] **Step 2: Run the focused server test and verify the new contract fails**

Run: `node --test tests/worker-auth.test.mjs`

Expected: FAIL because the anonymous plugin and old endpoint are still configured and there is no shared plugin or deletion guard.

- [ ] **Step 3: Implement the minimal custom Better Auth plugin**

Create `worker/shared-guest-auth.ts`:

```ts
import { APIError, type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { parseUserOutput } from "better-auth/db";
import { SHARED_GUEST_USER_ID } from "../lib/shared-guest.ts";

export function sharedGuestAuth(): BetterAuthPlugin {
  return {
    id: "shared-guest",
    endpoints: {
      signInSharedGuest: createAuthEndpoint(
        "/sign-in/shared-guest",
        { method: "POST" },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(
            SHARED_GUEST_USER_ID,
          );
          if (!user) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              code: "SHARED_GUEST_UNAVAILABLE",
              message: "Shared guest access is unavailable.",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              code: "SHARED_GUEST_SESSION_FAILED",
              message: "Shared guest access is unavailable.",
            });
          }

          await setSessionCookie(ctx, { session, user });
          return ctx.json({
            token: session.token,
            user: parseUserOutput(ctx.context.options, user),
          });
        },
      ),
    },
  };
}
```

- [ ] **Step 4: Register shared auth, replace the captcha target, and guard deletion**

In `worker/auth.ts`:

```ts
import { APIError, betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";
import { SHARED_GUEST_USER_ID } from "../lib/shared-guest.ts";
import { sharedGuestAuth } from "./shared-guest-auth.ts";
```

Replace the anonymous plugin and captcha endpoints with:

```ts
plugins: [
  sharedGuestAuth(),
  captcha({
    endpoints: ["/sign-in/shared-guest", "/sign-up/email"],
    expectedAction: AUTH_TURNSTILE_ACTION,
    provider: "cloudflare-turnstile",
    secretKey: turnstileSecret,
  }),
],
```

Make deletion fail before `prepareUserDataForDeletion`:

```ts
beforeDelete: async (user) => {
  if (user.id === SHARED_GUEST_USER_ID) {
    throw APIError.fromStatus("FORBIDDEN", {
      code: "SHARED_GUEST_DELETE_FORBIDDEN",
      message: "The shared guest account cannot be deleted.",
    });
  }
  await prepareUserDataForDeletion(user.id);
},
```

Delete the anonymous `onLinkAccount` cleanup configuration. Keep registered-account cleanup unchanged after the new guard.

- [ ] **Step 5: Re-run the real Better Auth tests**

Run: `node --test tests/worker-auth.test.mjs`

Expected: PASS, including two distinct cookies/sessions for one user, missing-seed failure, CAPTCHA rejection before DB work, old auth-route `404`s, and deletion rejection before cleanup.

- [ ] **Step 6: Commit the server endpoint**

```bash
git add worker/shared-guest-auth.ts worker/auth.ts tests/worker-auth.test.mjs
git commit -m "feat: add shared guest auth endpoint"
```

### Task 3: Retire the guest cleanup Worker route

**Files:**
- Modify: `worker/index.ts`
- Modify: `tests/worker-auth.test.mjs`

**Interfaces:**
- Removes: `POST /api/guest-account` and the Worker's guest-account cleanup dependency.
- Preserves: generic `/api/auth/*` delegation; Better Auth now owns shared sign-in and ordinary sign-out.
- Produces: the retired `/api/guest-account` route reaches the standard API `404` without auth lookup, D1/R2 cleanup, or asset fallback.

- [ ] **Step 1: Replace cleanup-first route tests with a failing retirement test**

Remove the tests for guest purge, regular-account exclusion, cross-origin guest deletion, non-POST guest deletion, and the Worker's explicit anonymous-deletion block. Add:

```js
it("leaves the retired guest-account endpoint unavailable", async () => {
  let authFactoryCalls = 0;
  const { env, getAssetCalls } = createEnvironment();
  const worker = createTestWorker({
    createAuth() {
      authFactoryCalls += 1;
      return createAuthStub().auth;
    },
  });

  for (const method of ["GET", "POST"]) {
    const response = await worker.fetch(
      new Request("https://example.test/api/guest-account", { method }),
      env,
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }
  assert.equal(authFactoryCalls, 0);
  assert.equal(getAssetCalls(), 0);
});
```

- [ ] **Step 2: Run the focused test and observe the live cleanup route**

Run: `node --test tests/worker-auth.test.mjs`

Expected: FAIL because the route still returns method/auth-specific responses and invokes cleanup dependencies.

- [ ] **Step 3: Remove the route and unused dependency injection**

From `worker/index.ts`, remove:

- the `prepareAccountDeletion` import;
- `WorkerDependencies.prepareAccountDeletion`;
- the local `accountDeletion` dependency;
- the complete `/api/guest-account` branch;
- the now-redundant special-case block for `/api/auth/delete-anonymous-user`.

Leave the generic `/api/auth` delegation followed by the standard unknown-API `404` unchanged.

- [ ] **Step 4: Re-run Worker auth tests**

Run: `node --test tests/worker-auth.test.mjs`

Expected: PASS with no cleanup route or anonymous auth endpoint.

- [ ] **Step 5: Commit route retirement**

```bash
git add worker/index.ts tests/worker-auth.test.mjs
git commit -m "refactor: retire anonymous guest cleanup"
```

### Task 4: Shared guest client flow, normal sign-out, and protected privacy UI

**Files:**
- Modify: `src/auth/auth-client.ts`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/auth/account-actions.tsx`
- Modify: `src/app/AccountPrivacyPage.tsx`
- Modify: `src/app/AccountDeleteDialog.tsx`
- Modify: `tests/auth-ui.test.mjs`
- Modify: `tests/lifecycle/accessibility-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `authClient.$fetch('/sign-in/shared-guest', ...)` with the existing Turnstile proof.
- Produces: all identities use `authClient.signOut()` with no guest cleanup and no explicit sign-out refetch.
- Produces: `isSharedGuest` in the account-action context, derived only from the fixed user ID.
- Preserves: registered-account deletion remains password-confirmed; the deletion dialog has no passwordless mode.
- Produces: shared Account & privacy retains its informational sections and route heading but renders no danger zone or delete dialog.

- [ ] **Step 1: Rewrite auth action tests for the shared endpoint and ordinary sign-out**

In `tests/auth-ui.test.mjs`:

- add `$fetch` to `createAuthClientStub` and remove `signIn.anonymous`;
- stop exporting/importing `deleteGuestAccount`;
- replace the anonymous-client source assertion with `createAuthClient()` and an assertion that `anonymousClient` is absent;
- make the gate session use `id: SHARED_GUEST_USER_ID` and expect `signOutAction` to receive only `{ client }`;
- change the guest sign-in test to assert:

```js
assert.deepEqual(calls, [
  {
    path: "/sign-in/shared-guest",
    options: {
      headers: { "x-captcha-response": "opaque-guest-proof" },
      method: "POST",
    },
  },
]);
assert.equal(refetchCalls, 1);
```

- retain the missing-token and `VERIFICATION_FAILED` message assertions through `$fetch`;
- return `SHARED_GUEST_SESSION_FAILED` from a `$fetch` stub and assert the
  existing contained guest error is returned, a retry can call `$fetch` again,
  and failed attempts never refetch the session;
- delete the guest-cleanup helper test and the passwordless guest deletion test;
- replace the guest cleanup sign-out case with one that asserts `client.signOut()` is called once and no explicit refetch function is accepted or called.

In `tests/lifecycle/accessibility-lifecycle.test.mjs`, import
`SHARED_GUEST_USER_ID`, add the new `$fetch` method to every AuthGate client
double (including `authClientForHeader()`), and set the account-page fixture's
`session.user.id` to `SHARED_GUEST_USER_ID`. Remove the passwordless
`AccountDeleteDialog` harness path and replace both anonymous deletion tests
with one shared-user account-page test. It must assert the `Account & privacy`
`h1`, AI/data information, and technical details remain, while `Danger zone`,
`Delete account`, `#delete-account-password`, and a delete dialog are all
absent; the injected delete action must have zero calls.

- [ ] **Step 2: Run the focused client tests and verify the old anonymous behavior fails**

Run:

```bash
node --test tests/auth-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

Expected: FAIL because the client still calls anonymous sign-in, guest sign-out still deletes data, and shared privacy still exposes deletion.

- [ ] **Step 3: Remove the Better Auth anonymous client plugin**

Make `src/auth/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 4: Switch guest entry to the custom endpoint**

Add `$fetch` to `AuthActionClient`, remove `signIn.anonymous`, and give it the
same contract used by the real Better Auth client:

```ts
$fetch(
  path: "/sign-in/shared-guest",
  options: {
    headers: { "x-captcha-response": string };
    method: "POST";
  },
): Promise<AuthActionResult>;
```

Then implement:

```ts
export async function signInGuestSession({
  client,
  refetch,
  turnstileToken,
}: SignInGuestSessionOptions): Promise<string | null> {
  if (!turnstileToken) return TURNSTILE_REQUIRED_MESSAGE;

  try {
    const result = await client.$fetch("/sign-in/shared-guest", {
      headers: { "x-captcha-response": turnstileToken },
      method: "POST",
    });
    if (result.error) return getAuthErrorMessage(result.error);
    await refetch();
    return null;
  } catch (caughtError) {
    return getAuthErrorMessage(caughtError);
  }
}
```

Keep the existing single-flight guest click guard and Turnstile token reset in `handleGuestSignIn`.

- [ ] **Step 5: Collapse sign-out and deletion to their ordinary paths**

Delete `deleteGuestAccount`, `deleteGuestAccountAction`, and all `isAnonymous` action parameters. Use:

```ts
export async function signOutSession({
  client,
}: SignOutSessionOptions): Promise<string | null> {
  try {
    const result = await client.signOut();
    return result.error ? SIGN_OUT_ERROR_MESSAGE : null;
  } catch {
    return SIGN_OUT_ERROR_MESSAGE;
  }
}
```

Keep `deleteAccountSession` on the one registered-account path:

```ts
const result = await client.deleteUser({ password });
if (result.error) return DELETE_ACCOUNT_ERROR_MESSAGE;
await refetch();
return null;
```

Pass only `{ client }` from `handleSignOut` and `{ client, password, refetch }` from `handleDeleteAccount`. Remove `AuthSession.user.isAnonymous`.

- [ ] **Step 6: Derive and expose shared identity state**

In `AuthGate.tsx`:

```ts
const isSharedGuest = session?.user.id === SHARED_GUEST_USER_ID;
```

Rename `AccountActionProvider`'s `isAnonymous` value and `useIsAnonymousAccount()` to `isSharedGuest` and `useIsSharedGuestAccount()`, then pass the derived value through the provider.

- [ ] **Step 7: Omit destructive UI and remove passwordless dialog complexity**

In `AccountPrivacyPage`, call `useIsSharedGuestAccount()` and render the entire danger-zone `Card` plus `AccountDeleteDialog` only when `!isSharedGuest`.

In `AccountDeleteDialog`, remove `requiresPassword`, always focus/render/require the password input, return early when the password is empty, and disable confirmation while it is empty. Remove the no-longer-used confirm-button ref.

- [ ] **Step 8: Re-run unit and lifecycle tests**

Run:

```bash
node --test tests/auth-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
```

Expected: PASS. Shared guest entry uses the new endpoint, sign-out uses only Better Auth, registered deletion still requires a password, and shared deletion controls are absent.

- [ ] **Step 9: Commit the client and privacy behavior**

```bash
git add src/auth/auth-client.ts src/auth/AuthGate.tsx src/auth/account-actions.tsx src/app/AccountPrivacyPage.tsx src/app/AccountDeleteDialog.tsx tests/auth-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs
git commit -m "feat: use shared guest sessions in account UI"
```

### Task 5: Browser flow, architecture notes, and complete verification

**Files:**
- Modify: `tests/e2e/header.spec.ts`
- Verify unchanged behavior: `tests/e2e/account-sign-out-feedback.spec.ts`
- Modify: `README.md`
- Modify: `docs/design/technical-architecture.md`

**Interfaces:**
- Verifies: Continue as guest calls the Turnstile-protected shared endpoint and resolves to the fixed non-anonymous identity.
- Verifies: shared Account & privacy keeps its information but has no destructive controls.
- Verifies: the existing immediate, contained sign-out feedback still runs against the ordinary `/api/auth/sign-out` endpoint.
- Documents: guest account data is intentionally shared, while active learner selection and auth sessions remain session-scoped.

- [ ] **Step 1: Update the accessible browser guest flow**

In `tests/e2e/header.spec.ts`, import `SHARED_GUEST_USER_ID`, update the mocked session user ID, remove `isAnonymous: true`, and route:

```ts
await page.route("**/api/auth/sign-in/shared-guest", async (route) => {
  guestRequests += 1;
  expect(route.request().method()).toBe("POST");
  expect(route.request().headers()["x-captcha-response"]).toBe(
    "parrot-e2e-turnstile-token",
  );
  isAuthenticated = true;
  await route.fulfill({
    contentType: "application/json",
    json: {
      token: authenticatedSession.session.token,
      user: authenticatedSession.user,
    },
    status: 200,
  });
});
```

After the existing learner-home assertion, navigate the same authenticated session to `guardianPath('/guardian/account')` and assert with accessible locators:

```ts
await expect(
  page.getByRole("heading", { level: 1, name: "Account & privacy" }),
).toBeVisible();
await expect(page.getByRole("heading", { name: "How Parrot uses AI" })).toBeVisible();
await expect(page.getByRole("heading", { name: "Technical build details" })).toBeVisible();
await expect(page.getByRole("region", { name: "Danger zone" })).toHaveCount(0);
await expect(
  page.getByRole("button", { exact: true, name: "Delete account" }),
).toHaveCount(0);
```

- [ ] **Step 2: Run focused browser coverage**

Run:

```bash
npx playwright test tests/e2e/header.spec.ts tests/e2e/account-sign-out-feedback.spec.ts
```

Expected: PASS for shared entry/privacy and the existing immediate normal sign-out feedback at all tested viewports.

- [ ] **Step 3: Update authentication and architecture documentation**

Replace README's temporary-anonymous-account description with the fixed shared behavior: Turnstile creates a separate normal session for one durable guest identity, all account/learner data is shared, sign-out revokes only the current session, and the shared identity cannot be deleted.

Add a concise paragraph to `docs/design/technical-architecture.md` next to the Better Auth/D1 description: the `shared-guest` plugin loads the seeded user, creates a normal session, and relies on existing user ownership; only session learner selection remains per session.

- [ ] **Step 4: Scan for retired flow references**

Run:

```bash
rg -n "anonymousClient|sign-in/anonymous|api/guest-account|delete-anonymous-user|deleteGuestAccount|useIsAnonymousAccount" src worker README.md docs/design
```

Expected: no deprecated implementation or documentation symbols. Negative
retirement assertions may remain in tests, while generic uses of “anonymous”
meaning unauthenticated requests and the `is_anonymous` compatibility database
column are allowed outside this retired-flow scan.

- [ ] **Step 5: Apply all D1 migrations in an isolated local state directory**

Run:

```bash
shared_guest_migration_state="$(mktemp -d)"
npx wrangler d1 migrations apply parrot-english --local --persist-to "$shared_guest_migration_state"
```

Expected: every migration through `0019_shared_guest_account.sql` applies successfully.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm test
npm run test:browser
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all unit/lifecycle tests, all responsive Playwright tests, lint, TypeScript, and production build pass; diff check is clean; only intentional branch changes remain.

- [ ] **Step 7: Commit browser coverage and docs**

```bash
git add tests/e2e/header.spec.ts README.md docs/design/technical-architecture.md
git commit -m "test: cover shared guest account flow"
```

- [ ] **Step 8: Review before handoff**

Use `superpowers:requesting-code-review`, address verified findings, re-run any affected focused tests, then use `superpowers:verification-before-completion` before reporting success. Do not merge the branch directly; leave it ready for a pull request.
