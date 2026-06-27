# Parrot English

One-page fixed-stage English speaking practice prototype for children.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Cloudflare Worker TypeScript REST API
- Groq speech evaluation behind a server-side `/api/evaluate-speech` route

The frontend is a Vite single-page app. The backend is a plain Cloudflare Worker
that serves static Vite assets and handles REST API requests before falling back
to `env.ASSETS.fetch(request)`.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm run generate:audio:elevenlabs -- --only=turn-hello --output-dir=/tmp/parrot-audio --force
```

`npm run dev` builds the Vite app and starts Wrangler on port 3000 so local
browser requests use the same Worker REST API shape as deployment.

## Environment

Set `GROQ_API_KEY` in `.dev.vars` for local speech evaluation calls. Keep real
keys out of source control. Runtime TTS is disabled: `/api/tts` returns `410`,
and the lesson plays saved audio files from `public/assets/audio`.

Optional Worker rate-limit settings for `/api/evaluate-speech`:

```bash
EVALUATE_RATE_LIMIT_MAX=8
EVALUATE_RATE_LIMIT_WINDOW_SECONDS=60
```

Set `ELEVENLABS_API_KEY` to regenerate saved lesson audio with ElevenLabs.
Use `--only=<audio-id>` while testing to avoid spending credits on all lines.
Do not use local or macOS system text-to-speech for Chinese lesson audio; use
ElevenLabs for regenerated Chinese assets.

Current generated voice direction:

- Pig example audio: ElevenLabs `Summer - British, Confident & Posh`
  (`Oqy85UMasXzUjUxF0ta5`) with `eleven_v3`.
- Parrot coach/Chinese audio: ElevenLabs `Chen - Friendly Narration Mandarin`
  (`4NQthjVhIGGVfL3Si000`) with `eleven_v3`.
  Chinese parrot lines use separate `ttsText` performance tags for a brighter,
  more energetic delivery while keeping the visible lesson text unchanged.
