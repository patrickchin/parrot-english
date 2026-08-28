Status: complete on 2026-08-28.

Summary:
- Added the canonical `getOldMacDonaldDubPath()` helper and safe-return coverage for `/dubs/old-macdonald` while keeping `/dubs/five-little-ducks` intact.
- Wired the authenticated app shell to mount the shared `DubStudio` with `OLD_MACDONALD_DUB` and `FarmScene` on the new public route.
- Extended the home menu with a fifth accessible Old MacDonald card, using the local farm scene art and short-viewport compact copy so the header and cards still fit responsive checks.
- Generalized the browser dubbing mocks so the active route selects the current dub definition, API base, guide assets, and line counts, including 35 Old MacDonald slots.
- Added focused route, shell, home-menu, and browser coverage for the new route while preserving the existing Five Little Ducks route behavior.

Files changed:
- `src/app/app-routes.ts`
- `src/app/App.tsx`
- `src/app/HomeMenu.tsx`
- `src/testing/e2e-browser-mocks.ts`
- `tests/app-routes.test.mjs`
- `tests/app-shell-ui.test.mjs`
- `tests/e2e/home-menu.spec.ts`
- `tests/e2e/dubbing.spec.ts`

Verification:
- `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs`
  - Red: failed first for the missing Old MacDonald route helper, safe-return path, and home entry.
- `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs && npm run test:browser -- tests/e2e/home-menu.spec.ts tests/e2e/dubbing.spec.ts`
  - Green: unit tests passed and Playwright passed with 80 browser tests.

Concerns:
- `src/dubbing/GuardianDubbingSettings.tsx` did not need changes for Task 5 because the current surface still intentionally manages the shared consent flow through the existing Five Little Ducks copy and API contract.
- Playwright emits the existing `NO_COLOR`/`FORCE_COLOR` warnings during the browser run; they did not affect test results.
