# Audio and Content Pipeline Design

## Summary

Lesson scripts are editable JSON text. Visual and audio files live outside the
lesson so authors can add or remove story content without managing filenames.
All active lesson dialogue, instructions, and feedback are in English.

Built-in Parrot Lesson playback uses saved audio in `public/assets/audio`.
Lesson JSON never adds audio fields to the authoring format.

Storytelling uses a separate checked-in runtime contract containing each
story's shelf identity, cover, reader pages, and completion line. Each page
carries its artwork and saved narration/join-in audio IDs. Language targets,
word-count review, and prompt experiments happen before a story is checked in;
they are not runtime catalog fields. Artwork production prompts stay with their
artwork because personalized-art generation consumes them, but they are never
rendered as extra child-facing reading text.

The Five Little Ducks dubbing activity is a separate media path built around
the authentic traditional six-stanza rhyme. Its scene is an original inline
SVG and its quiet pentatonic music bed is synthesized in the browser. Saved
ElevenLabs narrator MP3s provide the line examples; there is no device-speech
fallback for those guides. Final playback uses one native Web Audio clock to
schedule the 24 private voice clips, procedural music, and original SVG scene
beats across the 98-second timeline. Authored cues are four seconds apart and
each recording has a six-second maximum. The same player can fetch one four-line
verse, rebase its cues to a short local clock, and play it as immediate feedback
without downloading the other 20 recordings. The scoped clock extends through
the decoded fourth take so the preview never cuts off a valid six-second
recording, while the scoped visual clock holds on that fourth cue until audio
ends. The path does not use a third-party player or a mixed downloadable video.

## Sources of Truth

- Lessons: `content/lessons/*.json`
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
- Checked-in learner stories: `src/stories/story-script-candidates.ts`
- Published story covers and pages: immutable URLs in the checked-in story data
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

`src/media/audio-playback.ts` plays built-in static asset lines. There is no
`/api/tts` Worker route and no provider key is sent to the browser.

`lib/static-audio.js` resolves a cache entry by both `speaker` and exact `text`.
The speaker is required because the same sentence may be spoken by Peppa and
Dolly with different cached voices. User steps never require saved playback.
Built-in scripted check responses use saved audio.

A missing built-in metadata entry or file should fail tests during development
instead of silently falling back to device speech.

For Storytelling, saved playback resolves the narration audio ID checked into
the current page. The resolved exact-text cache entry must match that ID.

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
missing built-in saved asset.

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
- Confirm each audio metadata path exists under `public`.
- Run `npm run verify:backgrounds` after any background catalog change.
- Run focused lesson/audio tests.
- Confirm every checked-in story cover and page artwork URL resolves and every
  declared narration or join-in audio ID has a saved MP3.
- Confirm dubbing clips stay private, replaceable, resettable, and covered by
  account deletion; verify 24-slot native Web Audio replay against the original
  SVG and procedural music timeline, plus scoped four-line verse replay.
- Confirm every dubbing guide resolves to a checked-in ElevenLabs MP3 and that
  each completed take can be replayed locally with a decoded waveform before
  **Next line**.
- Run `npm run build` so Vite copies the source assets into `dist`.
