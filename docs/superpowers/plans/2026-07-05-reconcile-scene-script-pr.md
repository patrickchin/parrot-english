# Scene-Script PR Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild PR #7 on current `origin/main`, retain independent main features, remove superseded lesson implementations, and leave the PR conflict-free without rewriting `main`.

**Architecture:** Preserve the existing PR head on a local backup branch, recreate `codex/scene-script-lessons` from current `origin/main`, and replay the seven scene-script commits. Resolve the implementation commit in favor of the scene/step architecture, then explicitly restore the version badge and platform/E2E infrastructure while removing the obsolete flat catalog, manual lesson controls, and separate lesson-list UI. Keep main's legacy-asset cleanup by replacing every scene-script reference to deleted PNG/WAV files with current or newly generated assets.

**Tech Stack:** Git, React 19, TypeScript, Vite, Node test runner, JSON lesson content, ElevenLabs `eleven_v3`

---

### Task 1: Preserve the Existing PR and Rebase Its History

**Files:**
- Preserve all files at commit: `550a21b`
- Rebase branch: `codex/scene-script-lessons`

- [ ] **Step 1: Confirm the current PR head and working tree scope**

Run:

```bash
git status -sb
git rev-parse HEAD
git rev-parse origin/codex/scene-script-lessons
git rev-parse origin/main
```

Expected: both feature refs resolve to `550a21b`; only unrelated `.superpowers/` and this plan may be untracked.

- [ ] **Step 2: Preserve the old branch tip**

Run:

```bash
git branch -m codex/scene-script-lessons-pre-main-sync
git switch -c codex/scene-script-lessons origin/main
```

Expected: the backup branch points to `550a21b` and the active branch starts at current `origin/main`.

- [ ] **Step 3: Replay the six prompt/spec commits**

Run:

```bash
git cherry-pick 44f11cc 23628d5 1e8f1b8 6e1faed a73d75b 661a4ed
```

Expected: all six commits apply without conflicts because they add the scene-script prompt, backup, spec, and original implementation plan.

### Task 2: Replay the Implementation with an Explicit Conflict Policy

**Files:**
- Modify: `README.md`
- Modify: `docs/design/audio-and-content-pipeline.md`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `lib/lesson-audio.js`
- Modify: `lib/lesson-data.js`
- Modify: `lib/lesson-progress.js`
- Modify: `lib/lesson-scene.js`
- Modify: `lib/lesson-state.js`
- Modify: `lib/static-audio.js`
- Modify: `scripts/generate-static-audio.mjs`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: scene-script tests under `tests/`

- [ ] **Step 1: Start the implementation cherry-pick and record the conflict set**

Run:

```bash
git cherry-pick 550a21b
git status --short
```

Expected: conflicts in the 22 files already identified by `git merge-tree`; new JSON, generated assets, and non-overlapping files stage automatically.

- [ ] **Step 2: Select the scene-script side for superseded product surfaces**

For the conflicted current-design docs, lesson runtime modules, `src/App.tsx`, `src/styles.css`, and their scene-script tests, select commit `550a21b` as the starting point:

```bash
git checkout --theirs README.md docs/design/audio-and-content-pipeline.md docs/design/product-experience.md docs/design/technical-architecture.md lib/lesson-audio.js lib/lesson-data.js lib/lesson-progress.js lib/lesson-scene.js lib/lesson-state.js lib/static-audio.js scripts/generate-static-audio.mjs src/App.tsx src/styles.css tests/architecture-cleanup.test.mjs tests/lesson-audio.test.mjs tests/lesson-data.test.mjs tests/lesson-scene.test.mjs tests/lesson-state.test.mjs tests/microphone-prompt-ui.test.mjs tests/speech-recorder.test.mjs tests/stage-layout.test.mjs tests/static-audio.test.mjs
```

Expected: the selected files contain the scene/step runner, English narrator, generic characters, embedded picker, and session-based hold-to-talk implementation.

- [ ] **Step 3: Keep the automatically merged recorder implementation**

Inspect `src/speech-recorder.ts` and keep `startSpeechRecording()` plus the backward-compatible old exports. Stage every resolved file, but do not continue the cherry-pick yet.

### Task 3: Prove the Main-Feature Regressions Before Fixing Them

**Files:**
- Test: `tests/version-badge.test.mjs`
- Test: `tests/lesson-data.test.mjs`
- Test: `tests/static-audio.test.mjs`
- Test: obsolete main-only lesson tests

- [ ] **Step 1: Run the focused integration tests in the unresolved working tree**

Run:

```bash
node --test tests/version-badge.test.mjs tests/lesson-data.test.mjs tests/static-audio.test.mjs
```

Expected: RED because the scene-script `App.tsx` lacks the main version badge and the catalog/cache still reference assets deleted by `48763b3`.

- [ ] **Step 2: Run obsolete tests to confirm they encode superseded behavior**

Run:

```bash
node --test tests/lesson-controls.test.mjs tests/lesson-list-ui.test.mjs tests/lesson-list-scroll-color.test.mjs tests/lesson-script.test.mjs tests/speaking-flow.test.mjs
```

Expected: RED because these tests require the flat `lib/lessons.json`, manual controls, separate lesson-list page, or old phrase phases.

### Task 4: Preserve the Version Badge and Remove Superseded Main Code

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Preserve: `src/vite-env.d.ts`
- Preserve: `vite.config.ts`
- Preserve: `.github/workflows/deploy-cloudflare.yml`
- Preserve: `tests/version-badge.test.mjs`
- Delete: `lib/lesson-controls.js`
- Delete: `lib/lessons.json`
- Delete: `tests/lesson-controls.test.mjs`
- Delete: `tests/lesson-list-ui.test.mjs`
- Delete: `tests/lesson-list-scroll-color.test.mjs`
- Delete: `tests/lesson-script.test.mjs`
- Delete: `tests/speaking-flow.test.mjs`

- [ ] **Step 1: Restore the independent version badge contract**

Add the main badge label and markup to the scene-script stage:

```tsx
const versionLabel = `v${import.meta.env.VITE_PARROT_APP_VERSION} @ ${import.meta.env.VITE_PARROT_COMMIT_SHA}`;

<span
  aria-label={`Build version ${versionLabel}`}
  className="build-version-badge"
>
  {versionLabel}
</span>
```

Restore the `.build-version-badge` styling from `origin/main:src/styles.css` without restoring the separate lesson-list layout.

- [ ] **Step 2: Remove the superseded flat-catalog and manual-control files**

Delete the seven obsolete code/test files listed above. Do not remove `src/audio-playback.ts`, `src/e2e-browser-mocks.ts`, `src/main.tsx`, `vite.config.ts`, `tests/audio-playback.test.mjs`, `tests/groq.test.mjs`, `tests/version-badge.test.mjs`, or `tests/web-assets.test.mjs`.

- [ ] **Step 3: Verify the independent badge is green**

Run:

```bash
node --test tests/version-badge.test.mjs tests/microphone-prompt-ui.test.mjs
```

Expected: PASS with both the badge and scene-script hold-to-talk UI present.

### Task 5: Reconcile Asset Cleanup with the Scene-Script Catalog

**Files:**
- Modify: `content/catalogs/backgrounds.json`
- Modify: `lib/static-audio.js`
- Create: six speaker-specific WAV files under `public/assets/audio`
- Modify: `tests/static-audio.test.mjs`

- [ ] **Step 1: Make focused asset coverage fail for normalized cache names**

Update `tests/static-audio.test.mjs` to require these cache paths:

```js
const expectedSources = {
  "peppa-cant-reach": "/assets/audio/peppa-cant-reach.wav",
  "peppa-can-help": "/assets/audio/peppa-can-help.wav",
  "dolly-can-help": "/assets/audio/dolly-can-help.wav",
  "dolly-here-you-are": "/assets/audio/dolly-here-you-are.wav",
  "peppa-thank-you": "/assets/audio/peppa-thank-you.wav",
  "dolly-thank-you": "/assets/audio/dolly-thank-you.wav",
};
```

Run `node --test tests/static-audio.test.mjs` and expect failure because those six files are not generated yet.

- [ ] **Step 2: Stop referencing files removed from main**

Change the `episode-garden` catalog source to `/assets/backgrounds/episode-garden.webp`. Change the six manifest entries to the normalized WAV paths above. Do not restore `episode-garden.png` or legacy `pig-*`, `parrot-*`, and `turn-*` WAV files deleted by `48763b3`.

- [ ] **Step 3: Generate exactly the six missing ElevenLabs cache entries**

Using the existing ignored `.dev.vars` from the main workspace and Node's system CA store, run:

```bash
NODE_OPTIONS=--use-system-ca npm run generate:audio:elevenlabs -- \
  --only=peppa-cant-reach \
  --only=peppa-can-help \
  --only=dolly-can-help \
  --only=dolly-here-you-are \
  --only=peppa-thank-you \
  --only=dolly-thank-you
```

Expected: six ElevenLabs-generated PCM WAV files; no local or macOS speech.

- [ ] **Step 4: Verify visual and audio coverage**

Run:

```bash
node --test tests/lesson-data.test.mjs tests/static-audio.test.mjs tests/lesson-audio.test.mjs
```

Expected: PASS with the WebP background and every speaker/text cache path present.

### Task 6: Finish the Cherry-Pick and Verify the Reconciled Tree

**Files:**
- Stage every planned file except `.superpowers/`
- Add this plan file

- [ ] **Step 1: Complete the implementation commit**

Run:

```bash
git add README.md content docs lib public scripts src tests
git cherry-pick --continue
git add docs/superpowers/plans/2026-07-05-reconcile-scene-script-pr.md
git commit -m "docs: plan scene-script PR reconciliation"
```

Expected: no unresolved entries and `.superpowers/` remains untracked.

- [ ] **Step 2: Run complete verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Expected: all tests, lint, build, and whitespace checks pass.

- [ ] **Step 3: Confirm the resulting PR scope**

Run:

```bash
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
git status -sb
```

Expected: seven replayed scene-script commits plus the reconciliation plan commit, with no unrelated files staged or modified.

### Task 7: Update PR #7 Without Rewriting Main

**Files:**
- Update remote branch: `origin/codex/scene-script-lessons`

- [ ] **Step 1: Force-push only the feature branch with lease protection**

Run:

```bash
git push --force-with-lease origin codex/scene-script-lessons
```

Expected: PR #7 updates; `origin/main` remains unchanged.

- [ ] **Step 2: Verify GitHub merge state**

Run:

```bash
gh pr view 7 --repo patrickchin/parrot-english --json mergeable,mergeStateStatus,headRefOid,baseRefOid,url
```

Expected: the PR is no longer `CONFLICTING`/`DIRTY` and points to the rebuilt feature head.
