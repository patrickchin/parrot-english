# Guardian Dubbing Consent Final Fix Report

## Status

PASS. The guardian can recover a pre-v2 interrupted R2 reset after granting
current consent. The page treats `DubResetInProgressError` as an explicit
cleanup-required state, exposes only the guardian cleanup action, retries that
action safely, and reconciles to authoritative `not_granted` status.

Base: `36ad870eca71410cb5c3dc3f493953818dbc60d0`

## Root cause and bounded fix

The Worker already supported the secure recovery sequence: absent D1 consent
hides R2, a fresh v2 grant makes a legacy non-ready marker surface as
`409 dub_reset_in_progress`, and guardian DELETE transitions D1 to `revoking`
before taking over the R2 reset with a fresh generation. The guardian container
discarded the typed reset error as a generic status failure, then its delete
guard rejected cleanup because no normal `granted` or `revoking` payload was
available.

The fix adds one local `cleanupRequired` guardian state. Only
`DubResetInProgressError` enters it. It reuses the existing cleanup card, blocks
the grant and learner-switch surfaces, allows DELETE without a normal status
payload, survives a failed cleanup followed by another reset response, and is
cleared by an authoritative normal status.

The regression models a legacy marker with valid `generation` metadata and
`state: "deleting"`. This is the exact interrupted-reset migration case. The
production DELETE path also supports malformed markers, and the existing
`recovers deleting and malformed markers through a fresh reset generation`
Worker test retains direct coverage for both; no new malformed-marker semantics
were invented.

## TDD evidence

The real migrated D1/R2 regression was added first. It was GREEN at the base
revision (1/1) because the Worker/repository takeover was already implemented;
this characterization proves the supported server sequence end to end:

1. absent D1 grant returns `not_granted` without listing R2;
2. guardian v2 grant succeeds;
3. status returns `409 dub_reset_in_progress` for the legacy deleting marker;
4. guardian DELETE takes over with a fresh reset generation;
5. D1 and final status return `not_granted` and all slots are tombstoned.

RED client evidence before production changes:

- `node --test --test-name-pattern='interrupted legacy reset' tests/guardian-dubbing-settings.test.mjs`
  failed 0/1 because `Finish removing voice clips` was absent.
- `npx playwright test tests/e2e/dubbing.spec.ts --grep='guardian mode finishes an interrupted consent revocation'`
  failed 0/1 because the mock incorrectly started at D1 `revoking`, so the
  expected pre-grant `Turn on private voice dubbing` state was absent.

GREEN evidence after the minimal fix:

- Mounted guardian regression: 1/1 passed, including a failed first DELETE,
  retained cleanup action, successful retry, no regrant, and authoritative
  `not_granted` reconciliation.
- Migration-realistic Playwright journey: 1/1 passed.
- Focused domain/repository/client/UI/account-deletion run: 101/101 passed.
- Focused dubbing plus guardian-mode Playwright run: 47/47 passed.

## Files

- `src/dubbing/GuardianDubbingSettings.tsx` — typed cleanup-required state and
  guarded DELETE recovery.
- `src/testing/e2e-browser-mocks.ts` — legacy reset starts without D1 consent;
  current revocation, failed cleanup, and lost-response scenarios stay distinct.
- `tests/dub-worker.test.mjs` — real migrated D1 plus R2 deleting-marker recovery.
- `tests/guardian-dubbing-settings.test.mjs` — mounted typed-error cleanup,
  retry, no-regrant, and reconciliation coverage.
- `tests/e2e/dubbing.spec.ts` — guardian grant, observed 409, cleanup takeover,
  and final `not_granted` browser journey.

## Fresh ordered full gates

1. `npm test` — exit 0; 948 tests, 103 suites, 948 passed, 0 failed.
2. `npm run lint` — exit 0; 0 errors, 2 warnings. Both warnings are unchanged
   unused eslint-disable directives in generated `worker-configuration.d.ts`.
3. `npm run build` — exit 0; TypeScript passed and Vite built 1,904 modules.
   Vite emitted its existing non-failing large-chunk advisory.
4. `npm run test:browser` — exit 0; 432 passed, 0 failed (1.7 minutes).

The ordered sequence was restarted from `npm test` after the first build run
caught and corrected an `unknown` JSON value in the new Playwright assertion.

## Self-review

- No Worker, repository, schema, R2 CAS, generation, upload, audio-read, route
  guard, or account-deletion production behavior changed.
- Cleanup remains guardian-only through the existing protected DELETE route;
  no learner control was introduced.
- The new state can render neither consent grant nor learner switching, and its
  delete handler is still mutation-coalesced and disabled while loading/busy.
- A generic status error does not masquerade as cleanup-required; only the
  sanitized typed API error enables takeover.
- A normal authoritative response clears cleanup-required before presenting its
  current consent state. Failed cleanup plus repeated 409 stays retryable.
- Browser mock state now separates legacy absent-D1 migration, genuine current
  revocation, cleanup failure, and lost-response reconciliation.
- Focused and full account-deletion coverage remained green.
- Mutation audit: removing the typed-error branch fails the mounted test;
  restoring seeded `revoking` fails the E2E pre-grant assertion; removing the
  cleanup delete allowance leaves the action inert and fails reconciliation;
  exposing regrant fails both mounted and browser absence checks.

## Concerns

None within the bounded recovery path. The two generated-file lint warnings and
Vite chunk-size advisory are non-failing and unrelated to this change.
