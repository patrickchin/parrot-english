# Audio and Content Pipeline Design

## Summary

Lesson scripts are editable JSON text. Visual and audio files live outside the
lesson so authors can add or remove story content without managing filenames.
All active lesson dialogue, instructions, and feedback are in English.

Built-in Parrot Lesson playback uses saved audio in `public/assets/audio`.
Authenticated My Lessons use browser on-device English speech synthesis.
Neither playback mode adds audio fields to the lesson-authoring format.

## Sources of Truth

- Lessons: `content/lessons/*.json`
- My Lessons: validated JSON in the D1 `learner_lesson` table
- Global emotes: `content/catalogs/emotes.json`
- Global characters and sprite paths: `content/catalogs/characters.json`
- Global backgrounds: `content/catalogs/backgrounds.json`
- Saved-audio metadata: `lib/static-audio.js`
- Source audio files: `public/assets/audio`
- Build output: `dist/assets/audio`

Do not edit `dist` directly.

## Lesson Authoring

Each lesson file contains only text and catalog IDs. Every step has one English
line, one speaker, and a complete scripted-scene-character emote map. The app
discovers all lesson files eagerly, validates them, and builds the picker
automatically.

When adding a lesson:

1. Add one valid JSON file under `content/lessons`.
2. Reuse global character, emote, and background IDs.
3. Add any genuinely new visual definitions to the global catalogs first.
4. Add saved-audio metadata for each unique non-user speaker/text pair.
5. Generate only the missing audio IDs.

No lesson field stores a sprite path, audio path, voice ID, or TTS setting.

## Runtime Playback Rules

`src/media/audio-playback.ts` plays built-in static asset lines.
`src/media/device-speech.ts`
plays generated and pasted My Lesson lines with the browser Web Speech API,
preferring an available local English voice and applying modest character
pitch/rate profiles. There is no `/api/tts` Worker route and no provider key is
sent to the browser.

`lib/static-audio.js` resolves a cache entry by both `speaker` and exact `text`.
The speaker is required because the same sentence may be spoken by Peppa and
Dolly with different cached voices. User steps never require saved playback.

A missing built-in metadata entry or file should fail tests during development
instead of silently falling back to device speech. Device speech is selected
only by the `my` lesson source and is cancelled on scene or route changes.

## ElevenLabs Generation

The generator is `scripts/generate-static-audio.mjs`. It is ElevenLabs-only,
uses `eleven_v3` by default, and stores the returned MP3 bytes directly for
browser playback. WAV conversion remains available only for an explicitly
configured WAV manifest path.

```bash
npm run generate:audio:elevenlabs -- --only=narrator-copy-dolly --force
```

Required environment:

```bash
ELEVENLABS_API_KEY=...
```

Optional overrides:

```bash
ELEVENLABS_PEPPA_VOICE_ID=...
ELEVENLABS_DOLLY_VOICE_ID=...
ELEVENLABS_NARRATOR_VOICE_ID=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_v3
```

The speaker-specific override wins over the general voice override. Current
defaults are:

- Peppa: `Oqy85UMasXzUjUxF0ta5` (Summer)
- Dolly: `5N1BjZ10t6GcJUhZCP40` (Adaline)
- Narrator: `pFZP5JQG7iQjIQuC4Bku` (Lily)

These are character-directed voices, not exact protected-character clones.

Use `--only=<audio-id>` to avoid regenerating existing assets or spending
credits unnecessarily. Never substitute local or macOS system speech for a
missing built-in saved asset; My Lessons are the explicit on-device exception.

## Visual Generation

Every visible character has one pre-generated transparent WebP for each global
emote: `idle`, `talking`, `listening`, `happy`, `sad`, and `surprised`.

Sprites are stored under:

```text
public/assets/characters/<character-id>/<character-id>-<emote>.webp
```

Register paths and descriptive alt text in the character catalog. Verify that
every registered file exists before using it in a lesson. The character subject
must be opaque while its background remains transparent; partial alpha should
be confined to antialiased subject edges.

## QA Checklist

- Validate every checked-in lesson and catalog.
- Confirm each character/emote catalog path exists.
- Confirm each built-in scripted non-user line resolves by speaker plus text.
- Confirm My Lesson device speech completes, fails clearly when unsupported,
  and cancels on navigation.
- Confirm each audio metadata path exists under `public`.
- Run focused lesson/audio tests.
- Run `npm run build` so Vite copies the source assets into `dist`.
