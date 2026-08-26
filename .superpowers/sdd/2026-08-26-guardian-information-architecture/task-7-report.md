# Task 7 report: Guardian Account & privacy

Status: DONE_WITH_CONCERNS

Base: `4574c84227d83863afd20e2655a8e3b7dd6d2e66`

## Delivered

- Reduced the Guardian account menu to the exact rendered order `Dashboard`,
  `Manage learners`, `Account & privacy`, and `Sign out`.
- Removed learner-details, learner-switch, AI/data-dialog, and account-deletion
  actions from the dropdown while preserving its existing keyboard menu
  behavior and active-profile context.
- Added canonical `/guardian/account` routing and included it in declared,
  Guardian-protected, safe-return, and unlock-resume routing.
- Added a responsive Account & privacy page using the existing `RouteHeader`,
  `HeaderLink`, shared cards, and shared buttons. Its header always exposes a
  working `Back to Guardian dashboard` link, including while technical build
  information is loading or unavailable.
- Refactored the former AI/data dialog content into ordinary page sections,
  retaining the optional technical build details and existing error copy.
- Added the page's visually separated `Danger zone` as the sole Delete account
  entry. It opens the existing password-confirmation dialog and calls the
  existing Better Auth deletion/refetch behavior through a small context
  action seam owned by `AuthGate`.
- Kept the account page available for zero-learner accounts without weakening
  `GuardianModeBoundary` protection.

## Changed files

Production:

- `src/app/AboutDialog.tsx`
- `src/app/AccountPrivacyPage.tsx`
- `src/app/App.tsx`
- `src/app/AppHeader.tsx`
- `src/app/app-routes.ts`
- `src/auth/AuthGate.tsx`
- `src/auth/account-actions.tsx`

Rendered-behavior and wiring tests:

- `tests/app-routes.test.mjs`
- `tests/build-info-wiring.test.mjs`
- `tests/e2e/account-sign-out-feedback.spec.ts`
- `tests/e2e/guardian-mode.spec.ts`
- `tests/e2e/header.spec.ts`
- `tests/e2e/shared-control-contrast.spec.ts`
- `tests/e2e/shared-focus-visibility.spec.ts`
- `tests/e2e/surrounding-pages.spec.ts`
- `tests/lifecycle/accessibility-lifecycle.test.mjs`
- `tests/lifecycle/app-lifecycle.test.mjs`

Report:

- `.superpowers/sdd/2026-08-26-guardian-information-architecture/task-7-report.md`

## RED evidence

Tests were added or updated before production implementation.

1. `node --test tests/app-routes.test.mjs`
   - Exit 1: 37 passed, 3 failed.
   - The failures showed that the account path helper was absent and
     `/guardian/account` was rejected as both a safe return and an unlock
     destination.
2. `node --test --test-name-pattern='guardian mode exposes|keeps account privacy content' tests/lifecycle/accessibility-lifecycle.test.mjs`
   - Exit 1: 0 passed, 2 failed.
   - The rendered menu still exposed seven legacy actions and the Account &
     privacy page did not exist.
3. `npx playwright test tests/e2e/header.spec.ts -g 'Guardian menu opens'`
   - Exit 1: 1 failed.
   - The rendered Guardian dropdown still contained the legacy seven-item
     information architecture.

The first complete browser run after the production change produced 395 passed
and 51 failed. Eleven failures were existing browser tests that directly
specified the menu/account behavior changed by Task 7. Those assertions were
migrated; no Task 9-owned learner/profile route assertions were changed.

## GREEN and verification evidence

- `node --test tests/app-routes.test.mjs`
  - 40 passed, 0 failed.
- Focused accessibility lifecycle account/menu tests
  - 2 passed, 0 failed.
- Full `tests/lifecycle/accessibility-lifecycle.test.mjs`
  - 29 passed, 0 failed.
- Focused locked `/guardian/account` Playwright case
  - 1 passed, 0 failed.
- Focused Task 7 header/account Playwright case
  - 1 passed, 0 failed.
- Cross-suite Task 7 browser regression command covering menu ordering,
  sign-out, account navigation, disclosure content, Danger zone deletion,
  responsive contrast, and focus behavior
  - 16 passed, 0 failed.
- `npm test`
  - Exit 0: 1,320 passed, 0 failed across 115 suites.
- `npm run test:browser`
  - Completed: 406 passed, 40 failed.
  - All Task 7-owned cases passed. The remaining failures are exactly the 40
    known stale `/guardian/profile` and legacy learner-navigation assertions
    reserved for Task 9.
- `npm run lint`
  - Exit 0: 0 errors and the two pre-existing unused-disable warnings in
    generated `worker-configuration.d.ts`.
- `npm run build`
  - Exit 0: TypeScript and Vite production build succeeded; Vite emitted the
    existing large-chunk advisory.
- `git diff --check`
  - Clean.

## Self-review

- Confirmed the menu exposes exactly four `menuitem` roles in the binding
  order and no hidden/direct learner detail, learner switch, AI/data, or Delete
  account item.
- Confirmed `AuthGate` still owns `AccountHeader`; routes continue to compose
  `RouteHeader` with the shared `HeaderLink` and no header styling was copied.
- Confirmed account routing is declared, safe-returnable, Guardian-protected,
  and resumable after a direct locked deep link, including query/hash
  preservation in the generic unlock helper.
- Confirmed the Account & privacy page does not depend on an active learner and
  keeps its dashboard Back link mounted through normal, build-loading,
  build-error, and zero-learner states.
- Confirmed the only rendered Delete account opener is inside the labelled
  Danger zone, its dialog restores focus to that opener, and successful
  deletion uses the existing password payload plus session refetch.
- Confirmed AI/data wording and technical deployment/model information remain
  rendered content rather than a new data or abstraction layer.
- Confirmed tests use rendered roles, names, focus, navigation, and viewport
  behavior rather than CSS/source-class assertions.
- Confirmed no dependencies, global CSS, speculative abstractions, or unrelated
  product behavior were added.
- Confirmed the two untracked user-owned design/plan documents were not edited
  or selected for staging.

## Concerns

- The complete browser command remains red only because of the exact 40 known
  legacy learner/profile navigation assertions explicitly assigned to Task 9;
  Task 7's focused and cross-suite browser coverage is green.
- Lint retains two pre-existing generated declaration warnings, and the build
  retains the existing Vite chunk-size advisory.
