# Review Hardening Fixes Design

**Date:** 2026-07-06

## Summary

Fix all seven findings from the second code review without broad refactoring.
Simplification is limited to code directly touched by the fixes and is accepted
only when it removes duplication, eliminates unnecessary state, or creates one
clear boundary for behavior that is currently repeated.

## Goals

- Enforce onboarding and profile request-body limits before buffering.
- Replace isolate-local rate-limit counters with Cloudflare Rate Limiting
  bindings.
- Stop profile microphone and network work when the editor is cancelled or
  closed, and prevent stale async results from changing current UI state.
- Confirm the upstream flexible-onboarding change has removed the pending-array
  form state that caused silent submission loss.
- Prevent deployment cancellation between production database changes and the
  matching Worker deployment.
- Remove bypass rows when their Better Auth sessions are deleted.
- Add focused regression coverage for every reviewed failure mode.

## Non-goals

- Redesigning the onboarding or profile UI.
- Reorganizing the Worker routing or splitting large existing components.
- Changing API success payloads, questionnaire content, lesson content, or
  speech evaluation behavior.
- Adding a general-purpose request framework, operation manager, or database
  cleanup service.

## Design Principles

The implementation will prefer a small number of explicit helpers over repeated
inline logic. A helper is justified only when at least two call sites need the
same safety rule or when it isolates platform-specific behavior. Existing names,
response shapes, and component ownership remain intact.

## Bounded Request Bodies

Create `worker/request-body.ts` with a small byte-reading boundary:

- reject a declared `Content-Length` above the configured maximum before
  consuming the stream;
- read `request.body` incrementally and stop as soon as the accumulated byte
  count exceeds the maximum;
- cancel the reader on overflow;
- expose a typed oversized-body error;
- provide thin text and multipart helpers built on the same bounded bytes.

The multipart helper reconstructs a `Response` with the original
`Content-Type` and parses `FormData` only after the body has been proven to fit.
This keeps peak application buffering bounded to the accepted payload size.

`worker/onboarding.ts` will use the bounded text helper for the existing 16 KiB
JSON limit. `worker/groq.ts` will use the bounded multipart helper for the
512 KiB onboarding-audio limit. Existing `payload_too_large` and
`audio_too_large` responses remain unchanged. Malformed JSON and multipart
requests continue to return their current 400 responses.

## Cloudflare Rate Limiting

Replace the module-level maps in `worker/api-security.ts` with three platform
bindings configured in `wrangler.jsonc`:

- evaluation: 8 requests per 60 seconds, keyed by client address;
- onboarding transcription: 6 requests per 60 seconds, keyed by authenticated
  user ID and client address.
- onboarding enrichment: 12 requests per 60 seconds, keyed by authenticated
  user ID and client address.

The security module will contain one small async adapter that calls a binding
and converts a rejected token request into the existing JSON 429 response. The
two exported route-specific functions will only construct their key and select
their message. Environment-string parsing, duplicate maps, window arithmetic,
and expired-entry handling are removed.

`worker/index.ts` will await these checks before invoking either speech handler.
Tests inject deterministic fake bindings, so no network or Cloudflare account is
required. The binding is intentionally the platform's per-location,
eventually-consistent protection; it is not used for billing-grade accounting.

## Profile Async Operation Boundary

`OnboardingGate` remains the owner of profile loading, drafts, and microphone
capture. The upstream flexible-onboarding change already added a generation
counter that suppresses stale UI results. This work adds one active capture
controller so invalidating a generation also stops physical microphone and
network work.

- Starting a profile transcription cancels any previous profile operation.
- `recordSpeechClip` and `transcribeOnboardingAudio` receive the same abort
  signal.
- Closing or cancelling the editor aborts active recording/transcription before
  clearing profile state.
- Async continuations confirm that their controller is still current before
  updating drafts, errors, or status.
- Save is disabled while a field is recording or transcribing.
- Close and Cancel remain available during capture so the user can stop it.
- Close and Cancel are disabled during an already-submitted save to avoid
  presenting a cancellation that the server may already have committed.

This uses the existing per-field status map for display and adds only the
minimal controller/generation state needed to make its lifetime explicit.

## Superseded Pending Array Finding

Current main replaced array-chip profile inputs with one raw-answer textarea per
question. There is no separate pending value to omit, and form submission reads
the visible draft string directly. That reviewed failure mode is therefore
already resolved upstream and requires no compatibility helper or new code.

## Deployment Serialization

Change the main-branch deployment concurrency policy to
`cancel-in-progress: false`. New deployments remain serialized under the same
group, but a running job cannot be stopped after applying migrations and before
deploying its Worker. Current main embeds the questionnaire definition in the
Worker, so there is no longer a separate questionnaire publish step.

## Session Bypass Lifecycle

Update `onboarding_session_bypass.session_id` to reference the Better Auth
`session.id` with `ON DELETE CASCADE`. Generate a new migration that rebuilds
the SQLite table because SQLite cannot add this foreign key in place.

During migration, copy only rows whose session still exists and belongs to the
same user. This prunes existing orphaned or mismatched bypass rows instead of
allowing the new constraint to fail. The user index and current repository API
remain unchanged.

## Error Handling

- Oversized bodies retain current 413 response codes and error identifiers.
- Missing or malformed bodies retain current 400 behavior.
- Rate-limit rejection retains 429, `Cache-Control: no-store`, and a
  conservative `Retry-After` value matching the configured 60-second period.
- User-initiated profile aborts do not show an error.
- Genuine recording, transcription, or save failures keep their current field
  or page-level messages.
- Stale operations are ignored rather than allowed to overwrite newer state.

## Testing

Tests will be added before implementation and observed failing for the intended
reason.

- Request-body tests cover declared oversize, streamed oversize without a
  length header, accepted JSON, and accepted multipart data.
- Worker tests confirm oversized bodies are rejected before JSON or multipart
  parsing reaches the route handler.
- Security tests use fake Cloudflare bindings and assert keys, route-specific
  messages, and allowed/rejected behavior.
- Profile tests cover abort-on-close, stale-result suppression, and Save locking
  during transcription.
- Workflow tests require non-cancelling deployment serialization.
- Migration tests verify the session foreign key, cascade cleanup, and pruning
  of orphan rows.
- The full test suite, lint, TypeScript/Vite build, migration snapshot checks,
  and `git diff --check` run before completion.

## Expected Files

- Create `worker/request-body.ts`.
- Modify `worker/groq.ts`, `worker/onboarding.ts`, `worker/api-security.ts`, and
  `worker/index.ts`.
- Modify `wrangler.jsonc`.
- Modify `src/OnboardingGate.tsx` and `src/ProfileEditor.tsx`.
- Modify `src/db/schema.ts` and add the next Drizzle migration and snapshot.
- Modify `.github/workflows/deploy-cloudflare.yml`.
- Update only the focused Worker, security, onboarding UI, infrastructure, and
  migration tests required by the fixes.

## Acceptance Criteria

All seven review findings are resolved or proven superseded by current main. No
active profile capture survives closing the editor, no configured body limit is
checked only after full buffering, rate-limit state no longer depends on module
maps, deployments cannot be cancelled between production mutations, and bypass
records follow their session lifecycle. The final diff contains no unrelated
refactor.
