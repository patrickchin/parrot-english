# Audio and Content Pipeline Design

## Summary

Lesson scripts are editable JSON text. Visual and audio files live outside the
lesson so authors can add or remove story content without managing filenames.
All active lesson dialogue, instructions, and feedback are in English.

Built-in Parrot Lesson playback uses saved audio in `public/assets/audio`.
Authenticated My Lessons use browser on-device English speech synthesis.
Neither playback mode adds audio fields to the lesson-authoring format.

Storytelling candidates use a separate text-first contract. Every catalog story
has a generated cover WebP; individual pages carry a nullable narration audio
ID and nullable artwork source. A null page value is an intentional placeholder:
the reader disables narration and renders a visual placeholder without
requesting a missing file. Do not add static-audio entries or page illustrations
while script wording is still being compared. Artwork production prompts remain
catalogue metadata and are not rendered as extra child-facing reading text.

The Five Little Ducks dubbing activity is a separate media path built around
the authentic traditional six-stanza rhyme. Its scene is an original inline
SVG and its quiet pentatonic music bed is synthesized in the browser. Saved
ElevenLabs narrator MP3s provide the line examples; there is no device-speech
fallback for those guides. Final playback uses one native Web Audio clock to
schedule the 24 private voice clips, procedural music, and original SVG scene
beats across the 98-second timeline. Authored cues are four seconds apart and
each recording has a six-second maximum. The path does not use a third-party
player or a mixed downloadable video.

## Sources of Truth

- Lessons: `content/lessons/*.json`
- My Lessons: validated JSON in the D1 `learner_lesson` table
- Global emotes: `content/catalogs/emotes.json`
- Global characters and sprite paths: `content/catalogs/characters.json`
- Global background IDs, alt text, and delivery URLs:
  `content/catalogs/backgrounds.json`
- Approved background WebPs: public Cloudflare R2 media bucket
- Background generation masters and prompt records: private Cloudflare R2
  source bucket
- Saved-audio metadata: `lib/static-audio.js`
- Source audio files: `public/assets/audio`
- Build output: `dist/assets/audio`
- Story script candidates: `src/stories/story-script-candidates.ts`
- Generated story covers: `public/assets/stories/*-cover.webp`
- Story language and prompt research:
  `docs/design/young-learner-storytelling.md`
- Five Little Ducks authored script and timing: `src/dubbing/dub-script.ts`
- Five Little Ducks saved narrator guides: `lib/static-audio.js` and
  `public/assets/audio/five-little-ducks-v2-guide-line-*.mp3`
- Private replaceable voice slots: authenticated
  `/api/dubs/five-little-ducks-v2/*` backed by the existing private R2 account
  purge prefix and deletion tombstone, with no dub-specific D1 metadata

Do not edit `dist` directly.

## Lesson Authoring

Each lesson file contains only text and catalog IDs. Every step has one English
line and one speaker. An optional partial emote map changes listed characters;
omitted characters inherit their current emotes. A user step may add a `check`
whose responses select the speaker, dialogue, optional emote changes, and
retry-or-continue action. Omitting `check` skips speech evaluation.

When adding a lesson:

1. Add one valid JSON file under `content/lessons`.
2. Reuse global character, emote, and background IDs.
3. Add any genuinely new visual definitions to the global catalogs first.
4. Add saved-audio metadata for each unique non-user step and check-response
   speaker/text pair.
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
Built-in scripted check responses use saved audio; My Lesson responses use the
same device-speech path as their other lines.

A missing built-in metadata entry or file should fail tests during development
instead of silently falling back to device speech. Device speech is selected
only by the `my` lesson source and is cancelled on scene or route changes.

For Storytelling, saved playback is attempted only when a page declares a
non-null narration audio ID. The resolved exact-text cache entry must match that
ID. Prototype pages with null IDs show Audio later and never call the saved
audio resolver.

Dubbing creates a local object URL as soon as MediaRecorder returns its `Blob`,
decodes those same bytes into normalized PCM peaks for the visible waveform,
and lets the learner replay the take before advancing. In parallel, it uploads
the Blob directly to its authenticated fixed line slot. The local preview is
ephemeral; R2 remains the durable source of truth.

The browser can replay or replace each owner-only take, reset all 24 v2 slots,
and assemble the complete performance with native Web Audio. A normal v2 reset
also purges every recording under only that owner's legacy
`five-little-ducks-v1/` prefix. It retains one terminal marker plus nine tiny
non-audio slot fences so an in-flight old-v1 upload cannot recreate a take, and
deletes every other legacy object. Account deletion removes those retirement
fences along with all saved clips. Only the reusable narrator guides are static
assets.

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

Five Little Ducks uses the narrator voice for 15 unique checked-in guide MP3s.
Exact repeated lyrics resolve to the first matching asset, so those 15 files
cover all 24 recording slots. Each entry carries a warm, rhythmic
nursery-rhyme direction for ElevenLabs generation while its visible `text`
remains the exact traditional lyric. A missing entry or MP3 is a build/test
failure; the dubbing UI must not substitute browser speech.

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

Approved lesson backgrounds do not live in Git. Stage generated originals,
prompt records, and final 2048x1152 WebPs under the gitignored
`tmp/imagegen/backgrounds` directory. Publish them with the guarded R2 workflow
described in `docs/deployment/background-media-r2.md`. Public object keys are
versioned and immutable; changing artwork requires a new version and catalog
URL rather than overwriting an existing object.

## QA Checklist

- Validate every checked-in lesson and catalog.
- Confirm each character/emote catalog path exists.
- Confirm each built-in scripted non-user line and check response resolves by
  speaker plus text.
- Confirm My Lesson device speech completes, fails clearly when unsupported,
  and cancels on navigation.
- Confirm each audio metadata path exists under `public`.
- Run `npm run verify:backgrounds` after any background catalog change.
- Run focused lesson/audio tests.
- Confirm every story cover path resolves to a checked-in WebP while page media
  remains explicitly nullable.
- Confirm dubbing clips stay private, replaceable, resettable, and covered by
  account deletion; verify 24-slot native Web Audio replay against the original
  SVG and procedural music timeline.
- Confirm every dubbing guide resolves to a checked-in ElevenLabs MP3 and that
  each completed take can be replayed locally with a decoded waveform before
  **Next line**.
- Run `npm run build` so Vite copies the source assets into `dist`.
