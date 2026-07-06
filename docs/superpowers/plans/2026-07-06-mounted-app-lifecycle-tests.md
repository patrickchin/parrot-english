# Mounted App Lifecycle Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast mounted React StrictMode integration coverage for every major stateful app boundary, including the onboarding loading race, and run it for pull requests.

**Architecture:** Keep `node:test` and Vite's existing SSR module loader, but mount real React roots into a `happy-dom` document. A small lifecycle helper owns DOM globals, StrictMode rendering, user events, deferred values, fetch routing, and cleanup; tests exercise real top-level containers while mocking only browser/server edges.

**Tech Stack:** Node 22 test runner, React 19 `createRoot`/`act`, Vite SSR loading, happy-dom 20, GitHub Actions

---

### Task 1: Define the mounted lifecycle suite

**Files:**
- Create: `tests/lifecycle/app-lifecycle.test.mjs`
- Create: `tests/helpers/react-lifecycle.mjs`

- [ ] **Step 1: Write the failing onboarding race test**

Mount the exported `OnboardingGate` inside `StrictMode`, route `GET /api/onboarding` to a deferred successful response, assert `Loading your questions…`, resolve the response, and assert that loading disappears while `Meet Peppa` appears.

- [ ] **Step 2: Run the onboarding race test to verify RED**

Run: `node --test --test-name-pattern='keeps loading visible' tests/lifecycle/app-lifecycle.test.mjs`

Expected: FAIL because `tests/helpers/react-lifecycle.mjs` does not exist yet.

- [ ] **Step 3: Write the remaining boundary tests before the harness**

Add mounted tests for:

- `createAuthGate`: pending/error/retry, anonymous sign-in, authenticated child rendering, and sign-out.
- `OnboardingGate`: retry, current-session bypass, final-answer acknowledgment, and completion.
- `AuthGate` plus `OnboardingGate`: profile action registration, profile load, edit, atomic save, and return to the lesson child; sign-out remains in the mounted auth lifecycle.
- `LessonExperience`: catalog to lesson navigation and Back to lessons.
- `LessonPlayer`: Play/Pause, Next/Previous scene, mute toggle, stale audio cancellation, and the learner turn from recording through checking and feedback.

- [ ] **Step 4: Run every named boundary test to verify RED**

Run each top-level test with `--test-name-pattern` and confirm it fails because the lifecycle helper API is absent, not because of malformed test data.

- [ ] **Step 5: Implement the minimal reusable lifecycle helper**

Export a deferred value and mount real React roots after the DOM exists:

```js
export function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export async function mountStrict(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.add(root);
  await act(async () => {
    root.render(createElement(StrictMode, null, element));
  });
  return container;
}
```

`mountStrict` must use `createRoot(container).render(<StrictMode>{element}</StrictMode>)`, register cleanup, and never add test-only APIs to production components.

- [ ] **Step 6: Run the lifecycle file to verify GREEN**

Run: `node --test tests/lifecycle/app-lifecycle.test.mjs`

Expected: all mounted boundary tests pass without React act warnings.

### Task 2: Make lifecycle tests first-class npm checks

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/lifecycle/test-registration.test.mjs`

- [ ] **Step 1: Add a failing script contract assertion**

Assert that `package.json` exposes `test:lifecycle` and that `npm test` includes `tests/lifecycle/*.test.mjs`.

- [ ] **Step 2: Verify the script contract is RED**

Run: `node --test tests/lifecycle/test-registration.test.mjs`

Expected: FAIL because the scripts are not registered.

- [ ] **Step 3: Add the minimal scripts**

Set:

```json
"test": "node --test tests/*.test.mjs tests/lifecycle/*.test.mjs",
"test:lifecycle": "node --test tests/lifecycle/*.test.mjs"
```

Keep `happy-dom` as the only new dev dependency.

- [ ] **Step 4: Verify the focused command is GREEN**

Run: `npm run test:lifecycle`

Expected: all mounted lifecycle tests pass.

### Task 3: Add pull-request verification

**Files:**
- Create: `.github/workflows/verify-pr.yml`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Test: `tests/ci-workflows.test.mjs`

- [ ] **Step 1: Write failing workflow contract tests**

Require a pull-request workflow with one `verify` job that checks out full history, uses Node 22 with npm cache, runs `npm ci`, `npm test` (which includes the lifecycle glob), `npm run lint`, and `npm run build`. Require the main-only deployment workflow to omit repeated test/lint checks while retaining the build that produces its deployable `dist`, and require that the PR workflow does not run `test:lifecycle` immediately before the inclusive full suite.

- [ ] **Step 2: Verify workflow contracts are RED**

Run: `node --test tests/ci-workflows.test.mjs`

Expected: FAIL because `.github/workflows/verify-pr.yml` does not exist.

- [ ] **Step 3: Implement the workflows**

Create `verify-pr.yml` for `pull_request` and `workflow_dispatch`, with read-only contents permission and concurrency cancellation. Remove test/lint steps from `deploy-cloudflare.yml`; retain dependency installation and build because Wrangler deployment needs dependencies and the generated `dist` directory.

- [ ] **Step 4: Verify workflow contracts are GREEN**

Run: `node --test tests/ci-workflows.test.mjs`

Expected: all workflow contract tests pass.

### Task 4: Verify and publish

**Files:**
- Review every changed file reported by `git status --short`

- [ ] **Step 1: Run focused lifecycle verification**

Run: `npm run test:lifecycle`

- [ ] **Step 2: Run full repository verification**

Run:

```bash
npm test
npm run lint
npm run build
```

- [ ] **Step 3: Review scope and diff**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff
```

Confirm only the lifecycle helper/tests, npm metadata, workflow files, and this plan are included.

- [ ] **Step 4: Commit intended files**

Stage explicit paths and commit with:

```bash
git commit -m "test: add mounted app lifecycle coverage"
```

- [ ] **Step 5: Push and open a draft pull request**

Push `codex/mounted-app-lifecycle-tests` to `origin` and open a draft PR against `main` whose body summarizes boundary coverage, the onboarding regression, CI behavior, and all verification commands.
