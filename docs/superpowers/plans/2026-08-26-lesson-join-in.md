# Cartoon-First Lesson Join-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stop-and-correct speaking turns with automatic quiet join-in cues and consent-gated latest-only private recordings in every lesson.

**Architecture:** Keep the existing lesson player and JSON schema, but reduce its runtime state machine to story speech and automatic join-in beats. Add a small consent/profile contract and a write-only, owner-scoped R2 recording API; the browser captures around each cue and serializes background uploads by deterministic lesson slot.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, Cloudflare Worker/D1/R2, Drizzle ORM, Node test runner, Playwright, FFmpeg.

**Spec:** `docs/superpowers/specs/2026-08-26-lesson-join-in-design.md`

## Global Constraints

- Do not call `/api/evaluate-speech`, score, transcribe, retry, or praise a learner attempt.
- A `user` step advances automatically after its cue whether recording succeeds or not.
- Ready-made join-in cues use checked-in group MP3s at volume `0.28`; My Lessons use quiet on-device English speech at volume `0.28`.
- Only stored consent version `lesson-join-in-recording-v1` enables recording.
- Missing consent or microphone access must never block lesson playback.
- Keep only the latest clip for each `{source, lessonId, sceneIndex, stepIndex}` slot.
- Store voice privately below the authenticated user's existing R2 owner prefix; never accept a user ID from the browser.
- Revoking consent deletes all lesson recordings, and account deletion must also remove them.
- Use Tailwind utilities and `LessonPlayerUi.tsx`; do not add lesson presentation to global CSS.
- Use accessible Playwright locators; never assert CSS source or class names.
- Do not use local or macOS text-to-speech to create saved audio assets.

---

### Task 1: Reduce lesson runtime state to automatic join-in beats

**Files:**
- Modify: `lib/lesson-state.js`
- Modify: `lib/lesson-progress.js`
- Modify: `lib/lesson-scene.js`
- Modify: `lib/lesson-audio.js`
- Modify: `tests/lesson-state.test.mjs`
- Modify: `tests/lesson-progress.test.mjs`
- Modify: `tests/lesson-scene.test.mjs`
- Modify: `tests/lesson-audio.test.mjs`
- Modify: `tests/lesson-route-transition.test.mjs`
- Modify: `tests/speech-operation.test.mjs`

**Interfaces:**
- Consumes: validated lessons whose `user` steps may still contain ignored legacy `check` blocks.
- Produces: `LessonPhase.JoiningIn`, `JOIN_IN_DONE`, and `resumePhase: "speaking" | "joining-in" | null` for the player.

- [ ] **Step 1: Replace the old correction assertions with failing automatic-flow assertions**

```js
const started = reduce(createInitialLessonState(), { type: "PLAY_SCENE" });
const joining = reduce(started, { type: "LINE_DONE" });
assert.equal(joining.phase, LessonPhase.JoiningIn);
assert.equal(joining.stepIndex, 1);

const next = reduce(joining, { type: "JOIN_IN_DONE" });
assert.equal(next.phase, LessonPhase.Speaking);
assert.equal(next.sceneIndex, 1);
assert.deepEqual(Object.keys(createInitialLessonState()).sort(), [
  "phase", "resumePhase", "sceneIndex", "stepIndex",
]);
```

Add pause/resume coverage for both `Speaking` and `JoiningIn`, and assert that
legacy `MIC_STARTED`, `EVALUATED`, and `RESPONSE_DONE` events no longer form part
of the exported event contract or tested player flow.

- [ ] **Step 2: Run the focused state/helper tests and verify RED**

Run: `node --test tests/lesson-state.test.mjs tests/lesson-progress.test.mjs tests/lesson-scene.test.mjs tests/lesson-audio.test.mjs tests/lesson-route-transition.test.mjs tests/speech-operation.test.mjs`

Expected: FAIL because `LessonPhase.JoiningIn` and `JOIN_IN_DONE` do not exist and helpers still refer to response/evaluation state.

- [ ] **Step 3: Implement the minimal state and helper model**

```js
export const LessonPhase = {
  Idle: "idle",
  JoiningIn: "joining-in",
  Paused: "paused",
  Speaking: "speaking",
  Finished: "finished",
};

function getStepPhase(step) {
  return step?.speaker === "user"
    ? LessonPhase.JoiningIn
    : LessonPhase.Speaking;
}

case "JOIN_IN_DONE":
  return state.phase === LessonPhase.JoiningIn
    ? advanceScriptPosition(state, lesson)
    : state;
```

Remove attempt/response/transcript fields and their transitions. Make
`getLessonProgressLabel()` return `Join in if you want` for the join-in phase.
Make scene presentation use the current scripted `user` step without feedback
overrides. Make ordinary static/device story speech resolve only during
`Speaking`; join-in cue resolution is added in Task 2. Keep the generic
`speech-operation.ts` unit tests limited to that module's independent behavior,
not lesson-state integration.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/lesson-state.test.mjs tests/lesson-progress.test.mjs tests/lesson-scene.test.mjs tests/lesson-audio.test.mjs tests/lesson-route-transition.test.mjs tests/speech-operation.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the state replacement**

```bash
git add lib/lesson-state.js lib/lesson-progress.js lib/lesson-scene.js lib/lesson-audio.js tests/lesson-state.test.mjs tests/lesson-progress.test.mjs tests/lesson-scene.test.mjs tests/lesson-audio.test.mjs tests/lesson-route-transition.test.mjs tests/speech-operation.test.mjs
git commit -m "refactor: replace lesson corrections with join-in state"
```

### Task 2: Add quiet cue playback and checked-in group audio

**Files:**
- Modify: `lib/static-audio.js`
- Modify: `lib/lesson-audio.js`
- Modify: `src/media/audio-playback.ts`
- Modify: `src/media/device-speech.ts`
- Create: `scripts/generate-lesson-join-in-audio.mjs`
- Create: `public/assets/audio/lesson-join-in-*.mp3` (17 generated files)
- Modify: `tests/audio-playback.test.mjs`
- Modify: `tests/device-speech.test.mjs`
- Modify: `tests/lesson-audio.test.mjs`
- Modify: `tests/static-audio.test.mjs`
- Create: `tests/lesson-join-in-audio.test.mjs`

**Interfaces:**
- Consumes: `LessonPhase.JoiningIn` and exact built-in target text from Task 1.
- Produces: `getLessonJoinInAudioLine(state, lesson)`, `volume?: number` on static/device playback, and `LESSON_JOIN_IN_AUDIO_LINES` keyed by target text.

- [ ] **Step 1: Write failing cue and volume tests**

```js
const cue = getLessonJoinInAudioLine(
  { ...createInitialLessonState(), phase: LessonPhase.JoiningIn, stepIndex: 1 },
  lesson,
);
assert.equal(cue.text, "Here you are!");
assert.equal(cue.volume, 0.28);
assert.match(cue.audioSrc, /lesson-join-in-.*\.mp3$/);

await playAudioLine({ audioSrc: "/cue.mp3", env, text: "Hello", volume: 0.28 });
assert.equal(createdAudio.volume, 0.28);

await playDeviceSpeech({ env, speaker: "narrator", text: "Hello", volume: 0.28 });
assert.equal(utterance.volume, 0.28);
```

Add an asset test that every built-in `user` step resolves exact matching text
and that every referenced MP3 exists, is non-empty, and passes `ffprobe`.

- [ ] **Step 2: Run the cue/audio tests and verify RED**

Run: `node --test tests/audio-playback.test.mjs tests/device-speech.test.mjs tests/lesson-audio.test.mjs tests/static-audio.test.mjs tests/lesson-join-in-audio.test.mjs`

Expected: FAIL because join-in cue mapping and playback volume options are absent.

- [ ] **Step 3: Implement cue mapping and playback volume**

Add 17 definitions shaped as:

```js
{
  id: "lesson-join-in-dolly-it-is-up-high",
  sourceAudioId: "dolly-it-is-up-high",
  text: "It is up high!",
}
```

Export `LESSON_JOIN_IN_AUDIO_LINES` and an exact-text lookup. Add
`volume?: number` to `PlayAudioLineOptions`, assign `audio.volume = volume`, and
add `volume?: number` to `playDeviceSpeech`, assigning
`utterance.volume = volume`. Keep default volume `1` for all existing callers.

- [ ] **Step 4: Add and run the deterministic FFmpeg mixer**

The script imports the definitions, resolves each `sourceAudioId` through
`STATIC_AUDIO_LINES`, and invokes FFmpeg with three copies of the existing
ElevenLabs MP3. Use this filter graph for small pitch/timing variation and a
bounded mix:

```text
[0:a]volume=0.82[a0];
[1:a]asetrate=44100*0.98,aresample=44100,adelay=28|28,volume=0.62[a1];
[2:a]asetrate=44100*1.025,aresample=44100,adelay=55|55,volume=0.58[a2];
[a0][a1][a2]amix=inputs=3:duration=long:normalize=0,alimiter=limit=0.95[out]
```

Run: `node scripts/generate-lesson-join-in-audio.mjs`

Expected: 17 MP3 files are written below `public/assets/audio` using only
checked-in ElevenLabs source files.

- [ ] **Step 5: Run the cue/audio tests and verify GREEN**

Run: `node --test tests/audio-playback.test.mjs tests/device-speech.test.mjs tests/lesson-audio.test.mjs tests/static-audio.test.mjs tests/lesson-join-in-audio.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit cue playback and assets**

```bash
git add lib/static-audio.js lib/lesson-audio.js src/media/audio-playback.ts src/media/device-speech.ts scripts/generate-lesson-join-in-audio.mjs public/assets/audio/lesson-join-in-*.mp3 tests/audio-playback.test.mjs tests/device-speech.test.mjs tests/lesson-audio.test.mjs tests/static-audio.test.mjs tests/lesson-join-in-audio.test.mjs
git commit -m "feat: add quiet group join-in cues"
```

### Task 3: Rewrite ready-made and authored lesson content

**Files:**
- Modify: `content/lessons/01-peppas-high-ball.json`
- Modify: `content/lessons/02-garden-colors.json`
- Modify: `content/lessons/03-snack-time.json`
- Modify: `content/lessons/04-playground-words.json`
- Modify: `content/lessons/05-market-day.json`
- Modify: `content/lessons/06-picnic-time.json`
- Modify: `content/lessons/07-bedtime-story.json`
- Modify: `worker/prompts/lesson-generator.ts`
- Modify: `src/lessons/LessonGuiEditor.tsx`
- Modify: `tests/lesson-catalog.test.mjs`
- Modify: `tests/lesson-generator.test.mjs`
- Modify: `tests/lesson-creator-prompt.test.mjs`
- Modify: `tests/lesson-editor-ui.test.mjs`
- Modify: `tests/static-audio.test.mjs`

**Interfaces:**
- Consumes: exact join-in phrase inventory supported by Task 2.
- Produces: 18 unchecked built-in `user` steps directly after natural story dialogue, plus narrator/check-free authoring defaults.

- [ ] **Step 1: Write failing content-contract tests**

```js
for (const { lesson } of LESSONS) {
  const steps = lesson.scenes.flatMap((scene) => scene.steps);
  assert.equal(steps.some((step) => step.check), false);
  assert.equal(steps.some((step) => /^Let's (copy|ask|thank)/.test(step.dialogue)), false);
  assert.notEqual(steps.at(-1)?.dialogue, "Great job!");

  for (const [index, step] of steps.entries()) {
    if (step.speaker !== "user") continue;
    assert.equal(steps[index - 1]?.dialogue, step.dialogue);
    assert.notEqual(steps[index - 1]?.speaker, "narrator");
  }
}
```

Assert the generator prompt says `Omit check for every user step`, forbids
instructional narrator prompts/attempt feedback, and its example contains a
story-character line immediately followed by the same unchecked user line.
Assert the GUI no longer renders `Check the learner's pronunciation` or creates
generic `Great job`/`Almost` response defaults.

- [ ] **Step 2: Run content/authoring tests and verify RED**

Run: `node --test tests/lesson-catalog.test.mjs tests/lesson-generator.test.mjs tests/lesson-creator-prompt.test.mjs tests/lesson-editor-ui.test.mjs tests/static-audio.test.mjs`

Expected: FAIL on the current narrator prompts, check blocks, final praise, and editor defaults.

- [ ] **Step 3: Rewrite all seven scripts mechanically**

For each join-in sequence, retain the first story-native character occurrence,
delete the narrator coaching step and the second duplicate model occurrence,
and retain the following `user` step after removing its `check`. Delete only the
standalone final narrator `Great job!` step; preserve every other story line,
scene, emote, visual, and summary.

- [ ] **Step 4: Align generator and editor defaults**

Change the prompt contract and example to unchecked direct join-ins. In the GUI,
make a new step default to `speaker: "peppa"`, remove the add/edit pronunciation
check controls, and preserve imported `check` data internally so opening and
saving an old compatible lesson does not silently corrupt unrelated JSON.

- [ ] **Step 5: Run content/authoring tests and verify GREEN**

Run: `node --test tests/lesson-catalog.test.mjs tests/lesson-generator.test.mjs tests/lesson-creator-prompt.test.mjs tests/lesson-editor-ui.test.mjs tests/static-audio.test.mjs`

Expected: PASS, with 18 total join-in beats and 17 unique targets.

- [ ] **Step 6: Commit the story-first content**

```bash
git add content/lessons worker/prompts/lesson-generator.ts src/lessons/LessonGuiEditor.tsx tests/lesson-catalog.test.mjs tests/lesson-generator.test.mjs tests/lesson-creator-prompt.test.mjs tests/lesson-editor-ui.test.mjs tests/static-audio.test.mjs
git commit -m "content: make lesson participation story-native"
```

### Task 4: Persist guardian lesson-recording consent

**Files:**
- Create: `migrations/0011_lesson_recording_consent.sql`
- Modify: `src/db/schema.ts`
- Create: `lib/lesson-recording-consent.js`
- Modify: `worker/learner-profile-repository.ts`
- Modify: `worker/learner-profile.ts`
- Modify: `worker/guardian-access.ts`
- Modify: `worker/index.ts`
- Create: `worker/lesson-recording-storage.ts`
- Modify: `src/learner-profile/learner-profile-api.ts`
- Modify: `src/learner-profile/ProfileEditor.tsx`
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `tests/guardian-access-schema.test.mjs`
- Modify: `tests/learner-profile-api.test.mjs`
- Modify: `tests/learner-profile-worker.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/guardian-access-worker.test.mjs`
- Create: `tests/lesson-recording-storage.test.mjs`

**Interfaces:**
- Produces: `LESSON_RECORDING_CONSENT_VERSION`, `GET /api/lesson-recordings/consent`, and guardian-only `PUT /api/profile/lesson-recording-consent` with `{ enabled: boolean }`.
- Produces: `deleteAllLessonRecordings(bucket, userId)` and
  `deleteLessonRecordingsForLesson(bucket, userId, source, lessonId)` for the
  consent mutation and Task 5.

- [ ] **Step 1: Write failing schema, API, authorization, and UI tests**

```js
assert.match(migration, /lesson_recording_consent_version/);
assert.match(migration, /lesson_recording_consent_at/);

const response = await callProfileConsent({ method: "PUT", body: { enabled: true } });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { enabled: true });

const locked = await worker.fetch(consentPutRequest, env);
assert.equal(locked.status, 403);

assert.match(renderProfile({ lessonRecordingConsent: false }), /Allow lesson voice recordings/);
assert.match(renderProfile({ lessonRecordingConsent: true }), /Stop and delete lesson recordings/);
```

Add storage-helper tests with a two-page fake R2 listing. Assert deletion is
limited to
`personalized-story-art/{encoded-user}/lesson-recordings/`, rejects an
out-of-prefix key, and rejects a truncated page whose cursor does not advance.

- [ ] **Step 2: Run consent tests and verify RED**

Run: `node --test tests/guardian-access-schema.test.mjs tests/learner-profile-api.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profile-ui.test.mjs tests/guardian-access-worker.test.mjs tests/lesson-recording-storage.test.mjs`

Expected: FAIL because the consent columns, routes, repository methods, and profile controls are absent.

- [ ] **Step 3: Add the migration and repository contract**

```sql
ALTER TABLE learner_profile ADD COLUMN lesson_recording_consent_version text;
ALTER TABLE learner_profile ADD COLUMN lesson_recording_consent_at integer;
```

Add nullable Drizzle fields and repository methods:

```ts
readLessonRecordingConsent(userId: string): Promise<boolean>
saveLessonRecordingConsent(userId: string, enabled: boolean): Promise<boolean>
```

Enabling writes `lesson-join-in-recording-v1` and `now()`; disabling clears both.

- [ ] **Step 4: Add the authenticated read and guardian-only mutation**

Make `GET /api/lesson-recordings/consent` return `{ enabled }` with
`Cache-Control: no-store`. Make the profile consent PUT accept exactly one
boolean key. Add the mutation path to `requiresGuardianAccess()`. On disable,
persist `false` before awaiting the exact user-prefix purge.

Implement the prefix helper in `worker/lesson-recording-storage.ts`. Paginate
with `bucket.list({ prefix, cursor })`, verify every returned key starts with the
exact prefix, delete only that page's keys, and require a changed non-empty
cursor when `truncated` is true. The per-lesson variant adds
`${source}/${encodeURIComponent(lessonId)}/` below the owner prefix.

- [ ] **Step 5: Add the guardian profile controls**

Expose `lessonRecordingConsent` in the guardian profile payload and API types.
Render the dedicated section in `ProfileEditor`. Grant immediately after a
button press; on revoke, call `window.confirm()` with explicit deletion copy and
then disable/delete. Keep errors in the profile page alert and preserve shared
button primitives.

- [ ] **Step 6: Run consent tests and verify GREEN**

Run: `node --test tests/guardian-access-schema.test.mjs tests/learner-profile-api.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profile-ui.test.mjs tests/guardian-access-worker.test.mjs tests/lesson-recording-storage.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit persistent consent**

```bash
git add migrations/0011_lesson_recording_consent.sql src/db/schema.ts lib/lesson-recording-consent.js worker/lesson-recording-storage.ts worker/learner-profile-repository.ts worker/learner-profile.ts worker/guardian-access.ts worker/index.ts src/learner-profile/learner-profile-api.ts src/learner-profile/ProfileEditor.tsx src/learner-profile/LearnerProfileGate.tsx tests/guardian-access-schema.test.mjs tests/learner-profile-api.test.mjs tests/learner-profile-worker.test.mjs tests/learner-profile-ui.test.mjs tests/guardian-access-worker.test.mjs tests/lesson-recording-storage.test.mjs
git commit -m "feat: add guardian lesson recording consent"
```

### Task 5: Store the latest private clip per lesson slot

**Files:**
- Create: `worker/lesson-recordings.ts`
- Create: `worker/lesson-recording-catalog.ts`
- Modify: `worker/lesson-recording-storage.ts`
- Modify: `worker/index.ts`
- Modify: `worker/my-lessons.ts`
- Create: `src/lessons/lesson-recording-api.ts`
- Create: `tests/lesson-recording-worker.test.mjs`
- Create: `tests/lesson-recording-api.test.mjs`
- Modify: `tests/worker-auth.test.mjs`
- Modify: `tests/my-lessons-worker.test.mjs`
- Modify: `tests/account-deletion.test.mjs`

**Interfaces:**
- Consumes: `LESSON_RECORDING_CONSENT_VERSION` and profile consent repository from Task 4.
- Produces: `loadLessonRecordingConsent()` and
  `saveLessonRecording(blob, slot)`; consumes the prefix deletion helpers from
  Task 4.

- [ ] **Step 1: Write failing client and Worker tests**

```js
await saveLessonRecording(blob, {
  source: "parrot",
  lessonId: "01-peppas-high-ball",
  sceneIndex: 0,
  stepIndex: 2,
}, { fetch });
assert.equal(call.method, "PUT");
assert.equal(call.url, "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2");
assert.strictEqual(call.body, blob);

assert.equal(await callUpload({ consent: false }).then((r) => r.status), 403);
assert.equal(await callUpload({ source: "my", owner: "other-user" }).then((r) => r.status), 404);
assert.equal(bucket.calls.put[0].key,
  "personalized-story-art/user-1/lesson-recordings/parrot/01-peppas-high-ball/scene-0/step-2.audio");
```

Cover unauthenticated access, invalid source/ID/index, non-user target, exact
built-in and owner-scoped My Lesson resolution, empty/oversized/mismatched media,
metadata, latest overwrite, post-write consent revocation, account deletion
before/after write, paginated prefix deletion, and My Lesson update purge.

- [ ] **Step 2: Run recording tests and verify RED**

Run: `node --test tests/lesson-recording-api.test.mjs tests/lesson-recording-worker.test.mjs tests/worker-auth.test.mjs tests/my-lessons-worker.test.mjs tests/account-deletion.test.mjs`

Expected: FAIL because the client API, route, storage, and target catalog do not exist.

- [ ] **Step 3: Implement deterministic owner-scoped storage**

```ts
export function lessonRecordingObjectKey(userId: string, slot: LessonRecordingSlot) {
  return `personalized-story-art/${encodeURIComponent(userId)}/lesson-recordings/${slot.source}/${encodeURIComponent(slot.lessonId)}/scene-${slot.sceneIndex}/step-${slot.stepIndex}.audio`;
}
```

Read at most 512 KiB, normalize WebM/MP4/Ogg content types, verify container
magic bytes, and put raw bytes with `source`, `lessonId`, `sceneIndex`,
`stepIndex`, `targetText`, `recordedAt`, and `consentVersion` metadata. Resolve
the target from seven statically imported built-ins or the owner-scoped My
Lesson row, validate that it is a `user` step, and never trust target text from
the request.

- [ ] **Step 4: Enforce consent, deletion state, and purge behavior**

Check account-deletion tombstone and stored consent before and after `put`. If a
post-check fails, delete the disallowed slot and return `409` for deletion or
`403` for consent. Paginate only below the exact lesson-recording prefix and
reject non-advancing cursors or keys outside that prefix. Export whole-prefix
and one-My-Lesson-prefix deletion for consent revocation and lesson editing.

- [ ] **Step 5: Wire Worker and browser APIs**

Authenticate every `/api/lesson-recordings/*` request in `worker/index.ts`.
Implement the consent GET and slot PUT only; return `405` for other methods.
The browser API sends raw blobs with their recorder MIME type and maps
`403 guardian_consent_required` to a disabled-recording result rather than a
lesson playback exception.

- [ ] **Step 6: Run recording tests and verify GREEN**

Run: `node --test tests/lesson-recording-api.test.mjs tests/lesson-recording-worker.test.mjs tests/worker-auth.test.mjs tests/my-lessons-worker.test.mjs tests/account-deletion.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit private latest-slot storage**

```bash
git add worker/lesson-recordings.ts worker/lesson-recording-catalog.ts worker/lesson-recording-storage.ts worker/index.ts worker/my-lessons.ts src/lessons/lesson-recording-api.ts tests/lesson-recording-worker.test.mjs tests/lesson-recording-api.test.mjs tests/worker-auth.test.mjs tests/my-lessons-worker.test.mjs tests/account-deletion.test.mjs
git commit -m "feat: save latest private lesson join-ins"
```

### Task 6: Add the non-blocking serialized browser save queue

**Files:**
- Create: `src/lessons/lesson-recording-queue.ts`
- Create: `tests/lesson-recording-queue.test.mjs`

**Interfaces:**
- Consumes: `saveLessonRecording(blob, slot)` from Task 5.
- Produces: `createLessonRecordingQueue({ save })` with `enqueue`, `retryFailed`, `snapshot`, and `settle` methods.

- [ ] **Step 1: Write failing ordering and retention tests**

```js
const queue = createLessonRecordingQueue({ save });
queue.enqueue(slot, firstBlob);
queue.enqueue(slot, secondBlob);
assert.equal(maxConcurrentSavesForSlot, 1);
assert.deepEqual(savedBlobs, [firstBlob, secondBlob]);

save.rejectOnce(new Error("offline"));
queue.enqueue(otherSlot, failedBlob);
await queue.settle();
assert.equal(queue.snapshot().failed, 1);
await queue.retryFailed();
assert.equal(queue.snapshot().failed, 0);
```

Also assert different slots may upload concurrently and no queue method owns a
route-scoped `AbortController`.

- [ ] **Step 2: Run the queue test and verify RED**

Run: `node --test tests/lesson-recording-queue.test.mjs`

Expected: FAIL because the queue module does not exist.

- [ ] **Step 3: Implement the smallest per-slot promise chains**

Use a `Map<string, Promise<void>>` for tails and a `Map<string, { blob, slot }>`
for only the newest failed blob per slot. `enqueue()` appends after
`previous.catch(() => undefined)`, starts saving immediately, updates a
subscribable `{ pending, failed }` snapshot, and does not throw into lesson
playback. `retryFailed()` re-enqueues retained entries. `settle()` awaits the
current tails once and returns the snapshot.

- [ ] **Step 4: Run the queue test and verify GREEN**

Run: `node --test tests/lesson-recording-queue.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the save queue**

```bash
git add src/lessons/lesson-recording-queue.ts tests/lesson-recording-queue.test.mjs
git commit -m "feat: queue lesson recordings by slot"
```

### Task 7: Replace manual speaking UI with automatic capture and cue playback

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/lessons/LessonPlayerUi.tsx`
- Modify: `tests/full-scene-lesson-ui.test.mjs`
- Modify: `tests/lesson-route-activity.test.mjs`
- Modify: `tests/lesson-route-transition.test.mjs`
- Modify: `tests/lesson-progress.test.mjs`
- Modify: `tests/e2e/lesson-player.spec.ts`
- Modify: `src/testing/e2e-browser-mocks.ts`

**Interfaces:**
- Consumes: join-in state/cues from Tasks 1–2, recording API from Task 5, and save queue from Task 6.
- Produces: the final learner flow: preflight on start, automatic cue/capture, immediate advancement, and neutral completion saving state.

- [ ] **Step 1: Add failing player behavior tests**

Cover these observable cases with accessible locators and mocked media:

```ts
await page.getByRole("button", { name: "Let's go" }).click();
await expect(page.getByRole("heading", { name: "Join in" })).toBeVisible();
await expect(page.getByText("It is up high!")).toBeVisible();
await expect.poll(() => mediaRecorderStarts).toBe(1);
await expect.poll(() => savedSlots).toEqual([{ sceneIndex: 0, stepIndex: 2 }]);
await expect(page.getByText(/checking|try again|great job/i)).toHaveCount(0);
```

Add no-consent (zero `getUserMedia` calls), denied-preflight, per-beat mic
failure, cue failure, pause/restart, scene navigation cancellation, non-blocking
upload, completion saving, and retry assertions.

- [ ] **Step 2: Run focused unit/browser tests and verify RED**

Run: `node --test tests/full-scene-lesson-ui.test.mjs tests/lesson-route-activity.test.mjs tests/lesson-route-transition.test.mjs tests/lesson-progress.test.mjs`

Run: `npx playwright test tests/e2e/lesson-player.spec.ts`

Expected: FAIL because the current player still exposes manual record/check/feedback flow.

- [ ] **Step 3: Replace player orchestration**

Remove `evaluateSpeech`, `finishSpeechOperation`, recording toggle, skip,
evaluation, feedback, and transcript code from `LessonPlayer`. Load consent once
per lesson instance. Make the idle start handler await mic preflight only when
enabled, remember denial for the session, and always dispatch `PLAY_SCENE`.

For `JoiningIn`, start recording when permitted, then play the static group cue
or quiet device guide. After a successful cue, wait 250 ms, stop recording,
enqueue a non-empty blob, and dispatch `JOIN_IN_DONE`. If recording cannot start,
play the cue alone. If the cue fails, cancel/discard the partial capture, wait a
bounded display delay, and dispatch `JOIN_IN_DONE`. Effect cleanup cancels only
unfinished media, not queued uploads.

- [ ] **Step 4: Replace lesson-player presentation**

Change introduction copy to **Watch and join in**. Add
`LessonJoinInPrompt({ dialogue, recording, reserved })` with an accessible
`Join in` heading, target phrase, and `Voices are joining in` or
`Your microphone is joining in too` status. Reuse playback controls during join
beats. Remove `LessonSpeakingControls` and `LessonFeedback` from the player.
Extend completion with `saveState`, `onRetrySaving`, and neutral saving/error
copy; never show performance feedback.

- [ ] **Step 5: Run focused unit/browser tests and verify GREEN**

Run: `node --test tests/full-scene-lesson-ui.test.mjs tests/lesson-route-activity.test.mjs tests/lesson-route-transition.test.mjs tests/lesson-progress.test.mjs`

Run: `npx playwright test tests/e2e/lesson-player.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the automatic player flow**

```bash
git add src/app/App.tsx src/lessons/LessonPlayerUi.tsx src/testing/e2e-browser-mocks.ts tests/full-scene-lesson-ui.test.mjs tests/lesson-route-activity.test.mjs tests/lesson-route-transition.test.mjs tests/lesson-progress.test.mjs tests/e2e/lesson-player.spec.ts
git commit -m "feat: make lessons automatic join-in cartoons"
```

### Task 8: Make privacy copy truthful and verify all responsive surfaces

**Files:**
- Modify: `src/app/AboutDialog.tsx`
- Modify: `tests/learner-profile-privacy.test.mjs`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `tests/e2e/learner-profile-operation-feedback.spec.ts`
- Modify: `tests/e2e/lesson-player.spec.ts`

**Interfaces:**
- Consumes: final consent, storage, and player behavior from Tasks 4–7.
- Produces: consistent guardian disclosures and responsive/accessibility regression coverage.

- [ ] **Step 1: Add failing privacy and responsive assertions**

Assert the saved-data dialog says lesson clips are private, consent-gated,
latest-only, currently unscored/untranscribed, and deleted by revocation/account
deletion. Assert it no longer makes the unconditional claim that raw activity
audio is never added to the account.

In Playwright, cover profile consent grant/revoke and the lesson intro/join-in/
completion at 280×653, 390×844, 667×375, and 1440×900. Check no horizontal
overflow, route-header overlap, hidden primary controls, or lost accessible
names.

- [ ] **Step 2: Run focused privacy/browser tests and verify RED**

Run: `node --test tests/learner-profile-privacy.test.mjs`

Run: `npx playwright test tests/e2e/header.spec.ts tests/e2e/learner-profile-operation-feedback.spec.ts tests/e2e/lesson-player.spec.ts`

Expected: FAIL until disclosure copy and responsive cases are updated.

- [ ] **Step 3: Update the data notice and any layout defects exposed by behavior tests**

Use this factual core copy: `With guardian permission, lessons save one private
voice clip for each join-in moment. A new take replaces the previous take for
that moment. Parrot does not score or transcribe these clips yet. Stopping
lesson recording or deleting the account deletes them.` Keep existing
conversation/transcription and personalized-art disclosures accurate.

Fix only rendered containment defects in `LessonPlayerUi.tsx` with Tailwind
utilities; do not add page-specific global CSS or assert classes in tests.

- [ ] **Step 4: Run focused privacy/browser tests and verify GREEN**

Run: `node --test tests/learner-profile-privacy.test.mjs`

Run: `npx playwright test tests/e2e/header.spec.ts tests/e2e/learner-profile-operation-feedback.spec.ts tests/e2e/lesson-player.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit privacy and responsive coverage**

```bash
git add src/app/AboutDialog.tsx src/lessons/LessonPlayerUi.tsx tests/learner-profile-privacy.test.mjs tests/e2e/header.spec.ts tests/e2e/learner-profile-operation-feedback.spec.ts tests/e2e/lesson-player.spec.ts
git commit -m "test: cover join-in privacy and responsive flow"
```

### Task 9: Full verification and independent review

**Files:**
- Modify only files required by concrete failures found in this task.

**Interfaces:**
- Consumes: the complete feature from Tasks 1–8.
- Produces: fresh verification evidence and a review-ready detached-head commit series.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test`

Expected: PASS with zero skipped feature tests introduced by this plan.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS and the 17 join-in assets appear in `dist/assets/audio` through normal Vite copying.

- [ ] **Step 3: Run the complete browser suite**

Run: `npm run test:browser`

Expected: PASS across configured Chromium projects.

- [ ] **Step 4: Inspect generated group audio and worktree integrity**

Run: `for file in public/assets/audio/lesson-join-in-*.mp3; do ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file"; done`

Expected: 17 positive durations and no decoder errors.

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional changes, if a verification fix has not yet been committed.

- [ ] **Step 5: Request independent code review and apply only verified findings**

Review against `docs/superpowers/specs/2026-08-26-lesson-join-in-design.md`, with
special attention to accidental scoring calls, no-consent microphone access,
owner isolation, consent/revocation races, latest-slot ordering, media cleanup,
and 280 px containment. Re-run the directly affected command after every fix.

- [ ] **Step 6: Commit any verification fixes**

```bash
git add -u
git commit -m "fix: close lesson join-in review findings"
```

Skip this commit only when review and verification produce no file changes.

- [ ] **Step 7: Record final evidence**

Run: `git log --oneline --decorate -10`

Expected: the design commit and independently testable implementation commits
are present above the original worktree base.
