# Multiple Learner Rollout

This release must ship in two production phases. The compatibility floor is an
external deployment record stored in the GitHub repository variable
`MULTI_LEARNER_COMPATIBILITY_DEPLOYED`. Never try to write that SHA into its own
commit: amending or rebuilding the commit would change the SHA you are trying to
record.

Use the checked-in `Deploy to Cloudflare Workers` workflow in
`.github/workflows/deploy-cloudflare.yml` for both releases. Run the workflow
with `media_only=false`, or let its `main` push trigger deploy the checked-in
commit.

## Phase 1: Deploy the compatibility commit with 0012 and flag 0

1. Check out the compatibility release commit and record its SHA:

   ```bash
   git rev-parse HEAD
   ```

2. Confirm this exact commit is still the compatibility Worker floor:
   `migrations/0012_multi_learner_expand.sql` is present,
   `migrations/0013_multi_learner_enable.sql` is absent, and
   `MULTI_LEARNER_PROFILES_ENABLED` remains `"0"` in the checked-in Worker
   configuration.
3. Deploy that exact commit with the existing GitHub Actions workflow in
   `.github/workflows/deploy-cloudflare.yml`.

## Phase 2: Verify `/api/build-info` reports that exact commit and run the singleton smoke checks

1. Verify production reports the same backend commit SHA that `git rev-parse HEAD`
   printed in Phase 1:

   ```bash
   curl -fsS https://parrotbook.com/api/build-info
   ```

   Confirm `backend.commitSha` matches the Phase 1 SHA.
2. Confirm remote D1 has applied only the compatibility migration set:

   ```bash
   npx wrangler d1 migrations list parrot-english --remote
   ```

3. Run the existing singleton smoke checks before any enable release:
   Guardian unlock, the single active learner profile, learner profile edits,
   lesson playback, conversations, personalized story art, and dubbing must all
   behave exactly as they did before multi-learner enablement.

## Phase 3: Set the GitHub repository variable to that SHA

1. Store the verified compatibility SHA as the durable external deployment
   record in the repository variable
   `MULTI_LEARNER_COMPATIBILITY_DEPLOYED`.
2. If you use the GitHub CLI, this is:

   ```bash
   gh variable set MULTI_LEARNER_COMPATIBILITY_DEPLOYED --body "<phase-1-sha>"
   ```

3. If you set the variable in the GitHub UI instead, double-check the saved
   value matches the SHA from `git rev-parse HEAD` and `/api/build-info`
   exactly.

## Phase 4: Deploy the enable commit with 0013 and flag 1

1. Move to the future enable release commit, where
   `migrations/0013_multi_learner_enable.sql` is present and
   `MULTI_LEARNER_PROFILES_ENABLED` is `"1"`.
2. Deploy that commit with the same `.github/workflows/deploy-cloudflare.yml`
   workflow.
3. The workflow now runs
   `scripts/verify-multi-learner-compatibility-release.mjs` before `Apply D1
   migrations`; it will fail unless
   `MULTI_LEARNER_COMPATIBILITY_DEPLOYED` resolves to an ancestor commit that
   contains `0012` but not `0013`.
4. After deployment, rerun `/api/build-info` and
   `wrangler d1 migrations list parrot-english --remote` to confirm production
   reports the enable commit and D1 has applied `0013`.

## Phase 5: Never roll back below the recorded floor after 0013 applies

1. Once `0013` has applied in production, treat
   `MULTI_LEARNER_COMPATIBILITY_DEPLOYED` as the lowest safe rollback point.
2. Do not redeploy, revert, or restore any commit older than that recorded
   compatibility SHA.
3. If a hotfix is needed after Phase 4, branch from the current production line
   or cherry-pick onto a commit at or above the recorded floor.
