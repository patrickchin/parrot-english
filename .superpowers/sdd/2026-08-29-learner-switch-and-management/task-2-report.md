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
- Final: `npm test` passed 1400 tests; `npm run build` passed; `git diff
  --check` passed. `npm run lint` had no errors and retained two pre-existing
  warnings in generated `worker-configuration.d.ts`. The prior browser result
  is superseded as non-evidence by the unique-port correction below.

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

## Fix round 1: contain and isolate deletion names

### Delivery

- Wrapped every visible deletion-related learner name in `BidiLearnerName` and
  made final-learner copy, pending retry copy, dialog title/body/action, and
  error copy able to wrap an unbroken 120-character name.
- Added rendered coverage for all deletion surfaces and error copy, plus
  280px browser coverage that opens the administrative Delete dialog and
  checks its named controls and visible content for horizontal containment.
- Removed stale ignored manager-harness reload callbacks/counters from the
  relevant administrative navigation and creation tests.

### RED/GREEN evidence

- RED: `node --test tests/guardian-learner-profiles.test.mjs` failed the new
  Bidi expectation because the final-learner deletion message rendered the
  raw name. On this worktree, `PLAYWRIGHT_PORT=4191 npm run test:browser --
  tests/e2e/multiple-learners.spec.ts --grep 'wraps an unbroken|isolates a
  right'` failed the unbroken-name case at 280px (`2085.171875`px content
  against a `280`px viewport); the RTL case already passed.
- GREEN: focused rendered tests passed 11/11. The same unique-port Playwright
  command passed both long-name and RTL dialog cases (2/2).
- Final: `npm run lint && npm test && npm run build && git diff --check`
  completed successfully: lint had no errors (the same two generated-DTS
  warnings), Node tests passed 1402/1402, production build passed, and the
  diff check passed.

### Environment correction

The earlier port-4173 browser result is not evidence for this fix because that
port was occupied by a Vite server from another worktree and could serve stale
code. All browser RED/GREEN evidence above uses this branch's unique port 4191.

### Self-review

- No selection behavior, DELETE browser API call, or new dependency was
  introduced.
- The explicit profile-name segment in error feedback remains Bidi-isolated;
  an API-provided error message is preserved as independent diagnostic text.
