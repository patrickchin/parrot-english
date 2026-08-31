# Tasks 4 and 5 report: saved word-game audio

## Implementation

- `lib/static-audio.js` now derives exactly 110 `word-game-*` narrator entries
  from `WORD_GAME_TOPICS`, `WORD_GAME_RETRY_AUDIO`, and
  `WORD_GAME_COMPLETE_AUDIO`: 36 item groups × prompt/label/correct plus retry
  and completion.
- Every derived line reuses its catalog `id`, `source`, and clean `text`, has
  `speaker: "narrator"`, `lang: "en-US"`, and an ElevenLabs performance
  direction: warm/playful/clear curiosity (prompt), clear first-word teaching
  (label), bright encouragement (correct), gentle encouragement (retry), or
  happy-not-loud celebration (completion).
- Added `getStaticAudioLineById(id)`, which returns the saved line with its ID
  or throws `Missing saved audio ID: <id>`. The existing speaker-and-exact-text
  resolver is unchanged.
- Tests independently pin the full literal 110 ID/text inventory, derived
  source relationship, metadata, directions, ID resolution, exact checked-in
  `word-game-*.mp3` inventory, nonzero bytes, `ffprobe` decode, and a
  0.25–15s duration boundary.

## TDD evidence

Initial focused RED command:

```sh
node --test tests/static-audio.test.mjs tests/word-game-catalog.test.mjs
```

It exited 1 with the expected missing implementation failures: static manifest
count `0 !== 110`, empty target file inventory versus 110 expected files, no
`getStaticAudioLineById` export (the catalog test failed to import it), and the
unknown-ID expectation consequently received a `TypeError`.

After deriving the manifest and adding the resolver, the same focused command
again exited 1 exactly as expected for the not-yet-generated assets: only two
static-audio file-presence checks failed—the exact word-game file inventory was
empty and the existing global saved-file check first failed at
`word-game-animals-cat-prompt`. All manifest metadata and catalog-ID-resolution
checks were green.

After generation, the focused suite was green: 26 tests passed, 0 failed.

## Generation

Preflight imported `STATIC_AUDIO_LINES`, selected only IDs with the
`word-game-` prefix, asserted 110 total and unique IDs, asserted no
non-word-game selectors, and confirmed zero target files before the first run.

Credential loading remained inside Node and was never printed or copied:

```sh
NODE_USE_SYSTEM_CA=1 node --env-file=/Users/patchin/Workspace/parrot-english/.dev.vars --input-type=module -e '
  import { spawnSync } from "node:child_process";
  import { STATIC_AUDIO_LINES } from "./lib/static-audio.js";
  const ids = Object.keys(STATIC_AUDIO_LINES).filter((id) => id.startsWith("word-game-"));
  if (ids.length !== 110 || new Set(ids).size !== 110 || ids.some((id) => !id.startsWith("word-game-"))) throw new Error("invalid selectors");
  const result = spawnSync(process.execPath, [
    "scripts/generate-static-audio.mjs", "--provider=elevenlabs",
    ...ids.map((id) => `--only=${id}`),
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
'
```

The first attempt stopped before writing any file because Node did not trust the
local issuer chain. A credential-free Node connectivity check with
`NODE_USE_SYSTEM_CA=1` succeeded, so the same selector-only command was rerun
with system CA verification enabled. It generated 110 files and skipped 0;
there was no rate-limit retry and no local/system/browser TTS fallback.
A selector-only resume check without `--force` then reported 0 generated and
110 skipped, confirming an interrupted invocation can safely continue without
replacing completed files.

## Asset checks

- Exact inventory: 110 manifest IDs and 110 `public/assets/audio/word-game-*.mp3`
  files; no extras.
- Every file is nonzero and `ffprobe`-decodable as MP3.
- Duration range across all 110 files: 1.040s–3.120s.
- Representative metadata:
  - prompt `word-game-animals-cat-prompt`: 2.000s, 33,062 bytes
  - label `word-game-animals-cat-label`: 1.520s, 25,539 bytes
  - correct `word-game-animals-cat-correct`: 2.160s, 35,570 bytes
  - retry `word-game-retry`: 2.320s, 38,078 bytes
  - completion `word-game-complete`: 3.120s, 51,035 bytes
- FFmpeg waveform renders for those five representative clips were non-silent
  and speech-like. No transcription or listening mechanism was available in
  this environment, so no listening claim is made.

## Final verification

- `node --test tests/static-audio.test.mjs tests/word-game-catalog.test.mjs`:
  26 passed, 0 failed.
- `npm test`: 1,520 passed, 0 failed.
- `npm run build`: passed.
- `npm run lint`: 0 errors; two existing unused-disable warnings in generated
  `worker-configuration.d.ts`.
- `git diff --check`: passed.

## Self-review and concerns

The manifest does not duplicate catalog clean text, the ID resolver provides a
strict boundary for player cues, and tests cover both inventory drift and asset
integrity. No outstanding implementation concern. The only environment note is
that the Node process required `NODE_USE_SYSTEM_CA=1` for the local trusted CA
chain; this was used only for the generation invocation and was not committed.
