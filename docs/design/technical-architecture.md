# Technical Architecture Design

## Summary

Parrot English is a Vite React single-page app served by a Cloudflare Worker.
The Worker serves built assets from `dist` and owns the REST API surface under
`/api/*`. Runtime lesson playback uses saved static audio; the only live speech
service in a lesson is speech evaluation.

## Runtime Shape

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/* -> Better Auth -> Drizzle -> shared D1
       -> /api/evaluate-speech
       -> /api/onboarding/* -> Groq -> learner_profile -> ElevenLabs
       -> static Vite assets through env.ASSETS
```

The React Better Auth client talks to Better Auth on the Worker at
`/api/auth/*`. Better Auth stores users, accounts, sessions, and verification
records through Drizzle in the same `parrot-english` D1 database used for all
future application data. Browser sessions use HTTP cookies.

Important entrypoints:

- `src/App.tsx`: lesson selection, rendering, audio sequencing, hold-to-talk,
  and evaluation effects.
- `src/lesson-catalog.ts`: eager Vite discovery and validation of lesson JSON.
- `lib/lesson-state.js`: pure automatic scene/step runner and scene controls.
- `lib/lesson-scene.js`: catalog-backed presentation data.
- `lib/lesson-audio.js`: speaker-plus-text saved-audio resolution.
- `src/AuthGate.tsx`: session-aware sign-in/sign-up UI and lesson gating.
- `src/auth-client.ts`: same-origin Better Auth React client.
- `src/db/schema.ts`: complete Drizzle schema for the shared D1 database.
- `worker/auth.ts`: Better Auth Worker configuration and Drizzle adapter.
- `worker/index.ts`: Worker routing and static fallback.
- `worker/onboarding.ts`: checked-in questionnaire orchestration and profile API.
- `worker/onboarding-enrichment.ts`: strict Groq summary/acknowledgment boundary.
- `worker/onboarding-acknowledgment-audio.ts`: server-only ElevenLabs TTS.

## Authentication

The browser uses the Better Auth React client with same-origin requests. The
Worker mounts Better Auth at `/api/auth/*`, and the Drizzle adapter persists its
schema in the shared D1 database:

```text
Browser Better Auth React client
  -> Worker /api/auth/*
       -> Better Auth
            -> Drizzle ORM
                 -> shared D1 database: parrot-english
```

The current auth schema contains `user`, `session`, `account`, and
`verification` tables. Drizzle owns the entire database schema and migration
history, not only the auth tables. Future application tables belong in
`src/db/schema.ts` and must be added through generated, reviewed migrations.

Email/password authentication is enabled without email verification. Password
reset, social providers, and email delivery (including Resend) are not
configured. The server applies Better Auth endpoint rate limiting and trusts
`cf-connecting-ip` for the client address. `BETTER_AUTH_SECRET` must contain at
least 32 characters, and `BETTER_AUTH_URL` must exactly match the Worker origin.

`src/AuthGate.tsx` uses the session state to show loading and failure states,
render sign-in/sign-up controls for anonymous users, and render lesson content
only for an authenticated user. Signing out returns the app to the auth gate.

## Content Boundaries

Three boundaries keep lesson authoring simple:

1. `content/lessons/*.json` owns story text, scene order, speakers, catalog IDs,
   and emote choices.
2. `content/catalogs/*.json` owns global character, emote, background, and
   visual asset definitions.
3. `lib/static-audio.js` owns the saved-speech cache keyed by speaker plus exact
   dialogue.

Lesson JSON never contains asset filenames. `src/lesson-catalog.ts` uses eager
`import.meta.glob` discovery, so adding or removing a valid lesson file changes
the picker automatically.

Voice onboarding is a separate checked-in content boundary. The Worker imports
and validates `content/onboarding/questionnaire-v2.json`; it does not fetch
question definitions from D1. Fixed prompt IDs resolve through
`lib/static-audio.js`, while each dynamic acknowledgment is synthesized by the
Worker after its answer snapshot is durable.

The separate `learner_profile` table stores canonical name and age columns plus
a versioned `answers_json` envelope. Each response snapshot contains the exact
question, raw prose, summary, acknowledgment, enrichment status, and timestamp.
The old normalized `questionnaire` and `questionnaire_question` tables remain
dormant for rollback safety and are not part of the v2 runtime path.

`lib/lesson-data.js` validates both catalogs and lessons. It enforces English
text, exact root/scene/step fields, five to eight scenes, two goal phrases,
complete emote maps, modeled user lines, and final narrator praise containing
the configured child name.

## Lesson State Machine

Implemented phases:

- `idle`
- `paused`
- `speaking`
- `waiting-for-user`
- `recording`
- `evaluating`
- `feedback`
- `finished`

Core transitions:

```text
PLAY_SCENE -> first step of the current scene
PAUSE_SCENE -> paused at the beginning of the current scene
SCENE_PREVIOUS -> first step of the previous scene
SCENE_NEXT -> first step of the next scene
REPLAY_LESSON -> first step of the first scene
LINE_DONE -> next scripted step
MIC_STARTED -> recording
MIC_RELEASED -> evaluating
EVALUATED passed -> narrator feedback -> next step
EVALUATED first miss -> narrator feedback -> previous model -> same user step
EVALUATED second miss -> narrator feedback -> next step
final LINE_DONE -> finished
```

Scripted steps and scene boundaries advance automatically during uninterrupted
playback. Back, Next, Pause, Play, and Replay Lesson restart at scene boundaries
rather than resuming an interrupted step. The reducer stores only the current
scene/step indices and interaction state; the lesson remains immutable content
supplied to each transition.

## Scene Presentation

`lib/lesson-scene.js` resolves the current background and selected emotes through
the global catalog. It filters `user` only at the presentation boundary, so the
learner remains complete in validated script data but is not returned as a
visible character. It returns generic character objects, active-speaker state,
setting metadata, and either character speech or narrator speech. React does
not contain character-specific rendering branches.

## Audio Sequencing

`lib/lesson-audio.js` resolves speaking and feedback phases through
`getStaticAudioLineForSpeech(speaker, text)`. This supports identical dialogue
spoken by different characters with different voices and cache files.

`src/audio-playback.ts` accepts static assets only. There is no `/api/tts`
Worker route. A missing cache entry or file is a development error and must not
silently trigger billable runtime generation.

## Speech Recording

`src/speech-recorder.ts` exposes a recording session with `stop()` and
`cancel()`. `src/App.tsx` starts it on pointer/keyboard press and stops it on
release.

Rules:

- Lesson start does not request microphone access.
- MediaRecorder support is checked before permission is requested.
- Releasing before permission resolves cancels the pending turn safely.
- Tracks stop before evaluation starts.
- Scene controls cancel active playback, recording, and evaluation before they
  pause or change scenes.
- Abort controllers cancel pending recording, evaluation, and playback when the
  lesson changes or the component unmounts.

## Speech Evaluation API

`/api/evaluate-speech` is handled by `worker/groq.ts`. It accepts multipart form
data containing `targetText` and `audio`, sends audio to Groq STT with
`whisper-large-v3-turbo`, and scores the transcript locally through
`lib/speech-scoring.js`.

The endpoint requires an authenticated Better Auth cookie session. The Worker
checks the session before its speech limiter or Groq handler runs; anonymous
requests receive `401 {"error":"unauthorized"}`. Authenticated requests still
require `GROQ_API_KEY`, reject audio over 6 MiB, and have a configurable upstream
timeout. `worker/api-security.ts` applies an in-memory per-client rate limit
with defaults of eight requests per 60 seconds.

## Voice Onboarding APIs

`AuthGate -> OnboardingGate -> LessonExperience` remains the browser gate order.
Authenticated onboarding accepts one editable prose answer at a time. The
Worker derives all question metadata from the checked-in questionnaire, sends
only the current question and raw answer to Groq, validates strict structured
output, writes the complete snapshot to shared D1, and then sends only the saved
acknowledgment to ElevenLabs. Provider failures use deterministic text fallback;
TTS failure returns the saved acknowledgment with no audio.

Incomplete v1 profiles restart v2 with their original JSON under
`legacyAnswers`; completed v1 users remain completed. Session bypass records
keep their existing exact-session semantics. Answer/profile enrichment and
transcription have authenticated per-user and per-client rate limits.

Production requires:

```bash
npx wrangler secret put ELEVENLABS_API_KEY
```

Questions deploy with code. The deployment workflow still applies reviewed D1
migrations, but it does not publish questionnaire data rows.

## Development and Verification

`npm run dev` is the Worker-backed source of truth on port 3000 and provides the
auth and speech APIs. `npm run dev:vite` is useful only for frontend iteration;
it cannot provide the Worker API surface.

For a fresh local environment:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Run `npm run db:generate` before the migration command only after changing
`src/db/schema.ts`. Keep `.dev.vars` out of source control, use a random
`BETTER_AUTH_SECRET` of at least 32 characters, and keep `BETTER_AUTH_URL`
identical to the local Worker origin.

The initial production D1 schema (`0000_better-auth.sql`) was applied on
2026-07-05. Production authentication still requires
`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to be configured before deployment.
Apply later schema changes deliberately with
`npx wrangler d1 migrations apply parrot-english --remote` after review.

Before shipping a combined change, run:

```bash
npm test
npm run lint
npm run build
```
