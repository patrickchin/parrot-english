# Compact Lesson Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tall lesson chooser cards with compact horizontal rows whose Start lesson actions sit on the right.

**Architecture:** Keep the existing `LessonList` markup and data flow. Express the new layout entirely in `src/styles.css` with an outer artwork/content grid and an inner copy/action grid, plus a narrow-screen override that hides summaries while preserving right-side actions.

**Tech Stack:** React 19, Vite 8, CSS Grid, Node test runner

---

### Task 1: Lock the compact row contract

**Files:**
- Modify: `tests/lesson-list-ui.test.mjs:40-49`
- Test: `tests/lesson-list-ui.test.mjs`

- [ ] **Step 1: Write the failing layout test**

Add this test after the existing responsive-style test:

```js
it("uses compact horizontal cards with actions on the right", () => {
  const styles = readProjectFile("src/styles.css");

  assert.match(
    styles,
    /\.lesson-card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    styles,
    /\.lesson-card\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*clamp\(170px,\s*20vw,\s*230px\)\s+minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    styles,
    /\.lesson-card-content\s*\{[^}]*grid-template-areas:[^;]*"title action"[^;]*"summary action"[^;]*"count action"/s,
  );
  assert.match(
    styles,
    /\.lesson-card-action\s*\{[^}]*grid-area:\s*action/s,
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/lesson-list-ui.test.mjs`

Expected: FAIL in `uses compact horizontal cards with actions on the right` because the catalog still uses a two-column card grid and vertically stacked card content.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add tests/lesson-list-ui.test.mjs
git commit -m "test: define compact lesson card layout"
```

### Task 2: Implement the compact horizontal cards

**Files:**
- Modify: `src/styles.css:788-910`
- Modify: `src/styles.css:1446-1458`
- Test: `tests/lesson-list-ui.test.mjs`

- [ ] **Step 1: Replace the desktop card layout rules**

Update the existing selectors to the following declarations, keeping unchanged color and state rules in place:

```css
.lesson-card-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: min(1120px, 100%);
  margin: 0 auto;
  gap: clamp(14px, 2vw, 20px);
}

.lesson-card {
  display: grid;
  grid-template-columns: clamp(170px, 20vw, 230px) minmax(0, 1fr);
  min-height: 154px;
  overflow: hidden;
  border: 6px solid rgb(255 255 255 / 94%);
  border-radius: 24px;
  background: rgb(255 255 255 / 95%);
  box-shadow:
    0 8px 0 rgb(35 93 126 / 20%),
    0 16px 28px rgb(31 94 132 / 18%);
}

.lesson-card-artwork {
  position: relative;
  min-height: 154px;
  overflow: hidden;
}

.lesson-card-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title action"
    "summary action"
    "count action";
  align-items: center;
  gap: 6px clamp(18px, 3vw, 34px);
  padding: clamp(16px, 2vw, 22px) clamp(18px, 3vw, 30px);
}

.lesson-card-content h2 {
  grid-area: title;
  color: #204c7f;
  font-size: clamp(1.5rem, 2.4vw, 2.1rem);
  line-height: 1;
}

.lesson-card-content p {
  grid-area: summary;
  min-height: 0;
  font-size: clamp(0.95rem, 1.4vw, 1.1rem);
  font-weight: 750;
  line-height: 1.35;
}

.lesson-scene-count {
  grid-area: count;
  color: #386177;
}

.lesson-card-action {
  grid-area: action;
  display: inline-flex;
  min-width: 172px;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 4px solid #fff;
  border-radius: 999px;
  background: #ff467b;
  color: #fff;
  padding: 0 18px;
  box-shadow: 0 6px 0 rgb(171 38 83 / 42%);
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 950;
  white-space: nowrap;
  transition: filter 160ms ease, transform 160ms ease;
}
```

- [ ] **Step 2: Replace the narrow-screen card override**

Inside `@media (max-width: 700px)`, replace the old card-grid and artwork rules with:

```css
.lesson-card {
  grid-template-columns: clamp(86px, 25vw, 140px) minmax(0, 1fr);
  min-height: 112px;
  border-width: 4px;
  border-radius: 18px;
}

.lesson-card-artwork {
  min-height: 112px;
}

.lesson-card-number {
  top: 9px;
  left: 9px;
  width: 40px;
  border-width: 3px;
  font-size: 1.15rem;
}

.lesson-card-content {
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title action"
    "count action";
  gap: 8px;
  padding: 12px;
}

.lesson-card-content h2 {
  font-size: clamp(1.05rem, 4.8vw, 1.45rem);
}

.lesson-card-content p {
  display: none;
}

.lesson-scene-count {
  gap: 5px;
  font-size: 0.8rem;
}

.lesson-card-action {
  min-width: 96px;
  min-height: 48px;
  gap: 5px;
  padding: 0 10px;
  font-size: 0.88rem;
}
```

- [ ] **Step 3: Run the focused lesson-list tests and verify GREEN**

Run: `node --test tests/lesson-list-ui.test.mjs tests/lesson-list-page.test.mjs`

Expected: PASS with all lesson-list tests green.

- [ ] **Step 4: Commit the compact card implementation**

```bash
git add src/styles.css
git commit -m "style: compact lesson chooser cards"
```

### Task 3: Verify behavior and responsive presentation

**Files:**
- Verify: `src/styles.css`
- Verify: `src/LessonList.tsx`

- [ ] **Step 1: Run static verification**

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully with no errors.

- [ ] **Step 2: Start the local app**

Run: `npm run dev`

Expected: Wrangler serves the application at `http://localhost:3000`.

- [ ] **Step 3: Inspect desktop layout**

Open the lesson chooser at `1440x900` and confirm the cards form one compact column, artwork stays left, copy remains readable, and each Start lesson button is aligned on the right.

- [ ] **Step 4: Inspect phone layout**

Resize to `390x844` and confirm the summaries are hidden, cards remain horizontal and short, buttons remain on the right, and no title, scene count, or action overlaps.

- [ ] **Step 5: Review the final diff**

Run: `git diff origin/main...HEAD --check && git status --short`

Expected: no whitespace errors; only the approved spec, plan, layout test, and CSS implementation are present.
