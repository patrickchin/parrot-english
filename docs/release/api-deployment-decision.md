# API deployment decision — accepted 2026-11-16

The owner upload API and anonymous sharing API are implemented and locally
verified. Neither is hosted at the start of this delivery cycle. Code remains on the unmerged application PR #276.
The 21-pack catalogue is already published independently.

## Recommendation

Permit GitHub Actions to build and deploy **only these two APIs from merged
main**, using the existing GitHub OIDC provider and a separate scoped FC role.
The player retains its current ESA Git-source deployment. This requires an
explicit exception to `AGENTS.md`'s prohibition on production ZIP deployment;
it does not authorize local bundles, feature branches, or manual ZIP uploads.
Patrick approved moving forward with this recommendation on 2026-11-16.
`AGENTS.md` now records the narrowly scoped deployment exception. The workflow
and cloud setup are being implemented; approval does not establish that the
APIs are deployed or that hosted acceptance has passed.

The proposed job would check out the exact merged main SHA, install locked API
dependencies, run the compiled API tests, package the code and production
dependencies, and deploy that CI-built package through native Function Compute
tooling. Pin actions and tooling, serialize production API deployment, record
the source revision, and require quota/authentication readbacks before enabling
the endpoint URLs. Media and structured content remain in OSS.

Use the same pinned official `aliyun/configure-aliyun-credentials-action` as the
existing player workflow, with a new `API_DEPLOY_ROLE_ARN`. Its trust conditions
must match issuer `https://token.actions.githubusercontent.com`, audience
`sts.aliyuncs.com`, and subject
`repo:patrickchin/parrot-english:ref:refs/heads/main`. Credentials are temporary;
no static cloud key or Alibaba-to-GitHub repository grant is needed.

The deployment role would allow create/get/update and concurrency configuration
only for `parrotbook-owner-packs` and `parrotbook-guest-shares` in Hong Kong,
guest-trigger management only for `guest-http`, and passing only their two
dedicated execution roles to `fc.aliyuncs.com`. It would have no OSS, NAS, VPC,
ECS, ACR, or owner-trigger write permission. Add provider-required read actions
only after checking the deployment plan. Runtime roles retain the separate
scoped OSS policies already in `infrastructure/`.

Primary references: [GitHub's supported cloud OIDC integrations](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers),
[Alibaba's official credentials action](https://github.com/aliyun/configure-aliyun-credentials-action),
and [FC resource-level permissions](https://help.aliyun.com/zh/functioncompute/policies-and-sample-policies).

## Why the current path stopped

The authenticated Alibaba console's Git import requests GitHub
`repo,repo:status,delete_repo`, granting broad repository access including
repository deletion. No grant was accepted.

Its missing `AliyunFcDefaultRole` dialog offers a Create action. Automatic
approval review rejected that action because it creates persistent IAM access
without specific approval. Read-only RAM inspection found that the current
`AliyunFCDefaultRolePolicy` v8 includes OSS object read/write/delete across all
buckets plus other service permissions. No role was created. The documented
application/environment custom-role support does not establish a way through
this UI bootstrap or remove its GitHub OAuth request.

The [legacy overview](https://help.aliyun.com/zh/functioncompute/overview-of-serverless-application-center)
supports custom roles. A public legacy CreateApplication API was not verified;
do not substitute another service's application API or invent an endpoint.

## Setup record — 2026-11-16

Created and read back exactly one scoped custom policy on each role:

- `parrotbook-owner-packs-runtime`: `ParrotbookOwnerPacksRuntime`.
- `parrotbook-guest-shares-runtime`: `ParrotbookGuestSharesRuntime`.
- `parrotbook-fc-github-main`: `ParrotbookFcMainDeploy`.

The existing OIDC provider is reused. Non-secret GitHub workflow variables are
configured; no static credentials were added. Existing OSS GET/HEAD CORS was
preserved and a PUT rule added only for `https://parrotbook.com`,
`https://www.parrotbook.com` and the signed
upload headers. Readback confirmed the rules. The cloud connector refused
`put-bucket-lifecycle` in strict-permission mode; the four proposed cleanup
rules were not applied. Function deployment and hosted acceptance remain separate.
Patrick subsequently selected **leave cleanup disabled** on 2026-11-16.
This closes the proposed lifecycle work: do not seek approval again or treat
it as a friend-test release gate. Seven-day access expiry and creator removal
remain; expired private objects remain stored and billed until removed.

The reviewed bootstrap has two native phases: first create/update functions
without a guest HTTP trigger and verify both global concurrency caps equal 1;
then deploy the gated descriptor that adds the guest trigger. The owner trigger
remains absent until native Bearer setup. Subsequent deployments preserve its
configuration. Twenty-two deployment checks include real subprocess tests for
this ordering, quota-failure blocking, generated-file cleanup, and private stderr.

Bootstrap run [43799969432](https://github.com/patrickchin/parrot-english/actions/runs/43799969432)
created both functions from merged `75cd550d` with the intended roles and quotas
one, and created the guest HTTP trigger. Its terminal owner-trigger readback
failed, so the workflow is not a successful deployment receipt. Native readback
and hosted tests independently verify the created resources. The owner later
saved its sole `owner-http` trigger with native `bearer` authentication, five
required methods and an enabled token; no token was logged. Missing/invalid
tokens return 403; unauthenticated browser preflights return 204 for apex/www.

PR #280 added safe diagnostics, but run
[43801872142](https://github.com/patrickchin/parrot-english/actions/runs/43801872142)
still stops before deployment on the owner ListTriggers read. Exact pinned
CLI 3.5.3 source establishes that remote SDK errors require `--cli-ai-mode` for
the top-level JSON envelope; `--cli-output json` alone only formats local errors.
The follow-up pins that per-command flag and tests its exact argv. Provider
permission changes remain deferred until the actual failure is known.

The default `fcapp.run` addresses are test endpoints, not the production URLs.
Prepare two native FC custom HTTPS domains, `owner-api.parrotbook.com` with
native Bearer authentication and `share-api.parrotbook.com` with anonymous guest
access. Each routes `/*` to its respective existing function. Domain-level
authentication makes a shared anonymous hostname unsuitable. Both DNS-only
CNAMEs target `1263482499936169.cn-hongkong.fc.aliyuncs.com`. Cloudflare remains
authoritative. Both DNS-only records were saved and independently resolved on
2026-11-16. After explicit approval of the agreements and ¥0 total, order
`2008479803250297` completed at ¥0 and provisioned two DigiCert RSA2048 Basic
personal-test instances: `cas_dv-cn-25x51rl4401l` and
`cas_dv-cn-25x51rl4401m`. These are allocated, not issued certificates. The owner
application is prepared for `owner-api.parrotbook.com`; the required verified
contact and actual location are pending owner input. Then issue both certificates,
add their DNS challenges and install them on the two FC custom domains. Record
the actual certificate NotAfter dates after issuance; the subscription end date
is not that evidence. The production player endpoint variables remain unset.

Cloudflare public TLS plus Origin CA was assessed after the owner questioned
the checkout complexity. It is a valid alternative, but adds a new proxy/data
path, origin-certificate integration and timeout/network checks. For this friend
test retain the existing direct Hong Kong FC path and finish the already approved
free order. No Cloudflare proxy, Origin CA credential or paid certificate was created.

Further CLI evidence distinguishes transport from authorization: run
[43805642385](https://github.com/patrickchin/parrot-english/actions/runs/43805642385)
reported exit 2 and a 484-byte JSON stderr document. Exact pinned-binary loopback
probes reproduce native local transport envelopes with only schemaVersion,
message and recovery; remote code/status/request ID are optional. Diagnostics
now validate native local envelopes first and emit only fixed action/type labels.
Native `--retry-count 2` is verified to make at most three read-only GET attempts,
recovering after two synthetic connection resets. The per-readback timeout is
45 seconds; all mutation/source/quota/auth-preservation gates are unchanged.
No IAM denial or need for broader permissions is established by these failures.
