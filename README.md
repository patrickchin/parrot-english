# Parrot English

List-first, scene-based English speaking practice for young learners.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Cloudflare Worker TypeScript REST API
- Better Auth with cookie-backed sessions
- Drizzle ORM over one shared Cloudflare D1 database
- Groq lesson generation, speech evaluation, onboarding transcription, and answer enrichment
- ElevenLabs saved prompt audio and runtime onboarding acknowledgments
- LiveKit WebRTC and Agents for purpose-specific Peppa conversations

The frontend is a Vite single-page app. The Worker serves the built assets and
handles API requests before falling back to `env.ASSETS.fetch(request)`.

## Commands

```bash
npm run dev
npm run build
npm run build:agent
npm run lint
npm test
npm run generate:audio:elevenlabs -- --only=narrator-copy-dolly --force
```

`npm run dev` builds the Vite app and starts Wrangler on port 3000, so local
browser requests use the deployment REST shape. Use it for the full app,
including authentication and Worker APIs. `npm run dev:vite` is only a
frontend convenience server and cannot provide the Better Auth or speech
evaluation Worker APIs.

## Local Authentication Setup

Create a local environment file, apply the local D1 migrations, and start the
Worker-backed app:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Replace `BETTER_AUTH_SECRET` with at least 32 random characters.
`BETTER_AUTH_URL` must exactly match the Worker origin; the default local value
is `http://localhost:3000`. `.dev.vars` is gitignored and must not be committed.

Drizzle owns the complete schema and migration history for the shared
`parrot-english` D1 database. Add future application tables to
`src/db/schema.ts`. After changing that schema, create and review a migration
before applying it:

```bash
npm run db:generate
npm run db:migrate:local
```

Do not run `npm run db:generate` for routine startup when the schema has not
changed; a clean no-drift result does not require a new migration.

## Lesson Content

Each file in `content/lessons/*.json` is discovered automatically and appears
as a playable card on the lesson list. Adding or removing a lesson requires no
registry edit. Disabled preview cards demonstrate upcoming lesson topics
without creating placeholder scripts or audio.

A lesson contains a story summary, a three-sentence detailed summary, two goal
phrases, and five to eight scenes. Every scene chooses a pre-generated
background while also describing its setting in free-form text. Each scene step
contains exactly one line of English dialogue, one speaker, and one emote for
every scripted scene character.

Lesson JSON deliberately contains no image or audio filenames. Scripted
character IDs, background IDs, and the six supported emotes are resolved
through the global catalogs in `content/catalogs`. Built-in lessons resolve
saved audio by speaker plus exact dialogue text in `lib/static-audio.js`.
Authenticated My Lessons are stored in D1 and use the browser's on-device
English speech synthesis, so generated and uploaded scripts can play without
creating audio assets.

Character subjects must be opaque against a transparent sprite background.
Partial alpha is reserved for antialiased subject edges.

## Environment

Set `GROQ_API_KEY` in `.dev.vars` for local speech evaluation. Keep real keys out
of source control. Optional evaluation limits are:

```bash
EVALUATE_RATE_LIMIT_MAX=8
EVALUATE_RATE_LIMIT_WINDOW_SECONDS=60
```

The same key powers Create Lesson script generation. Generation is protected by
the authenticated `LESSON_GENERATION_RATE_LIMITER` binding. Uploaded lesson
scripts are validated and stored directly without an AI generation request.

Voice onboarding also uses `GROQ_API_KEY` for child-safe summaries and playful
acknowledgments. Set `ELEVENLABS_API_KEY` in `.dev.vars` to speak those dynamic
acknowledgments; the browser never receives either provider key.

Email/password authentication currently has no email verification, password
reset, social sign-in, or Resend integration.

### Production Authentication Setup

The initial production D1 schema (`0000_better-auth.sql`) was applied on
2026-07-05. Production authentication still requires the Better Auth values to
be configured without committing them:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
npx wrangler secret put ELEVENLABS_API_KEY
```

Apply future reviewed migrations with:

```bash
npx wrangler d1 migrations apply parrot-english --remote
```

`BETTER_AUTH_SECRET` must be a production-only random value of at least 32
characters. `BETTER_AUTH_URL` must exactly match the deployed Worker origin.
The URL is not sensitive and can be moved to a Wrangler environment variable
later; it is stored as a secret here to match the current deployment procedure.

Set `ELEVENLABS_API_KEY` to generate missing saved lesson audio. Use
`--only=<audio-id>` to avoid spending credits on unrelated lines. Built-in
saved audio must be generated with ElevenLabs; do not substitute local or macOS
system speech for missing built-in assets. My Lessons deliberately use browser
on-device speech and do not require `ELEVENLABS_API_KEY`.

The default generator uses ElevenLabs `eleven_v3` and selects a voice from the
manifest speaker:

- Peppa: `Oqy85UMasXzUjUxF0ta5` (Summer)
- Dolly: `5N1BjZ10t6GcJUhZCP40` (Adaline)
- Narrator: `pFZP5JQG7iQjIQuC4Bku` (Lily)

Override one speaker with `ELEVENLABS_PEPPA_VOICE_ID`,
`ELEVENLABS_DOLLY_VOICE_ID`, or `ELEVENLABS_NARRATOR_VOICE_ID`. The general
`ELEVENLABS_VOICE_ID` remains a fallback override.

## Realtime Peppa Conversations

When `REALTIME_CONVERSATIONS_ENABLED=1`, the same LiveKit agent supports three
explicit conversation purposes with separate system prompts:

- onboarding is a first introduction that learns name, age, and a few interests;
- profile editing asks what the learner wants to change or add and persists it;
- Talk to Peppa is ordinary small chat and never updates the learner profile.

All three permit interruption and an immediate finish. Onboarding and profile
editing also accept uncertainty, silence, and refusal without pressure. The
existing six-question experience remains the complete keyboard/recording form
fallback for onboarding while the flag is `0`.

The Worker stores every finalized conversation transcript turn, including
partial or abandoned sessions. Onboarding and profile editing can also persist
one cumulative “About this learner” paragraph in D1; small chat cannot.
Raw audio is not stored: LiveKit session recording is explicitly disabled with
`record: false`. Onboarding completes only when the agent learned both name and
age; otherwise it grants the existing session-scoped bypass. The active agent
creates no structured fact rows. The legacy fact table remains dormant for
rollback safety, while conversation rows cascade from the Better Auth user and
remain until account deletion under the current retention policy.

The browser receives only a short-lived, room-scoped LiveKit participant token.
LiveKit and ingest secrets stay on the Worker or agent. The agent uses explicit
LiveKit Inference model IDs for ElevenLabs Scribe STT, OpenAI LLM reasoning, and
ElevenLabs `eleven_v3` TTS with the Summer character-directed voice. It does not
claim to be a named television character and does not use an exact protected
voice clone.

See [the LiveKit agent deployment runbook](docs/deployment/livekit-agent.md) for
local setup, secrets, deployment, cost dependencies, smoke testing, and
feature-flag rollback.

### Form fallback

The six v2 questions ship with the Worker in the checked-in questionnaire at
`content/learner-profile/questionnaire-v2.json`. Changing a prompt requires ordinary
code review and deployment; there is no questionnaire publishing command.

Every confirmed answer is stored as prose in `learner_profile.answers_json`
with the exact question, raw answer, concise summary, playful acknowledgment,
enrichment status, and server timestamp. Canonical name and age remain in their
existing profile columns as well. Groq enrichment is persisted before the
Worker requests optional acknowledgment audio from ElevenLabs, so a TTS failure
does not lose the answer.

The normalized `questionnaire` and `questionnaire_question` tables remain
dormant for rollback safety. Runtime onboarding no longer reads or writes them;
removing them requires a later reviewed migration.

## Design Docs

Project design and architecture notes live in [docs/README.md](docs/README.md).
