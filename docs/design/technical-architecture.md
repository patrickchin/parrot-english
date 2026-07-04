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
       -> /api/evaluate-speech
       -> static Vite assets through env.ASSETS
```

Important entrypoints:

- `src/App.tsx`: lesson selection, rendering, audio sequencing, hold-to-talk,
  and evaluation effects.
- `src/lesson-catalog.ts`: eager Vite discovery and validation of lesson JSON.
- `lib/lesson-state.js`: pure automatic scene/step runner.
- `lib/lesson-scene.js`: catalog-backed presentation data.
- `lib/lesson-audio.js`: speaker-plus-text saved-audio resolution.
- `worker/index.ts`: Worker routing and static fallback.

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

`lib/lesson-data.js` validates both catalogs and lessons. It enforces English
text, exact root/scene/step fields, five to eight scenes, two goal phrases,
complete emote maps, modeled user lines, and final narrator praise containing
the configured child name.

## Lesson State Machine

Implemented phases:

- `idle`
- `speaking`
- `waiting-for-user`
- `recording`
- `evaluating`
- `feedback`
- `finished`

Core transitions:

```text
START -> first scripted step
LINE_DONE -> next scripted step
MIC_STARTED -> recording
MIC_RELEASED -> evaluating
EVALUATED passed -> narrator feedback -> next step
EVALUATED first miss -> narrator feedback -> previous model -> same user step
EVALUATED second miss -> narrator feedback -> next step
final LINE_DONE -> finished
```

Scene boundaries are traversed automatically. The reducer stores only the
current scene/step indices and interaction state; the lesson remains immutable
content supplied to each transition.

## Scene Presentation

`lib/lesson-scene.js` resolves the current background and every visible
character's selected emote through the global catalog. It returns generic
character objects, active-speaker state, setting metadata, and either character
speech or narrator speech. React does not contain character-specific rendering
branches.

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
- Abort controllers cancel pending recording, evaluation, and playback when the
  lesson changes or the component unmounts.

## Speech Evaluation API

`/api/evaluate-speech` is handled by `worker/groq.ts`. It accepts multipart form
data containing `targetText` and `audio`, sends audio to Groq STT with
`whisper-large-v3-turbo`, and scores the transcript locally through
`lib/speech-scoring.js`.

The endpoint requires `GROQ_API_KEY`, rejects audio over 6 MiB, and has a
configurable upstream timeout. `worker/api-security.ts` applies an in-memory
per-client rate limit with defaults of eight requests per 60 seconds.

## Development and Verification

`npm run dev` is the Worker-backed source of truth on port 3000.
`npm run dev:vite` is useful for frontend-only iteration.

Before shipping a combined change, run:

```bash
npm test
npm run lint
npm run build
```
