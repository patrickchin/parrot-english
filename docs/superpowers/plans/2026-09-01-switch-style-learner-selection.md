# Switch-style Learner Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users enter learner mode, choose a missing learner, and switch learner profiles without Guardian authorization.

**Architecture:** Preserve the existing session and ownership model. Normalize only post-login Guardian destinations, relax only the roster-read and active-selection Guardian classifier, and reuse one learner-picker implementation in a required page and the existing intentional dialog. Carry the learner-menu opener through the existing account-action bridge.

**Tech Stack:** React 19, React Router, TypeScript, Cloudflare Worker/D1, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-switch-style-learner-selection.md`

## Global Constraints

- Merge changes into `main` only through a pull request; never merge feature branches directly.
- Use Tailwind 4 utilities directly in React components and shared controls from `src/shared/ui.tsx`.
- Give every route one `h1`.
- Test rendered behavior with Playwright and accessible locators; never assert CSS source or class names.
- Preserve learner targets, progress, safety, consent, privacy, warnings, errors, and live statuses.

---

### Task 1: Learner-first post-login routing

**Files:**
- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Test: `tests/app-routes.test.mjs`
- Test: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `getPostLoginDestination(search: string): string`, which returns `/` for missing, unsafe, or Guardian destinations and otherwise preserves the validated learner path, query, and hash.

- [ ] **Step 1: Write the failing route and lifecycle tests**

```js
assert.equal(routes.getPostLoginDestination("?returnTo=%2Fguardian"), "/");
assert.equal(
  routes.getPostLoginDestination("?returnTo=%2Flessons%2Fparrot%2Fhello%2Fscenes%2F2%3Fx%3D1%23y"),
  "/lessons/parrot/hello/scenes/2?x=1#y",
);
```

- [ ] **Step 2: Run the tests and verify the old Guardian-resume behavior fails**

Run: `node --test tests/app-routes.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

- [ ] **Step 3: Add the post-login-only normalizer and use it for the `/login` redirect**

```ts
export function getPostLoginDestination(search: string) {
  const safe = getSafeReturnTo(search);
  if (!safe) return "/";
  const destination = new URL(safe, RETURN_TO_ORIGIN);
  return isGuardianRoute(destination.pathname, destination.search) ? "/" : safe;
}
```

- [ ] **Step 4: Re-run the focused route and lifecycle tests**

Run: `node --test tests/app-routes.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

### Task 2: Authenticated profile listing and selection

**Files:**
- Modify: `worker/guardian-access.ts`
- Test: `tests/guardian-access-worker.test.mjs`
- Test: `tests/learner-profiles-worker.test.mjs`
- Test: `tests/learner-deletion.test.mjs`

**Interfaces:**
- Consumes: existing Worker authentication and same-account ownership checks.
- Produces: authenticated learner-safe `GET /api/learner-profiles` and `PUT /api/learner-profiles/:id/active`; Guardian-only `POST` and `DELETE` remain unchanged.

- [ ] **Step 1: Move roster GET and active PUT into the learner-safe authorization fixtures**

```js
["GET", "/api/learner-profiles"],
["PUT", "/api/learner-profiles/learner-a/active"],
```

- [ ] **Step 2: Remove test unlock setup from the real roster-read, same-account selection, and foreign-selection cases**

- [ ] **Step 3: Run the focused tests and verify they fail with `guardian_required`**

Run: `node --test tests/guardian-access-worker.test.mjs tests/learner-profiles-worker.test.mjs tests/learner-deletion.test.mjs`

- [ ] **Step 4: Narrow the central classifier**

```ts
if (pathname === "/api/learner-profiles") return method === "POST";
if (/^\/api\/learner-profiles\/[^/]+$/.test(pathname)) return method === "DELETE";
```

- [ ] **Step 5: Re-run the focused Worker tests**

Run: `node --test tests/guardian-access-worker.test.mjs tests/learner-profiles-worker.test.mjs tests/learner-deletion.test.mjs`

### Task 3: Required learner picker and learner-to-learner switching

**Files:**
- Modify: `src/app/LearnerModeSwitchDialog.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `src/app/App.tsx`
- Test: `tests/learner-mode-switch.test.mjs`
- Test: `tests/learner-profile-ui.test.mjs`
- Test: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: a required full-page learner picker with one `h1` and no dismissal action.
- Produces: learner-mode selection that skips `lockGuardianAccess`; Guardian-mode selection still locks before navigation.

- [ ] **Step 1: Write failing component tests for required selection and learner-mode switching**

```js
assert.match(html, /Who is learning now\?/);
assert.doesNotMatch(html, /Ask a grown-up|Cancel/);
assert.deepEqual(operations, ["select:learner-noah", "before-navigate"]);
```

- [ ] **Step 2: Run the focused component tests and observe the dead-end and unconditional lock failures**

Run: `node --test tests/learner-mode-switch.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

- [ ] **Step 3: Share roster/selection state between dialog and page presentations**

The page presentation renders a route `h1`, exposes the same accessible learner buttons and retry states, and omits backdrop, Escape, and Cancel dismissal. The dialog presentation retains focus trapping for an intentional menu action.

- [ ] **Step 4: Replace the `selection-required` learner branch with the page fallback supplied inside `LearnerSelectionProvider`**

Use the current protected target as the selection destination so learner deep links resume after choosing.

- [ ] **Step 5: Lock only when the current access mode is Guardian**

```ts
if (mode === "guardian") {
  const lockError = await lock();
  if (lockError) return setError(lockError);
}
```

- [ ] **Step 6: Re-run the focused component tests**

Run: `node --test tests/learner-mode-switch.test.mjs tests/learner-profile-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

### Task 4: Anytime Switch learner menu action

**Files:**
- Modify: `src/auth/account-actions.tsx`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/app/AppHeader.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Test: `tests/auth-ui.test.mjs`
- Test: `tests/lifecycle/accessibility-lifecycle.test.mjs`
- Test: `tests/lifecycle/app-lifecycle.test.mjs`

**Interfaces:**
- Produces: `AccountExperience.onOpenLearnerSwitcher: (() => void) | null`.
- Produces: learner-menu order `Switch learner`, `Grown-up access`.

- [ ] **Step 1: Write failing header tests that activate Switch learner and assert menu order**

```js
assert.deepEqual(menuItems, ["Switch learner", "Grown-up accessSwitch modes"]);
assert.deepEqual(activations, ["switch-learner"]);
```

- [ ] **Step 2: Run the focused header/lifecycle tests and verify the action is missing**

Run: `node --test tests/auth-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

- [ ] **Step 3: Thread the stable opener through the existing account-action bridge**

The gate owns `isLearnerSwitcherOpen`, opens the shared dialog from the header action, closes it on cancellation or successful selection, exits active lesson work before navigation, and navigates to learner home after selection.

- [ ] **Step 4: Render Switch learner before Grown-up access and preserve keyboard/focus behavior**

- [ ] **Step 5: Re-run the focused header/lifecycle tests**

Run: `node --test tests/auth-ui.test.mjs tests/lifecycle/accessibility-lifecycle.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

### Task 5: Browser flows, documentation, and full verification

**Files:**
- Modify: `tests/e2e/multiple-learners.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify as needed: exact learner-menu assertions in `tests/e2e/guardian-mode.spec.ts`, `tests/e2e/learner-profile-viewport-stability.spec.ts`
- Modify: `README.md`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`

**Interfaces:**
- Verifies: selection-required accounts see learner choices immediately; learner header switching changes the active profile; login does not resume Guardian mode.

- [ ] **Step 1: Replace the old dead-end Playwright assertion with direct accessible learner selection**

```ts
await expect(page.getByRole("heading", { name: "Who is learning now?" })).toBeVisible();
await page.getByRole("button", { name: "Start learner mode as Mia" }).click();
await expect(page.getByRole("button", { name: /Profile for Mia, learner mode/ })).toBeVisible();
```

- [ ] **Step 2: Add a header flow that opens Switch learner and chooses a sibling**

- [ ] **Step 3: Run the focused Playwright files**

Run: `npx playwright test tests/e2e/multiple-learners.spec.ts tests/e2e/header.spec.ts tests/e2e/guardian-mode.spec.ts tests/e2e/learner-profile-viewport-stability.spec.ts`

- [ ] **Step 4: Update product/architecture text that says roster reads and active selection require Guardian mode**

- [ ] **Step 5: Run complete verification**

Run: `npm test`

Run: `npm run test:browser`

Run: `npm run build`

Run: `npm run lint`
