# AI Lesson Director Roadmap

This roadmap splits the AI lesson director work into independently shippable
plans. The goal is to preserve the existing lesson shell, assets, microphone
flow, speech evaluation, and tests while replacing lesson orchestration in
small steps.

## Recommended Order

1. [Director Packet Foundation](./2026-06-27-director-packet-foundation-plan.md)
   - Adds lesson JSON, packet schema validation, a mock director, and a packet
     runner/rendering path.
   - Does not call an LLM.
   - Does not add runtime TTS.

2. [Worker AI Director](./2026-06-27-worker-ai-director-plan.md)
   - Adds `/api/lesson-director`.
   - Assembles the system prompt and request payload.
   - Validates AI output and falls back to deterministic packets.

3. [Speech and TTS Runtime](./2026-06-27-speech-tts-runtime-plan.md)
   - Adds audio handling for director `speech[]` segments.
   - Uses static audio first and cached generated audio for dynamic segments.
   - Keeps the browser silent during recording.

4. [AI Lesson Migration](./2026-06-27-ai-lesson-migration-plan.md)
   - Moves the current lesson into the director JSON format.
   - Gates the director flow behind a feature flag.
   - Retires old deterministic modules only after packet flow is verified.

## Cross-Cutting Decisions

- **Do not restart the app.** The current stage, asset registry, mic flow,
  speech evaluator, Worker shell, and tests are useful. Replace orchestration,
  not the whole product.
- **Start with a mock director.** The frontend should prove it can consume
  packets before AI and TTS are introduced.
- **Validate every director response.** Invalid JSON, unknown poses, unknown
  scenes, mixed-language speech segments, and bad targets should become
  deterministic fallback packets.
- **Keep speech evaluation separate.** The director reacts to `passed`,
  `similarity`, transcript, and reason; it does not score pronunciation.
- **Treat TTS as the riskiest subsystem.** Runtime generation affects cost,
  latency, quality, and reliability. It should be added after packet rendering
  works.
- **Keep the AI bounded.** The director is not open chat. It may only use
  provided characters, scenes, targets, assets, world rules, and character
  personas.
- **Minimize session state.** Send current scene, attempt count, success repeat
  count, compact previous-turn summaries, and latest child result. Do not send
  unbounded transcript history.
- **Plan for latency.** The UI needs a visible director-loading state and audio
  generation state so the lesson never appears frozen.
- **Plan for cost.** Rate-limit director calls, cap turns per packet, cache TTS
  by segment hash, and prefer static audio when available.
- **Log packet health.** Track packet IDs, validation failures, fallback usage,
  director latency, TTS latency, and target text. Do not log child audio content.
