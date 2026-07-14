# Technical Architecture Design

## Summary

Parrot English is a Vite React single-page app served by a Cloudflare Worker.
The Worker serves built assets from `dist` and owns the REST API surface under
`/api/*`. React Router owns durable browser navigation below one
`BrowserRouter`. Built-in lesson playback uses saved static audio; My Lessons
use browser on-device English speech. The only remote live speech service in a
lesson remains speech evaluation.

## Runtime Shape

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/* -> Better Auth -> Drizzle -> shared D1
       -> /api/evaluate-speech
       -> /api/learner-profile/* -> Groq -> learner_profile -> ElevenLabs
       -> /api/lessons/my/* -> OpenAI -> learner_lesson
       -> static Vite assets through env.ASSETS
```

The React Better Auth client talks to Better Auth on the Worker at
`/api/auth/*`. Better Auth stores users, accounts, sessions, and verification
records through Drizzle in the same `parrot-english` D1 database used for all
future application data. Browser sessions use HTTP cookies.

Browser code is grouped by responsibility under `src/app`, `src/auth`,
`src/conversation`, `src/learner-profile`, `src/lessons`, `src/media`,
`src/shared`, and `src/testing`. Only the browser entrypoint, global CSS,
lesson CSS, and Vite declarations remain as files directly under `src`.

Important entrypoints:

- `src/main.tsx`: mounts the single browser router around the application.
- `src/app/App.tsx`: route guards and adapters, lesson rendering, audio sequencing,
  hold-to-talk, and evaluation effects.
- `src/app/app-routes.ts`: canonical path builders, safe return-path parsing, and
  source-specific route decisions.
- `src/app/HomeMenu.tsx` and `src/app/FeaturePlaceholder.tsx`: the authenticated home
  and intentional future-feature skeletons.
- `src/lessons/LessonCreator.tsx`, `src/lessons/LessonEditor.tsx`, and
  `src/lessons/my-lessons-api.ts`: generate/upload/edit preview, persistence,
  and same-origin learner lesson requests.
- `src/lessons/lesson-catalog.ts`: eager Vite discovery and validation of lesson JSON.
- `lib/lesson-state.js`: pure automatic scene/step runner and scene controls.
- `lib/lesson-scene.js`: catalog-backed presentation data.
- `lib/lesson-audio.js`: speaker-plus-text saved-audio resolution.
- `src/auth/AuthGate.tsx`: session-aware sign-in/sign-up UI and lesson gating.
- `src/auth/auth-client.ts`: same-origin Better Auth React client.
- `src/db/schema.ts`: complete Drizzle schema for the shared D1 database.
- `worker/auth.ts`: Better Auth Worker configuration and Drizzle adapter.
- `worker/index.ts`: Worker routing and static fallback.
- `worker/learner-profile.ts`: checked-in questionnaire orchestration and profile API.
- `worker/learner-profile-enrichment.ts`: strict Groq summary/acknowledgment boundary.
- `worker/learner-profile-acknowledgment-audio.ts`: server-only ElevenLabs TTS.
- `worker/conversations.ts`: purpose-aware conversation creation and ingest API.
- `agent/peppa-conversation.ts`: distinct onboarding, profile-edit, and small-chat prompts.
- `src/media/device-speech.ts`: cancellable local English speech for My Lessons.
- `worker/my-lessons.ts` and `worker/lesson-generator.ts`: owner-scoped lesson
  persistence, warning-based normalization, and structured OpenAI generation.

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

`src/auth/AuthGate.tsx` uses the session state to show loading and failure states,
render sign-in/sign-up controls at `/login`, and render protected routes only
for an authenticated user. A protected request while signed out redirects to
`/login?returnTo=...`; only validated same-origin application paths are
accepted. Signing out returns the app to the login route.

After authentication, `LearnerProfileGate` checks the learner profile. Incomplete
learners remain at `/profile/setup`; completed learners continue to the preserved
destination. The normal completed sequence is therefore authentication →
learner introduction → the four-card home at `/`.

## Browser Route Ownership

The URL is authoritative for durable screens and lesson scenes:

```text
/
├── /lessons
│   ├── /lessons/parrot/:lessonId/scenes/:sceneNumber
│   ├── /lessons/my/:lessonId/scenes/:sceneNumber
│   └── /lessons/my/create
├── /progress
├── /stories
├── /profile
├── /login
└── /profile/setup
```

`/lessons` combines two presentation sections without combining their data
ownership. Parrot lessons are checked-in JSON. Learner-created lessons belong
to the D1 `learner_lesson` table and use the `/lessons/my/*` namespace;
the built-in catalog has no D1 lesson rows, and the route namespace prevents an
identical ID from conflicting. Create Lesson is implemented; Progress and
Storytelling remain skeleton routes.

Scene URLs are one-based and durable. Button-driven scene changes navigate
first and reconcile reducer state to the new route. Browser Back/Forward and a
direct refresh select the routed scene and reset its player state. Playback,
recording, evaluation, scripted response, and step position remain transient
React state and never become URL parameters.

## Content Boundaries

Three boundaries keep lesson authoring simple:

1. `content/lessons/*.json` owns story text, scene order, speakers, catalog IDs,
   and emote choices.
2. `content/catalogs/*.json` owns global character, emote, background, and
   visual asset definitions.
3. `lib/static-audio.js` owns the saved-speech cache keyed by speaker plus exact
   dialogue.

Learner-created lessons form a fourth, database-backed boundary. They are
validated against the same contract, scoped by `auth_user_id`, and never written
into `content/lessons` or mixed into the built-in Parrot content namespace.

Lesson JSON never contains asset filenames. `src/lessons/lesson-catalog.ts` uses eager
`import.meta.glob` discovery, so adding or removing a valid lesson file changes
the picker automatically.

Voice onboarding is a separate checked-in content boundary. The Worker imports
and validates `content/learner-profile/questionnaire-v2.json`; it does not fetch
question definitions from D1. Fixed prompt IDs resolve through
`lib/static-audio.js`, while each dynamic acknowledgment is synthesized by the
Worker after its answer snapshot is durable.

The separate `learner_profile` table stores canonical name and age columns plus
a versioned `answers_json` envelope. Each response snapshot contains the exact
question, raw prose, summary, acknowledgment, enrichment status, and timestamp.
The old normalized `questionnaire` and `questionnaire_question` tables remain
dormant for rollback safety and are not part of the v2 runtime path.

`lib/lesson-data.js` strictly validates built-in catalogs and lessons, while
learner drafts pass through a warning-based normalization boundary. Missing
display fields receive defaults, unsupported backgrounds fall back to the first
catalog background, unsupported speakers become narrator, invalid or duplicate
characters are removed, and invalid supplied emotes become `idle`. Partial
emote maps inherit prior scene state. Optional user-step checks validate safe
scripted responses; invalid draft checks are omitted with a warning. Scripts
may use any language, flexible scene and phrase counts, extra metadata,
independent user lines, and any ending. Only malformed JSON, oversized input,
or a draft with no playable dialogue remains fatal. Generate uses OpenAI JSON
Object Mode so repairable output reaches this boundary instead of failing
provider-side schema validation.

## Lesson State Machine

Implemented phases:

- `idle`
- `paused`
- `speaking`
- `waiting-for-user`
- `recording`
- `evaluating`
- `responding`
- `finished`

Core transitions:

```text
PLAY_SCENE -> first step of the current scene
PAUSE_SCENE -> paused at the beginning of the current scene
SCENE_PREVIOUS -> first step of the previous scene
SCENE_NEXT -> first step of the next scene
SELECT_SCENE -> clean state at the scene selected by the browser URL
REPLAY_LESSON -> first step of the first scene
LINE_DONE -> next scripted step
MIC_STARTED -> recording
MIC_RELEASED without check -> next scripted step
MIC_RELEASED with check -> evaluating
EVALUATED -> authored correct/incorrect/noInput response
RESPONSE_DONE with retry -> previous model -> same user step
RESPONSE_DONE with continue -> next scripted step
final LINE_DONE -> finished
```

Scripted steps and scene boundaries advance automatically during uninterrupted
playback. The mounted lesson UI exposes Start or Replay Lesson and Previous/Next;
these actions restart at scene boundaries rather than resuming an interrupted
step. `PAUSE_SCENE` remains an internal reducer transition and is not currently
exposed as a control. The reducer stores the current scene/step indices and
interaction state; the lesson remains immutable content supplied to each
transition. A route-activity generation guard invalidates playback, microphone,
recording, and evaluation completions captured before a routed scene change.

## Scene Presentation

`lib/lesson-scene.js` resolves the current background and inherited partial
emote changes through the global catalog. It filters `user` only at the
presentation boundary, so the learner remains complete in validated script
data but is not returned as a
visible character. It returns generic character objects, active-speaker state,
setting metadata, and either character speech or narrator speech. React does
not contain character-specific rendering branches.

## Audio Sequencing

`lib/lesson-audio.js` resolves speaking and responding phases through
`getStaticAudioLineForSpeech(speaker, text)`. This supports identical dialogue
spoken by different characters with different voices and cache files.

For Parrot Lessons, `src/media/audio-playback.ts` accepts those static assets only. For
My Lessons, the same state machine yields source-independent speaker/text and
`src/media/device-speech.ts` uses the local Web Speech API. Both paths share the same
AbortSignal lifecycle. There is no `/api/tts` Worker route; missing built-in
audio never silently falls back to device or billable runtime generation.

## Speech Recording

`src/media/speech-recorder.ts` exposes a recording session with `stop()` and
`cancel()`. `src/app/App.tsx` starts it on pointer/keyboard press and stops it on
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

## Voice Learner Profile APIs

`AuthGate -> LearnerProfileGate -> ApplicationRoutes` is the browser gate order.
Authenticated onboarding accepts one editable prose answer at a time. The
Worker derives all question metadata from the checked-in questionnaire, sends
only the current question and raw answer to Groq, validates strict structured
output, writes the complete snapshot to shared D1, and then sends only the saved
acknowledgment to ElevenLabs. Provider failures use deterministic text fallback;
TTS failure returns the saved acknowledgment with no audio.

Realtime conversation creation requires an explicit purpose. `onboarding`
collects the first profile, `profile-edit` updates remembered details, and
`small-chat` provides ordinary Talk to Peppa conversation without profile
finalization. All three live tasks are tool-free so each child turn needs one LLM
inference. The purpose is stored as the conversation scenario key and carried in
signed LiveKit participant metadata to the agent. When onboarding or profile
editing finishes, the Worker derives the profile once from the persisted
transcript with strict structured output; that finalization call is outside the
live response path.

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

Cloudflare must serve the SPA entry document for non-API paths that do not
match a physical asset. `wrangler.jsonc` therefore keeps
`assets.not_found_handling` set to `single-page-application`. Without that
fallback, refreshing `/progress` or a nested lesson scene would return a 404
before React Router can resolve the route. API paths continue to be handled by
the Worker before the static asset fallback.

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
