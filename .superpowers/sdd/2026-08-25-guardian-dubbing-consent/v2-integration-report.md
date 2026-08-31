# Guardian dubbing consent — Five Little Ducks v2 integration report

## Status

PASS. The preserved guardian-consent feature has been integrated as a semantic
union onto the current Five Little Ducks v2 baseline. The result keeps v2's
24-line, 98-second learner experience and R2 concurrency/storage protocol while
moving durable voice consent and deletion to guardian mode and adding the
required account-deletion privacy fencing.

Branch: `codex/guardian-dubbing-consent`

Merge subject: `merge: integrate guardian consent with dubbing v2`

## Conflict resolution

The merge began with conflicts in nine files. Each was resolved against the v2
version first and then given only the durable-consent behavior it needed:

- `src/dubbing/DuckDub.tsx` keeps v2 guide autoplay, **Replay example**,
  waveform decoding, **Hear my voice**, local object-URL cleanup, 24-line
  progress, final playback, and responsive layout. Learner self-attestation,
  reset, and deletion controls were removed; consent availability now comes
  from status.
- `src/testing/e2e-browser-mocks.ts` combines the v2 24-line API, upload
  response, guide/playback/waveform instrumentation, and reset recovery with
  durable `not_granted`, `granted`, and `revoking` states.
- `tests/dub-api.test.mjs`, `tests/dub-ui.test.mjs`, and
  `tests/dub-worker.test.mjs` retain the v2 contract/range/CAS/envelope/pacing
  coverage and layer durable-consent, legacy-retirement, and deletion-race
  coverage onto it.
- `tests/e2e/dubbing.spec.ts` retains the v2 learner journey and responsive
  assertions, replaces learner adult management with guardian journeys, and
  adds guardian-page coverage at 280x568, 390x844, and 640x360.
- `docs/design/product-experience.md`,
  `docs/design/technical-architecture.md`, and
  `docs/superpowers/specs/2026-08-25-five-little-ducks-dubbing-design.md`
  describe one v2 24-line/98-second/waveform product with durable guardian
  consent, v1-prefix retirement, and the 35-object account closure.

No conflict markers remain. The merge index has no unresolved entries.

## Semantic ports and hardening

### Durable consent and guardian ownership

- Added activity-agnostic `guardian_dub_consent` D1 schema, generated migration
  `0011_guardian_dub_consent`, and repository operations for idempotent grant,
  exact-generation authorization, revocation, and conditional completion.
- Kept `/guardian/dubbing`, the dashboard destination, lazy guardian boundary,
  authoritative reload/reconciliation, duplicate mutation guards, interrupted
  cleanup state, and lock-before-learner navigation.
- Kept one explicit destructive guardian action with no second confirmation.
- Removed the dormant learner-operated `Grown-up chat style` control while
  retaining the internal default prompt style.

### Current-v2 central policy

- `worker/guardian-access.ts` derives the protected dub path from imported
  `DUB_ID`. Only current-v2 consent `PUT` and current-v2 root `DELETE` require
  the live guardian unlock.
- Obsolete v1 lookalike routes are not classified as guardian mutations and do
  not invoke the current dub domain as if they were current operations.
- `worker/index.ts` creates one request-scoped database and applies the shared
  guardian guard before passing that same database to the dub handler.

### Consent-aware v2 R2 behavior

- Status reports the fixed 24-line shape plus `recordingEnabled` and
  `consentState`, and never lists R2 while consent is absent or revoking.
- Uploads capture and recheck the D1 grant generation around v2's conditional
  R2 put, record the consent generation in metadata, and conditionally fence
  the exact written object when consent changes or becomes uncertain.
- Audio status/read validation preserves v2 envelopes, byte ranges, upload
  nonces, marker generations, private headers, pacing, and CAS behavior.
- A first durable v2 grant can adopt eligible pre-durable clips already under
  the current v2 prefix. The retired `five-little-ducks-v1/` prefix is never
  listed, counted, adopted, or played.
- Guardian revocation orders work as D1 `revoking`, fresh v2 reset, 24 current
  slot tombstones, v1 marker/nine-slot retirement and prefix purge, ready v2
  marker, then exact-generation consent-row deletion. Failure leaves
  `revoking` for retry.

### Account-deletion privacy closure

- Consent grant checks the durable account-deletion tombstone immediately
  before and after its D1 mutation.
- Status and audio check before R2 work and again immediately before returning
  data. A grant/read racing the tombstone fails closed.
- Existing upload and revoke account-deletion checks and exact-write fencing
  remain intact.
- Account deletion excludes and then persists all 35 closure objects: the v2
  marker plus 24 slots, and the retired-v1 marker plus nine slots. The consent
  row still cascades when the account is deleted.

## TDD evidence

Behavior-specific tests were written before each integration fix where the
merge state allowed a meaningful failure:

1. Current-v2 guardian policy RED:
   `node --test tests/dub-routing.test.mjs` passed 4 and failed 1 because a
   locked v2 consent `PUT` reached the handler and returned 200 instead of 403.
   The test also records that obsolete v1 consent/delete paths are not current
   guardian mutations.
2. Tombstone privacy RED:
   the three focused grant/status/audio race tests passed 0 and failed 3;
   observed responses were 204/200/200 instead of the required 409.
3. Combined account closure RED:
   `node --test tests/account-deletion.test.mjs` passed 2 and failed 9 because
   the legacy marker/nine-slot fences were absent.
4. The v2 line boundary and v1-prefix non-revival checks were added as
   characterization around already-correct v2 parsing/prefix isolation; no
   production change was needed for those two cases.
5. The first responsive guardian Playwright run failed 0/3 because the new test
   locator matched both the `Voice dubbing` h1 and `Voice dubbing is on` h2.
   Making the accessible heading locator exact fixed the test; rendered product
   geometry was already correct.

Focused GREEN evidence:

- Schema/consent/routing/guardian/Worker/account deletion: 99/99 passed.
- Final `tests/dub-worker.test.mjs`, including line 24/25 and retired-v1
  non-revival: 63/63 passed.
- Dub API/state/UI/playback/waveform plus guardian routes/settings/shell and
  lifecycle: 239/239 passed in the broad focused run.
- Focused dubbing plus guardian-mode Playwright: 53/53 passed, followed by the
  three added guardian responsive cases at 3/3.
- `npx tsc --noEmit --pretty false`: passed during conflict resolution.

## Ordered full gates

Run once on the final resolved implementation, in the required order:

1. `npm test` — exit 0; 957 tests, 104 suites, 957 passed, 0 failed.
2. `npm run lint` — exit 0; 0 errors, 2 warnings. Both warnings are the existing
   unused eslint-disable directives in generated `worker-configuration.d.ts`.
3. `npm run build` — exit 0; TypeScript passed and Vite built 1,906 modules.
   Vite emitted its non-failing existing large-chunk advisory.
4. `npm run test:browser` — exit 0; 441 passed, 0 failed in 1.7 minutes.

## Files

Durable consent and Worker integration:

- `migrations/0011_guardian_dub_consent.sql`
- `migrations/meta/0011_snapshot.json`
- `migrations/meta/_journal.json`
- `src/db/schema.ts`
- `worker/dub-consent.ts`
- `worker/dubs.ts`
- `worker/guardian-access.ts`
- `worker/account-deletion.ts`
- `worker/index.ts`

Client, guardian, and learner surfaces:

- `src/dubbing/DuckDub.tsx`
- `src/dubbing/GuardianDubbingSettings.tsx`
- `src/dubbing/dub-api.ts`
- `src/dubbing/dub-state.ts`
- `src/app/App.tsx`
- `src/app/GuardianDashboard.tsx`
- `src/app/app-routes.ts`
- `src/conversation/ConversationSurface.tsx`
- `src/conversation/usePeppaConversation.ts`
- `lib/talk-to-peppa-prompt-style.ts`
- `src/testing/e2e-browser-mocks.ts`

Tests:

- `tests/account-deletion.test.mjs`
- `tests/app-routes.test.mjs`
- `tests/app-shell-ui.test.mjs`
- `tests/conversation-integration.test.mjs`
- `tests/conversation-ui.test.mjs`
- `tests/dub-api.test.mjs`
- `tests/dub-consent.test.mjs`
- `tests/dub-routing.test.mjs`
- `tests/dub-state.test.mjs`
- `tests/dub-ui.test.mjs`
- `tests/dub-worker.test.mjs`
- `tests/guardian-access-schema.test.mjs`
- `tests/guardian-access-worker.test.mjs`
- `tests/guardian-dubbing-settings.test.mjs`
- `tests/product-streamline.test.mjs`
- `tests/lifecycle/accessibility-lifecycle.test.mjs`
- `tests/lifecycle/app-lifecycle.test.mjs`
- `tests/e2e/conversation-helpers.ts`
- `tests/e2e/conversation-prompt-styles.spec.ts` (removed with the adult learner
  selector)
- `tests/e2e/conversation-states.spec.ts`
- `tests/e2e/dubbing.spec.ts`
- `tests/e2e/guardian-mode.spec.ts`

Documentation:

- `docs/design/product-experience.md`
- `docs/design/technical-architecture.md`
- `docs/superpowers/specs/2026-08-25-five-little-ducks-dubbing-design.md`
- `docs/superpowers/specs/2026-08-25-guardian-dubbing-consent-design.md`
- `docs/superpowers/plans/2026-08-25-guardian-dubbing-consent.md`
- `.superpowers/sdd/2026-08-25-guardian-dubbing-consent/final-fix-report.md`
- `.superpowers/sdd/2026-08-25-guardian-dubbing-consent/v2-integration-report.md`

## Self-review

- Verified no diff from current main in the mandated v2-wholesale files:
  `dub-script.ts`, `DubTakeWaveform.tsx`, `DuckScene.tsx`, `dub-waveform.ts`,
  `worker/dub-storage.ts`, guide/static audio assets, and their v2-only tests.
- Audited `worker/dubs.ts` against current main rather than trusting its textual
  auto-merge. The consent changes are additive around v2 marker/CAS/range/
  envelope/pacing/upload-nonce/legacy-retirement code.
- Searched the resolved tree for conflict markers, stale current v1 API paths,
  current nine-line counts, public consent-header authority, and learner adult
  controls. Remaining v1/nine/header mentions in active tests and storage are
  intentional legacy-retirement or negative-policy assertions. The original
  v1 implementation plan remains a historical artifact; the consent plan now
  labels that distinction and uses current v2 paths/counts.
- Confirmed status is 24 lines, line 24 is accepted, line 25 is rejected, and
  old v1-prefix data cannot become a saved v2 line after grant.
- Confirmed the learner UI has no consent, password, reset, or deletion action;
  the guardian UI owns the single destructive action.
- `git diff --check` and the staged diff check are clean.

## Concerns and rollout

- Migration `0011_guardian_dub_consent` must be deployed before the
  consent-aware Worker. This ordering is required for fail-closed availability.
- Lint still reports the two unrelated warnings in generated
  `worker-configuration.d.ts`; build still reports the existing non-failing
  chunk-size advisory.
- No unresolved product or architecture choice appeared during integration.

## Fix Round 1 — review closure

### Status and changes

PASS. Round 1 closes every Critical, Important, and Minor review finding plus
the requested high-value coverage gaps.

- Added `worker/dub-route.ts` as the single raw, canonical v2 route parser used
  by both the dub domain and central guardian policy. Percent-encoded aliases
  of the current root or consent route are rejected with a private production-
  shaped 404 after authentication and before the domain handler, whether the
  session is locked or unlocked. The domain independently rejects the same
  aliases before any D1 or R2 mutation.
- Extended the no-grant upload test to spoof the current
  `guardian-voice-r2-v2` header as well as the retired v1 header. Added
  mutation-sensitive status/audio checks where consent becomes `revoking`
  during R2 work, and a failed arbitrary v1-prefix purge check proving D1 stays
  `revoking` until a successful retry converges.
- Preserved `DubNotEnabledError` for final-playback audio 403
  `dubbing_not_enabled` and 409 `dub_consent_revoking` responses. `DuckDub`
  now reuses one consent-loss transition for upload and final playback: it
  cancels/stops media, clears pending blobs, object URLs, saved lines, and
  errors, disables recording, and returns to the child-readable unavailable
  intro with no futile replay action.
- Added explicit post-mutation focus restoration to the newly authoritative
  guardian state heading after grant, failed revoke/cleanup, and successful
  cleanup. Initial and ordinary status loads do not request focus.
- Expanded object-URL lifecycle coverage to consent-loss cleanup and unmount,
  with exact create/revoke pairing assertions.
- The browser mock now returns `{ error: "not_found", message: "not_found" }`
  with `Cache-Control: private, no-store` for obsolete v1 and out-of-range v2
  paths. Focused Playwright asserts both v1 root/consent and v2 line-25
  upload/audio routes.
- Expanded guardian responsive Playwright to `complete`, `not-granted`, and
  cleanup-required/`revoking` states at 280x568, 390x844, and 640x360,
  including header containment, scroll reachability, action containment, and
  horizontal overflow.
- Corrected the v2 design: consent grant does not lock guardian mode; the
  separate **Switch to learner and start dubbing** handoff locks before
  learner navigation.

### TDD evidence

- Encoded-route RED: the first focused routing/Worker run was 70/71, with the
  locked encoded root `DELETE` reaching the handler as 204. The narrower
  central-plus-domain run then showed both destructive aliases failing (1/3
  passed, 2 failed). After the shared route contract, both regressions passed.
- Final-playback RED: the new 403/409 typed-error playback test failed because
  it received `DubLinePlaybackError`; after the API/playback change it passed
  for both statuses. The mounted learner regression likewise first remained
  on **Watch my dub** with a generic retry, then passed for both statuses after
  the shared cleanup transition.
- Focus RED: grant, failed cleanup, and cleanup completion all left focus on
  `BODY` (0/3). The post-commit state-heading focus mechanism passed 3/3 and
  the test also proves initial load leaves focus on `BODY`.
- Browser mock RED: obsolete/out-of-range requests initially escaped the mock
  and returned non-production bodies. After the mock fallback and an explicit
  app-readiness boundary, the path contract passed. The new responsive matrix
  passed 9/9.
- The spoofed-current-header, mid-R2 revocation, legacy purge retry, and object-
  URL tests characterized already-correct privacy/lifecycle behavior and were
  green when introduced; no unnecessary production rewrite followed.

Focused GREEN totals:

- Backend schema/consent/routing/guardian/Worker/account deletion: 104/104.
- Dub API/state/UI/playback/waveform/static audio plus guardian routes/settings/
  shell/lifecycle: 225/225.
- Dubbing plus guardian-mode Playwright: 63/63.
- Final direct obsolete-v1/line-25 browser-mock check: 1/1.

### Round 1 files

- `worker/dub-route.ts` (new)
- `worker/dubs.ts`
- `worker/guardian-access.ts`
- `worker/index.ts`
- `src/dubbing/dub-api.ts`
- `src/dubbing/dub-playback.ts`
- `src/dubbing/DuckDub.tsx`
- `src/dubbing/GuardianDubbingSettings.tsx`
- `src/testing/e2e-browser-mocks.ts`
- `tests/dub-routing.test.mjs`
- `tests/dub-worker.test.mjs`
- `tests/dub-playback.test.mjs`
- `tests/dub-ui.test.mjs`
- `tests/guardian-dubbing-settings.test.mjs`
- `tests/e2e/dubbing.spec.ts`
- `docs/superpowers/specs/2026-08-25-five-little-ducks-dubbing-design.md`

### Ordered full gates after Round 1

1. `npm test` — exit 0; 964 tests, 104 suites, 964 passed, 0 failed.
2. `npm run lint` — exit 0; 0 errors and the same two generated-file warnings
   in `worker-configuration.d.ts`.
3. `npm run build` — exit 0; TypeScript passed and Vite built 1,906 modules;
   the existing non-failing large-chunk advisory remains.
4. `npm run test:browser` — exit 0; 448 passed, 0 failed in 1.8 minutes.

### Round 1 self-review and concerns

- Reviewed every amended production, test, mock, and design path. The route
  contract accepts only raw canonical v2 identifiers; encoded aliases cannot
  cross a different central/domain interpretation. Obsolete v1 paths remain
  authenticated private 404s and never become guardian mutations.
- Rechecked playback abort/close behavior, pending-blob and object-URL cleanup,
  state reset, and the absence of learner adult/destructive controls.
- Rechecked focus ownership: only an authoritative mutation increments the
  one-shot focus request; initial/retry status loads cannot trigger it.
- Searched for conflict markers, stale current v1 API use, current nine-line
  counts, learner grown-up/delete controls, and loss of guide/waveform/range/
  envelope/pacing/legacy-retirement behavior. Remaining v1 paths are
  intentional historical-plan text or negative/retirement tests.
- `git diff --check` is clean. No new product or architecture decision and no
  new rollout concern appeared. The two generated lint warnings and Vite
  chunk-size advisory remain the only non-failing concerns.
