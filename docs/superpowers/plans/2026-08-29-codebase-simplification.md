# Codebase Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove audited dead code, duplicate runtime paths, browser-side durability machinery, and source-structure tests while preserving every user-visible, privacy, and operational contract.

**Architecture:** Treat the worker as the sole durable authority for learner rosters and conversation state, reuse existing runtime implementations instead of wrappers, and keep responsive presentation with the React component that owns it. Deletions are grouped by one review surface; behavior-sensitive changes use focused red-green cycles and retain authoritative server fences.

**Tech Stack:** TypeScript, React 19, Tailwind CSS 4, Cloudflare Workers/D1, Drizzle ORM, Node test runner, Vite SSR, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-codebase-simplification-design.md`

## Global Constraints

- Ponytail full: delete or reuse before inventing an abstraction, and keep only complexity that protects a demonstrated contract.
- Keep deletion tombstones, R2 fencing/retries, guardian boundaries, rate-limit bindings, bounded request readers, media verification, feature flags, and source lesson audio unchanged.
- Keep the database questionnaire tables and `learner_profile.questionnaire_version` foreign key unchanged because production data has not been audited.
- Do not edit or renumber historical migrations, including duplicate numeric prefixes; add one new forward migration for `conversation_fact`.
- Do not change visible learner names or authored lesson content.
- Do not introduce replacement frameworks, state libraries, or dependencies.
- Use Tailwind 4 utilities in React; `lesson.css` may contain only runtime character-slot positioning, the speech-tail polygon, and the combined short-wide placement override.
- Test rendered behavior with accessible locators; never add assertions about CSS source, class names, filenames, imports, or private identifiers.
- For behavior-preserving refactors, prove the existing behavior test can catch the regression by removing the old implementation first, observing the focused test fail, then adding the replacement and observing it pass.

---

### Task 1: Remove abandoned artifacts and duplicate commands

**Files:**
- Delete: `src/app/app-navigation.ts`
- Delete: `src/lessons/speech-operation.ts`
- Delete: `tests/speech-operation.test.mjs`
- Delete: `scripts/run-maestro-tests.mjs`
- Delete: `.maestro/learner-profile-conversation.yaml`
- Delete: `.maestro/lesson-incorrect.yaml`
- Delete: `.maestro/lesson-no-speech.yaml`
- Delete: `.maestro/lesson-success.yaml`
- Delete: `agent/Dockerfile`
- Modify: `package.json`
- Modify: `docs/deployment/livekit-agent.md`
- Modify: `tests/conversation-infrastructure.test.mjs`
- Delete: the eleven pre-existing files under `docs/superpowers/plans/` other than this plan
- Delete: the eleven pre-existing files under `docs/superpowers/specs/` other than the matching simplification design

**Interfaces:**
- Consumes: the root `Dockerfile`, canonical `test:browser` script, and canonical `generate:audio:elevenlabs` script.
- Produces: one Docker build definition and one command name for each supported browser-test and ElevenLabs-audio workflow.

- [ ] **Step 1: Verify the deletion targets are unreferenced or duplicated**

Run:

```bash
rg -n "app-navigation|speech-operation|run-maestro-tests|agent/Dockerfile|test:maestro|test:e2e|generate:audio\"" . --glob '!dist/**' --glob '!node_modules/**' --glob '!docs/superpowers/**'
cmp Dockerfile agent/Dockerfile
```

Expected: the dead modules have no production callers, the stale commands point only to the Maestro runner, and `cmp` exits 0.

- [ ] **Step 2: Make the infrastructure test fail against the single-Dockerfile contract**

Change `tests/conversation-infrastructure.test.mjs` so the deployment test reads only `../Dockerfile`, still checks lockfile installation, shared `lib` copying, CA certificates, and the unprivileged `node` user, and no longer compares two Dockerfiles. Delete `agent/Dockerfile`, then run:

```bash
node --test tests/conversation-infrastructure.test.mjs
```

Expected: FAIL before the test is updated because the old test tries to read the deleted file; PASS after the behavioral deployment checks target the root file.

- [ ] **Step 3: Delete stale modules, flows, runner, and historical planning documents**

Use `apply_patch` to remove every listed artifact. Preserve only:

```text
docs/superpowers/plans/2026-08-29-codebase-simplification.md
docs/superpowers/specs/2026-08-29-codebase-simplification-design.md
```

- [ ] **Step 4: Remove duplicate package aliases and update deployment prose**

Delete `generate:audio`, `test:e2e`, and `test:maestro` from `package.json`. Keep `generate:audio:elevenlabs` and `test:browser`. Replace the deployment paragraph with:

```markdown
The repository-root `Dockerfile` is the LiveKit build file. It uses the npm
lockfile, installs the required CA bundle, and runs as the unprivileged `node`
user.
```

- [ ] **Step 5: Verify the mechanical cleanup**

Run:

```bash
npm run build
node --test tests/conversation-infrastructure.test.mjs
rg -n "run-maestro-tests|agent/Dockerfile|test:maestro|test:e2e|\"generate:audio\"" . --glob '!dist/**' --glob '!node_modules/**' --glob '!docs/superpowers/**'
```

Expected: build and test PASS; the final search returns no matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove abandoned project artifacts"
```

---

### Task 2: Reuse the single speech recorder lifecycle

**Files:**
- Modify: `tests/speech-recorder.test.mjs`
- Modify: `src/media/speech-recorder.ts`

**Interfaces:**
- Consumes: `startSpeechRecording(options): Promise<SpeechRecordingSession>` and its existing `stop(): Promise<RecordedSpeechClip>` contract.
- Produces: the unchanged `recordSpeechClip(options): Promise<RecordedSpeechClip>` API implemented only as a timeout/stop-signal adapter.

- [ ] **Step 1: Add a test that distinguishes delegation from the duplicate recorder path**

Refactor the test fixture so both APIs use the same fake `MediaRecorder` instance factory. Add a case proving `recordSpeechClip` calls `onRecordingStart`, stops through the session after the injected timeout, and stops every acquired track exactly once. The break caught is a second stream/recorder lifecycle inside `recordSpeechClip`.

- [ ] **Step 2: Observe RED by removing the duplicate implementation body**

Replace the body of `recordSpeechClip` temporarily with a call that starts a session but does not schedule or await stop, then run:

```bash
node --test tests/speech-recorder.test.mjs
```

Expected: the new timed-stop test FAILS because the clip never settles through the injected timer.

- [ ] **Step 3: Implement the minimal adapter**

Use this control flow in `recordSpeechClip`:

```ts
const session = await startSpeechRecording({
  MediaRecorder: MediaRecorderClass,
  getUserMedia,
  mimeType,
  signal,
});
try {
  onRecordingStart?.();
} catch (error) {
  session.cancel();
  await session.stop().catch(() => undefined);
  throw error;
}
return await new Promise<Blob>((resolve, reject) => {
  let timeout: TimerId | null = null;
  let stopPromise: Promise<Blob> | null = null;
  const cleanup = () => {
    if (timeout !== null) clearRecordingTimeout(timeout);
    signal?.removeEventListener("abort", stop);
    stopSignal?.removeEventListener("abort", stop);
  };
  const stop = () => {
    stopPromise ??= session.stop().finally(cleanup);
    void stopPromise.then(resolve, reject);
  };
  signal?.addEventListener("abort", stop, { once: true });
  stopSignal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted || stopSignal?.aborted) {
    stop();
    return;
  }
  try {
    timeout = setRecordingTimeout(stop, recordingMs);
  } catch (error) {
    cleanup();
    session.cancel();
    void session.stop().catch(() => undefined);
    reject(error);
  }
});
```

Do not change callers or add a helper class. Preserve pre-abort behavior,
callback/timer errors, recorder errors, and track cleanup already owned by
`startSpeechRecording`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/speech-recorder.test.mjs
npm run build
```

Expected: all recorder tests and type checking PASS with one stream/recorder implementation in the source file.

- [ ] **Step 5: Commit**

```bash
git add src/media/speech-recorder.ts tests/speech-recorder.test.mjs
git commit -m "refactor: reuse speech recorder lifecycle"
```

---

### Task 3: Render dubbing definitions without scene injection

**Files:**
- Delete: `src/dubbing/DubSceneTypes.ts`
- Delete: `src/dubbing/DuckScene.tsx`
- Delete: `src/dubbing/FarmScene.tsx`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DubStudio.tsx`
- Modify: `src/dubbing/DuckDub.tsx`
- Modify: `src/app/App.tsx`
- Modify: `tests/dub-ui.test.mjs`
- Modify: `tests/farm-scene.test.mjs`

**Interfaces:**
- Consumes: each route's existing `DubProjectDefinition` value.
- Produces: direct `<IllustratedDubScene definition={definition} ... />` rendering in project, editor, and studio views; `DuckDub` remains a lazy-route module.

- [ ] **Step 1: Rewrite wrapper tests around the real renderer**

Update the two focused scene tests to render `IllustratedDubScene` with `FIVE_LITTLE_DUCKS_DUB` or `OLD_MACDONALD_DUB` directly. Keep their observable assertions about character count/labels and scene changes. The break caught is failing to pass the selected definition to the real renderer.

- [ ] **Step 2: Observe RED after deleting wrapper modules**

Delete the three wrapper/type files and run:

```bash
node --test tests/dub-ui.test.mjs tests/farm-scene.test.mjs
```

Expected: FAIL because production components and tests still import the deleted wrapper/type modules.

- [ ] **Step 3: Remove component injection**

Remove every `Scene` prop, default, import, and `as unknown as DubSceneComponent` cast. In each owning view, import `IllustratedDubScene` and render:

```tsx
<IllustratedDubScene definition={definition} scene={scene} />
```

Pass through the existing scene-state props accepted by `IllustratedDubScene`; do not add a replacement component type. `DuckDub` passes only `definition={FIVE_LITTLE_DUCKS_DUB}` to `DubProjectHome`, and the Old MacDonald route passes only its definition.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/dub-ui.test.mjs tests/farm-scene.test.mjs tests/dub-routing.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts
npm run build
```

Expected: unit, route, browser, and build checks PASS; `rg -n "DubSceneComponent|DuckScene|FarmScene|Scene=" src tests` returns no matches.

- [ ] **Step 5: Commit**

```bash
git add -A src/dubbing src/app/App.tsx tests/dub-ui.test.mjs tests/farm-scene.test.mjs
git commit -m "refactor: render dubbing scenes directly"
```

---

### Task 4: Move lesson presentation into Tailwind components

**Files:**
- Modify: `src/lesson.css`
- Modify: `src/lessons/LessonPlayerUi.tsx`
- Modify: `tests/e2e/lesson-player.spec.ts`
- Modify: `tests/full-scene-lesson-ui.test.mjs`

**Interfaces:**
- Consumes: existing lesson HUD, characters, speech, start action, controls, and error domain components.
- Produces: the same accessible DOM and responsive containment with static presentation expressed as Tailwind 4 utilities.

- [ ] **Step 1: Strengthen behavior coverage at the required viewport families**

In `tests/e2e/lesson-player.spec.ts`, retain accessible locators and add only missing assertions for HUD visibility, speech/start-action containment, controls containment, no horizontal overflow, and no overlap at:

```ts
{ width: 280, height: 653 }
{ width: 667, height: 280 }
{ width: 1280, height: 800 }
```

The break caught is a control, speech panel, or error banner escaping the viewport after presentation rules move. Do not inspect classes or CSS files.

- [ ] **Step 2: Observe RED with the forbidden static CSS removed**

Keep only `.lesson-character-slot`, the speech-tail polygon selector, and the genuinely combined short-wide placement media override in `src/lesson.css`. Run:

```bash
npx playwright test tests/e2e/lesson-player.spec.ts
```

Expected: at least one new containment/visibility assertion FAILS before equivalent utilities are added.

- [ ] **Step 3: Translate declarations one-for-one into owning components**

Move each deleted declaration to the JSX element it styles using Tailwind utilities and arbitrary media variants where needed, including combined width/height queries such as:

```text
[@media(max-width:48rem)_and_(max-height:30rem)]:...
[@media(max-width:24rem)]:...
```

Keep conditional layout on the component state that already knows whether speech, start action, or errors exist; do not reproduce the stylesheet's `:has()` selectors. Keep shared controls from `src/shared/ui.tsx`. Do not create JS class constants.

- [ ] **Step 4: Verify GREEN across rendered sizes**

Run:

```bash
node --test tests/full-scene-lesson-ui.test.mjs
npx playwright test tests/e2e/lesson-player.spec.ts
npm run test:browser
npm run build
```

Expected: all rendered checks PASS and `src/lesson.css` contains only the three permitted categories.

- [ ] **Step 5: Commit**

```bash
git add src/lesson.css src/lessons/LessonPlayerUi.tsx tests/e2e/lesson-player.spec.ts tests/full-scene-lesson-ui.test.mjs
git commit -m "refactor: colocate lesson presentation"
```

---

### Task 5: Consolidate shared catalogs and remove the fake token clock

**Files:**
- Modify: `lib/lesson-visual-catalog.ts`
- Delete: `worker/lesson-catalog.ts`
- Modify: `worker/lesson-generator.ts`
- Modify: `worker/my-lessons.ts`
- Modify: `worker/livekit-token.ts`
- Modify: `worker/conversations.ts`
- Modify: `tests/lesson-generator.test.mjs`
- Modify: `tests/my-lessons-worker.test.mjs`
- Modify: `tests/conversation-worker.test.mjs`

**Interfaces:**
- Consumes: the existing three visual JSON catalogs and LiveKit SDK token clock.
- Produces: `LESSON_VISUAL_CATALOG` and `LESSON_BACKGROUNDS` from `lib/lesson-visual-catalog.ts`; `createLiveKitToken` no longer accepts `now`.

- [ ] **Step 1: Point tests at the shared catalog contract**

Update the focused lesson generator/worker fixtures to import the shared catalog module and assert a known background id/alt pair is present in generated choices. Remove `now` from the direct token fixture. The breaks caught are a worker-only catalog authority and a misleading caller-controlled JWT clock.

- [ ] **Step 2: Observe RED after removing duplicates**

Delete `worker/lesson-catalog.ts` and remove `now` from `TokenInput`, then run:

```bash
node --test tests/lesson-generator.test.mjs tests/my-lessons-worker.test.mjs tests/conversation-worker.test.mjs
```

Expected: FAIL because worker imports and the token caller/test still reference removed contracts.

- [ ] **Step 3: Export and consume one catalog**

Add this export beside the existing shared visual catalog:

```ts
export const LESSON_BACKGROUNDS = backgrounds.map(({ alt, id }) => ({ alt, id }));
```

Import the two shared exports directly from `../lib/lesson-visual-catalog.ts` in both worker callers. Remove the `now` property passed by `worker/conversations.ts` and test fixtures; retain the repository's real `clock` dependency.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/lesson-generator.test.mjs tests/my-lessons-worker.test.mjs tests/conversation-worker.test.mjs
npm run build
```

Expected: focused suites and build PASS; no import of `worker/lesson-catalog.ts` and no LiveKit token `now` property remain.

- [ ] **Step 5: Commit**

```bash
git add -A lib/lesson-visual-catalog.ts worker/lesson-catalog.ts worker/lesson-generator.ts worker/my-lessons.ts worker/livekit-token.ts worker/conversations.ts tests/lesson-generator.test.mjs tests/my-lessons-worker.test.mjs tests/conversation-worker.test.mjs
git commit -m "refactor: remove duplicate worker contracts"
```

---

### Task 6: Retire the unused conversation-facts model

**Files:**
- Create via Drizzle: `migrations/0016_drop_conversation_fact.sql`
- Modify: `src/db/schema.ts`
- Modify: `worker/conversations.ts`
- Modify: `agent/ingest-client.ts`
- Modify: `tests/conversation-agent.test.mjs`
- Modify: `tests/conversation-worker.test.mjs`
- Modify: `tests/conversation-infrastructure.test.mjs`
- Create via Drizzle: `migrations/meta/0016_snapshot.json`
- Modify via Drizzle: `migrations/meta/_journal.json`

**Interfaces:**
- Consumes: the authenticated deployed `POST /api/conversations/:id/facts` URL and `controllerState` payload.
- Produces: the same URL accepting only `{ controllerState: ConversationControllerState }`; no fact table or fact relations.

- [ ] **Step 1: Write controller-state-only request tests**

Change agent and worker tests to send literal bodies shaped as:

```ts
{ controllerState: { checkpoint: "stored-owner" } }
```

Assert that the authenticated worker stores and returns the controller state. Delete the legacy test whose only contract is rejecting non-empty `candidates`; add a request with an unrelated property and assert normal request-body parsing ignores it rather than reviving structured facts. The break caught is any client or route that still requires `candidates`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/conversation-agent.test.mjs tests/conversation-worker.test.mjs
```

Expected: FAIL because the current worker requires an empty `candidates` array and the client still emits it.

- [ ] **Step 3: Shrink the wire contract and schema**

Remove `candidates` from both agent calls and from worker validation. Remove `conversationFact`, its index declaration, `conversationFactRelations`, and the `facts` side of `conversationSessionRelations` from `src/db/schema.ts`. Keep the endpoint URL and authentication/ownership checks unchanged.

- [ ] **Step 4: Add the forward migration**

After changing `src/db/schema.ts`, run:

```bash
npx drizzle-kit generate --name drop_conversation_fact
```

Inspect the generated `0016_drop_conversation_fact.sql`; its schema operation
must be exactly `DROP TABLE IF EXISTS \`conversation_fact\`;` apart from Drizzle
statement-breakpoint comments. Commit the generated 0016 snapshot and journal
entry. Do not edit earlier SQL or snapshots. Update infrastructure schema
expectations to omit the table and relations.

- [ ] **Step 5: Verify GREEN and migration application**

Run:

```bash
node --test tests/conversation-agent.test.mjs tests/conversation-worker.test.mjs tests/conversation-infrastructure.test.mjs
npx wrangler d1 migrations apply parrot-english --local
npm run build
npm run build:agent
```

Expected: focused tests, both builds, and a fresh local migration application PASS; schema inspection has no `conversation_fact` table.

- [ ] **Step 6: Commit**

```bash
git add migrations/0016_drop_conversation_fact.sql migrations/meta/0016_snapshot.json migrations/meta/_journal.json src/db/schema.ts worker/conversations.ts agent/ingest-client.ts tests/conversation-agent.test.mjs tests/conversation-worker.test.mjs tests/conversation-infrastructure.test.mjs
git commit -m "refactor: retire conversation facts"
```

---

### Task 7: Remove runtime story-authoring metadata

**Files:**
- Modify: `src/stories/story-types.ts`
- Modify: `src/stories/story-script-candidates.ts`
- Modify: `src/stories/long-stories.ts`
- Modify: `src/stories/story-catalog.ts`
- Modify: `tests/story-catalog.test.mjs`
- Modify: `tests/story-media.test.mjs`
- Modify: `docs/design/audio-and-content-pipeline.md`
- Modify: `docs/design/young-learner-storytelling.md`
- Modify: `docs/design/technical-architecture.md`

**Interfaces:**
- Consumes: story id, title, level, cover, pages, completion text, and story-level shelf label/description.
- Produces: runtime `Story` and `StoryLevel` types containing only product-consumed fields; `STORIES`, `resolveStory`, and story media behavior remain stable.

- [ ] **Step 1: Rewrite tests around runtime story behavior**

Delete assertions for prompt experiments, assumed/target vocabulary lists, duration, category, summary, vocabulary profiles, word-count ceilings, and audit helpers. Keep literal assertions for story ids/order, visible titles, levels, page text/join-in/audio ids, artwork URLs, media completeness, and `resolveStory`. Add one assertion that serializing a representative `Story` exposes only:

```text
completionText, cover, id, level, pages, title
```

The break caught is authoring-only metadata remaining in the runtime catalog.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/story-catalog.test.mjs tests/story-media.test.mjs
```

Expected: the runtime-shape assertion FAILS because current stories still expose authoring metadata.

- [ ] **Step 3: Remove authoring-only types, fields, and audit code**

Make `Story` exactly:

```ts
export type Story = {
  completionText: string;
  cover: StoryArtwork;
  id: string;
  level: StoryLevelId;
  pages: readonly StoryPage[];
  title: string;
};
```

Make `StoryLevel` keep only `cefrReference`, `description`, `id`, and `label`. Delete `StoryPromptExperiment`, vocabulary-profile types/constants/functions, `countStoryWords`, `auditStoryVocabulary`, token/lemma sets, and removed object properties from both story data files. Preserve every visible title, page, completion line, artwork prompt/src, audio id, and level.

- [ ] **Step 4: Update authoring documentation to describe checked-in runtime stories**

Remove statements that claim the runtime catalog exposes prompt experiments, known/target word lists, duration, or vocabulary audit helpers. Keep pedagogical guidance as prose and make clear that content review happens before checked-in story data reaches runtime.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/story-catalog.test.mjs tests/story-media.test.mjs tests/story-reader-behavior.test.mjs
npx playwright test tests/e2e/storytelling.spec.ts
npm run build
```

Expected: story unit, browser, and build checks PASS; no removed metadata identifier remains under `src/stories`.

- [ ] **Step 6: Commit**

```bash
git add src/stories tests/story-catalog.test.mjs tests/story-media.test.mjs docs/design/audio-and-content-pipeline.md docs/design/young-learner-storytelling.md docs/design/technical-architecture.md
git commit -m "refactor: trim runtime story metadata"
```

---

### Task 8: Replace the learner browser transaction protocol

**Files:**
- Modify: `src/learner-profile/LearnerProfileGate.tsx`
- Modify: `tests/lifecycle/app-lifecycle.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: relevant learner/profile cases under `tests/e2e/`

**Interfaces:**
- Consumes: worker roster mutation responses, roster GET/reload, session identity, `deletionPending`, `BroadcastChannel`, focus, and visibility events.
- Produces: serialized create/select/delete operations that accept a valid worker roster, reconcile once after an uncertain response, publish one best-effort `"changed"` invalidation, and revalidate on focus/visibility.

- [ ] **Step 1: Replace journal tests with authoritative-roster tests**

Delete lifecycle cases that assert local-storage transaction records, publication acknowledgements, Web Locks, recovery tokens, or orphan cleanup. Add focused cases for these observable contracts:

```text
successful mutation installs the worker roster
invalid or rejected mutation response performs one roster reload
successful reconciliation installs the reloaded roster
failed mutation plus failed reconciliation shows a retryable error
received "changed" broadcast reloads the roster
focus and visible visibilitychange reload the roster
account transition aborts an old mutation and ignores its late result
deletionPending remains unavailable until the worker clears it
```

Use the real gate/lifecycle harness and full worker-shaped roster fixtures. The break caught is reliance on browser-persisted mutation truth instead of the worker roster.

- [ ] **Step 2: Verify RED against the old protocol**

Run the new tests individually with:

```bash
node --test --test-name-pattern="authoritative roster|reconciliation|changed broadcast|focus revalidation|visibility revalidation" tests/lifecycle/app-lifecycle.test.mjs
```

Expected: at least the invalid-response single-reconciliation and best-effort invalidation cases FAIL because the old journal protocol takes different branches and side effects.

- [ ] **Step 3: Delete durable browser mutation machinery**

Remove local-storage mutation/journal keys and parsers, durable recovery tokens, publication acknowledgement/replay, Web Lock helpers, orphan cleanup, and their effects/callbacks. Retain operation serialization, abort controllers/generation fencing, account/session ownership checks, profile-resource teardown, and server `deletionPending` handling.

- [ ] **Step 4: Implement one reconciliation path**

Keep one `reconcileLearnerAfterMutation(signal)` helper. It calls
`loadLearnerProfiles({ signal })` exactly once, validates the roster with the
existing roster validator, and then calls `startActiveLearnerLoad()` when the
roster has an active profile or installs the selection-required state when it
does not. Each mutation accepts a valid response directly; caught network errors
or invalid roster payloads call this helper once. If either the roster request or
the selected-profile reload fails, keep the existing retryable page error. Never
manufacture a roster from optimistic local records.

- [ ] **Step 5: Implement best-effort invalidation and lifecycle revalidation**

Open one account-scoped `BroadcastChannel`, post the literal `"changed"` only after confirmed mutation/reconciliation, and make peers reload on that message. Close it during account transition/unmount. Add focus and `visibilitychange` listeners; reload only when the document becomes visible. If `BroadcastChannel` construction is unsupported or throws, continue without persistence or fallback storage.

- [ ] **Step 6: Verify focused GREEN and mutation safety**

Run:

```bash
node --test tests/lifecycle/app-lifecycle.test.mjs tests/learner-profile-ui.test.mjs
npm run build
```

Expected: lifecycle and rendered profile tests PASS; searches for the deleted journal/recovery/lock symbols return no browser mutation protocol.

- [ ] **Step 7: Verify responsive profile behavior**

Run:

```bash
npm run test:browser
```

Expected: responsive headers/profile flows PASS at existing narrow, short, scrolled, and desktop viewports.

- [ ] **Step 8: Commit**

```bash
git add src/learner-profile/LearnerProfileGate.tsx tests/lifecycle/app-lifecycle.test.mjs tests/learner-profile-ui.test.mjs tests/e2e
git commit -m "refactor: trust authoritative learner rosters"
```

---

### Task 9: Remove source-structure tests and verify the integrated cleanup

**Files:**
- Delete or reduce to genuine executable contracts: `tests/architecture-cleanup.test.mjs`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/learner-profile-ui.test.mjs`
- Modify: `tests/version-badge.test.mjs`
- Modify: `tests/build-info-wiring.test.mjs`
- Modify any existing rendered or exported-unit test that receives a displaced behavioral assertion.

**Interfaces:**
- Consumes: exported route decisions, rendered React output, build-info functions, browser navigation, and deployment/runtime behavior.
- Produces: tests that fail only for product, security, accessibility, migration, or operational regressions—not harmless code movement.

- [ ] **Step 1: Classify every source-text assertion in the five named files**

For each assertion, name the production break it catches. Apply this exact rule:

```text
filename/import/private identifier/source text only -> delete
observable exported behavior already covered -> delete duplicate
observable behavior not covered -> move to an exported-unit, rendered, or Playwright assertion
security/deployment config side effect -> execute or parse the artifact and assert its effect
```

Do not add negative source searches that pin removed symbols.

- [ ] **Step 2: Demonstrate RED for each displaced behavioral contract**

For each retained contract moved to a real test, temporarily mutate its fixture/input to the wrong route, label, build value, or state transition and run its exact Node test file. Expected: FAIL for the named user-visible or operational reason. Restore the fixture before implementation edits.

- [ ] **Step 3: Delete change detectors and retain the smallest behavior suite**

Remove route-source regexes, private cleanup-callback regexes, module inventory assertions, filename assertions, and exact import/identifier matches. Keep or add only real renders, exported decisions, parsed configuration effects, and browser flows. If `tests/architecture-cleanup.test.mjs` has no executable contract after classification, delete it.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/app-shell-ui.test.mjs tests/learner-profile-ui.test.mjs tests/version-badge.test.mjs tests/build-info-wiring.test.mjs tests/conversation-infrastructure.test.mjs
```

Expected: PASS with no test reading application source merely to match an implementation token.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
npm run lint
npm run build
npm run build:agent
npm test
npm run test:browser
git diff --check
```

Expected: every command exits 0 with no new warnings; all required browser viewport and lesson-player checks pass.

- [ ] **Step 6: Commit**

```bash
git add -A tests
git commit -m "test: prefer behavior over source structure"
```
