# Technical Architecture

## Runtime Shape

Parrot English is a React 19 and Vite single-page app served by a Cloudflare
Worker. React Router owns durable browser navigation. The Worker owns the REST
API and falls back to static Vite assets for non-API requests.

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/* -> Better Auth -> Drizzle -> D1
       -> /api/learner-profile/* -> Groq / ElevenLabs -> D1
       -> /api/guardian-access -> Better Auth password check -> D1
       -> /api/conversations/* -> LiveKit -> D1
       -> /api/lessons/my/* -> OpenAI -> D1
       -> /api/evaluate-speech -> Groq
       -> static Vite assets
```

There is no separate game document, Phaser runtime, pixel-lesson API, or
prototype build entry in the shipped product.

## Browser Responsibilities

- `src/main.tsx` mounts one `BrowserRouter`.
- `src/app/App.tsx` composes route guards and owns lesson playback effects.
- `src/app/app-routes.ts` owns canonical paths, safe return targets, and route
  decisions.
- `src/app/HomeMenu.tsx` exposes the three learner activities.
- `src/auth` owns the Better Auth session, account UI, guardian-access state,
  password unlock, fixed expiry, and learner/guardian route boundaries.
- `src/learner-profile` owns onboarding and profile editing.
- `src/conversation` owns the learner-controlled LiveKit conversation surface.
- `src/lessons` owns the learner catalog/player and guardian-only custom lesson
  manager, creation, and editing.
- `src/stories` owns the stored-level learner shelf/reader and guardian-only
  story settings and personalized-art controls.
- `src/media` owns recording and browser playback adapters.
- `src/shared` owns reusable controls and cards.

Top-level learner navigation stays small. Management starts at `/guardian`,
with custom lesson authoring at `/guardian/lessons` and story controls at
`/guardian/stories`. Retired experiment routes resolve through the wildcard
home redirect and are not accepted as authentication return targets.

## Worker Responsibilities

`worker/index.ts` authenticates protected requests, applies endpoint-specific
rate limits, and delegates to focused handlers. It exposes authentication,
guardian access, learner profile, conversations, My Lessons, story art, build
information, and speech evaluation. Static assets are the final fallback.

`GET`, `POST`, and `DELETE /api/guardian-access` read, unlock, and lock the
current Better Auth session. Unlock verifies the current account password on
the server, is rate-limited, writes a fixed 15-minute expiry, and returns
`Cache-Control: no-store`. Expired rows are treated as absent and cleaned up
lazily. No password, guardian token, or mode history is stored.

One Worker dispatch guard returns `403 { "error": "guardian_required" }`
before profile reads/updates, profile preference changes, custom-lesson
creation/generation/updates, and personalized-art mutations when the current
session lacks a live unlock. Profile-edit conversation start/review/finalize
uses the same check inside the purpose-aware conversation handler. Owner
scoping, request validation, rate limits, and art consent still run after the
mode check; learner-safe reads remain available.

The Worker and browser share the Drizzle schema in `src/db/schema.ts`. Better
Auth and product data use one D1 database. `guardian_session_unlock` is keyed
to the Better Auth session and stores `unlocked_at` plus indexed `expires_at`;
session deletion cascades to the unlock. `learner_profile.story_level` stores
one of the four supported IDs and defaults to `first-words` for existing and
new learners.

## Durable and Transient State

URLs are authoritative for durable screens, lesson scenes, story pages, and
guardian management. The learner story shelf URL is canonicalized to the
profile's stored `story_level`. Guardian mode is server state for the current
auth session, not a client-only role or long-lived account permission. Lesson
playback phase, recording, evaluation, and current step are transient React
state. Route changes invalidate pending audio and recording work before a new
scene is selected.

```text
/
├── /talk-to-peppa
├── /lessons
│   ├── /lessons/parrot/:lessonId/scenes/:sceneNumber
│   ├── /lessons/my/:lessonId/scenes/:sceneNumber
│   ├── /lessons/my/create                       (guardian)
│   └── /lessons/my/:lessonId/edit               (guardian)
├── /stories
│   └── /stories/:storyId/pages/:pageNumber
├── /guardian
│   ├── /guardian/lessons
│   └── /guardian/stories
├── /profile                         (guardian after initial setup)
├── /profile/setup
└── /login
```

## Content Boundaries

- `content/lessons/*.json` owns built-in lesson scripts.
- `content/catalogs/*.json` owns shared character, emote, background, and cover
  references.
- `src/lessons/full-scene-lessons.ts` maps each ready-made lesson scene to its
  checked-in 16:9 illustration.
- `lib/static-audio.js` owns saved speech keyed by speaker and exact text.
- `src/stories/story-script-candidates.ts` owns the twenty learner stories.
- `content/learner-profile/questionnaire-v2.json` owns form-fallback prompts.

Built-in lesson JSON never stores asset filenames. My Lessons are validated
against the same contract and stored in D1. Story scripts retain internal
vocabulary and prompt metadata for validation, but the learner UI consumes only
level, cover, title, summary, pages, and join-in content.

## Provider Boundaries

- Built-in lesson lines use checked-in ElevenLabs audio assets.
- My Lessons use cancellable browser English speech.
- Groq evaluates lesson speech and supports profile enrichment.
- OpenAI generates custom lesson drafts.
- LiveKit carries realtime conversation audio; the agent uses explicit model
  IDs and purpose-specific prompts.

Provider keys remain on the Worker or agent. The browser receives only
same-origin API responses and short-lived room-scoped LiveKit tokens.

## Verification

The required local product gates are:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Responsive browser coverage includes the home, headers, lesson catalog, lesson
player, story shelf, story reader, conversation surface, custom lesson flows,
authentication/profile boundaries, learner/guardian switching, unlock errors,
lock errors, refresh persistence, expiry, and protected deep links from 280 px
through desktop widths. Guardian/learner responsive gates explicitly cover
280x568, 320x568, 390x844, 640x360, and 1440x900.
