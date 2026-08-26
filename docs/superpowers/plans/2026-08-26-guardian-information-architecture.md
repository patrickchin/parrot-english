# Guardian information architecture implementation plan

> Execute each production change test-first. Keep the session-selected learner
> and the Guardian page target as separate invariants throughout.

**Goal:** Replace hidden global learner targeting with explicit per-page Guardian
management, simplify navigation, add a real Account & privacy page, and repair
the live/local E2E defects found during the route walk.

**Architecture:** Existing domain handlers already accept an explicit
`LearnerIdentity`. Add a Guardian-only owned-profile resolver selected by the
canonical `learnerProfileId` query parameter; no-param requests keep existing
learner-mode behavior. Frontend Guardian pages use a shared roster-backed
selector whose target is in the URL. Only the roster's Use in learner mode
button writes session selection.

**Stack:** React 19, React Router, Tailwind 4, Cloudflare Worker/D1/R2, Better
Auth, Node test runner, Vitest SSR test harness, Playwright.

---

## Task 1: Stabilize the existing full E2E suite

**Files:**

- Modify: `tests/e2e/multiple-learners.spec.ts`

1. Reproduce the full-suite failure where concurrent pages read
   `window.__parrotE2eLearners` before async E2E bootstrap completes.
2. Add accessible readiness waits for the `Learner profiles` heading on all
   three pages before reading controller state.
3. Run the focused test with high parallel repetition and confirm it is stable.
4. Run the full browser suite once to establish a green starting point.

## Task 2: Add Guardian-only targeted learner identity

**Files:**

- Modify: `worker/request-identity.ts`
- Modify: `worker/index.ts`
- Modify: `worker/guardian-access.ts`
- Test: `tests/learner-identity.test.mjs`
- Test: `tests/guardian-access-worker.test.mjs`
- Test: relevant Worker routing suites for profile, My Lessons, story art,
  dubbing, and lesson recordings

1. Write failing tests for owned target resolution, foreign target rejection,
   duplicate/empty/oversized target rejection, locked targeted GETs, and no
   `session_learner_selection` mutation.
2. Add a read-only `resolveOwnedLearnerIdentity` constrained by profile ID and
   signed-in account ID.
3. Parse exactly one non-empty bounded `learnerProfileId` query parameter.
4. In every learner-owned Worker branch, require Guardian access whenever the
   target parameter is present, then resolve the owned target; preserve current
   selection resolution when absent.
5. Return generic no-store 404 for invalid/unowned targets and 403
   `guardian_required` before ownership lookup when locked.
6. Run all touched Worker tests.

## Task 3: Add targeted client contracts and correct story-art assets

**Files:**

- Modify: `src/learner-profile/learner-profile-api.ts`
- Modify: `src/lessons/my-lessons-api.ts`
- Modify: `src/lessons/useMyLessons.ts`
- Modify: `src/dubbing/dub-api.ts`
- Modify: `src/stories/personalized-story-art-client.ts`
- Modify: `src/stories/usePersonalizedStoryArt.ts`
- Modify: `worker/personalized-story-art.ts`
- Test: corresponding client and Worker suites

1. Write failing exact-URL tests for targeted profile/preferences/recording,
   lesson, dub, and story-art requests.
2. Add an optional `learnerProfileId` request option and one canonical query
   appender per client module.
3. Ensure targeted story-art metadata emits and accepts asset URLs containing
   both the version and learner target, so an `<img>` cannot fall back to the
   active learner.
4. Reset/abort hook state when the page target changes.
5. Run all client API tests and targeted story-art routing tests.

## Task 4: Make learner management explicit and non-mutating

**Files:**

- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/learner-profile/GuardianLearnerProfiles.tsx`
- Add: `src/learner-profile/GuardianLearnerDetails.tsx`
- Modify: `src/learner-profile/ProfileEditor.tsx`
- Modify: `worker/learner-profiles.ts`
- Modify: `src/learner-profile/learner-profile-api.ts`
- Test: `tests/guardian-learner-profiles.test.mjs`
- Test: `tests/learner-profile-api.test.mjs`
- Test: `tests/learner-profile-worker.test.mjs`
- Test: route and lifecycle suites

1. Write failing component/E2E tests proving Edit Noah never calls selection,
   Mia remains the learner-mode profile after Back/refresh, and the explicit
   Noah route persists.
2. Add `/guardian/learners/:learnerId` and a route builder with safe ID
   validation. Redirect legacy `/guardian/profile` to Manage learners.
3. Rename the page to Manage learners and replace Current learner/Use this
   learner copy with Learner mode/Use in learner mode.
4. Navigate Edit profile directly to the ID route without calling
   `selectLearner`.
5. Add a non-activating learner creation request; navigate the new profile to
   its explicit details route and leave session selection unchanged.
6. Build a standalone targeted details container reusing the profile editor.
   Load/save core details, interest answers, and lesson-recording consent with
   the target ID. Do not offer a flow that silently changes learner mode.
7. Treat all `/guardian/learners/*` routes as roster management so they work
   even when no learner is selected.
8. Run the focused unit, Worker, route, lifecycle, and E2E tests.

## Task 5: Add the shared visible settings target selector

**Files:**

- Add: `src/learner-profile/GuardianLearnerTarget.tsx`
- Test: `tests/guardian-learner-target.test.mjs`
- Test: responsive Playwright suites

1. Write failing behavior tests for loading, retry, empty roster, valid query,
   missing query normalization, invalid target recovery, pressed state, and a
   separate Learner mode badge.
2. Build the compact roster selector using accessible buttons and the existing
   shared controls. Keep all learner names visible and announce
   `Editing settings for {name}`.
3. Preserve unrelated search parameters and use history replace only for
   default normalization.
4. Verify 280–390px containment and keyboard navigation.

## Task 6: Target all Guardian settings without changing learner mode

**Files:**

- Modify: `src/lessons/GuardianLessonManager.tsx`
- Modify: `src/lessons/LessonCreator.tsx`
- Modify: `src/lessons/LessonEditor.tsx`
- Modify: `src/stories/GuardianStorySettings.tsx`
- Modify: `src/dubbing/GuardianDubbingSettings.tsx`
- Modify: supporting route builders and hooks
- Test: component/API/lifecycle suites for each feature
- Test: `tests/e2e/multiple-learners.spec.ts`

1. Write failing E2E tests that show Mia and Noah on each page, target Noah,
   mutate/read Noah's data, and confirm Mia remains the learner-mode profile.
2. Mount the shared selector on My Lessons, Story settings, and Voice dubbing.
3. Load each page's state with the explicit target and abort stale operations
   on target changes.
4. Preserve the target through lesson create/edit links, requests, Back links,
   saves, refresh, and browser history.
5. Remove Switch and play / Switch to learner actions from targeted settings;
   direct users to Manage learners for the only learner-mode mutation.
6. Run focused settings tests and multi-learner E2E.

## Task 7: Simplify the menu and create Account & privacy

**Files:**

- Modify: `src/app/AppHeader.tsx`
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/auth/account-actions.tsx`
- Add: `src/app/AccountPrivacyPage.tsx`
- Refactor: `src/app/AboutDialog.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app-routes.ts`
- Test: auth UI, accessibility lifecycle, route, header, and build-info suites

1. Write failing tests for the exact four Guardian menu items and absence of
   learner details, mode switch, AI modal, and Delete account.
2. Add `/guardian/account` to declared, protected, return-safe routes.
3. Link the menu to the page, retain Sign out, and remove menu-local About and
   Delete dialog state.
4. Reuse the existing AI/data and technical-build content as normal page
   sections.
5. Add a separated Danger zone containing the sole Delete account entry, which
   opens the existing password confirmation.
6. Verify locked deep links return to the account page after unlock and every
   page has a working dashboard Back link.

## Task 8: Redesign the dashboard and remove hover movement

**Files:**

- Modify: `src/app/GuardianDashboard.tsx`
- Modify: `src/shared/ui.tsx`
- Test: `tests/product-streamline.test.mjs`
- Test: shared-control, header, focus, and responsive Playwright suites

1. Write failing markup/behavior tests for one Manage learners destination,
   linked Account & privacy, grouped content tools, and no duplicate Learner
   details card.
2. Build a featured learner card, three icon/accent content cards, and a
   separated account card using Tailwind utilities and shared controls.
3. Remove translate-based hover/active classes from all shared controls and
   interactive cards; retain non-motion feedback and focus indicators.
4. Add a Playwright bounding-box regression proving hover does not move a
   representative menu item, button, or interactive card.
5. Run the responsive browser suite required by `AGENTS.md`.

## Task 9: Update deterministic E2E mocks and complete route traversal

**Files:**

- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `tests/e2e/guardian-mode.spec.ts`
- Modify: `tests/e2e/multiple-learners.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `tests/e2e/surrounding-pages.spec.ts`
- Add or modify a full route/navigation smoke spec

1. Make mock targeted requests resolve the requested learner without mutating
   `activeProfileId`; mirror Guardian guarding and targeted story asset URLs.
2. Give the mock Guardian a name distinct from every learner.
3. Traverse every dashboard CTA and verify destination and Back navigation.
4. Cover direct account/details routes, unknown targets, refresh/history,
   wildcard, profile/progress, story detail, and custom lesson detail recovery.
5. Assert the reduced menu's exact contents and keyboard focus order.
6. Run focused specs, then `npm run test:browser`.

## Task 10: Verify, review, PR, deploy, and re-walk live

1. Run formatting/lint/type checks exposed by package scripts.
2. Run fresh `npm test`, `npm run test:browser`, and production build.
3. Inspect the diff for accidental active-selection writes, authorization gaps,
   stale copy, and unrelated changes.
4. Request independent code review and fix verified findings test-first.
5. Commit on `codex/guardian-information-architecture`, push, open a PR, wait
   for required checks, merge only when green, and confirm deployment commit.
6. Re-run the signed-out live route matrix and all safe auth-error checks.
7. Re-run the authenticated live dashboard/menu/learners/settings/account walk
   if the user has completed the exposed browser sign-in. Never confirm a live
   destructive action.
8. Report the exact live URL, PR/merge, verification totals, any blocked
   authenticated-live coverage, and residual risks.
