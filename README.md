# Parrot English

List-first, scene-based English speaking practice for young learners.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Cloudflare Worker TypeScript REST API
- Better Auth with cookie-backed sessions
- Drizzle ORM over one shared Cloudflare D1 database
- Groq speech evaluation, onboarding transcription, and answer enrichment
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
npm run test:browser
npm run verify:backgrounds
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
cp .env.example .env.local
npm run db:migrate:local
npm run dev
```

Replace `BETTER_AUTH_SECRET` with at least 32 random characters.
`BETTER_AUTH_URL` must exactly match the Worker origin; the default local value
is `http://localhost:3000`. Add a Turnstile widget in Cloudflare, then put its
secret key in `.dev.vars` as `TURNSTILE_SECRET_KEY` and its public site key in
`.env.local` as `VITE_TURNSTILE_SITE_KEY`. Both local files are gitignored and
must not be committed.

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

## Learner and Guardian Modes

Every authenticated Guardian account can own one or more learner profiles and
starts in learner mode. A single owned learner may be selected automatically;
a multi-learner session with no valid selection shows the required
`Who is learning now?` picker immediately. Learner mode contains Talk to
Peppa, lesson playback, stories at the
selected learner's stored level, and consented recording activities. Its
profile dropdown exposes `Switch learner` and the grown-up access action; it
does not expose profile editing, consent, AI/data, sign-out, or deletion
controls.

The current temporary flow opens `Grown-up access` without asking for the
account password again. Selecting it, or entering a declared Guardian route
directly, automatically grants the authenticated Better Auth session Guardian
access for a fixed 15 minutes; refreshes may resume the grant, but activity does
not extend it. Genuine grant failures stay on the requested URL with a visible
retry. This passwordless handoff is a temporary weaker boundary:
authentication, account ownership, and Guardian-only management authorization
remain enforced. `/guardian` is the management dashboard. Its
`Switch to learner` action and the learner account menu share the chooser that
changes the session's learner selection. `/guardian/learners` owns learner
creation and deletion, while
`/guardian/learners/:learnerId` owns page-local details and lesson-recording
consent, while `/guardian/dubbing` owns dubbing consent and cleanup. The legacy
profile and Guardian URLs use the same boundary. Manage learners never changes
learner mode. Switching from Guardian mode selects the named learner, removes
the unlock, then opens the requested learner route; switching from learner mode
selects the learner and returns home without a Guardian lock request.
Individual deletion requires confirmation, rejects the final learner, keeps
failed cleanup retryable, and never auto-selects a sibling after deleting the
active learner.

The same-origin `GET|POST|DELETE /api/guardian-access` endpoint reports,
creates, or removes the current session unlock. D1 table
`guardian_session_unlock` stores its fixed expiry, while
`learner_profile.story_level` retains the starting shelf level for existing
profiles. Learners can move among every built-in story level directly on the
story shelf. The Worker returns `guardian_required` for protected profile and
profile-edit conversation requests made in learner mode.

## Lesson Content

Each file in `content/lessons/*.json` is discovered automatically and appears
as a playable card on the lesson list. Adding or removing a lesson requires no
registry edit.

A lesson contains display summaries, zero or more goal phrases, and one or more
scenes. Every scene chooses a supported background while also describing its
setting in free-form text. Each scene step contains dialogue and one speaker.
Optional partial emote maps change only the listed characters, and optional
`check` objects on user steps define pronunciation responses and retry behavior.

Lesson JSON deliberately contains no image or audio filenames. Scripted
character IDs, background IDs, and the six supported emotes are resolved
through the global catalogs in `content/catalogs`. Built-in lessons resolve
saved audio by speaker plus exact dialogue text in `lib/static-audio.js`.

Character subjects must be opaque against a transparent sprite background.
Partial alpha is reserved for antialiased subject edges.

Approved lesson backgrounds are published outside Git to Cloudflare R2. The
catalog keeps stable background IDs, descriptive alt text, and versioned media
URLs. See [the R2 background-media runbook](docs/deployment/background-media-r2.md)
for bucket setup, staging, dry-run publishing, verification, and rollback.

Private learner recordings use opaque account and learner IDs in R2 so email
addresses and child names do not become object keys. To browse those prefixes
with human labels, print the read-only D1 directory locally or remotely:

```bash
npm run inspect:private-media -- --local
npm run inspect:private-media -- --remote --account
```

The output contains private account data; keep it out of shared logs and issue
reports. Each row includes the exact R2 prefix to paste into the Cloudflare
dashboard.

## Environment

Set `GROQ_API_KEY` in `.dev.vars` for local speech evaluation and profile
enrichment. Keep real keys out of source control. Optional evaluation limits
are:

```bash
EVALUATE_RATE_LIMIT_MAX=8
EVALUATE_RATE_LIMIT_WINDOW_SECONDS=60
```

Voice onboarding also uses `GROQ_API_KEY` for child-safe summaries and playful
acknowledgments. Set `ELEVENLABS_API_KEY` in `.dev.vars` to speak those dynamic
acknowledgments; the browser never receives either provider key.

Email/password authentication currently has no email verification, password
reset, social sign-in, or Resend integration. Signed-out visitors can also
continue as a guest. Turnstile creates a separate normal Better Auth session
for one durable shared guest identity; returning-user sign-in does not require
a challenge. All account and learner data saved through that identity is shared
between guest users. Signing out revokes only the current session, and the
shared identity cannot be deleted.

### Production Authentication Setup

The initial production D1 schema (`0000_better-auth.sql`) was applied on
2026-07-05. Production authentication still requires the Better Auth values to
be configured without committing them:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
npx wrangler secret put TURNSTILE_SECRET_KEY
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
Create a production Turnstile widget for the deployed hostnames, store its
secret with Wrangler as shown above, and set its public site key as the GitHub
Actions repository variable `TURNSTILE_SITE_KEY` before deploying.

Set `ELEVENLABS_API_KEY` to generate missing saved lesson audio. Use
`--only=<audio-id>` to avoid spending credits on unrelated lines. Built-in
saved audio must be generated with ElevenLabs; do not substitute local or macOS
system speech for missing built-in assets.

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
one cumulative “About this learner” paragraph in D1; small chat cannot. Live
turns use one LLM inference each because the agent exposes no profile-writing
tools. After the conversation finishes, the Worker makes one separate structured
Groq call over the saved transcript and persists the resulting profile.
Raw audio is not stored: LiveKit session recording is explicitly disabled with
`record: false`. Onboarding completes only when the finished transcript provides
both name and age; otherwise it grants the existing session-scoped bypass. The
active agent creates no structured fact rows. Migration 0016 drops the legacy
`conversation_fact` table, so it is absent from current and fresh deployments;
conversation rows cascade from the Better Auth user and remain until account
deletion under the current retention policy.

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
