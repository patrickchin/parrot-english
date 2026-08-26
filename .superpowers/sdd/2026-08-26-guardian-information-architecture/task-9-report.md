# Task 9 report: deterministic E2E mocks and route traversal

Date: 2026-08-27
Base: `974033f23f2035a8d1fc1169c8b2303f18f141e6`

## Outcome

Task 9 is complete. The deterministic browser mock now mirrors production's
explicit learner-target authorization and ownership contract, the Guardian
identity is distinct from every learner, all legacy Guardian information-
architecture expectations have been migrated, and the redesigned routes have
rendered navigation and recovery coverage.

The core selection invariant is preserved:

- `activeProfileId` changes only in the explicit
  `PUT /api/learner-profiles/:id/active` mock endpoint.
- Guardian settings and detail pages use visible URL target state and do not
  select that learner for learner mode.
- Targeted profile, preferences, recording consent, lessons, dubbing, and story
  art requests mutate only the resolved target.

No production route was changed. One non-routing production focus defect was
proved by a repeatable browser reproduction and fixed in
`GuardianLearnerProfiles.tsx`.

## Failure inventory and root causes

| Phase | Observed result | Root cause | Resolution |
| --- | ---: | --- | --- |
| Baseline audit of the five migrated legacy specs | 117 passed, 40 failed | Assertions still opened retired `/guardian/profile`, expected its duplicate learner editor and CTA, expected the old seven-item menu, used old roster labels, and confused account-holder Mia with learner Mia. One viewport spec was outside the brief's initial file list. | Migrated every stale route/menu/CTA assertion, including `learner-profile-viewport-stability.spec.ts`; retained one explicit legacy replace-redirect recovery test. |
| First focused route/mock RED | 10 failed | The browser mock used active learner lookup for explicit targets, accepted malformed target queries, guarded only a subset of mutations, and did not support the empty-roster journey. | Added one explicit-target parser/resolver, authorization-first handling, target-scoped route-family state, and a zero-learner scenario. |
| Intermediate migrated audit | 144 passed, 22 failed; then 2 failed | Remaining assertions mixed old labels with new route context, and some direct API checks ran before the async mock bootstrap had rendered a readiness landmark. | Completed assertion migration and retained accessible roster/route heading waits before direct browser-side API calls. The audited group then passed 166/166. |
| First full browser run | 452 passed, 4 failed | Two targeted API rows received the SPA HTML shell because `page.goto` can finish before the async mock import and React bootstrap. One unrelated recording-consent timing assertion and one learner-selection focus assertion also failed under full load. | Added accessible readiness waits to the direct API rows. The consent case did not recur and required no change. |
| Second full browser run | 455 passed, 1 failed | Successful explicit learner selection used `requestAnimationFrame` for its heading-focus handoff. A concurrently backgrounded Playwright page can skip that callback, leaving `document.body` focused. | Moved the success focus handoff into a state-commit-aligned `useLayoutEffect`; routing and selection semantics are unchanged. |
| Focus stress reproduction | 24 passed, 6 failed with the old callback | The active element on every failure was `BODY`, confirming a missed callback rather than a locator or timing assertion problem. Synchronous focus and a microtask both ran before React committed and failed 30/30 during diagnosis. | The layout-effect implementation passed 30/30 with seven workers and the following full browser run passed 456/456. |
| Deferred Task 3 hook audit | Existing tests covered stale metadata, selected file, busy state, and status, but not stale error or feature state. | A late rejected old-target generation could regress without the existing assertions detecting an error/feature leak after switching target. | Added a held old-target operation -> next-target regression with the next target's error authoritative. A temporary mutation removing the stale-operation error guard failed 0/1 on the exact old error; restored code passed 1/1 and the complete hook file passed 7/7. |

## Implementation details

### Production-faithful browser mock

- The signed-in account is consistently `Alex Guardian`
  (`alex@example.test`); learners remain Mia and Noah.
- Explicit target presence is detected with `URLSearchParams.has`, while all
  values are inspected with `getAll`.
- A target is valid only when there is exactly one nonblank, bounded,
  owned learner ID. Blank, duplicate, unknown, foreign, malformed, and
  overlong targets share the generic `404 { "error": "not_found" }`
  no-store response.
- Guardian authorization runs before target parsing and ownership for every
  explicitly targetable request, including GET and every HTTP method.
- Unscoped learner behavior remains active-learner compatible.
- Profile aliases and targetable route families share the resolver only where
  necessary to prevent drift.
- Targeted profile/preferences/recording-consent/lesson create and edit/dub
  consent and delete/story-art metadata, asset, generation, and deletion all
  stay on the URL target.
- Story-art metadata preserves the strict full asset source order:
  `...?v=1786276800000&learnerProfileId=learner-noah`.
- Learner creation does not activate the created profile. The explicit active
  endpoint is the only assignment to mock `state.activeProfileId`.

### Rendered route and interaction coverage

- Every redesigned Guardian dashboard card proves its heading, description,
  and action association; every action traverses to its rendered destination
  and returns through that page's Back action.
- Direct learner details cover valid Noah, refresh, Back, unknown target, and
  encoded blank target recovery while Mia stays active.
- Guardian settings cover missing/default normalization and blank, duplicate,
  and unknown explicit target recovery, plus refresh and history behavior.
- Learner recovery covers `/progress`, the `/profile` gate and cancel action,
  invalid story and story-page details, unknown custom lessons, and wildcard
  replacement. Guardian wildcard recovery is also rendered.
- Direct locked `/guardian/account` is proven through password unlock, while a
  true zero-learner `/guardian/account` journey passes the real account and
  learner-manager gates and returns to Manage learners.
- The exact Guardian menu is `Guardian dashboard`, `Manage learners`,
  `Account & privacy`, `Sign out`. Native Tab reaches all four, focus leaving
  closes the menu and reaches the next page control, reverse Tab returns to the
  persistent profile trigger after the closed menu unmounts, and Escape
  restores the trigger.
- A 280px rendered traversal Tabs through every visible learner target button,
  checks each full accessible name and `aria-pressed`, reverses with Shift+Tab,
  and activates the target without focus loss or horizontal overflow.
- New route traversal does not confirm a destructive action.

### Focus defect fix

Successful selection now arms a one-shot ref before committing the returned
roster/status. A `useLayoutEffect` keyed to that committed selection state
focuses the active learner heading and clears the ref. This removes reliance on
animation-frame delivery while keeping the existing error-path focus restore,
operation fencing, and sole-selection-write behavior intact.

## Changed files

Production behavior:

- `src/learner-profile/GuardianLearnerProfiles.tsx` — reliable post-selection
  heading focus after the committed roster update.

Deterministic mock and fixture identity:

- `src/testing/e2e-browser-mocks.ts` — centralized production-equivalent
  explicit target resolution, route-family targeting, exact story asset URLs,
  and zero-learner state.
- `vite.config.ts` — distinct Alex Guardian auth fixture.

New or materially expanded coverage:

- `tests/e2e/guardian-route-traversal.spec.ts` — dashboard, direct route,
  recovery, history, account gate, zero-roster, and exact menu traversal.
- `tests/e2e/multiple-learners.spec.ts` — redesigned roster/details journeys,
  active-selection invariant, authorization/not-found matrices, target-scoped
  aliases and mutations, and exact personalized-art source.
- `tests/e2e/guardian-learner-target.spec.ts` — real 280px Tab traversal across
  all visible learner targets.
- `tests/personalized-story-art-hook.test.mjs` — stale target error/feature
  reset regression.

Legacy expectation migration and Guardian identity updates:

- `tests/e2e/guardian-mode.spec.ts`
- `tests/e2e/header.spec.ts`
- `tests/e2e/surrounding-pages.spec.ts`
- `tests/e2e/learner-profile-viewport-stability.spec.ts`
- `tests/e2e/account-sign-out-feedback.spec.ts`
- `tests/e2e/dubbing.spec.ts`
- `tests/e2e/shared-control-contrast.spec.ts`
- `tests/e2e/shared-focus-visibility.spec.ts`

Documentation:

- `.superpowers/sdd/2026-08-26-guardian-information-architecture/task-9-report.md`

## RED and GREEN evidence

| Evidence | Result |
| --- | --- |
| `npm run test:browser -- tests/e2e/guardian-mode.spec.ts tests/e2e/multiple-learners.spec.ts tests/e2e/header.spec.ts tests/e2e/surrounding-pages.spec.ts tests/e2e/learner-profile-viewport-stability.spec.ts` before migration | RED: 117 passed, 40 failed (1.9m). |
| Focused migrated route/mock group | RED: 10 initial failures; intermediate 144 passed/22 failed and 2 remaining; GREEN: 166/166. |
| Selection focus stress, old `requestAnimationFrame`, `--repeat-each=30 --workers=7` | RED: 24 passed, 6 failed. |
| Same selection focus stress after `useLayoutEffect` | GREEN: 30/30. |
| Stale-art regression with a temporary mutation removing the current-operation error fence | RED: 0/1; actual stale error was `old learner generation failed`, expected none. The temporary mutation was restored and is absent from the diff. |
| `node --test --test-name-pattern='target switch fences' tests/personalized-story-art-hook.test.mjs` after restore | GREEN: 1/1. |
| `node --test tests/personalized-story-art-hook.test.mjs` | GREEN: 7/7. |
| `npm test` | GREEN: 1,323/1,323 tests, 115 suites, 0 failed (5.157s). |
| `npm run test:browser` | GREEN: 456/456 tests, 0 failed (2.3m). |
| `npm run lint` | GREEN: exit 0, 0 errors. Two existing generated `worker-configuration.d.ts` unused-disable warnings remain. |
| `npm run build` | GREEN: TypeScript and Vite build succeeded; 1,914 modules transformed. The existing chunk-size advisory remains. |
| `git diff --check` | GREEN: exit 0, no whitespace errors. |

## Self-review

- Re-read the Task 9 brief, route audit, `AGENTS.md`, and the applicable
  systematic-debugging, TDD/writing-good-tests, verification, code-review, and
  branch-finishing instructions.
- Confirmed with a source sweep that the E2E suite contains exactly one direct
  retired `/guardian/profile` assertion (the required replace/history recovery)
  apart from valid `/guardian/profile/setup` routes.
- Confirmed the mock contains exactly one `state.activeProfileId =` assignment,
  inside the explicit active-selection endpoint.
- Confirmed full story-art source assertions include both exact version and
  learner ID in strict parser order.
- Reviewed the complete diff for source/class assertions; new coverage is
  rendered UI or API behavior using accessible locators and observable state.
- The route audit's sentence that Shift+Tab from a control outside a closed menu
  should focus the now-unmounted `Sign out` item conflicts with its focus-leave
  closure requirement. The test follows actual native DOM behavior: after the
  menu closes and unmounts, Shift+Tab returns to the persistent account trigger.
  It separately proves the full four-item forward Tab sequence and Escape
  restoration.
- No arbitrary sleeps, weakened assertions, new dependencies, production route
  changes, or destructive confirmations were added.
- Untracked user-owned plan/spec files under `docs/superpowers/` were not read,
  modified, staged, or otherwise included.

## Concerns

None. The two lint warnings and Vite chunk advisory are pre-existing generated
or build advisories and are not Task 9 regressions.

---

## Review fix round 1/5 — targeted authorization and resolver hardening

### Findings addressed

1. The browser mock used the value parser before Guardian authorization and
   parsed the same query again inside the authorization and family handlers.
   It now performs a presence-only `searchParams.has` check for a documented
   targetable path, authorizes from that boolean, and only then parses all
   values and resolves ownership exactly once.
2. The former route-family classifier included undocumented exact collection
   paths and allowed a family handler to discard invalid resolution before a
   native fetch. The classifier now names only the production endpoints used
   by the application. Malformed and unowned targets return the shared generic
   no-store 404 centrally before any family dispatch. A valid resolved fixture
   can still reach a test-specific Playwright route, preserving the existing
   deterministic override contract.
3. The former locked/malformed coverage exercised five GET requests. The new
   table contains 26 documented method/path/body combinations spanning both
   profile aliases, all profile mutations, preferences, recording consent and
   recording slots, My Lessons list/create/generate/detail/edit, dubbing
   status/consent/clip/audio/delete, and story-art metadata/asset/generate/delete.
   Mutation rows carry endpoint-appropriate JSON, multipart, or media bodies
   and headers.

### Failure inventory and root causes

| Phase | Observed result | Root cause | Resolution |
| --- | ---: | --- | --- |
| Focused authorization RED | 1 passed, 2 failed | A locked request invoked `getAll` once before returning 403, and the unlocked 182-request matrix observed 574 parses instead of exactly 182. | Split target presence from parsing, pass the presence boolean into the Guardian guard, resolve once centrally, and pass the resolved learner into family handlers. |
| First post-change full browser audit | 441 passed, 16 failed | Thirteen failures across Guardian recording consent, custom lessons, and personalized art showed that the initial central fallback was too strict: it converted already-valid fixture targets to 404 before test-specific Playwright routes could fulfill them. The other three failures were unrelated load-sensitive geometry/focus checks. | Kept malformed/unowned targets fenced before dispatch, but restored native handoff for already-resolved valid fixture targets. The 13 affected tests passed together; the three unrelated cases were reproduced separately and the final unchanged full run passed. |

### Changed files in this review round

- `src/testing/e2e-browser-mocks.ts` — presence-only pre-authorization check,
  narrow documented route classifier, one post-authorization parser/ownership
  resolution, and resolved-learner injection into recording, dubbing, art,
  profile, preference, and lesson handlers.
- `tests/e2e/multiple-learners.spec.ts` — explicit 26-row method/path/body
  matrix; locked no-parse and 52-request authorization coverage; 182-request
  malformed/unowned generic-404 coverage; exact parse count, browser-mock
  marker, cache, content type, and full before/after state assertions.
- `.superpowers/sdd/2026-08-26-guardian-information-architecture/task-9-report.md`
  — this review-round evidence.

### RED and GREEN evidence

| Evidence | Result |
| --- | --- |
| `npx playwright test tests/e2e/multiple-learners.spec.ts --grep 'locked explicit learner authorization\|locked targeted reads\|unlocked malformed targeted'` before the mock change | RED: 1 passed, 2 failed. Locked parsing threw `learner target parsed before authorization` with 1 parse call; the unlocked matrix counted 574 parses instead of 182. |
| Same focused authorization command after the final mock change | GREEN: 3/3 (1.3s). |
| `npx playwright test tests/e2e/multiple-learners.spec.ts` | GREEN: 32/32 (14.5s). |
| Thirteen existing valid-target route-fixture regressions after restoring resolved-target native handoff | GREEN: 13/13 (4.7s). |
| `npm test` after the final change | GREEN: 1,323/1,323 tests, 115 suites, 0 failed (4.346s). |
| `npm run test:browser` after the final change | GREEN: 457/457 tests, 0 failed (1.8m). |
| `npm run lint` | GREEN: exit 0, 0 errors. The same two generated `worker-configuration.d.ts` unused-disable warnings remain. |
| `npm run build` | GREEN: TypeScript and Vite build succeeded; 1,914 modules transformed. The existing chunk-size advisory remains. |
| `git diff --check` | GREEN: exit 0, no whitespace errors. |

### Self-review

- Confirmed `hasExplicitLearnerTarget` performs only documented-path
  classification and query-key presence detection; no `getAll`, trimming, byte
  bounding, or ownership lookup occurs before Guardian authorization.
- Confirmed `parseExplicitLearnerTarget` has one call site in the global fetch
  mock, after the Guardian guard, and family handlers no longer parse targets.
- Confirmed blank, whitespace, duplicate, unknown, foreign, malformed-encoded,
  and 129-byte values all use the exact shared `404 {"error":"not_found"}`
  no-store response with the browser-mock marker and no state mutation.
- Confirmed the 52 locked requests return the same no-store 403 without target
  parsing or state mutation, including GET reads and every documented mutation.
- Confirmed the classifier no longer declares exact `/api/dubs`, exact
  `/api/lesson-recordings`, or arbitrary recording/dubbing subpaths targetable.
- Confirmed valid owned targets retain their target query and can reach
  deterministic Playwright route overrides; only invalid/unowned targets are
  prohibited from native fallback.
- Confirmed the active learner selection remains unchanged across both matrices
  and no new write to `activeProfileId` was introduced.
- No production routing change, dependency, arbitrary sleep, destructive
  confirmation, source/class assertion, or unrelated user-file edit was made.

### Review-round concerns

None. The final required unit and browser suites are green. The first full
browser audit also surfaced unrelated load-sensitive failures, but the final
full run passed all 457 tests without changing those tests or product code.

---

## Review fix round 2/5 — mutation-sensitive authorization matrix

### Finding addressed

The round-1 method/path matrix had the correct response contracts but its
oracles were not sufficiently mutation-sensitive. The locked parser
instrumentation covered only one profile GET, the before/after snapshot covered
only Noah and omitted several internal recording fields, the My Lessons detail
and edit rows named a nonexistent descriptor, and the preference payload used
an invalid value. Those gaps could allow an early parser call or an invalid
target falling back to active Mia to escape detection.

The updated coverage now:

- instruments `URLSearchParams.getAll` around all 52 locked requests and
  requires zero target-parser calls while independently checking every 403,
  no-store header, browser marker, JSON content type, and response body;
- seeds a production-valid custom lesson for both Mia and Noah, asserts their
  deterministic IDs, and uses Mia's existing descriptor for the detail/edit
  rows so an active-learner fallback reaches a real mutable resource;
- snapshots both learners' full learner-profile and profile-editor responses,
  preferences, recording consent plus cleanup/pending/upload descriptors,
  custom lessons, dubbing consent and saved-line status, story-art feature and
  stored-art metadata, along with the account roster and `activeProfileId`;
- sends endpoint-valid JSON, WebM-signature bytes, browser-created multipart
  forms, and a valid tiny PNG, including the accepted `tiny-stories`
  preference literal; and
- applies the same full before/after oracle to all 182 unlocked malformed or
  unowned requests and proves exactly one target parse per request.

### Mutation-sensitive RED evidence

| Injected temporary fault | Result | What it proved |
| --- | --- | --- |
| Called `parseExplicitLearnerTarget` before authorization only for targeted `/api/profile/preferences` requests. | RED: focused locked test failed 0/1, expected 0 parser calls and received exactly 2. Every response still returned 403. | Instrumentation spans the complete 26-row x 2-query locked table rather than only `/api/profile`. |
| Dispatched invalid targeted `PUT /api/lessons/my/lesson-learner-mia-1` into the active learner handler before returning the shared 404. | RED: focused unlocked test failed 0/1 because Mia's seeded lesson title changed from `Mia authorization fixture` to `Edited targeted lesson`, even though the response contract remained 404. | The valid fixture ID and both-learner state oracle detect an invalid target mutating active Mia; a missing descriptor or Noah-only snapshot cannot mask it. |

Both temporary faults were restored immediately with patch reversals and are
absent from the final diff. No production file is changed in this round.

### Changed files in this review round

- `tests/e2e/multiple-learners.spec.ts` — valid binary/multipart/request
  fixtures, deterministic Mia/Noah lesson seeding, shared exhaustive parser
  instrumentation, and the expanded two-learner account-state oracle.
- `.superpowers/sdd/2026-08-26-guardian-information-architecture/task-9-report.md`
  — this review-round failure inventory, evidence, and self-review.

### GREEN verification

| Evidence | Result |
| --- | --- |
| `npx playwright test tests/e2e/multiple-learners.spec.ts --grep "locked targeted reads\|unlocked malformed targeted" --reporter=line` after restoring both mutations | GREEN: 2/2 (1.2s). |
| `npx playwright test tests/e2e/multiple-learners.spec.ts --reporter=line` | GREEN: 31/31 (8.8s). |
| `npm test` | GREEN: 1,323/1,323 tests, 115 suites, 0 failed (4.225s). |
| `npm run test:browser` | GREEN: 456/456 tests, 0 failed (1.8m). |
| `npm run lint` | GREEN: exit 0, 0 errors. The same two generated `worker-configuration.d.ts` unused-disable warnings remain. |
| `npm run build` | GREEN: TypeScript and Vite build succeeded; 1,914 modules transformed. The existing chunk-size advisory remains. |
| `git diff --check` | GREEN: exit 0, no whitespace errors. |

The browser total is 456 instead of round 1's 457 because the redundant
single-profile locked parser test was folded into the exhaustive 52-request
test. The parser invariant now has strictly broader coverage in one test.

### No-state-mutation proof

- Both tests seed and verify exact existing descriptors
  `lesson-learner-mia-1` and `lesson-learner-noah-1` before taking the baseline.
- The locked test compares the complete Mia/Noah/account snapshot before and
  after every one of its 52 requests and observes zero `getAll` calls.
- The unlocked test compares the same snapshot before and after all 182
  requests and observes exactly 182 `getAll` calls.
- The oracle intentionally excludes only the mock's consent-read request
  counter because reading the state itself increments that instrumentation;
  it includes the actual recording consent, cleanup, pending-upload, and
  persisted upload state.
- The active learner remains Mia and the roster remains unchanged in both
  matrices.

### Self-review

- Confirmed all 26 documented targetable method/path rows still participate in
  both matrices; no undocumented endpoint was added to satisfy the classifier.
- Confirmed the locked parser patch encloses the complete 52-request
  `Promise.all` and is restored in `finally`.
- Confirmed the My Lessons detail/edit row targets an existing Mia descriptor
  and its body is a complete valid lesson, making fallback mutation observable.
- Confirmed both aliases and every relevant route-family state are represented
  for both learners in the before/after oracle.
- Confirmed the valid media and multipart bodies would enter their production
  family handlers if invalid-target resolution were accidentally discarded.
- Confirmed the final production mock is byte-for-byte unchanged in this round;
  the work is limited to tests and this report.
- No dependency, arbitrary sleep, weakened assertion, destructive action,
  source/class assertion, cross-origin behavior change, or unrelated user-file
  edit was introduced.

### Review-round concerns

None. All requested focused and full verification commands are green.
