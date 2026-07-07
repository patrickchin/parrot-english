# Flexible, Playful Voice Onboarding Design

> **Superseded on 2026-07-08.** The fixed-question experience described here
> remains available as the accessible rollout fallback, but the primary
> onboarding experience is now defined by
> `2026-07-08-realtime-conversation-foundation-design.md`.

**Date:** 2026-07-06

## Summary

Replace the normalized, database-defined questionnaire runtime with a small,
versioned JSON definition shipped with the Worker. Every question accepts one
free-form prose answer. The server keeps the exact child answer, produces a
short profile summary and a playful Peppa acknowledgment through Groq, saves a
self-contained answer snapshot in `learner_profile.answers_json`, and speaks
the acknowledgment through ElevenLabs.

The questions themselves stay extremely simple. Peppa's personality comes from
her delivery, animation, and answer-specific acknowledgment rather than from
elaborate or cryptic prompt wording.

## Goals

- Let a child answer every onboarding question naturally by voice or text.
- Replace scalar/array preference answers with one prose format.
- Store the exact question, raw answer, summary, and acknowledgment together.
- Keep canonical name and age columns for straightforward personalization.
- Make Peppa respond personally after every confirmed answer without asking
  generated follow-up questions.
- Speak dynamic acknowledgments with a character-directed ElevenLabs voice.
- Make questionnaire changes through ordinary code review and deployment.
- Preserve loading, retry, skip, resume, completion, and profile-editing
  behavior from the current onboarding system.
- Preserve completed v1 users and recover incomplete v1 profiles without
  silently discarding their prior JSON.

## Non-goals

- An admin questionnaire editor or data-only questionnaire publisher.
- AI-generated main questions, question ordering, or branching.
- AI-generated follow-up questions.
- Background enrichment, queues, or eventual-consistency states.
- Native D1 questionnaire branching or per-PR database provisioning.
- Dropping the existing questionnaire tables in the same release.
- Saving generated acknowledgment audio in D1 or permanent object storage.

## Approved Decisions

- Use a checked-in questionnaire JSON file as the runtime source of truth.
- Require a deployment to change the questionnaire.
- Use six short, direct questions written for immediate comprehension.
- Accept prose for every answer; remove chips, arrays, and answer suggestions.
- Preserve `question`, `rawAnswer`, `summary`, and `acknowledgment` for every
  response.
- Retain canonical `name` and `age` columns and duplicate their conversational
  answer snapshots in JSON.
- Generate exactly one personalized acknowledgment after each answer.
- Do not generate follow-up questions.
- Show acknowledgment text immediately, play dynamic audio automatically, and
  expose a `Next` button immediately.
- Use a synchronous, server-orchestrated Groq -> persistence -> ElevenLabs
  flow with deterministic fallbacks.
- Leave the current normalized questionnaire tables dormant until a later,
  separately reviewed cleanup migration.

## Runtime Architecture

The authenticated application composition remains:

```text
AuthGate -> OnboardingGate -> LessonExperience
```

The Worker imports and validates one checked-in v2 questionnaire definition at
startup. Onboarding and profile APIs use that definition directly and do not
query `questionnaire` or `questionnaire_question`.

```text
checked-in questionnaire JSON
          |
          v
OnboardingGate -> authenticated Worker route -> Groq structured output
                                             -> learner_profile in shared D1
                                             -> ElevenLabs acknowledgment audio
```

The existing Better Auth -> Drizzle -> shared D1 boundary remains unchanged.
`learner_profile` stays separate from Better Auth tables. Session bypasses keep
using the existing `onboarding_session_bypass` table and exact-session rules.

## Checked-in Questionnaire Definition

Create `content/onboarding/questionnaire-v2.json` with a deliberately small
contract. It contains deployment metadata, ordered questions, validation
limits, exact static-audio IDs, optional canonical targets, Chinese helper
translations, and deterministic fallback acknowledgments.

The shape is:

```json
{
  "id": "voice-onboarding-v2",
  "version": 2,
  "questions": [
    {
      "answerKey": "name",
      "position": 1,
      "promptEn": "Hi! I'm Peppa. What's your name?",
      "promptZh": "你好！我是佩奇。你叫什么名字？",
      "audioId": "onboarding-v2-name",
      "canonicalField": "name",
      "required": true,
      "maxLength": 120,
      "fallbackAcknowledgment": "It's lovely to meet you!"
    }
  ]
}
```

The initial English questions are exactly:

1. `Hi! I'm Peppa. What's your name?`
2. `How old are you?`
3. `What cartoons do you like?`
4. `What animals do you like?`
5. `What do you like doing for fun?`
6. `What kind of stories do you like?`

The first question serves as Peppa's introduction, so v2 has no separate spoken
introduction before it. The existing explicit `Start` action remains and starts
the first prompt.

All six questions accept prose and appear in fixed order. V2 does not include
answer types, cardinality, options, or answer-dependent branching. The schema
may retain `required` so later deployments can introduce an optional question
without changing the runtime contract. Question-level skip remains available
only when `required` is false; the initial six questions are required.

The definition is validated before build and in tests for:

- a positive integer version;
- stable, unique answer keys and positions;
- contiguous ordering;
- supported canonical fields (`name`, `age`, or absent);
- question and acknowledgment length limits;
- exact static-audio registry text and an existing saved file;
- one `name` and one `age` canonical question; and
- no unknown fields.

## Answer JSON Contract

`learner_profile.answers_json` becomes a versioned envelope:

```json
{
  "schemaVersion": 2,
  "questionnaireVersion": 2,
  "responses": {
    "favoriteAnimals": {
      "question": "What animals do you like?",
      "rawAnswer": "I like dinosaurs because they are big and strong.",
      "summary": "Likes dinosaurs because they are big and strong.",
      "acknowledgment": "Dinosaurs are brilliant—big, strong, and very stompy!",
      "enrichmentStatus": "generated",
      "answeredAt": "2026-07-06T10:30:00.000Z"
    }
  },
  "legacyAnswers": null
}
```

Rules:

- `schemaVersion` describes this envelope and is always `2`.
- `questionnaireVersion` comes from the checked-in definition and is the
  authoritative runtime version.
- Each response is keyed by the stable `answerKey` from the definition.
- `question` is the exact English prompt shown for that answer.
- `rawAnswer` is the child's trimmed, confirmed prose without paraphrasing.
- `summary` is a concise factual profile note with no invented details.
- `acknowledgment` is the exact visible and spoken Peppa response.
- `enrichmentStatus` is `generated` or `fallback`.
- `answeredAt` is an ISO timestamp generated by the server.
- `legacyAnswers` is either `null` or the original v1 parsed JSON object.

`name` and `age` are mirrored into their existing canonical columns after
server validation. Their complete conversational response objects still live
under `responses.name` and `responses.age`.

The existing nullable `learner_profile.questionnaire_version` foreign key is a
legacy column and is no longer authoritative. New v2 profiles leave it null;
existing values remain untouched. The v2 version travels in `answers_json`.
`current_question_key`, `onboarding_status`, completion timestamps, and session
bypass records remain authoritative columns.

## Answer Submission Flow

The client sends one authenticated request containing the stable question key
and confirmed raw prose. It never sends prompt text, canonical-field metadata,
or acknowledgment instructions as authoritative input.

For `POST /api/onboarding/answer` and the equivalent profile edit:

1. Authenticate the Better Auth session and apply the existing route rate
   limit.
2. Load the checked-in definition and verify that the submitted key is the
   current question, or a known editable profile question.
3. Trim the raw answer, require non-empty prose, and enforce a maximum of 500
   Unicode characters plus the question-specific limit.
4. Send only the exact question and raw answer to Groq.
5. Request strict JSON-schema output from `openai/gpt-oss-20b` containing:
   `summary`, `acknowledgment`, and nullable canonical `name` and `age` fields.
6. Validate semantic constraints even though schema shape is strict.
7. Write the complete response snapshot, canonical field, next question key,
   and onboarding status in one profile update.
8. Send only the saved acknowledgment text to ElevenLabs.
9. Return the updated onboarding payload plus optional short MP3 bytes encoded
   as base64 in the JSON response.

The answer is durable before the ElevenLabs request begins. A TTS failure does
not roll back the answer or summary.

The response audio shape is:

```json
{
  "acknowledgment": {
    "text": "Dinosaurs are brilliant—big, strong, and very stompy!",
    "audio": {
      "contentType": "audio/mpeg",
      "base64": "..."
    }
  }
}
```

`audio` is null when TTS is unavailable. Generated MP3 bytes are not stored in
D1 and are not accepted back from the client.

## Groq Enrichment Contract

The existing `GROQ_API_KEY` is reused for both Whisper transcription and answer
enrichment. Enrichment uses Groq Chat Completions with strict JSON Schema mode
and `openai/gpt-oss-20b`, which Groq documents as supporting strict structured
outputs.

The system instructions require:

- a factual third-person summary no longer than 240 characters;
- one warm, playful acknowledgment no longer than 160 characters;
- no question or question mark in the acknowledgment;
- no request for more information;
- no invented interests, traits, relationships, or events;
- no repetition of contact details or other sensitive information;
- nullable canonical name and age fields unless the configured question targets
  them; and
- age constrained to an integer from 3 through 17.

Server validation rejects unknown fields, blank strings, excessive lengths,
questions in the acknowledgment, and invalid canonical values. Semantic
validation remains necessary because JSON Schema guarantees shape, not factual
quality.

If Groq times out, refuses, returns semantically invalid content, or is not
configured, the server uses:

- a safely truncated copy of the raw answer as the summary;
- the checked-in fallback acknowledgment; and
- `enrichmentStatus: "fallback"`.

For canonical fields, deterministic fallback behavior is narrower:

- Name may use the raw trimmed answer only when it passes the existing name
  length and character validation.
- Age may be extracted from digits and must remain within 3 through 17.
- If a required canonical value cannot be validated, the request returns a
  field error and preserves the editable client draft instead of saving an
  unusable profile value.

## ElevenLabs Acknowledgment Audio

Fixed question prompts remain checked-in MP3 assets resolved through
`lib/static-audio.js`. Regenerate the six v2 prompt files with ElevenLabs using:

- Peppa character-directed voice: Summer (`Oqy85UMasXzUjUxF0ta5`);
- model: `eleven_v3`; and
- `voiceStyle: "energetic-character"` with performance tags kept separate from
  visible text.

Dynamic acknowledgments are synthesized at runtime by the Worker with the same
voice and model. The browser never receives the ElevenLabs key and cannot submit
arbitrary TTS text. Production adds `ELEVENLABS_API_KEY` as a Worker secret.

The TTS request has a short timeout and a strict input-length cap. If it fails,
the answer endpoint still returns success with visible acknowledgment text and
`audio: null`. Local or macOS system speech is never used.

## Child-facing Experience

The one-question form remains accessible and voice-first, but all chip and array
controls are removed. Every question uses:

- a large prose textarea;
- a permanent speak/transcribe control;
- an editable transcript that is never auto-submitted;
- a replay button for the fixed prompt audio; and
- a single confirmation action.

Name is prefilled from Better Auth but is still shown and editable. Age accepts
natural prose such as `I'm six` as well as `6`; the server owns canonical
extraction.

The client states are:

```text
loading -> ready -> question -> transcribing -> question
                            -> submitting -> acknowledging -> next question
                                                       \-> completed
```

During submission, Peppa shows a short thinking state and the draft remains
visible. On success, the form changes into an acknowledgment moment. The text
appears immediately. Audio plays automatically when present. `Next` is enabled
immediately; otherwise the client advances after audio finishes. With no audio,
it advances after a short readable delay. Replay applies to the current fixed
question, not to generated acknowledgment audio.

Skip, resume, whole-session bypass, retryable loading errors, reduced motion,
keyboard access, and short-viewport scrolling remain. Profile editing reuses
the same prose form and enrichment path, replaces the selected response
snapshot, updates canonical fields, and plays the new acknowledgment. Profile
editing never exposes the onboarding bypass action.

## Persistence and Idempotency

The server derives question text and metadata from the checked-in definition,
then writes one complete JSON envelope. It never patches raw JSON fragments in
SQL.

Repeated submission of the same question and same raw answer returns the
existing saved summary and acknowledgment rather than calling Groq again.
Changing the raw answer creates a replacement snapshot and new acknowledgment.
Completion still requires every applicable required question to have a valid
response object. V2 has no answer-dependent applicability rules.

The existing repository update boundary continues to update timestamps and
completion state. The API returns only safe profile fields and answer snapshots
owned by the authenticated user.

## Legacy Compatibility and Rollout

Completed v1 profiles remain completed and are never automatically re-onboarded.
They keep their legacy database questionnaire assignment. Loading the v2 profile
editor recognizes the old answer shape. On the first v2 edit, it wraps the old
parsed object under `legacyAnswers`, creates a v2 `responses` object, and writes
only the edited answer in v2 form.

Incomplete v1 profiles restart the v2 conversation at `name`. Their canonical
name and age columns are preserved and prefill the relevant fields. The original
v1 answer object moves intact under `legacyAnswers`; `responses` starts empty so
the child confirms each v2 question in the new format. Existing skip-session
records remain valid.

The initial release does not drop or rewrite:

- `questionnaire`;
- `questionnaire_question`; or
- legacy `learner_profile.questionnaire_version` values.

Runtime code stops reading those tables. The data publisher and automatic
questionnaire-publish deployment step are removed because the checked-in JSON
ships with the Worker. A later forward migration may remove dormant schema only
after production v2 data and rollback needs are reviewed.

## Privacy and Abuse Controls

- Groq receives the current question and raw answer only.
- ElevenLabs receives the generated acknowledgment only.
- Neither provider receives email, Better Auth IDs, session IDs, the complete
  profile, or other answers.
- Provider errors are mapped to safe client messages with no upstream payloads
  or credentials.
- Answer, transcription, and TTS work share authenticated per-user and per-IP
  rate limits.
- Raw audio keeps the existing MIME, size, and timeout restrictions and is not
  persisted.
- Raw prose is limited before provider calls and stored only in the authenticated
  learner profile.
- Generated output is treated as untrusted until server validation succeeds.

## Error Handling

- Authentication failures return `401` before provider or database work.
- Unknown, retired, or out-of-order question keys return `409` with the current
  safe onboarding state.
- Empty or overlong prose returns a field-level `400` error and preserves the
  draft.
- Invalid canonical name or age returns a field-level error and does not advance.
- Groq operational or semantic failures use the deterministic enrichment
  fallback unless a canonical value cannot be validated.
- D1 write failures return a retryable error and do not request TTS.
- ElevenLabs failures return successful saved state with text-only
  acknowledgment.
- Client aborts and stale async results cannot advance or overwrite a newer
  question.

## Testing Strategy

Implementation follows strict red-green-refactor TDD. Coverage includes:

### Definition and domain tests

- exact v2 prompt text and ordering;
- unique keys, contiguous positions, canonical-field constraints, and limits;
- static audio registry/file coverage;
- v2 JSON parsing, response writes, completion, progress, and idempotency;
- canonical name and age handling; and
- v1 completed, incomplete, and profile-edit conversion behavior.

### Provider tests

- Groq strict JSON request schema and model;
- safe summary and acknowledgment validation;
- refusal, timeout, malformed, unsafe, and fallback paths;
- ElevenLabs voice/model/request contract;
- audio success, timeout, upstream failure, and missing-secret behavior; and
- proof that no user identity or unrelated profile data reaches either provider.

### Worker and persistence tests

- session-first route protection and rate limiting;
- current-question enforcement and client metadata rejection;
- atomic JSON/canonical/progress updates;
- retry and same-answer idempotency;
- session bypass, required completion, and profile editing; and
- no runtime query against normalized questionnaire tables.

### UI tests

- one prose textarea with permanent voice and typed paths;
- editable transcription and no automatic submission;
- thinking and acknowledgment states;
- immediate `Next`, audio-driven automatic progression, and text-only fallback;
- skip, resume, replay, profile editing, stale-operation isolation, accessibility,
  responsive layout, and reduced motion; and
- absence of array chips and suggestion controls.

### Release verification

- regenerate and review all changed ElevenLabs prompt assets;
- run focused tests after every red-green cycle;
- run the full test suite, lint, and production build;
- verify the checked-in definition is bundled into the Worker;
- verify production secrets include `GROQ_API_KEY`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, and the new `ELEVENLABS_API_KEY`; and
- avoid expensive E2E unless specifically approved or required to resolve a
  release risk.

## Deployment and Operational Notes

This redesign requires no immediate D1 schema migration. It changes the JSON
payload stored in an existing valid-JSON column and leaves legacy tables intact.
Deployment must add `ELEVENLABS_API_KEY` before v2 code is promoted. Fixed v2
question audio must already be present in `public/assets/audio` and registered
in `lib/static-audio.js`.

The production deploy workflow continues to apply reviewed D1 migrations but
stops invoking the obsolete questionnaire publisher. Preview Workers still bind
the configured D1 database; separate preview database isolation is outside this
design.

## References

- [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs)
- [ElevenLabs Text to Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- Existing onboarding design:
  `docs/superpowers/specs/2026-07-05-voice-onboarding-questionnaire-design.md`
- Existing recovery design:
  `docs/superpowers/specs/2026-07-06-onboarding-review-fixes-design.md`
