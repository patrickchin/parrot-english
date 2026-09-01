# Nursery-Rhyme Content Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six hard-coded nursery-rhyme definitions with validated per-rhyme packages containing `rhyme.json`, MusicXML, and existing guide MP3s, while preserving every deployed ID and protected runtime semantic; only the explicitly approved score-derived first lead-in may shift if a score requires it.

**Architecture:** A Node-only compiler scans `public/assets/nursery-rhymes/*/rhyme.json`, validates manifests and a deliberately small MusicXML 4.0 subset, probes guide audio, derives waveform/timing data, and writes one deterministic checked-in TypeScript registry. The application and Worker keep consuming the handwritten `rhyme-catalog.ts` domain boundary; neither parses XML nor scans the filesystem at runtime. An append-only deployment ledger protects the R2 rhyme and line identifiers.

**Tech Stack:** Node 22 ESM, TypeScript 5.9, Zod, Happy DOM `DOMParser`, FFmpeg/FFprobe, React 19, Vite 8, Cloudflare Workers, Node `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-nursery-rhyme-karaoke-content-design.md`

## Global Constraints

- This milestone changes content ownership, not learner-facing recording or playback behavior, apart from the approved possibility that the first score-derived two-beat lead-in changes its absolute cue.
- Preserve the current six catalog entries, their order, routes, definition IDs, ordered line IDs, titles, scene grouping, artwork descriptors, guide IDs and bytes, melody pitches, phrase durations, and storage behavior.
- Keep the existing narrator guide audio unchanged. It is not score-aligned and must not be trimmed, stretched, regenerated, or described as sung backing audio.
- Keep `echoCancellation: true` and `noiseSuppression: false`; recorder changes belong to the dependent karaoke plan.
- Accept only the documented MusicXML subset. Reject unsupported constructs instead of silently guessing.
- Keep package asset references relative and inside their own package. Artwork may remain only on immutable, versioned `https://media.parrotbook.com/` URLs.
- Use `/assets/nursery-rhymes/` so existing Worker static-path handling returns real 404 responses for missing files.
- The explicit generate command is the only writer. Build, test, development, static-audio generation, and deployment use check mode.
- Do not add a browser XML parser, runtime dependency, `import.meta.glob`, content API, CMS, or route registration step.
- Follow red-green-refactor for every compiler and consumer change. Commit after each green task.

---

## File Map

### New compiler and generated files

- `scripts/nursery-rhyme/manifest.mjs`: strict Zod manifest schema, safe package-relative path resolution, and artwork validation.
- `scripts/nursery-rhyme/musicxml.mjs`: secure MusicXML preflight/parser and rational score compiler.
- `scripts/nursery-rhyme/audio.mjs`: FFprobe validation and deterministic 32-bar waveform extraction.
- `scripts/nursery-rhyme/compiler.mjs`: package discovery, cross-package validation, deployment-ledger enforcement, and generated-module serialization.
- `scripts/generate-rhyme-catalog.mjs`: small `--check`/write CLI.
- `scripts/nursery-rhyme-deployed-ids.json`: append-only storage-ID authority.
- `src/dubbing/generated-rhyme-catalog.ts`: deterministic checked-in compiler output; never edit by hand.
- `tests/nursery-rhyme-manifest.test.mjs`: manifest and path contract.
- `tests/nursery-rhyme-musicxml.test.mjs`: score parsing, lyric offsets, ties, and rounding.
- `tests/nursery-rhyme-compiler.test.mjs`: discovery, assets, ledger, determinism, and diagnostics.
- `tests/fixtures/nursery-rhyme-runtime-snapshot.json`: protected pre-migration runtime/storage snapshot.

### New authored packages

- `public/assets/nursery-rhymes/five-little-ducks/{rhyme.json,score.musicxml,guides/*.mp3}`
- `public/assets/nursery-rhymes/old-macdonald/{rhyme.json,score.musicxml,guides/*.mp3}`
- `public/assets/nursery-rhymes/twinkle-twinkle/{rhyme.json,score.musicxml,guides/*.mp3}`
- `public/assets/nursery-rhymes/row-row-row-your-boat/{rhyme.json,score.musicxml,guides/*.mp3}`
- `public/assets/nursery-rhymes/mary-had-a-little-lamb/{rhyme.json,score.musicxml,guides/*.mp3}`
- `public/assets/nursery-rhymes/humpty-dumpty/{rhyme.json,score.musicxml,guides/*.mp3}`

### Existing files to modify

- `src/dubbing/rhyme-catalog.ts`: runtime types, deep normalization/freezing, lookup helpers, and compatibility constants over generated data.
- `src/dubbing/dub-script.ts`: Five Little Ducks compatibility exports only.
- `src/dubbing/dub-melodies.ts`: shared music types only; delete authored score constants.
- `src/dubbing/dub-artwork.ts`: shared artwork type/helper and shelf artwork only; delete rhyme-specific constants.
- `src/dubbing/dub-waveform.ts`: numeric peak helper plus generated guide-waveform lookup.
- `src/dubbing/dub-playback.ts`: schedule generic compiled melody/accompaniment/outro notes instead of `bassMidi`/`outroMidi` conventions.
- `src/dubbing/DubStudio.tsx`: resolve guide sources from line metadata instead of narrator/text search.
- `src/dubbing/DubSceneEditor.tsx`: resolve guide waveform by explicit line guide ID.
- `src/dubbing/DubProjectHome.tsx`, `src/dubbing/DuckDub.tsx`, `src/dubbing/dub-api.ts`, `src/dubbing/dub-state.ts`, and `worker/dub-storage.ts`: import the default definition from `rhyme-catalog.ts`, leaving `dub-script.ts` compatibility-only.
- `src/dubbing/NurseryRhymeList.tsx`, `src/app/app-routes.ts`, `worker/dub-route.ts`, and `worker/dub-storage.ts`: keep catalog-driven behavior behind small defaulted pure seams so a compiled seventh package can be exercised end-to-end without mutating production content.
- `src/dubbing/GuardianDubbingSettings.tsx`: remove the hard-coded learner-facing “all six” count.
- `src/testing/e2e-browser-mocks.ts`: resolve compiled guide package URLs instead of reconstructing `/assets/audio/` paths.
- `lib/static-audio.js`: consume generated guide records rather than infer IDs from line text/order.
- `package.json`: generate/check scripts and check-only lifecycle hooks.
- `.github/workflows/deploy-cloudflare.yml`: install FFmpeg before the generated-catalog check.
- `tests/web-assets.test.mjs`: allow validated `.json`/`.musicxml` public package files while retaining the general asset allowlist.
- `tests/worker-delivery.test.mjs`: protect static missing-package 404 behavior.
- Existing dubbing, playback, static-audio, workflow, routing, Worker, and browser tests: replace hard-coded registration assumptions with catalog assertions while retaining protected ID snapshots.

---

### Task 1: Freeze the legacy contract before moving content

**Files:**
- Create: `tests/fixtures/nursery-rhyme-runtime-snapshot.json`
- Modify: `tests/dub-catalog.test.mjs`
- Modify: `tests/static-audio.test.mjs`

**Interfaces:**
- Produces a literal reviewable snapshot of catalog order, routes, definition IDs, ordered line IDs/text, scene grouping/artwork, phrase durations, the normalized absolute melody/backing schedule, and guide ID/text/SHA-256.
- Does not become an authored source; it is a migration guard and should be deleted only with an explicit storage/content migration.

- [ ] **Step 1: Add a failing snapshot assertion**

Import the JSON fixture with `with { type: "json" }` and build the actual value only from public runtime exports plus bytes in `public/assets/audio`:

```js
function catalogContract(definitions) {
  return definitions.map((definition) => ({
    id: definition.id,
    route: definition.route,
    title: definition.title,
    countInMidi: definition.countInMidi ?? definition.music.countIn[0].midi,
    musicVolume: definition.music.volume,
    phraseDurationsMs: definition.music.linePhrases.map(({ durationMs }) => durationMs),
    linesPerScene: definition.linesPerScene,
    sceneTitles: definition.sceneTitles,
    sceneArtwork: definition.sceneArtwork,
    lineArtwork: definition.lineArtwork ?? null,
    lines: definition.lines.map(({ id, text }) => ({ id, text })),
    relativeCuesMs: definition.lines.map(({ cueMs }) => cueMs - definition.lines[0].cueMs),
    durationAfterLeadInMs: definition.durationMs - definition.lines[0].cueMs,
    normalizedScore: normalizeLegacyScore(definition),
  }));
}

it("preserves the deployed nursery-rhyme runtime contract", () => {
  assert.deepEqual(catalogContract(DUB_DEFINITIONS), snapshot.catalog);
});
```

`normalizeLegacyScore` must flatten each line phrase to absolute
`{ role, midi, atMs, durationMs }` events, including the old `bassMidi` event
and final `outroMidi` events, then sort by `atMs`, `role`, `midi`, and
`durationMs`. The migrated compiler produces the same normalized schedule from
`playbackNotes`. Compare cues relative to the first lyric downbeat because the
score-derived two-beat lead-in is intentionally allowed to change that one
absolute offset.

Add a static-audio assertion that records `{ id, text, sha256 }` for every current `*-guide-line-*` record. Hash the file bytes, not decoded audio. The source URL intentionally moves into the package, so assert its new exact package URL separately after cutover.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test tests/dub-catalog.test.mjs tests/static-audio.test.mjs
```

Expected: both files fail because `nursery-rhyme-runtime-snapshot.json` does not exist.

- [ ] **Step 3: Add the literal current snapshot**

Create the JSON from the current checked-in definitions and guide files, review every stable ID, then keep it static. Do not teach the later compiler to rewrite this fixture.

- [ ] **Step 4: Run the focused tests and verify GREEN**

```bash
node --test tests/dub-catalog.test.mjs tests/static-audio.test.mjs
```

Expected: both files pass against the pre-migration implementation.

- [ ] **Step 5: Commit the migration guard**

```bash
git add tests/fixtures/nursery-rhyme-runtime-snapshot.json tests/dub-catalog.test.mjs tests/static-audio.test.mjs
git commit -m "test: freeze nursery rhyme content contract"
```

---

### Task 2: Validate strict package manifests and safe asset paths

**Files:**
- Create: `scripts/nursery-rhyme/manifest.mjs`
- Create: `tests/nursery-rhyme-manifest.test.mjs`

**Interfaces:**
- Produces `parseRhymeManifest(value, sourcePath): RhymeManifest`.
- Produces `resolvePackageAsset(packageDir, relativePath, fieldPath): string`.
- Manifest schema version 1 requires exactly two count-in beats and equal non-zero line counts per scene.

- [ ] **Step 1: Write failing valid/strict/path tests**

Use a complete minimal manifest factory. Assert acceptance of the spec example and rejection of an unknown key, duplicate scene/line ID, unsafe slug/ID, unequal scene sizes, non-2 count-in, `countInMidi` outside 0 through 127, unversioned artwork, non-allowlisted artwork, `../guide.mp3`, an absolute score path, and a guide path outside `guides/`.

```js
assert.equal(parseRhymeManifest(validManifest(), ".../rhyme.json").slug, "twinkle-twinkle");
assert.throws(
  () => parseRhymeManifest({ ...validManifest(), surprise: true }, ".../rhyme.json"),
  /rhyme\.json.*surprise.*unrecognized/i,
);
assert.throws(
  () => resolvePackageAsset(packageDir, "../audio.mp3", "scenes[0].lines[0].guide"),
  /scenes\[0\]\.lines\[0\]\.guide.*inside its package/i,
);
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test tests/nursery-rhyme-manifest.test.mjs
```

Expected: module-not-found for `scripts/nursery-rhyme/manifest.mjs`.

- [ ] **Step 3: Implement the strict Zod schema**

Use `.strict()` on every object. Validate IDs with `^[a-z0-9]+(?:-[a-z0-9]+)*$`, require positive integer dimensions, and require the artwork pathname to contain a version segment such as `/v8/`. Flatten scenes only after per-scene duplicate checks.

```js
export function parseRhymeManifest(value, sourcePath) {
  const result = rhymeManifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${sourcePath}:${issue.path.join(".") || "manifest"}: ${issue.message}`);
  }
  const manifest = result.data;
  const counts = new Set(manifest.scenes.map(({ lines }) => lines.length));
  if (counts.size !== 1 || counts.has(0)) {
    throw new Error(`${sourcePath}: scenes must have one equal non-zero line count in schemaVersion 1`);
  }
  assertUniqueManifestIds(manifest, sourcePath);
  return manifest;
}
```

Resolve paths with `resolve()` plus `relative()` and reject empty, absolute,
backslash, traversal, query, fragment, or wrong-extension values before
touching the filesystem. At the compiler's async file boundary, call
`lstat()`/`realpath()` and reject symbolic links; then repeat containment on
the real package directory and real asset path. Add a fixture whose
`guides/link.mp3` targets another package and one targeting outside the content
root; both must fail before FFmpeg runs.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
node --test tests/nursery-rhyme-manifest.test.mjs
```

- [ ] **Step 5: Commit the manifest boundary**

```bash
git add scripts/nursery-rhyme/manifest.mjs tests/nursery-rhyme-manifest.test.mjs
git commit -m "feat: validate nursery rhyme package manifests"
```

---

### Task 3: Compile the supported MusicXML subset on a rational clock

**Files:**
- Create: `scripts/nursery-rhyme/musicxml.mjs`
- Create: `tests/nursery-rhyme-musicxml.test.mjs`

**Interfaces:**
- Produces `compileMusicXml({ manifest, sourcePath, xml }): CompiledScore`.
- `CompiledScore` contains `countInBeatMs`, `countInDurationMs`, `durationMs`, absolute line cues, line-relative melody/playback notes, and UTF-16 word offsets.
- Internally represents score positions as reduced `{ numerator: bigint, denominator: bigint }` fractions. It rounds absolute boundaries once, then subtracts rounded boundaries for durations.

- [ ] **Step 1: Write the failing secure-parser tests**

Cover a minimal valid `score-partwise` 4.0 score, the exact canonical external score-partwise DOCTYPE, malformed XML, internal subsets, entity declarations, alternate doctypes, and any processing that would fetch a DTD.

```js
const canonicalDoctype = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
assert.doesNotThrow(() => compileMusicXml(fixture({ doctype: canonicalDoctype })));
for (const declaration of [
  '<!DOCTYPE score-partwise [<!ENTITY x "boom">]>',
  '<!ENTITY x SYSTEM "file:///etc/passwd">',
  '<!DOCTYPE score-timewise SYSTEM "https://example.com/x.dtd">',
]) {
  assert.throws(() => compileMusicXml(fixture({ doctype: declaration })), /DOCTYPE|entity/i);
}
```

- [ ] **Step 2: Write failing musical/lyric tests**

Add focused scores for:

- one tempo and changing `divisions` at measure boundaries;
- thirds and sixths proving no cumulative 333/334ms drift;
- ties coalesced across measures;
- a held word using `<extend>`;
- two successive words on tied same-pitch fragments, proving lyric intervals
  stay distinct while playback/lane output coalesces the tie;
- a multi-syllable word using `begin`/`middle`/`end`;
- punctuation and `E-I-E-I-O` matched back to exact manifest UTF-16 offsets;
- case differences plus each accepted curly/modifier apostrophe and Unicode
  hyphen variant matched by the exact comparison normalizer without shifting
  UTF-16 offsets;
- accompaniment `<chord/>` accepted while melody chords/overlap are rejected;
- bookmarks missing, duplicated, extra, or out of manifest order;
- `<end-line/>` ending the phrase before a final unmarked rest/outro, plus a
  marker-only `<lyric><end-line/></lyric>` on a terminal rest extending an
  intentional silent line tail without adding melody or word events;
- unsupported repeat, grace, tuplet, transpose, second lyric verse, a second
  or changing voice, and mid-score tempo change;
- a manifest-referenced melody/playback part absent from the score, invalid
  pitch/divisions/duration, and a line over 8,000ms. A score may contain an
  unselected part; it is valid and silent at runtime.

Use boundary assertions rather than floating point approximations. Also assert
that the first line bookmark is exactly the rounded boundary after
`manifest.countInBeats` metronome beats; this is how full playback derives its
count without authoring synthetic click notes in MusicXML:

```js
assert.deepEqual(compiled.lines[0].notes.map(({ atMs, durationMs }) => [atMs, durationMs]), [
  [0, 333], [333, 334], [667, 333],
]);
assert.equal(compiled.lines[0].durationMs, 1_000);
assert.deepEqual(compiled.lines[0].words[0], {
  startOffset: 0,
  endOffset: 7,
  atMs: 0,
  durationMs: 667,
});
```

- [ ] **Step 3: Run the focused test and verify RED**

```bash
node --test tests/nursery-rhyme-musicxml.test.mjs
```

Expected: module-not-found for `musicxml.mjs`.

- [ ] **Step 4: Implement declaration preflight and DOM parsing**

Reject `<!ENTITY`, internal subsets, and every doctype except the exact canonical declaration before constructing Happy DOM's `DOMParser`. Require `parsererror` absence, root `score-partwise`, version `4.0`, and one declaration-free document after stripping.

- [ ] **Step 5: Implement rational score traversal**

Walk each part sequentially. Reject `backup`/`forward`, multiple voices, unsupported notation, and non-melody timing divergence. Record notes using rational quarter-note positions, select tempo from the single metronome/sound declaration, and convert with:

```js
function roundedRational(value) {
  return Number(
    (value.numerator * 2n + value.denominator) /
      (value.denominator * 2n),
  );
}

function millisecondsAt(position, millisecondsPerQuarter) {
  return roundedRational(multiplyRational(position, millisecondsPerQuarter));
}

function intervalMs(start, end, millisecondsPerQuarter) {
  return millisecondsAt(end, millisecondsPerQuarter)
    - millisecondsAt(start, millisecondsPerQuarter);
}
```

Parse decimal `per-minute` values into reduced rationals. Derive
`millisecondsPerQuarter` as a rational from the metronome beat unit, dots, and
per-minute value; never convert it to an integer first and never round note
deltas independently. Emit `countInBeatMs` from the first absolute beat
boundary and `countInDurationMs` from the absolute boundary after all two
beats, so a 333/334ms metronome does not accumulate drift.

- [ ] **Step 6: Implement line, tie, and exact-word derivation**

Start a line at `<bookmark id="<line-id>">`, normally end it at the end of the
complete tied chain carrying `<end-line/>`, and map score lyrics to the exact
manifest text. For an intentional silent tail, allow only a marker-only
`<lyric><end-line/></lyric>` on the terminal rest; reject text, `syllabic`, or
`extend` on that rest marker and reject a marker-only lyric on a pitched note.
Tokenize the manifest with
`/[\p{L}\p{N}]+(?:[’‘ʼ'‐‑-][\p{L}\p{N}]+)*/gu`. Join a MusicXML
`begin`/`middle`/`end` syllable chain without inserting characters; `single`
stands alone. For comparison only, normalize both sides to NFC, lowercase,
map `‘`, `’`, and `ʼ` to `'`, map `‐` and `‑` to `-`, then require exactly one
token after ignoring outer punctuation. Preserve internal apostrophes and
hyphens, so contractions and `E-I-E-I-O` remain one word. Reject incomplete
syllable chains, multiple tokens in one completed lyric, or a comparison
mismatch. Run the regex on the original manifest source and normalize only
each matched slice, preserving its UTF-16 boundaries. Return those offsets so
React can slice the source text unchanged.

- [ ] **Step 7: Run the focused test and verify GREEN**

```bash
node --test tests/nursery-rhyme-musicxml.test.mjs
```

- [ ] **Step 8: Commit the score compiler**

```bash
git add scripts/nursery-rhyme/musicxml.mjs tests/nursery-rhyme-musicxml.test.mjs
git commit -m "feat: compile nursery rhyme MusicXML timing"
```

---

### Task 4: Validate guide audio and derive deterministic waveforms

**Files:**
- Create: `scripts/nursery-rhyme/audio.mjs`
- Create: `tests/nursery-rhyme-audio.test.mjs`

**Interfaces:**
- Produces `inspectGuideAudio({ filePath, timelineDurationMs, ffmpegPath?, ffprobePath?, runTool? }): Promise<{ durationMs, peakBars }>` where `runTool(file, args, options)` defaults to promisified `execFile`.
- `peakBars` always contains 32 finite numbers from 0 through 1.
- Duration comes from the full decoded audio-frame sample count; shorter and
  longer guide clips are both valid and waveform decoding remains score-bounded.

- [ ] **Step 1: Write failing decode, waveform, and mismatch tests**

Resolve one existing guide MP3 through `getStaticAudioLineById`, copy that record's current `src` into a temporary package, and assert deterministic output across two calls. This keeps the test valid when Task 7 changes the explicit source from `/assets/audio/` to the package URL. Reject missing, empty, text-disguised-as-MP3, and undecodable files. Stub the process runner to assert argument arrays are passed to `execFile` without shell interpolation.

```js
const first = await inspectGuideAudio({ filePath, timelineDurationMs: 4_000 });
const second = await inspectGuideAudio({ filePath, timelineDurationMs: 4_000 });
assert.deepEqual(first, second);
assert.equal(first.peakBars.length, 32);
assert.ok(first.peakBars.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1));
```

Include one fixture whose guide is shorter than its score phrase and assert
the trailing bars are zero. Include one whose guide is longer and assert audio
after the score phrase is omitted from its bars while its full decoded duration
is retained. Neither may throw or alter phrase duration. Call one shared guide
with two timeline durations and assert two line-specific bar arrays are
produced. Prove duration ignores differing container `format.duration` values.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test tests/nursery-rhyme-audio.test.mjs
```

- [ ] **Step 3: Implement FFprobe and waveform extraction**

Use injected `runTool` with argument arrays; never invoke a shell. Request
FFprobe JSON for the selected audio stream's `sample_rate` and every decoded
frame's `nb_samples` with UTF-8 encoding. Sum positive integer frame sample
counts, divide by the positive integer sample rate, and do not use container
`format.duration`. Request FFmpeg mono 16 kHz `s16le` PCM stdout with
`encoding: null`, parse its `Buffer` explicitly with `readInt16LE`, and limit
waveform decoding to the score timeline. Set
`maxBuffer = timelineSampleCount * 2 + 64 * 1024`; the 8,000ms score bound
keeps it finite, and this avoids relying on `execFile`'s default 1 MiB buffer.
Reject misaligned/non-Buffer PCM. Compute
`timelineSampleCount = round(sampleRate * timelineDurationMs / 1000)` and feed
that boundary to the existing `getNormalizedPeakBars` algorithm: missing
samples become trailing zero bars and samples after the phrase are ignored.
Normalize the resulting 32 peaks, quantize them to three decimals so decoder
least-significant-bit differences across supported FFmpeg builds cannot churn
checked-in output, and return zeros for silence. Include the package path in
every error. Emit bars per line
because one reused guide can legally appear on different phrase durations.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
node --test tests/nursery-rhyme-audio.test.mjs
```

- [ ] **Step 5: Commit the asset compiler**

```bash
git add scripts/nursery-rhyme/audio.mjs tests/nursery-rhyme-audio.test.mjs
git commit -m "feat: validate nursery rhyme guide audio"
```

---

### Task 5: Discover packages, enforce deployed IDs, and generate a static module

**Files:**
- Create: `scripts/nursery-rhyme/compiler.mjs`
- Create: `scripts/generate-rhyme-catalog.mjs`
- Create: `scripts/nursery-rhyme-deployed-ids.json`
- Create: `src/dubbing/generated-rhyme-catalog.ts`
- Create: `tests/nursery-rhyme-compiler.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `compileNurseryRhymePackages({ contentRoot, ledgerPath, runTool }): Promise<CompiledCatalog>`.
- Produces `serializeGeneratedCatalog(catalog): string`.
- Produces `runRhymeCatalogGenerator({ check, rootDir }): Promise<void>`.
- The CLI accepts only no flag (write) or `--check`; unknown flags exit nonzero.

- [ ] **Step 1: Write failing discovery/global-invariant tests**

Create packages inside `mkdtemp()` and assert deterministic slug discovery regardless of filesystem creation order. Add focused failures for duplicate global order, rhyme ID, slug/route, and guide stem; duplicate scene/line IDs inside one rhyme; cross-text guide reuse; missing files; and output non-determinism. Scene IDs such as `scene-1` may repeat in different rhyme packages. Add a seventh-package assertion with no registration source edit.

Add real filesystem fixtures for a guide symlink into a sibling package and a
guide symlink outside the content root. Both must fail before the injected
audio runner records a call.

Treat an absent production content root as an empty catalog only when the
ledger is also empty; once the ledger has any protected entry, a missing root
must fail. This permits the consistent Task 5 bootstrap without weakening
deployed-ID enforcement.

- [ ] **Step 2: Write failing deployment-ledger tests**

Use a ledger shaped as:

```json
{
  "schemaVersion": 1,
  "rhymes": [
    { "id": "twinkle-twinkle-v1", "lineIds": ["twinkle-twinkle-v1-line-1"] }
  ]
}
```

Assert that check and write modes both reject a missing/renamed protected ID. Assert write mode appends a new rhyme or new trailing line without reordering prior entries; check mode reports the required append and leaves the ledger and generated file byte-for-byte untouched.

- [ ] **Step 3: Write failing serializer/check-mode tests**

The generated module must contain only JSON-compatible literals plus `as const`, a generated-file warning, and stable newline/order formatting. Run the generator twice and compare bytes. Mutate one byte and assert `--check` exits with an actionable command while preserving the stale file.

```js
await runRhymeCatalogGenerator({ check: false, rootDir });
const generated = await readFile(outputPath, "utf8");
await writeFile(outputPath, `${generated}\n// stale\n`);
await assert.rejects(
  runRhymeCatalogGenerator({ check: true, rootDir }),
  /npm run generate:rhyme-catalog/,
);
assert.match(await readFile(outputPath, "utf8"), /stale/);
```

- [ ] **Step 4: Run the focused test and verify RED**

```bash
node --test tests/nursery-rhyme-compiler.test.mjs
```

- [ ] **Step 5: Implement package compilation**

Read each `rhyme.json`, validate it, compile its score, inspect each unique
`(guide path, line duration)` pair once, then emit flattened runtime data.
Deduplicate static-audio metadata when normalized package path and exact line
text both match, while retaining line-specific waveform bars. Derive guide ID
from the MP3 stem and reject the same stem at two paths.

The generated definition shape must include:

```ts
{
  id, route, title, durationMs, finalCueTailMs, linesPerScene,
  countInBeats, countInMidi,
  sceneTitles, sceneArtwork, lineArtwork,
  lines: [{
    id, text, cueMs, durationMs,
    guideAudioId, guideAudioSrc, guidePeakBars, words,
  }],
  music: {
    countInBeatMs,
    countInDurationMs,
    linePhrases: [{ durationMs, notes, playbackNotes }],
    outroNotes,
    volume,
  },
  guides: [{ id, src, text, durationMs }],
}
```

Each `playbackNotes`/`outroNotes` entry is
`{ atMs, durationMs, midi, role: "melody" | "accompaniment" }`.
`music.countInBeatMs` and `music.countInDurationMs` come from rounded absolute
score-metronome boundaries and are not inferred from click-note duration. Drop the currently unused `visualBeat` and
Five Little Ducks `duckCount` fields instead of carrying dead authored data
into the package schema.

- [ ] **Step 6: Implement ledger enforcement and the small CLI**

Validate the ledger before serialization. In write mode append only new IDs after compilation succeeds; use a temporary file plus rename for both ledger and registry. In check mode compute expected bytes in memory and write nothing.

- [ ] **Step 7: Seed a consistent empty ledger, scripts, and generated module**

Until production packages land, check in an empty ledger and matching empty
generated export so `npm run check:rhyme-catalog` already passes at this
commit. Task 1's static snapshot protects all legacy IDs during the migration;
write-mode generation appends each migrated package to the ledger and never
rewrites an appended ID.

```json
{ "schemaVersion": 1, "rhymes": [] }
```

```ts
// Generated by scripts/generate-rhyme-catalog.mjs. Do not edit.
export const GENERATED_DUB_DEFINITIONS = [] as const;
```

Add the two explicit commands now so Task 6 can use them:

```json
{
  "generate:rhyme-catalog": "node scripts/generate-rhyme-catalog.mjs",
  "check:rhyme-catalog": "node scripts/generate-rhyme-catalog.mjs --check"
}
```

Do not add lifecycle hooks until Task 8, after the production packages exist
and the runtime cutover is green.

- [ ] **Step 8: Run the focused tests and verify GREEN**

```bash
node --test tests/nursery-rhyme-manifest.test.mjs tests/nursery-rhyme-musicxml.test.mjs tests/nursery-rhyme-audio.test.mjs tests/nursery-rhyme-compiler.test.mjs
npm run check:rhyme-catalog
```

- [ ] **Step 9: Commit the generator**

```bash
git add scripts/nursery-rhyme scripts/generate-rhyme-catalog.mjs scripts/nursery-rhyme-deployed-ids.json src/dubbing/generated-rhyme-catalog.ts tests/nursery-rhyme-compiler.test.mjs package.json
git commit -m "feat: generate static nursery rhyme catalog"
```

---

### Task 6: Generate and review all six legacy-compatible content packages

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-nursery-rhyme-content-packages.md`
- Modify: `docs/superpowers/specs/2026-09-01-nursery-rhyme-karaoke-content-design.md`
- Temporarily create: `scripts/migrate-legacy-rhyme-packages.mjs`
- Modify: `scripts/nursery-rhyme/musicxml.mjs`
- Temporarily create: `tests/migrate-legacy-rhyme-packages.test.mjs`
- Create all six package trees listed in the File Map.
- Regenerate: `src/dubbing/generated-rhyme-catalog.ts`
- Update: `scripts/nursery-rhyme-deployed-ids.json`
- Modify: `tests/nursery-rhyme-compiler.test.mjs`
- Modify: `tests/nursery-rhyme-musicxml.test.mjs`
- Modify: `tests/web-assets.test.mjs`

This task copies guide bytes into packages while retaining the old
`/assets/audio/` copies. The checked-in runtime still uses the old catalog, so
the commit remains green. Task 7 performs the one atomic consumer cutover and
removes the old copies.

- [ ] **Step 1: Write failing deterministic migration tests**

Export
`runLegacyRhymeMigration({ onlySlug?, rootDir, copyFile?, writeFile? })` from
the temporary script. Run it in a temporary root and assert the manifest and
MusicXML bytes are stable across two runs, `--only=<slug>` touches only that
package, guide hashes match the Task 1 snapshot, and no network/TTS API is
called.

Tokenize exact manifest words with:

```js
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’‘ʼ'‐‑-][\p{L}\p{N}]+)*/gu;
```

Assert `E-I-E-I-O` and `moo-moo` remain single word cues. Add fixtures for
both `words > legacy notes` and `words < legacy notes`.

- [ ] **Step 2: Run the migration test and verify RED**

```bash
node --test tests/migrate-legacy-rhyme-packages.test.mjs
```

Expected: the migration module is missing.

- [ ] **Step 3: Implement the temporary deterministic converter**

Read current definitions, music, artwork, and explicit static-audio records;
do not duplicate their values into another handwritten table. Emit strict
manifests with stable metadata, `countInBeats: 2`, the legacy first count-note
MIDI as `countInMidi`, `P1` melody, `P2` accompaniment, and package-relative
guides.

For the current 400ms metronome use 150 quarter-note BPM and `divisions=400`,
so one MusicXML duration unit is exactly 1ms. Begin `P1` and `P2` with an 800ms
rest and put the first bookmark after that rest. Preserve every legacy outer
note boundary. When a note must carry multiple words, partition its integer-ms
duration by rounding absolute subdivision boundaries and emit tied same-pitch
fragments; put one successive word on each fragment. When one word spans
multiple legacy notes, put the lyric on its first note and `<extend>` on the
remaining notes assigned by proportional contiguous boundaries. Reject any
zero-duration subdivision. The compiler coalesces ties for melody/lane/audio
but retains lyric-fragment timing.

Use these deterministic allocation boundaries, where `N` is word count and
`M` is legacy note count: when `N >= M`, legacy note `j` receives words
`floor(j*N/M)` through `floor((j+1)*N/M)-1`; when `N < M`, word `i` receives
notes `floor(i*M/N)` through `floor((i+1)*M/N)-1`. Within a subdivided note,
round each absolute `start + k*duration/wordCount` boundary once and subtract
adjacent rounded boundaries.

Emit the current bass note as `P2` accompaniment for `min(1600,
phrase.durationMs)` and the two legacy outro pitches as an accompaniment chord
at their exact final boundary. Put `<end-line/>` on the final lyric fragment
when the melody fills the phrase; when a legacy phrase has a silent tail, put
marker-only `<lyric><end-line/></lyric>` on that terminal rest instead. Both
forms precede the outro. Copy guide files byte-for-byte; never synthesize audio.

- [ ] **Step 4: Run the converter test and verify GREEN**

```bash
node --test tests/migrate-legacy-rhyme-packages.test.mjs
```

- [ ] **Step 5: Generate all packages and add preservation gates**

```bash
node scripts/migrate-legacy-rhyme-packages.mjs
npm run generate:rhyme-catalog
```

Compile production content and compare catalog identity/order, line IDs/text,
scene grouping/art, relative cues, duration after lead-in, count MIDI, phrase
durations, music volume, normalized melody/accompaniment/outro events, guide
IDs/text/hashes with the protected snapshot. Generate the catalog twice and
separately assert every line has 32 deterministic finite waveform bars in the
0-through-1 range; Task 4's fixtures own short-padding and long-tail behavior
because the new decoded bars intentionally do not equal the old handwritten
nibble table.
Explicitly assert 81 lines and 59 unique guides; Ducks has `6×4` scenes and
Old MacDonald has `5×7` scenes with its 8s/2s phrase sequence.

- [ ] **Step 6: Allow only the new validated public package formats**

Update `tests/web-assets.test.mjs` so `rhyme.json` and `score.musicxml` are
accepted only at `nursery-rhymes/<safe-slug>/`, and MP3s only under that
package's `guides/`. Arbitrary public JSON/XML remains rejected by the test.

- [ ] **Step 7: Run every content gate and verify GREEN**

```bash
npm run check:rhyme-catalog
node --test tests/migrate-legacy-rhyme-packages.test.mjs tests/nursery-rhyme-*.test.mjs tests/web-assets.test.mjs tests/dub-catalog.test.mjs tests/static-audio.test.mjs
npm run build
```

Expected: the new package/compiler snapshot and the still-legacy runtime
snapshot both pass; both guide locations temporarily exist with identical
hashes.

- [ ] **Step 8: Commit reviewable packages without changing runtime URLs**

```bash
git add docs/superpowers/plans/2026-09-01-nursery-rhyme-content-packages.md docs/superpowers/specs/2026-09-01-nursery-rhyme-karaoke-content-design.md scripts/migrate-legacy-rhyme-packages.mjs scripts/nursery-rhyme-deployed-ids.json scripts/nursery-rhyme/musicxml.mjs public/assets/nursery-rhymes src/dubbing/generated-rhyme-catalog.ts tests/migrate-legacy-rhyme-packages.test.mjs tests/nursery-rhyme-compiler.test.mjs tests/nursery-rhyme-musicxml.test.mjs tests/web-assets.test.mjs
git commit -m "content: add validated nursery rhyme packages"
```

---

### Task 7: Cut runtime consumers over and remove legacy copies atomically

**Files:**
- Modify: `src/dubbing/rhyme-catalog.ts`
- Modify: `src/dubbing/dub-script.ts`
- Modify: `src/dubbing/dub-melodies.ts`
- Modify: `src/dubbing/dub-artwork.ts`
- Modify: `src/dubbing/dub-playback.ts`
- Modify: `src/dubbing/dub-waveform.ts`
- Modify: `src/dubbing/DubStudio.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Modify: `src/dubbing/DuckDub.tsx`
- Modify: `src/dubbing/dub-api.ts`
- Modify: `src/dubbing/dub-state.ts`
- Modify: `src/dubbing/GuardianDubbingSettings.tsx`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `worker/dub-storage.ts`
- Modify: `lib/static-audio.js`
- Delete after hash comparison: the 59 old `public/assets/audio/*-guide-line-*.mp3` files.
- Delete: `scripts/migrate-legacy-rhyme-packages.mjs`
- Delete: `tests/migrate-legacy-rhyme-packages.test.mjs`
- Modify the existing catalog/playback/waveform/UI/static-audio/guardian/E2E tests.

**Runtime types:**

```ts
export type DubWordCue = Readonly<{
  startOffset: number; endOffset: number; atMs: number; durationMs: number;
}>;
export type DubPlaybackNote = DubMelodyNote & Readonly<{
  role: "melody" | "accompaniment";
}>;
export type DubMelodyPhrase = Readonly<{
  durationMs: number;
  notes: readonly DubMelodyNote[];
  playbackNotes: readonly DubPlaybackNote[];
}>;
export type DubMusicScore = Readonly<{
  countInBeatMs: number;
  countInDurationMs: number;
  linePhrases: readonly DubMelodyPhrase[];
  outroNotes: readonly DubPlaybackNote[];
  volume: number;
}>;
export type DubLine = Readonly<{
  cueMs: number; durationMs: number;
  guideAudioId: string; guideAudioSrc: string;
  guidePeakBars: readonly number[];
  id: string; text: string; words: readonly DubWordCue[];
}>;
export type DubGuide = Readonly<{
  id: string; src: string; text: string; durationMs: number;
}>;
```

Add `countInBeats`, `countInMidi`, and `guides: readonly DubGuide[]` to
`DubDefinition`.

- [ ] **Step 1: Write failing generated-runtime and consumer tests**

Assert deep freezing, six named constants sharing objects with
`DUB_DEFINITIONS`, generic role-note/outro scheduling, no double scheduling of
melody `notes`, per-line waveform bars, explicit guide URLs, count-free
guardian copy, and E2E mock lookup by `line.guideAudioSrc`. Assert nested
package output paths already work in the unchanged static-audio generator.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test tests/dub-catalog.test.mjs tests/dub-playback.test.mjs tests/dub-waveform.test.mjs tests/dub-ui.test.mjs tests/static-audio.test.mjs tests/generate-static-audio.test.mjs tests/guardian-dubbing-settings.test.mjs
```

- [ ] **Step 3: Normalize/freeze the single generated catalog**

Map generated literals into runtime types and recursively freeze all nested
data. Export `DUB_DEFINITIONS`, six named constants, `getDubDefinition`, and
`getDubLineMusicPhrase`. Make `dub-script.ts` re-export only
`FIVE_LITTLE_DUCKS_DUB`, `DUB_ID`, `DUB_ROUTE`, `DUB_DURATION_MS`,
`DUB_LINES_PER_VERSE`, `DUB_LINES`, and `DUB_SCENE_TITLES`. Move every
production default import to `rhyme-catalog.ts`; leave `dub-melodies.ts` and
`dub-artwork.ts` with shared types/helpers and the shelf cover only.

- [ ] **Step 4: Schedule generic score output once**

Schedule only phrase `playbackNotes` plus eligible absolute `outroNotes`.
Triangle/gain represents role `melody`; sine/lower gain represents
`accompaniment`. Melody `notes` drive the lane only. For full playback emit
200ms clicks using an exported `DUB_COUNT_CLICK_DURATION_MS = 200` at
`definition.countInMidi` on boundaries 0 and `countInBeatMs`; the first line
cue equals `countInDurationMs`. Assert both scheduled click stop boundaries so
the removed legacy count-note objects do not leave click duration implicit.

- [ ] **Step 5: Use line-owned guide data**

```ts
export function resolveDubLineAudioSource(
  line: Pick<DubLine, "id" | "guideAudioSrc">,
  saved: Readonly<Record<string, string>>,
  dubId: string,
): DubAudioSource {
  return Object.hasOwn(saved, line.id)
    ? {
        preferredUrl: getDubLineAudioUrl(line.id, { dubId }),
        fallbackUrl: line.guideAudioSrc,
      }
    : { preferredUrl: line.guideAudioSrc };
}

export function resolveGuideOnlyDubLineAudioSource(
  line: Pick<DubLine, "guideAudioSrc">,
): DubAudioSource {
  return { preferredUrl: line.guideAudioSrc };
}
```

Pass `line.guidePeakBars` to the waveform. Flatten one static-audio record per
unique generated guide. Remove text/order inference and the handwritten
waveform table.

- [ ] **Step 6: Update compatibility consumers and remove legacy bytes**

Use “every nursery rhyme” in guardian copy and package guide URLs in browser
mocks. After programmatically comparing all 59 old/new SHA-256 values, delete
the exact old guide files and the temporary migration script/test. Do not use
a broad glob for deletion; derive the explicit old paths from the protected
snapshot and verify each target is under `public/assets/audio/` first.

- [ ] **Step 7: Verify no authored runtime duplicate remains**

```bash
rg "OLD_ANIMALS|OLD_MACDONALD_LONG_PHRASE|TWINKLE_TWINKLE_MUSIC|DUB_GUIDE_WAVEFORMS|CATALOG_DUB_GUIDE_AUDIO_LINES|visualBeat|duckCount" src lib worker
```

Expected: no authored-catalog matches.

- [ ] **Step 8: Run cutover verification and verify GREEN**

```bash
npm run check:rhyme-catalog
node --test tests/nursery-rhyme-*.test.mjs tests/dub-catalog.test.mjs tests/dub-playback.test.mjs tests/dub-waveform.test.mjs tests/dub-ui.test.mjs tests/static-audio.test.mjs tests/generate-static-audio.test.mjs tests/guardian-dubbing-settings.test.mjs tests/web-assets.test.mjs
npm test
npm run lint
npx playwright test tests/e2e/dubbing.spec.ts
npm run build
```

- [ ] **Step 9: Commit the atomic cutover**

```bash
git add public/assets src/dubbing src/testing/e2e-browser-mocks.ts worker/dub-storage.ts lib/static-audio.js scripts/migrate-legacy-rhyme-packages.mjs tests
git commit -m "refactor: load nursery rhymes from content packages"
```

---

### Task 8: Make generated-content freshness a check-only build invariant

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Inspect: `.github/workflows/verify-pr.yml` (it already installs FFmpeg; change only if the existing step is not available before its catalog check).
- Modify: `tests/ci-workflows.test.mjs`
- Modify: `tests/generate-static-audio.test.mjs`

- [ ] **Step 1: Write failing script/workflow assertions**

Assert exact script intent rather than shell-source style:

```js
assert.equal(packageJson.scripts["generate:rhyme-catalog"], "node scripts/generate-rhyme-catalog.mjs");
assert.equal(packageJson.scripts["check:rhyme-catalog"], "node scripts/generate-rhyme-catalog.mjs --check");
assert.match(packageJson.scripts.prebuild, /check:rhyme-catalog/);
assert.match(packageJson.scripts.pretest, /check:rhyme-catalog/);
assert.match(packageJson.scripts["pretest:browser"], /check:rhyme-catalog/);
assert.match(packageJson.scripts.prestart, /check:rhyme-catalog/);
assert.match(deployWorkflow, /ffmpeg/);
const checkIndex = deployWorkflow.indexOf("check:rhyme-catalog");
const publishIndex = deployWorkflow.indexOf("Publish and verify immutable static media");
assert.ok(checkIndex >= 0);
assert.ok(publishIndex >= 0);
assert.ok(checkIndex < publishIndex);
```

Add an integration test that corrupts a temporary generated file, runs check mode, and proves neither the registry nor ledger is rewritten.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test tests/ci-workflows.test.mjs tests/generate-static-audio.test.mjs tests/nursery-rhyme-compiler.test.mjs
```

- [ ] **Step 3: Add scripts and check-only hooks**

Add `generate:rhyme-catalog` and `check:rhyme-catalog`. Prepend the check to `prebuild`, `pretest`, `pretest:browser`, `predev:vite`, `prestart`, `pregenerate:audio:elevenlabs`, and `predeploy:worker` without removing existing lifecycle work. Avoid a normal hook that calls write mode.

- [ ] **Step 4: Install FFmpeg in deployment before build**

Mirror the pinned/standard FFmpeg setup already used by `.github/workflows/verify-pr.yml`. Add an explicit `npm run check:rhyme-catalog` after FFmpeg is available and before the deployment workflow's **Publish and verify immutable static media** step. This placement is required because media-only deployment can skip the later build and publishing is the first external writer.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --test tests/ci-workflows.test.mjs tests/generate-static-audio.test.mjs tests/nursery-rhyme-compiler.test.mjs
```

- [ ] **Step 6: Commit lifecycle wiring**

```bash
git add package.json .github/workflows tests/ci-workflows.test.mjs tests/generate-static-audio.test.mjs
git commit -m "ci: verify nursery rhyme generated content"
```

---

### Task 9: Prove a compiled seventh package flows through generic runtime seams

**Files:**
- Modify: `src/dubbing/rhyme-catalog.ts`
- Modify: `src/dubbing/NurseryRhymeList.tsx`
- Modify: `src/app/app-routes.ts`
- Modify: `worker/dub-route.ts`
- Modify: `worker/dub-storage.ts`
- Create: `tests/nursery-rhyme-package-flow.test.mjs`
- Modify: `tests/dub-routing.test.mjs`
- Modify: `tests/dub-worker.test.mjs`
- Modify: `tests/worker-delivery.test.mjs`

- [ ] **Step 1: Add one failing composed seventh-package integration test**

In `tests/nursery-rhyme-package-flow.test.mjs`, copy the six production
packages to a temporary content root, add a minimal valid seventh package,
compile that root, and pass the compiled literals through an exported
`normalizeGeneratedDubDefinitions` function. Use the existing Vite SSR test
harness to load the TSX shelf component. With that same normalized array,
assert all of the following in one test without editing a route, storage, or
shelf registration table:

1. `NurseryRhymeList` renders the seventh title and route when given the array.
2. `getDubRoutePaths(array)` includes the seventh learner route.
3. `parseDubRoute(apiPath, array)` resolves its API line route.
4. `dubStorageClosureKeys(storage, array)` includes every seventh-package line
   object key.

Keep the production call sites unchanged by making each seam default to
`DUB_DEFINITIONS`. The optional array is a pure test/composition boundary, not
a second registry or runtime content loader.

- [ ] **Step 2: Extend static-missing-asset characterization coverage**

Add `/assets/nursery-rhymes/missing/rhyme.json` to the existing static-missing cases in `tests/worker-delivery.test.mjs`; assert status 404 plus a non-HTML body. Preserve existing SPA fallback behavior for an unknown application route.

This case is expected to be GREEN before production changes because the Worker
already treats every `/assets/...` path as a static request. Its purpose is to
lock that boundary while the new package directory is introduced.

- [ ] **Step 3: Run the composed test and verify the new seams are RED**

```bash
node --test tests/nursery-rhyme-package-flow.test.mjs tests/dub-routing.test.mjs tests/dub-worker.test.mjs
```

Expected: the composed seventh-package assertions fail because the pure
normalizer and defaulted catalog parameters are not exported yet. The static
404 characterization remains green when run separately.

- [ ] **Step 4: Export the minimal defaulted composition seams**

Export the existing generated-literal normalization as
`normalizeGeneratedDubDefinitions(input)`. Add optional
`definitions = DUB_DEFINITIONS` parameters to `NurseryRhymeList`,
`getDubRoutePaths`, `parseDubRoute`, and `dubStorageClosureKeys`. Production
callers omit the argument. Derive route regexes and storage line keys only
from the supplied definitions. Keep the protected six-entry snapshot for
migration/storage compatibility and keep generic production behavior tests
iterating `DUB_DEFINITIONS`.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --test tests/nursery-rhyme-package-flow.test.mjs tests/dub-routing.test.mjs tests/dub-worker.test.mjs tests/worker-delivery.test.mjs
```

- [ ] **Step 6: Commit generic integration coverage**

```bash
git add src/dubbing/rhyme-catalog.ts src/dubbing/NurseryRhymeList.tsx src/app/app-routes.ts worker/dub-route.ts worker/dub-storage.ts tests/nursery-rhyme-package-flow.test.mjs tests/dub-routing.test.mjs tests/dub-worker.test.mjs tests/worker-delivery.test.mjs
git commit -m "test: prove package-driven nursery rhyme discovery"
```

---

### Task 10: Verify the content-foundation milestone and prepare its PR

**Files:**
- No production changes unless verification reveals a defect.
- Update this plan's checkboxes only if the execution workflow records progress here.

- [ ] **Step 1: Run generated-output and repository hygiene checks**

```bash
npm run generate:rhyme-catalog -- --check
git diff --check
git status --short
```

Expected: check mode succeeds, no whitespace errors, and only intentional plan-progress edits remain.

- [ ] **Step 2: Run all automated verification from a clean generated state**

```bash
npm run test
npm run lint
npm run build
npm run test:browser
```

Expected: all commands exit 0. Record command output and exact verified commit before claiming success.

- [ ] **Step 3: Perform protected-contract audits**

```bash
node --test tests/nursery-rhyme-*.test.mjs tests/dub-catalog.test.mjs tests/static-audio.test.mjs
git diff origin/main -- scripts/nursery-rhyme-deployed-ids.json tests/fixtures/nursery-rhyme-runtime-snapshot.json
```

Expected: every migrated runtime/storage field and guide hash matches. The
new ledger contains the protected six in catalog order, and every later
change is append-only.

- [ ] **Step 4: Request an independent code review**

Use `superpowers:requesting-code-review`. Resolve every correctness or security finding, rerun the affected focused suites, then rerun the complete verification commands at final HEAD.

- [ ] **Step 5: Finish through a pull request**

Use `superpowers:finishing-a-development-branch`. Push the feature branch, open a PR targeting `main`, wait for required checks, merge only through the PR, and confirm `main` contains the merge before starting the dependent karaoke plan.
