# Shared guest account

## Goal

Replace per-visitor anonymous accounts with one durable shared account. Every
visitor who chooses **Continue as guest** receives a separate Better Auth
session for the same account, sees the same learner data, and signs out through
the ordinary fast session-revocation path.

## Approved behavior

- Every guest session uses one fixed Better Auth user identity.
- Learner profiles, progress, settings, consent, recordings, generated art,
  conversations, and usage limits remain scoped by the existing auth user ID.
  Because the user ID is shared, all of that data is intentionally shared.
- The initial shared account owns one completed learner profile named Sam so a
  new guest can enter the learner experience without completing setup first.
- Separate browsers receive separate session rows. Their active-learner
  selections remain session-scoped, while durable account and learner changes
  are visible to every guest.
- **Sign out** calls Better Auth's normal sign-out endpoint. It does not delete
  the shared user, purge account data, write R2 deletion fences, or perform an
  explicit guest-only session refresh.
- The shared account cannot be deleted. The Account & privacy page keeps its
  informational content but does not show the account-deletion danger zone for
  this identity, and the server rejects direct deletion attempts for it.
- Turnstile continues to protect guest entry and new-account registration.

## Identity and seed data

A migration inserts stable records for:

- a non-anonymous Better Auth user named `Guest`, with a fixed internal user ID
  and an internal `.invalid` email address;
- one completed legacy-storage-owner learner profile named `Sam`.

The migration is idempotent for those fixed primary keys. It does not create a
credential account or publish a reusable password. The shared account is
reachable only through the guest-session endpoint.

## Authentication architecture

The Worker configures a small Better Auth plugin with a
`POST /api/auth/sign-in/shared-guest` endpoint. After Better Auth's configured
Turnstile hook accepts the request, the endpoint:

1. loads the fixed shared user;
2. fails without creating fallback identities if the migration is missing;
3. creates a normal Better Auth session for that user;
4. sets the normal Better Auth session cookie; and
5. returns the standard successful sign-in shape.

The browser guest action posts to this endpoint with the existing
`x-captcha-response` header, then refetches the reactive session exactly as the
current guest sign-in action does.

The Better Auth anonymous server and client plugins are removed. The captcha
endpoint list replaces `/sign-in/anonymous` with `/sign-in/shared-guest`.
Historical anonymous users are not migrated into the shared account; their
finite existing rows may be handled separately if cleanup is ever needed.

## Sign-out and deletion

`signOutSession` has one path for both shared and personal accounts:
`client.signOut()`. Better Auth deletes only the current session and its client
session signal renders the signed-out route.

The guest-only `/api/guest-account` cleanup endpoint and its browser helper are
removed. Full account cleanup remains unchanged for ordinary registered users.
Before that cleanup starts, the server rejects the fixed shared user ID so a
crafted Better Auth deletion request cannot remove the shared account.

The UI derives `isSharedGuest` from the fixed, non-secret user ID and passes it
through the existing account-action context. Account & privacy uses that flag
only to omit the deletion controls.

## Concurrency and errors

- Concurrent guest edits use the current database constraints and last-write
  behavior. No guest-specific locks, reset jobs, or data partitioning are added.
- A missing shared seed user produces the existing guest sign-in error state;
  it never falls back to creating another account.
- Turnstile, network, and session-creation failures retain the existing retry
  and token-reset behavior.
- Ordinary sign-out failures retain the existing contained retry UI.

## Verification

- Auth tests prove repeated shared-guest sign-ins use the same user ID while
  creating distinct sessions and cookies.
- UI tests prove guest entry calls the shared endpoint and guest sign-out calls
  normal Better Auth sign-out without account cleanup.
- Worker tests prove Turnstile protects the new endpoint, the old anonymous and
  guest-cleanup routes are unavailable, and direct deletion of the shared user
  is rejected before storage cleanup.
- Migration tests prove the fixed user and completed Sam profile are seeded
  without credentials.
- Lifecycle and browser tests cover shared guest entry, ordinary sign-out
  feedback, and the absence of shared-account deletion controls.
- Run the full unit, browser, lint, and build checks before completion.

## Non-goals

- Do not isolate guest data by browser, device, or session.
- Do not periodically reset the shared account.
- Do not add guest-specific quotas, locking, moderation, or conflict handling.
- Do not migrate or synchronously purge historical anonymous accounts.
- Do not change registered-account authentication, ownership, or deletion.
