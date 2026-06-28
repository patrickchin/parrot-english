# AI Lesson Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the current hardcoded lesson flow to the AI lesson director interface while keeping a deterministic fallback and preserving existing assets, speech evaluation, and child-facing UX.

**Architecture:** The director packet engine becomes the primary orchestration path after the mock, Worker, and TTS plans are complete. The existing `LESSON_STEPS` flow remains available behind a fallback flag until browser tests and manual QA prove the packet flow. Old deterministic modules are removed only after their responsibilities are replaced and tests cover the new contracts.

**Tech Stack:** React 19, Vite 8, Cloudflare Worker, local lesson JSON, director packet modules, existing tests, optional Maestro browser tests.

---

## Architecture Decisions

- Do not delete deterministic modules at the start of migration.
- Use feature flags to compare deterministic and director flows.
- Keep current assets in `public/assets/*`.
- Keep the speech evaluator unchanged.
- Keep static audio manifest until director segment playback covers all user-facing audio.
- Update docs and tests in the same migration commits.

## File Structure

- Modify `src/App.tsx`: make director packet flow default after verification.
- Modify `lib/lesson-data.js`: either wrap old data as compatibility export or mark it legacy.
- Modify `lib/lesson-state.js`, `lib/lesson-audio.js`, `lib/lesson-scene.js`: remove only after no imports remain.
- Modify tests that assert old deterministic phases.
- Modify `docs/design/technical-architecture.md`.
- Modify `docs/design/product-experience.md`.
- Modify `docs/design/audio-and-content-pipeline.md`.
- Modify `docs/design/codex-session-decision-log.md`.

## Task 1: Import Audit

**Files:**
- No new files.

- [ ] **Step 1: List deterministic module imports**

Run:

```bash
rg -n "lesson-data|lesson-state|lesson-audio|lesson-scene|LESSON_STEPS|LessonPhase" src lib tests worker docs
```

Expected: output shows all places still tied to deterministic lesson modules.

- [ ] **Step 2: Record migration target modules**

Run:

```bash
rg -n "ai-lesson-data|director-packet|mock-lesson-director|lesson-director" src lib tests worker docs
```

Expected: output shows director packet modules from previous plans.

- [ ] **Step 3: Do not commit**

This task is read-only. Do not commit after this task.

## Task 2: Make Director Flow Default

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/director-packet-ui.test.mjs`

- [ ] **Step 1: Write failing default-flow test**

Add to `tests/director-packet-ui.test.mjs`:

```js
it("uses director packet flow by default with a legacy fallback flag", () => {
  assert.match(appSource, /VITE_PARROT_LEGACY_FLOW/);
  assert.doesNotMatch(appSource, /VITE_PARROT_DIRECTOR_FLOW === "1"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs
```

Expected: FAIL because director flow is still opt-in.

- [ ] **Step 3: Flip the feature flag**

Modify `src/App.tsx`:

```tsx
const USE_LEGACY_LESSON_FLOW =
  import.meta.env.VITE_PARROT_LEGACY_FLOW === "1";
```

Change `LessonPlayer`:

```tsx
export function LessonPlayer() {
  if (!USE_LEGACY_LESSON_FLOW) return <DirectorLessonPlayer />;

  // existing deterministic component body remains available as legacy fallback
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx tests/director-packet-ui.test.mjs
git commit -m "Make director packet flow the default"
```

## Task 3: Update Product And Architecture Docs

**Files:**
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/audio-and-content-pipeline.md`
- Modify: `docs/design/codex-session-decision-log.md`

- [ ] **Step 1: Update technical architecture**

In `docs/design/technical-architecture.md`, replace the deterministic state-machine summary with:

```markdown
## AI Lesson Director Flow

The primary lesson flow is packet-driven. The frontend sends structured lesson
JSON and compact runtime state to the Worker-backed lesson director. The
director returns a validated packet containing scene, poses, turn order,
visible bubble text, segmented speech, and the next child prompt.

The frontend executes packet turns in order. Recording starts only when
`childPrompt.shouldListen` is true. Speech evaluation remains a separate
Worker route and returns transcript, similarity, pass/fail, and retry metadata
for the next director request.
```

- [ ] **Step 2: Update product experience**

In `docs/design/product-experience.md`, add:

```markdown
## Adaptive Lesson Direction

The lesson is now directed by validated packets. Peppa still creates short
English scene moments, and Polly still acts as the Mandarin tutor, but Polly's
feedback and retry prompts can adapt to the child's latest evaluated attempt.
The AI director is bounded by the supplied lesson JSON, world rules, character
personas, available poses, and current target phrase.
```

- [ ] **Step 3: Update audio pipeline**

In `docs/design/audio-and-content-pipeline.md`, add:

```markdown
## Director Speech Segments

Director packets use `visibleText` for bubbles and segmented `speech[]` for
audio. Static audio is used first when a segment exactly matches a saved line.
Dynamic generated audio is cached by segment key. Chinese and English segments
remain separate so Mandarin coaching and English targets can use suitable
voices.
```

- [ ] **Step 4: Update decision log**

Append a row to `docs/design/codex-session-decision-log.md`:

```markdown
| Move toward adaptive AI-directed lessons. | Keep the existing app shell and migrate orchestration to a single validated lesson director packet interface, with deterministic fallback and segmented speech for TTS. | `docs/superpowers/specs/2026-06-27-ai-lesson-director-interface-design.md`, `lib/ai-lesson-data.js`, `lib/director-*`, `worker/lesson-director.ts` |
```

- [ ] **Step 5: Commit docs**

```bash
git add docs/design/technical-architecture.md docs/design/product-experience.md docs/design/audio-and-content-pipeline.md docs/design/codex-session-decision-log.md
git commit -m "Document director packet lesson architecture"
```

## Task 4: Remove Legacy Flow After Verification

**Files:**
- Modify: `src/App.tsx`
- Delete only if no imports remain: `lib/lesson-state.js`
- Delete only if no imports remain: `lib/lesson-audio.js`
- Keep or adapt: `lib/lesson-scene.js` because it contains the asset registry used by `director-packet-scene.js`
- Keep or adapt: `lib/lesson-data.js` if external tests or docs still reference `LESSON_STEPS`
- Modify tests that import old deterministic modules.

- [ ] **Step 1: Verify no old flow imports remain outside tests**

Run:

```bash
rg -n "LessonPhase|reduceLessonState|getLessonAudioSequence|getLessonAudioCompletionEvent|LESSON_STEPS" src worker lib
```

Expected: only legacy modules themselves are listed. If `src/App.tsx` still imports old flow modules, keep this task blocked and do not delete old modules.

- [ ] **Step 2: Remove old imports from `src/App.tsx`**

Delete imports that are no longer used:

```tsx
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio";
import { LESSON_STEPS } from "../lib/lesson-data";
import { getLessonProgressLabel } from "../lib/lesson-progress";
import { getLessonScenePresentation } from "../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state";
```

Keep `LESSON_SCENE_ASSETS` available through `lib/lesson-scene.js` until an asset-only module replaces it.

- [ ] **Step 3: Delete old tests after replacement coverage exists**

Delete tests only after equivalent director tests exist and pass:

```bash
rm tests/lesson-state.test.mjs
rm tests/lesson-audio.test.mjs
```

Keep `tests/lesson-scene.test.mjs` if `LESSON_SCENE_ASSETS` remains in `lesson-scene.js`.

- [ ] **Step 4: Run full checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit legacy removal**

```bash
git add src/App.tsx tests
git add -u lib
git commit -m "Remove legacy deterministic lesson flow"
```

## Task 5: Rollout And Recovery

**Files:**
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Modify: `README.md`

- [ ] **Step 1: Add environment documentation**

Update `.env.example`:

```bash
VITE_PARROT_LEGACY_FLOW=0
VITE_PARROT_DIRECTOR_API=1
```

Update `.dev.vars.example`:

```bash
LESSON_DIRECTOR_API_KEY=
LESSON_DIRECTOR_BASE_URL=
LESSON_DIRECTOR_MODEL=
LESSON_DIRECTOR_TIMEOUT_MS=15000
```

- [ ] **Step 2: Update README commands**

Add:

````markdown
## AI Director Flow

Run the director packet flow with local mock packets:

```bash
VITE_PARROT_LEGACY_FLOW=0 VITE_PARROT_DIRECTOR_API=0 npm run dev:vite
```

Run the Worker-backed director flow:

```bash
VITE_PARROT_LEGACY_FLOW=0 VITE_PARROT_DIRECTOR_API=1 npm run dev
```
````

- [ ] **Step 3: Run docs and build checks**

Run:

```bash
npm run build
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit rollout docs**

```bash
git add .env.example .dev.vars.example README.md
git commit -m "Document AI director rollout flags"
```

## Task 6: Plan 4 Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Manual regression check**

Run:

```bash
npm run dev
```

Expected:

- Director packet flow starts by default.
- The first child target is `Hello, Peppa!`.
- Peppa and Polly use available poses.
- Audio and UI do not overlap during recording.
- Invalid AI output falls back to deterministic packet behavior.
