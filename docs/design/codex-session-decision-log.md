# Codex Session Decision Log

## Purpose

This log captures the major design and architecture decisions that came from the
Codex sessions for this project. It is not a complete transcript. It records the
prompt themes, the decisions that followed, and where those decisions now live
in the codebase.

Source: Codex thread previews and latest thread summaries for sessions in
`/Users/patchin/Workspace/test/Parrot English`, read on 2026-06-27.

## Session-Derived Decisions

| Prompt Theme | Decision | Current Surface |
| --- | --- | --- |
| Build a one-page interactive child speech-learning MVP with a Peppa-style scene and a parrot the child copies. | Keep the app as a one-page full-screen lesson stage with character-led speech bubbles, simple animation, microphone recording, transcription, scoring, and feedback. | `src/App.tsx`, `lib/lesson-*`, `public/assets/*` |
| Decide between Cloudflare Pages and Vercel, then avoid Next.js. | Use Vite React plus a Cloudflare Worker with static assets and REST routes. Remove Next/vinext. | `vite.config.ts`, `worker/index.ts`, `wrangler.jsonc` |
| Clarify whether Vercel-like Cloudflare linking exists. | Direct Wrangler deploy works; Cloudflare Workers Builds/Git integration can be used for GitHub-linked deploys, but GitHub Actions requires `CLOUDFLARE_API_TOKEN`. | deployment workflow notes, `wrangler.jsonc` |
| Groq TTS failed and model availability changed. | Do not rely on runtime TTS for lesson playback. Use saved audio assets and remove runtime TTS from the frontend/Worker surface. | `src/audio-playback.ts`, `worker/index.ts`, `lib/static-audio.js` |
| Block runtime TTS and rate-limit speech evaluation before pushing. | Runtime TTS is now absent from the app and Worker API. `/api/evaluate-speech` has an in-memory client rate limit before calling Groq. | `worker/api-security.ts`, `worker/index.ts` |
| Chinese audio was not native enough. | Regenerate Chinese lesson audio with ElevenLabs, not local/macOS TTS. Use native Mandarin voice direction. | `AGENTS.md`, `README.md`, `scripts/generate-static-audio.mjs` |
| Polly needs to be more energetic. | Keep the native Mandarin voice but add energetic Eleven v3 performance prompts and voice settings for Polly/Chinese lines. | `lib/static-audio.js`, `scripts/generate-static-audio.mjs` |
| Revise who says what; no separate host is necessary. | Use two visible characters. Peppa gives English examples. Polly gives Chinese prompts and feedback. | `lib/lesson-data.js`, `lib/lesson-audio.js`, `lib/lesson-scene.js` |
| The user did not understand when to speak or when the app speaks. | Make active speaker and lesson phase explicit through state labels, speech bubbles, and audio sequencing. | `lib/lesson-scene.js`, `lib/lesson-progress.js`, `src/App.tsx` |
| The child needs lots of repetition and obvious speaking prompts with audible praise/feedback. | Create the child speaking flow spec; make feedback audible and make speaking states more explicit. | `docs/superpowers/specs/2026-06-27-child-speaking-flow-design.md`, `src/App.tsx` |
| The microphone listening state must be really obvious. | Add a dedicated assertive speak-now/evaluating panel with mic symbol, target phrase, waveform bars, and progress. | `src/App.tsx`, `src/styles.css`, `tests/microphone-prompt-ui.test.mjs` |
| Only turn on the mic when needed. | Remove mic access from lesson start. Request microphone only during `listening`, then stop tracks before evaluation. | `src/speech-recorder.ts`, `src/App.tsx` |
| Do not continue automatically; require clicking Next. | **Superseded.** Successful feedback now advances automatically through routed `NEXT` when its audio completes; scene Next can also advance while feedback is visible. | `lib/lesson-state.js`, `lib/lesson-audio.js`, `src/App.tsx` |
| The flow text was duplicated. | Keep full feedback in Polly's bubble; use short flow banner labels for phase/status. | `lib/lesson-progress.js`, `src/App.tsx` |
| Speech bubbles should be closer to the speaker. | Treat bubble placement as part of speaker clarity; keep Peppa/Polly bubbles visually tied to their characters. | `src/styles.css` |
| Match back/forward buttons to a provided reference and use PNGs. | The project iterated on nav artwork. The current checked-in assets are the source of truth; avoid assuming SVG/PNG requirements without checking actual files. | `public/assets/ui`, `src/App.tsx` |
| Character PNGs had unintended interior transparency. | Preserve outside transparency while removing interior alpha holes in character assets. | `public/assets/characters/*.png` |
| Clean assets, icons, and metadata. | Keep app metadata and install icons filled out for the prototype. | `public/manifest.webmanifest`, icon/social assets |
| Write Maestro tests and avoid LLM calls. | Add an E2E mode that mocks browser media and `/api/evaluate-speech`; keep it separate from normal runtime. | `.maestro/`, `src/e2e-browser-mocks.ts`, `vite.config.ts`, `scripts/run-maestro-tests.mjs` |
| Run locally. | Use `npm run dev` and Wrangler on port 3000 as the accurate local app because it includes Worker routes. | `README.md`, `package.json` |
| Why are there both port 3000 and 5173? | Port 3000 is Worker-backed source of truth. Port 5173 is Vite-only convenience for fast frontend iteration. | `README.md`, `package.json` |
| Set `GROQ_API_KEY` in Cloudflare. | Groq key belongs in Worker secrets, not source. Local `.dev.vars` is only for development. | `.dev.vars.example`, `worker/groq.ts` |
| Push and update Cloudflare. | Verify tests/lint/build, push `main`, and deploy with Wrangler when immediate Cloudflare update is needed. | `package.json`, `wrangler.jsonc` |
| Review architecture cleanup. | Remove old refactor leftovers when they no longer match decisions: dead runtime TTS paths, host/parrot wording, unused metadata, and stale docs. | `src/audio-playback.ts`, typed `lib/*` JSDoc, this docs pass |

## Current Design Contract

The current design contract implied by the prompt history is:

- The app is a child-facing, one-page speaking lesson, not a generic dashboard or
  marketing site.
- The lesson list is the normal first screen; explicit E2E autostart opens the
  lesson stage directly.
- Peppa demonstrates English; Polly coaches in Chinese and gives feedback.
- Saved audio is part of the product, not an optional enhancement.
- Runtime lesson TTS is absent; lesson playback is static-asset only.
- Groq is used for STT/evaluation, not for live lesson narration.
- The microphone is requested only at the speaking turn.
- The speaking turn must be unmistakable.
- Success continues automatically after feedback audio; scene Next can advance
  while feedback is visible.
- The Worker-backed local server is the source of truth for runtime behavior.

## Risks and Follow-Ups

The prompt history also exposes a few open risks:

- The detailed child-speaking spec recommends extra repetition after success,
  but the current implementation advances after one successful attempt when
  feedback audio completes (or when scene Next is clicked).
- The scene asset map names future character poses, but the current assets reuse
  one image per character.
- The rate limiter is in-memory per Worker isolate, not a durable global quota.
- The E2E Maestro flow can be blocked by local browser tooling or disk/temp
  capacity, so it should not be treated as the baseline verification command.
- Cloudflare Git-triggered deploys require correct Cloudflare credentials or
  dashboard Git integration; direct Wrangler deploy can still update production.
