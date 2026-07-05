# Better Auth, Drizzle, and D1 User Authentication Design

**Date:** 2026-07-05

## Goal

Require users to create an account or sign in before using Parrot English. Use
Better Auth for email-and-password authentication, Drizzle ORM for the complete
application data model, and one Cloudflare D1 database for authentication,
lessons, progress, and future product data.

## Scope

This first authentication release includes:

- registration with a display name, email address, and password;
- email-and-password sign-in;
- automatic sign-in after successful registration;
- persistent same-origin cookie sessions;
- session restoration when the app loads;
- logout from the lesson screen;
- a client-side authentication gate in front of the lesson;
- a server-side session requirement for speech evaluation;
- a Drizzle schema for Better Auth's core tables; and
- one shared production D1 resource named `parrot-english`.

This release does not include:

- email verification or any email provider;
- forgotten-password recovery;
- social, magic-link, passkey, or one-time-password sign-in;
- account settings, email changes, or account deletion;
- roles or administration;
- persisting lesson progress yet; or
- remotely applying the production schema without a separate explicit request.

## Chosen Approach

Drizzle owns the schema and migration history for the entire application.
Better Auth connects through its Drizzle adapter using the SQLite provider, and
Drizzle connects to the request environment's Cloudflare D1 binding.

This replaces the earlier native-D1 decision. Direct Better Auth-to-D1 access
was appropriate when the database was assumed to be authentication-only. The
database is now explicitly the shared application database, so one typed schema
and migration system is more valuable than the smaller native setup.

The alternatives considered are:

1. Better Auth uses native D1 while application data uses Drizzle. This works,
   but splits schema ownership and migration conventions inside one database.
2. A separate authentication database. This isolates auth data but complicates
   user-linked application queries and conflicts with the requirement for one
   shared database.

The existing Worker remains the single origin for the SPA, authentication API,
speech-evaluation API, and future application APIs.

## Runtime Architecture

The production and local runtime becomes:

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/*              -> Better Auth -> Drizzle -> D1
       -> /api/evaluate-speech     -> session check -> Groq
       -> future application APIs  -> Drizzle -> D1
       -> all other paths          -> static Vite assets
```

The Worker creates a Drizzle database client from `env.DB` inside the request
path. Better Auth receives that client through its Drizzle adapter with
`provider: "sqlite"` and the checked-in schema object. The complete
`/api/auth/*` namespace routes to `auth.handler(request)` before static asset
fallback.

The D1 binding remains generically named `DB`. The production Cloudflare
resource is named `parrot-english`, not after any single feature. Wrangler
configuration enables the Cloudflare Node.js compatibility support Better Auth
requires. The authentication base URL and secret are supplied through Worker
environment configuration and are never hardcoded.

## Server Authentication

Better Auth is configured with:

- app name `Parrot English`;
- a request-scoped Drizzle client backed by `env.DB`;
- the Better Auth Drizzle adapter using the SQLite provider and the complete
  auth schema;
- email-and-password authentication enabled;
- email verification disabled;
- automatic sign-in after registration;
- Better Auth's default minimum password length of eight characters;
- the default `/api/auth` base path; and
- a required `BETTER_AUTH_SECRET` plus environment-specific
  `BETTER_AUTH_URL`.

Default Better Auth origin, CSRF, secure-cookie, and HTTP-only-cookie behavior
remains enabled. The application does not implement parallel password or
session logic.

Before handling `/api/evaluate-speech`, the Worker retrieves the Better Auth
session using the incoming request headers. A request without an authenticated
user receives a JSON `401 Unauthorized` response and does not reach the rate
limiter or Groq handler. Existing rate limiting applies after authentication.

## Database Schema and Migrations

The application schema lives in a focused Drizzle schema module. It initially
exports Better Auth's required `user`, `session`, `account`, and `verification`
tables, their indexes, and their relations. Future lesson and progress tables
join the same schema and reference the same user identifier.

Drizzle Kit generates SQL migrations from the TypeScript schema. Generated SQL
is committed and applied through Wrangler's D1 migration commands. The old
handwritten auth-only migration is replaced rather than maintained as a second
schema source.

Local development applies generated migrations to Wrangler's local D1 state.
Production database creation and remote migration remain separate operations.
The production `parrot-english` database can exist empty until remote migration
is explicitly approved. Local D1 state, credentials, and tokens are not
committed.

The empty production resource named `parrot-english-auth` is obsolete after the
general database is created and configured. It is deleted only after the new
resource exists and its binding ID is recorded, preventing the application from
being left without a configured database.

## Frontend Authentication Gate

The browser uses Better Auth's React client on the same origin. The root app
checks the current session before rendering protected content:

- while session lookup is pending, it displays a neutral loading state;
- without a session, it displays the authentication screen; and
- with a session, it displays the lesson plus the signed-in user's name and a
  logout control.

The authentication screen is a compact Chinese-language card with login and
registration modes. Registration collects name, email, and password. Login
collects email and password. Native form submission is prevented, the active
submit button is disabled while pending, and fields retain their values after a
recoverable failure.

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

The UI does not expose stack traces, adapter details, or raw database errors.
While verification is disabled, registration with an existing address may
reveal that the address already exists; this is an accepted limitation.

An authentication infrastructure failure must not reveal the lesson. A failed
session lookup shows a retryable error state rather than treating the visitor as
authenticated.

## Verification Strategy

Implementation follows test-first development for behavior owned by this
repository:

- schema tests validate Drizzle table definitions, indexes, relations, and the
  generated D1 migration;
- Worker routing tests cover the `/api/auth/*` dispatch boundary;
- speech API tests prove anonymous requests receive `401` and authenticated
  requests reach the existing handler path;
- frontend tests cover form validation and mapping Better Auth failures to
  Chinese user-facing messages; and
- infrastructure tests validate the general D1 resource binding and Drizzle
  migration commands.

Integration verification applies the generated migration to local D1 and uses
the local Worker to exercise registration, session restoration, authenticated
speech access, and logout. Final verification runs unit tests, lint, and the
production build.

## Accepted Limitations and Risks

- Email ownership is not proven. A user can register an address they do not
  control.
- There is no self-service recovery for a forgotten password.
- Account recovery requires a later reset-password feature or manual operator
  intervention.
- Drizzle adds runtime and development dependencies, but consolidates schema
  ownership for the shared database.
- Client-side gating improves the experience, while the server-side session
  check on speech evaluation provides the actual API access boundary.
- Production secrets, environment URL configuration, and remote migration must
  be completed before authentication works in production.

## References

- [Better Auth email and password](https://better-auth.com/docs/authentication/email-password)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Drizzle with Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/)
