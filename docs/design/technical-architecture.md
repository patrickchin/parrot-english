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
- `src/auth` owns Better Auth session and account UI.
- `src/learner-profile` owns onboarding and profile editing.
- `src/conversation` owns the learner-controlled LiveKit conversation surface.
- `src/lessons` owns the lesson catalog, player UI, custom lesson creation, and
  editing.
- `src/stories` owns the levelled story shelf and reader.
- `src/media` owns recording and browser playback adapters.
- `src/shared` owns reusable controls and cards.

Top-level navigation stays small. Custom lesson creation is reachable from
`/lessons`, not the learner home. Retired experiment routes resolve through the
wildcard home redirect and are not accepted as authentication return targets.

## Worker Responsibilities

`worker/index.ts` authenticates protected requests, applies endpoint-specific
rate limits, and delegates to focused handlers. It exposes authentication,
learner profile, conversations, My Lessons, build information, and speech
evaluation. Static assets are the final fallback.

The Worker and browser share the Drizzle schema in `src/db/schema.ts`. Better
Auth and product data use one D1 database, while each product handler enforces
owner scoping at its boundary.

## Durable and Transient State

URLs are authoritative for durable screens, lesson scenes, story pages, and
story shelf levels. Lesson playback phase, recording, evaluation, and current
step are transient React state. Route changes invalidate pending audio and
recording work before a new scene is selected.

```text
/
├── /talk-to-peppa
├── /lessons
│   ├── /lessons/parrot/:lessonId/scenes/:sceneNumber
│   ├── /lessons/my/:lessonId/scenes/:sceneNumber
│   ├── /lessons/my/create
│   └── /lessons/my/:lessonId/edit
├── /stories
│   └── /stories/:storyId/pages/:pageNumber
├── /profile
├── /profile/setup
└── /login
```

## Content Boundaries

- `content/lessons/*.json` owns built-in lesson scripts.
- `content/catalogs/*.json` owns shared character, emote, background, and cover
  references.
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
and authentication/profile boundaries from 280 px through desktop widths.
