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
artwork as production provenance and fallback descriptions, but they are never
rendered as extra child-facing reading text.

The nursery-rhyme dubbing activity is a separate media path generated from the
checked-in rhyme manifests and scores. Saved ElevenLabs narrator MP3s provide
the line examples; there is no device-speech fallback for those guides. Final
and scene playback use one native Web Audio clock to schedule private voice
clips, music, and original scene beats. The path does not use a third-party
player or a mixed downloadable video.

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
- Nursery-rhyme manifests, scores, and guides:
  `public/assets/nursery-rhymes/*`
- Generated runtime catalog: `src/dubbing/generated-rhyme-catalog.ts`
- Private replaceable dubbing slots: authenticated `/api/dubs/:dubId/*`, backed
  by `PRIVATE_MEDIA_BUCKET` under
  `accounts/{escaped-email}/learners/{stable-readable-private-media-name}/recordings/nursery-rhymes/{dubId}/`
- Private lesson join-in slots: authenticated `/api/lesson-recordings/*`, backed
  by the same bucket under
  `accounts/{escaped-email}/learners/{stable-readable-private-media-name}/recordings/lessons/{lessonId}/`

`PRIVATE_MEDIA_BUCKET` maps to `parrot-english-private-media` in production and
`parrot-english-private-media-preview` in preview. These buckets contain
private learner recordings only. Story artwork and source assets belong to
separate pipelines; no recording path is rooted under personalized story art.
The account email is escaped for its path segment, and the readable learner
directory is immutable even if the visible profile name changes. Current
learner display names are unique within an account. Deleted learner directories
and deleted account email roots stay reserved so terminal fences cannot be
reused by a later owner. R2 has no symlink layer; all media operations use this
single canonical path.

Do not edit `dist` directly.

## Lesson Authoring

Each lesson file contains only text and catalog IDs. Every step has one English
line and one speaker. An optional partial emote map changes listed characters;
omitted characters inherit their current emotes.

When adding a lesson:

1. Add one valid JSON file under `content/lessons`.
2. Reuse global character, emote, and background IDs.
3. Add any genuinely new visual definitions to the global catalogs first.
4. Add saved-audio metadata for each unique non-user step and learner join-in
   group cue.
5. Generate only the missing audio IDs.

No lesson field stores a sprite path, audio path, voice ID, or TTS setting.

## Runtime Playback Rules

`src/media/audio-playback.ts` plays built-in static asset lines. There is no
`/api/tts` Worker route and no provider key is sent to the browser.

`lib/static-audio.js` resolves a cache entry by both `speaker` and exact `text`.
The speaker is required because the same sentence may be spoken by Peppa and
Dolly with different cached voices. A user step resolves a separate quiet group
cue by exact dialogue text; that cue invites the learner to join in but is never
treated as the learner's voice.

A missing built-in metadata entry or file should fail tests during development
instead of silently falling back to device speech.

For Storytelling, saved playback resolves the narration audio ID checked into
the current page. The resolved exact-text cache entry must match that ID.

Dubbing creates a local object URL as soon as MediaRecorder returns its `Blob`,
decodes those same bytes into normalized PCM peaks for the visible waveform,
and lets the learner replay the take before advancing. In parallel, it uploads
the Blob directly to its authenticated fixed line slot. The local preview is
ephemeral; R2 remains the durable source of truth.

Lesson join-in uploads use only the current
`parrot-lesson-recording-audio-v1` envelope, with a request-unique nonce and
matching current consent-generation metadata. The Worker does not address an
older lesson-recording namespace.

The browser can replay or replace each owner-only take, reset every
catalog-defined slot, and assemble the complete performance with native Web
Audio. New dubbing uploads use only the `parrot-dub-audio-v2` envelope with
matching R2 metadata. Reads do not fall back to raw or earlier-format objects;
objects that fail the v2 validation are treated as unsaved. Learner deletion
cleans only that learner's prefix, while account deletion cleans the complete
account prefix. Only the reusable narrator guides are static assets.

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
ELEVENLABS_MODEL_ID=eleven_v3
```

Current defaults are:

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

Quiet lesson join-in cues are layered from the checked-in saved character lines;
they do not use local text-to-speech. Regenerate the catalogued cue MP3s with
FFmpeg after changing their source lines:

```bash
npm run generate:audio:lesson-join-in
```

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
- Confirm each built-in scripted non-user line resolves by speaker plus text and
  each user step resolves its saved group cue by exact text.
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
