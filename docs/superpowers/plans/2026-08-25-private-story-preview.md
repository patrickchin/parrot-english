# Private Story Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, merge, and deploy an Access-protected Cloudflare version preview containing two ignored long-story drafts and their ignored ElevenLabs narration without exposing that private content in Git or production.

**Architecture:** A Node-only loader validates an ignored manifest, paginates source text without changing its words or punctuation, and produces injected `Story` data plus an allowlisted set of narration assets. An explicit build flag selects a read-only story route shell and makes Vite emit those assets; normal builds inject nothing and retain all existing auth/profile behavior. Cloudflare Access protects preview hostnames, and `wrangler versions upload` publishes the private bundle without shifting production traffic.

**Tech Stack:** Node.js 22.13+, TypeScript 5.9, React 19, React Router 7, Vite 8, Node test runner, Playwright, ElevenLabs `eleven_v3`, Cloudflare Workers/Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-08-25-private-story-preview-design.md`

## Global Constraints

- Never add the current draft titles, prose, content-derived names, manifest, or generated MP3s to Git.
- Store every private input under ignored `content/private-story-preview/`; never store private audio under `public/`.
- Enable private content only when `PARROT_PRIVATE_STORY_PREVIEW=1`; `npm run build` must remain clean and production-safe.
- Paginate at paragraph/full-line boundaries with a 70-word target and reject a source unit over 90 words; prove normalized content fidelity.
- Use the existing ElevenLabs narrator voice and `eleven_v3`; never use local/macOS text-to-speech.
- The private build exposes only story shelf/page routes and performs no app-auth, learner-profile, personalized-art, D1, or R2 flow.
- Upload with `wrangler versions upload`; never use `wrangler deploy`, `npm run deploy:worker`, or `workflow_dispatch` for the preview.
- Apply Cloudflare Access to **Previews only** with the **Cloudflare account members** policy before uploading the private version.
- Ask for action-time confirmation immediately before applying the Cloudflare Access permission.
- The PR contains generic support only and merges only after full verification and independent review.

## Execution Preflight

- [ ] Record checksums for the two ignored source files and confirm exactly two inputs exist.

```bash
rg --files content/local-stories -g '*.txt'
shasum -a 256 content/local-stories/*.txt
```

- [ ] Preserve the stale experimental work in a named stash, keeping ignored source files in place.

```bash
git stash push -u -m "private-story-preview-pre-rework"
git status --short
```

- [ ] Create `codex/private-story-preview` from current `origin/main`, then cherry-pick the committed spec and plan.

```bash
private_story_plan_tip=$(git rev-parse HEAD)
git fetch origin
git switch -c codex/private-story-preview origin/main
git cherry-pick "5bc0d96^..${private_story_plan_tip}"
```

- [ ] Recompute both checksums and stop if either differs from preflight.

```bash
shasum -a 256 content/local-stories/*.txt
git status --short --branch
```

---

### Task 1: Validate and paginate ignored private stories

**Files:**
- Create: `lib/private-story-preview.js`
- Create: `scripts/prepare-private-story-preview.mjs`
- Create: `tests/private-story-preview.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `loadPrivateStoryPreview({ projectRoot, previewDirectory?, requireAudio? })`
- Produces: `paginatePrivateStoryText(rawText)`
- Produces: `normalizeStoryBody(text)` for the exact normalized-fidelity assertion.
- Produces: `preparePrivateStoryPreview({ previewDirectory, sourceFiles })`, which byte-copies sources to generic ignored filenames and writes the version-1 manifest.
- Returns: `{ assets, audioLines, markers, stories }`, where assets are allowlisted source/output paths and stories are JSON-compatible catalog entries.

- [ ] **Step 1: Write failing parser and loader tests**

Cover heading removal, paragraph packing, line packing when no blank lines exist, 70-word greedy boundaries, rejection of a unit over 90 words, exact normalized fidelity, duplicate/unsafe IDs, traversal and absolute paths, missing text/audio, and an ignored-directory happy path. Use synthetic names and prose only.

```js
const paginated = paginatePrivateStoryText([
  "# Fixture Story",
  "",
  "First complete paragraph.",
  "",
  "Second complete paragraph!",
].join("\n"));
assert.deepEqual(paginated.pages, [
  "First complete paragraph.\n\nSecond complete paragraph!",
]);
assert.equal(
  normalizeStoryBody(paginated.pages.join("\n\n")),
  normalizeStoryBody(paginated.body),
);
```

```js
await assert.rejects(
  () => loadPrivateStoryPreview({ projectRoot: fixtureRoot }),
  /must stay inside the private preview directory/,
);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/private-story-preview.test.mjs`

Expected: FAIL because `lib/private-story-preview.js` does not exist.

- [ ] **Step 3: Implement the pure pagination and manifest boundary**

Use manifest version 1 and entries shaped exactly as follows:

```js
{
  version: 1,
  stories: [{ id: "private-story-fixture", title: "Fixture Story", textFile: "story-1.txt" }],
}
```

Validate IDs with `/^private-[a-z0-9]+(?:-[a-z0-9]+)*$/`, require basename-only `.txt` filenames, require the leading Markdown H1 to equal the manifest title, normalize only CRLF/trailing whitespace, and pack source units greedily up to 70 words. Derive:

```js
const pageId = `page-${String(pageIndex + 1).padStart(3, "0")}`;
const audioId = `${story.id}-${pageId}-narration`;
const publicAudioPath = `/assets/private-story-preview/${story.id}/${pageId}.mp3`;
const outputFile = `assets/private-story-preview/${story.id}/${pageId}.mp3`;
```

Return each page with `joinIn: "Turn the page!"`, both existing static audio IDs set to `null`, and `narrationAudioSrc` set to `publicAudioPath`. Return an `audioLines[audioId]` entry with `speaker: "narrator"`, `lang: "en-GB"`, exact page `text`, and an absolute ignored `outputFilePath`.

Implement the preparation CLI with repeatable `--source=/absolute/or/project/path.txt` arguments. Require exactly two readable files, preserve their bytes with `copyFile`, name the copies `story-1.txt` and `story-2.txt`, derive each title only from its leading H1, and assign each entry an opaque ID shaped as `private-story-${randomUUID().replaceAll("-", "").slice(0, 12)}`. Write `manifest.json` with `JSON.stringify(manifest, null, 2) + "\n"`. Refuse to overwrite an existing private manifest unless `--force` is present. The random IDs exist only in the ignored manifest, so the isolation verifier can detect any accidental ID/path leak without matching tracked examples.

- [ ] **Step 4: Ignore the complete private directory**

Add exactly this root rule while temporarily retaining the legacy ignored text rule until migration completes:

```gitignore
/content/private-story-preview/
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/private-story-preview.test.mjs`

Expected: all private loader tests pass.

- [ ] **Step 6: Commit**

```bash
git add .gitignore lib/private-story-preview.js scripts/prepare-private-story-preview.mjs tests/private-story-preview.test.mjs
git commit -m "feat: validate private story previews"
```

---

### Task 2: Inject a dynamic Long stories catalog level

**Files:**
- Create: `src/stories/private-story-preview.ts`
- Create: `tests/private-story-catalog.test.mjs`
- Modify: `src/stories/story-types.ts`
- Modify: `src/stories/story-catalog.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: JSON-compatible `stories` returned by `loadPrivateStoryPreview`.
- Produces: `PRIVATE_STORY_PREVIEW_STORIES: readonly Story[]`
- Produces: `IS_PRIVATE_STORY_PREVIEW: boolean`
- Extends: `StoryLevelId` with `"long-stories"` and `StoryPage` with optional `narrationAudioSrc`.

- [ ] **Step 1: Write the failing injected-catalog test**

Load `story-catalog.ts` through a Vite SSR server whose `define` supplies two synthetic private stories and the boolean preview flag. Assert that default loading remains 20 stories/four levels, while injected loading adds one final `Long stories` level, two routable stories, and stable order.

```js
assert.deepEqual(
  injectedCatalog.STORY_LEVELS.map(({ id }) => id).at(-1),
  "long-stories",
);
assert.deepEqual(
  injectedCatalog.STORIES.filter(({ level }) => level === "long-stories")
    .map(({ id }) => id),
  ["private-story-fixture-one", "private-story-fixture-two"],
);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/private-story-catalog.test.mjs tests/story-catalog.test.mjs`

Expected: the new test fails because the preview module/types do not exist; existing catalog tests remain green.

- [ ] **Step 3: Add typed injected constants and dynamic catalog composition**

```ts
export const IS_PRIVATE_STORY_PREVIEW =
  import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW === true;

export const PRIVATE_STORY_PREVIEW_STORIES: readonly Story[] =
  import.meta.env.VITE_PARROT_PRIVATE_STORIES ?? [];
```

Add `LONG_STORY_LEVEL` only when the injected array is non-empty. Use limits `maxNarrativeWordsPerPage: 90`, `maxNarrativeWordsTotal: 2_000`, and `targetWordRange: [0, 0]`; reuse `early-a1-v1` only as the required catalog metadata reference. Keep all default exports and audits unchanged when the injected array is empty.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/private-story-catalog.test.mjs tests/story-catalog.test.mjs`

Expected: both suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/stories/private-story-preview.ts src/stories/story-types.ts src/stories/story-catalog.ts src/vite-env.d.ts tests/private-story-catalog.test.mjs
git commit -m "feat: add private long story catalog"
```

---

### Task 3: Play direct private narration without changing built-in audio

**Files:**
- Modify: `src/stories/StoryReader.tsx`
- Modify: `tests/story-reader-behavior.test.mjs`

**Interfaces:**
- Consumes: optional `page.narrationAudioSrc` from Task 2.
- Preserves: existing paired `narrationAudioId`/`joinInAudioId` playback and device-speech fallback.

- [ ] **Step 1: Write the failing direct-source playback test**

Create a one-page synthetic story whose static IDs are `null` and whose `narrationAudioSrc` is `/assets/private-story-preview/private-fixture/page-001.mp3`. Assert one `Audio` playback, no `speechSynthesis` call, exact page text as playback metadata, no saved join-in playback, and transition to `Listen again` when the clip ends.

```js
assert.deepEqual(playedUrls, [
  "/assets/private-story-preview/private-fixture/page-001.mp3",
]);
assert.deepEqual(spoken, []);
assert.ok(container.querySelector('[aria-label="Listen again"]'));
```

Add a second assertion that whole-story mode advances to the next direct-source page.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/story-reader-behavior.test.mjs`

Expected: FAIL because direct narration currently falls into device speech/incomplete metadata handling.

- [ ] **Step 3: Implement the mutually exclusive direct-source branch**

Before the existing static-ID branch, accept direct playback only when both static IDs are null:

```ts
if (page.narrationAudioSrc && !narrationAudioId && !joinInAudioId) {
  narrationPromise = playAudioLine({
    audioId: `${story.id}-${page.id}-private-narration`,
    audioSrc: page.narrationAudioSrc,
    env: audioEnvironmentRef.current ?? undefined,
    lang: "en-GB",
    onPlaybackControl,
    signal: controller.signal,
    text: page.text,
  });
} else if (!page.narrationAudioSrc && narrationAudioId && joinInAudioId) {
  // Preserve the existing paired saved-audio path verbatim.
}
```

Treat any other combination as incomplete metadata. Reuse the existing promise completion logic so pause/resume, whole-story advancement, error handling, and cleanup do not fork.

- [ ] **Step 4: Run behavior tests and verify GREEN**

Run: `node --test tests/story-reader-behavior.test.mjs tests/static-audio.test.mjs`

Expected: direct and built-in playback tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stories/StoryReader.tsx tests/story-reader-behavior.test.mjs
git commit -m "feat: play private story narration"
```

---

### Task 4: Add the read-only private preview route shell

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/stories/StoryList.tsx`
- Create: `tests/private-story-route-shell.test.mjs`

**Interfaces:**
- Consumes: `IS_PRIVATE_STORY_PREVIEW` from Task 2.
- Produces: exported `PrivateStoryPreviewRoutes` with only `/stories`, `/stories/:storyId`, and `/stories/:storyId/pages/:pageNumber` functionality.
- Preserves: normal `AuthGate` → `LearnerProfileGate` → `ApplicationRoutes` composition.

- [ ] **Step 1: Write the failing route-isolation test**

Load `App.tsx` with the preview flag true and synthetic injected stories. Mount `PrivateStoryPreviewRoutes` in `MemoryRouter` first at `/lessons`, then at a private story page. Assert `/lessons` redirects to `/stories?level=long-stories`, the shelf renders the synthetic story, the page route renders the reader, and neither auth nor learner-profile session clients are invoked.

```js
assert.match(container.textContent, /Pick a story/);
assert.match(container.textContent, /Fixture Long Story/);
assert.equal(fetchCalls.length, 0);
```

- [ ] **Step 2: Run the route test and verify RED**

Run: `node --test tests/private-story-route-shell.test.mjs tests/auth-ui.test.mjs`

Expected: FAIL because `PrivateStoryPreviewRoutes` does not exist.

- [ ] **Step 3: Implement the explicit allowlist**

Render `PrivateStoryPreviewRoutes` from `RoutedApplication` when the compile-time flag is true. Include `RouteFocusManager`, the existing story shelf/redirect/page components, and a wildcard redirect to `getStoryShelfPath("long-stories")`. Do not include home, lesson, profile, login, account, or personalized-art routes.

In `StoryList` and story route rendering, call:

```ts
usePersonalizedStoryArt({ enabled: !IS_PRIVATE_STORY_PREVIEW });
```

Hide the grown-up personalized-art panel in private mode while keeping level controls and story navigation.

- [ ] **Step 4: Run route/auth tests and verify GREEN**

Run: `node --test tests/private-story-route-shell.test.mjs tests/auth-ui.test.mjs tests/product-streamline.test.mjs`

Expected: private routes are isolated and normal auth/source contracts still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/stories/StoryList.tsx tests/private-story-route-shell.test.mjs
git commit -m "feat: isolate private story preview routes"
```

---

### Task 5: Build private assets only under an explicit Vite flag

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `tests/private-story-build.test.mjs`

**Interfaces:**
- Consumes: `loadPrivateStoryPreview` from Task 1.
- Produces: `getPrivateStoryPreviewBuildData({ command, enabled, projectRoot, previewDirectory? })`.
- Produces: Vite plugin `privateStoryPreviewAssets(assets)` that emits only loader-allowlisted MP3s.

- [ ] **Step 1: Write failing build-boundary tests**

Assert all of the following with a temporary synthetic manifest and non-empty fake MP3 files:

```js
assert.deepEqual(getPrivateStoryPreviewBuildData({ command: "build", enabled: false }).stories, []);
assert.throws(
  () => getPrivateStoryPreviewBuildData({ command: "build", enabled: true, previewDirectory: missingAudioRoot }),
  /Missing narration audio/,
);
assert.deepEqual(
  enabledData.assets.map(({ fileName }) => fileName),
  ["assets/private-story-preview/private-fixture/page-001.mp3"],
);
```

Exercise the plugin's `generateBundle` hook with a fake `emitFile` and assert the emitted `fileName` and bytes exactly match the allowlisted fixture.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/private-story-build.test.mjs`

Expected: FAIL because the Vite build boundary and asset plugin do not exist.

- [ ] **Step 3: Implement config-time loading and exact asset emission**

Change to `defineConfig(({ command }) => { ... })`. Load private data only when `command === "build"` and `process.env.PARROT_PRIVATE_STORY_PREVIEW === "1"`. Inject:

```ts
"import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW": JSON.stringify(enabled),
"import.meta.env.VITE_PARROT_PRIVATE_STORIES": JSON.stringify(data.stories),
```

For each allowlisted asset, call `emitFile({ type: "asset", fileName, source: readFileSync(sourceFile) })`. Do not scan or copy the private directory recursively.

Add scripts:

```json
"build:private-story-preview": "PARROT_PRIVATE_STORY_PREVIEW=1 npm run build"
```

- [ ] **Step 4: Run tests and normal build**

Run: `node --test tests/private-story-build.test.mjs tests/private-story-preview.test.mjs`

Run: `npm run build`

Expected: tests and build pass; normal `dist` contains no `assets/private-story-preview` directory.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts package.json tests/private-story-build.test.mjs
git commit -m "feat: build private story previews"
```

---

### Task 6: Extend ElevenLabs generation and prove production isolation

**Files:**
- Modify: `scripts/generate-static-audio.mjs`
- Create: `scripts/verify-private-story-isolation.mjs`
- Modify: `package.json`
- Modify: `tests/generate-static-audio.test.mjs`
- Create: `tests/private-story-isolation.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `audioLines` and `markers` from Task 1.
- Produces: exported `getGenerationLines({ includePrivateStories, projectRoot, previewDirectory? })`.
- Produces: isolation verifier that returns nonzero when private markers or assets occur in tracked files or a normal `dist`.

- [ ] **Step 1: Write failing generator/isolation tests**

Refactor-safe tests import `getGenerationLines` without running generation. Assert default lines equal `STATIC_AUDIO_LINES`; private mode adds exact synthetic page lines whose output paths remain under the ignored directory. Test the verifier with in-memory tracked/dist content and assert it reports only paths, never marker values.

```js
assert.equal(defaultLines["private-fixture-page-001-narration"], undefined);
assert.equal(
  privateLines["private-fixture-page-001-narration"].text,
  "Synthetic page text.",
);
assert.deepEqual(scanResult.leakedPaths, ["dist/assets/index.js"]);
assert.doesNotMatch(scanResult.message, /Synthetic page text/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/generate-static-audio.test.mjs tests/private-story-isolation.test.mjs`

Expected: FAIL because the generator selector and verifier do not exist.

- [ ] **Step 3: Add private-line generation without duplicating TTS logic**

Add an `isMain` guard so tests can import the generator. When `--private-story-preview` is present, merge loader-provided `audioLines` into the existing static map. Update `getOutputPath(line)` to prefer validated `line.outputFilePath`; otherwise preserve the existing `public/${line.src}` behavior. Keep the existing narrator voice, model, format, retry, and skip-unless-force behavior unchanged.

- [ ] **Step 4: Implement the fail-closed isolation verifier**

Load private markers only when the ignored manifest exists. Verify `git ls-files -- content/private-story-preview` is empty, then scan tracked text and the requested `dist` for private IDs, titles, serialized page strings, and derived audio paths. Print only leaked file paths. Support `--require-private-inputs` for the release check; without it, CI may report a clean skip when private inputs are absent.

Add these package scripts now that both target commands exist:

```json
"generate:audio:private-story-preview": "node scripts/generate-static-audio.mjs --provider=elevenlabs --private-story-preview",
"verify:private-story-isolation": "node scripts/verify-private-story-isolation.mjs"
```

- [ ] **Step 5: Document the exact safe local workflow**

Add a README subsection containing these generic commands only:

```bash
npm run generate:audio:private-story-preview
npm run build
npm run verify:private-story-isolation -- --require-private-inputs
npm run build:private-story-preview
npx wrangler versions upload --preview-alias private-story-test-local
```

State that Access must protect previews before upload and that the private directory is ignored.

- [ ] **Step 6: Run focused and regression tests**

Run: `node --test tests/generate-static-audio.test.mjs tests/private-story-isolation.test.mjs tests/architecture-cleanup.test.mjs`

Expected: all pass, including macOS-provider rejection and existing ElevenLabs defaults.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-static-audio.mjs scripts/verify-private-story-isolation.mjs package.json tests/generate-static-audio.test.mjs tests/private-story-isolation.test.mjs README.md
git commit -m "feat: generate isolated private story audio"
```

---

### Task 7: Prepare the ignored drafts, generate audio, and verify both builds

**Files:**
- Local ignored: `content/private-story-preview/manifest.json`
- Local ignored: `content/private-story-preview/story-1.txt`
- Local ignored: `content/private-story-preview/story-2.txt`
- Local ignored: `content/private-story-preview/audio/**`

**Interfaces:**
- Consumes: the two checksum-verified legacy local drafts.
- Produces: a validated private bundle in `dist` only after a clean normal build has passed the isolation verifier.

- [ ] **Step 1: Resolve and validate the two source paths before moving**

```bash
rg --files content/local-stories -g '*.txt'
test "$(rg --files content/local-stories -g '*.txt' | wc -l | tr -d ' ')" = "2"
```

- [ ] **Step 2: Copy them to generic ignored filenames and verify checksums are unchanged**

Resolve the two printed paths into a validated zsh array, then use the tracked preparation command so no private title appears in shell history:

```bash
private_story_sources=("${(@f)$(rg --files content/local-stories -g '*.txt' | sort)}")
(( ${#private_story_sources[@]} == 2 ))
private_story_sha_one=$(shasum -a 256 "${private_story_sources[1]}" | awk '{print $1}')
private_story_sha_two=$(shasum -a 256 "${private_story_sources[2]}" | awk '{print $1}')
node scripts/prepare-private-story-preview.mjs \
  --source="${private_story_sources[1]}" \
  --source="${private_story_sources[2]}"
test "$(shasum -a 256 content/private-story-preview/story-1.txt | awk '{print $1}')" = "$private_story_sha_one"
test "$(shasum -a 256 content/private-story-preview/story-2.txt | awk '{print $1}')" = "$private_story_sha_two"
```

- [ ] **Step 3: Create the ignored version-1 manifest**

Inspect the generated manifest structurally without printing its titles or opaque IDs, then validate it through `loadPrivateStoryPreview({ requireAudio: false })` and report only page counts/word counts.

- [ ] **Step 4: Generate all missing page narration with the existing credential**

```bash
node --env-file=/Users/patchin/Workspace/parrot-english/.dev.vars \
  scripts/generate-static-audio.mjs \
  --provider=elevenlabs \
  --private-story-preview
```

Expected: one non-empty MP3 per page under the ignored audio directory; logs contain IDs/status only.

- [ ] **Step 5: Validate media shape without listening for content comparison**

```bash
find content/private-story-preview/audio -type f -name '*.mp3' -print0 | xargs -0 file
find content/private-story-preview/audio -type f -name '*.mp3' -size 0 -print
```

Expected: every file is MPEG audio and the zero-byte search prints nothing.

- [ ] **Step 6: Build and prove the ordinary production bundle is clean**

```bash
npm run build
npm run verify:private-story-isolation -- --require-private-inputs
```

Expected: both succeed and `dist/assets/private-story-preview` does not exist.

- [ ] **Step 7: Build and inspect the private bundle**

```bash
npm run build:private-story-preview
```

Expected: the ignored manifest's two IDs/titles and every derived narration path are present; every allowlisted MP3 exists in `dist/assets/private-story-preview` and no extra private MP3 is emitted.

---

### Task 8: Full verification, independent review, PR, and merge

**Files:**
- Review all tracked branch changes relative to `origin/main`.

- [ ] **Step 1: Run the complete repository verification**

```bash
npm test
npm run lint
npm run build
npm run test:browser
git diff --check origin/main...HEAD
```

Expected: all required checks pass. Investigate any failure before proceeding; do not dismiss unrelated failures without an isolated passing rerun and evidence.

- [ ] **Step 2: Audit the branch for private content**

```bash
git status --short --ignored
git diff --stat origin/main...HEAD
git ls-files content/private-story-preview content/local-stories
git rev-list --objects origin/main..HEAD
npm run verify:private-story-isolation -- --require-private-inputs
```

Expected: no private directory/file is tracked or reachable from branch commits, and the normal bundle is clean.

- [ ] **Step 3: Request independent spec and code-quality reviews**

Dispatch separate reviewers for spec compliance and maintainability. Fix every confirmed issue with focused tests and rerun the affected suite.

- [ ] **Step 4: Rebase on the latest main and repeat verification if main moved**

```bash
git fetch origin
git rebase origin/main
```

- [ ] **Step 5: Push, open the PR, and wait for required checks**

```bash
git push -u origin codex/private-story-preview
gh pr create \
  --base main \
  --head codex/private-story-preview \
  --title "Add private long-story previews" \
  --body "Adds opt-in, Access-gated long-story preview support. Private titles, prose, manifests, and audio remain ignored; normal production builds stay content-clean."
private_story_pr_number=$(gh pr view --json number --jq '.number')
gh pr checks --watch "$private_story_pr_number"
```

The PR body states that private content/audio are ignored, normal builds are inert, and deployment uses a separate Access-protected version preview.

- [ ] **Step 6: Merge and verify the merge commit**

```bash
private_story_pr_number=$(gh pr view --json number --jq '.number')
gh pr merge "$private_story_pr_number" --merge --delete-branch
git fetch origin
git switch --detach origin/main
git log -1 --oneline origin/main
```

Expected: the PR is merged, required checks passed, and no private marker is reachable from `origin/main`.

---

### Task 9: Protect, upload, and verify the live Cloudflare preview

**Files:**
- No tracked file changes.

- [ ] **Step 1: Ask for action-time confirmation**

State the exact pending change: enable Cloudflare Access for **Previews only** on `parrot-english`, using **Cloudflare account members**; the account currently has one member. Wait for confirmation before clicking Apply.

- [ ] **Step 2: Apply and verify the Access policy**

In the signed-in Cloudflare dashboard, select the preconfigured account-members policy and apply it to previews only. Reload the Access tab and verify it reports preview protection while custom production domains remain unchanged.

- [ ] **Step 3: Authenticate Wrangler without persisting a new token**

Use the existing browser session through `npx wrangler login`, then verify `npx wrangler whoami`. Do not create, print, or commit an API token.

- [ ] **Step 4: Record production state, rebuild private output from merged support, and upload a version**

```bash
private_story_merge_sha=$(git rev-parse --short=7 origin/main)
npx wrangler deployments list --config wrangler.jsonc
npm run build
npm run verify:private-story-isolation -- --require-private-inputs
npm run build:private-story-preview
npx wrangler versions upload --config wrangler.jsonc \
  --tag "private-story-test-${private_story_merge_sha}" \
  --message "Access-protected private long-story test" \
  --preview-alias "private-story-test-${private_story_merge_sha}"
```

Capture the exact preview URL and version ID. Do not run a deployment command.

- [ ] **Step 5: Verify the access boundary**

From an unauthenticated HTTP client, request the preview and assert Cloudflare Access redirects/denies before app HTML. From the signed-in account-owner browser, assert Access succeeds and the read-only story shelf loads. Confirm the public production domain still lacks both private story IDs and derived audio paths.

- [ ] **Step 6: Verify the live story experience end to end**

At 280×568, 390×844, and 1280×800:

- open `Long stories` and confirm both current private titles appear;
- open each story and visit every page route;
- confirm text is scrollable/contained and controls do not overlap;
- play each narration asset and confirm HTTP 200 plus successful media completion;
- test pause/resume, next/back, whole-story advancement, and finish/restart;
- confirm non-story routes redirect to the long-story shelf and make no profile/art write requests.

- [ ] **Step 7: Prove production traffic did not move**

Run `wrangler deployments list` again and compare the active production deployment/version to Step 4. Confirm the new version exists only as a preview and the public domain serves the ordinary content-clean bundle.

- [ ] **Step 8: Record completion evidence**

Capture the merged PR URL, merge commit, Access scope/policy result, preview alias/version, test summaries, production-isolation result, and live viewport/audio checks. Only then mark the goal complete.
