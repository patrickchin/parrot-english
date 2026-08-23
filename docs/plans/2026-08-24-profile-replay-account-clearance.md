# Profile replay/account clearance implementation plan

Date: 2026-08-24

Branch: `codex/profile-replay-account-clearance`

Base: `22cbc9b`

Research contract:
[`profile-replay-account-clearance-guidance.md`](../research/profile-replay-account-clearance-guidance.md)

## Goal

Make the saved-audio Replay action completely visible, focus-visible, and
pointer-operable beside the fixed Account control at compact profile-question
viewports, without shrinking targets, moving actions off-screen, changing the
question flow, or altering tall-screen composition.

## Task 1: establish an enabled failing fixture

Files:

- `src/testing/e2e-browser-mocks.ts`
- `tests/e2e/learner-profile-viewport-stability.spec.ts`
- `tests/e2e/shared-focus-visibility.spec.ts`

Steps:

1. Derive a saved audio object for each viewport question from its production
   `audioId` and English prompt; do not copy Mandarin into `src`.
2. Add Replay to viewport, target-size, and account-clearance checks.
3. Check Replay's eight-pixel expanded focus footprint against Account.
4. Sample Replay pointer hit ownership at its center and inset corners.
5. Add a rendered-focus scenario for enabled Replay and preserve the existing
   focused-heading → Tab → answer contract; use Shift+Tab for Replay.
6. Run the focused cases and record the expected red obstruction before editing
   production layout.

Focused command:

```sh
PLAYWRIGHT_PORT=4211 npx playwright test \
  tests/e2e/learner-profile-viewport-stability.spec.ts \
  tests/e2e/shared-focus-visibility.spec.ts \
  --project=chromium
```

## Task 2: implement the local compact reflow

File:

- `src/learner-profile/LearnerProfileQuestion.tsx`

Steps:

1. Keep progress then Replay in markup.
2. Start-pack the utility row below `sm` and in `short-wide`.
3. Use a four-pixel narrow gap and normal narrow tracking; retain the current
   short-wide gap and tall-screen split placement.
4. Make no size, label, audio, focus, route, state, or timing change.
5. Run the focused tests and adjust only from rendered evidence.

## Task 3: verify behavior and visual stability

Files:

- `tests/e2e/learner-profile-viewport-stability.spec.ts`
- `tests/e2e/shared-focus-visibility.spec.ts`
- `tests/learner-profile-ui.test.mjs` only if the audio-enabled fixture exposes
  a component contract gap

Checks:

1. 280x568, 320x640, 360x640, 390x844, 640x360, and 1440x900.
2. Replay and Account boxes/targets, expanded focus clearance, pointer ownership,
   progress line count, initial heading focus, Tab/Shift+Tab behavior, action
   containment, horizontal overflow, main origin, short-landscape scroll
   extent, and normal/forced-colors focus visibility.
3. Existing delayed-art and same-route transition checks.

## Task 4: capture and review evidence

Create:

- `artifacts/ux-review/profile-replay-account-clearance/manifest.md`
- baseline/retained JPEGs at 280x568 and 640x360
- retained focused-Replay JPEGs at 280x568 and 640x360
- retained non-regression JPEGs at 390x844 and 1440x900

Use the genuine in-app Chromium Browser, full viewport, fixed route/state, and
record exact pixel dimensions and SHA-256 digests. Preserve evidence limits;
screenshots do not prove audio, assistive-technology behavior, or comprehension.

Request independent code, accessibility, and original-resolution visual review.
Revise or reject if the compact label becomes hard to scan, focus paint touches
Account, content moves off-screen, or tall layout changes unexpectedly.

## Task 5: full verification and hand-off

Run separately where transient Playwright output could affect lint:

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
