# PR Preview Authentication Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow sign-in requests from this project's Cloudflare Worker preview URLs without broadening trust beyond the production origin and Parrot English preview hostnames.

**Architecture:** Keep `BETTER_AUTH_URL` as Better Auth's canonical production base URL and add one static, scheme-qualified wildcard to `trustedOrigins`. Exercise Better Auth's resolved `isTrustedOrigin` matcher in the Worker unit tests so accepted and rejected hostnames are verified using the same matching code that guards sign-in requests.

**Tech Stack:** TypeScript, Better Auth 1.6, Cloudflare Workers, Node.js test runner

---

### Task 1: Add the preview-origin regression and fix

**Files:**
- Modify: `tests/worker-auth.test.mjs`
- Modify: `worker/auth.ts`

- [ ] **Step 1: Write the failing accepted-origin test**

Add this test after the existing Better Auth base URL test in `tests/worker-auth.test.mjs`:

```js
it("trusts production and Parrot Worker preview origins", async () => {
  const productionOrigin = "https://parrot-english.p-ch.workers.dev";
  const auth = createAuth({
    DB: {},
    BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
    BETTER_AUTH_URL: productionOrigin,
  });
  const context = await auth.$context;

  assert.equal(auth.options.baseURL, productionOrigin);
  assert.equal(context.isTrustedOrigin(productionOrigin), true);
  assert.equal(
    context.isTrustedOrigin(
      "https://codex-app-home-routing-parrot-english.p-ch.workers.dev"
    ),
    true
  );
  assert.equal(
    context.isTrustedOrigin(
      "https://e8bf6255-parrot-english.p-ch.workers.dev"
    ),
    true
  );
});
```

- [ ] **Step 2: Run the accepted-origin test to verify it fails**

Run:

```bash
node --test --test-name-pattern="trusts production and Parrot Worker preview origins" tests/worker-auth.test.mjs
```

Expected: FAIL because the branch preview origin is not currently trusted.

- [ ] **Step 3: Write the rejected-origin security test**

Add this adjacent test in `tests/worker-auth.test.mjs`:

```js
it("rejects origins outside Parrot Worker HTTPS previews", async () => {
  const auth = createAuth({
    DB: {},
    BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
    BETTER_AUTH_URL: "https://parrot-english.p-ch.workers.dev",
  });
  const context = await auth.$context;
  const rejectedOrigins = [
    "https://unrelated.workers.dev",
    "https://branch-parrot-english.other-account.workers.dev",
    "http://branch-parrot-english.p-ch.workers.dev",
    "not a valid origin",
    "https://branch-parrot-english.p-ch.workers.dev.evil.example",
  ];

  for (const origin of rejectedOrigins) {
    assert.equal(
      context.isTrustedOrigin(origin),
      false,
      `Expected ${origin} to remain untrusted`
    );
  }
});
```

- [ ] **Step 4: Add the minimal Better Auth configuration**

In `worker/auth.ts`, define the pattern beside the imports and pass it to Better Auth:

```ts
const PR_PREVIEW_ORIGIN_PATTERN =
  "https://*-parrot-english.p-ch.workers.dev";
```

```ts
return betterAuth({
  appName: "Parrot English",
  baseURL,
  trustedOrigins: [PR_PREVIEW_ORIGIN_PATTERN],
  secret,
```

- [ ] **Step 5: Run the focused Worker authentication tests**

Run:

```bash
node --test tests/worker-auth.test.mjs
```

Expected: all Worker authentication tests PASS, including accepted and rejected origin cases.

- [ ] **Step 6: Commit the regression and fix**

```bash
git add tests/worker-auth.test.mjs worker/auth.ts
git commit -m "fix: trust Parrot Worker preview origins"
```

### Task 2: Verify and deploy the fix to the existing PR

**Files:**
- Verify: `worker/auth.ts`
- Verify: `tests/worker-auth.test.mjs`

- [ ] **Step 1: Run the full automated test suite**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Run static verification**

Run:

```bash
npm run lint
npm run build
git diff --check origin/codex/app-home-routing...HEAD
```

Expected: lint reports no errors, the TypeScript/Vite build succeeds, and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Push the existing PR branch**

Run:

```bash
git push origin codex/app-home-routing
```

Expected: the new commits are pushed to PR #24 and Cloudflare starts a new preview deployment.

- [ ] **Step 4: Confirm the deployed preview no longer rejects its own origin**

After the Cloudflare deployment succeeds, run:

```bash
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  -H 'origin: https://codex-app-home-routing-parrot-english.p-ch.workers.dev' \
  --data '{"email":"origin-check@example.invalid","password":"invalid-password"}' \
  'https://codex-app-home-routing-parrot-english.p-ch.workers.dev/api/auth/sign-in/email'
```

Expected: `401 INVALID_EMAIL_OR_PASSWORD`, proving the request passed origin validation; it must not return `403 INVALID_ORIGIN`.

- [ ] **Step 5: Verify sign-in through the preview UI**

Open `https://codex-app-home-routing-parrot-english.p-ch.workers.dev/login`, sign in with an existing test account, and confirm the app navigates to the authenticated home menu.

Expected: sign-in succeeds and the four-card home menu appears.
