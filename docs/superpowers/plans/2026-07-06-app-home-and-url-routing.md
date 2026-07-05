# App Home and URL Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-card authenticated home, stable URLs for every durable app screen, a combined Parrot/My lesson catalog, and source-specific lesson-scene deep links with reliable browser history.

**Architecture:** Mount React Router once, keep authentication and onboarding as route-aware guards, and make the URL authoritative for the active durable screen and lesson scene. Keep transient onboarding answers and lesson playback/recording phases in component state, with explicit activity invalidation whenever a routed scene changes.

**Tech Stack:** React 19, React Router 7.18.1, TypeScript, Vite 8, Node test runner, Better Auth, Cloudflare Worker/D1, CSS

---

## File Map

### New files

- `src/app-routes.ts` — canonical path builders, safe return-path parsing, and Parrot lesson-scene resolution.
- `src/HomeMenu.tsx` — the four equal authenticated home links.
- `src/FeaturePlaceholder.tsx` — shared Create a Lesson, Progress, and Storytelling skeleton layout.
- `lib/lesson-route-activity.js` — generation guard that invalidates async lesson work on routed scene changes.
- `lib/lesson-route-transition.js` — pure detection of reducer events that move to another routed scene.
- `tests/app-routes.test.mjs` — route builder, parser, resolver, and safe-return tests.
- `tests/app-shell-ui.test.mjs` — executable home, placeholder, login redirect, and top-level route contracts.
- `tests/lesson-route-activity.test.mjs` — stale async completion regression test.
- `tests/lesson-route-transition.test.mjs` — scene-changing event tests against the current scene-script lesson model.

### Modified files

- `package.json`, `package-lock.json` — add the React Router dependency.
- `src/main.tsx` — mount `BrowserRouter` around `App`.
- `src/AuthGate.tsx` — allow a route redirect to replace the login form on protected URLs while preserving the existing injectable/testable gate.
- `src/OnboardingGate.tsx` — drive onboarding/profile visibility from their URLs and navigate Profile actions instead of opening an unaddressed overlay.
- `src/App.tsx` — replace reducer-only app navigation with declarative routes and source-specific lesson scene adapters; synchronize the player with routed scenes.
- `src/LessonList.tsx` — use real links, add Parrot Lessons and My Lessons sections, and add Back to main menu.
- `lib/lesson-state.js` — add a route-scene selection event that resets transient player state at a validated scene.
- `src/styles.css` — home, feature skeleton, catalog section, empty-state, main-menu action, and responsive/focus styles.
- `tests/auth-ui.test.mjs` — preserve existing auth behavior and prove signed-out route fallbacks.
- `tests/onboarding-ui.test.mjs` — prove route-driven profile/onboarding composition.
- `tests/lesson-list-page.test.mjs`, `tests/lesson-list-ui.test.mjs` — assert the two catalog sections and canonical links.
- `tests/lesson-state.test.mjs`, `tests/lesson-controls-ui.test.mjs` — cover routed scene selection and route-safe player dispatch.
- `docs/design/product-experience.md`, `docs/design/technical-architecture.md`, `docs/README.md` — document the new home and URL ownership.

## Task 1: Add Route Primitives and Router Bootstrap

**Files:**
- Create: `src/app-routes.ts`
- Create: `tests/app-routes.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing route tests**

Create `tests/app-routes.test.mjs` with executable tests for every canonical path and invalid value:

```js
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const routes = await vite.ssrLoadModule("/src/app-routes.ts").catch(() => ({}));

after(async () => vite.close());

describe("app route helpers", () => {
  it("builds source-specific lesson paths", () => {
    assert.equal(routes.getLessonPath("parrot", "01-peppas-high-ball"), "/lessons/parrot/01-peppas-high-ball");
    assert.equal(routes.getLessonScenePath("parrot", "01-peppas-high-ball", 0), "/lessons/parrot/01-peppas-high-ball/scenes/1");
    assert.equal(routes.getLessonScenePath("my", "same-id", 2), "/lessons/my/same-id/scenes/3");
  });

  it("resolves a stable Parrot lesson ID and one-based scene", () => {
    const resolved = routes.resolveParrotLessonScene("01-peppas-high-ball", "2");
    assert.equal(resolved.entry.id, "01-peppas-high-ball");
    assert.equal(resolved.sceneIndex, 1);
  });

  it("rejects unknown lessons and non-canonical scene values", () => {
    for (const value of [undefined, "", "0", "-1", "01", "1.5", "x", "9007199254740992"]) {
      assert.equal(routes.resolveParrotLessonScene("01-peppas-high-ball", value), null);
    }
    assert.equal(routes.resolveParrotLessonScene("missing", "1"), null);
    assert.equal(routes.resolveParrotLessonScene("01-peppas-high-ball", "99"), null);
  });

  it("accepts only known same-origin return paths", () => {
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Fprogress"), "/progress");
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Flessons%2Fparrot%2F01-peppas-high-ball%2Fscenes%2F2"), "/lessons/parrot/01-peppas-high-ball/scenes/2");
    assert.equal(routes.getSafeReturnTo("?returnTo=https%3A%2F%2Fevil.example"), null);
    assert.equal(routes.getSafeReturnTo("?returnTo=%2F%2Fevil.example"), null);
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Flogin"), null);
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Fonboarding"), null);
  });
});
```

- [ ] **Step 2: Run the route test and confirm RED**

Run: `node --test tests/app-routes.test.mjs`

Expected: FAIL because `/src/app-routes.ts` does not exist and its exports are undefined.

- [ ] **Step 3: Implement the route boundary**

Create `src/app-routes.ts` with the exact public interface exercised above:

```ts
import { LESSONS, type LessonCatalogEntry } from "./lesson-catalog";

export type LessonSource = "parrot" | "my";

const SAFE_RETURN_PATH = /^(?:\/$|\/profile(?:[/?]|$)|\/lessons(?:[/?]|$)|\/progress(?:[/?]|$)|\/stories(?:[/?]|$))/;
const PARROT_LESSONS = new Map(LESSONS.map((entry) => [entry.id, entry]));

function parseSceneNumber(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getLessonPath(source: LessonSource, lessonId: string) {
  return `/lessons/${source}/${encodeURIComponent(lessonId)}`;
}

export function getLessonScenePath(
  source: LessonSource,
  lessonId: string,
  sceneIndex: number,
) {
  return `${getLessonPath(source, lessonId)}/scenes/${sceneIndex + 1}`;
}

export function getLoginPath(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getOnboardingPath(returnTo: string) {
  return `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeReturnTo(search: string) {
  const value = new URLSearchParams(search).get("returnTo");
  return value && !value.startsWith("//") && SAFE_RETURN_PATH.test(value)
    ? value
    : null;
}

export function resolveParrotLesson(lessonId: string | undefined) {
  return lessonId ? PARROT_LESSONS.get(lessonId) ?? null : null;
}

export function resolveParrotLessonScene(
  lessonId: string | undefined,
  sceneNumberValue: string | undefined,
): { entry: LessonCatalogEntry; sceneIndex: number } | null {
  const entry = resolveParrotLesson(lessonId);
  const sceneNumber = parseSceneNumber(sceneNumberValue);
  if (!entry || sceneNumber === null || sceneNumber > entry.lesson.scenes.length) {
    return null;
  }
  return { entry, sceneIndex: sceneNumber - 1 };
}
```

- [ ] **Step 4: Run the route test and confirm GREEN**

Run: `node --test tests/app-routes.test.mjs`

Expected: PASS for path generation, source separation, route resolution, and return-path safety.

- [ ] **Step 5: Request package-install approval, then add React Router**

This repository requires explicit approval before package installs. After approval, run:

```bash
npm install react-router@7.18.1
```

Expected: `package.json` and `package-lock.json` add React Router 7.18.1 without changing the pinned React 19.2.6 version.

- [ ] **Step 6: Mount the browser router**

Update `src/main.tsx` so the render tree is:

```tsx
import { BrowserRouter } from "react-router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

Keep the existing E2E mock bootstrap before rendering.

- [ ] **Step 7: Verify and commit the route foundation**

Run:

```bash
node --test tests/app-routes.test.mjs
npx tsc --noEmit
```

Expected: both commands pass.

Commit:

```bash
git add package.json package-lock.json src/main.tsx src/app-routes.ts tests/app-routes.test.mjs
git commit -m "feat: add application route foundation"
```

## Task 2: Make Authentication URL-Aware

**Files:**
- Modify: `src/AuthGate.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/auth-ui.test.mjs`
- Create: `tests/app-shell-ui.test.mjs`

- [ ] **Step 1: Write failing auth redirect tests**

Extend the `renderAuthGate` default props in `tests/auth-ui.test.mjs` with `signedOutFallback: null`, then add:

```js
test("signed-out route fallbacks replace the form after session checks finish", () => {
  const html = renderAuthGate({
    signedOutFallback: createElement("span", { "data-login-redirect": true }, "REDIRECT"),
  });
  assert.match(html, /data-login-redirect/);
  assert.doesNotMatch(html, /name="email"/);
});

test("pending and failed session checks take priority over redirects", () => {
  const fallback = createElement("span", null, "REDIRECT");
  assert.match(renderAuthGate({ isPending: true, signedOutFallback: fallback }), /正在检查登录状态/);
  assert.match(renderAuthGate({ sessionError: new Error("offline"), signedOutFallback: fallback }), /登录服务暂时不可用/);
});
```

Create `tests/app-shell-ui.test.mjs` and initially assert the source contract:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("URL-aware app shell", () => {
  it("redirects signed-out protected URLs through the login route", () => {
    assert.match(app, /getLoginPath/);
    assert.match(app, /signedOutFallback/);
    assert.match(app, /<Navigate[^>]*replace/);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test tests/auth-ui.test.mjs tests/app-shell-ui.test.mjs`

Expected: FAIL because `AuthGateViewProps` and `AuthGateProps` do not accept `signedOutFallback` and `App` has no redirect.

- [ ] **Step 3: Add the injectable signed-out fallback**

In `src/AuthGate.tsx`:

```tsx
interface AuthGateViewProps {
  // keep every existing property
  signedOutFallback: ReactNode | null;
}

interface AuthGateProps {
  children: ReactNode;
  signedOutFallback?: ReactNode;
}
```

After pending and session-error branches, but before rendering the form:

```tsx
if (!session && signedOutFallback) {
  return <>{signedOutFallback}</>;
}
```

Pass `signedOutFallback ?? null` from `AuthGateContainer` into `View`. Keep the factory default behavior unchanged so existing direct `AuthGateView` and `createAuthGate` tests continue to work.

- [ ] **Step 4: Add the route-aware shell boundary**

In `src/App.tsx`, import `Navigate`, `useLocation`, and the helpers. Wrap the current authenticated content with a component that preserves path, query, and hash:

```tsx
function RoutedApplication() {
  const location = useLocation();
  const currentTarget = `${location.pathname}${location.search}${location.hash}`;
  const onLoginRoute = location.pathname === "/login";

  return (
    <AuthGate
      signedOutFallback={
        onLoginRoute ? null : (
          <Navigate replace to={getLoginPath(currentTarget)} />
        )
      }
    >
      <OnboardingGate>
        <LessonExperience />
      </OnboardingGate>
    </AuthGate>
  );
}

export function App() {
  return <RoutedApplication />;
}
```

Task 3 will replace `LessonExperience` with the complete route tree; this task establishes the auth redirect without changing lesson behavior.

- [ ] **Step 5: Re-run the focused and regression tests**

Run:

```bash
node --test tests/auth-ui.test.mjs tests/app-shell-ui.test.mjs
node --test tests/auth-form.test.mjs tests/auth-infrastructure.test.mjs
```

Expected: all tests pass, including the existing injectable AuthGate factory coverage.

- [ ] **Step 6: Commit URL-aware authentication**

```bash
git add src/AuthGate.tsx src/App.tsx tests/auth-ui.test.mjs tests/app-shell-ui.test.mjs
git commit -m "feat: route signed-out users through login"
```

## Task 3: Add Home, Skeleton Routes, and Route-Aware Onboarding/Profile

**Files:**
- Create: `src/HomeMenu.tsx`
- Create: `src/FeaturePlaceholder.tsx`
- Modify: `src/App.tsx`
- Modify: `src/OnboardingGate.tsx`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/onboarding-ui.test.mjs`

- [ ] **Step 1: Write failing executable page tests**

Extend `tests/app-shell-ui.test.mjs` to load React components through Vite and render them inside `MemoryRouter`:

```js
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after } from "node:test";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { HomeMenu } = await vite.ssrLoadModule("/src/HomeMenu.tsx").catch(() => ({}));
const { FeaturePlaceholder } = await vite.ssrLoadModule("/src/FeaturePlaceholder.tsx").catch(() => ({}));
after(async () => vite.close());

function inRouter(element) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/"] }, element));
}

it("renders four equal home destinations", () => {
  const html = inRouter(createElement(HomeMenu));
  assert.equal((html.match(/class="home-menu-card/g) ?? []).length, 4);
  assert.match(html, /href="\/lessons"/);
  assert.match(html, /href="\/lessons\/my\/create"/);
  assert.match(html, /href="\/progress"/);
  assert.match(html, /href="\/stories"/);
});

it("renders a feature skeleton with a main-menu link", () => {
  const html = inRouter(createElement(FeaturePlaceholder, {
    description: "Your progress will appear here.",
    eyebrow: "Parrot English",
    title: "Progress",
  }));
  assert.match(html, /<h1[^>]*>Progress<\/h1>/);
  assert.match(html, /href="\/"/);
  assert.match(html, /Back to main menu/);
});
```

Update the old onboarding composition assertion so it expects `RoutedApplication` and explicit onboarding/profile route props rather than the obsolete literal `<AuthGate><OnboardingGate><LessonExperience />` nesting.

- [ ] **Step 2: Run the page/onboarding tests and confirm RED**

Run: `node --test tests/app-shell-ui.test.mjs tests/onboarding-ui.test.mjs`

Expected: FAIL because the new page components and route-aware onboarding props do not exist.

- [ ] **Step 3: Implement the four-card home**

Create `src/HomeMenu.tsx` with one data-driven card list and real links:

```tsx
import { BookOpen, Play, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";

const ITEMS = [
  { description: "Choose a Parrot lesson or one made for you.", icon: Play, title: "Lessons", to: "/lessons" },
  { description: "Make a personalized English adventure.", icon: Plus, title: "Create a Lesson", to: "/lessons/my/create" },
  { description: "See your practice and learning progress.", icon: Sparkles, title: "Progress", to: "/progress" },
  { description: "Practice English through playful stories.", icon: BookOpen, title: "Storytelling", to: "/stories" },
] as const;

export function HomeMenu() {
  return (
    <main className="home-menu-page">
      <header className="home-menu-header">
        <p className="home-menu-eyebrow">PARROT ENGLISH</p>
        <h1>What would you like to do?</h1>
      </header>
      <nav aria-label="Learning activities" className="home-menu-grid">
        {ITEMS.map(({ description, icon: Icon, title, to }) => (
          <Link className="home-menu-card" key={to} to={to}>
            <Icon aria-hidden="true" />
            <h2>{title}</h2>
            <p>{description}</p>
          </Link>
        ))}
      </nav>
    </main>
  );
}
```

- [ ] **Step 4: Implement the shared skeleton**

Create `src/FeaturePlaceholder.tsx`:

```tsx
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router";

export function FeaturePlaceholder({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="feature-placeholder-page">
      <section className="feature-placeholder-card">
        <span className="feature-placeholder-icon"><Sparkles aria-hidden="true" /></span>
        <p className="feature-placeholder-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="main-menu-link" to="/">
          <ArrowLeft aria-hidden="true" /> Back to main menu
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Make onboarding and profile route-driven**

Change `OnboardingGate` to accept this routing interface:

```ts
type OnboardingGateProps = {
  children: ReactNode;
  completedOnboardingFallback: ReactNode;
  isOnboardingRoute: boolean;
  isProfileRoute: boolean;
  onboardingFallback: ReactNode;
  onCloseProfileRoute: () => void;
  onOpenProfileRoute: () => void;
};
```

Keep `OnboardingGateView` pure. In the container:

- return `onboardingFallback` when the loaded profile is incomplete and the URL is not `/onboarding`;
- return `completedOnboardingFallback` when onboarding is complete and the URL is `/onboarding`;
- call the existing `handleOpenProfile()` from an effect when `isProfileRoute && canEditProfile` becomes true;
- use `onOpenProfileRoute` for the account Profile action;
- make profile Save, Cancel, and Close clear profile state and call `onCloseProfileRoute`;
- while `/profile` is loading its questions, render the existing onboarding status-card treatment rather than protected children.

After all hooks and route-loading effects have run, apply the route decisions before returning `OnboardingGateView`:

```tsx
const onboardingComplete = Boolean(
  fullData &&
    (fullData.canBypass ||
      fullData.profile.onboardingStatus === "completed"),
);

if (data && !onboardingComplete && !isOnboardingRoute) {
  return <>{onboardingFallback}</>;
}

if (onboardingComplete && isOnboardingRoute) {
  return <>{completedOnboardingFallback}</>;
}

if (isProfileRoute && canEditProfile && !profileState) {
  return (
    <main className="onboarding-screen">
      <section
        aria-busy={!profileLoadError}
        className="onboarding-status-card"
        role={profileLoadError ? "alert" : "status"}
      >
        {profileLoadError ? (
          <>
            <h1>Profile is taking a break</h1>
            <p>{profileLoadError}</p>
            <button onClick={() => void handleOpenProfile()} type="button">Retry</button>
            <button onClick={onCloseProfileRoute} type="button">Back to main menu</button>
          </>
        ) : (
          <p>Loading your profile…</p>
        )}
      </section>
    </main>
  );
}
```

Wrap the existing local cleanup so closing the editor also changes the URL:

```tsx
const closeRoutedProfileEditor = useCallback(() => {
  closeProfileEditor();
  onCloseProfileRoute();
}, [closeProfileEditor, onCloseProfileRoute]);
```

Use `closeRoutedProfileEditor` for Save, Cancel, and Close. Build the account action with `onOpen: onOpenProfileRoute`; loading remains the `/profile` route's responsibility.

Use a stable callback for the route-open effect:

```tsx
useEffect(() => {
  if (!isProfileRoute || !canEditProfile || profileState || profileLoadError) return;
  void handleOpenProfile();
}, [canEditProfile, handleOpenProfile, isProfileRoute, profileLoadError, profileState]);
```

- [ ] **Step 6: Replace the app's in-memory top-level navigation with routes**

In `src/App.tsx`, remove `app-navigation` imports and `LessonExperience`. Add `Routes`, `Route`, `Navigate`, `useLocation`, and `useNavigate`. The authenticated route tree must contain:

```tsx
<Routes>
  <Route element={<HomeMenu />} path="/" />
  <Route
    element={
      <LessonList
        onOpenLesson={(lessonId) =>
          navigate(getLessonScenePath("parrot", lessonId, 0))
        }
      />
    }
    path="/lessons"
  />
  <Route element={<FeaturePlaceholder eyebrow="MY LESSONS" title="Create a Lesson" description="Soon, you will be able to make a personalized English lesson here." />} path="/lessons/my/create" />
  <Route element={<FeaturePlaceholder eyebrow="YOUR LEARNING" title="Progress" description="Your lesson practice and learning progress will appear here." />} path="/progress" />
  <Route element={<FeaturePlaceholder eyebrow="STORY TIME" title="Storytelling" description="Soon, you will be able to learn English through your own stories." />} path="/stories" />
  <Route element={<Navigate replace to={getSafeReturnTo(location.search) ?? "/"} />} path="/login" />
  <Route element={null} path="/onboarding" />
  <Route element={null} path="/profile" />
  <Route element={<Navigate replace to="/" />} path="*" />
</Routes>
```

The callback above is an incremental compatibility bridge for the current
button-based `LessonList`; Task 4 replaces it with real links and removes the
prop.

Pass route decisions into `OnboardingGate`:

```tsx
const safeReturnTo = getSafeReturnTo(location.search) ?? "/";
const requestedProtectedTarget =
  location.pathname === "/login" || location.pathname === "/onboarding"
    ? safeReturnTo
    : currentTarget;

<OnboardingGate
  completedOnboardingFallback={<Navigate replace to={safeReturnTo} />}
  isOnboardingRoute={location.pathname === "/onboarding"}
  isProfileRoute={location.pathname === "/profile"}
  onboardingFallback={
    <Navigate replace to={getOnboardingPath(requestedProtectedTarget)} />
  }
  onCloseProfileRoute={() => navigate("/")}
  onOpenProfileRoute={() => navigate("/profile")}
>
  {routes}
</OnboardingGate>
```

Do not create separate question routes. Preserve a requested protected destination across `/login` and `/onboarding`.

- [ ] **Step 7: Run focused tests and type checking**

Run:

```bash
node --test tests/app-shell-ui.test.mjs tests/onboarding-ui.test.mjs tests/auth-ui.test.mjs
npx tsc --noEmit
```

Expected: all tests and type checking pass.

- [ ] **Step 8: Commit durable app routes**

```bash
git add src/App.tsx src/HomeMenu.tsx src/FeaturePlaceholder.tsx src/OnboardingGate.tsx tests/app-shell-ui.test.mjs tests/onboarding-ui.test.mjs
git commit -m "feat: add routed learning home"
```

## Task 4: Split the Combined Catalog into Parrot Lessons and My Lessons

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/LessonList.tsx`
- Modify: `tests/lesson-list-page.test.mjs`
- Modify: `tests/lesson-list-ui.test.mjs`

- [ ] **Step 1: Update the executable catalog test to fail on the old UI**

Wrap `LessonList` in `MemoryRouter` and remove the old `onOpenLesson` callback. Assert:

```js
const html = renderToStaticMarkup(
  createElement(
    MemoryRouter,
    { initialEntries: ["/lessons"] },
    createElement(LessonList),
  ),
);

assert.match(html, /<h2[^>]*>Parrot Lessons<\/h2>/);
assert.match(html, /<h2[^>]*>My Lessons<\/h2>/);
assert.equal((html.match(/\/lessons\/parrot\//g) ?? []).length, 7);
assert.match(html, /href="\/lessons\/my\/create"/);
assert.match(html, /You haven&#x27;t created any lessons yet\./);
assert.match(html, /href="\/"/);
```

Update `tests/lesson-list-ui.test.mjs` to remove the reducer-only `activeLessonId` assertions and require `Link`, `getLessonScenePath("parrot", lesson.id, 0)`, and both source headings.

- [ ] **Step 2: Run catalog tests and confirm RED**

Run: `node --test tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs`

Expected: FAIL because the current list uses buttons, has one unnamed section, and has no My Lessons empty state.

- [ ] **Step 3: Implement the combined but separated catalog**

Change `LessonList` to take no navigation callback. Import `Link`, `ArrowLeft`, `Plus`, and `getLessonScenePath`. Keep the existing card artwork/content, replacing each Start button with:

```tsx
<Link
  aria-label={`Start ${lesson.title}`}
  className="lesson-card-action"
  to={getLessonScenePath("parrot", lesson.id, 0)}
>
  <Play aria-hidden="true" /> Start lesson
</Link>
```

Structure the page as:

```tsx
<main className="lesson-list-page">
  <Link className="main-menu-link lesson-main-menu-link" to="/">
    <ArrowLeft aria-hidden="true" /> Back to main menu
  </Link>
  <header className="lesson-list-header">...</header>
  <section aria-labelledby="parrot-lessons-title" className="lesson-catalog-section">
    <h2 id="parrot-lessons-title">Parrot Lessons</h2>
    <div className="lesson-card-grid">{cards}</div>
  </section>
  <section aria-labelledby="my-lessons-title" className="lesson-catalog-section my-lessons-section">
    <h2 id="my-lessons-title">My Lessons</h2>
    <div className="my-lessons-empty">
      <p>You haven't created any lessons yet.</p>
      <Link to="/lessons/my/create"><Plus aria-hidden="true" /> Create a lesson</Link>
    </div>
  </section>
</main>
```

In the `/lessons` route in `src/App.tsx`, replace the temporary callback form
with `<LessonList />`.

- [ ] **Step 4: Run the catalog tests and confirm GREEN**

Run: `node --test tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs tests/lesson-catalog.test.mjs`

Expected: PASS; all seven current JSON lessons remain visible and playable under Parrot Lessons.

- [ ] **Step 5: Commit the catalog update**

```bash
git add src/App.tsx src/LessonList.tsx tests/lesson-list-page.test.mjs tests/lesson-list-ui.test.mjs
git commit -m "feat: separate Parrot and learner lesson lists"
```

## Task 5: Add Canonical Lesson and Scene Routes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/app-routes.ts`
- Modify: `tests/app-routes.test.mjs`
- Modify: `tests/app-shell-ui.test.mjs`

- [ ] **Step 1: Add failing short-route and source-route tests**

Extend `tests/app-routes.test.mjs`:

```js
it("builds the canonical first scene for a short Parrot lesson URL", () => {
  const entry = routes.resolveParrotLesson("01-peppas-high-ball");
  assert.equal(
    routes.getLessonScenePath("parrot", entry.id, 0),
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
  );
});

it("does not resolve My Lesson content before its persistence boundary exists", () => {
  assert.equal(routes.resolveMyLessonScene("anything", "1"), null);
});
```

Extend `tests/app-shell-ui.test.mjs` source assertions to require route patterns for both lesson sources and a canonical short-route redirect.

- [ ] **Step 2: Run focused route tests and confirm RED**

Run: `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs`

Expected: FAIL because `resolveMyLessonScene` and lesson route elements do not exist.

- [ ] **Step 3: Add the explicit future My Lesson resolver boundary**

In `src/app-routes.ts` add:

```ts
export function resolveMyLessonScene(
  _lessonId: string | undefined,
  _sceneNumberValue: string | undefined,
) {
  return null;
}
```

This deliberate null boundary prevents fake data or cross-user lookup. A future persistence feature will replace it with an authenticated API-backed loader.

- [ ] **Step 4: Add lesson route adapters**

In `src/App.tsx`, add:

```tsx
function ParrotLessonRedirect() {
  const { lessonId } = useParams();
  const entry = resolveParrotLesson(lessonId);
  return entry
    ? <Navigate replace to={getLessonScenePath("parrot", entry.id, 0)} />
    : <Navigate replace to="/lessons" />;
}

function MyLessonRouteUnavailable() {
  return <Navigate replace to="/lessons" />;
}
```

Add these routes before the wildcard:

```tsx
<Route element={<ParrotLessonRedirect />} path="/lessons/parrot/:lessonId" />
<Route element={<ParrotLessonSceneRoute />} path="/lessons/parrot/:lessonId/scenes/:sceneNumber" />
<Route element={<MyLessonRouteUnavailable />} path="/lessons/my/:lessonId" />
<Route element={<MyLessonRouteUnavailable />} path="/lessons/my/:lessonId/scenes/:sceneNumber" />
```

`ParrotLessonSceneRoute` first resolves the lesson ID, then resolves the scene. An unknown lesson navigates to `/lessons`; an invalid scene for a known lesson navigates with replacement to that lesson's first scene. A valid route renders `LessonPlayer` keyed by `parrot:${entry.id}` and passes `routedSceneIndex`, `onBack`, `onHome`, and `onNavigateScene` callbacks. Use `getLessonScenePath` in every callback:

```tsx
function ParrotLessonSceneRoute() {
  const navigate = useNavigate();
  const { lessonId, sceneNumber } = useParams();
  const entry = resolveParrotLesson(lessonId);
  if (!entry) return <Navigate replace to="/lessons" />;

  const resolved = resolveParrotLessonScene(lessonId, sceneNumber);
  if (!resolved) {
    return (
      <Navigate
        replace
        to={getLessonScenePath("parrot", entry.id, 0)}
      />
    );
  }

  return (
    <LessonPlayer
      key={`parrot:${entry.id}`}
      lesson={entry.lesson}
      onBack={() => navigate("/lessons")}
      onHome={() => navigate("/")}
      onNavigateScene={(sceneIndex) =>
        navigate(getLessonScenePath("parrot", entry.id, sceneIndex))
      }
      routedSceneIndex={resolved.sceneIndex}
    />
  );
}
```

Extend `LessonPlayerProps` at this task so the route adapter type-checks, and
initialize a direct deep link at its addressed scene:

```tsx
type LessonPlayerProps = {
  lesson: Lesson;
  onBack: () => void;
  onHome: () => void;
  onNavigateScene: (sceneIndex: number) => void;
  routedSceneIndex: number;
};

const [state, dispatch] = useReducer(
  (
    currentState: ReturnType<typeof createInitialLessonState>,
    event: LessonEvent,
  ) => reduceLessonState(currentState, event, currentLesson),
  { ...createInitialLessonState(), sceneIndex: routedSceneIndex },
);
```

Task 6 makes later parameter changes authoritative and connects internal scene
events to `onNavigateScene`; this initializer covers direct first render.

- [ ] **Step 5: Verify the route adapter and commit**

Run:

```bash
node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs
npx tsc --noEmit
```

Expected: PASS.

Commit:

```bash
git add src/App.tsx src/app-routes.ts tests/app-routes.test.mjs tests/app-shell-ui.test.mjs
git commit -m "feat: add source-specific lesson routes"
```

## Task 6: Synchronize Lesson State with Routed Scenes Safely

**Files:**
- Create: `lib/lesson-route-activity.js`
- Create: `lib/lesson-route-transition.js`
- Create: `tests/lesson-route-activity.test.mjs`
- Create: `tests/lesson-route-transition.test.mjs`
- Modify: `lib/lesson-state.js`
- Modify: `src/App.tsx`
- Modify: `tests/lesson-state.test.mjs`
- Modify: `tests/lesson-controls-ui.test.mjs`

- [ ] **Step 1: Write the failing activity guard test**

Create `tests/lesson-route-activity.test.mjs`:

```js
import assert from "node:assert/strict";
import { it } from "node:test";
import { createLessonRouteActivityGuard } from "../lib/lesson-route-activity.js";

it("rejects completions captured before a routed scene change", () => {
  const guard = createLessonRouteActivityGuard();
  const oldScene = guard.capture();
  assert.equal(guard.isCurrent(oldScene), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(oldScene), false);
  assert.equal(guard.isCurrent(guard.capture()), true);
});
```

- [ ] **Step 2: Write the failing transition and reducer tests**

Create `tests/lesson-route-transition.test.mjs` with a minimal two-scene lesson that exercises the current reducer contract:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LessonPhase,
  createInitialLessonState,
} from "../lib/lesson-state.js";
import { getLessonEventTargetSceneIndex } from "../lib/lesson-route-transition.js";

const lesson = {
  childName: "Bella",
  scenes: [
    { steps: [{ speaker: "peppa" }, { speaker: "user" }] },
    { steps: [{ speaker: "dolly" }] },
  ],
};

describe("routed lesson scene transitions", () => {
  it("detects automatic progression after final feedback in a scene", () => {
    const state = {
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      sceneIndex: 0,
      stepIndex: 1,
      feedbackOutcome: "success",
    };
    assert.equal(
      getLessonEventTargetSceneIndex(state, { type: "FEEDBACK_DONE" }, lesson),
      1,
    );
  });

  it("detects manual previous and replay without reporting same-scene events", () => {
    const sceneOne = { ...createInitialLessonState(), sceneIndex: 1 };
    assert.equal(
      getLessonEventTargetSceneIndex(sceneOne, { type: "SCENE_PREVIOUS" }, lesson),
      0,
    );
    assert.equal(
      getLessonEventTargetSceneIndex(
        { ...sceneOne, phase: LessonPhase.Finished },
        { type: "REPLAY_LESSON" },
        lesson,
      ),
      0,
    );
    assert.equal(
      getLessonEventTargetSceneIndex(sceneOne, { type: "SCENE_NEXT" }, lesson),
      null,
    );
    assert.equal(
      getLessonEventTargetSceneIndex(
        createInitialLessonState(),
        { type: "PAUSE_SCENE" },
        lesson,
      ),
      null,
    );
  });
});
```

Extend `tests/lesson-state.test.mjs`:

```js
it("selects a routed scene while clearing transient lesson state", () => {
  const state = {
    ...createInitialLessonState(),
    phase: LessonPhase.Evaluating,
    sceneIndex: 0,
    stepIndex: 2,
    feedback: "old",
    transcript: "old",
  };
  const selected = reduceLessonState(state, { type: "SELECT_SCENE", sceneIndex: 2 }, lesson);
  assert.deepEqual(selected, { ...createInitialLessonState(), sceneIndex: 2 });
});
```

- [ ] **Step 3: Run the new tests and confirm RED**

Run:

```bash
node --test tests/lesson-route-activity.test.mjs tests/lesson-route-transition.test.mjs tests/lesson-state.test.mjs
```

Expected: FAIL because the guard, transition helper, and `SELECT_SCENE` event do not exist.

- [ ] **Step 4: Implement the pure activity guard**

Create `lib/lesson-route-activity.js`:

```js
// @ts-check
export function createLessonRouteActivityGuard() {
  let generation = 0;
  return {
    capture: () => generation,
    invalidate: () => { generation += 1; },
    /** @param {number} captured */
    isCurrent: (captured) => captured === generation,
  };
}
```

- [ ] **Step 5: Implement scene-transition detection**

Create `lib/lesson-route-transition.js`:

```js
// @ts-check
import { reduceLessonState } from "./lesson-state.js";

/**
 * @param {import("./lesson-state.js").LessonState} state
 * @param {import("./lesson-state.js").LessonEvent} event
 * @param {import("./lesson-data.js").Lesson} lesson
 */
export function getLessonEventTargetSceneIndex(state, event, lesson) {
  const nextState = reduceLessonState(state, event, lesson);
  return nextState.sceneIndex === state.sceneIndex ? null : nextState.sceneIndex;
}
```

Export the existing JSDoc `LessonState` and `LessonEvent` typedefs from `lib/lesson-state.js` if TypeScript checking requires it.

- [ ] **Step 6: Add route scene selection to the reducer**

Extend the `LessonEvent` typedef and the TypeScript mirror in `src/App.tsx` with:

```js
| { type: "SELECT_SCENE", sceneIndex: number }
```

Add this reducer branch before `RESET`:

```js
case "SELECT_SCENE":
  return lesson.scenes[event.sceneIndex]
    ? { ...createInitialLessonState(), sceneIndex: event.sceneIndex }
    : state;
```

- [ ] **Step 7: Route all scene-changing events before dispatch**

Retain the routed `LessonPlayerProps` introduced in Task 5:

```ts
type LessonPlayerProps = {
  lesson: Lesson;
  onBack: () => void;
  onHome: () => void;
  onNavigateScene: (sceneIndex: number) => void;
  routedSceneIndex: number;
};
```

Inside `LessonPlayer`:

1. Create `routeActivityGuardRef`, `routedSceneRef`, and `pendingRoutedEventRef`.
2. If the routed index changes during render, update `routedSceneRef` and invalidate the guard immediately so old promises cannot complete before effects run.
3. Convert `cancelPendingWork` to a stable `useCallback`, then use an effect to cancel, clear errors, and apply either the pending internal event or `SELECT_SCENE` when the route and reducer disagree.
4. Replace direct dispatches of events that can cross scenes with one callback. URL navigation happens before the reducer crosses the scene boundary; the pending event is applied only after the route confirms the target:

```tsx
const routeActivityGuardRef = useRef(createLessonRouteActivityGuard());
const routedSceneRef = useRef(routedSceneIndex);
const pendingRoutedEventRef = useRef<{
  event: LessonEvent;
  sceneIndex: number;
} | null>(null);

if (routedSceneRef.current !== routedSceneIndex) {
  routedSceneRef.current = routedSceneIndex;
  routeActivityGuardRef.current.invalidate();
}

const cancelPendingWork = useCallback(() => {
  pressedRef.current = false;
  pressSequenceRef.current += 1;
  playbackGenerationRef.current += 1;
  playbackControllerRef.current?.abort();
  playbackControllerRef.current = null;
  recordingControllerRef.current?.abort();
  recordingControllerRef.current = null;
  recordingRef.current?.cancel();
  recordingRef.current = null;
  evaluationControllerRef.current?.abort();
  evaluationControllerRef.current = null;
}, []);

useEffect(() => {
  if (state.sceneIndex === routedSceneIndex) return;
  cancelPendingWork();
  setError("");
  const pending = pendingRoutedEventRef.current;
  pendingRoutedEventRef.current = null;
  dispatch(
    pending?.sceneIndex === routedSceneIndex
      ? pending.event
      : { type: "SELECT_SCENE", sceneIndex: routedSceneIndex },
  );
}, [cancelPendingWork, routedSceneIndex, state.sceneIndex]);

const dispatchLessonEvent = useCallback((event: LessonEvent) => {
  const targetSceneIndex = getLessonEventTargetSceneIndex(
    state,
    event,
    currentLesson,
  );
  if (targetSceneIndex !== null) {
    routeActivityGuardRef.current.invalidate();
    cancelPendingWork();
    pendingRoutedEventRef.current = { event, sceneIndex: targetSceneIndex };
    onNavigateScene(targetSceneIndex);
    return;
  }
  dispatch(event);
}, [cancelPendingWork, currentLesson, onNavigateScene, state]);
```

Use this callback for `LINE_DONE`, `FEEDBACK_DONE`, `SCENE_PREVIOUS`, `SCENE_NEXT`, and `REPLAY_LESSON`. Non-scene events may continue through `dispatch`.

- [ ] **Step 8: Guard every asynchronous completion against route changes**

Capture `routeActivityGuardRef.current.capture()` when starting playback, microphone setup, recording completion, and evaluation. Before any async callback calls `dispatch`, `setError`, or advances a scene, require:

```ts
routeActivityGuardRef.current.isCurrent(capturedRouteGeneration)
```

Keep the existing playback and speech generation checks as well; the route guard complements them. The route-change effect must still call `cancelPendingWork()` so work is aborted, not merely ignored.

Add a Main menu link/button beside the existing Back to lessons control and wire `onHome`. Keep Back to lessons navigating to `/lessons`.

- [ ] **Step 9: Strengthen source-contract tests for the race boundary**

Extend `tests/lesson-controls-ui.test.mjs` to assert:

```js
assert.match(app, /createLessonRouteActivityGuard/);
assert.match(app, /getLessonEventTargetSceneIndex/);
assert.match(app, /routeActivityGuardRef\.current\.invalidate\(\)/);
assert.match(app, /type:\s*"SELECT_SCENE"/);
assert.match(app, /onNavigateScene\(targetSceneIndex\)/);
assert.match(app, /Back to main menu/);
```

- [ ] **Step 10: Run focused route/player regressions**

Run:

```bash
node --test tests/lesson-route-activity.test.mjs tests/lesson-route-transition.test.mjs tests/lesson-state.test.mjs tests/lesson-controls-ui.test.mjs tests/playback-operation.test.mjs tests/speech-operation.test.mjs
npx tsc --noEmit
```

Expected: all tests and type checking pass.

- [ ] **Step 11: Commit routed scene synchronization**

```bash
git add lib/lesson-route-activity.js lib/lesson-route-transition.js lib/lesson-state.js src/App.tsx tests/lesson-route-activity.test.mjs tests/lesson-route-transition.test.mjs tests/lesson-state.test.mjs tests/lesson-controls-ui.test.mjs
git commit -m "feat: synchronize lesson scenes with URLs"
```

## Task 7: Style, Document, and Verify the Complete Experience

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/lesson-list-ui.test.mjs`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write failing responsive and focus-style contracts**

Add source assertions for these selectors and properties:

```js
assert.match(styles, /\.home-menu-grid\s*\{[^}]*grid-template-columns/s);
assert.match(styles, /\.home-menu-card:focus-visible/);
assert.match(styles, /\.feature-placeholder-card\s*\{/);
assert.match(styles, /\.main-menu-link:focus-visible/);
assert.match(styles, /\.my-lessons-empty\s*\{/);
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.home-menu-grid/);
```

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `node --test tests/app-shell-ui.test.mjs tests/lesson-list-ui.test.mjs`

Expected: FAIL because the new selectors are not styled.

- [ ] **Step 3: Add responsive app-home and skeleton styles**

Add focused CSS sections that:

- use a two-by-two `.home-menu-grid` on wide screens and one column below 700px;
- give all `.home-menu-card` links equal minimum height and a shared grid structure;
- preserve large touch targets, rounded corners, the existing blue/pink/yellow/green palette, and visible local focus rings;
- center `.feature-placeholder-card` within the viewport without hiding the account bar;
- separate `.lesson-catalog-section` headings and give `.my-lessons-empty` a dashed/soft empty-state treatment;
- position `.lesson-main-menu-link` without colliding with the session bar; and
- add a compact `.lesson-home-button` alongside the current Back to lessons control without covering scene HUD or playback controls.

Use existing custom properties/colors where present; do not restyle auth, onboarding, or lesson content unrelated to the new navigation.

- [ ] **Step 4: Re-run UI and layout tests**

Run:

```bash
node --test tests/app-shell-ui.test.mjs tests/lesson-list-ui.test.mjs tests/stage-layout.test.mjs tests/lesson-controls-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Update current product and architecture docs**

Document:

- auth → onboarding → four-card home as the entry sequence;
- `/lessons` as the combined Parrot/My catalog;
- Parrot and My lesson URL namespaces;
- scene URLs as durable state and playback/recording phases as transient state;
- `/lessons/my/create`, `/progress`, and `/stories` as intentional skeletons; and
- the requirement that Cloudflare static fallback serves the SPA for deep links.

Add the approved design spec to `docs/README.md` under Related Specs.

- [ ] **Step 6: Run complete automated verification**

The repository asks for approval before expensive full suites/builds. After approval, run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every test passes, ESLint reports no errors, TypeScript/Vite build succeeds, and `git diff --check` is silent.

- [ ] **Step 7: Run browser acceptance checks**

Start the local Worker-backed app with the existing development command and verify:

1. `/progress` while logged out becomes `/login?returnTo=%2Fprogress`.
2. Ordinary login at `/login` ends at `/` after onboarding is complete.
3. New/incomplete users stay on `/onboarding` for all questions, then reach the preserved destination.
4. `/` shows four equal cards whose links match the route contract.
5. `/lessons` shows all seven Parrot lessons and a separate My Lessons empty state.
6. `/lessons/parrot/01-peppas-high-ball` canonicalizes to scene 1.
7. Direct scene refresh works; Previous/Next and automatic scene progression update the URL.
8. Back/Forward restores scenes without stale audio, microphone, or evaluation completions.
9. `/lessons/my/create`, `/progress`, `/stories`, and `/profile` refresh directly and return to the main menu.
10. Unknown lessons, invalid scene numbers, unauthorized My lesson URLs, and unknown app paths redirect safely.

Capture console output and require no React warnings or uncaught errors.

- [ ] **Step 8: Commit styling and documentation**

```bash
git add src/styles.css tests/app-shell-ui.test.mjs tests/lesson-list-ui.test.mjs docs/README.md docs/design/product-experience.md docs/design/technical-architecture.md
git commit -m "docs: describe routed learning experience"
```

- [ ] **Step 9: Inspect final branch scope**

Run:

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: the worktree is clean; only the approved design, plan, route/UI implementation, focused tests, dependency lock update, styles, and current docs are present.
