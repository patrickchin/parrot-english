# Numbered Lesson Page Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add React Router so every lesson page has a canonical one-based URL such as `/lessons/1/pages/1`, with redirects and browser history support.

**Architecture:** React Router runs in Declarative Mode around the existing Vite application. A pure `lib/lesson-routes.js` module validates numeric route parameters against the JSON catalog, while `src/App.tsx` maps routes to the existing lesson list and player. The URL selects the lesson/page; the existing reducer continues to own the speaking phase within that page.

**Tech Stack:** React 19, React Router, TypeScript/JavaScript with JSDoc, Vite 8, Node's built-in test runner, Cloudflare Workers static SPA fallback.

---

## File Structure

- Create `lib/lesson-routes.js`: canonical path construction and catalog-backed route resolution.
- Create `tests/lesson-routes.test.mjs`: focused unit coverage for valid and invalid numbered routes.
- Create `tests/lesson-routing-ui.test.mjs`: source-level integration contract for React Router wiring.
- Modify `lib/lesson-state.js`: initialize/select a page while clearing active speaking state.
- Modify `tests/lesson-state.test.mjs`: reducer coverage for route-driven page selection.
- Modify `src/main.tsx`: mount the app in `BrowserRouter`.
- Modify `src/App.tsx`: declarative routes, links, redirects, parameter resolution, and URL-synchronized page controls.
- Modify `src/styles.css`: keep link-backed lesson cards visually identical to buttons.
- Modify `tests/lesson-list-ui.test.mjs`: update the lesson-list contract from private screen state to routes.
- Modify `package.json` and `package-lock.json`: add the React Router runtime dependency.
- Modify `README.md`, `docs/design/technical-architecture.md`, and `docs/design/product-experience.md`: document the new public URL behavior.

### Task 1: Add pure numbered-route resolution

**Files:**
- Create: `tests/lesson-routes.test.mjs`
- Create: `lib/lesson-routes.js`

- [ ] **Step 1: Write the failing route-resolution tests**

Create `tests/lesson-routes.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LESSON_ID } from "../lib/lesson-data.js";
import {
  getDefaultLessonNumber,
  getLessonPagePath,
  resolveLessonNumber,
  resolveLessonPageRoute,
} from "../lib/lesson-routes.js";

describe("lesson routes", () => {
  it("builds canonical one-based lesson page paths", () => {
    assert.equal(getLessonPagePath(1, 1), "/lessons/1/pages/1");
    assert.equal(getLessonPagePath(3, 4), "/lessons/3/pages/4");
  });

  it("resolves playable lessons and pages by catalog position", () => {
    const lesson = resolveLessonNumber("1");
    const page = resolveLessonPageRoute("1", "2");

    assert.equal(lesson?.lesson.id, DEFAULT_LESSON_ID);
    assert.equal(lesson?.lessonNumber, 1);
    assert.equal(page?.lesson.id, DEFAULT_LESSON_ID);
    assert.equal(page?.lessonNumber, 1);
    assert.equal(page?.pageNumber, 2);
    assert.equal(page?.pageIndex, 1);
    assert.equal(page?.step.id, "cant-reach");
  });

  it("finds the default lesson's numbered position", () => {
    assert.equal(getDefaultLessonNumber(), 1);
  });

  it("rejects non-canonical route numbers", () => {
    const invalidValues = [
      undefined,
      "",
      "0",
      "-1",
      "01",
      "1.5",
      "1x",
      "9007199254740992",
    ];

    for (const value of invalidValues) {
      assert.equal(resolveLessonNumber(value), undefined, String(value));
      assert.equal(resolveLessonPageRoute("1", value), undefined, String(value));
    }
  });

  it("rejects disabled lessons and out-of-range pages", () => {
    assert.equal(resolveLessonNumber("2"), undefined);
    assert.equal(resolveLessonPageRoute("2", "1"), undefined);
    assert.equal(resolveLessonPageRoute("1", "99"), undefined);
    assert.equal(resolveLessonPageRoute("99", "1"), undefined);
  });
});
```

- [ ] **Step 2: Run the test and verify the expected RED failure**

Run:

```bash
node --test tests/lesson-routes.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/lesson-routes.js`.

- [ ] **Step 3: Implement the minimal route-resolution module**

Create `lib/lesson-routes.js`:

```js
// @ts-check

import {
  DEFAULT_LESSON_ID,
  LESSONS,
  isLessonPlayable,
} from "./lesson-data.js";

const POSITIVE_ROUTE_NUMBER = /^[1-9]\d*$/;

/**
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
function parseRouteNumber(value) {
  if (!value || !POSITIVE_ROUTE_NUMBER.test(value)) return undefined;

  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

/**
 * @param {number} lessonNumber
 * @param {number} pageNumber
 */
export function getLessonPagePath(lessonNumber, pageNumber) {
  return `/lessons/${lessonNumber}/pages/${pageNumber}`;
}

/** @param {string | undefined} lessonNumberValue */
export function resolveLessonNumber(lessonNumberValue) {
  const lessonNumber = parseRouteNumber(lessonNumberValue);
  if (lessonNumber === undefined) return undefined;

  const lesson = LESSONS[lessonNumber - 1];
  if (!isLessonPlayable(lesson)) return undefined;

  return { lesson, lessonNumber };
}

/**
 * @param {string | undefined} lessonNumberValue
 * @param {string | undefined} pageNumberValue
 */
export function resolveLessonPageRoute(
  lessonNumberValue,
  pageNumberValue
) {
  const resolvedLesson = resolveLessonNumber(lessonNumberValue);
  const pageNumber = parseRouteNumber(pageNumberValue);
  if (!resolvedLesson || pageNumber === undefined) return undefined;

  const pageIndex = pageNumber - 1;
  const step = resolvedLesson.lesson.steps[pageIndex];
  if (!step) return undefined;

  return {
    ...resolvedLesson,
    pageIndex,
    pageNumber,
    step,
  };
}

export function getDefaultLessonNumber() {
  const lessonIndex = LESSONS.findIndex(
    (lesson) => lesson.id === DEFAULT_LESSON_ID
  );

  if (lessonIndex < 0) {
    throw new Error(`Default lesson is missing: ${DEFAULT_LESSON_ID}`);
  }

  return lessonIndex + 1;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/lesson-routes.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit the route-resolution unit**

```bash
git add lib/lesson-routes.js tests/lesson-routes.test.mjs
git commit -m "feat: resolve numbered lesson page routes"
```

### Task 2: Let route changes select an idle lesson page

**Files:**
- Modify: `tests/lesson-state.test.mjs`
- Modify: `lib/lesson-state.js`

- [ ] **Step 1: Add the failing reducer test**

Append this case inside the existing `describe("lesson state", ...)` block in
`tests/lesson-state.test.mjs`:

```js
  it("selects a routed page and clears active lesson state", () => {
    const activeState = {
      ...createInitialLessonState(),
      phase: LessonPhase.Evaluating,
      stepIndex: 3,
      retryCount: 1,
      feedback: "Try again.",
      transcript: "wrong words",
      lastOutcome: "retry",
      pendingAudioBlob: new Blob(["child audio"], { type: "audio/webm" }),
    };

    const selected = reduce(activeState, {
      type: "SELECT_STEP",
      stepIndex: 1,
    });

    assert.deepEqual(selected, {
      ...createInitialLessonState(),
      stepIndex: 1,
    });
  });
```

- [ ] **Step 2: Run the reducer test and verify RED**

Run:

```bash
node --test tests/lesson-state.test.mjs
```

Expected: FAIL because `SELECT_STEP` currently returns the unchanged active
state.

- [ ] **Step 3: Add the route-selection event and initial index support**

In `lib/lesson-state.js`, add `SELECT_STEP` to the `LessonEvent` typedef:

```js
 * @typedef {{ type: "START" } | { type: "PAUSE" } | { type: "EXAMPLE_DONE" } | { type: "COACH_DONE" } | { type: "RECORDING_DONE", audioBlob: Blob } | { type: "EVALUATED", passed: boolean, feedbackText: string, transcript: string } | { type: "SYSTEM_ERROR", feedbackText: string } | { type: "NEXT" } | { type: "RETRY" } | { type: "RESET" } | { type: "SELECT_STEP", stepIndex: number } | { type: "SCENE_NEXT" } | { type: "SCENE_PREVIOUS" }} LessonEvent
```

Replace `createInitialLessonState` with:

```js
/**
 * @param {number} [stepIndex]
 * @returns {LessonState}
 */
export function createInitialLessonState(stepIndex = 0) {
  return {
    phase: LessonPhase.Idle,
    stepIndex,
    retryCount: 0,
    feedback: "",
    transcript: "",
    lastOutcome: "idle",
    lastPassed: false,
    pendingAudioBlob: null,
  };
}
```

Add this case immediately before `SCENE_NEXT` in `reduceLessonState`:

```js
    case "SELECT_STEP":
      return createInitialLessonState(
        Math.max(0, Math.min(event.stepIndex, totalSteps - 1))
      );
```

- [ ] **Step 4: Run reducer and route unit tests and verify GREEN**

Run:

```bash
node --test tests/lesson-state.test.mjs tests/lesson-routes.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit routed page selection**

```bash
git add lib/lesson-state.js tests/lesson-state.test.mjs
git commit -m "feat: select lesson pages from routes"
```

### Task 3: Install React Router and mount the browser router

**Files:**
- Create: `tests/lesson-routing-ui.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing router-bootstrap contract**

Create `tests/lesson-routing-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

describe("lesson routing UI", () => {
  it("mounts the app inside React Router", () => {
    assert.equal(typeof packageManifest.dependencies["react-router"], "string");
    assert.match(main, /import \{ BrowserRouter \} from "react-router"/);
    assert.match(main, /<BrowserRouter>/);
    assert.match(main, /<App \/>/);
    assert.match(main, /<\/BrowserRouter>/);
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test tests/lesson-routing-ui.test.mjs
```

Expected: FAIL because the `react-router` dependency and `BrowserRouter` wrapper
do not exist.

- [ ] **Step 3: Install React Router**

Run:

```bash
npm install react-router
```

Expected: `package.json` and `package-lock.json` record the current compatible
React Router release. Do not add React Router's framework or development
packages.

- [ ] **Step 4: Wrap the existing app in BrowserRouter**

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles.css";

async function bootstrap() {
  if (import.meta.env.VITE_PARROT_E2E === "1") {
    await import("./e2e-browser-mocks");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}

void bootstrap();
```

- [ ] **Step 5: Run the bootstrap contract and verify GREEN**

Run:

```bash
node --test tests/lesson-routing-ui.test.mjs
```

Expected: 1 test passes.

- [ ] **Step 6: Commit the router bootstrap**

```bash
git add package.json package-lock.json src/main.tsx tests/lesson-routing-ui.test.mjs
git commit -m "feat: mount app with react router"
```

### Task 4: Route the lesson list and player by numbered URL

**Files:**
- Modify: `tests/lesson-routing-ui.test.mjs`
- Modify: `tests/lesson-list-ui.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing route and navigation integration contracts**

Append these cases to `tests/lesson-routing-ui.test.mjs`:

```js
  it("declares list, lesson redirect, lesson page, and fallback routes", () => {
    assert.match(app, /<Routes>/);
    assert.match(app, /path="\/"/);
    assert.match(app, /path="\/lessons\/:lessonNumber"/);
    assert.match(app, /path="\/lessons\/:lessonNumber\/pages\/:pageNumber"/);
    assert.match(app, /path="\*"/);
    assert.match(app, /resolveLessonNumber\(lessonNumber\)/);
    assert.match(app, /resolveLessonPageRoute\(lessonNumber, pageNumber\)/);
    assert.match(app, /<Navigate to="\/" replace \/>/);
  });

  it("links lesson cards and page controls to canonical numbered paths", () => {
    assert.match(app, /<Link/);
    assert.match(app, /getLessonPagePath\(index \+ 1, 1\)/);
    assert.match(app, /onNavigatePage/);
    assert.match(
      app,
      /navigate\(\s*getLessonPagePath\(resolved\.lessonNumber/
    );
    assert.match(app, /initialStepIndex=\{resolved\.pageIndex\}/);
    assert.doesNotMatch(app, /type AppScreen/);
    assert.doesNotMatch(app, /setScreen/);
  });

  it("preserves e2e autostart while canonicalizing it to the first page", () => {
    assert.match(app, /parrotE2eAutostart=1/);
    assert.match(app, /getDefaultLessonNumber\(\)/);
    assert.match(app, /search: location\.search/);
  });

  it("resets player state when browser history selects another page", () => {
    assert.match(app, /type: "SELECT_STEP"/);
    assert.match(app, /stepIndex: initialStepIndex/);
    assert.match(app, /\[initialStepIndex, state\.stepIndex\]/);
  });
```

Replace the first two cases in `tests/lesson-list-ui.test.mjs` with:

```js
  it("uses routed lesson pages as the app entry while preserving e2e autostart", () => {
    assert.match(main, /import \{ BrowserRouter \} from "react-router"/);
    assert.match(main, /<BrowserRouter>/);
    assert.match(main, /<App \/>/);
    assert.match(app, /<Routes>/);
    assert.match(app, /parrotE2eAutostart=1/);
    assert.doesNotMatch(app, /type AppScreen/);
  });

  it("links the playable lesson and keeps unavailable lessons disabled", () => {
    const lessonData = readFileSync(
      new URL("../lib/lesson-data.js", import.meta.url),
      "utf8"
    );

    assert.match(lessonData, /from "\.\/lessons\.json"/);
    assert.match(lessonData, /export const LESSONS = catalog\.lessons/);
    assert.doesNotMatch(app, /const LESSON_LIST_ITEMS/);
    assert.match(app, /lessons=\{LESSONS\}/);
    assert.match(app, /to=\{getLessonPagePath\(index \+ 1, 1\)\}/);
    assert.match(app, /disabled/);
    assert.match(app, /aria-disabled="true"/);
  });
```

- [ ] **Step 2: Run the UI contracts and verify RED**

Run:

```bash
node --test tests/lesson-routing-ui.test.mjs tests/lesson-list-ui.test.mjs
```

Expected: FAIL because `App.tsx` still uses private screen state and buttons.

- [ ] **Step 3: Add React Router imports and route helpers**

Add this import near the top of `src/App.tsx`:

```tsx
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
```

Add this import after the lesson-data import:

```tsx
import {
  getDefaultLessonNumber,
  getLessonPagePath,
  resolveLessonNumber,
  resolveLessonPageRoute,
} from "../lib/lesson-routes";
```

Delete the `AppScreen` type. Add `SELECT_STEP` to the local `LessonEvent` union:

```tsx
  | { type: "SELECT_STEP"; stepIndex: number }
```

- [ ] **Step 4: Replace button-driven lesson selection with canonical links**

Replace `LessonListPage` with these focused components:

```tsx
function LessonCardContents({
  lesson,
  index,
}: {
  lesson: Lesson;
  index: number;
}) {
  return (
    <>
      <span className="lesson-card-index">{index + 1}</span>
      <span className="lesson-card-copy">
        <span className="lesson-card-title">{lesson.title}</span>
        <span className="lesson-card-subtitle">{lesson.subtitle}</span>
        <span className="lesson-card-description">{lesson.description}</span>
      </span>
      <span className="lesson-card-status">
        {isLessonPlayable(lesson) ? (
          <PlayCircle aria-hidden="true" strokeWidth={2.7} />
        ) : (
          <Lock aria-hidden="true" strokeWidth={2.7} />
        )}
        <span>{lesson.statusLabel}</span>
      </span>
    </>
  );
}

function LessonListPage({ lessons }: { lessons: Lesson[] }) {
  return (
    <main className="lesson-list-shell">
      <img
        alt=""
        className="lesson-list-background"
        draggable="false"
        src="/assets/backgrounds/meadow-day.webp"
      />

      <section
        aria-labelledby="lesson-list-title"
        className="lesson-list-content"
      >
        <div className="lesson-list-header">
          <span className="lesson-list-kicker">
            <BookOpen aria-hidden="true" strokeWidth={2.5} />
            Parrot English
          </span>
          <h1 id="lesson-list-title">Choose a lesson</h1>
          <p>选择一节课，和多莉一起开口说英语。</p>
        </div>

        <div className="lesson-list-grid">
          {lessons.map((lesson, index) => {
            const className = `lesson-list-card is-${lesson.status}`;
            const contents = (
              <LessonCardContents index={index} lesson={lesson} />
            );

            return isLessonPlayable(lesson) ? (
              <Link
                className={className}
                key={lesson.id}
                to={getLessonPagePath(index + 1, 1)}
              >
                {contents}
              </Link>
            ) : (
              <button
                aria-disabled="true"
                className={className}
                disabled
                key={lesson.id}
                type="button"
              >
                {contents}
              </button>
            );
          })}
        </div>
      </section>

      <img
        alt=""
        className="lesson-list-mascot"
        draggable="false"
        src={LESSON_SCENE_ASSETS.polly.idle.src}
      />
      <img
        alt=""
        className="lesson-list-host"
        draggable="false"
        src={LESSON_SCENE_ASSETS.peppa.wave.src}
      />
    </main>
  );
}
```

Add `text-decoration: none;` to the existing `.lesson-list-card` rule in
`src/styles.css` so the new links preserve the current visual treatment:

```css
  text-align: left;
  text-decoration: none;
```

- [ ] **Step 5: Replace private app screen state with route components**

Replace the current `App` function with:

```tsx
function LessonListRoute() {
  const location = useLocation();

  if (shouldOpenLessonPlayerDirectly()) {
    return (
      <Navigate
        replace
        to={{
          pathname: getLessonPagePath(getDefaultLessonNumber(), 1),
          search: location.search,
        }}
      />
    );
  }

  return <LessonListPage lessons={LESSONS} />;
}

function LessonRedirectRoute() {
  const location = useLocation();
  const { lessonNumber } = useParams();
  const resolved = resolveLessonNumber(lessonNumber);

  if (!resolved) return <Navigate to="/" replace />;

  return (
    <Navigate
      replace
      to={{
        pathname: getLessonPagePath(resolved.lessonNumber, 1),
        search: location.search,
      }}
    />
  );
}

function LessonPageRoute() {
  const navigate = useNavigate();
  const { lessonNumber, pageNumber } = useParams();
  const resolved = resolveLessonPageRoute(lessonNumber, pageNumber);

  if (!resolved) return <Navigate to="/" replace />;

  return (
    <LessonPlayer
      initialStepIndex={resolved.pageIndex}
      key={resolved.lesson.id}
      lesson={resolved.lesson}
      onBackToList={() => navigate("/")}
      onNavigatePage={(nextPageIndex) =>
        navigate(
          getLessonPagePath(resolved.lessonNumber, nextPageIndex + 1)
        )
      }
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<LessonListRoute />} path="/" />
      <Route
        element={<LessonRedirectRoute />}
        path="/lessons/:lessonNumber"
      />
      <Route
        element={<LessonPageRoute />}
        path="/lessons/:lessonNumber/pages/:pageNumber"
      />
      <Route element={<Navigate to="/" replace />} path="*" />
    </Routes>
  );
}
```

- [ ] **Step 6: Initialize and synchronize LessonPlayer with the routed page**

Replace `LessonPlayerProps` with:

```tsx
type LessonPlayerProps = {
  initialStepIndex?: number;
  lesson?: Lesson;
  onBackToList?: () => void;
  onNavigatePage?: (pageIndex: number) => void;
};
```

Update the `LessonPlayer` signature:

```tsx
export function LessonPlayer({
  initialStepIndex = 0,
  lesson = getDefaultLesson(),
  onBackToList,
  onNavigatePage,
}: LessonPlayerProps = {}) {
```

Use the routed index as the reducer initializer:

```tsx
  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent
    ) => reduceLessonState(currentState, event, lesson.steps.length),
    initialStepIndex,
    createInitialLessonState
  );
```

Add this effect after the reducer initialization so Back/Forward clears active
state only when it selects a different page:

```tsx
  useEffect(() => {
    if (state.stepIndex === initialStepIndex) return;

    dispatch({ type: "SELECT_STEP", stepIndex: initialStepIndex });
  }, [initialStepIndex, state.stepIndex]);
```

Replace `navigateScene` with:

```tsx
  function navigateScene(type: "SCENE_NEXT" | "SCENE_PREVIOUS") {
    setError("");

    const nextStepIndex =
      type === "SCENE_NEXT"
        ? Math.min(state.stepIndex + 1, lesson.steps.length - 1)
        : Math.max(state.stepIndex - 1, 0);

    if (
      type === "SCENE_NEXT" &&
      state.phase === LessonPhase.Feedback &&
      state.lastOutcome === "advance"
    ) {
      dispatch({ type: "NEXT" });
    } else {
      dispatch({ type });
    }

    if (nextStepIndex !== state.stepIndex) {
      onNavigatePage?.(nextStepIndex);
    }
  }
```

- [ ] **Step 7: Run the focused routing, list, and state tests**

Run:

```bash
node --test tests/lesson-routing-ui.test.mjs tests/lesson-list-ui.test.mjs tests/lesson-routes.test.mjs tests/lesson-state.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 8: Run TypeScript and lint checks for the integrated route code**

Run:

```bash
npm run build
npm run lint
```

Expected: both commands exit 0 with no TypeScript, Vite, or ESLint errors.

- [ ] **Step 9: Commit the routed lesson UI**

```bash
git add src/App.tsx src/styles.css tests/lesson-routing-ui.test.mjs tests/lesson-list-ui.test.mjs
git commit -m "feat: route lesson pages by number"
```

### Task 5: Update architecture notes and run final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/design/product-experience.md`

- [ ] **Step 1: Document the public route contract**

Add this paragraph after the frontend/backend overview in `README.md`:

```markdown
The lesson list is available at `/`. Playable lesson pages use one-based URLs
such as `/lessons/1/pages/1`; `/lessons/1` redirects to the first page. The
Cloudflare asset configuration serves the SPA entrypoint for direct requests to
these nested URLs.
```

Add this section after `Runtime Shape` in
`docs/design/technical-architecture.md`:

```markdown
## Client Routing

React Router runs in Declarative Mode. The public route contract is:

- `/`: lesson list.
- `/lessons/:lessonNumber`: canonical redirect to page 1.
- `/lessons/:lessonNumber/pages/:pageNumber`: selected playable lesson page.

Numbers are one-based catalog positions. `lib/lesson-routes.js` validates route
parameters against `lib/lessons.json`. Invalid, unavailable, and out-of-range
routes redirect to `/`. Cloudflare's single-page-application asset fallback
supports direct navigation and refreshes on nested routes.
```

Append this paragraph to `Navigation Rules` in
`docs/design/product-experience.md`:

```markdown
Each lesson page has a one-based URL such as `/lessons/1/pages/2`. Lesson cards
open page 1, scene controls update the URL, and browser Back/Forward restores
the addressed page in its idle state. The URL selects the lesson page while the
lesson state machine controls the speaking phase within that page.
```

- [ ] **Step 2: Run the complete unit suite**

Run:

```bash
npm test
```

Expected: all tests pass with no failures.

- [ ] **Step 3: Run final lint and production build verification**

Run:

```bash
npm run lint
npm run build
```

Expected: lint exits 0 and Vite produces `dist` successfully after TypeScript
passes.

- [ ] **Step 4: Inspect the final diff for scope and generated output**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD
```

Expected: only the planned source, test, manifest, lockfile, and documentation
changes remain; `dist` is not staged; `git diff --check` prints nothing.

- [ ] **Step 5: Commit documentation and any final test adjustments**

```bash
git add README.md docs/design/technical-architecture.md docs/design/product-experience.md
git commit -m "docs: describe numbered lesson routes"
```
