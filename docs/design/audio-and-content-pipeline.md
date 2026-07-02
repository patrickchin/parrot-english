# Audio and Content Pipeline Design

## Summary

Lesson speech is delivered from saved audio files in `public/assets/audio`.
Runtime text-to-speech is disabled for the live app. The only live speech API
call in normal lesson flow is speech-to-text evaluation through
`/api/evaluate-speech`.

This design came from reliability and voice-quality decisions made during the
project: Groq TTS model availability changed, native Mandarin delivery mattered,
and child-facing lesson audio should not fail at runtime.

## Source of Truth

The source audio assets live in:

```text
public/assets/audio
```

The built copies live in:

```text
dist/assets/audio
```

`dist` is build output. Do not edit `dist` audio directly.

The audio manifest lives in `lib/static-audio.js`. It maps stable audio IDs to:

- language
- source path
- visible text
- optional generation-only `ttsText`
- optional voice/performance metadata

## Runtime Playback Rules

`src/audio-playback.ts` only accepts static asset audio lines for live playback.
There is no Worker/runtime TTS branch in the playback API.

There is no `/api/tts` Worker route. Runtime TTS is absent from both the
frontend playback API and the Worker API surface.

This is intentional. A missing saved audio line should fail during development
or tests instead of silently spending TTS credits or breaking a live lesson.

## Voice Direction

Current generated voice direction:

- Pig example audio: ElevenLabs `Summer - British, Confident & Posh`
  (`Oqy85UMasXzUjUxF0ta5`) with `eleven_v3`.
- Polly/Chinese coach audio: ElevenLabs `Chen - Friendly Narration Mandarin`
  (`4NQthjVhIGGVfL3Si000`) with `eleven_v3`.

Chinese Polly lines should use:

```js
voiceStyle: "energetic-character"
```

They should also use `ttsText` performance tags such as `[excited]`,
`[brightly]`, `[cheerful]`, or `[upbeat]`. The visible `text` must remain clean
and child-facing; performance tags belong only in `ttsText`.

## Generation Command

Use ElevenLabs for regenerated Chinese lesson audio. Do not use local or macOS
system text-to-speech for Chinese lesson audio.

Common command:

```bash
npm run generate:audio:elevenlabs -- --only=turn-hello --output-dir=/tmp/parrot-audio --force
```

Environment:

```bash
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_v3
```

Use `--only=<audio-id>` while testing so a small change does not regenerate every
asset or spend unnecessary credits.

## Generator Behavior

The generator is `scripts/generate-static-audio.mjs`. It is ElevenLabs-only
and requests MP3 output for the `.mp3` paths declared in `STATIC_AUDIO_LINES`.

The generator reads line metadata from `STATIC_AUDIO_LINES` and uses:

- `line.ttsText ?? line.text` for ElevenLabs text.
- energetic voice settings when `voiceStyle === "energetic-character"`.
- character voice settings when `style === "character"`.
- the pig voice for English lines and the parrot voice for Chinese lines unless
  `ELEVENLABS_VOICE_ID` is explicitly configured.

## Adding or Changing Lines

When adding or changing a playable lesson:

1. Add or update the lesson entry in `lib/lesson-data.js`.
2. Add or update its ordered `steps`.
3. Set each step's `audio.example`, `audio.prompt`, and `audio.model` IDs.
4. Add matching static audio manifest entries in `lib/static-audio.js`.
5. Regenerate the source audio in `public/assets/audio`.
6. Run focused lesson-data, static/audio, and build checks.
7. Run `npm run build` so `dist` contains the updated assets.

When removing a lesson, remove its catalog entry from `LESSONS`. Remove static
audio manifest entries and source audio files only when no remaining lesson step
uses those audio IDs.

For feedback text, the exact visible feedback string must match an entry in the
static audio manifest. `lib/lesson-audio.js` resolves feedback audio by text, so
copy drift will throw `Missing static feedback audio`.

## Native Mandarin Quality Rules

The prompt history repeatedly called out that the Chinese lines must sound
native and that Polly should be more energetic. Current policy:

- Keep the Mandarin voice native.
- Change performance direction with ElevenLabs voice settings and `ttsText`
  tags before changing to a non-native voice.
- Use character-directed voices, not protected-character clones.
- Keep visible lesson copy clean and separate from generation-only tags.

## Audio QA Checklist

After regenerating audio:

- Confirm the changed `public/assets/audio/*.mp3` files exist.
- Confirm MP3 format and playback manually if the line is user-facing.
- Run static audio tests.
- Run `npm run build`.
- If verifying a running Worker build, confirm public and `dist` audio hashes
  match for regenerated files.
- Hit one regenerated asset URL from the local server, for example:

```bash
curl -I http://localhost:3000/assets/audio/turn-hello.mp3
```
