# Lesson List Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Parrot English on a child-friendly lesson catalog with one playable lesson, three disabled previews, and a lesson-level Back control that returns to the catalog and resets progress.

**Architecture:** Keep catalog metadata and navigation transitions in pure `@ts-check` JavaScript modules so Node tests can exercise the behavior without a browser harness. A small React `App` reducer switches between `LessonList` and a freshly mounted `LessonPlayer`; native disabled buttons enforce unavailable lessons, and unmounting the player resets its existing reducer state.

**Tech Stack:** React 19, TypeScript/TSX, JavaScript with `@ts-check`, CSS, Lucide React, Node test runner, Vite

---

## File Structure

- `lib/lesson-catalog.js`: static card metadata and enabled-lesson lookup.
- `lib/app-navigation.js`: pure list-first navigation state and reducer.
- `tests/lesson-catalog.test.mjs`: catalog availability and lookup behavior.
- `tests/app-navigation.test.mjs`: initial screen, enabled selection, disabled selection, and Back behavior.
- `tests/lesson-list-ui.test.mjs`: source-level accessibility and responsive-style contracts that complement the pure behavior tests.
- `src/LessonList.tsx`: catalog heading, responsive card markup, start action, and native disabled previews.
- `src/App.tsx`: top-level `App` navigation plus the existing lesson player and its Back callback.
- `src/main.tsx`: application bootstrap through `App` instead of directly mounting `LessonPlayer`.
- `src/styles.css`: catalog/card presentation and the distinct lesson-level Back control.
- `README.md`: product description updated from a direct one-page lesson to a list-first prototype.
- `docs/design/product-experience.md`: current entry and navigation rules updated to match the implemented list.

### Task 1: Add Catalog Metadata and Availability Rules

**Files:**
- Create: `lib/lesson-catalog.js`
- Create: `tests/lesson-catalog.test.mjs`

- [ ] **Step 1: Write the failing catalog tests**

Create `tests/lesson-catalog.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_LESSON_ID,
  LESSON_CATALOG,
  getAvailableLesson,
} from "../lib/lesson-catalog.js";

describe("lesson catalog", () => {
  it("contains one playable lesson and three disabled previews", () => {
    assert.equal(LESSON_CATALOG.length, 4);
    assert.deepEqual(
      LESSON_CATALOG.filter((lesson) => lesson.available).map(
        (lesson) => lesson.id
      ),
      [CURRENT_LESSON_ID]
    );
    assert.equal(
      LESSON_CATALOG.filter((lesson) => !lesson.available).length,
      3
    );
  });

  it("returns only the playable lesson from availability lookup", () => {
    assert.equal(getAvailableLesson(CURRENT_LESSON_ID)?.id, CURRENT_LESSON_ID);
    assert.equal(getAvailableLesson("market-day"), null);
    assert.equal(getAvailableLesson("missing"), null);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lesson-catalog.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/lesson-catalog.js`.

- [ ] **Step 3: Implement the catalog contract**

Create `lib/lesson-catalog.js`:

```js
// @ts-check

/**
 * @typedef {object} LessonCatalogEntry
 * @property {string} id
 * @property {string} titleZh
 * @property {string} descriptionZh
 * @property {string} topicZh
 * @property {number} sceneCount
 * @property {string} artworkSrc
 * @property {string} artworkAlt
 * @property {"garden" | "market" | "picnic" | "bedtime"} theme
 * @property {boolean} available
 */

export const CURRENT_LESSON_ID = "garden-helping";

/** @type {LessonCatalogEntry[]} */
export const LESSON_CATALOG = [
  {
    id: CURRENT_LESSON_ID,
    titleZh: "花园里的互助",
    descriptionZh: "和佩奇、多莉一起练习打招呼、请求帮助和表达感谢。",
    topicZh: "礼貌表达",
    sceneCount: 5,
    artworkSrc: "/assets/backgrounds/episode-garden.png",
    artworkAlt: "阳光明媚的花园",
    theme: "garden",
    available: true,
  },
  {
    id: "market-day",
    titleZh: "热闹的市集",
    descriptionZh: "学习挑选水果，并用英语礼貌地询问价格。",
    topicZh: "购物交流",
    sceneCount: 6,
    artworkSrc: "/assets/backgrounds/meadow-day.webp",
    artworkAlt: "明亮的草地",
    theme: "market",
    available: false,
  },
  {
    id: "picnic-time",
    titleZh: "快乐野餐会",
    descriptionZh: "邀请朋友分享食物，说出喜欢和不喜欢的东西。",
    topicZh: "分享食物",
    sceneCount: 5,
    artworkSrc: "/assets/backgrounds/meadow-evening.webp",
    artworkAlt: "傍晚的草地",
    theme: "picnic",
    available: false,
  },
  {
    id: "bedtime-story",
    titleZh: "睡前故事",
    descriptionZh: "在安静的小故事里练习晚安和简单的心情表达。",
    topicZh: "日常问候",
    sceneCount: 5,
    artworkSrc: "/assets/backgrounds/reward-bg.webp",
    artworkAlt: "星光奖励背景",
    theme: "bedtime",
    available: false,
  },
];

/**
 * @param {string} lessonId
 * @returns {LessonCatalogEntry | null}
 */
export function getAvailableLesson(lessonId) {
  return (
    LESSON_CATALOG.find(
      (lesson) => lesson.id === lessonId && lesson.available
    ) ?? null
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/lesson-catalog.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the catalog boundary**

```bash
git add lib/lesson-catalog.js tests/lesson-catalog.test.mjs
git commit -m "feat: add lesson catalog metadata"
```

### Task 2: Add List-First Navigation State

**Files:**
- Create: `lib/app-navigation.js`
- Create: `tests/app-navigation.test.mjs`

- [ ] **Step 1: Write the failing navigation tests**

Create `tests/app-navigation.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CURRENT_LESSON_ID } from "../lib/lesson-catalog.js";
import {
  AppScreen,
  createInitialAppNavigation,
  reduceAppNavigation,
} from "../lib/app-navigation.js";

describe("app navigation", () => {
  it("starts on the lesson list", () => {
    assert.deepEqual(createInitialAppNavigation(), {
      screen: AppScreen.LessonList,
      lessonId: null,
    });
  });

  it("opens the available lesson", () => {
    const state = reduceAppNavigation(createInitialAppNavigation(), {
      type: "OPEN_LESSON",
      lessonId: CURRENT_LESSON_ID,
    });

    assert.deepEqual(state, {
      screen: AppScreen.Lesson,
      lessonId: CURRENT_LESSON_ID,
    });
  });

  it("ignores disabled and unknown lessons", () => {
    const initial = createInitialAppNavigation();

    assert.equal(
      reduceAppNavigation(initial, {
        type: "OPEN_LESSON",
        lessonId: "market-day",
      }),
      initial
    );
    assert.equal(
      reduceAppNavigation(initial, {
        type: "OPEN_LESSON",
        lessonId: "missing",
      }),
      initial
    );
  });

  it("returns to a fresh list state", () => {
    const openLesson = {
      screen: AppScreen.Lesson,
      lessonId: CURRENT_LESSON_ID,
    };

    assert.deepEqual(
      reduceAppNavigation(openLesson, { type: "BACK_TO_LIST" }),
      createInitialAppNavigation()
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/app-navigation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/app-navigation.js`.

- [ ] **Step 3: Implement the pure navigation reducer**

Create `lib/app-navigation.js`:

```js
// @ts-check

import { getAvailableLesson } from "./lesson-catalog.js";

export const AppScreen = Object.freeze({
  LessonList: "lesson-list",
  Lesson: "lesson",
});

/**
 * @typedef {object} AppNavigationState
 * @property {"lesson-list" | "lesson"} screen
 * @property {string | null} lessonId
 */

/**
 * @typedef {{ type: "OPEN_LESSON", lessonId: string } | { type: "BACK_TO_LIST" }} AppNavigationEvent
 */

/** @returns {AppNavigationState} */
export function createInitialAppNavigation() {
  return { screen: AppScreen.LessonList, lessonId: null };
}

/**
 * @param {AppNavigationState} state
 * @param {AppNavigationEvent} event
 * @returns {AppNavigationState}
 */
export function reduceAppNavigation(state, event) {
  if (event.type === "BACK_TO_LIST") {
    return createInitialAppNavigation();
  }

  const lesson = getAvailableLesson(event.lessonId);
  if (!lesson) return state;

  return { screen: AppScreen.Lesson, lessonId: lesson.id };
}
```

- [ ] **Step 4: Run catalog and navigation tests and verify GREEN**

Run: `node --test tests/lesson-catalog.test.mjs tests/app-navigation.test.mjs`

Expected: 6 tests pass.

- [ ] **Step 5: Commit navigation behavior**

```bash
git add lib/app-navigation.js tests/app-navigation.test.mjs
git commit -m "feat: add lesson list navigation state"
```

### Task 3: Render the Catalog and Wire the Lesson Back Control

**Files:**
- Create: `src/LessonList.tsx`
- Create: `tests/lesson-list-ui.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing UI contract tests**

Create `tests/lesson-list-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("lesson list UI contracts", () => {
  it("boots through the list-first App component", () => {
    const main = readProjectFile("src/main.tsx");
    assert.match(main, /import \{ App \} from "\.\/App"/);
    assert.match(main, /<App\s*\/>/);
    assert.doesNotMatch(main, /<LessonPlayer\s*\/>/);
  });

  it("renders unavailable lessons with native disabled controls", () => {
    const lessonList = readProjectFile("src/LessonList.tsx");
    assert.match(lessonList, /disabled=\{!lesson\.available\}/);
    assert.match(lessonList, /即将开放/);
    assert.match(lessonList, /开始课程/);
  });

  it("keeps lesson-list Back separate from previous-scene navigation", () => {
    const app = readProjectFile("src/App.tsx");
    assert.match(app, /aria-label="Back to lesson list"/);
    assert.match(app, /className="lesson-list-back-button"/);
    assert.match(app, /onClick=\{onBack\}/);
    assert.match(app, /aria-label="Previous scene"/);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lesson-list-ui.test.mjs`

Expected: FAIL because `src/LessonList.tsx` does not exist and `main.tsx` still mounts `LessonPlayer`.

- [ ] **Step 3: Create the lesson-list component**

Create `src/LessonList.tsx` with this public interface and structure:

```tsx
import { BookOpen, LockKeyhole, Play, Sparkles } from "lucide-react";
import { LESSON_CATALOG } from "../lib/lesson-catalog";

type LessonListProps = {
  onOpenLesson: (lessonId: string) => void;
};

export function LessonList({ onOpenLesson }: LessonListProps) {
  return (
    <main className="lesson-list-page">
      <header className="lesson-list-header">
        <span className="lesson-list-eyebrow">
          <Sparkles aria-hidden="true" /> Parrot English
        </span>
        <h1>选择课程</h1>
        <p>选一个小故事，开口说英语吧！</p>
      </header>

      <section aria-label="英语课程" className="lesson-card-grid">
        {LESSON_CATALOG.map((lesson, index) => (
          <article
            className={`lesson-card lesson-card-${lesson.theme} ${
              lesson.available ? "is-available" : "is-disabled"
            }`}
            key={lesson.id}
          >
            <div className="lesson-card-artwork">
              <img src={lesson.artworkSrc} alt={lesson.artworkAlt} />
              <span className="lesson-card-number">{index + 1}</span>
              {!lesson.available ? (
                <span className="coming-soon-badge">
                  <LockKeyhole aria-hidden="true" /> 即将开放
                </span>
              ) : null}
            </div>

            <div className="lesson-card-content">
              <span className="lesson-topic">{lesson.topicZh}</span>
              <h2>{lesson.titleZh}</h2>
              <p>{lesson.descriptionZh}</p>
              <span className="lesson-scene-count">
                <BookOpen aria-hidden="true" /> {lesson.sceneCount} 个场景
              </span>
              <button
                aria-label={`${lesson.available ? "开始" : "尚未开放"}${lesson.titleZh}`}
                className="lesson-card-action"
                disabled={!lesson.available}
                onClick={() => onOpenLesson(lesson.id)}
                type="button"
              >
                {lesson.available ? (
                  <><Play aria-hidden="true" /> 开始课程</>
                ) : (
                  <><LockKeyhole aria-hidden="true" /> 即将开放</>
                )}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add top-level App navigation and the lesson Back callback**

In `src/App.tsx`, import `AppScreen`, `createInitialAppNavigation`,
`reduceAppNavigation`, and `LessonList`. Add:

```tsx
export function App() {
  const [navigation, dispatchNavigation] = useReducer(
    reduceAppNavigation,
    undefined,
    createInitialAppNavigation
  );

  if (navigation.screen === AppScreen.Lesson) {
    return (
      <LessonPlayer
        onBack={() => dispatchNavigation({ type: "BACK_TO_LIST" })}
      />
    );
  }

  return (
    <LessonList
      onOpenLesson={(lessonId) =>
        dispatchNavigation({ type: "OPEN_LESSON", lessonId })
      }
    />
  );
}
```

Change the player signature to:

```tsx
type LessonPlayerProps = {
  onBack: () => void;
};

export function LessonPlayer({ onBack }: LessonPlayerProps) {
```

Inside `.lesson-stage`, before the scene title card, add:

```tsx
<button
  aria-label="Back to lesson list"
  className="lesson-list-back-button"
  onClick={onBack}
  type="button"
>
  <ChevronLeft aria-hidden="true" strokeWidth={4} />
  <span>课程列表</span>
</button>
```

Do not change either existing scene navigation button or the lesson reducer.

- [ ] **Step 5: Mount App from the bootstrap**

Update `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

async function bootstrap() {
  if (import.meta.env.VITE_PARROT_E2E === "1") {
    await import("./e2e-browser-mocks");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
```

- [ ] **Step 6: Run focused tests and type-check**

Run:

```bash
node --test tests/lesson-catalog.test.mjs tests/app-navigation.test.mjs tests/lesson-list-ui.test.mjs
npx tsc --noEmit
```

Expected: 9 focused tests pass and TypeScript exits successfully.

- [ ] **Step 7: Commit the React navigation**

```bash
git add src/App.tsx src/LessonList.tsx src/main.tsx tests/lesson-list-ui.test.mjs
git commit -m "feat: add lesson list navigation"
```

### Task 4: Style the Catalog and Distinguish Both Back Controls

**Files:**
- Modify: `tests/lesson-list-ui.test.mjs`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a failing responsive-style contract test**

Append to the existing `describe` block in `tests/lesson-list-ui.test.mjs`:

```js
it("provides responsive catalog and distinct back-control styles", () => {
  const styles = readProjectFile("src/styles.css");

  assert.match(styles, /\.lesson-list-page\s*\{/);
  assert.match(styles, /\.lesson-card-grid\s*\{[^}]*grid-template-columns/s);
  assert.match(styles, /\.lesson-card-action:disabled\s*\{/);
  assert.match(styles, /\.lesson-list-back-button\s*\{/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/lesson-list-ui.test.mjs`

Expected: FAIL because the new catalog and Back selectors are absent.

- [ ] **Step 3: Add catalog layout and card styles**

Add styles for these selectors to `src/styles.css`:

```css
.lesson-list-page {
  width: 100%;
  min-height: 100dvh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 12% 12%, rgba(255, 255, 255, 0.76) 0 8%, transparent 28%),
    linear-gradient(180deg, #8bd5fa 0 46%, #a8df7e 46% 100%);
  color: #241d2b;
  padding: clamp(28px, 5vw, 64px);
}

.lesson-list-header {
  width: min(1120px, 100%);
  margin: 0 auto clamp(24px, 4vw, 42px);
  text-align: center;
}

.lesson-list-eyebrow,
.lesson-topic,
.lesson-scene-count,
.coming-soon-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 950;
}

.lesson-list-header h1 {
  margin: 8px 0;
  color: #204c7f;
  font-size: clamp(2.8rem, 7vw, 5.7rem);
  line-height: 0.95;
}

.lesson-list-header p {
  margin: 0;
  font-size: clamp(1.1rem, 2.3vw, 1.65rem);
  font-weight: 850;
}

.lesson-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(1120px, 100%);
  margin: 0 auto;
  gap: clamp(20px, 3vw, 32px);
}

.lesson-card {
  overflow: hidden;
  border: 6px solid rgba(255, 255, 255, 0.94);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 0 rgba(35, 93, 126, 0.2), 0 24px 36px rgba(31, 94, 132, 0.2);
}

.lesson-card.is-disabled {
  filter: saturate(0.58);
}

.lesson-card-artwork {
  position: relative;
  height: clamp(160px, 20vw, 240px);
  overflow: hidden;
}

.lesson-card-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lesson-card.is-disabled .lesson-card-artwork img {
  opacity: 0.66;
}

.lesson-card-number,
.coming-soon-badge {
  position: absolute;
  border: 4px solid #ffffff;
  border-radius: 999px;
  color: #ffffff;
}

.lesson-card-number {
  top: 16px;
  left: 16px;
  display: grid;
  width: 54px;
  aspect-ratio: 1;
  place-items: center;
  background: #ff467b;
  font-size: 1.6rem;
  font-weight: 950;
}

.coming-soon-badge {
  top: 16px;
  right: 16px;
  background: #204c7f;
  padding: 9px 14px;
}

.lesson-card-content {
  display: grid;
  gap: 12px;
  padding: clamp(20px, 3vw, 30px);
}

.lesson-topic {
  width: max-content;
  border-radius: 999px;
  background: #fff0a8;
  color: #814900;
  padding: 7px 13px;
}

.lesson-card-content h2,
.lesson-card-content p {
  margin: 0;
}

.lesson-card-content h2 {
  color: #204c7f;
  font-size: clamp(1.75rem, 3vw, 2.55rem);
  line-height: 1;
}

.lesson-card-content p {
  min-height: 3.2em;
  font-size: clamp(1rem, 1.6vw, 1.2rem);
  font-weight: 750;
  line-height: 1.55;
}

.lesson-scene-count {
  color: #386177;
}

.lesson-card-action {
  display: inline-flex;
  min-height: 62px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 4px solid #ffffff;
  border-radius: 999px;
  background: #ff467b;
  color: #ffffff;
  box-shadow: 0 6px 0 rgba(191, 45, 96, 0.4);
  cursor: pointer;
  font-size: 1.3rem;
  font-weight: 950;
}

.lesson-card-action:disabled {
  background: #71869b;
  box-shadow: 0 6px 0 rgba(53, 72, 90, 0.34);
  cursor: not-allowed;
  opacity: 1;
}

.lesson-card-action:focus-visible,
.lesson-list-back-button:focus-visible {
  outline: 5px solid #204c7f;
  outline-offset: 5px;
}
```

- [ ] **Step 4: Add the separate lesson-level Back style and responsive rules**

Add:

```css
.lesson-list-back-button {
  position: absolute;
  z-index: 18;
  top: 2.1%;
  left: 1.6%;
  display: inline-flex;
  min-height: 58px;
  align-items: center;
  gap: 4px;
  border: 5px solid rgba(255, 255, 255, 0.94);
  border-radius: 999px;
  background: #204c7f;
  color: #ffffff;
  box-shadow: 0 6px 0 rgba(18, 55, 92, 0.5), 0 14px 24px rgba(31, 94, 132, 0.18);
  padding: 0 18px 0 10px;
  cursor: pointer;
  font-weight: 950;
}

.lesson-list-back-button svg {
  width: 30px;
  height: 30px;
}

.scene-title-card {
  left: clamp(164px, 15vw, 220px);
}

@media (max-width: 700px) {
  .lesson-list-page {
    padding: 24px 16px 44px;
  }

  .lesson-card-grid {
    grid-template-columns: 1fr;
  }

  .lesson-card-artwork {
    height: 190px;
  }

  .lesson-list-back-button {
    min-height: 52px;
    padding-right: 13px;
    font-size: 0.9rem;
  }

  .scene-title-card {
    left: 142px;
  }
}
```

Adjust the original `.scene-title-card` declaration rather than leaving two
conflicting `left` properties. Keep the existing bottom `.scene-back-button`
unchanged.

- [ ] **Step 5: Run the UI test and verify GREEN**

Run: `node --test tests/lesson-list-ui.test.mjs`

Expected: 4 tests pass.

- [ ] **Step 6: Commit the visual treatment**

```bash
git add src/styles.css tests/lesson-list-ui.test.mjs
git commit -m "style: add responsive lesson catalog"
```

### Task 5: Update Current Product Documentation and Verify

**Files:**
- Modify: `README.md`
- Modify: `docs/design/product-experience.md`

- [ ] **Step 1: Update the current product description**

Change the README opening sentence to:

```markdown
List-first English speaking practice prototype for children, with one playable
five-scene lesson and disabled previews for upcoming lessons.
```

In `docs/design/product-experience.md`, update the summary and navigation rules
to state:

```markdown
The app opens on a lesson list. The current garden/helping lesson is playable;
three additional cards are disabled previews marked as coming soon. Selecting
the playable lesson mounts a fresh lesson player.

The labeled lesson-level Back control returns to the list and discards current
lesson progress. Reopening the lesson starts at scene 1. The separate bottom
back/next controls continue to navigate scenes within the active lesson.
```

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
node --test tests/lesson-catalog.test.mjs tests/app-navigation.test.mjs tests/lesson-list-ui.test.mjs
npm test
npm run lint
npm run build
git diff --check
```

Expected: focused tests pass, the full Node suite passes, ESLint reports no
errors, TypeScript/Vite production build succeeds, and `git diff --check`
prints no output.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/design/product-experience.md
git commit -m "docs: describe lesson list entry flow"
```

- [ ] **Step 4: Inspect final scope**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: working tree is clean and recent commits include the catalog,
navigation, styling, and documentation changes.
