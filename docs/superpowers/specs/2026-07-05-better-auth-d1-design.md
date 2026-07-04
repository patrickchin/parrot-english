# Better Auth D1 User Authentication Design

**Date:** 2026-07-05

## Goal

Require users to create an account or sign in before using the Parrot English
lesson. Use Better Auth for email-and-password authentication and Cloudflare D1
for durable user, credential, and session storage.

## Scope

This first authentication release includes:

- registration with a display name, email address, and password;
- email-and-password sign-in;
- automatic sign-in after successful registration;
- persistent same-origin cookie sessions;
- session restoration when the app loads;
- logout from the lesson screen;
- a client-side authentication gate in front of the lesson; and
- a server-side session requirement for speech evaluation.

This release does not include:

- email verification or any email provider;
- forgotten-password recovery;
- social, magic-link, passkey, or one-time-password sign-in;
- account settings, email changes, or account deletion;
- roles or administration; or
- storing lesson progress against the user account.

## Chosen Approach

Use Better Auth's native Cloudflare D1 support and pass the Worker D1 binding
directly as the authentication database. Better Auth 1.5 treats D1 as a
first-class database, so this feature does not need Drizzle, a custom adapter,
or a separate authentication service.

The alternatives considered were:

1. A Drizzle adapter. This would provide a typed ORM for future application
   data but adds packages and schema machinery that authentication alone does
   not need.
2. A separate authentication Worker. This would isolate authentication but add
   deployment, cross-origin, and cookie complexity without improving this
   single-application use case.

The existing Worker remains the single origin for the SPA, authentication API,
and speech-evaluation API.

## Runtime Architecture

The production and local runtime becomes:

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/*              -> Better Auth -> D1
       -> /api/evaluate-speech     -> session check -> Groq
       -> all other paths          -> static Vite assets
```

Better Auth is created inside the Worker request path because the D1 database
is available through the request's environment bindings. The Worker routes the
complete `/api/auth/*` namespace to `auth.handler(request)` before static asset
fallback.

The D1 binding is named `DB`. Wrangler configuration enables the Cloudflare
Node.js compatibility support Better Auth requires. The authentication base URL
and secret are supplied through Worker environment configuration, never
hardcoded in source.

## Server Authentication

Better Auth is configured with:

- app name `Parrot English`;
- the request environment's `DB` binding;
- email-and-password authentication enabled;
- email verification disabled;
- automatic sign-in after registration;
- Better Auth's default minimum password length of eight characters;
- the default `/api/auth` base path; and
- a required `BETTER_AUTH_SECRET` plus an environment-specific
  `BETTER_AUTH_URL`.

Default Better Auth origin, CSRF, secure-cookie, and HTTP-only-cookie behavior
remains enabled. The application does not implement a parallel password or
session mechanism.

Before handling `/api/evaluate-speech`, the Worker retrieves the Better Auth
session using the incoming request headers. A request without an authenticated
user receives a JSON `401 Unauthorized` response and does not reach the current
rate limiter or Groq handler. Existing rate limiting continues to apply after
authentication succeeds.

## Database and Migrations

The repository contains a Wrangler D1 binding and a committed SQL migration for
the Better Auth core schema. The schema includes Better Auth's required user,
session, account, and verification tables even though email verification is not
part of the product flow. Table and index definitions come from the installed
Better Auth version so runtime expectations and migration shape stay aligned.

Local development applies migrations to Wrangler's local D1 state. Production
database creation and remote migration are documented but remain explicit
deployment actions rather than side effects of starting or building the app.
Local D1 state and credentials are not committed.

## Frontend Authentication Gate

The browser uses Better Auth's React client on the same origin. The root app
checks the current session before rendering protected content:

- while session lookup is pending, it displays a neutral loading state;
- without a session, it displays the authentication screen; and
- with a session, it displays the lesson plus the signed-in user's name and a
  logout control.

The authentication screen is a compact Chinese-language card with login and
registration modes. Registration collects name, email, and password. Login
collects email and password. Native form submission behavior is prevented, the
active submit button is disabled while a request is pending, and fields retain
their values after a recoverable failure.

Successful registration or login updates the Better Auth client session and
opens the lesson without a full-page reload. Successful logout clears the
session and returns to the login screen.

## Error Handling

The authentication form presents concise Chinese messages inside the form for:

- missing required fields;
- passwords shorter than eight characters;
- an email address that is already registered;
- invalid email or password credentials;
- rejected or malformed requests; and
- network or unexpected server failures.

The UI does not expose stack traces or raw database errors. While verification
is disabled, registration with an existing address may reveal that the address
already exists; this is an accepted limitation of the agreed first release.

An authentication infrastructure failure must not reveal the lesson. A failed
session lookup shows a retryable error state rather than treating the visitor as
authenticated.

## Verification Strategy

Implementation follows test-first development for behavior owned by this
repository:

- Worker routing tests cover the `/api/auth/*` dispatch boundary.
- Speech API tests prove an anonymous request receives `401` and an
  authenticated request reaches the existing handler path.
- Frontend-focused tests cover form validation and the mapping from Better Auth
  failures to Chinese user-facing messages.
- Existing architecture tests are updated for the D1 binding and authentication
  entrypoints.

Integration verification then applies the committed migration to local D1 and
uses the local Worker to exercise registration, session restoration,
authenticated speech access, and logout. Final verification runs the existing
unit test, lint, and production build commands.

## Accepted Limitations and Risks

- Email ownership is not proven. A user can register an address they do not
  control.
- There is no self-service recovery for a forgotten password.
- Account recovery requires a later reset-password feature or manual operator
  intervention.
- Client-side gating improves the experience, while the server-side session
  check on speech evaluation provides the actual API access boundary.
- Production D1 creation, secrets, environment URL configuration, and remote
  migration must be completed during deployment before authentication works in
  production.

## References

- [Better Auth email and password](https://better-auth.com/docs/authentication/email-password)
- [Better Auth Cloudflare Workers installation notes](https://better-auth.com/docs/installation)
- [Better Auth 1.5 native D1 support](https://better-auth.com/blog/1-5)
- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/)

