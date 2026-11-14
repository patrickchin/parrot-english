# Owner upload API deployment

Status: deployment preparation only. These files do not create a function,
GitHub connection, trigger, domain, role, certificate, or upload key. A hosted
owner API has not been verified by this runbook.

2026-11-15 update: console sign-in is complete, but the repository import path
requests GitHub `repo,repo:status,delete_repo`. No GitHub grant was accepted.
Automatic approval review rejected creation of the missing default IAM role;
no role was created. The [deployment decision](release/api-deployment-decision.md)
proposes a narrower main-only GitHub Actions/OIDC path. It is **not approved**;
the provider-pipeline instructions below remain the current deployment rule.
The 21-pack catalogue prerequisite is now published; see the
[publication record](release/pack-management-verification.md#catalogue-publication).

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

Learner recordings stay in the browser. There is no database, public upload
account, media proxy, or media in either code bundle. Browser uploads go
directly to OSS using short-lived signed URLs. FC reads metadata and media HEAD
responses and copies objects within OSS before publishing the catalog.

The dedicated API is necessary because the current ESA Functions and Pages
runtime permits four fetch subrequests **per execution**, and its gateway waits
only ten seconds for a response. Batch validation needs more storage calls.
See [ESA limits](https://www.alibabacloud.com/help/en/edge-security-acceleration/esa/user-guide/what-is-functions-and-pages/).

## Deployment source and provider pipeline

Only provider builds of merged `patrickchin/parrot-english` **main** may deploy
this API. Do not upload an agent-local code bundle or ZIP. The ESA player keeps
its existing `release/player` deployment workflow.

Use FC Serverless Application Center's **Import from repository**, connect the
GitHub repository, and select **Push to specified branch: main**. Use the default
managed execution environment. Its GitHub build workers run in Singapore; the
function target remains Hong Kong. GitHub authorization may require the owner
to complete the provider handshake. Creating an application can immediately
start its initial deployment: prepare the role and pipeline inputs first.

Application Center manages the Git connection, trigger, pipeline definition,
and pipeline environment variables in its console. Its **resource description
YAML** selects the single repository-root [`s.yaml`](../s.yaml). This satisfies
the documented repository-import requirement. It declares the private owner API
and the separate guest sharing API described below.
There is no second descriptor or repository pipeline scaffold.

Configure one provider build/deploy task with the native `checkout`, `s-setup`,
and `runtime-setup` plugins, selecting `nodejs20`. The checkout must be the
triggering main commit. Run the following as **one script step** from the
repository root so the exported revision reaches the native Serverless Devs
deployment command:

```sh
node --version
npm ci --prefix api
npm --prefix api test
npm --prefix api run package
export OWNER_API_REVISION="$(git rev-parse HEAD)"
s deploy --template s.yaml --assume-yes
s cli fc3 concurrency get --region cn-hongkong --function-name parrotbook-owner-packs
s cli fc3 concurrency get --region cn-hongkong --function-name parrotbook-guest-shares
```

This command runs inside the provider's Git pipeline, not on an agent's local
checkout. Supply both execution-role ARNs through that pipeline's environment.
Any configuration comparison must run after packaging and revision export;
the default early comparison task cannot resolve an unset revision or inspect
an `api/dist` directory that does not exist yet. Do not add a second deployment
plugin after the script and accidentally deploy twice.

The full deploy is intentional. In the inspected native FC3 implementation,
trigger reconciliation iterates **only** `props.triggers`, defaulting to an
empty array. There is no deletion of undeclared triggers: the owner resource
therefore preserves its manually configured Bearer trigger, while the guest
resource creates/updates only `guest-http`. An omitted custom-domain definition
also performs no domain update. Conversely, `deploy --function` skips the
function concurrency configuration, so it is not an equivalent replacement
for this command. See the primary [trigger reconciler](https://github.com/devsapp/fc3/blob/master/src/subCommands/deploy/impl/trigger.ts),
[deployment selection](https://github.com/devsapp/fc3/blob/master/src/subCommands/deploy/index.ts),
and [custom-domain reconciler](https://github.com/devsapp/fc3/blob/master/src/subCommands/deploy/impl/custom_domain.ts).
Record the resolved FC3 component version. After each deployment, verify both
concurrency readbacks are 1 and read back the owner trigger without logging its
token; require Bearer authentication to remain enabled. Repeat this check when
upgrading the deployment component. Do not enable either endpoint after a
failed quota or authentication check.

Use the provider's documented `runtime-setup` plugin with `nodejs20`; confirm
the actual Node version is **20.19 or later**. The standalone `api/package.json`
and lockfile supply the API's build and production dependencies. API tests run
against the compiled JavaScript. Packaging produces `api/dist/index.js` as
CommonJS targeting Node 20 and includes the production dependencies in
`api/dist`. The frontend keeps its separate Node 24 build; do not run the root
application build in this FC pipeline. If the managed Node 20 image is older
than 20.19, obtain a supported current builder before deployment. Record the
actual build-tool versions and triggering commit.

The script sets `OWNER_API_REVISION` from the checked-out Git commit. Configure
`OWNER_API_EXECUTION_ROLE_ARN` with the actual dedicated execution role ARN.
Neither value needs a fabricated account identifier in source. The revision
is a deployment identity, not an owner secret. Keep deploy credentials supplied
by the provider's deployment role; do not put AccessKeys into repository files.

FC Application Center supports selecting a resource YAML file through
`deployFile` / Serverless Devs `-t`; its pipeline definition can remain platform
managed. No extra repository pipeline scaffold is required. Preserve the source
branch restriction when editing pipeline settings. See [repository import](https://help.aliyun.com/zh/functioncompute/manage-applications),
[existing-project CI/CD](https://help.aliyun.com/zh/functioncompute/use-serverless-application-center-to-implement-ci-cd-on-existing-projects),
[pipeline configuration](https://help.aliyun.com/zh/functioncompute/manage-pipelines-1),
and [documented build runtimes](https://help.aliyun.com/zh/functioncompute/use-the-runtime-setup-plug-in-to-initialize-the-runtime-environment-2).

## Function and execution role

Read-only cloud preflight on 2026-11-14 verified the known OSS bucket in the
intended account. Hong Kong has no FC3 functions or Parrotbook custom domains.
The FC service-linked role exists; the project owner/guest execution roles and
an Application Center deployment role do not. The existing project role is for
ESA Git deployment and must not be repurposed. The bucket is unversioned, has
GET/HEAD CORS only, and `GetBucketLifecycle` returns `NoSuchLifecycle`.

The concrete setup sequence is: merge and publish the content-only release
with uploader fields using the existing main CLI; then merge the descriptor/API
and player source to main;
create the two scoped execution roles and separate deployment role; import
the main repository in Application Center and configure its provider pipeline;
deploy and read back both function quotas; configure the private owner Bearer
trigger; bind the two custom HTTPS domains; add the scoped OSS PUT CORS rule
and guest lifecycle rules; then perform the hosted acceptance checks. Only
after those pass should ESA expose the public endpoint URLs. The connected
OpenAPI tools have not established an FC Application Center import operation;
their suggested SAE application API belongs to a different service. Use the
documented FC console import workflow. GitHub authorization, actual managed
Node version, and owner Bearer preflight behavior remain unverified until that
console setup and smoke test. No cloud configuration changed during preflight.

The intended function is `parrotbook-owner-packs`: `nodejs20`, `index.handler`,
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

Create a dedicated RAM role trusted by **Function Compute / FC**, attach
[`execution-policy.json`](../infrastructure/owner-api/execution-policy.json), and
provide its ARN to the deployment environment. This policy grants GetObject
only on this project's `content/*` and `clips/*`, and PutObject only on uploads,
releases, the catalog, and the exact private management key
`content/owner-packs.json`. It grants no listing, deletion, bucket configuration,
or access to other projects. Use a separate deployment role limited to this
function, its configuration, and passing this execution role. Do not use
Application Center's broad default role for runtime code.

FC assumes the execution role and supplies temporary credentials per request as
`context.credentials.accessKeyId`, `accessKeySecret`, and `securityToken`. The
SDK uses `stsToken: securityToken`. No static cloud credentials belong in the
browser, function environment, or repository. See [function roles](https://www.alibabacloud.com/help/en/functioncompute/grant-function-compute-permissions-to-access-other-alibaba-cloud-services)
and [Node context](https://www.alibabacloud.com/help/en/functioncompute/context-1-1).

## Native authentication, HTTPS, and CORS

The descriptor deliberately does **not** create an owner HTTP trigger. Native opaque
Bearer authentication is documented, but the current HTTP API/schema and FC3
YAML reference do not establish its exact configuration enum. Do not guess that
enum, create an anonymous trigger, or replace platform authentication with a
custom password/session store.

After the function exists:

1. In the FC console, create its sole HTTP trigger using **Bearer authentication**,
   token type **Opaque**, and methods `GET`, `POST`, `PATCH`, `DELETE`, and
   `OPTIONS`. Enabling OPTIONS alone does not implement browser preflight.
   Use a fresh random 32–128 character
   token with a valid unique token name. Keep the test token private.
2. Read back the trigger with `GetTrigger`. Inspect the auth type and enabled
   token configuration without logging the token itself. Record the provider
   configuration shape for later declarative deployment. Confirm subsequent
   code deployments preserve this manually configured trigger. Never accept a
   deployment plan that deletes it or changes it to anonymous.
3. Bind a dedicated custom HTTPS domain and certificate to the function. FC's
   built-in `fcapp.run` domain is documented as testing only. A proposed name
   such as `owner-api.parrotbook.com` is not an existing verified endpoint;
   DNS/TLS setup and owner access may still be required. Protect the custom
   domain with the same native Bearer authentication and route methods `GET`,
   `POST`, `PATCH`, `DELETE`, and `OPTIONS`: verify its actual route, rather than
   assuming trigger authentication automatically covers it.
4. Configure and test CORS for the exact player origin `https://parrotbook.com`
   (and `https://www.parrotbook.com` only if the player actually uses it).
   Allow `GET`, `POST`, `PATCH`, `DELETE`, and `Authorization, Content-Type`. Cross-origin
   preflight carries no Bearer token and must succeed without permitting an
   unauthenticated mutation. The newer gateway `corsConfig` feature requires
   invited-test activation; do not assume the account has it. The owner handler
   provides an exact-origin OPTIONS/CORS fallback, configured by
   `OWNER_API_ORIGIN` (default `https://parrotbook.com`). Valid preflight returns
   204 without accessing OSS; foreign origins or unexpected methods/headers
   are rejected. This does not implement or bypass authentication. Native
   Bearer must still let unauthenticated OPTIONS reach that fallback; the
   primary documentation does not establish that exemption.
   Verify the actual native preflight path and authenticated PATCH/DELETE in a
   browser. Keep the endpoint disabled until a supported provider configuration
   and any required fallback are verified; never make mutations anonymous to
   solve preflight.
5. Add an OSS CORS rule for the same exact origin, `PUT`, and the headers
   returned with signed uploads, including `Content-Type` and
   `x-oss-object-acl` (and `Content-MD5` if supplied). Preserve the existing
   public GET/HEAD rule. Expose ETag if the client reads it. OSS handles the
   browser's OPTIONS preflight through its bucket CORS configuration.

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

Use a disposable owner-authenticated upload through the intended deployment.
Do not give the normal owner key to the browser UI until these checks pass:

- Confirm the provider fetched the intended merged main commit and `/session`
  returns the exact `OWNER_API_REVISION`. Read back runtime, memory, timeout,
  execution role, native single-request behavior, and global quota 1.
- Verify missing and invalid Bearer tokens are rejected with HTTP 401 before
  the handler runs, on both the custom domain and every accessible trigger URL.
  Verify valid authentication, and unauthenticated browser preflight from the
  exact page origin. Exercise the actual browser path, not only curl.
- Hold one authenticated invocation active while starting another. Confirm the
  second is throttled and does not execute concurrently; inspect request times
  and FC invocation logs. A local mutex or single-instance setting alone is not
  evidence of a global cap. All publication writes must be awaited before return.
- Initialize an upload, PUT a file directly to OSS with the supplied exact
  signed headers, and verify anonymous GET to that staging object is denied.
  Exercise a failed upload and retry. Confirm malformed metadata, missing files,
  stale source ETags, duplicate IDs, and incompatible franchise metadata do not
  replace the public catalog.
- Publish a complete valid pack. Check release files and media, then the public
  catalog, search/franchise discovery, scene load, playback, and recording flow.
  Retry the same publication and verify its defined idempotent result.
- Start two catalog mutations together. Verify one is throttled or retried and
  neither successful publication disappears from the final catalog.

Publish the franchise catalog, including every entry's `uploader`, from the
first merged content-only release using the **existing main CLI**, before
merging/deploying the feature that requires that field. The new API validates
the current catalog before publication and cannot bootstrap over the former
four-pack catalog with missing uploader fields. Verify the content publication
first, then merge/deploy the API and player feature. From then on, the owner API is the **sole application
catalog writer**: publication and withdrawal scripts must call it. Do not keep
the former direct OSS CLI publication path running alongside it. Administrative
bucket writes can bypass serialization and are outside this application's
single-writer guarantee.

OSS PutObject does not support If-Match/If-None-Match catalog CAS. Serialization
is therefore a correctness requirement, not a throughput optimization. Media
copies use the supported `x-oss-copy-source-if-match` condition so a still-valid
upload URL cannot change the copied bytes after validation. See [unsupported
PutObject preconditions](https://help.aliyun.com/zh/oss/user-guide/0017-00000245)
and [CopyObject source preconditions](https://help.aliyun.com/zh/oss/developer-reference/copyobject/).

After acceptance, configure ESA's `OWNER_API_URL` with the verified custom HTTPS
endpoint and release the player through its existing merged-Git build. The owner
enters the upload key into the private page; keep it only in browser memory.
Record the actual function revision, provider build, non-secret trigger/domain
settings, quota readback, and smoke results in the release record. Rotate or
disable the test token. Keep publication disabled if any prerequisite remains
unverified; local tests are not evidence of a hosted service.

## Guest video sharing, without learner accounts

Guest sharing is a separate public API, `parrotbook-guest-shares`, with native
HTTP `authType: anonymous`. This does not change the owner trigger's native
Bearer requirement or give guests owner credentials. The second function uses
`share.handler`, Node 20, 512 MiB, a 60-second timeout, and reserved concurrency
**1**. Its code is the separately compiled `api/dist/share.js` in the same Git
build. Both functions use the provider pipeline above; neither contains media.

Create a separate execution role with only
[`share-execution-policy.json`](../infrastructure/owner-api/share-execution-policy.json)
and provide `SHARE_API_EXECUTION_ROLE_ARN` to the provider environment. This role
can access only `guest-shares/*`: private records, private videos, and daily
quota tickets. PutObject requires the explicit private ACL. Delete permission
is limited to uploaded/published videos; records and tickets cannot be deleted
by the API. Listing is limited by `oss:Prefix` to quota tickets. It cannot read
or write packs, the content catalog, or unrelated projects. See [OSS prefix and
ACL policy conditions](https://www.alibabacloud.com/help/en/oss/user-guide/authorization-syntax-and-elements)
and [directory-scoped listing](https://help.aliyun.com/zh/oss/user-guide/access-control-base-on-ram-policy).

The function handles CORS for `SHARE_API_ORIGIN` (default
`https://parrotbook.com`) with `GET`, `POST`, `DELETE`, and unauthenticated
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
Content-Length, which JavaScript must not set manually. The real OSS browser
smoke must verify this signed length is sent and oversized/mismatched uploads
are rejected. Do not fall back to an unbound upload URL. This uses the native
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

Recommend lifecycle rules scoped only to these prefixes: raw uploads after
one day, quota tickets after one day, and published videos/records after eight
days. These are proposed rules, **not applied cloud changes**. Verify the
provider's day-boundary behavior preserves all tickets throughout their UTC
quota day, and handle noncurrent versions if bucket versioning is enabled.
Seven-day access expiration is enforced by the API regardless of cleanup.
Until lifecycle rules are configured, expired objects remain stored and billed.

Before enabling hosted sharing, read back the separate execution role and
global quota, test simultaneous creations at the configured daily limit, and
verify a second invocation is throttled rather than admitted concurrently.
Exercise actual browser preflight and direct OSS PUT with its signed length,
publish, new-browser playback, expired/pending/revoked links, wrong creator
tokens, and retry after lost publish/delete responses. Anonymous OSS GET must
fail for both raw and published objects. Confirm the share API cannot access
the owner catalog, and that deleting a share stops playback without deleting
quota tickets. Local SDK stubs prove request construction, not these hosted
permissions, global scheduling, lifecycle rules, or browser network behavior.
