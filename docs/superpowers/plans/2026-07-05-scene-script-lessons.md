# Scene-Script Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded phrase lesson with automatically discovered, validated scene-script JSON lessons that run in English and pause only for press-and-hold user speech.

**Architecture:** Keep lesson scripts, visual catalogs, and cached-audio metadata as separate data boundaries. Pure JavaScript modules validate content and advance the script, while a thin Vite catalog adapter discovers JSON files and the React player renders the current scene, resolves cached speech, records a held microphone turn, and advances automatically. The completed JSON lesson-creator prompt in commit `a73d75b` is a prerequisite and is not rewritten again.

**Tech Stack:** React 19, TypeScript, JavaScript with `@ts-check`, Vite `import.meta.glob`, Node test runner, static JSON content, ElevenLabs-generated cached audio

---

## File Structure

- `content/catalogs/emotes.json`: the six globally supported emote IDs.
- `content/catalogs/characters.json`: visible character metadata and emote assets.
- `content/catalogs/backgrounds.json`: background IDs and pre-generated assets.
- `content/lessons/peppas-high-ball.json`: the migrated initial English lesson.
- `lib/lesson-data.js`: JSDoc contracts plus catalog and lesson validation.
- `src/lesson-catalog.ts`: eager Vite discovery and deterministic sorting.
- `lib/lesson-state.js`: pure scene/step runner and retry state.
- `lib/lesson-audio.js`: current-step and feedback cache resolution.
- `lib/lesson-scene.js`: catalog-backed presentation model.
- `src/speech-recorder.ts`: externally stopped recording session for hold-to-talk.
- `src/App.tsx`: picker, automatic playback, microphone interaction, and rendering.
- `src/styles.css`: generic character layout, narration, picker, and hold button.

### Task 1: Add the Content Contract and Global Catalogs

**Files:**
- Create: `content/catalogs/emotes.json`
- Create: `content/catalogs/characters.json`
- Create: `content/catalogs/backgrounds.json`
- Create: `content/lessons/peppas-high-ball.json`
- Create: `tests/lesson-data.test.mjs`
- Modify: `lib/lesson-data.js`

- [ ] **Step 1: Write failing validation tests**

The test imports `createLessonCatalog` and `validateLesson` and asserts:

```js
const catalog = createLessonCatalog({
  emotes: ["idle", "talking", "listening", "happy", "sad", "surprised"],
  characters: [
    { id: "peppa", name: "Peppa", assets: characterAssets("peppa") },
    { id: "dolly", name: "Dolly", assets: characterAssets("dolly") },
    { id: "user", name: "You", assets: characterAssets("user") },
  ],
  backgrounds: [
    { id: "episode-garden", src: "/assets/backgrounds/episode-garden.png", alt: "Sunny garden" },
  ],
});

assert.equal(validateLesson(validLesson, catalog, "valid.json").title, "Peppa's High Ball");
assert.throws(
  () => validateLesson(invalidEmoteLesson, catalog, "bad.json"),
  /bad\.json scenes\[0\]\.steps\[0\]\.emotes\.peppa/
);
```

Cover missing root strings, a non-three-sentence `detailedSummary`, goal-phrase
count, scene count, unknown backgrounds/characters/emotes, Chinese dialogue,
speaker membership, missing `user`, and incomplete or extra emote keys.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lesson-data.test.mjs`

Expected: FAIL because `createLessonCatalog` and `validateLesson` do not exist.

- [ ] **Step 3: Implement the validator**

`lib/lesson-data.js` exports these public contracts:

```js
export const LESSON_EMOTES = [
  "idle",
  "talking",
  "listening",
  "happy",
  "sad",
  "surprised",
];

export function createLessonCatalog({ emotes, characters, backgrounds }) {
  return {
    emotes: new Map(emotes.map((id) => [id, id])),
    characters: new Map(characters.map((character) => [character.id, character])),
    backgrounds: new Map(backgrounds.map((background) => [background.id, background])),
  };
}
```

Also export `validateLesson(value, catalog, sourceName)`. Implement it with
explicit object/array/string checks and reject CJK characters with
`/[\u3400-\u9fff]/u`. Validate exactly two goal phrases, five-to-eight
scenes, three detailed-summary sentences, exact step emote keys, and existing
catalog assets for every character/emote pair.

- [ ] **Step 4: Add the catalogs and migrated lesson**

Use only `peppa`, `dolly`, and `user`; only the six approved emotes; and
existing `episode-garden`, `meadow-day`, `meadow-evening`, and `reward`
backgrounds. The initial lesson has five garden scenes and follows this sequence:

1. Dolly models `It is up high!`; user repeats it.
2. Peppa models `Oh! I can't reach it.`; user repeats it.
3. Dolly models `Can you help me, please?`; user repeats it.
4. Dolly models `Yes! I can help!`; user repeats it.
5. Dolly models `Here you are!`, then `Thank you!`; user repeats both, and
   narrator ends with story-specific praise containing Bella.

Every narrator instruction, character line, and user line is a separate step.
Every step contains all three visible character emotes.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test tests/lesson-data.test.mjs`

Expected: all lesson-data tests pass.

### Task 2: Discover Lessons Automatically

**Files:**
- Create: `src/lesson-catalog.ts`
- Create: `tests/lesson-catalog.test.mjs`

- [ ] **Step 1: Write a failing catalog-source test**

Assert that `src/lesson-catalog.ts` uses:

```ts
const lessonModules = import.meta.glob("../content/lessons/*.json", {
  eager: true,
  import: "default",
});
```

The test also imports the JSON files with `readFileSync`, validates every file
through `validateLesson`, derives IDs from filenames, and expects deterministic
filename ordering.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lesson-catalog.test.mjs`

Expected: FAIL because `src/lesson-catalog.ts` does not exist.

- [ ] **Step 3: Implement the Vite catalog adapter**

```ts
export type LessonCatalogEntry = {
  id: string;
  lesson: Lesson;
};

export const LESSONS: LessonCatalogEntry[] = Object.entries(lessonModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, value]) => ({
    id: path.split("/").at(-1)!.replace(/\.json$/, ""),
    lesson: validateLesson(value, VISUAL_CATALOG, path),
  }));
```

Import the three catalog JSON files directly and create `VISUAL_CATALOG` once.
Throw during application bootstrap if no valid lessons exist.

- [ ] **Step 4: Run catalog tests and build**

Run:

```bash
node --test tests/lesson-data.test.mjs tests/lesson-catalog.test.mjs
npm run build
```

Expected: focused tests pass and Vite accepts the glob and JSON types.

### Task 3: Replace the Phrase Reducer with a Script Runner

**Files:**
- Modify: `lib/lesson-state.js`
- Replace: `tests/lesson-state.test.mjs`

- [ ] **Step 1: Write failing runner tests**

Use a two-scene fixture and assert:

- `START` selects `speaking` for a non-user step and `waiting-for-user` for
  a user step.
- `LINE_DONE` advances across steps and scenes automatically.
- `MIC_STARTED` and `MIC_RELEASED` enter `recording` and `evaluating`.
- a successful `EVALUATED` enters English success feedback, then
  `FEEDBACK_DONE` advances.
- first failure enters retry feedback, replays the immediately preceding model
  line, and preserves `attemptCount: 1`.
- second failure enters continue feedback and advances after feedback.
- `RECORDING_CANCELLED` returns to the same user step.
- the final scripted narrator line finishes only after its audio completes.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lesson-state.test.mjs`

Expected: FAIL because the old reducer has phrase-specific phases and events.

- [ ] **Step 3: Implement the new state contract**

```js
export const LessonPhase = {
  Idle: "idle",
  Speaking: "speaking",
  WaitingForUser: "waiting-for-user",
  Recording: "recording",
  Evaluating: "evaluating",
  Feedback: "feedback",
  Finished: "finished",
};

export function createInitialLessonState() {
  return {
    phase: LessonPhase.Idle,
    sceneIndex: 0,
    stepIndex: 0,
    attemptCount: 0,
    feedback: "",
    transcript: "",
    feedbackOutcome: null,
  };
}
```

Also export `reduceLessonState(state, event, lesson)`. Implement it with
`getCurrentScene`, `getCurrentStep`, and `advanceScriptPosition` helpers that
derive the next phase from the current speaker. Feedback strings are English:

- success: `Great job!`
- first failure: `Almost! Try again, {childName}.`
- second failure: `Almost! Let's keep going.`
- request failure: `I couldn't hear that. Try again, {childName}.`

- [ ] **Step 4: Run the reducer tests and verify GREEN**

Run: `node --test tests/lesson-state.test.mjs`

Expected: all runner tests pass.

### Task 4: Resolve Script Audio and English Feedback

**Files:**
- Modify: `lib/static-audio.js`
- Modify: `lib/lesson-audio.js`
- Modify: `lib/speech-scoring.js`
- Modify: `worker/groq.ts`
- Modify: `tests/lesson-audio.test.mjs`
- Modify: `tests/static-audio.test.mjs`
- Modify: `tests/speech-scoring.test.mjs`

- [ ] **Step 1: Write failing exact-text cache tests**

Assert that:

```js
getStaticAudioLineForSpeech("dolly", "Here you are!")
getStaticAudioLineForSpeech("narrator", "Let's copy Dolly!")
```

return English saved-audio entries, a user step returns no playback line, a
`speaking` state resolves the current step by speaker plus exact dialogue, and
a missing line throws `Missing saved audio for narrator: ...`.

Update scoring expectations to English feedback only and assert no CJK text in
scoring results or static manifest entries used by the new lesson.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/lesson-audio.test.mjs tests/static-audio.test.mjs tests/speech-scoring.test.mjs
```

Expected: FAIL against the ID-based Chinese manifest.

- [ ] **Step 3: Implement speaker-plus-text cache resolution**

`STATIC_AUDIO_LINES` remains outside lesson JSON and each entry contains
`speaker`, `text`, `lang: "en-US"`, and `src`.

```js
export function getStaticAudioLineForSpeech(speaker, text) {
  const entry = Object.entries(STATIC_AUDIO_LINES).find(
    ([, line]) => line.speaker === speaker && line.text === text
  );
  if (!entry) throw new Error(`Missing saved audio for ${speaker}: ${text}`);
  return { id: entry[0], ...entry[1] };
}
```

`getLessonAudioLine(state, lesson)` returns audio only during `speaking` and
`feedback`. It never returns audio for `waiting-for-user`, `recording`, or
`evaluating`.

- [ ] **Step 4: Replace Chinese scoring and fallback copy**

Return English `feedbackText` from `scoreSpeechTranscript` and keep retry
policy in the script reducer. Update Worker tests without changing the response
shape.

- [ ] **Step 5: Run focused audio/scoring tests and verify GREEN**

Run the Task 4 focused command again.

Expected: all focused tests pass and no new lesson path references Chinese audio.

### Task 5: Add Externally Stopped Hold-to-Talk Recording

**Files:**
- Modify: `src/speech-recorder.ts`
- Replace: `tests/speech-recorder.test.mjs`

- [ ] **Step 1: Write failing recording-session tests**

The desired API is:

```ts
const session = await startSpeechRecording(options);
const blob = await session.stop();
session.cancel();
```

Assert that recording starts after microphone access, `stop()` returns the
captured blob and stops tracks, `cancel()` rejects with `AbortError`, repeated
stop/cancel calls are safe, and an AbortSignal cancels permission or recording.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/speech-recorder.test.mjs`

Expected: FAIL because only timeout-based `recordSpeechClip` exists.

- [ ] **Step 3: Implement `startSpeechRecording`**

Remove the fixed 4.2-second timer from the primary path. Return a session whose
`stop` method stops MediaRecorder and resolves after `onstop`, and whose
`cancel` method stops the recorder and rejects. Always stop every media track.
Keep `requestMicrophoneAccess` only if another caller still uses it; otherwise
remove it with its tests.

- [ ] **Step 4: Run recorder tests and verify GREEN**

Run: `node --test tests/speech-recorder.test.mjs`

Expected: all hold-to-talk recorder tests pass.

### Task 6: Build Catalog-Backed Scene Presentation

**Files:**
- Modify: `lib/lesson-scene.js`
- Replace: `tests/lesson-scene.test.mjs`

- [ ] **Step 1: Write failing presentation tests**

For character, narrator, user, feedback, and finished states, assert the model:

```js
{
  backgroundAsset,
  characters: [
    { id: "peppa", name: "Peppa", asset, emote, isActive },
    { id: "dolly", name: "Dolly", asset, emote, isActive },
    { id: "user", name: "You", asset, emote, isActive },
  ],
  speech: { speaker, text, kind },
  settingDescription,
}
```

Narrator uses `kind: "narration"`, user uses `kind: "user"`, and feedback
uses `kind: "feedback"`. Every asset comes from the validated catalogs.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lesson-scene.test.mjs`

Expected: FAIL because the old model hard-codes Peppa and Polly fields.

- [ ] **Step 3: Implement the generic presentation model**

Resolve the current scene and step from the runner, map every scene character
through the global catalog and current step emote, and choose the background
from the scene ID. Do not branch on scene index or use Chinese presentation
strings.

- [ ] **Step 4: Run scene tests and verify GREEN**

Run: `node --test tests/lesson-scene.test.mjs`

Expected: all presentation tests pass.

### Task 7: Integrate the Picker, Automatic Runner, and Hold Button

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `lib/lesson-progress.js`
- Replace: `tests/lesson-progress.test.mjs`
- Replace: `tests/microphone-prompt-ui.test.mjs`
- Modify: `tests/architecture-cleanup.test.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Assert that App:

- imports `LESSONS` and `VISUAL_CATALOG`;
- renders a labeled lesson `select`;
- resets state when a lesson is selected;
- contains no `LESSON_STEPS`, Chinese characters, manual scene navigation, or
  request-microphone-on-start path;
- renders characters with `.map`;
- renders narrator captions separately from visible-character bubbles;
- exposes a button with `onPointerDown`, `onPointerUp`,
  `onPointerCancel`, `onKeyDown`, and `onKeyUp`;
- evaluates against `currentStep.dialogue`; and
- automatically dispatches line and feedback completion events.

Fix the existing lint failure in `tests/microphone-prompt-ui.test.mjs` by
replacing a literal run of spaces in its regex with ` {2}` while rewriting it.

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```bash
node --test tests/microphone-prompt-ui.test.mjs tests/architecture-cleanup.test.mjs tests/lesson-progress.test.mjs
```

Expected: FAIL against the current phrase-oriented UI.

- [ ] **Step 3: Implement lesson selection and automatic playback**

Keep selected lesson ID in React state. Reinitialize the reducer when selection
changes. Start the lesson without requesting microphone access. During
`speaking`, resolve/play the current cached line and dispatch `LINE_DONE`.
During `feedback`, play feedback and dispatch `FEEDBACK_DONE`. Abort pending
audio and recording when lesson or script position changes.

- [ ] **Step 4: Implement press-and-hold interaction**

On pointer or keyboard press, begin a recording session and dispatch
`MIC_STARTED`. Capture the pointer. On release, stop the session, dispatch
`MIC_RELEASED`, evaluate the blob, and dispatch `EVALUATED`. Pointer cancel
or aborted permission returns to the same user step. Prevent duplicate presses
with refs and make all visible messages English.

- [ ] **Step 5: Render the generic scene**

Render the selected background, mapped character sprites, one active character
bubble or narrator caption, lesson/scene progress, the lesson picker on idle and
finished screens, mute, errors, and the hold button. Remove previous/next scene
buttons and all Chinese copy.

- [ ] **Step 6: Replace fixed CSS with generic layout**

Use `data-character` and index/count CSS variables for up to three visible
characters. Add `.lesson-picker`, `.narrator-caption`,
`.hold-to-talk-button`, recording/evaluating states, and responsive rules.
Remove Peppa/Polly-only bubble positioning and automatic 4.2-second recording
animation.

- [ ] **Step 7: Run focused UI tests and build**

Run:

```bash
node --test tests/microphone-prompt-ui.test.mjs tests/architecture-cleanup.test.mjs tests/lesson-progress.test.mjs
npm run build
```

Expected: tests pass and TypeScript/Vite build succeeds.

### Task 8: Generate and Register Visual and Audio Cache Assets

**Files:**
- Create: `public/assets/characters/{peppa,dolly,user}/*.webp`
- Create: `public/assets/audio/*.wav`
- Modify: `content/catalogs/characters.json`
- Modify: `lib/static-audio.js`
- Modify: `scripts/generate-static-audio.mjs`
- Test: `tests/static-audio.test.mjs`
- Test: `tests/lesson-data.test.mjs`

- [ ] **Step 1: Generate missing emote assets**

Use the image-generation skill to make transparent, full-body, consistently
framed sprites for `idle`, `talking`, `listening`, `happy`, `sad`, and
`surprised`. Reuse existing Peppa assets where they already express the exact
approved emote; generate missing states from those local references. Generate
consistent Dolly states from `public/assets/dolly/dolly-idle.webp` and a
friendly child avatar for the six `user` states. Do not add text to sprites.

- [ ] **Step 2: Register every asset**

Each visible character catalog entry contains an `assets` object with exactly
the six emote keys. Each value contains `src` and descriptive `alt`. Run
`tests/lesson-data.test.mjs` to ensure every registered file exists.

- [ ] **Step 3: Add English cache metadata**

Add one manifest entry per unique scripted non-user line and the four feedback
lines. Include `speaker` so identical text can use different voices. Update
the generator's voice selection to use speaker metadata while retaining
ElevenLabs `eleven_v3`.

- [ ] **Step 4: Generate missing saved audio with ElevenLabs**

Run `npm run generate:audio:elevenlabs -- --only=<id>` for only the missing
English entries. Do not regenerate or use Chinese audio. If the API key is not
available, stop this task and report the exact missing IDs instead of substituting
local or macOS speech.

- [ ] **Step 5: Verify asset coverage**

Run:

```bash
node --test tests/lesson-data.test.mjs tests/static-audio.test.mjs tests/lesson-audio.test.mjs
```

Expected: every visual and spoken non-user lesson step resolves to an existing
saved file.

### Task 9: Remove Obsolete Phrase Data and Update Documentation

**Files:**
- Delete obsolete phrase-only exports from: `lib/lesson-data.js`
- Modify: `README.md`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/design/audio-and-content-pipeline.md`
- Modify: `docs/design/codex-session-decision-log.md`

- [ ] **Step 1: Update authoring documentation**

Document that adding/removing `content/lessons/*.json` updates the picker,
lesson JSON never contains asset filenames, visible character/emote/background
IDs must exist in global catalogs, all child-facing content is English, and
saved audio is a cache resolved by speaker plus exact text.

- [ ] **Step 2: Remove obsolete terminology**

Run:

```bash
rg -n "LESSON_STEPS|parrotPromptZh|childTarget|tipZh|durationHintSeconds|Polly|Chinese prompt|manual next" src lib tests README.md docs/design
```

Expected: no active runtime or current-design references remain; historical
design specs may retain old terminology.

- [ ] **Step 3: Run focused documentation/architecture tests**

Run:

```bash
node --test tests/architecture-cleanup.test.mjs tests/lesson-creator-prompt.test.mjs
```

Expected: both suites pass.

### Task 10: Full Verification

**Files:**
- Verify all files changed above.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test`

Expected: all tests pass with no failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: no lint errors or warnings.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build successfully and copy all referenced assets.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, only planned files changed, and unrelated
`.superpowers/` content remains untouched.
