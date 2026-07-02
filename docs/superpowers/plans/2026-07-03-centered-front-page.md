# Centered Front Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Horizontally center the lesson-list front page, show its meadow artwork at full opacity without an overlay, and restore the asset-format test by removing superseded source files.

**Architecture:** Keep the React structure unchanged and implement the approved presentation entirely in the existing lesson-list CSS. Extend the focused CSS regression test so the desired alignment and background treatment are enforced before changing production styles. Preserve the asset-format contract by deleting only tracked `.wav` and `.png` files that have current `.mp3` and `.webp` replacements, then align the audio pipeline documentation with the active MP3 generator output.

**Tech Stack:** React 19, Vite 8, CSS, Node.js built-in test runner

---

### Task 1: Center the lesson-list UI and remove transparent background layers

**Files:**
- Modify: `tests/lesson-list-scroll-color.test.mjs:15-39`
- Modify: `src/styles.css:53-147`
- Modify: `src/styles.css:984-1003`

- [x] **Step 1: Write the failing regression test**

Add this test inside the existing `describe("lesson list scrolling and color", ...)` block in `tests/lesson-list-scroll-color.test.mjs`:

```js
it("centers the front-page content without a transparent background treatment", () => {
  const backgroundRule = getRule(".lesson-list-background");
  const contentRule = getRule(".lesson-list-content");
  const headerRule = getRule(".lesson-list-header");
  const gridRule = getRule(".lesson-list-grid");

  assert.match(backgroundRule, /opacity:\s*1/);
  assert.doesNotMatch(styles, /\.lesson-list-shell::before\s*\{/);
  assert.match(contentRule, /margin-inline:\s*auto/);
  assert.match(headerRule, /justify-items:\s*center/);
  assert.match(headerRule, /text-align:\s*center/);
  assert.match(gridRule, /justify-content:\s*center/);
});
```

- [x] **Step 2: Run the focused test and verify the new assertion fails**

Run:

```bash
node --test tests/lesson-list-scroll-color.test.mjs
```

Expected: FAIL in `centers the front-page content without a transparent background treatment` because `.lesson-list-background` still has `opacity: 0.86` and the overlay and centering declarations still exist in their old form.

- [x] **Step 3: Apply the minimal CSS implementation**

In `src/styles.css`, change the lesson-list background rule to full opacity:

```css
.lesson-list-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
  filter: saturate(1.12) contrast(1.04);
  user-select: none;
}
```

Delete the entire `.lesson-list-shell::before` rule. Then add centering declarations to the existing content, header, and grid rules:

```css
.lesson-list-content {
  position: relative;
  z-index: 3;
  display: grid;
  height: calc(100dvh - var(--lesson-list-page-padding) - var(--lesson-list-page-padding));
  width: min(100%, 1080px);
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(22px, 4vh, 34px);
  margin-inline: auto;
}

.lesson-list-header {
  display: grid;
  max-width: 660px;
  justify-items: center;
  gap: 10px;
  margin-inline: auto;
  text-align: center;
}

.lesson-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 760px);
  min-height: 0;
  justify-content: center;
  overflow-y: auto;
  overscroll-behavior: contain;
  gap: clamp(14px, 2vw, 20px);
  padding: 0 14px 16px 0;
  scrollbar-gutter: stable;
}
```

Inside `@media (max-width: 900px)`, delete the `.lesson-list-shell::before` override because the base overlay no longer exists. Preserve the existing `.lesson-list-content { width: 100%; }` and character rules.

- [x] **Step 4: Run the focused lesson-list tests and verify they pass**

Run:

```bash
node --test tests/lesson-list-scroll-color.test.mjs tests/lesson-list-ui.test.mjs
```

Expected: all lesson-list tests PASS with no warnings or errors.

- [x] **Step 5: Run project verification**

Run:

```bash
npm run build
npm run lint
```

Expected: TypeScript/Vite build and ESLint both exit with status 0.

- [x] **Step 6: Inspect desktop and mobile layouts in the in-app browser**

Start the local Vite server:

```bash
npm run dev:vite -- --port 4173
```

At `http://localhost:4173`, inspect the front page at 1280×720 and 390×844. Confirm that the header and lesson-card column are horizontally centered, the content remains top-anchored, the meadow is fully opaque with no color wash, lesson-list scrolling still works, and no content is clipped at either width.

- [x] **Step 7: Commit the tested implementation**

```bash
git add src/styles.css tests/lesson-list-scroll-color.test.mjs docs/superpowers/plans/2026-07-03-centered-front-page.md
git commit -m "Center lesson list front page"
```

### Task 2: Remove superseded public assets

**Files:**
- Delete: `public/assets/audio/*.wav`
- Delete: `public/assets/backgrounds/episode-garden.png`
- Delete: `public/assets/characters/parrot-coach.png`
- Delete: `public/assets/characters/pig-host.png`
- Modify: `docs/design/audio-and-content-pipeline.md:90-151`

- [x] **Step 1: Re-run the existing failing asset-format regression test**

Run:

```bash
node --test tests/web-assets.test.mjs
```

Expected: FAIL with the 25 tracked `.wav` and `.png` paths. This is the existing red test proving that the superseded formats violate the repository's public-asset contract.

- [x] **Step 2: Delete only the approved superseded assets**

Remove the 22 WAV files and three PNG files after confirming that each has a same-named `.mp3` or `.webp` replacement:

```bash
git rm public/assets/audio/*.wav \
  public/assets/backgrounds/episode-garden.png \
  public/assets/characters/parrot-coach.png \
  public/assets/characters/pig-host.png
```

- [x] **Step 3: Align audio pipeline documentation with MP3 output**

Replace the stale generator and QA guidance in `docs/design/audio-and-content-pipeline.md` with:

```markdown
The generator is `scripts/generate-static-audio.mjs`. It is ElevenLabs-only
and requests MP3 output for the `.mp3` paths declared in `STATIC_AUDIO_LINES`.

After regenerating audio:

- Confirm the changed `public/assets/audio/*.mp3` files exist.
- Confirm MP3 format and playback manually if the line is user-facing.
```

Update the local verification URL to:

```bash
curl -I http://localhost:3000/assets/audio/turn-hello.mp3
```

- [x] **Step 4: Verify the asset fix and full test suite**

Run:

```bash
node --test tests/web-assets.test.mjs
npm test
```

Expected: the asset-format test and the complete test suite PASS with no unsupported public assets.

- [x] **Step 5: Commit the asset cleanup**

```bash
git add docs/design/audio-and-content-pipeline.md
git commit -m "Remove superseded lesson assets"
```
