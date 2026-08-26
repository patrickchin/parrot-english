# Task 8 report: Guardian dashboard and static shared controls

## Outcome

Implemented the Task 8 Guardian information architecture and removed translate-based pointer movement from the shared control/card primitives.

The dashboard now has three visually and semantically separate groups:

1. One featured **Manage learners** destination. It names the learner using learner mode and is the only dashboard destination for adding, selecting, or editing learners.
2. A **Learning & content** group containing exactly **My Lessons**, **Story settings**, and **Voice dubbing**, with distinct decorative Lucide icons, accents, descriptions, and actions.
3. A separate **Account & privacy** destination linked to `/guardian/account`.

The top-level **Switch to learner** action remains. The duplicate **Learner details** card, its direct profile-editor link, and the stale profile-dropdown instruction were removed.

Shared buttons, links, menu items, segmented buttons, and `InteractiveCard*` now use brightness/filter feedback without hover or press translation. Focus-visible treatment, target sizing, and disabled semantics remain in place. Runtime character transforms and lesson-editor positioning were not changed.

## Changed files

- `src/app/GuardianDashboard.tsx`
  - Rebuilt the dashboard into the featured learner destination, the three-card content group, and the separate account destination.
  - Added distinct Lucide icons and restrained accent surfaces with Tailwind utilities.
  - Linked Account & privacy to `/guardian/account` through the existing route helper.
- `src/shared/ui.tsx`
  - Removed translate transitions and hover/active translate utilities from `controlClassName`, `SegmentedButton`, and `InteractiveCard*`.
  - Retained filter/brightness feedback, focus-visible outlines/rings, minimum target sizes, and disabled styles.
- `tests/product-streamline.test.mjs`
  - Added rendered dashboard checks for the single learner-management destination, learner-mode profile name, exact content group, account link, and removed duplicate/stale content.
- `tests/e2e/shared-control-contrast.spec.ts`
  - Added a bounding-box regression proving a real shared menu item does not move after hover and its CSS transition settles.
- `tests/e2e/guardian-mode.spec.ts`
  - Updated the Task 8 dashboard-content assertion to the new visible group and destination headings.
- `.superpowers/sdd/2026-08-26-guardian-information-architecture/task-8-report.md`
  - This report.

## TDD evidence

### RED

Command:

```sh
node --test tests/product-streamline.test.mjs
```

Result: exit 1; 7 tests total, 4 passed and 3 failed for the intended missing behavior:

- no `Manage learners` heading/action in the old dashboard;
- no semantic `Learning & content` group;
- old href list still included `/guardian/profile?returnTo=%2Fguardian` and omitted `/guardian/account`.

Command:

```sh
npx playwright test tests/e2e/shared-control-contrast.spec.ts --grep "shared menu items do not move when hovered"
```

Result: exit 1; 1 failed. The real **Manage learners** menu item moved from `y: 223` to `y: 221` after hover, proving the regression detected the existing two-pixel translation.

### GREEN

Command:

```sh
node --test tests/product-streamline.test.mjs
```

Result: exit 0; 7/7 passed after the dashboard implementation.

Command:

```sh
npx playwright test tests/e2e/shared-control-contrast.spec.ts --grep "shared menu items do not move when hovered"
```

Result: exit 0; 1/1 passed after removing shared translate interactions.

Command:

```sh
npx playwright test tests/e2e/guardian-mode.spec.ts --grep "successful unlock opens guardian management"
```

Result: exit 0; 1/1 passed with the new dashboard headings rendered after unlock.

## Verification

Command:

```sh
npx playwright test tests/e2e/shared-control-contrast.spec.ts
```

Result: exit 0; 14/14 passed, including normal, hover, active, focus, disabled, contrast, and no-movement coverage at ultra-narrow and desktop sizes.

Command:

```sh
npx playwright test tests/e2e/shared-focus-visibility.spec.ts
```

Result: exit 0; 34/34 passed.

Command:

```sh
npx playwright test tests/e2e/header.spec.ts
```

Result: exit 1; 46/51 passed. The five failures are deferred Task 9 legacy navigation assertions: four responsive variants still opening the retired `/guardian/profile` learner-details route and one still clicking the removed **Manage learner details** dashboard shortcut. They were not migrated in Task 8, as instructed.

Command:

```sh
npm test
```

Result: exit 1; 1321/1322 passed. The sole failure is the deferred Task 9 lifecycle assertion still looking for the old **Manage learner profiles** dashboard label.

Command:

```sh
git diff --check && npm run lint -- --quiet && npm run build && node --test tests/product-streamline.test.mjs
```

Result: exit 0. Diff check and lint were clean, TypeScript and Vite production build completed, and product tests passed 7/7. Vite emitted only its existing non-fatal large-chunk advisory.

Command required by `AGENTS.md`:

```sh
npm run test:browser
```

Final result: exit 1; 407/447 passed in 2.8 minutes. Exactly the 40 Task 9 legacy navigation assertions identified in the task context remain; no Task 8 dashboard assertion remains failing. Playwright also printed non-fatal `NO_COLOR`/`FORCE_COLOR` warnings.

## Self-review

- Confirmed only one `/guardian/learners` dashboard link exists and its featured card names the learner using learner mode.
- Confirmed no dashboard link points to `/guardian/profile`; learner add/select/edit entry is consolidated under Manage learners.
- Confirmed the content group exposes exactly three `h3` destinations, with three different Lucide icon components and distinct accent colors.
- Confirmed Account & privacy is a separate labelled card with a clear `/guardian/account` action and no dropdown instruction.
- Confirmed labels and descriptions distinguish destinations without relying on color.
- Confirmed `Switch to learner` and its pending/disabled behavior were preserved.
- Confirmed `src/shared/ui.tsx` has no remaining translate utility or translate transition; the edit did not touch lesson/runtime transforms.
- Confirmed focus-visible classes, existing >=44px size variants, disabled cursor/opacity semantics, and non-motion feedback remain.
- Confirmed no dependency, shared abstraction, stylesheet, or unrelated source file was added or modified.
- Mutation check: restoring a second learner card/profile href, removing the content-group landmark, omitting account routing, restoring stale dropdown copy, or restoring shared hover translation would fail the added rendered or bounding-box coverage.

## Concerns

- At the initial handoff, the full commands retained one Node lifecycle failure and 40 explicitly deferred Task 9 Playwright assertions. Fix round 1 below corrects the Node locator ownership; the 40 browser assertions remain deferred.
- Vite continues to report the pre-existing bundle-size advisory; this task adds no dependency and does not materially change the bundle architecture.

## Fix round 1: lifecycle locator correction

The first review found that the lifecycle flow which leaves and re-enters the Guardian learner manager still clicked the retired **Manage learner profiles** accessible name. This assertion is owned by the Task 8 dashboard rename, not Task 9. Production already rendered the correct **Manage learners** contract, so only the stale rendered locator in `tests/lifecycle/app-lifecycle.test.mjs` changed.

### RED evidence

Command:

```sh
node --test --test-name-pattern="finishes the authoritative learner reload after leaving the Guardian manager" tests/lifecycle/app-lifecycle.test.mjs
```

Result before the locator correction: exit 1; 0/1 passed. The exact failure was `Expected a link named Manage learner profiles` at line 4985.

### GREEN evidence

Command:

```sh
node --test --test-name-pattern="finishes the authoritative learner reload after leaving the Guardian manager" tests/lifecycle/app-lifecycle.test.mjs
```

Result after the locator correction: exit 0; 1/1 passed.

Command:

```sh
npm test
```

Result: exit 0; 1322/1322 passed across 115 suites. This supersedes the earlier unit-suite concern; only the separately documented 40 deferred Task 9 Playwright assertions remain outside this fix round.

### Fix self-review

- Changed exactly one accessible locator string from **Manage learner profiles** to the rendered **Manage learners** contract.
- Confirmed the test still exercises the real dashboard link, returns to `/guardian/learners`, completes the held selection, and verifies the authoritative learner reload.
- Made no production change and did not weaken or remove any assertion.
- Left the deferred Minor about per-card description/action association unchanged, as instructed.
