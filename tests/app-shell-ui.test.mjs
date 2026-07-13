import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const homeModule = await vite
  .ssrLoadModule("/src/HomeMenu.tsx")
  .catch(() => ({}));
const placeholderModule = await vite
  .ssrLoadModule("/src/FeaturePlaceholder.tsx")
  .catch(() => ({}));
const appModule = await vite.ssrLoadModule("/src/App.tsx").catch(() => ({}));
const { HomeMenu } = homeModule;
const { FeaturePlaceholder } = placeholderModule;
const { ApplicationRoutes } = appModule;

after(async () => {
  await vite.close();
});

const app = readFileSync(
  fileURLToPath(new URL("../src/App.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(new URL("../src/styles.css", import.meta.url)),
  "utf8",
);

function renderInRouter(element, initialEntry = "/") {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [initialEntry] }, element),
  );
}

function renderApplicationRoute(initialEntry) {
  assert.equal(
    typeof ApplicationRoutes,
    "function",
    "Expected an executable ApplicationRoutes tree",
  );
  return renderInRouter(
    createElement(ApplicationRoutes, { loginTarget: "/" }),
    initialEntry,
  );
}

test("home menu exposes Talk to Peppa with the learning activities", () => {
  assert.equal(typeof HomeMenu, "function", "Expected an executable HomeMenu");

  const html = renderInRouter(createElement(HomeMenu));

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /^<main class="home-menu-page">/);
  assert.match(html, /<header class="home-menu-header">/);
  assert.match(
    html,
    /<nav[^>]*aria-label="Learning activities"[^>]*class="home-menu-grid"/,
  );
  assert.equal((html.match(/class="home-menu-card"/g) ?? []).length, 5);
  assert.deepEqual(
    [...html.matchAll(/class="home-menu-card"[^>]*href="([^"]+)"/g)].map(
      ([, href]) => href,
    ),
    [
      "/talk-to-peppa",
      "/lessons",
      "/lessons/my/create",
      "/progress",
      "/stories",
    ],
  );
  assert.match(html, />Talk to Peppa</);
  assert.match(html, /friendly English conversation/i);
  assert.match(html, />Lessons</);
  assert.match(html, /Parrot|learner-created/i);
  assert.match(html, />Create a Lesson</);
  assert.match(html, />Progress</);
  assert.match(html, />Storytelling</);
  assert.doesNotMatch(html, /PARROT ENGLISH/);
  for (const icon of [
    "message-circle",
    "play",
    "plus",
    "sparkles",
    "book-open",
  ]) {
    assert.match(html, new RegExp(`lucide-${icon}`));
  }
});

test("feature placeholder renders supplied copy and a real main-menu link", () => {
  assert.equal(
    typeof FeaturePlaceholder,
    "function",
    "Expected an executable FeaturePlaceholder",
  );

  const html = renderInRouter(
    createElement(FeaturePlaceholder, {
      description: "This activity is coming soon.",
      title: "Progress",
    }),
    "/progress",
  );

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.doesNotMatch(html, /PARROT ENGLISH/);
  assert.match(html, /<main class="feature-placeholder-page">/);
  assert.match(html, /<section class="feature-placeholder-card">/);
  assert.match(html, /<h1>Progress<\/h1>/);
  assert.match(html, /This activity is coming soon\./);
  assert.equal((html.match(/<p/g) ?? []).length, 1);
  assert.match(
    html,
    /<a class="main-menu-link" href="\/"[^>]*>Back to main menu<\/a>/,
  );
});

test("home and placeholder routes have equal, responsive, keyboard-visible surfaces", () => {
  assert.match(
    styles,
    /\.home-menu-page\s*\{[^}]*height:\s*100dvh[^}]*overflow-y:\s*auto[^}]*background:[^}]*padding:/s,
  );
  assert.doesNotMatch(styles, /:has\(>\s*\.home-menu-grid\)/);
  assert.match(
    styles,
    /\.home-menu-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*grid-auto-rows:\s*1fr/s,
  );
  assert.match(
    styles,
    /\.home-menu-card\s*\{[^}]*display:\s*grid[^}]*min-height:\s*\d+px/s,
  );
  assert.match(
    styles,
    /\.home-menu-card:focus-visible\s*\{[^}]*outline:\s*5px solid var\(--color-brand-navy\)[^}]*outline-offset:\s*4px/s,
  );
  assert.match(
    styles,
    /\.feature-placeholder-page\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center[^}]*overflow-y:\s*auto/s,
  );
  assert.match(styles, /\.feature-placeholder-card\s*\{/);
  assert.match(
    styles,
    /\.main-menu-link:focus-visible\s*\{[^}]*outline:\s*5px solid var\(--color-brand-navy\)[^}]*outline-offset:\s*4px/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 700px\)[\s\S]*?\.home-menu-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*grid-auto-rows:\s*1fr/s,
  );
  assert.doesNotMatch(
    styles,
    /@media \(max-width: 700px\)[\s\S]*?\.home-menu-grid\s*\{[^}]*grid-auto-rows:\s*auto/s,
  );
});

test("authenticated application routes render durable home and activity pages", () => {
  assert.match(renderApplicationRoute("/"), /Learning activities/);
  assert.match(
    renderApplicationRoute("/talk-to-peppa"),
    /Talk to Peppa/,
  );
  assert.match(renderApplicationRoute("/lessons"), /Choose a lesson/);

  const createLesson = renderApplicationRoute("/lessons/my/create");
  assert.match(createLesson, /<h1>Create a Lesson<\/h1>/);
  assert.match(createLesson, /coming soon/i);
  assert.doesNotMatch(createLesson, /LEARN YOUR WAY/);
  assert.doesNotMatch(createLesson, /<form|<input|<textarea/);

  assert.match(renderApplicationRoute("/progress"), /<h1>Progress<\/h1>/);
  assert.doesNotMatch(renderApplicationRoute("/progress"), /KEEP GROWING/);
  assert.match(
    renderApplicationRoute("/stories"),
    /<h1>Storytelling<\/h1>/,
  );
  assert.doesNotMatch(renderApplicationRoute("/stories"), /TELL A STORY/);
});

test("canonical Parrot scene routes render the addressed one-based scene", () => {
  const html = renderApplicationRoute(
    "/lessons/parrot/01-peppas-high-ball/scenes/2",
  );

  assert.match(html, /Peppa Cannot Reach/);
  assert.doesNotMatch(html, /The Ball Up High/);
  assert.match(html, /Scene 2 of 5/);
});

test("lesson routes expose distinct lesson-list and main-menu controls", () => {
  const html = renderApplicationRoute(
    "/lessons/parrot/01-peppas-high-ball/scenes/2",
  );

  assert.match(html, /aria-label="Back to lesson list"/);
  assert.match(html, />Back to lessons<\/span>/);
  assert.match(html, /aria-label="Back to main menu"/);
  assert.match(
    html,
    /class="lesson-home-button app-header-control app-header-control--secondary app-header-control--surface"/,
  );
  assert.match(html, />Back to main menu<\/span>/);
});

test("the application shell derives protected targets from the current URL", () => {
  assert.match(
    app,
    /import\s+\{[^}]*\bNavigate\b[^}]*\buseLocation\b[^}]*\}\s+from\s+["']react-router["']/s,
  );
  assert.match(
    app,
    /import\s+\{[^}]*\bgetGateRouteKind\b[^}]*\bgetLoginPath\b[^}]*\bgetRequestedProtectedTarget\b[^}]*\}\s+from\s+["']\.\/app-routes["']/s,
  );
  assert.match(app, /const\s+location\s*=\s*useLocation\(\)/);
  assert.match(
    app,
    /const\s+gateRoute\s*=\s*getGateRouteKind\(location\.pathname\)/,
  );
  assert.match(app, /const\s+onLoginRoute\s*=\s*gateRoute\s*===\s*["']login["']/);
  assert.match(app, /const\s+isOnboardingRoute\s*=\s*gateRoute\s*===\s*["']onboarding["']/);
  assert.match(app, /const\s+isProfileRoute\s*=\s*gateRoute\s*===\s*["']profile["']/);
  assert.doesNotMatch(
    app,
    /location\.pathname\s*===\s*["']\/(?:login|onboarding|profile)["']/,
  );
  assert.match(
    app,
    /const\s+requestedProtectedTarget\s*=\s*getRequestedProtectedTarget\(\s*location\.pathname,\s*location\.search,\s*location\.hash,?\s*\)/s,
  );
});

test("signed-out redirects reuse the safe requested protected target", () => {
  assert.match(
    app,
    /const\s+onLoginRoute\s*=\s*gateRoute\s*===\s*["']login["']/,
  );
  assert.match(app, /signedOutFallback=\{/);
  assert.match(
    app,
    /<Navigate\s+replace\s+to=\{getLoginPath\(requestedProtectedTarget\)\}\s*\/>/,
  );
  assert.match(app, /onLoginRoute\s*\?\s*null\s*:/);
});

test("the authenticated shell declares login, onboarding, profile, and wildcard routes", () => {
  assert.match(app, /<Routes>/);
  for (const path of [
    "/",
    "/talk-to-peppa",
    "/lessons",
    "/lessons/my/create",
    "/lessons/parrot/:lessonId",
    "/lessons/parrot/:lessonId/scenes/:sceneNumber",
    "/lessons/my/:lessonId",
    "/lessons/my/:lessonId/scenes/:sceneNumber",
    "/progress",
    "/stories",
    "/login",
    "/onboarding",
    "/profile",
    "*",
  ]) {
    assert.match(app, new RegExp(`path=["']${path.replace("*", "\\*")}["']`));
  }
  assert.match(
    app,
    /<Route\s+element=\{<LessonList\s*\/>\}\s+path=["']\/lessons["']\s*\/>/,
  );
  assert.match(app, /const\s+safeReturnTo\s*=\s*getSafeReturnTo\(location\.search\)\s*\?\?\s*["']\/["']/);
  assert.match(app, /const\s+requestedProtectedTarget\s*=/);
  assert.match(app, /getOnboardingPath\(requestedProtectedTarget\)/);
});

test("lesson route adapters render the executable route decisions", () => {
  assert.match(
    app,
    /function\s+LessonRouteDecisionView\([\s\S]*?decision:\s*LessonRouteDecision[\s\S]*?if\s*\(decision\.kind\s*===\s*["']redirect["']\)/,
  );
  assert.match(app, /replace=\{decision\.replace\}/);
  assert.match(app, /to=\{decision\.to\}/);
  assert.match(
    app,
    /function\s+ParrotLessonRedirect\(\)[\s\S]*?resolveParrotLessonRouteDecision\(lessonId,\s*undefined\)/,
  );
  assert.match(
    app,
    /function\s+ParrotLessonSceneRoute\(\)[\s\S]*?resolveParrotLessonRouteDecision\(lessonId,\s*sceneNumber\)/,
  );
  assert.match(
    app,
    /function\s+MyLessonRouteUnavailable\(\)[\s\S]*?resolveMyLessonRouteDecision\(lessonId,\s*sceneNumber\)/,
  );
  assert.match(app, /key=\{`\$\{source\}:\$\{decision\.entry\.id\}`\}/);
  assert.match(app, /routedSceneIndex=\{decision\.sceneIndex\}/);
  assert.match(
    app,
    /function\s+LessonRouteDecisionView[\s\S]*?const location = useLocation\(\)[\s\S]*?routedLocationKey=\{location\.key\}/,
  );
  assert.match(app, /onNavigateScene=/);
});

test("global Profile navigation exits the active lesson before routing", () => {
  assert.match(app, /createLessonRouteExitRegistry/);
  assert.match(
    app,
    /const lessonRouteExitRegistryRef = useRef\(\s*createLessonRouteExitRegistry\(\),?\s*\)/,
  );
  assert.match(
    app,
    /const registerLessonRouteExitBarrier = useCallback\(\s*\(barrier: \(\) => void\) =>\s*lessonRouteExitRegistryRef\.current\.register\(barrier\),\s*\[\],?\s*\)/,
  );
  assert.match(
    app,
    /const openProfileRoute = useCallback\(\(\) => \{\s*lessonRouteExitRegistryRef\.current\.exit\(\);\s*navigate\("\/profile"\);\s*\}, \[navigate\]\)/,
  );
  assert.match(
    app,
    /<LessonRouteExitBarrierContext\.Provider\s+value=\{registerLessonRouteExitBarrier\}\s*>[\s\S]*?<AuthGate/,
  );
  assert.match(app, /onOpenProfileRoute=\{openProfileRoute\}/);
});

test("My lesson routes stay unavailable while the create route stays statically ranked", () => {
  const createLesson = renderApplicationRoute("/lessons/my/create");
  assert.match(createLesson, /<h1>Create a Lesson<\/h1>/);
  assert.match(createLesson, /Lesson creation is coming soon/);
  assert.doesNotMatch(createLesson, /Parrot English speaking lesson/);
});
