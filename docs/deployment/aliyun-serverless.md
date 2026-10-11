# Alibaba serverless pilot

**Deployment blocked:** Alibaba's current documentation excludes RDS PostgreSQL
Serverless from SSL/TLS support. The purchased empty pilot cannot meet this
backend's verified-TLS requirement. Do not disable TLS to deploy it. Select and
approve a TLS-capable database replacement before completing the setup below.

## Development cost requirements

This environment is rarely accessed. Prefer compute that stops when idle:

- Keep Function Compute provisioned instances at zero, with on-demand scaling
  and a two-request concurrency cap. The prepared configuration does this;
  the function has not yet been deployed.
- Select a database that can automatically pause or scale to zero. Verify both
  its pause behavior and authenticated TLS against the actual endpoint before
  deploying learner APIs.
- Avoid dedicated virtual machines, idle cache servers, paid NAT gateways and
  scheduled requests that keep the function or database warm.
- Persistent data storage, backups and any plan fees can still bill while
  compute is stopped. Scale to zero does not mean all costs are zero.

The empty RDS pilot was released on October 12, 2026, with user approval.
`DeleteDBInstance` succeeded and a subsequent instance lookup returned
`InvalidDBInstanceName.NotFound`. Its active compute and 20 GB instance storage
have been removed.

The earlier PolarDB PostgreSQL 16 Serverless quote (one primary capped at 1 PCU,
zero read-only nodes, single availability zone, PSL4 storage) was CNY 0.20 per
hour for database compute with a 50% discount. Its configuration offers no
automatic pause, so this proposal is no longer being pursued for development.

PolarDB PostgreSQL Agentic Database is under investigation instead. Alibaba's
documentation advertises scale to zero, a Hangzhou public preview and free use
during that preview, without an SLA. The creation page is now accessible, but
its Hangzhou quote displays CNY 0.000–5.600 per hour, with no visible discount.
The pricing drawer shows CNY 1.40 for database PCU usage. This conflicts with the
free-preview documentation and must be resolved before purchase. The two existing
pilot subnets (zones J and B) both report insufficient capacity. Trusted TLS and
live pause/resume behavior are not yet verified.
Its official MCP package uses a private-CA SQL proxy and defaults to
disabling certificate verification; do not use that default for this backend.
Obtain a trusted CA before connecting. No AgenticDB cluster has been created.
The user approved `AliyunServiceRoleForPolarDB`; the role and its managed policy
were created, and PolarDB's `CheckServiceLinkedRole` returned true. Firefox
recognized the role and exposed the creation link after the Codex console kept
showing a stale authorization notice. The creation link also opens in Codex.

The China pilot uses ESA Pages for the frontend, Function Compute for the API,
and PostgreSQL for account and learner data. It requires a new database;
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

Use Node.js 24 and a disposable PostgreSQL 16 or 17 database on localhost:

```sh
npm ci
PARROT_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/parrot_aliyun_test npm run test:aliyun
npm run build:aliyun
```

The test creates and removes its own database schema. It exercises sign-up,
sign-in, guest sessions, guardian access, learner creation, consent generations,
concurrent final-learner deletion, account deletion, batch rollback, conditional recording writes,
byte ranges, rate limits, and multiple response cookies. CI runs it using a
PostgreSQL service alongside the existing tests. The deployment workflow checks
PostgreSQL 16 to match the proposed PolarDB version; the existing verify workflow
also checks PostgreSQL 17.

## Cloud setup and approvals

1. Select a TLS-capable PostgreSQL product and check its exact edition's feature
   support before purchase. RDS PostgreSQL Serverless is excluded from TLS
   support and must not be used with this backend. PolarDB PostgreSQL supports
   cloud certificates; its live endpoint still needs verification after setup.
2. Approve the replacement's actual cost before purchase and release of the
   empty, incompatible RDS pilot. The original approval does not cover a new
   product or a changed ongoing cost. Recheck the final quote and discounts.
3. Place PostgreSQL and Function Compute in the same VPC and switch. Restrict
   the database whitelist to the Function Compute subnet. Do not enable a public database
   endpoint. Create a pilot database and a dedicated application database user.
4. Enable database TLS and obtain its CA from the instance console. Apply the baseline
   from a trusted client inside that VPC. The runtime requires verified TLS and
   fails to start without its CA.
5. The prepared `.github/workflows/deploy-aliyun-pilot.yml` provides direct GitHub
   deployment using Alibaba's official OIDC action and temporary credentials.
   It stays disabled until `ALIYUN_CHINA_DEPLOY_ENABLED=true` is set. Its database
   CA and network configuration use repository variables prefixed
   `ALIYUN_CHINA_`; auth, database and edge credentials use repository secrets
   with that prefix. Restrict the RAM deployment role to this repository's
   approved branches and this pilot function. The OIDC provider alone grants no
   deployment access. The role, secrets and live deployment are still pending.
   Alternatively, import `patrickchin/parrot-english` in Function Compute's Serverless Application
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
[RDS TLS excludes Serverless](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance),
[PolarDB PostgreSQL TLS](https://help.aliyun.com/en/polardb/polardb-for-postgresql/use-cloud-certificates-to-configure-ssl-encryption),
[PolarDB serverless prices](https://help.aliyun.com/zh/polardb/polardb-for-postgresql/serverless-cost-description),
[AgenticDB scale to zero](https://help.aliyun.com/zh/polardb/polardb-for-postgresql/what-is-polardb-agentic-postgresql),
[AgenticDB public preview](https://help.aliyun.com/en/polardb/polardb-for-postgresql/polardb-agentic-postgresql-public-beta),
[AgenticDB official MCP](https://help.aliyun.com/zh/polardb/polardb-for-postgresql/access-polardb-postgresql-agentic-database-via-mcp-server),
[RDS auto-pause latency](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-the-automatic-start-and-stop-feature-for-a-serverless-apsaradb-rds-for-postgresql-instance),
[Function Compute Git deployment](https://help.aliyun.com/en/functioncompute/use-serverless-application-center-to-implement-ci-cd-on-existing-projects),
[ESA function variables](https://help.aliyun.com/en/edge-security-acceleration/esa/user-guide/function-variable),
[ESA client IP](https://help.aliyun.com/en/edge-security-acceleration/dcdn/user-guide/identify-request-information),
[HTTP trigger limits](https://help.aliyun.com/en/functioncompute/http-triggers-overview),
[OSS conditional PUT limitation](https://help.aliyun.com/en/oss/user-guide/0017-00000245).
