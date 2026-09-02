# Multiple Learner Rollout

> Personalized story generation and serving are retired. References below to
> legacy learners describe historical D1 migration roles only, not a live R2
> compatibility namespace. Current Workers use `PRIVATE_MEDIA_BUCKET` and the
> learner-scoped recording layout exclusively; do not copy, drain, or read the
> retired personalized-story-art recording keys.

## Purpose and Safety Floor

Multiple learner profiles must ship as two production releases. Cloudflare D1
applies every pending migration, so production must run the compatibility
Worker after `0012_multi_learner_expand.sql` and before it encounters
`0013_multi_learner_enable.sql`.

`0015_learner_profile_deletion.sql` is additive. It may be applied by the
compatibility release while roster mutations are disabled, but it must be
present before the enable Worker exposes individual learner deletion.

The exact compatibility commit deployed to production becomes the permanent
rollback floor. Record it outside Git in the GitHub repository variable
`MULTI_LEARNER_COMPATIBILITY_DEPLOYED`. Do not write the SHA into its own commit:
amending or rebuilding that commit changes the value being recorded.

The current merged tree is intentionally deployment-blocked: it contains
`0013_multi_learner_enable.sql` and enables multiple learners, but no eligible
guarded compatibility SHA has been deployed or recorded. This repository also
does not provide a traffic or account-deletion maintenance control. Merging the
feature code is not authorization to set the repository variable or deploy it.

The required order is:

1. Prepare and review, but do not merge, a follow-up main PR that removes exactly
   `migrations/0013_multi_learner_enable.sql` and sets
   `MULTI_LEARNER_PROFILES_ENABLED=0`, while retaining 0012, 0014, 0015, and
   the current private-media deletion closure and learner-deletion protocols.
2. Activate and verify an externally approved hold on account deletion and
   relevant traffic before merging the compatibility PR.
3. Merge that PR while the hold remains active. Capture its main merge SHA and
   follow the automatic main-push workflow as the compatibility deployment.
4. Before the first private-media deployment, verify that
   `parrot-english-private-media` and its preview bucket exist and that the
   Worker binding is `PRIVATE_MEDIA_BUCKET`. This cutover does not migrate old
   object keys.
5. Verify `/api/build-info`, migration state, and singleton smoke checks, then
   record that exact SHA in `MULTI_LEARNER_COMPATIBILITY_DEPLOYED`.
6. Release the external hold in a controlled step only after the compatible
   Worker verification and, when applicable, retirement-drain evidence are
   complete.
7. Merge a descendant main PR that restores exactly 0013 and
   `MULTI_LEARNER_PROFILES_ENABLED=1`; its automatic main-push workflow is the
   enable deployment.
8. Never roll back below the recorded compatibility SHA after 0013 applies.

The checked-in `Deploy to Cloudflare Workers` workflow in
`.github/workflows/deploy-cloudflare.yml` runs automatically on every main
push; that path performs the application deployment because `media_only` is
not enabled. Do not manually dispatch a duplicate workflow after either merge,
and do not apply migrations manually ahead of their corresponding Worker
release.

The Cloudflare Workers Builds Git integration for this Worker is disconnected
and must remain disconnected. This is the control that leaves the guarded
GitHub Actions workflow as the sole production deployment owner. The
repository's `prebuild` step is defense in depth only: it rejects a Workers CI
build when the branch is missing or is `main`, but Cloudflare configuration can
change the build command or its environment.

Do not reconnect the Git integration without an approved preview-only setup.
Its deploy command must upload an unpromoted version with
`npx wrangler versions upload`; then externally verify that both `main` and
feature-branch builds leave production traffic and routes unchanged before
using it. A passing repository prebuild check does not authorize or prove that
configuration.

## Ownership Invariants to Preserve

- Better Auth identifies the Guardian account.
- Each auth session has at most one selected learner; different sessions may
  select different learners.
- Any authenticated session may list its own profiles and select one it owns.
  Only a live session-specific Guardian grant may create or delete profiles or
  edit Guardian settings. The current temporary entry flow grants an
  authenticated session access without another password check; this weaker
  passwordless handoff does not remove authentication, ownership enforcement,
  or Guardian-only endpoint checks and is not the intended permanent boundary.
- Learner APIs resolve the selection on the server and never trust a
  browser-supplied profile ID.
- Profiles, onboarding, conversations, recording consent, and voice clips are
  learner-scoped.
- Authentication, Guardian grants, rate limits, the deletion tombstone, and
  whole-account deletion remain account- or session-scoped.
- Every learner uses
  `accounts/{user}/learners/{learner}/recordings/{nursery-rhymes|lessons}/`.
  There is no account-root, story-art, or earlier-format recording fallback.
- Individual learner deletion rejects the final usable learner, never
  auto-selects a sibling, and keeps an unfinished cleanup tombstoned and
  retryable. Whole-account deletion must include every completed or unfinished
  learner closure.

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
   names, profile IDs, R2 keys, recordings, prompts, or response bodies
   containing private content.

## Release 1: Compatibility Worker, `0012`, `0014`, and `0015`

### 1. Prepare and verify the compatibility PR without merging it

Prepare and review the follow-up main PR described above, but do not merge it
yet. From its reviewed head, verify the intended compatibility tree:

```bash
export PARROT_COMPATIBILITY_PR_HEAD="$(git rev-parse HEAD)"
git show --check "$PARROT_COMPATIBILITY_PR_HEAD"
test -f migrations/0012_multi_learner_expand.sql
test -f migrations/0014_personalized_art_deletion_closure.sql
test -f migrations/0015_learner_profile_deletion.sql
test ! -f migrations/0013_multi_learner_enable.sql
rg '"MULTI_LEARNER_PROFILES_ENABLED": "0"' wrangler.jsonc
```

The deployable compatibility merge SHA does not exist yet. Do not set
`PARROT_COMPATIBILITY_SHA` from the PR head; capture it only after the held
merge in step 3.

The commit must contain the compatibility Worker as well as `0012`. It must:

- resolve the selected learner centrally;
- write `learner_profile_id` on new learner-owned records;
- recognize null-profile compatibility rows only for the marked legacy
  learner;
- retain the old singleton tables and unique indexes;
- preserve the shipped private-media deletion closure for the current account
  and learner prefixes before user deletion can cascade;
- keep profile creation, selection, and deletion mutations disabled.

`0014_personalized_art_deletion_closure.sql` is intentionally a new migration;
do not amend the already-staged `0012`. The compatibility revision includes
0014 while omitting 0013, so Wrangler can apply the additive deletion-closure
column before the cardinality-enabling migration is introduced.

Do not merge until the next step's external hold is active and verified.

### 2. Activate and verify the external hold

Before merging the compatibility PR, activate an externally approved
control that holds account deletion and relevant traffic. No such control is
checked into this repository. Verify through the approved operational path
that the hold is effective, and record that evidence without private account
or learner data. Keep the hold active throughout migration application, Worker
deployment, the one-time retirement drain when applicable, and every
compatibility verification below.

Do not merge the PR if the hold is absent or unverified. Its main push starts
the workflow automatically, and the old Worker can otherwise accept an account
deletion while D1 migrations and the compatible Worker deployment are still
in progress.

### 3. Merge the PR and follow its automatic compatibility deployment

With the verified hold still active, merge the compatibility PR into main. The
main push automatically starts `Deploy to Cloudflare Workers`; treat that run
as the compatibility deployment. Fetch main and capture the exact merge SHA:

```bash
git fetch origin main
export PARROT_COMPATIBILITY_SHA="$(git rev-parse origin/main)"
git show --check "$PARROT_COMPATIBILITY_SHA"
```

Confirm the automatic workflow run is attached to that exact SHA and preserve
its URL. Do not manually dispatch a second run. After its dependency and
static-media steps, the workflow builds, runs the compatibility guard, applies
pending D1 migrations, and deploys the Worker. For this release the guard is a
no-op because `0013` is absent. Do not substitute a rebuilt or cherry-picked
commit after capturing the merge SHA.

The private-media cutover is intentionally one-way. Before its first production
deployment, verify that the production and preview buckets exist and the built
Worker exposes only `PRIVATE_MEDIA_BUCKET`. Do not copy objects from the old
personalized-story-art bucket: current reads require the new learner-scoped key
layout and the current recording envelopes. Do not deploy a pre-cutover Worker
after recordings begin in the new bucket.

After the new Worker is verified, confirm no old revision is serving or in
flight and that rollback will not target an old-bucket revision. Then retire
both old buckets in the Cloudflare dashboard: use **Settings → Empty Bucket**,
wait for the background purge to finish, verify the bucket is empty, and delete
it. The equivalent final CLI commands are:

```bash
npx wrangler r2 bucket delete parrot-english-personalized-story-art
npx wrangler r2 bucket delete parrot-english-personalized-story-art-preview
```

Do not empty either bucket before the cutover is verified; the currently
deployed pre-cutover Worker can still write there. Record the empty-and-delete
result in the release evidence so unreachable trial recordings do not outlive
the prototype.

### 4. Verify the deployed compatibility commit

Verify that production reports the exact merge SHA captured in step 3:

```bash
curl -fsS https://parrotbook.com/api/build-info
```

`backend.commitSha` must equal `PARROT_COMPATIBILITY_SHA`. A successful workflow
run is not sufficient if the build-info value differs.

Confirm remote D1 reports `0012`, `0014`, and `0015` as applied and `0013` as
pending or absent:

```bash
npx wrangler d1 migrations list parrot-english --remote
```

Run read-only integrity checks appropriate to the production console. At
minimum, confirm each live account has one marked legacy profile and no
learner-owned child row was lost during backfill. Do not print profile content
or learner names into the release log.

### 5. Run singleton compatibility smoke checks

Use a nonproduction test account that had data before `0012`:

1. Sign in and open Guardian mode through the current automatic, passwordless
   session grant. Confirm a genuine grant failure stays visible with Retry.
2. Confirm the existing learner profile and onboarding status are unchanged.
3. Edit and reload the learner profile.
4. Load and play a built-in lesson.
5. Start and finish a conversation path that is enabled in the environment.
6. Check Five Little Ducks status and replay an existing saved line after
   consent. Open Old MacDonald and confirm the same existing consent authorizes
   its status route. Do not re-record production learner audio for a smoke test.
7. Confirm the Guardian dashboard and profile Back/Cancel/Save routes return
   to Guardian pages without locking the session.
8. Confirm profile creation, selection, and deletion mutation endpoints are
   still disabled while the flag is `"0"`.

Stop here if any migrated D1 data is missing, a learner route exposes Guardian
controls, or a Guardian route is stranded. Do not record the compatibility SHA
until the compatibility release itself is healthy.

### 6. Record the verified rollback floor

Set the repository variable only after build-info, D1, and smoke checks pass:

```bash
gh variable set MULTI_LEARNER_COMPATIBILITY_DEPLOYED \
  --body "$PARROT_COMPATIBILITY_SHA"
```

Read the variable back in the repository settings or with an authorized GitHub
CLI command and compare it byte-for-byte with `/api/build-info`. This value is
the durable proof that production ran the compatibility Worker before `0013`.
Do not replace it with the later enable commit.

### 7. Release the external hold

Release the externally approved hold in a controlled operational step only
after the compatible Worker SHA, migration state, singleton smoke checks, and
recorded rollback-floor variable have all been verified, together with the
one-time old-revision drain when deploying the retirement. Confirm ordinary
traffic resumes through the compatible Worker. Do not exercise a real account
deletion merely to test the release.

## Release 2: Enable Worker and `0013`

### 1. Prepare and verify the enable PR

The enable release is a new descendant main PR that restores exactly 0013 and
the feature flag after the compatibility SHA is recorded. Before merging,
verify its reviewed head:

```bash
export PARROT_ENABLE_PR_HEAD="$(git rev-parse HEAD)"
test -f migrations/0012_multi_learner_expand.sql
test -f migrations/0013_multi_learner_enable.sql
test -f migrations/0014_personalized_art_deletion_closure.sql
test -f migrations/0015_learner_profile_deletion.sql
rg '"MULTI_LEARNER_PROFILES_ENABLED": "1"' wrangler.jsonc
git merge-base --is-ancestor "$PARROT_COMPATIBILITY_SHA" "$PARROT_ENABLE_PR_HEAD"
MULTI_LEARNER_COMPATIBILITY_DEPLOYED="$PARROT_COMPATIBILITY_SHA" \
  ./scripts/verify-multi-learner-compatibility-release.mjs
```

The verification script fails if the repository variable is empty, does not
resolve to an ancestor, lacks any of `0012`, `0014`, or `0015`, or already
contains `0013`. Repeat the full local gates on the reviewed enable PR head
before merging it.

### 2. Merge the enable PR and follow its automatic deployment

Merge the reviewed enable PR into main. Its main push automatically starts
`Deploy to Cloudflare Workers`; treat that run as the enable deployment. Fetch
main and capture the exact merge SHA while following that workflow run:

```bash
git fetch origin main
export PARROT_ENABLE_SHA="$(git rev-parse origin/main)"
git show --check "$PARROT_ENABLE_SHA"
git merge-base --is-ancestor "$PARROT_COMPATIBILITY_SHA" "$PARROT_ENABLE_SHA"
```

Confirm the automatic workflow run is attached to `PARROT_ENABLE_SHA`. Do not
manually dispatch a second run. The `Verify multi-learner compatibility
release` step runs before `Apply D1 migrations`. It prevents an accidental
one-shot rollout; it does not replace Release 1.

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
`0012`, `0013`, `0014`, and `0015` as applied.

Use controlled test profiles to verify:

1. Direct `/guardian/learners` entry automatically obtains a fresh 15-minute
   Guardian grant for the authenticated session without a password prompt;
   genuine access failure remains on the route with Retry.
2. The roster lists only profiles owned by that account in stable creation
   order.
3. Adding a preferred name creates an incomplete learner and opens its details
   flow without changing the session's learner-mode selection.
4. Manage learners contains only Add, Edit, and Delete. `Switch to learner`
   and the learner account menu open the shared `Who is learning now?` chooser
   with one direct learner button per owned profile; choosing that button is the
   complete selection action and persists through reload, while a second
   signed-in session can keep a different active learner.
5. Missing, stale, and foreign selections fail closed. A multi-learner session
   with no selection immediately shows the required owned-profile picker in
   learner mode with no Cancel path or Guardian grant.
6. Profile details, onboarding, conversations, story level, each learner's
   cross-rhyme dubbing consent, and voice clips for both rhyme routes remain
   isolated between two sibling learners.
7. Delete one disposable inactive learner with the Guardian-only confirmation,
   then refresh and confirm it stays removed. Reject deletion of the final
   usable learner with `409 last_learner`.
8. Delete the active disposable learner and confirm the selection is cleared,
   Guardian navigation still works, no sibling is auto-selected, and the next
   switch opens the chooser. Simulate or use an approved test hook for a cleanup
   failure; refresh, confirm the pending learner is excluded from chooser and
   settings targets, then finish deletion with the same-ID retry.
9. A conversation remains bound to the learner that created it after the
   session selects a sibling.
10. Both learners write only below their own
    `accounts/{user}/learners/{learner}/recordings/` prefixes. Confirm that raw
    or earlier-format dub objects are not reported as saved, and deleting one
    disposable learner does not sweep a sibling's prefix.
11. Outside the owned-profile chooser, learner mode contains no sibling name,
    Guardian dashboard, roster, editing, authoring, consent, privacy, sign-out,
    or deletion control. Neither Five
    Little Ducks nor Old MacDonald contains a grown-up checkbox; missing shared
    consent shows only the learner-safe grown-up gateway. Grant once in Guardian
    dubbing settings, confirm both routes authorize status and audio, and save
    one disposable clip in each. Revoke once and confirm both routes fail closed
    during shared cleanup; if cleanup is interrupted, finish it through the one
    retry action, then regrant and confirm both statuses contain no saved clips.
12. Every Guardian page exposes a dashboard recovery path, invalid internal
    Guardian return targets fall back to `/guardian`, post-login Guardian
    targets normalize to learner home, and mode-aware wildcard routing returns
    to the correct home.

Do not exercise whole-account deletion against a production account as a smoke
test. Its every-learner R2 sweep and upload fences are covered by the automated
account-deletion suite.

## Observability During Both Releases

Cloudflare Worker observability is enabled in `wrangler.jsonc`. Establish the
normal request/error baseline before each release, watch the deployment in real
time, and continue monitoring through at least the 15-minute Guardian-grant
window and a representative new-session window. The current implementation does
not define bespoke multi-learner counters, so the minimum evidence is platform
request/log data, controlled smoke-test observations, and the read-only
integrity checks below.

Watch these signals without logging learner content:

- `/api/build-info` commit SHA and deployment metadata;
- D1 migration state and migration-step failures;
- latency and status distribution for `/api/learner-profiles`,
  `/api/learner-profile`, `/api/conversations`, and status, audio, and upload
  paths under both
  `/api/dubs/five-little-ducks-v2` and `/api/dubs/old-macdonald-v1`, plus their
  shared consent and reset operations;
- unexpected increases in `5xx`, database constraint failures, invalid stored
  roster responses, R2 deletion failures, and client retry loops;
- `403 guardian_required` outside an expected locked-session attempt;
- `409 learner_selection_required`, which is expected for a fresh
  multi-learner session but suspicious if it rises for already-selected or
  single-learner sessions;
- selection/create/delete failures, pending-cleanup retries, final-learner and
  learner-busy conflicts, stale-selection suppression, and profile reload
  failures observed during the controlled browser smoke tests;
- account deletion retries or incomplete learner-storage closures.

Use aggregate counts, status codes, latency buckets, deployment IDs, and opaque
request IDs only. Do not log account passwords, learner or sibling names,
profile answers, private media, prompts, consent bodies, or R2 object keys.

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
  (SELECT count(*) FROM conversation_session WHERE learner_profile_id IS NULL)
    AS conversations_without_learner;
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

Do not restore the old R2 binding or deploy a Worker that expects story-art or
account-root recording keys. Roll back only to a reviewed revision that binds
`PRIVATE_MEDIA_BUCKET`, understands the current learner namespaces, and accepts
the strict v2 dub envelope. Whole-account deletion must continue to close the
account prefix before the Better Auth user row is removed.

## Completion Record

The rollout is complete only when the release record contains:

- the exact compatibility SHA reported by production;
- the unchanged `MULTI_LEARNER_COMPATIBILITY_DEPLOYED` value;
- the exact enable SHA reported by production;
- remote D1 evidence for `0012`, `0014`, and `0015`, then `0013`;
- passing local gate summaries for both reviewed releases;
- singleton compatibility and multi-learner isolation smoke results;
- an observability review with no unresolved ownership, navigation, or private
  media errors;
- the named operator and time window for any rollback decision.
