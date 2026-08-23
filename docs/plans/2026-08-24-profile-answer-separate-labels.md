# Profile answer separate-labels implementation plan

Date: 2026-08-24

Branch: `codex/profile-answer-separate-labels`

Base: `4e3f9b8`

Research contract:
[`profile-answer-separate-labels-guidance.md`](../research/profile-answer-separate-labels-guidance.md)

## Goal

Give the profile textarea and microphone exact, separate native control names
while preserving the current pixels, click behavior, keyboard order, disabled
behavior, and responsive composition.

## Task 1: establish a failing semantic contract

Files:

- `tests/e2e/learner-profile-viewport-stability.spec.ts`

Steps:

1. Open the deterministic production-copy question fixture.
2. Require an exact textbox named **Your answer**, an exact button named
   **Speak your answer**, and no combined textbox name.
3. Inspect native relationships: one explicit textarea label, no microphone
   label, and no label containing both textarea and button.
4. Verify visible-label click focus and textarea/microphone pointer isolation.
5. Verify heading → textarea → microphone → following action traversal and the
   reverse local path.
6. Verify one Enter and one Space activation in isolated fixture loads and the
   shared fieldset-disabled behavior once listening begins.
7. Change existing profile textbox locators in this suite to exact matching so
   viewport guards cannot regress silently.
8. Run the focused test against `4e3f9b8` and record the expected red combined
   accessible name before editing production code.

Focused command:

```sh
PLAYWRIGHT_PORT=4212 npx playwright test \
  tests/e2e/learner-profile-viewport-stability.spec.ts \
  --project=chromium
```

## Task 2: apply the smallest native-label correction

File:

- `src/learner-profile/LearnerProfileQuestion.tsx`

Steps:

1. Replace only the outer field label with a neutral wrapper carrying the same
   grid classes.
2. Replace the visible text span with a dedicated
   `<label htmlFor={inputId}>Your answer</label>`.
3. Keep the flex row, textarea, microphone `IconButton`, IDs, ordering,
   callbacks, and classes unchanged.
4. Do not add ARIA to the textarea, a named group, visible copy, or a shared
   abstraction.
5. Run the focused red contract to green.

## Task 3: verify rendered and visual invariants

Files:

- `tests/e2e/learner-profile-viewport-stability.spec.ts`
- `tests/e2e/shared-focus-visibility.spec.ts`
- `tests/learner-profile-ui.test.mjs` only if a lower-level native-markup guard
  adds value beyond the rendered contract

Checks:

1. Exact independent names and native relationships.
2. Label click, textarea editing, microphone click/Enter/Space, exactly-once
   request behavior, forward/reverse Tab order, and disabled behavior.
3. 280x568, 320x640, 360x640, 390x844, 640x360, and 1440x900 geometry with at
   most one-pixel delta from the recorded baseline.
4. Target size, focus paint, account clearance, delayed art, action
   containment, horizontal overflow, and pre-existing vertical scroll ranges.
5. Production build and TypeScript behavior.

## Task 4: capture and review evidence

Create:

- `artifacts/ux-review/profile-answer-separate-labels/manifest.md`
- baseline and retained 280x568 answer-focused JPEGs;
- baseline and retained 640x360 idle/focused JPEGs; and
- retained 390x844 and 1440x900 non-regression JPEGs.

Use the genuine in-app Browser at fixed deterministic route/state. Record exact
viewport dimensions, state, provenance, bounding boxes, SHA-256, and the
accessibility snapshot separately. Screenshots cannot establish accessible
names, exact screen-reader speech, transcription behavior, or comprehension.

Request independent code, accessibility, and original-resolution visual
review. Revise or reject if pixels move, controls merge in the accessibility
tree, label click changes, focus order changes, or the disabled state becomes
inconsistent.

## Task 5: full verification and hand-off

Run separately:

```sh
npm test
npm run test:browser
npm run build
npm run lint
git diff --check
```

Also verify every local Markdown link and every evidence file's type,
dimensions, and SHA-256. Write an implementation evidence memo, update the
research index/source register/backlog, make reviewable commits, and leave the
branch clean before selecting the next stacked improvement.
