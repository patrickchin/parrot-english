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
       -> /api/dubs/five-little-ducks-v2/* -> private R2 clip slots
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
- `src/app/HomeMenu.tsx` exposes the four learner activities, including Five
  Little Ducks dubbing.
- `src/auth` owns the Better Auth session, account UI, guardian-access state,
  password unlock, fixed expiry, and learner/guardian route boundaries.
- `src/learner-profile` owns onboarding and profile editing.
- `src/conversation` owns the learner-controlled LiveKit conversation surface.
- `src/lessons` owns the learner catalog/player and guardian-only custom lesson
  manager, creation, and editing.
- `src/stories` owns the stored-level learner shelf/reader and guardian-only
  story settings and personalized-art controls.
- `src/dubbing` owns the fixed Five Little Ducks script, studio, authenticated
  client, decoded take waveform, and synchronized replay. The traditional
  six-stanza script has 24 slots on a 98-second timeline with cues every four
  seconds and a six-second maximum for each recording.
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
information, speech evaluation, and Five Little Ducks dubbing. The
authenticated `/api/dubs/five-little-ducks-v2/*` family owns status, raw clip
upload, private clip streaming, and whole-dub reset. Static assets are the
final fallback.

`GET`, `POST`, and `DELETE /api/guardian-access` read, unlock, and lock the
current Better Auth session. Unlock verifies the current account password on
the server, is rate-limited, writes a fixed 15-minute expiry, and returns
`Cache-Control: no-store`. Expired rows are treated as absent and cleaned up
lazily. No password, guardian token, or mode history is stored.

One Worker dispatch guard returns `403 { "error": "guardian_required" }`
before profile reads/updates, profile preference changes, custom-lesson
creation/generation/updates, and personalized-art mutations when the current
session lacks a live unlock. Conversation start is purpose-aware: profile edits
always require the current session's live unlock, while onboarding remains
learner-safe only until the owner profile is completed or bypassed. The
authenticated `/review` endpoint is the sole conversation path that persists
profile answers and repeats that current-session check; browser `/finish` and
trusted-agent `/end` update conversation status only. Owner scoping, request
validation, rate limits, and art consent still run after the mode check;
learner-safe reads remain available.

The Worker and browser share the Drizzle schema in `src/db/schema.ts`. Better
Auth and product data use one D1 database. `guardian_session_unlock` is keyed
to the Better Auth session and stores `unlocked_at` plus indexed `expires_at`;
session deletion cascades to the unlock. `learner_profile.story_level` stores
one of the four supported IDs and defaults to `first-words` for existing and
new learners.

## Durable and Transient State

URLs are authoritative for durable screens, lesson scenes, story pages, the
Five Little Ducks dubbing studio, and guardian management. The learner story
shelf URL is canonicalized to the profile's stored `story_level`. Guardian mode
is server state for the current auth session, not a client-only role or
long-lived account permission. Lesson and dub playback phase, active recording,
evaluation, and current step are transient React state. Route changes invalidate
pending audio and recording work before a new scene is selected.

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
├── /dubs/five-little-ducks
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

Five Little Ducks voice clips use a generation marker and 24 format-agnostic
fixed slots beneath the existing private account-purge prefix:

```text
personalized-story-art/{encoded-user-id}/learner-dubs/
  five-little-ducks-v2/
    .dub-generation
    line-{1..24}.audio
```

The browser creates an object URL immediately from each finished MediaRecorder
`Blob`, decodes the same bytes to PCM for the visible waveform, and can replay
that local take before the learner advances. Upload and final replay remain
separate: R2 is the durable source of truth, while the local object URL exists
only for the current take-review state and is revoked when it is replaced or
abandoned. Final playback fetches the 24 authenticated clips and schedules
them, the procedural music bed, and SVG scene beats against one Web Audio
clock.

R2 is the source of truth. During normal studio use the marker carries a
generation and a `ready` or `deleting` state; status and playback expose only
clips owned by the current ready generation. Each new upload stores a
`parrot-dub-audio-v2` envelope with the generation and a request-unique upload
nonce before the raw audio payload.
Matching metadata records the payload offset, generation, and nonce so an
authenticated GET can conditionally validate the exact envelope and stream only
the payload.

Replacement conditionally writes the observed fixed slot and rechecks the
generation fence. Reset conditionally acquires a new `deleting` generation,
conditionally replaces all 24 fixed slots with generation-owned non-audio
tombstones, retires the same owner's legacy `five-little-ducks-v1/` namespace,
and then conditionally finalizes the v2 marker as `ready`; an interrupted reset
remains fenced until another DELETE completes it. Legacy retirement first
stores a terminal `account-deleting` marker and nine non-audio slot fences that
old v1 Workers recognize, then deletes every other object under that exact
prefix. The ten tiny fences remain so a v1 upload that passed its old marker
checks before a gradual deployment cannot recreate recording bytes. The
paginated sweep validates its exact prefix and cursor, rechecks ownership of the
observed v2 deleting marker around each page, and bounds retries for transient
R2 write-rate failures. Account deletion derives one stable generation from the
permanent D1
deletion tombstone, sweeps every non-closure object below the account prefix
(including the legacy v1 retirement closure), then conditionally persists a
terminal `account-deleting` marker followed by all 24 same-generation non-audio
slot fences. The exact 25-key closure—the marker plus 24 fences—is excluded from
every broad sweep, so concurrent deletion hooks converge instead of dismantling
one another. Better Auth can remove the user only after the complete closure
exists; ordinary dub resets cannot take over its terminal marker. The retained
objects contain no recording bytes. Dubs require no new D1 metadata or
migration because they reuse the existing deletion tombstone.

## Provider Boundaries

- Built-in lesson lines use checked-in ElevenLabs audio assets.
- Five Little Ducks line guides use checked-in ElevenLabs narrator MP3s; the
  browser never substitutes device speech for a missing guide.
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
