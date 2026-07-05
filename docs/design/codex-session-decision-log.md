# Codex Session Decision Log

## Purpose

This log records the major product and architecture decisions established across
the Codex sessions for this repository. It is a decision summary, not a full
transcript.

## Current Decisions

| Prompt Theme | Decision | Current Surface |
| --- | --- | --- |
| Build a one-page interactive speaking experience. | Keep the first screen as a full-screen lesson stage with character-led scenes, microphone recording, evaluation, and audible feedback. | `src/App.tsx`, `src/styles.css` |
| Avoid a framework-heavy frontend. | Use Vite React plus a Cloudflare Worker with static assets and REST routes. | `vite.config.ts`, `worker/index.ts`, `wrangler.jsonc` |
| Make lessons easy to add and remove. | Store each lesson in `content/lessons/*.json` and discover files automatically for the picker. | `src/lesson-catalog.ts`, `content/lessons` |
| Break lessons into scenes and steps. | Give every scene setting metadata, a chosen background, visible characters, and ordered one-line dialogue steps. | `lib/lesson-data.js`, lesson JSON |
| Treat the learner like a character. | Use the global `user` character with the same emote map and rendering path as Peppa and Dolly. | `content/catalogs/characters.json`, `lib/lesson-scene.js` |
| Keep expressions manageable. | Use six global pre-generated emotes: idle, talking, listening, happy, sad, and surprised. | `content/catalogs/emotes.json`, `public/assets/characters` |
| Restore narration while keeping immersion. | Use a voice-only English narrator for story text, instructions, feedback, and final praise. | lesson JSON, `lib/lesson-audio.js`, `lib/lesson-scene.js` |
| Make the experience automatic. | Advance character, narrator, scene, retry, and completion steps automatically; wait only for hold-to-talk user input. | `lib/lesson-state.js`, `src/App.tsx` |
| Turn on the microphone only when needed. | Request access on button hold, stop on release, and stop tracks before evaluation. | `src/speech-recorder.ts`, `src/App.tsx` |
| Keep runtime speech reliable and predictable. | Play saved audio assets only; remove runtime TTS from the frontend and Worker. | `src/audio-playback.ts`, `worker/index.ts` |
| Prepare for automatic speech generation later. | Keep audio outside lesson JSON and resolve the optional cache by speaker plus exact text. | `lib/static-audio.js`, `scripts/generate-static-audio.mjs` |
| Use high-quality saved speech. | Generate cache files through ElevenLabs only, with speaker-selected voice defaults and `eleven_v3`. | `scripts/generate-static-audio.mjs` |
| Keep evaluation server-side. | Use Groq STT behind `/api/evaluate-speech`, local transcript scoring, rate limiting, and request timeouts. | `worker/groq.ts`, `lib/speech-scoring.js`, `worker/api-security.ts` |
| Preserve simple deployment. | Use the Worker-backed local server as the runtime source of truth; keep Vite-only mode for fast UI iteration. | `package.json`, `README.md` |

## Current Design Contract

- All child-facing lesson content is English.
- Peppa, Dolly, and `user` are visible catalog characters.
- Narrator is voice-only and has no emote entry.
- Lesson JSON contains text and catalog IDs, never asset filenames.
- Each step contains one line from one speaker and all visible emotes.
- Backgrounds and character states are pre-generated global assets.
- The learner presses and holds the microphone only for user steps.
- The rest of the lesson advances automatically.
- Saved audio is a speaker-plus-text cache, not lesson content.
- Groq is used for transcription/evaluation, not lesson narration.

## Risks and Follow-Ups

- Saved audio must be generated whenever a new non-user speaker/text pair is
  introduced; file-coverage tests guard this boundary.
- The current rate limiter is in-memory per Worker isolate rather than a durable
  global quota.
- Browser E2E checks depend on local browser tooling and remain separate from
  the baseline unit, lint, and build commands.
