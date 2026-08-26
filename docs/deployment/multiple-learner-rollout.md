# Multiple Learner Rollout

## Purpose and Safety Floor

Multiple learner profiles must ship as two production releases. Cloudflare D1
applies every pending migration, so production must run the compatibility
Worker after `0012_multi_learner_expand.sql` and before it encounters
`0013_multi_learner_enable.sql`.

The exact compatibility commit deployed to production becomes the permanent
rollback floor. Record it outside Git in the GitHub repository variable
`MULTI_LEARNER_COMPATIBILITY_DEPLOYED`. Do not write the SHA into its own commit:
amending or rebuilding that commit changes the value being recorded.

The required order is:

1. Deploy the compatibility commit with 0012 and MULTI_LEARNER_PROFILES_ENABLED=0.
2. Verify /api/build-info reports that exact commit and run the singleton smoke checks.
3. Set repository variable MULTI_LEARNER_COMPATIBILITY_DEPLOYED to that commit SHA.
4. Deploy the enable commit containing 0013 and MULTI_LEARNER_PROFILES_ENABLED=1.
5. Never roll back below the recorded compatibility SHA after 0013 applies.

Use the checked-in `Deploy to Cloudflare Workers` workflow in
`.github/workflows/deploy-cloudflare.yml` for both application releases. Run it
with `media_only=false`. Do not apply either migration manually ahead of its
corresponding Worker release.

## Ownership Invariants to Preserve

- Better Auth identifies the Guardian account.
- Each auth session has at most one selected learner; different sessions may
  select different learners.
- Only a live session-specific Guardian unlock may list, create, or select
  profiles. Guardian unlock uses the same account password used to sign in;
  there is no separate Guardian password or PIN.
- Learner APIs resolve the selection on the server and never trust a
  browser-supplied profile ID.
- Profiles, onboarding, lessons, conversations, personalized art, dubbing
  consent, and voice clips are learner-scoped.
- Authentication, Guardian unlock, rate limits, the deletion tombstone, and
  whole-account deletion remain account- or session-scoped.
- The marked legacy learner retains existing data and exact historical R2
  keys. New learners use profile-prefixed R2 namespaces.
- Individual learner deletion is not part of this release. Whole-account
  deletion must cover every learner namespace.

## Before Either Release

1. Confirm the production operator has permission to run the GitHub workflow,
   read Worker observability, inspect D1 migration status, and update the GitHub
   repository variable.
2. Confirm the checkout has complete Git history; the deployment guard uses
   ancestry and tree-object checks.
3. Run the required gates from the release checkout, in order:

   ```bash
   npm ci
   npm test
   npm run lint
   npm run build
   npm run test:browser
   ```

4. Preserve the command summaries, workflow run URL, deployed commit SHA,
   `/api/build-info` response, D1 migration listing, smoke-test results, and any
   rollback decision in the release record. Do not include passwords, learner
   names, profile IDs, R2 keys, photos, recordings, prompts, or response bodies
   containing private content.

## Release 1: Compatibility Worker and `0012`

### 1. Identify the exact compatibility commit

Check out the latest reviewed commit before the enable migration was added and
record its immutable SHA:

```bash
export PARROT_COMPATIBILITY_SHA="$(git rev-parse HEAD)"
git show --check "$PARROT_COMPATIBILITY_SHA"
test -f migrations/0012_multi_learner_expand.sql
test ! -f migrations/0013_multi_learner_enable.sql
rg '"MULTI_LEARNER_PROFILES_ENABLED": "0"' wrangler.jsonc
```

The commit must contain the compatibility Worker as well as `0012`. It must:

- resolve the selected learner centrally;
- write `learner_profile_id` on new learner-owned records;
- recognize null-profile compatibility rows only for the marked legacy
  learner;
- retain the old singleton tables and unique indexes;
- keep profile creation and selection mutations disabled.

Do not substitute a rebuilt or cherry-picked commit after recording the SHA.

### 2. Deploy the exact compatibility commit

Run the existing GitHub Actions workflow against a branch or tag that resolves
exactly to `PARROT_COMPATIBILITY_SHA`. If a release tag is used, verify it
before dispatch:

```bash
git rev-parse <compatibility-release-ref>
git rev-parse "$PARROT_COMPATIBILITY_SHA"
```

Those values must match. Dispatch `Deploy to Cloudflare Workers` with
`media_only=false`. After its dependency and static-media steps, the workflow
builds, runs the compatibility guard, applies pending D1 migrations, and
deploys the Worker. For this release the guard is a no-op because `0013` is
absent.

### 3. Verify the deployed compatibility commit

Verify that production reports the exact SHA from step 1:

```bash
curl -fsS https://parrotbook.com/api/build-info
```

`backend.commitSha` must equal `PARROT_COMPATIBILITY_SHA`. A successful workflow
run is not sufficient if the build-info value differs.

Confirm remote D1 reports `0012` as applied and `0013` as pending or absent:

```bash
npx wrangler d1 migrations list parrot-english --remote
```

Run read-only integrity checks appropriate to the production console. At
minimum, confirm each live account has one marked legacy profile and no
learner-owned child row was lost during backfill. Do not print profile content
or learner names into the release log.

### 4. Run singleton compatibility smoke checks

Use a nonproduction test account that had data before `0012`:

1. Sign in and unlock Guardian mode with the account password.
2. Confirm the existing learner profile and onboarding status are unchanged.
3. Edit and reload the learner profile.
4. Load and play the learner's saved custom lessons.
5. Start and finish a conversation path that is enabled in the environment.
6. Load existing personalized story art and confirm its exact stored object is
   still served through the authenticated asset route.
7. Check Five Little Ducks status and replay an existing saved line after
   consent. Do not re-record production learner audio for a smoke test.
8. Confirm the Guardian dashboard, profile Back/Cancel/Save, and lesson
   authoring Back/Save routes return to Guardian pages without locking the
   session.
9. Confirm profile creation and selection mutation endpoints are still disabled
   while the flag is `"0"`.

Stop here if any legacy data is missing, a learner route exposes Guardian
controls, or a Guardian route is stranded. Do not record the compatibility SHA
until the compatibility release itself is healthy.

### 5. Record the verified rollback floor

Set the repository variable only after build-info, D1, and smoke checks pass:

```bash
gh variable set MULTI_LEARNER_COMPATIBILITY_DEPLOYED \
  --body "$PARROT_COMPATIBILITY_SHA"
```

Read the variable back in the repository settings or with an authorized GitHub
CLI command and compare it byte-for-byte with `/api/build-info`. This value is
the durable proof that production ran the compatibility Worker before `0013`.
Do not replace it with the later enable commit.

## Release 2: Enable Worker and `0013`

### 1. Verify the enable checkout

The enable release must descend from the recorded compatibility commit and
contain both migrations with the feature flag enabled:

```bash
export PARROT_ENABLE_SHA="$(git rev-parse HEAD)"
test -f migrations/0012_multi_learner_expand.sql
test -f migrations/0013_multi_learner_enable.sql
rg '"MULTI_LEARNER_PROFILES_ENABLED": "1"' wrangler.jsonc
git merge-base --is-ancestor "$PARROT_COMPATIBILITY_SHA" "$PARROT_ENABLE_SHA"
MULTI_LEARNER_COMPATIBILITY_DEPLOYED="$PARROT_COMPATIBILITY_SHA" \
  ./scripts/verify-multi-learner-compatibility-release.mjs
```

The verification script fails if the repository variable is empty, does not
resolve to an ancestor, lacks `0012`, or already contains `0013`. Repeat the
full local gates after resolving the final enable commit SHA.

### 2. Deploy the enable commit

Dispatch the same `Deploy to Cloudflare Workers` workflow with
`media_only=false`. The `Verify multi-learner compatibility release` step runs
before `Apply D1 migrations`. It prevents an accidental one-shot rollout; it
does not replace Release 1.

`0013_multi_learner_enable.sql` repeats every expansion backfill to catch writes
from the deploy gap, fails if learner-owned rows or eligible single-profile
sessions remain unmapped, then removes the singleton uniqueness constraints.
The Worker deploy follows only if migration application succeeds.

### 3. Verify the enabled deployment

Confirm the new build and migration state:

```bash
curl -fsS https://parrotbook.com/api/build-info
npx wrangler d1 migrations list parrot-english --remote
```

`backend.commitSha` must equal `PARROT_ENABLE_SHA`, and remote D1 must report
both `0012` and `0013` as applied.

Use controlled test profiles to verify:

1. `/guardian/learners` requires a fresh Guardian unlock.
2. The roster lists only profiles owned by that account in stable creation
   order.
3. Adding a preferred name creates an incomplete learner, selects it for only
   the current session, and opens its details flow.
4. Selecting another learner persists through reload; a second signed-in
   session can keep a different active learner.
5. Missing, stale, and foreign selections fail closed. A multi-learner session
   with no selection shows only `Ask a grown-up to choose a learner` in learner
   mode and exposes the roster only after Guardian unlock.
6. Profile details, onboarding, saved lessons, conversations, story level,
   personalized art, dubbing consent, and voice clips remain isolated between
   two sibling learners.
7. A conversation remains bound to the learner that created it after the
   session selects a sibling.
8. The migrated legacy learner still reads its existing art key and legacy dub
   namespace; a new learner cannot probe either.
9. Learner mode contains no sibling name, Guardian dashboard, roster, editing,
   authoring, consent, privacy, sign-out, or deletion control. Five Little
   Ducks contains no grown-up checkbox; missing consent shows only the
   learner-safe grown-up gateway.
10. Every Guardian page exposes a dashboard recovery path, invalid Guardian
    return targets fall back to `/guardian`, and mode-aware wildcard routing
    returns to the correct home.

Do not exercise whole-account deletion against a production account as a smoke
test. Its every-learner R2 sweep and upload fences are covered by the automated
account-deletion suite.

## Observability During Both Releases

Cloudflare Worker observability is enabled in `wrangler.jsonc`. Establish the
normal request/error baseline before each release, watch the deployment in real
time, and continue monitoring through at least the 15-minute Guardian-unlock
window and a representative new-session window. The current implementation does
not define bespoke multi-learner counters, so the minimum evidence is platform
request/log data, controlled smoke-test observations, and the read-only
integrity checks below.

Watch these signals without logging learner content:

- `/api/build-info` commit SHA and deployment metadata;
- D1 migration state and migration-step failures;
- latency and status distribution for `/api/learner-profiles`,
  `/api/learner-profile`, `/api/lessons/my`, `/api/conversations`, personalized
  story-art routes, and Five Little Ducks routes;
- unexpected increases in `5xx`, database constraint failures, invalid stored
  roster responses, R2 generation/deletion failures, and client retry loops;
- `403 guardian_required` outside an expected locked-session attempt;
- `409 learner_selection_required`, which is expected for a fresh
  multi-learner session but suspicious if it rises for already-selected or
  single-learner sessions;
- selection/create failures, stale-selection suppression, and profile reload
  failures observed during the controlled browser smoke tests;
- account deletion retries or incomplete learner-storage closures.

Use aggregate counts, status codes, latency buckets, deployment IDs, and opaque
request IDs only. Do not log account passwords, learner or sibling names,
profile answers, source/generated images, audio bytes, prompts, consent bodies,
or R2 object keys.

Useful read-only post-enable D1 checks include an invalid-selection count and
unmapped-child counts. They must all be zero:

```sql
SELECT count(*) AS invalid_selections
FROM session_learner_selection AS selection
LEFT JOIN session
  ON session.id = selection.session_id
 AND session.user_id = selection.auth_user_id
LEFT JOIN learner_profile
  ON learner_profile.id = selection.learner_profile_id
 AND learner_profile.auth_user_id = selection.auth_user_id
WHERE session.id IS NULL OR learner_profile.id IS NULL;

SELECT
  (SELECT count(*) FROM learner_lesson WHERE learner_profile_id IS NULL)
    AS lessons_without_learner,
  (SELECT count(*) FROM conversation_session WHERE learner_profile_id IS NULL)
    AS conversations_without_learner,
  (SELECT count(*) FROM personalized_story_art WHERE learner_profile_id IS NULL)
    AS art_without_learner;
```

Run production queries only through the approved read-only operational path.
Do not paste row-level results into tickets or chat.

## Rollback and Incident Rules

### Before `0012` applies

Use the ordinary pre-release rollback process. No multi-learner schema has
reached production.

### After `0012` but before `0013`

Redeploy the verified compatibility commit with
`MULTI_LEARNER_PROFILES_ENABLED="0"`. `0012` is additive and deliberately
retains the old singleton structures, but the reviewed compatibility commit is
the preferred recovery target because it understands selections and migration
gap writes. Do not delete the expansion tables or reverse the backfill during
an application rollback.

### If the enable workflow fails while applying `0013`

The workflow stops before deploying the enable Worker. Keep the compatibility
Worker live, inspect `wrangler d1 migrations list parrot-english --remote`, and
determine which statements Cloudflare recorded. Do not rerun blindly and do not
apply ad hoc destructive SQL. Repair with a reviewed forward migration or
operational recovery plan.

### After `0013` applies

Never deploy a Worker older than `MULTI_LEARNER_COMPATIBILITY_DEPLOYED`. Older
Workers depend on singleton conflict targets removed by `0013` and cannot
safely interpret multiple learners.

Do not attempt an automatic down migration. If the problem is limited to
roster mutations, prepare and review a hotfix at or above the compatibility
floor with `MULTI_LEARNER_PROFILES_ENABLED="0"`, then deploy it through the same
workflow. This freezes `POST` and `PUT` roster mutations; it is not a complete
UX rollback, and fresh sessions with multiple learners may still require a
selection. If reads or ownership are suspect, stop the affected feature paths
at the Worker, preserve D1 and R2 evidence, and recover through a reviewed
forward fix.

Do not delete new learner-prefixed R2 objects during rollback. The compatibility
Worker and account-deletion path understand the new namespaces. Whole-account
deletion must continue to enumerate every learner and persist every dub closure
before the Better Auth user row is removed.

## Completion Record

The rollout is complete only when the release record contains:

- the exact compatibility SHA reported by production;
- the unchanged `MULTI_LEARNER_COMPATIBILITY_DEPLOYED` value;
- the exact enable SHA reported by production;
- remote D1 evidence for `0012` then `0013`;
- passing local gate summaries for both reviewed releases;
- singleton compatibility and multi-learner isolation smoke results;
- an observability review with no unresolved ownership, navigation, or private
  media errors;
- the named operator and time window for any rollback decision.
