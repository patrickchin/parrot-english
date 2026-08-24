# Account action hierarchy implementation plan

Date: 2026-08-24

Branch: `codex/account-action-hierarchy`

Base: `080dbbb`

Research contract:
[`account-action-hierarchy-guidance.md`](../research/account-action-hierarchy-guidance.md)

## Goal

Make routine Sign out visually neutral, put deletion last with a quiet
destructive cue and structural break, and reserve the strong danger treatment
for the existing password-confirmed final action without changing auth or
deletion behavior.

## Task 1: add the failing rendered hierarchy contract

Files:

- `tests/e2e/header.spec.ts`
- `tests/lifecycle/accessibility-lifecycle.test.mjs`

Steps:

1. Use accessible menu-item locators to require the selected visual/DOM order.
2. Compare computed rendered chrome: Sign out matches an existing neutral row,
   while Delete differs from both.
3. Compare bounding boxes to require 44px targets and a larger grouping gap
   before deletion at 280x568, 390x844, 640x360, and 1440x900.
4. Update the keyboard-order contract so End reaches Delete and ArrowUp reaches
   Sign out; retain normal-open first focus, wrapping, Home, and Escape.
5. Run only these cases against `080dbbb` and record the expected hierarchy
   failures before editing production components.

## Task 2: implement the shared muted-destructive treatment

Files:

- `src/shared/ui.tsx`
- `src/app/AppHeader.tsx`
- `src/app/AccountDeleteDialog.tsx`

Steps:

1. Add one shared muted-destructive surface variant using Tailwind's pale rose
   background and dark red foreground.
2. Render Sign out before Delete with the existing neutral surface.
3. Render Delete last with the shared muted treatment and eight pixels of extra
   top margin, creating the final review-driven twelve-pixel total gap.
4. Reuse the existing filled rose variant for the final confirmation.
5. Change no label, callback, request, disabled rule, focus hook, or timing.

## Task 3: verify interaction, contrast, and containment

Files:

- `tests/e2e/header.spec.ts`
- `tests/e2e/shared-control-contrast.spec.ts`
- existing auth, accessibility, focus, and surrounding-page tests

Checks:

1. Sign out and muted Delete label contrast at rest, hover, active, and focus on
   the real navy menu at 280px and desktop.
2. Enabled final Delete confirmation contrast and visual escalation.
3. Normal and forced-colors focus on both menu actions.
4. Short viewport, arbitrary CJK/RTL identity, error reopening, pointer
   ownership, scroll containment, target size, and header clearance.
5. Sign-out success/failure and deletion password/Cancel/success paths.

## Task 4: capture and independently review evidence

Create:

- final screenshots at 280x568, 390x844, 640x360, and 1440x900;
- focused Sign out and Delete screenshots;
- a 640x360 forced-colors screenshot;
- an enabled 390x844 final-confirmation screenshot; and
- `artifacts/ux-review/account-action-hierarchy/manifest.md` with dimensions,
  states, branch/commit provenance, and SHA-256.

Use the genuine in-app Browser for ordinary-color product captures and the
Playwright harness for forced-colors emulation. Request independent code,
accessibility, and original-resolution visual review. Revise if Delete becomes
magnetic again, neutral controls look disabled, or spacing weakens containment.

## Task 5: full verification and hand-off

Run separately:

```sh
npm test
npm run test:browser
npm run build
npm run lint
git diff --check
```

Verify Markdown links plus every artifact's real file type, dimensions, and
SHA-256. Write the implementation memo, update the research index and backlog,
make reviewable commits, and leave the branch clean before continuing to the
separate sign-out pending-feedback timing question.
