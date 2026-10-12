# Alibaba serverless pilot

The China pilot uses ESA Pages, Function Compute and a new **plain PolarDB MySQL
Serverless 8.0.2** database in Hangzhou. The backend and frontend are deployed
from GitHub. Private TLS, baseline initialization, actual database idle pause,
and an ESA session request have been verified. Browser guest access and the
complete account/recording flow still need live validation.

## Development cost and idle behavior

Use one primary node capped at 1 PCU, no read-only nodes, no standby cluster,
PSL4 storage billed on actual use, and automatic idle suspension. The observed
console quote was CNY 0.20 per active database-compute hour with a 50% discount.
It excludes proxy, storage and other usage charges; recheck the final quote and
obtain approval before purchase. Persistent storage and excess backups can bill
while compute is paused. At continuous activity, database compute alone would
be CNY 144 per 30-day month at that quote.

Use the **cluster endpoint**, not the primary endpoint, for automatic pause.
Set its idle delay to the smallest supported setting (currently five minutes)
and verify actual pause/resume after deployment. The API closes its database
connections before returning each response, because Function Compute may freeze
an idle timer after the response. A cold visit may need to wait for the database.

Keep Function Compute provisioned instances at zero and concurrent requests
capped at two. Do not add a VM, paid NAT gateway, cache server or keep-warm task.
The VPC, switches and security group already exist. Function Compute uses a
zone J switch; the selected database quote uses zone B in the same VPC.

The incompatible, empty RDS PostgreSQL Serverless pilot was released with user
approval on October 12, 2026. That edition excludes TLS. PolarDB PostgreSQL's
always-running option and AgenticDB's unresolved preview billing are superseded
by this plain MySQL choice. No AgenticDB cluster has been created and no support
request was sent. `AliyunServiceRoleForPolarDB` exists with user approval.

## Database compatibility and initialization

`backend/mysql.mjs` implements the application's existing Drizzle/D1 query
contract for MySQL. It translates only SQL used by this application, including
conditional conflict targets and SQLite functions. MySQL has no `RETURNING`;
the adapter selects and modifies locked rows in the same transaction. It also
preserves SQLite's simultaneous assignment semantics for consent generations.
A database row lock serializes mutation batches for this rare-use pilot,
preserving the final-learner deletion guard. Sustained concurrent traffic would
warrant a native MySQL repository with finer locking.

Generate `backend/mysql-baseline.sql` with
`node scripts/build-aliyun-mysql-schema.mjs`. The generator applies the SQLite
migration history in memory and exports a MySQL baseline with CHECK constraints,
foreign keys, case-sensitive indexes and a shared guest account with Sam. MySQL
8.0.2 is chosen because its documented community compatibility includes 8.0.18;
8.0.1's older compatibility does not provide the required CHECK enforcement.
Existing Cloudflare accounts and recordings are not copied.

For the first deployment, set `ALIYUN_CHINA_INITIALIZE_DATABASE=true`. The custom
runtime applies the baseline **inside the private VPC** before listening. It uses
an advisory initialization lock, refuses a non-empty database without a known
migration marker, and writes the marker last. A concurrent initializer skips
only a completed known baseline. DDL is not rollbackable: partial initialization
requires inspection, not an automatic destructive retry. Verify that the actual
PolarDB endpoint supports the advisory lock before declaring deployment ready.
After live initialization is verified, set the flag back to false and redeploy.
Future changes need reviewed MySQL migrations for databases containing data.

Private recording clips remain in SQL for this pilot, with a 16 MiB object
limit, byte ranges and atomic conditional writes. A later OSS migration should
retain the conditional-write index and store immutable payloads in OSS; direct
OSS writes do not provide all the R2 conditions used by consent/deletion fences.

## Public media on ESA

`npm run build:esa` enables China-only media URLs before Vite computes its
output hashes, then copies the referenced public artwork into the static
package under `/china-media`. Constructed story paths and responsive variants
are included. The web manifest is rewritten in the built output. Authoring
catalogs and the normal outside-China build retain their original URLs.

The copier accepts only versioned public paths on `media.parrotbook.com`,
rejects redirects, private paths, empty responses and incorrect content types,
caps individual downloads at 25 MB, and checks the 2,000-file / 1 GB package
limits. It records source URLs, byte sizes and SHA-256 checksums in the local
`build/esa-media-inventory.json`. No existing source media is overwritten.
The checked build contains 466 mirrored files and 1,238 total files, about
64 MB. Its HTML, JavaScript and web manifest have no foreign media-origin
references. A representative image was rendered from the local same-origin
path in the browser; the ESA GitHub build has deployed the package.

The existing ESA GitHub build uses this command, so no separate media bucket
or manual upload is required for the pilot. Build-time downloads still use the
existing public source; learner recordings are never copied by this script.

## Local and CI verification

Use Node.js 24 and a disposable local MySQL 8.0.18 container. The integration
test creates and drops its own database and refuses non-local test hosts.

```sh
npm ci
node scripts/prepare-aliyun-mysql-test-tls.mjs DISPOSABLE_CONTAINER /tmp/mysql-test-ca.pem
PARROT_TEST_DATABASE_URL=mysql://root:disposable-test-password@127.0.0.1:3306/parrot_aliyun_test \
PARROT_TEST_DATABASE_CA_PATH=/tmp/mysql-test-ca.pem npm run test:aliyun
npm run build:aliyun
```

The TLS preparation script accepts only the named disposable MySQL 8.0.18
container with the fixture password. It installs a localhost certificate signed
by that container's CA; it must never be used on a cloud database.

Checks cover authentication, cookies, guest sessions, guardian and learner
access, consent generations, concurrent final-learner deletion, account deletion,
batch rollback, conflict-target uniqueness, CHECK/FK enforcement, conditional
recording writes, pagination, byte ranges and rate limits. Runtime TLS tests
prove encrypted connections and reject untrusted CAs, mismatched hostnames and
IP-based URLs. CI runs these alongside the existing application/browser checks.

## Cloud deployment

1. Recheck and approve the final MySQL quote. Select Hangzhou, Serverless,
   MySQL 8.0.2 Enterprise, one primary at 1 PCU, zero replicas, single AZ, PSL4,
   idle suspension and the pilot VPC. Do not accept fixed-size defaults restored
   when the purchase page reloads.
2. Create a separate pilot database and dedicated application user. Use only a
   private cluster endpoint and restrict its whitelist to the Function Compute
   subnet (10.42.2.0/24). Enable TLS for that endpoint and download its CA.
   `DATABASE_URL` requires a DNS hostname, credentials and one database name,
   without query options. Certificate-chain and hostname verification are
   mandatory. The legacy `RDS_CA_PATH` name identifies the packaged database CA
   and does not restrict the runtime to an RDS product.
3. Store `ALIYUN_CHINA_DATABASE_URL`, `ALIYUN_CHINA_AUTH_SECRET`,
   `ALIYUN_CHINA_TURNSTILE_SECRET_KEY` and `ALIYUN_CHINA_EDGE_SECRET` as GitHub
   secrets. Store `ALIYUN_CHINA_DATABASE_CA_PEM` and `ALIYUN_CHINA_AUTH_URL` as
   repository variables. Auth and edge secrets must each have at least 32
   characters. Network and OIDC role variables are already saved. Never print
   resolved deployment configuration or commit credentials.
4. The GitHub workflow `.github/workflows/deploy-aliyun-pilot.yml` obtains
   temporary Alibaba credentials using the official OIDC action. The
   `parrot-github-china-deploy` role trusts only `main` and
   `codex/aliyun-serverless-backend` in `patrickchin/parrot-english`. Its policy
   allows only the Hangzhou pilot function, its scaling/concurrency and
   `esa-gateway` trigger; it grants no database, network or RAM administration.
   It can also pass the dedicated CAPTCHA verification role to this function.
   The GitHub deployment has successfully assumed this exact role. If
   Serverless Devs needs temporary code-upload permissions, inspect the actual
   denied action and add only the necessary permission.
5. Set the one-time initialization flag and then
   `ALIYUN_CHINA_DEPLOY_ENABLED=true` when the cloud database, CA and isolated
   secrets are ready. The workflow checks MySQL, packages the API plus an
   official checksum-verified Linux Node runtime, and deploys the checked-out
   GitHub commit with `s.aliyun.yaml`. There is no manual ZIP upload. Cloud
   deployment is enabled for the isolated pilot. Initialization succeeded in
   the live private database and is now disabled.
6. Configure the ESA pilot with `entry: "./backend/esa-gateway.mjs"`, retaining
   static assets and SPA fallback. Its encrypted `PARROT_EDGE_SECRET` must match
   Function Compute, and `PARROT_BACKEND_URL` must point to the Hangzhou function.
   The gateway uses ESA's third `fetch` parameter for environment variables.
   Set `VITE_ALIYUN_CAPTCHA_SCENE_ID` and `VITE_ALIYUN_CAPTCHA_PREFIX` on ESA,
   and `ALIYUN_CHINA_CAPTCHA_SCENE_ID` and `ALIYUN_CHINA_CAPTCHA_ROLE_ARN` in
   GitHub. Environment changes require a new ESA build to take effect.
7. Verify actual TLS and baseline initialization, direct-function rejection,
   multiple cookies, sign-in, learner/guardian access, consent, recording writes
   and deletion through ESA. Prove the platform supplies `Ali-Cdn-Real-Ip` and
   cannot be spoofed by the caller. The gateway overwrites forwarded IP and edge
   authentication headers and rejects a request missing the platform IP.
   Finally verify the database pauses after idle and resumes on a real request.
   Measure the first request after pause against ESA's documented 10-second
   gateway wait. Do not treat a direct Function Compute success as proof that
   the cold request works through ESA.

## Mainland CAPTCHA

Alibaba CAPTCHA 2.0 is activated with one production Web/H5 one-click scene.
At the approved quote, mainland verification costs CNY 0.005 per attempt;
up to three scenes have no base fee. Paid custom strategies, encryption mode,
and security-event features remain off. The frontend uses Alibaba's mainland
widget and sends its opaque proof to the backend. A dedicated Function Compute
role grants only CAPTCHA verification, using temporary credentials and the
Shanghai verification endpoint. No permanent cloud access key is required.

China signup and shared guest access require a genuine production success;
missing, invalid, oversized, expired, replayed and test-mode proofs are rejected.
Vendor errors fail closed. Live missing-proof and invalid-proof rejection have
been verified. Outside-China builds retain Cloudflare Turnstile.

This is an isolated preview. Built-in Function Compute domains are for testing;
a public mainland site needs an ICP-filed custom domain. Public media is now
deployed on ESA static hosting. Speech recognition and live tutoring still need
mainland replacements for Groq, LiveKit and OpenAI before describing the whole
application as hosted in mainland China. Those foreign service credentials are
not configured on the China pilot.

Sources: [PolarDB MySQL Serverless](https://help.aliyun.com/zh/polardb/polardb-for-mysql/user-guide/serverless/),
[automatic pause and endpoints](https://help.aliyun.com/document_detail/2621235.html),
[MySQL version compatibility](https://help.aliyun.com/document_detail/2536182.html),
[PolarDB MySQL TLS](https://help.aliyun.com/zh/polardb/polardb-for-mysql/user-guide/configure-ssl-encryption),
[compute pricing](https://help.aliyun.com/zh/polardb/polardb-for-mysql/compute-nodes),
[PSL4 storage](https://help.aliyun.com/zh/polardb/polardb-for-mysql/how-to-choose-between-psl4-and-psl5),
[RDS PostgreSQL Serverless TLS exclusion](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance),
[Function Compute permissions](https://help.aliyun.com/zh/functioncompute/policies-and-sample-policies),
[ESA function variables](https://help.aliyun.com/en/edge-security-acceleration/esa/user-guide/function-variable),
[ESA client IP](https://help.aliyun.com/en/edge-security-acceleration/dcdn/user-guide/identify-request-information),
[ESA Pages limits](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/what-is-functions-and-pages/),
[HTTP trigger limits](https://help.aliyun.com/en/functioncompute/http-triggers-overview).
