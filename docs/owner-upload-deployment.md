# Owner upload API deployment

Updated 2026-11-16. Both native FC APIs and the ESA player are deployed and
verified from merged main revision
`ee6fc7ab7322a98ddef302c89f8bc94cb7e21280`. API workflow
[43809621870](https://github.com/patrickchin/parrot-english/actions/runs/43809621870)
passed function, runtime-role, concurrency-one, revision, and unchanged owner
authentication readbacks. Player workflow
[43809621843](https://github.com/patrickchin/parrot-english/actions/runs/43809621843)
and ESA build `189354688290940` succeeded; public `/api/health` matched at
2026-11-16 05:24:47 UTC.

The sole owner HTTP trigger uses native Bearer authentication. Missing/invalid
tokens return 403, and unauthenticated apex/www preflights return 204. Hosted
guest API and Chromium/WebKit upload, playback, and removal checks passed.
Custom HTTPS and authenticated hosted owner CRUD acceptance remain before
endpoint enablement: `/api/owner-config` and `/api/share-config` intentionally
return 503. Both API DNS-only CNAMEs exist; two free DigiCert instances have been
ordered, but verified contact/location and certificate issuance are pending.
Automatic OSS lifecycle cleanup is deliberately disabled by Patrick's decision.

The existing **21 packs / 128 scenes**, all uploaded by Patrick, are published
independently. See the [release board](release/README.md),
[hosted sharing evidence](release/hosted-share-verification.md), and
[deployment decision and setup history](release/api-deployment-decision.md).

## Storage and execution

ESA continues to serve the player and owner upload page. One Alibaba Function
Compute (FC) function in `cn-hongkong` serves the owner API. The existing OSS
bucket `parrotbook-media-f6e09412` holds all media and structured content:

| OSS key | Access and purpose |
| --- | --- |
| `clips/*` | Existing public media; read only to this function |
| `content/uploads/<upl_id>/*` | Private upload state and direct browser uploads |
| `content/releases/<upl_id>/*` | Published pack metadata, scenes, waveforms, and media |
| `content/catalog.json` | Public discovery entry point, replaced last with `no-store` |
| `content/owner-packs.json` | Private, `no-store` management index retaining hidden packs |

Learner drafts stay in the browser; optional guest sharing requires an explicit
upload action as described below. There is no database, public upload account,
media proxy, or media in either code bundle. Browser uploads go
directly to OSS using short-lived signed URLs. FC reads metadata and media HEAD
responses and copies objects within OSS before publishing the catalog.

The dedicated API is necessary because the current ESA Functions and Pages
runtime permits four fetch subrequests **per execution**, and its gateway waits
only ten seconds for a response. Batch validation needs more storage calls.
See [ESA limits](https://www.alibabacloud.com/help/en/edge-security-acceleration/esa/user-guide/what-is-functions-and-pages/).

## Deployment source and GitHub Actions

[Deploy APIs](../.github/workflows/deploy-api.yml) builds the selected merged
`patrickchin/parrot-english` main revision on a GitHub-hosted Node 20 runner.
It runs the compiled API tests and packages code/dependencies without media.
The player retains its separate ESA Git-source deployment. Do not run API
production deployment from a local checkout or feature branch.

The workflow uses the existing `parrot-github-actions` OIDC provider with the
separate `parrotbook-fc-github-main` role. Trust requires the exact GitHub issuer,
`sts.aliyuncs.com` audience, and this repository's `refs/heads/main` subject.
No static AccessKey or broad Alibaba-to-GitHub grant is used. Workflow variables
are `API_OIDC_PROVIDER_ARN`, `API_DEPLOY_ROLE_ARN`,
`OWNER_API_EXECUTION_ROLE_ARN`, and `SHARE_API_EXECUTION_ROLE_ARN`.

The workflow pins Serverless Devs 3.1.10 and FC3 0.1.26, verifies the descriptor
matches only the two reviewed functions, and supplies temporary credentials to
the native CLI through its documented child-process environment. It explicitly
captures stdout/stderr so provider failures cannot print native trigger tokens.
The deployment role can update only these functions and the guest trigger; it
cannot modify the owner's native trigger or write OSS data.

Initial bootstrap is complete. For a new approved environment only,
`bootstrap=true` first creates the functions without a guest trigger and verifies
both global reserved concurrency caps equal one, then adds the guest trigger.
It leaves the owner trigger absent for separate native Bearer setup. Bootstrap
is resumable after a partial creation; it is not the normal redeployment path.
Normal deployments require the existing protected owner trigger and quotas,
compare its exact configuration before/after, and verify function settings,
runtime roles, revision, and quotas by native readback.

Full `s deploy --template s.yaml --assume-yes` is intentional: `--function`
skips concurrency configuration. The pinned native trigger reconciler updates
only declared triggers and preserves the undeclared manual owner trigger.
The deployment gate enforces that preservation in memory without logging its
secret configuration. See [trigger reconciler](https://github.com/devsapp/fc3/blob/master/src/subCommands/deploy/impl/trigger.ts)
and [selection behavior](https://github.com/devsapp/fc3/blob/master/src/subCommands/deploy/index.ts).

Native owner Bearer setup and guest hosted acceptance are complete. Finish
custom HTTPS and owner acceptance below before enabling the public API URLs in
ESA. A successful build alone does not certify every hosted behavior. Native
readbacks use pinned Alibaba CLI 3.5.3 with a 30-second read timeout, two retries
for read-only GETs, and a 45-second total subprocess budget; the deployment
history records the resolved provider-read timeout failure.

## Function and execution role

Historical preflight, 2026-11-14: the known OSS bucket was verified in the
intended account. At that time Hong Kong had no FC3 functions or Parrotbook
custom domains; the project runtime/deployment roles did not exist; the bucket
was unversioned with GET/HEAD CORS only and no lifecycle configuration. No cloud
configuration changed during that read-only preflight. These are historical
observations, superseded by the 2026-11-16 setup and release receipts above.

The two runtime roles and separate main-only deployment role were created and
verified on 2026-11-16. Both functions now exist with their intended settings and
reserved concurrency one; the owner trigger is protected and preserved across
the successful deployment. OSS PUT CORS is configured. The approved merged-main
CI path above supersedes the earlier Application Center bootstrap proposal.
The separate ESA deployment role is not repurposed.

The deployed owner function is `parrotbook-owner-packs`: `nodejs20`, `index.handler`,
512 MiB, 120-second timeout, code only from `api/dist`. It uses one concurrent
invocation and has function reserved concurrency **1**. Do not add provisioned
instances, another publisher function, VPC, NAS, or a database.

The native Node runtime processes one invocation per instance. FC's
`instanceConcurrency` override is documented for custom runtimes; changing only
that setting does not cap the number of instances. The function-level quota is
essential. Read it back using `GetConcurrencyConfig` and require
`reservedConcurrency: 1`. See [function instance quotas](https://help.aliyun.com/zh/functioncompute/overview-of-configuring-the-maximum-number-of-on-demand-instances),
[concurrency API](https://help.aliyun.com/zh/functioncompute/api-fc-2023-03-30-putconcurrencyconfig),
and [FC3 YAML](https://docs.serverless-devs.com/user-guide/aliyun/fc3/spec/).

The dedicated `parrotbook-owner-packs-runtime` RAM role is trusted by
**Function Compute / FC** and uses
[`execution-policy.json`](../infrastructure/owner-api/execution-policy.json).
Its ARN is provided through `OWNER_API_EXECUTION_ROLE_ARN`. This policy grants
GetObject only on this project's `content/*` and `clips/*`, and PutObject only on uploads,
releases, the catalog, and the exact private management key
`content/owner-packs.json`. It grants no listing, deletion, bucket configuration,
or access to other projects. The separate deployment role is limited to the two
reviewed functions and scoped deployment actions; it can pass only their two
runtime roles. Do not broaden a runtime role to handle deployment.

FC assumes the execution role and supplies temporary credentials per request as
`context.credentials.accessKeyId`, `accessKeySecret`, and `securityToken`. The
SDK uses `stsToken: securityToken`. No static cloud credentials belong in the
browser, function environment, or repository. See [function roles](https://www.alibabacloud.com/help/en/functioncompute/grant-function-compute-permissions-to-access-other-alibaba-cloud-services)
and [Node context](https://www.alibabacloud.com/help/en/functioncompute/context-1-1).

## Native authentication, HTTPS, and CORS

The descriptor deliberately does **not** manage the owner HTTP trigger. Its
sole `owner-http` trigger was created in the FC console using native opaque
Bearer authentication and read back with `authType: bearer`, an enabled token,
and `GET`, `POST`, `PATCH`, `DELETE`, and `OPTIONS`. The successful API deployment
preserved its exact configuration. Keep tokens private and do not log trigger
configuration. Never accept a deployment that removes the trigger or makes
owner mutations anonymous; do not replace native authentication with a custom
password/session store.

Both exact player origins, `https://parrotbook.com` and
`https://www.parrotbook.com`, pass unauthenticated owner OPTIONS with 204 through
the native testing endpoint; missing/invalid Bearer tokens return 403. The owner
handler provides exact-origin CORS via `OWNER_API_ORIGINS`, a JSON array
defaulting to `["https://parrotbook.com","https://www.parrotbook.com"]`. It echoes
only the matched origin with `Vary: Origin`, allows `GET`, `POST`, `PATCH`,
`DELETE` and `Authorization, Content-Type`, and returns preflight without OSS
access. Foreign origins or unexpected methods/headers are rejected. CORS does
not authenticate mutations. Authenticated management and the custom-domain
browser path still need acceptance.

OSS already has a PUT CORS rule for both exact player origins and signed-upload
headers, while preserving public GET/HEAD CORS. Native readback and hosted
API/OSS preflight checks passed; real Chromium/WebKit guest PUT uploads passed.
Preserve `Content-Type` and `x-oss-object-acl` support (and `Content-MD5` if
supplied). OSS handles browser OPTIONS through bucket CORS. Expose ETag if a
client needs to read it.

Custom HTTPS remains:

1. Complete the required verified CA contact and actual location, then issue
   the two already ordered free DigiCert RSA2048 Basic certificates. Add their
   DNS validation challenges and record the actual issued NotAfter dates.
   Allocated certificate instances are not issued certificates.
2. Create native FC custom domains `owner-api.parrotbook.com` and
   `share-api.parrotbook.com`, installing the corresponding certificates and
   routing `/*` to their respective existing functions. The two DNS-only CNAMEs
   to `1263482499936169.cn-hongkong.fc.aliyuncs.com` are already saved and
   independently resolved; Cloudflare remains authoritative. No FC custom
   HTTPS domain has been created yet. The built-in `fcapp.run` domains remain
   testing endpoints.
3. Protect the owner custom domain with native Bearer authentication and allow
   its five required methods. Keep the guest domain anonymous and separate.
   Verify the actual domain authentication, routing, TLS, exact-origin browser
   preflight, and authenticated methods; do not assume trigger authentication
   automatically protects a custom domain.

The bucket is public-read, so each staging upload must explicitly sign
`x-oss-object-acl: private`. Release copies must explicitly use their intended
public/default ACL. PutObject and CopyObject support these ACL headers under
their object-write operations; the separate PutObjectACL API is not used, so
`oss:PutObjectAcl` is not granted. See [native Bearer setup](https://help.aliyun.com/zh/functioncompute/enable-bearer-authentication-for-an-http-trigger),
[custom-domain Bearer](https://help.aliyun.com/zh/functioncompute/configure-bearer-authentication-for-custom-domain-names),
[HTTP trigger/CORS limits](https://help.aliyun.com/zh/functioncompute/http-triggers-overview),
[signed uploads](https://help.aliyun.com/zh/oss/developer-reference/upload-objects-using-a-signed-url-generated-with-oss-sdk-for-node-js),
[PutObject permissions](https://help.aliyun.com/zh/oss/developer-reference/putobject/),
and [CopyObject permissions](https://help.aliyun.com/zh/oss/developer-reference/copyobject/).

## Acceptance before enabling the owner page

Deployment/native readbacks, missing/invalid-token rejection, apex/www owner
preflight, and OSS PUT CORS are already verified. Authenticated hosted owner
CRUD and the custom HTTPS path are still mandatory before enabling the page.
Use a disposable pack and keep its Bearer token in ephemeral browser/runner
memory; never save it, signed URLs, or private recordings in release evidence.

- Confirm authenticated `/session` returns the deployed `OWNER_API_REVISION`.
  Check custom-domain TLS, routing, native Bearer protection, and both exact
  player origins in a browser. Missing and invalid credentials must be rejected
  before the handler on the custom domain and every accessible trigger URL;
  the provider's verified rejection status is 403. Verify valid authentication
  and unauthenticated OPTIONS without exposing an anonymous mutation path.
- Initialize an upload, PUT a file directly to OSS with the supplied exact
  signed headers, and verify anonymous GET to that staging object is denied.
  Exercise a failed upload and retry, then publish the complete valid pack.
  Check release files/media, public catalog, Packs discovery/search, scene load,
  playback, and recording. Retry publication and verify its idempotent result.
- List the disposable pack in owner management, hide it, confirm it is absent
  from discovery but retained in management, show it again, then delete it.
  Confirm deletion removes its catalog and management entries and preserves
  unrelated packs. Immutable/shared pack files and media remain stored.
- Exercise both the private browser page and the CLI against the same serialized
  API. Recheck the public catalog after cleanup and record only non-secret
  revision, authentication, domain, quota, and status evidence.

The initial uploader-complete catalog prerequisite was fulfilled by the
2026-11-14 content publication: 21 packs / 128 scenes, all uploaded by Patrick.
That one-time publication used the then-current main CLI before the new feature
was enabled. The owner API is now the **sole application catalog writer**:
`npm run content:publish` and removal use `OWNER_API_URL` and `OWNER_API_TOKEN`
to call it. Default publication merges and preserves unrelated packs;
`--replace-catalog` is explicit. Do not restore a parallel direct OSS CLI writer.
Administrative bucket writes can bypass serialization and are outside the
application's single-writer guarantee.

OSS PutObject does not support If-Match/If-None-Match catalog CAS. Serialization
is therefore a correctness requirement, not a throughput optimization. Media
copies use the supported `x-oss-copy-source-if-match` condition so a still-valid
upload URL cannot change the copied bytes after validation. See [unsupported
PutObject preconditions](https://help.aliyun.com/zh/oss/user-guide/0017-00000245)
and [CopyObject source preconditions](https://help.aliyun.com/zh/oss/developer-reference/copyobject/).

For full hosted regression coverage, also exercise malformed metadata, missing
files, stale source ETags, duplicate IDs, incompatible franchise metadata,
publication/removal retry after lost responses, and concurrent catalog mutations.
Verify invalid input never replaces the public catalog and successful concurrent
mutations are throttled/retried without lost entries. An authenticated overlap
test should confirm a second invocation is throttled; a local mutex or
single-instance setting is not evidence of a global cap. The deployed global
quota-one readback is already recorded; these additional scenarios are not
claims of completed hosted owner testing. All publication writes must be
awaited before return.

After acceptance, configure ESA's `OWNER_API_URL` with the verified custom HTTPS
endpoint and release the player through its existing merged-Git build. The owner
enters the upload key into the private page; keep it only in browser memory.
Record the actual function revision, provider build, non-secret trigger/domain
settings, quota readback, and smoke results in the release record. If a temporary
acceptance token was used, disable it after verifying the intended owner key.
Keep publication disabled if any prerequisite remains
unverified; local tests are not evidence of a hosted service.

## Guest video sharing, without learner accounts

Guest sharing is a separate deployed public API, `parrotbook-guest-shares`, with native
HTTP `authType: anonymous`. This does not change the owner trigger's native
Bearer requirement or give guests owner credentials. The second function uses
`share.handler`, Node 20, 512 MiB, a 60-second timeout, and reserved concurrency
**1**. Its code is the separately compiled `api/dist/share.js` in the same Git
build. Both functions use the provider pipeline above; neither contains media.

Its separate `parrotbook-guest-shares-runtime` execution role uses only
[`share-execution-policy.json`](../infrastructure/owner-api/share-execution-policy.json)
and is supplied through `SHARE_API_EXECUTION_ROLE_ARN`. This role
can access only `guest-shares/*`: private records, private videos, and daily
quota tickets. PutObject requires the explicit private ACL. Delete permission
is limited to uploaded/published videos; records and tickets cannot be deleted
by the API. Listing is limited by `oss:Prefix` to quota tickets. It cannot read
or write packs, the content catalog, or unrelated projects. See [OSS prefix and
ACL policy conditions](https://www.alibabacloud.com/help/en/oss/user-guide/authorization-syntax-and-elements)
and [directory-scoped listing](https://help.aliyun.com/zh/oss/user-guide/access-control-base-on-ram-policy).

The function handles CORS for `SHARE_API_ORIGINS`, a JSON array defaulting to
`["https://parrotbook.com","https://www.parrotbook.com"]`. Only the matched
origin is echoed, with `Vary: Origin`. It allows `GET`, `POST`, `DELETE`, and unauthenticated
`OPTIONS`. Bind and verify a dedicated custom HTTPS domain before connecting
the player; keep the owner domain/trigger separate. API JSON responses use
`Cache-Control: no-store` and `X-Robots-Tag: noindex`. There is no guest search,
listing, account, voice analytics, or automatic recording upload. The player
must obtain the learner's explicit upload consent first. Native file sharing
continues to work independently of this hosted API.

| Request | Behavior |
| --- | --- |
| `POST /shares` with `{title, size, credits?: {title, source, attribution}}` | Reserve quota, create a random `shr_` ID and `cap_` creator token, return `{id, title, credits?, creatorToken, expiresAt, upload: {url, headers, size}}` |
| `POST /shares/:id/publish`, `Authorization: Bearer <creatorToken>` | Validate the uploaded MP4, copy it privately, and activate its metadata last; retries are idempotent |
| `GET /shares/:id` | Return only published/unexpired metadata and a short-lived signed video URL; pending is 404, expired/revoked is 410 |
| `DELETE /shares/:id`, creator Bearer token | Mark revoked first, then delete that share's raw and published video; retries finish cleanup and return 204 |

All IDs contain 144 random bits. Only the hash of the creator token is stored;
the token is returned once to the creator and is never included in public
metadata or playback links. Losing the creation response consumes a quota slot;
it does not expose a recovery endpoint for the creator capability. Store that
capability only according to the player's explicit local management behavior.

An upload is one MP4, at most **25 MiB**. `POST /shares` binds the declared exact
size into the OSS V4 signature using its `content-length` additional signed
header, alongside `video/mp4` and private ACL. The signed PUT expires in fifteen
minutes. Upload a Blob body using the returned headers: browser Fetch supplies
Content-Length, which JavaScript must not set manually. Hosted Chromium/WebKit
checks verified successful Blob PUTs with the signed headers. Broader abuse
coverage must also verify oversized/mismatched uploads are rejected. Do not
fall back to an unbound upload URL. This uses the native
[V4 additional signed headers](https://help.aliyun.com/zh/oss/developer-reference/add-signatures-to-urls)
and [SDK signatureUrlV4 parameters](https://github.com/ali-sdk/ali-oss/blob/master/lib/common/object/signatureUrlV4.js).

Publication checks actual size/type using HEAD and reads only the first 64
bytes to verify an MP4 `ftyp` signature. This is a container signature check,
not transcoding or a full decode. The validated ETag is saved before copying;
native source If-Match prevents a subsequent upload replacement from changing
published bytes. The video remains private even after publication; GET grants
at most 120 seconds of playback authority, capped by the remaining seven-day
link lifetime. Revocation stops new URLs before deleting the object, which also
invalidates outstanding URLs for future object requests. Already downloaded or
in-flight bytes cannot be recalled.

Quota is **100 creations per UTC day**, configurable downward with
`SHARE_API_DAILY_LIMIT` (1–100). One `ListObjectsV2` of today's ticket prefix,
with at most 101 results, counts durable tickets; a ticket is written **before**
any upload URL is issued. Failed or abandoned creations still consume their
slot. This correctness guarantee depends on the function's global concurrency
cap of 1 and a single deployed guest writer. A local process counter is not a
substitute. Do not raise concurrency or deploy another function against these
keys without transactional quota coordination.

Patrick explicitly selected **leave automatic cleanup disabled** on 2026-11-16.
No OSS lifecycle rule was applied, and lifecycle setup is neither a pending
approval nor a friend-test gate. Seven-day link access expiration is enforced
by the API regardless of cleanup; expired private objects remain stored and
billed until removed. Creator removal still revokes access and deletes the
share's raw/published videos. It does not delete quota tickets or records.

Hosted acceptance already completed against the provider testing endpoint:

- Native execution-role and global quota-one readbacks passed. A read-only
  12-request burst to a nonexistent share returned one application 404 and
  eleven provider 429 responses; it did not create tickets or uploads.
- API smoke verified private raw/published media, signed upload, publication,
  ranged playback, wrong-token rejection, and creator removal/revocation.
  Apex/www API and OSS preflights passed; a foreign API origin returned 403.
- Real Chromium and WebKit UI checks each created, uploaded, published, played
  in a fresh browser context, and removed one disposable share. Video playback
  returned 206 and advanced; fresh viewers after removal received 410. Both
  shares were removed. The later `ee6fc7ab` deployment preserved authentication
  and both concurrency caps; the removed synthetic share remained 410. This
  later operational check was not a rerun of the two-browser upload scenarios.

See [the dated browser evidence](release/hosted-share-verification.md) for source
revisions and limits. Custom HTTPS and its hosted verification remain before
setting ESA's `SHARE_API_URL`; player endpoint configuration remains disabled
alongside the pending owner acceptance.

For full hosted regression coverage, still test simultaneous creations at the
configured daily-limit boundary, oversized/mismatched signed uploads,
expired/pending links, retry after lost publish/delete responses, and negative
cross-role catalog access. Confirm creator removal cannot delete quota tickets.
These extend the completed smoke and browser checks; they are not reported as
passed. Local SDK stubs alone do not establish hosted permissions, scheduling,
or browser network behavior. Physical-phone and in-app-browser recording/share
coverage remains separate from the desktop engine checks.
