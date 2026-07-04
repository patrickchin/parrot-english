# Technical Architecture Design

## Summary

Parrot English is a Vite React single-page app served by a Cloudflare Worker.
The Worker serves built assets from `dist` and owns the small REST API surface
under `/api/*`.

The app intentionally does not use Next.js. A prior refactor removed Next/vinext
so the frontend can remain a plain browser client and the backend can remain a
plain Worker REST handler.

## Runtime Shape

Production and local Worker mode use this shape:

```text
Browser
  -> Cloudflare Worker
       -> /api/evaluate-speech
       -> static Vite assets through env.ASSETS
```

Important entrypoints:

- `index.html`: Vite HTML entrypoint.
- `src/main.tsx`: React bootstrap and E2E-only browser mock import.
- `src/App.tsx`: declarative client routes, data-driven lesson list and player
  UI, audio sequencing, recording, and evaluation effects.
- `worker/index.ts`: Worker fetch handler and route dispatch.
- `wrangler.jsonc`: Worker assets and compatibility configuration.

## Client Routing

The app uses React Router in Declarative Mode. `src/App.tsx` defines these
routes:

- `/`: lesson list.
- `/lessons/:lessonNumber`: redirects to page 1 for a playable lesson.
- `/lessons/:lessonNumber/pages/:pageNumber`: the addressed lesson page.

Lesson and page numbers are one-based catalog positions. `lib/lesson-routes.js`
parses and validates the route parameters against the catalog loaded from
`lib/lessons.json`. Invalid numbers, unavailable lessons, and out-of-range pages
redirect to `/`.

Cloudflare's `single-page-application` asset fallback serves the app shell for
refreshes and direct navigation to nested client URLs.

## Lesson State Machine

The lesson state machine lives in `lib/lesson-state.js`.

Implemented phases:

- `idle`
- `example-speaking`
- `parrot-coaching`
- `listening`
- `evaluating`
- `feedback`
- `finished`

Implemented transition summary:

```text
START
  -> example-speaking
EXAMPLE_DONE
  -> parrot-coaching
COACH_DONE
  -> listening
recordSpeechClip done
  -> evaluating
EVALUATED passed and not final step
  -> feedback with lastOutcome=advance
EVALUATED passed and final step
  -> finished
EVALUATED failed with retry remaining
  -> feedback with lastOutcome=retry
feedback audio done and retry
  -> example-speaking
feedback audio done and success
  -> routed NEXT and example-speaking for the next step
Next button while successful feedback is visible
  -> example-speaking for the next step
```

The state machine keeps successful feedback anchored to the completed step while
its audio plays. When successful feedback audio completes, the routed `NEXT`
transition updates both the lesson state and page URL. The user can also click
the scene Next control to advance while successful feedback is still visible.

## Scene Presentation

Scene presentation lives in `lib/lesson-scene.js`. It maps lesson state plus the
current lesson step into a UI-friendly presentation object:

- background asset
- Peppa asset and bubble
- Polly asset and bubble
- active speaker
- status text

The presentation layer is intentionally separate from the React component so
tests can verify state-specific copy and character focus without rendering the
full app.

## Audio Sequencing

Audio sequencing lives in `lib/lesson-audio.js`.

Current rules:

- `example-speaking` plays `step.audio.example` as Peppa.
- `parrot-coaching` plays `step.audio.prompt` as Polly, then
  `step.audio.model` as the model line.
- `feedback` finds a static audio line whose text matches `state.feedback`.
- `finished` plays `finished`.
- Successful feedback dispatches routed `NEXT` after its audio completes.
- The scene Next control can dispatch the same transition while successful
  feedback is visible.
- Retry feedback dispatches `RETRY` after the feedback audio completes.

`src/audio-playback.ts` only supports static audio assets for live lesson
playback. Worker/runtime TTS is intentionally absent from the playback API.

There is also no `/api/tts` Worker route. Lesson audio must come from saved
assets.

## Speech Recording

Recording lives in `src/speech-recorder.ts` and is called from the `listening`
effect in `src/App.tsx`.

Design rules:

- The start button does not request microphone access.
- Microphone access is requested only when the state enters `listening`.
- MediaRecorder support is checked before permission is requested.
- The media stream is stopped when recording finishes or is aborted.
- Speech evaluation starts after recording has ended and the mic is off.
- One `AbortController` covers the listening turn so navigation or phase changes
  can cancel recording/fetch work.

The default recording duration is 4.2 seconds, with echo cancellation and noise
suppression enabled.

## Speech Evaluation API

`/api/evaluate-speech` is handled by `worker/groq.ts`.

Request contract:

- Method: `POST`
- Body: `multipart/form-data`
- Required fields:
  - `targetText`
  - `audio`

Worker behavior:

- Requires `GROQ_API_KEY`.
- Rejects invalid form data, missing target text, missing audio, and audio over
  6 MiB.
- Sends the audio to Groq STT with `whisper-large-v3-turbo`.
- Times out the upstream Groq request after 15 seconds by default.
- Scores the transcript locally using `lib/speech-scoring.js`.
- Returns transcript, similarity, pass/fail, feedback text, and retry hint.

Scoring behavior:

- Normalizes punctuation, case, whitespace, and a small contraction map.
- Uses Levenshtein similarity.
- Pass threshold is `0.74`.
- Empty transcript produces the no-speech feedback.

## API Security

`worker/api-security.ts` owns the in-memory per-client rate limit for
`/api/evaluate-speech`.

Default rate limit:

- Max requests: `8`
- Window: `60` seconds

Configurable environment variables:

- `EVALUATE_RATE_LIMIT_MAX`
- `EVALUATE_RATE_LIMIT_WINDOW_SECONDS`
- `GROQ_REQUEST_TIMEOUT_MS`, capped at 60000

The rate limit is per Worker isolate and should be treated as a practical guard,
not a globally strict durable quota.

## Development Modes

Use `npm run dev` as the source-of-truth local mode. It builds the Vite app and
runs Wrangler on port 3000, so browser requests use the same Worker REST shape as
production.

`npm run dev:vite` starts the frontend-only Vite server. It is useful for fast UI
iteration but does not represent the full Worker app unless explicit mocks are
enabled.

## E2E Test Harness

The Vite config has an E2E-only mock middleware for `/api/evaluate-speech` when
`PARROT_E2E_MOCK_API=1`.

The browser bootstrap can import `src/e2e-browser-mocks.ts` when
`VITE_PARROT_E2E=1`. That mock layer avoids real mic, MediaRecorder, and audio
playback dependencies in browser-flow tests.

The current Maestro runner is `npm run test:maestro`. It is separate from
`npm test` because it depends on local browser tooling and available disk/temp
space.

## Verification Baseline

Small changes should run the narrowest relevant test first. Before shipping a
combined app state, run:

```bash
npm test
npm run lint
npm run build
```

Use `npm run dev` for a Worker-backed manual check when API behavior matters.
