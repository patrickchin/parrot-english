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
       -> /api/dubs/five-little-ducks-v1/* -> D1 consent + private R2 clip slots
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
- `src/dubbing` owns the fixed Five Little Ducks script, learner studio,
  guardian settings, authenticated client, and synchronized replay.
- `src/media` owns recording and browser playback adapters.
- `src/shared` owns reusable controls and cards.

Top-level learner navigation stays small. Management starts at `/guardian`,
with custom lesson authoring at `/guardian/lessons`, story controls at
`/guardian/stories`, and dubbing consent/deletion at `/guardian/dubbing`.
Retired experiment routes resolve through the wildcard home redirect and are
not accepted as authentication return targets.

## Worker Responsibilities

`worker/index.ts` authenticates protected requests, applies endpoint-specific
rate limits, and delegates to focused handlers. It exposes authentication,
guardian access, learner profile, conversations, My Lessons, story art, build
information, speech evaluation, and Five Little Ducks dubbing. The
authenticated `/api/dubs/five-little-ducks-v1/*` family owns consent-aware
status, raw clip upload, private clip streaming, durable consent grant, and
whole-dub revocation/deletion. Static assets are the final fallback.

`GET`, `POST`, and `DELETE /api/guardian-access` read, unlock, and lock the
current Better Auth session. Unlock verifies the current account password on
the server, is rate-limited, writes a fixed 15-minute expiry, and returns
`Cache-Control: no-store`. Expired rows are treated as absent and cleaned up
lazily. No password, guardian token, or mode history is stored.

One Worker dispatch guard returns `403 { "error": "guardian_required" }`
before profile reads/updates, profile preference changes, custom-lesson
creation/generation/updates, personalized-art mutations, dubbing consent grant,
and whole-dub deletion when the current session lacks a live unlock.
Conversation start is purpose-aware: profile edits
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
session deletion cascades to the unlock. `guardian_dub_consent` stores one
account-owned durable grant for consent contract `guardian-voice-r2-v2`, its
opaque grant generation, timestamps, and `granted` or `revoking` state. Its
account foreign key cascades on deletion. `learner_profile.story_level` stores
one of the four supported IDs and defaults to `first-words` for existing and new
learners.

## Durable and Transient State

URLs are authoritative for durable screens, lesson scenes, story pages, the
Five Little Ducks dubbing studio, and guardian management. The learner story
shelf URL is canonicalized to the profile's stored `story_level`. Guardian mode
is server state for the current auth session, not a client-only role or
long-lived account permission. Dubbing consent is deliberately different: its
version-2 grant is durable account state so a learner may record after guardian
mode is locked. Lesson and dub playback phase, active recording, evaluation,
and current step are transient React state. Route changes invalidate pending
audio and recording work before a new scene is selected.

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
│   ├── /guardian/stories
│   └── /guardian/dubbing
├── /profile                         (guardian after initial setup)
├── /profile/setup
└── /login
```

## Dubbing Capability Boundary

`GET /api/dubs/five-little-ducks-v1` returns `recordingEnabled`,
`consentState`, the fixed nine-line status shape, and consent contract
`guardian-voice-r2-v2`. Absence or `revoking` returns no saved lines and never
lists R2. Learners may upload, retake, read, and replay clips only while the
current D1 grant generation remains valid. The upload path captures that
generation, checks it around the conditional R2 write, and fences the exact
object it wrote if consent changes.

`PUT /api/dubs/five-little-ducks-v1/consent` accepts only the bounded version-2
attestation object under a live guardian unlock. Guardian-only
`DELETE /api/dubs/five-little-ducks-v1` changes D1 to `revoking` before R2
cleanup and removes the consent row only after cleanup succeeds. The learner
studio contains no self-attestation, `Grown-up options`, or delete action; it
retains recording, retakes, saved-line replacement, and final playback.

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

Five Little Ducks voice clips use a generation marker and nine format-agnostic
fixed slots beneath the existing private account-purge prefix:

```text
personalized-story-art/{encoded-user-id}/learner-dubs/
  five-little-ducks-v1/
    .dub-generation
    line-{1..9}.audio
```

R2 is the source of truth for clip bytes; D1 is the source of truth for whether
those clips may be used. Status returns `not_granted`, `granted`, or `revoking`
and does not list R2 when no current grant exists. During normal studio use the
marker carries a generation and a `ready` or `deleting` state; status and
playback expose only clips owned by both the current ready R2 generation and the
current D1 consent generation. Each new upload stores a `parrot-dub-audio-v2`
envelope with the generations and a request-unique upload nonce before the raw
audio payload.
Matching metadata records the payload offset, generation, and nonce so an
authenticated GET can conditionally validate the exact envelope and stream only
the payload.

Replacement conditionally writes the observed fixed slot and rechecks the
generation fence. Reset conditionally acquires a new `deleting` generation,
conditionally replaces all nine fixed slots with generation-owned non-audio
tombstones, and then conditionally finalizes the marker as `ready`; an
interrupted reset remains fenced until another DELETE completes it. Account
deletion derives one stable generation from the permanent D1 deletion
tombstone, sweeps every non-closure object below the account prefix, then
conditionally persists a terminal `account-deleting` marker followed by all
nine same-generation non-audio slot fences. The exact ten closure keys are
excluded from every broad sweep, so concurrent deletion hooks converge instead
of dismantling one another. Better Auth can remove the user only after the
complete closure exists; ordinary dub resets cannot take over its terminal
marker. The retained objects contain no recording bytes. Guardian revocation
first changes the D1 consent to `revoking`, completes the R2 tombstones, and
deletes the D1 consent row only after cleanup succeeds. New grants and all media
access fail closed while that cleanup is incomplete.

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
