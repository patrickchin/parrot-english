## Task 2: CRUD-only Manage learners presentation

### Delivery

- Removed learner selection controls, active/mode labels, and manager-side
  selection/reload behavior from Manage learners.
- Added administrative Edit/Delete card actions, final-learner protection,
  deletion-pending retry copy, and an accessible confirmation dialog.
- The dialog uses `useDialogFocus`, `ActionButton`, modal semantics, focus
  restoration, and blocks Escape/backdrop/cancel while confirmation is busy.
- Updated obsolete manager-selection lifecycle tests; retained creation
  reconciliation checks as administrative-card assertions.

### RED/GREEN evidence

- RED: `node --test tests/guardian-learner-profiles.test.mjs` initially failed
  four intended assertions: stale learner-mode/Managing UI, missing Delete
  actions, missing delete-dialog cancellation/focus behavior, and missing
  pending/final-learner presentation.
- GREEN: `node --test tests/guardian-learner-profiles.test.mjs
  tests/lifecycle/app-lifecycle.test.mjs` passed 145 tests.
- Final: `npm test` passed 1400 tests; `npm run build` passed; the completed
  `npm run test:browser` run reported Playwright status `passed`; `git diff
  --check` passed. `npm run lint` had no errors and retained two pre-existing
  warnings in generated `worker-configuration.d.ts`.

### Commit

`refactor: keep learner management administrative`

### Self-review

- No DELETE browser API or `selectLearner` call was added to the manager.
- Normal cards retain targeted Edit/Delete accessible names; pending profiles
  expose only `Finish deleting {name}`; a final usable learner has disabled
  Delete plus explanatory copy.
- Cancellation does not invoke `onDelete` and focus returns to the initiating
  Delete control.

### Concern

Task 2 leaves the container's `onDelete(profile)` callback as a deliberately
minimal no-op compile boundary. Task 5 must replace it with the real queued
deletion mutation and roster reconciliation.
