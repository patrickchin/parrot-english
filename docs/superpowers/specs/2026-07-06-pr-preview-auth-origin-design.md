# PR Preview Authentication Origin Design

## Problem

Cloudflare deploys pull requests to branch- and commit-specific origins such as
`https://codex-app-home-routing-parrot-english.p-ch.workers.dev`. Better Auth
currently trusts only the production `BETTER_AUTH_URL`,
`https://parrot-english.p-ch.workers.dev`, so preview sign-in requests fail
with `403 INVALID_ORIGIN` before credentials are checked.

## Design

Keep `BETTER_AUTH_URL` as the canonical production origin. Add one static
Better Auth `trustedOrigins` entry:

```text
https://*-parrot-english.p-ch.workers.dev
```

The pattern covers both Cloudflare branch aliases and immutable commit preview
URLs for this Worker. It does not trust arbitrary `workers.dev` sites, other
Cloudflare account subdomains, HTTP origins, extra hostname suffixes, or custom
domains.

The browser continues using the same-origin Better Auth client. The preview
Worker continues using the shared configured database and secret; only origin
validation changes.

## Verification

Automated tests must prove:

- the production origin remains trusted through `baseURL`;
- branch and commit preview origins matching the Parrot Worker suffix are
  accepted;
- unrelated `workers.dev`, other account subdomains, HTTP, malformed, and
  suffix-confusion origins are rejected; and
- the existing authentication, Worker, and full application suites remain
  green.

After pushing the fix, the deployed PR preview must be checked directly:

- a sign-in POST from the preview origin no longer returns
  `INVALID_ORIGIN`;
- invalid diagnostic credentials reach the normal credential response; and
- an existing test account can sign in through the preview UI.

## Scope

This change does not alter session storage, cookie policy, database bindings,
`BETTER_AUTH_URL`, OAuth callbacks, or production deployment behavior.
