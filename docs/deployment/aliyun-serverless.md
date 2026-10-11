# Alibaba serverless pilot

The China pilot uses ESA Pages for the frontend, Function Compute for the API,
and RDS PostgreSQL for account and learner data. It requires a new database;
existing Cloudflare users and recordings are not migrated by this setup.
The current outside-China deployment uses Cloudflare D1, a hosted SQLite service.

## Database compatibility

`backend/postgres.mjs` keeps the application's existing Drizzle D1 query contract
while executing its queries on PostgreSQL. It translates the SQL constructs used
by this application, including parameter placeholders and conflict targets.
It is not a general SQLite emulator. PostgreSQL batches use a transaction and
an advisory lock to preserve the final-learner deletion guard.

Generate the baseline with `node scripts/build-aliyun-schema.mjs`. The generator
applies the SQLite migration history in memory and exports the final schema for
an empty PostgreSQL database. Apply `backend/postgres-baseline.sql` once to the
new pilot database with TLS verification enabled. It seeds only the shared guest
account. It does not copy existing users. Future schema changes need a reviewed
PostgreSQL migration for a database that already contains pilot data.

Private recording clips are stored in PostgreSQL for this pilot, with a 16 MiB
object limit and atomic conditional writes. A later OSS migration should retain
the PostgreSQL conditional-write index and place immutable payloads in OSS.
Direct OSS PutObject calls do not support the R2 conditions used by the app's
consent and deletion fences.

## Local verification

Use Node.js 24 and a disposable PostgreSQL 17 database on localhost:

```sh
npm ci
PARROT_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/parrot_aliyun_test npm run test:aliyun
npm run build:aliyun
```

The test creates and removes its own database schema. It exercises sign-up,
sign-in, guest sessions, guardian access, learner creation, consent generations,
concurrent final-learner deletion, account deletion, batch rollback, conditional recording writes,
byte ranges, rate limits, and multiple response cookies. CI runs it using a
PostgreSQL service alongside the existing tests.

## Cloud setup and approvals

1. Approve the RDS network service role shown in the console. The dialog names
   `AliyunServiceRoleForRdsPgsqlOnEcs`, which attaches network interfaces for
   private database connectivity. Inspect any additional role separately.
2. Approve the cost before purchasing RDS. Select Hangzhou, PostgreSQL 17,
   Serverless Basic, ESSD PL1, 20 GB, minimum 0.5 RCU, maximum 1 RCU, and enable
   automatic start and stop. The October 12, 2026 console quote displayed
   approximately CNY 0.10–0.18 per running hour with a 50% promotion. Continuous
   operation at those displayed rates would be about CNY 72–130 per 30 days.
   Auto-pause stops compute billing after ten minutes without connections;
   storage continues billing. The first connection after a pause can take minutes
   while RDS wakes up. The pilot returns an unavailable response with a 60-second
   retry hint when the connection times out; this delay needs a live check before
   learner use. These are estimates, not a spending cap. Recheck
   the final quote and promotion terms before purchase. Function Compute,
   traffic, and excess backups can add charges.
3. Place RDS and Function Compute in the same VPC and switch. Restrict the RDS
   whitelist to the Function Compute subnet. Do not enable a public database
   endpoint. Create a pilot database and a dedicated application database user.
4. Enable RDS TLS and obtain its CA from the instance console. Apply the baseline
   from a trusted client inside that VPC. The runtime requires verified TLS and
   fails to start without its CA.
5. Import `patrickchin/parrot-english` in Function Compute's Serverless Application
   Center, scoped to this repository. Use the pilot branch and `s.aliyun.yaml`.
   Review the requested GitHub and Alibaba permissions before granting access;
   ESA's existing GitHub authorization is a separate integration.
6. Configure the build pipeline for Node 24, run `npm ci`, then
   `RDS_CA_PATH=/path/to/rds-ca.pem npm run build:aliyun:package`. The script
   packages a checksum-verified official Linux Node binary and the API bundle.
   Serverless Devs deploys this directory automatically; no manual ZIP upload is
   part of the workflow. Use `s deploy -t s.aliyun.yaml` as the deployment step.
7. Supply these encrypted pipeline variables: `DATABASE_URL` (without query options), `BETTER_AUTH_URL`,
   `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `PARROT_EDGE_SECRET`. Supply
   `PARROT_VPC_ID`, `PARROT_VSWITCH_ID`, `PARROT_SECURITY_GROUP_ID`, and
   `PARROT_BACKEND_COMMIT_SHA` as configuration. Both auth and edge secrets must
   contain at least 32 characters. The pipeline sets the function environment;
   do not write secrets into Git or print resolved deployment configuration.
   Keep provisioned instances at zero and limit on-demand instances to two in
   the Function Compute scaling configuration before allowing pilot traffic.
8. Use a separate ESA pilot project, or staging configuration, with
   `entry: "./backend/esa-gateway.mjs"` in its build configuration. Retain the
   existing static assets and SPA fallback. The gateway uses ESA's third `fetch`
   parameter for variables. Set encrypted `PARROT_EDGE_SECRET` and
   `PARROT_BACKEND_URL` to the Hangzhou function URL, with the same edge secret
   as Function Compute. Configure a Turnstile widget for the pilot hostname and
   build the frontend with its `VITE_TURNSTILE_SITE_KEY`.
9. Verify the platform-supplied `Ali-Cdn-Real-Ip` header before release, including
   a request attempting to spoof it. The gateway replaces the application's
   Cloudflare IP header and rejects requests if the platform header is absent.
   Check cookies, sign-in, guardian access, recording consent, and deletion from
   the ESA preview. Reject direct unauthenticated requests to the function URL.

This setup is an isolated preview. Function Compute's built-in domains are for
testing; a public mainland website needs an ICP-filed custom domain. The app's
existing public media, CAPTCHA, LiveKit, OpenAI, and Groq integrations are separate
from this API/database pilot and have not been moved to mainland infrastructure.

Sources: [RDS serverless creation](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/create-a-serverless-apsaradb-rds-for-postgresql-instance),
[RDS auto-pause latency](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-the-automatic-start-and-stop-feature-for-a-serverless-apsaradb-rds-for-postgresql-instance),
[Function Compute Git deployment](https://help.aliyun.com/en/functioncompute/use-serverless-application-center-to-implement-ci-cd-on-existing-projects),
[ESA function variables](https://help.aliyun.com/en/edge-security-acceleration/esa/user-guide/function-variable),
[ESA client IP](https://help.aliyun.com/en/edge-security-acceleration/dcdn/user-guide/identify-request-information),
[HTTP trigger limits](https://help.aliyun.com/en/functioncompute/http-triggers-overview),
[OSS conditional PUT limitation](https://help.aliyun.com/en/oss/user-guide/0017-00000245).
