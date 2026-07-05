# Onboarding Review Fixes Design

**Date:** 2026-07-06

## Goal

Resolve the five correctness and operational findings from the voice onboarding
review without replacing the existing questionnaire, profile, or authentication
architecture.

The result must recover safely from interrupted completion, allow a learner to
bypass a broken questionnaire for the current authentication session, protect
the paid transcription endpoint, keep published questionnaire versions
immutable, and make optional questions genuinely optional.

## Scope

This change keeps the existing D1-backed questionnaire definitions and
`learner_profile` answer storage. It adds only the persistent state that cannot
be represented correctly by the existing columns:

- per-session onboarding bypass records;
- skipped optional-question keys; and
- a stable questionnaire definition hash.

The existing Better Auth session, questionnaire, and learner profile tables
remain the sources of identity, questionnaire content, and confirmed answers.

## Completion and Recovery

The server owns onboarding transitions. Saving an answer or skipping an
optional question computes the next applicable, unhandled question and the
completion state before issuing one profile update.

When no question remains and every applicable required answer is valid, that
same update sets `onboarding_status = 'completed'`, clears
`current_question_key`, and records `completed_at`. The browser no longer saves
the final answer and then depends on a second completion request.

`POST /api/onboarding/complete` remains as an idempotent recovery endpoint for
older clients and unusual stored states. A reload after a lost final-answer
response therefore observes either the next question or a completed profile;
it never observes an incomplete profile with no actionable question.

## Optional Questions

`learner_profile` gains `skipped_question_keys_json`, a validated JSON array of
stable answer keys. The domain layer treats a question as handled when it has a
non-empty answer or, for an optional question only, its key appears in this
array.

The one-question form exposes **Skip question** only when `required` is false.
The corresponding authenticated endpoint verifies that the requested question
is the current question and is optional, persists the key, advances in
questionnaire order, and completes onboarding when appropriate. Saving a later
answer for that key removes it from the skipped set.

Required questions can never be added to the skipped set. Branching and
completion continue to use confirmed answers only; a skipped optional answer
does not satisfy a branch comparison.

## Session Bypass and Degraded Access

A new `onboarding_session_bypass` table stores the Better Auth session record
ID, authenticated user ID, and skip timestamp. The session ID is the primary
key, and deleting the user cascades to its bypass rows. This replaces the
single `last_skipped_session_id` behavior for access decisions and allows
multiple active sessions to skip independently.

`POST /api/onboarding/skip` writes the session bypass before attempting to load
questionnaire state. If questionnaire loading succeeds, it returns the normal
onboarding payload. If loading fails because the active or assigned
questionnaire is unavailable, it returns a minimal degraded-access payload
with `canBypass: true` rather than returning 503.

`GET /api/onboarding` also returns degraded access when the current session has
a bypass record or an existing learner profile is completed but questionnaire
content cannot be loaded. The browser renders lesson content from this payload
without offering profile editing until full questionnaire state becomes
available again.

This fallback assumes the additive D1 migration has been applied. The
deployment workflow therefore applies migrations and publishes the validated
questionnaire before deploying the Worker and gated frontend. A migration or
publish failure stops deployment.

## Transcription Protection

The onboarding transcription route receives a dedicated server-side rate
limit before the Groq handler runs. The key combines the authenticated user ID
and client address, preventing one account from avoiding its bucket by sharing
an address and preventing one shared address from collapsing all users into a
single bucket.

The limiter has onboarding-specific environment overrides and conservative
defaults. Responses use HTTP 429 with `Retry-After`, matching the existing
speech-evaluation limiter contract.

The onboarding upload limit is separated from the lesson-evaluation limit and
reduced to the maximum needed for the client's short recording window. Empty,
unsupported, and oversized files are rejected before the provider call. The
client recording timer remains a usability bound; server-side rate and byte
bounds are the enforceable abuse controls available without adding an audio
decoder dependency to the Worker.

## Immutable Questionnaire Publishing

`questionnaire` gains `definition_hash`. The publisher computes a SHA-256 hash
from a canonical representation of the validated persisted definition,
including question configuration and introduction audio ID.

Publishing a new ID and version inserts the questionnaire normally. Publishing
the same ID and version with the same hash is idempotent and may reactivate the
version. Publishing an existing ID or version with a different hash aborts the
entire D1 import through an existing database constraint, leaving the prior
active questionnaire and its questions unchanged.

The migration backfills the hash for the checked-in version-one definition so
the first post-migration deployment is idempotent. Any semantic questionnaire
change must use a new ID and version.

## API and Client Changes

The full onboarding payload remains unchanged. A degraded payload is a small
discriminated variant:

```json
{
  "mode": "bypass-only",
  "canBypass": true
}
```

The normal payload adds `mode: "full"` so the client can narrow the union
without nullable profile or questionnaire fields.

The client:

- renders lessons immediately for either a completed full payload or a
  bypass-only payload;
- shows the profile button only for a full payload;
- uses the answer response directly because final-answer completion is now
  server-owned; and
- calls the optional-question skip endpoint only for optional current
  questions.

## Migration and Deployment

One additive migration performs the following changes:

1. Add `questionnaire.definition_hash` and backfill version one.
2. Add `learner_profile.skipped_question_keys_json` with a valid-array default.
3. Create `onboarding_session_bypass` with user and lookup indexes.

The main deployment workflow runs, in order:

1. tests, lint, and build;
2. remote D1 migrations;
3. idempotent questionnaire publishing; and
4. Worker deployment.

The old Worker remains compatible while the additive migration and seed run.

## Error Handling

- An invalid required-question skip returns a field-level 400 response.
- A stale or out-of-order optional skip returns the same current-question error
  used by answer submission.
- A rate-limited transcription returns 429 without calling Groq.
- A changed definition under an existing version fails publication atomically.
- Questionnaire failures return 503 only when the session has neither a
  completed profile nor a current-session bypass.
- Database and provider details remain hidden from API responses.

## Verification

Test-first regression coverage will prove:

- a final answer returns a completed state without a second client request;
- completion remains recoverable after a lost response;
- skip succeeds against migrated D1 with no active questionnaire;
- degraded access is limited to completed or explicitly skipped sessions;
- two sessions for the same user retain independent bypass records;
- optional questions can be skipped and required questions cannot;
- answered optional questions are removed from the skipped-key set;
- transcription is rate-limited before Groq and enforces its smaller payload
  bound;
- identical questionnaire publication is idempotent;
- changed same-version publication rolls back without changing the active
  definition; and
- deployment orders migration and publication before Worker deployment.

Focused onboarding tests, changed-file lint, TypeScript checking, the production
build, and the existing unit suite provide final regression coverage. End-to-end
tests are not required unless focused verification reveals a browser-only
failure.

## Out of Scope

- Normalizing every questionnaire answer into its own database row
- Replacing the existing in-Worker rate-limit mechanism with Durable Objects
- Parsing media containers or decoding audio in the Worker
- Changing the initial five-question content or saved ElevenLabs audio
- Reworking authentication or lesson navigation
