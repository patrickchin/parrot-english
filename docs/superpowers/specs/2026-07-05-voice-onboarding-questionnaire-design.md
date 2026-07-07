# Voice Onboarding Questionnaire Design

> **Superseded on 2026-07-08.** The fixed-form questionnaire described here
> has been replaced by the bounded realtime conversation design in
> `2026-07-08-realtime-conversation-foundation-design.md`. This document is
> retained as implementation history for the current form fallback.

**Date:** 2026-07-05

## Goal

After a learner creates an account or signs in without a completed profile,
present a short onboarding questionnaire hosted by Peppa. Peppa introduces
herself and asks each question in English with saved audio. The learner answers
one question at a time through a normal form that supports voice transcription,
typing, and question-specific choices.

The questionnaire definition lives in Cloudflare D1 so its prompts, ordering,
answer types, options, and simple branching can change without changing the
frontend. Stable learner fields use dedicated profile columns; changing or
interest-oriented fields use a flexible JSON object.

## Dependency

This feature builds on the merged Better Auth, Drizzle, and D1 authentication
implementation described in
`docs/superpowers/specs/2026-07-05-better-auth-d1-design.md`. Authentication,
the shared `parrot-english` D1 binding, the request-scoped Drizzle client, and
the React authentication gate already exist. Onboarding extends those existing
boundaries rather than adding a second database or session mechanism.

## Agreed Product Decisions

- Show onboarding after authentication when the learner profile is incomplete.
- Peppa speaks in English.
- Show one question at a time.
- Keep the page visually minimal: Peppa, the current question, one answer form,
  progress, and Next.
- Use a standard form rather than a chatbot or conversation transcript.
- Speech recognition fills the current editable field and never saves
  automatically.
- Keep typing and question-specific choices available as permanent fallbacks.
- Allow Skip for now and preserve partial progress.
- Re-offer incomplete onboarding on a later sign-in.
- Start with five questions: age, favourite cartoon, favourite animal,
  favourite activity, and favourite story/topic.
- Use a fixed database-defined sequence with optional deterministic branching;
  do not generate questions or follow-ups with AI.
- Allow profile answers to be edited later.
- Do not automatically re-onboard completed users when a new questionnaire
  version becomes active.

## Experience Flow

After authentication, the client requests the active questionnaire and the
authenticated user's learner profile. A profile without completed onboarding
opens the onboarding gate unless the current authentication session was already
skipped.

If no learner profile exists, the Worker creates it and assigns the currently
active questionnaire version in the same request. That assignment remains fixed
until onboarding completes, even if a newer questionnaire becomes active.

The first onboarding view has one Start control. This explicit interaction
unlocks browser audio. Peppa then plays a short English introduction followed
by the saved audio for the first question. If autoplay remains unavailable, the
question stays visible and a replay control is available.

Every question view contains only:

- Peppa;
- the current English question and a short Chinese text translation;
- a replay button;
- one editable answer control;
- a microphone button inside or beside that control;
- optional answer suggestions where configured;
- compact progress; and
- Next.

Pressing the microphone records one short answer and sends it for
transcription. Returned text populates the form field. The learner can edit or
replace it before pressing Next. Transcription is an input aid, not a separate
chat interaction.

For array-valued questions, confirmed values appear as removable chips. A
spoken or typed value can add one chip at a time, and configured choices can add
or remove chips. The page still contains only the current question.

Next validates and saves the confirmed answer before advancing. Progress is
saved after every question, so a learner can resume at the first unanswered
required question.

Skip preserves all confirmed answers and opens the lesson for the current auth
session. The profile records that session's identifier and skip time. A later
sign-in creates or uses a different auth session, causing incomplete onboarding
to be offered again.

After completion, the lesson opens. The profile/settings screen reuses the same
one-question form and validation logic, but it does not replay Peppa's
introduction. Question audio remains available through Replay.

## Runtime Architecture

The existing Cloudflare Worker remains the single origin:

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/*                 -> Better Auth -> Drizzle -> shared D1
       -> /api/onboarding             -> questionnaire + profile -> Drizzle -> shared D1
       -> /api/onboarding/answer      -> validation + profile update -> Drizzle -> shared D1
       -> /api/onboarding/transcribe  -> authenticated audio -> Groq STT
       -> /api/onboarding/skip        -> profile skip metadata -> Drizzle -> shared D1
       -> /api/onboarding/complete    -> completion validation -> Drizzle -> shared D1
       -> /api/profile                -> learner profile read/update -> Drizzle -> shared D1
       -> /api/evaluate-speech        -> existing lesson evaluation
       -> static Vite assets
```

All onboarding and profile endpoints require a Better Auth session. The Worker
uses the session's user ID to address the learner profile; clients cannot submit
another user ID. Application routes receive the existing request-scoped Drizzle
client created from `env.DB`.

The frontend composes its protected gates explicitly:

```text
AuthGate
  -> OnboardingGate
       -> LessonPlayer
```

`AuthGate` remains responsible only for session restoration, sign-in, sign-up,
and sign-out. `OnboardingGate` loads the questionnaire and learner profile for
an authenticated session, renders onboarding when required, and otherwise
renders the lesson. The one-question form and profile editor share presentational
components and pure answer-state helpers.

## Data Model

Drizzle owns the complete application schema. The following tables are added to
`src/db/schema.ts` with typed relations to the existing Better Auth `user`
table. Drizzle Kit generates the SQL migration through `npm run db:generate`;
the generated migration is reviewed and committed before Wrangler applies it
locally or remotely. The feature does not add handwritten schema SQL or a
second migration system.

### `learner_profile`

Application learner data remains separate from Better Auth's core user table.
The first release supports one learner profile per authenticated user.

```text
id                       TEXT PRIMARY KEY
auth_user_id             TEXT UNIQUE NOT NULL
name                     TEXT
age                      INTEGER
answers_json             TEXT NOT NULL DEFAULT '{}'
questionnaire_version    INTEGER
current_question_key     TEXT
onboarding_status        TEXT NOT NULL
last_skipped_at          INTEGER
last_skipped_session_id  TEXT
completed_at             INTEGER
created_at               INTEGER NOT NULL
updated_at               INTEGER NOT NULL
```

`auth_user_id` references Better Auth's `user.id` with `ON DELETE CASCADE`.
`onboarding_status` is restricted to `not_started`, `in_progress`, or
`completed`. `answers_json` has a `CHECK (json_valid(answers_json))`
constraint.

The application treats `learner_profile.name` and `learner_profile.age` as the
canonical learner values. Better Auth's required account name remains auth
infrastructure and is not used as the learner profile source after onboarding.
The profile name may initially be prefilled from the authenticated account name.

### `questionnaire`

```text
id            TEXT PRIMARY KEY
version       INTEGER UNIQUE NOT NULL
status        TEXT NOT NULL
created_at    INTEGER NOT NULL
activated_at  INTEGER
```

Only one questionnaire has `status = 'active'`. Previous versions remain
available to interpret saved profiles.

### `questionnaire_question`

```text
id                    TEXT PRIMARY KEY
questionnaire_id      TEXT NOT NULL
answer_key            TEXT NOT NULL
position              INTEGER NOT NULL
prompt_en             TEXT NOT NULL
prompt_zh             TEXT
answer_type           TEXT NOT NULL
cardinality           TEXT NOT NULL
required              INTEGER NOT NULL
options_json          TEXT
validation_json       TEXT
branching_json        TEXT
audio_id              TEXT NOT NULL
```

`answer_key` is unique within a questionnaire. `answer_type` initially supports
`text`, `number`, and `choice`. `cardinality` is `scalar` or `array`, allowing
single choice, multiple choice, scalar text/number, and arrays of free-text or
choice values without adding more storage columns.

JSON configuration columns are nullable but must contain valid JSON when set.
Branching rules are declarative comparisons against previously confirmed stable
answer keys. Arbitrary code and model-generated branching are not supported.

## Answer Storage

The server owns the mapping from question keys to storage. A small allowlist
maps canonical keys such as `name` and `age` to dedicated profile columns. All
other keys are written beneath `answers_json`.

Example:

```json
{
  "favoriteCartoons": ["Bluey", "Paw Patrol"],
  "favoriteAnimals": ["dog", "dinosaur"],
  "favoriteActivities": ["drawing", "football"],
  "favoriteStoryTopics": ["space", "adventure"]
}
```

Questionnaire database content cannot choose arbitrary SQL column names. An
unknown answer key always targets `answers_json`. Retired JSON keys are retained
unless a separate, explicit data migration removes them.

Completed users retain the questionnaire version they completed. Activating a
new questionnaire affects new and incomplete profiles only; it does not reopen
onboarding for completed profiles. Completed users may still edit known fields
from profile settings.

## Questionnaire Publishing

The first release does not include an admin UI. A validated seed/publish command
checks a complete version and applies data-only statements to the shared D1
database through Wrangler. Application runtime reads and writes the published
records through Drizzle. The publisher does not own or alter table schema.
It activates a version only after checking:

- a supported version and unique stable keys;
- unique, contiguous ordering;
- four to six initial questions;
- supported answer types and cardinalities;
- valid option, validation, and branching JSON;
- branch references to earlier stable keys;
- no unreachable required questions; and
- an existing Peppa audio ID whose registered text exactly matches the English
  prompt.

The activation operation deactivates the prior active version and activates the
new version in one D1 batch. Saved-audio metadata remains in
`lib/static-audio.js`, and audio files remain source assets under
`public/assets/audio`. Publishing a prompt change therefore includes registering,
generating, testing, and deploying its matching saved audio entry.

## Audio and Transcription

Question and introduction audio is generated ahead of time with ElevenLabs and
stored as static source assets. Use the project's approved character-directed
pig voice (`Summer - British, Confident & Posh`) and preferred `eleven_v3`
model. Do not imitate or clone a protected character's exact voice. Runtime or
local system text-to-speech is not used.

The question record stores a stable `audio_id`, not a file path, voice ID, or
TTS setting. The publisher resolves it through `lib/static-audio.js` and
requires a `peppa` entry whose exact text matches `prompt_en`. The existing
static-audio registry owns the browser asset path. A question is not publishable
without registered metadata and an existing source file. The UI loads one
question and its resolved audio at a time, plays it after an allowed user
interaction, and always exposes Replay.

`POST /api/onboarding/transcribe` accepts a short authenticated audio upload.
It reuses the existing Groq Whisper transcription integration without lesson
phrase scoring. The endpoint returns transcript text only. It never writes the
transcript into the profile and never retains raw recordings.

For array answers, one transcription result becomes one editable pending value.
The UI does not guess how to split phrases such as "Bluey and Paw Patrol" into
multiple values. The learner can edit the value or add another value.

## API Contracts

### `GET /api/onboarding`

Returns the learner profile summary, the questionnaire version assigned to that
profile, saved answers, computed next question, progress, and whether the
current auth session may bypass onboarding because it was skipped.

An incomplete profile keeps its originally assigned questionnaire version even
if a newer version becomes active. This prevents the question set from changing
mid-flow.

### `PUT /api/onboarding/answer`

Accepts `{ questionKey, value }`. The server loads the assigned question,
validates the value, maps canonical fields to columns, stores other values in
JSON, advances `current_question_key`, and returns the next applicable question.

### `POST /api/onboarding/transcribe`

Accepts one bounded audio file and returns `{ transcript }`. It rejects
anonymous, malformed, oversized, unsupported, or excessively long inputs.

### `POST /api/onboarding/skip`

Stores the current session ID and timestamp without changing the profile to
completed. It returns permission for the current client session to open the
lesson.

### `POST /api/onboarding/complete`

Recomputes the applicable required questions from the assigned questionnaire
and saved answers. It marks the profile completed only when every applicable
required answer is valid.

### `GET /api/profile` and `PUT /api/profile`

Load and edit the authenticated learner profile with the same server validation
and answer-key mapping used during onboarding. Profile editing does not change a
completed user's questionnaire assignment automatically.

## Validation and Error Handling

The server derives answer rules from the assigned database question rather than
accepting answer metadata from the client. Validation includes:

- trimmed text and configured maximum length;
- numeric type and configured range;
- allowed option membership;
- scalar versus array shape;
- configured maximum array length;
- unique normalized array values; and
- required-answer checks after branching.

Invalid answers produce a field-level error and keep the learner on the current
question. A failed save preserves the editable answer locally and offers Retry.
A failed transcription leaves typing and configured choices available. Failed
question audio exposes Replay but does not block the form. Invalid questionnaire
configuration is not activated by the publisher; an unexpected runtime
configuration error shows a retryable state plus Skip rather than trapping the
learner.

All controls have visible focus states and accessible names. Voice is optional;
every question remains completable with standard form controls. Reduced-motion
preferences disable decorative character animation without removing state
feedback.

## Security and Privacy

- Every onboarding, transcription, and profile request requires a valid session.
- The user ID always comes from the server session.
- Raw onboarding audio is forwarded for transcription and not retained.
- Only a learner-confirmed value is persisted.
- Skip metadata stores the Better Auth session record ID, never the session
  cookie token.
- Audio size, MIME type, and duration are bounded.
- Profile and answer payload sizes are bounded.
- Database-defined storage targets cannot select arbitrary columns.
- API errors do not expose raw database, transcription-provider, or stack data.
- Deleting the Better Auth user cascades to the learner profile.

## Verification Strategy

Implementation follows test-first development for repository-owned behavior.

Pure tests cover:

- scalar and array validation;
- answer normalization and duplicate removal;
- canonical `name` and `age` column mapping;
- unknown-key JSON mapping;
- deterministic branching;
- next-question computation;
- version assignment;
- completion checks; and
- skip-session behavior.

Worker tests cover:

- anonymous rejection for every endpoint;
- questionnaire/profile loading;
- confirmed answer updates;
- column and JSON persistence;
- invalid and retired keys;
- partial resume;
- skip and completion transitions;
- completed-user behavior after a new questionnaire activates;
- transcription success and failure without audio persistence; and
- profile editing.

Infrastructure tests cover the Drizzle table definitions and relations, the
generated D1 migration, indexes, foreign keys, JSON constraints, the static
audio registry contract, and the validated publisher. UI-focused tests cover
loading, the `AuthGate -> OnboardingGate -> LessonPlayer` composition, the
one-question contract, audio replay, microphone state, editable transcription,
typed and choice fallback, array chips, validation errors, progress, Skip,
resume, completion, and keyboard use.

Local Worker-backed verification applies migrations and exercises registration,
onboarding, skip/resume, completion, profile editing, and lesson entry. Final
verification runs the existing unit test, lint, and production build commands
to catch lesson and speech-evaluation regressions.

## Out of Scope

- An admin questionnaire editor
- AI-generated questions or conversational follow-ups
- Raw audio storage or playback of learner recordings
- Runtime text-to-speech
- Exact protected-character voice cloning
- Multiple learner profiles under one authenticated account
- Automatically re-onboarding completed users after questionnaire changes
- Analytics dashboards or normalized per-answer analytics tables

## References

- [Cloudflare D1 JSON queries](https://developers.cloudflare.com/d1/sql-api/query-json/)
- [Cloudflare D1 query guidance](https://developers.cloudflare.com/d1/best-practices/query-d1/)
- [Better Auth database schema extension](https://better-auth.com/docs/concepts/database)
- [Better Auth users and accounts](https://better-auth.com/docs/concepts/users-accounts)
- [Drizzle ORM with Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
