# Parrot English

One-page, scene-based English speaking practice for young learners.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Cloudflare Worker TypeScript REST API
- Better Auth with cookie-backed sessions
- Drizzle ORM over one shared Cloudflare D1 database
- Groq speech evaluation behind `/api/evaluate-speech`

The frontend is a Vite single-page app. The Worker serves the built assets and
handles API requests before falling back to `env.ASSETS.fetch(request)`.

## Commands

```bash
npm run dev
npm run build
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
in the lesson picker. Adding or removing a lesson requires no registry edit.

A lesson contains a story summary, a three-sentence detailed summary, two goal
phrases, and five to eight scenes. Every scene chooses a pre-generated
background while also describing its setting in free-form text. Each scene step
contains exactly one line of English dialogue, one speaker, and one emote for
every visible character.

Lesson JSON deliberately contains no image or audio filenames. Visible
character IDs, background IDs, and the six supported emotes are resolved through
the global catalogs in `content/catalogs`. Saved audio is an optimization cache
resolved by speaker plus exact dialogue text in `lib/static-audio.js`.

## Environment

Set `GROQ_API_KEY` in `.dev.vars` for local speech evaluation. Keep real keys out
of source control. Optional evaluation limits are:

```bash
EVALUATE_RATE_LIMIT_MAX=8
EVALUATE_RATE_LIMIT_WINDOW_SECONDS=60
```

Email/password authentication currently has no email verification, password
reset, social sign-in, or Resend integration.

### Production Authentication Setup

The initial production D1 schema (`0000_better-auth.sql`) was applied on
2026-07-05. Production authentication still requires the Better Auth values to
be configured without committing them:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
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
`--only=<audio-id>` to avoid spending credits on unrelated lines. Saved audio
must be generated with ElevenLabs; do not substitute local or macOS system
speech.

The default generator uses ElevenLabs `eleven_v3` and selects a voice from the
manifest speaker:

- Peppa: `Oqy85UMasXzUjUxF0ta5`
- Dolly: `4NQthjVhIGGVfL3Si000`
- Narrator: `4NQthjVhIGGVfL3Si000`

Override one speaker with `ELEVENLABS_PEPPA_VOICE_ID`,
`ELEVENLABS_DOLLY_VOICE_ID`, or `ELEVENLABS_NARRATOR_VOICE_ID`. The general
`ELEVENLABS_VOICE_ID` remains a fallback override.

## Design Docs

Project design and architecture notes live in [docs/README.md](docs/README.md).
