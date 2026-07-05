# Lesson List Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the approved list-first lesson navigation with the current authenticated, JSON-driven lesson player on `main`.

**Architecture:** Keep Vite's validated `LESSONS` catalog as the only source of playable lesson data. A pure reducer owns catalog/player navigation, `LessonList` renders discovered lessons plus three disabled previews, and `LessonPlayer` receives one lesson and a Back callback so unmounting resets its existing reducer state.

**Tech Stack:** React 19, TypeScript/TSX, Vite `import.meta.glob`, CSS, Lucide React, Node test runner, React server rendering

---

## File Structure

- `src/app-navigation.ts`: pure list/player navigation state and availability validation.
- `src/LessonList.tsx`: discovered lesson cards and disabled previews.
- `src/App.tsx`: `LessonExperience`, player props, Back control, and AuthGate composition.
- `src/styles.css`: scrollable catalog, responsive cards, and top-level Back control.
- `tests/lesson-list-page.test.mjs`: executable reducer and server-rendered catalog tests.
- `tests/lesson-list-ui.test.mjs`: integration and CSS source contracts.
- `tests/architecture-cleanup.test.mjs`: current architecture contract updated from select to list.
- `tests/auth-ui.test.mjs`: AuthGate contract updated to wrap the whole lesson experience.
- `README.md`: list-first product summary.
- `docs/design/product-experience.md`: catalog and Back/reset rules.

### Task 1: Add Tested Navigation State

**Files:**
- Create: `src/app-navigation.ts`
- Create: `tests/lesson-list-page.test.mjs`

- [ ] **Step 1: Write the failing navigation tests**

Use a Vite SSR server to load TypeScript and assert:

```js
const initial = createInitialAppNavigation();
assert.deepEqual(initial, { activeLessonId: null });
assert.deepEqual(
  reduceAppNavigation(
    initial,
    { type: "OPEN_LESSON", lessonId: "available" },
    new Set(["available"])
  ),
  { activeLessonId: "available" }
);
assert.equal(
  reduceAppNavigation(
    initial,
    { type: "OPEN_LESSON", lessonId: "missing" },
    new Set(["available"])
  ),
  initial
);
assert.deepEqual(
  reduceAppNavigation(
    { activeLessonId: "available" },
    { type: "BACK_TO_LIST" },
    new Set(["available"])
  ),
  { activeLessonId: null }
);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/lesson-list-page.test.mjs`

Expected: FAIL because `src/app-navigation.ts` does not exist.

- [ ] **Step 3: Implement the reducer**

```ts
export type AppNavigationState = { activeLessonId: string | null };
export type AppNavigationEvent =
  | { type: "OPEN_LESSON"; lessonId: string }
  | { type: "BACK_TO_LIST" };

export function createInitialAppNavigation(): AppNavigationState {
  return { activeLessonId: null };
}

export function reduceAppNavigation(
  state: AppNavigationState,
  event: AppNavigationEvent,
  availableLessonIds: ReadonlySet<string>
): AppNavigationState {
  if (event.type === "BACK_TO_LIST") return createInitialAppNavigation();
  if (!availableLessonIds.has(event.lessonId)) return state;
  return { activeLessonId: event.lessonId };
}
```

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/lesson-list-page.test.mjs`

Expected: navigation tests pass.

### Task 2: Render Discovered and Disabled Lesson Cards

**Files:**
- Create: `src/LessonList.tsx`
- Modify: `tests/lesson-list-page.test.mjs`

- [ ] **Step 1: Add the failing server-render test**

Render `LessonList` with `renderToStaticMarkup` and assert:

```js
assert.match(html, /Choose a lesson/);
assert.match(html, /Peppa&#x27;s High Ball/);
assert.equal((html.match(/<article/g) ?? []).length, 4);
assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
assert.match(html, /Coming soon/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/lesson-list-page.test.mjs`

Expected: FAIL because `src/LessonList.tsx` does not exist.

- [ ] **Step 3: Implement `LessonList`**

Map every `LESSONS` entry to an enabled card using `lesson.title`,
`lesson.summary`, `lesson.scenes.length`, and the first scene background from
`VISUAL_CATALOG.backgrounds`. Append exactly these previews:

```ts
const UPCOMING_LESSONS = [
  { id: "market-day", title: "Market Day", summary: "Choose fruit and ask polite shopping questions.", sceneCount: 6, artworkSrc: "/assets/backgrounds/meadow-day.webp", artworkAlt: "A sunny meadow during the day" },
  { id: "picnic-time", title: "Picnic Time", summary: "Invite friends to share food and talk about favorites.", sceneCount: 5, artworkSrc: "/assets/backgrounds/meadow-evening.webp", artworkAlt: "A peaceful meadow in the evening" },
  { id: "bedtime-story", title: "Bedtime Story", summary: "Practice goodnight wishes and simple feelings in a calm story.", sceneCount: 5, artworkSrc: "/assets/backgrounds/reward-bg.webp", artworkAlt: "A cheerful celebration background" },
];
```

The component receives `onOpenLesson(lessonId)`. Every preview action uses the
native `disabled` attribute and never invokes the callback.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/lesson-list-page.test.mjs`

Expected: navigation and rendered-card tests pass.

### Task 3: Integrate List, Player, Back, and AuthGate

**Files:**
- Create: `tests/lesson-list-ui.test.mjs`
- Modify: `tests/architecture-cleanup.test.mjs`
- Modify: `tests/auth-ui.test.mjs`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing integration contracts**

Assert that `App.tsx`:

```js
assert.match(app, /export function LessonExperience\(\)/);
assert.match(app, /<LessonList/);
assert.match(app, /aria-label="Back to lesson list"/);
assert.match(app, /onClick=\{onBack\}/);
assert.doesNotMatch(app, /<select|Lesson picker/);
assert.match(app, /<AuthGate>\s*<LessonExperience\s*\/>\s*<\/AuthGate>/);
```

Update the architecture and auth contracts to expect the same list-first
composition instead of the old select-based player.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/lesson-list-ui.test.mjs tests/architecture-cleanup.test.mjs tests/auth-ui.test.mjs`

Expected: FAIL because `LessonExperience`, list wiring, and Back are absent.

- [ ] **Step 3: Integrate the components**

In `App.tsx`:

```tsx
const AVAILABLE_LESSON_IDS = new Set(LESSONS.map((entry) => entry.id));

export function LessonExperience() {
  const [navigation, dispatchNavigation] = useReducer(
    (state, event) =>
      reduceAppNavigation(state, event, AVAILABLE_LESSON_IDS),
    undefined,
    createInitialAppNavigation
  );
  const selectedEntry = LESSONS.find(
    (entry) => entry.id === navigation.activeLessonId
  );

  if (!selectedEntry) {
    return (
      <LessonList
        onOpenLesson={(lessonId) =>
          dispatchNavigation({ type: "OPEN_LESSON", lessonId })
        }
      />
    );
  }

  return (
    <LessonPlayer
      key={selectedEntry.id}
      lesson={selectedEntry.lesson}
      onBack={() => dispatchNavigation({ type: "BACK_TO_LIST" })}
    />
  );
}
```

Change `LessonPlayer` to receive `lesson` and `onBack`, remove its local lesson
selection state and `<select>`, and render:

```tsx
<button
  aria-label="Back to lesson list"
  className="lesson-list-back-button"
  onClick={onBack}
  type="button"
>
  <ChevronLeft aria-hidden="true" strokeWidth={3.2} />
  <span>Back to lessons</span>
</button>
```

Keep all playback, recording, cleanup, and scene-control code unchanged.

- [ ] **Step 4: Run integration tests and type-check**

Run:

```bash
node --test tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs tests/architecture-cleanup.test.mjs tests/auth-ui.test.mjs
npx --no-install tsc --noEmit
```

Expected: focused tests and TypeScript pass.

### Task 4: Add Responsive Styling and Documentation

**Files:**
- Modify: `tests/lesson-list-ui.test.mjs`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `docs/design/product-experience.md`

- [ ] **Step 1: Add a failing CSS contract**

Assert selectors for `.lesson-list-page`, `.lesson-card-grid`,
`.lesson-card-action:disabled`, `.lesson-list-back-button`, and a
`max-width: 700px` single-column breakpoint.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/lesson-list-ui.test.mjs`

Expected: FAIL because the list styles do not exist.

- [ ] **Step 3: Implement styles**

Add a vertically scrollable full-height list, two-column card grid, explicit
disabled treatment, large touch actions, and a one-column mobile breakpoint.
Reuse the old lesson-picker top-center safe zone for
`.lesson-list-back-button`, including the existing 900px and 720px responsive
positions.

- [ ] **Step 4: Update product docs**

Describe the list-first authenticated entry, discovered playable cards,
disabled previews, Back behavior, and scene-1 reset. Remove references to the
old select lesson picker.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests, lint, TypeScript, Vite build, and whitespace checks pass.

### Task 5: Publish the Rebased Branch

**Files:** none

- [ ] **Step 1: Inspect rebased scope**

Run: `git diff --stat origin/main..HEAD && git status -sb`

Expected: only lesson-list code, tests, and docs are present; the worktree is
clean.

- [ ] **Step 2: Update the PR branch safely**

Run: `git push --force-with-lease origin codex/lesson-list-navigation`

Expected: the existing PR branch updates without overwriting unexpected remote
work.
