# API deployment decision — awaiting Patrick

The owner upload API and anonymous sharing API are implemented and locally
verified. Neither is hosted. Code remains on the unmerged application PR #276.
The 21-pack catalogue is already published independently.

## Recommendation

Permit GitHub Actions to build and deploy **only these two APIs from merged
main**, using the existing GitHub OIDC provider and a separate scoped FC role.
The player retains its current ESA Git-source deployment. This requires an
explicit exception to `AGENTS.md`'s prohibition on production ZIP deployment;
it does not authorize local bundles, feature branches, or manual ZIP uploads.
No workflow or policy change has been applied yet.

The proposed job would check out the exact merged main SHA, install locked API
dependencies, run the compiled API tests, package the code and production
dependencies, and deploy that CI-built package through native Function Compute
tooling. Pin actions and tooling, serialize production API deployment, record
the source revision, and require quota/authentication readbacks before enabling
the endpoint URLs. Media and structured content remain in OSS.

Use the same pinned official `aliyun/configure-aliyun-credentials-action` as the
existing player workflow, with a new `FC_DEPLOY_ROLE_ARN`. Its trust conditions
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
