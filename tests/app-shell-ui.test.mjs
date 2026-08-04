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
  .ssrLoadModule("/src/app/HomeMenu.tsx")
  .catch(() => ({}));
const placeholderModule = await vite
  .ssrLoadModule("/src/app/FeaturePlaceholder.tsx")
  .catch(() => ({}));
const appModule = await vite.ssrLoadModule("/src/app/App.tsx").catch(() => ({}));
const { HomeMenu } = homeModule;
const { FeaturePlaceholder } = placeholderModule;
const { ApplicationRoutes } = appModule;

after(async () => {
  await vite.close();
});

const app = readFileSync(
  fileURLToPath(new URL("../src/app/App.tsx", import.meta.url)),
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

test("home menu prioritizes working activities and previews two disabled activities", () => {
  assert.equal(typeof HomeMenu, "function", "Expected an executable HomeMenu");

  const html = renderInRouter(createElement(HomeMenu));

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<nav[^>]*aria-label="Learning activities"/);
  assert.deepEqual(
    [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(([, href]) => href),
    ["/talk-to-peppa", "/lessons", "/prototypes/pixel-stage/"],
  );
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.equal((html.match(/>Coming soon</g) ?? []).length, 2);
  assert.match(html, /What do you want to do today\?/);
  assert.match(html, />Talk to Peppa</);
  assert.match(html, /chat freely/i);
  assert.match(html, />Lessons</);
  assert.match(html, /story.*speaking|speaking.*story/i);
  assert.match(html, />Game</);
  assert.match(html, />Proof of concept</);
  assert.match(html, /aria-label="Progress, coming soon"/);
  assert.match(html, /aria-label="Storytelling, coming soon"/);
  assert.doesNotMatch(html, /Create a Lesson/);
  assert.doesNotMatch(html, /PARROT ENGLISH/);
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
  assert.match(html, /<h1[^>]*>Progress<\/h1>/);
  assert.match(html, /This activity is coming soon\./);
  assert.equal((html.match(/<p/g) ?? []).length, 1);
  assert.match(html, /<a[^>]*href="\/"[^>]*>Back to home<\/a>/);
});

test("feature placeholder keeps visual actions in keyboard order", () => {
  const retryHtml = renderInRouter(
    createElement(FeaturePlaceholder, {
      actionLabel: "Back to lessons",
      actionTo: "/lessons",
      description: "Please try loading this lesson again.",
      onRetry() {},
      title: "We couldn’t open that lesson",
    }),
  );
  assert.ok(
    retryHtml.indexOf("Try again") < retryHtml.indexOf("Back to lessons"),
    "Retry should precede the fallback link in DOM and visual order.",
  );

  const alternateHtml = renderInRouter(
    createElement(FeaturePlaceholder, {
      actionLabel: "Choose a lesson",
      actionTo: "/lessons",
      description: "Voice chat is unavailable.",
      secondaryActionLabel: "Back to home",
      secondaryActionTo: "/",
      title: "Peppa is taking a break",
    }),
  );
  assert.ok(
    alternateHtml.indexOf("Choose a lesson") <
      alternateHtml.indexOf("Back to home"),
    "The primary action should precede the secondary action in DOM and visual order.",
  );
});

test("authenticated application routes keep working activities and retire legacy placeholders", () => {
  assert.match(renderApplicationRoute("/"), /Learning activities/);
  assert.match(
    renderApplicationRoute("/talk-to-peppa"),
    /Peppa is taking a break/,
  );
  assert.match(renderApplicationRoute("/lessons"), /<h1[^>]*>Lessons<\/h1>/);

  const createLesson = renderApplicationRoute("/lessons/my/create");
  assert.match(createLesson, /<h1[^>]*>Create a custom lesson<\/h1>/);
  assert.match(createLesson, /Make with AI/);
  assert.match(createLesson, /Import JSON/);
  assert.doesNotMatch(createLesson, /LEARN YOUR WAY/);
  assert.match(createLesson, /<form|<textarea/);

  for (const retiredPath of ["/progress", "/stories"]) {
    const html = renderApplicationRoute(retiredPath);
    assert.doesNotMatch(html, /Progress|Storytelling|coming soon/i);
  }
  assert.match(
    app,
    /<Route\s+element=\{<Navigate\s+replace\s+to=["']\/["']\s*\/>\}\s+path=["']\/progress["']\s*\/>/,
  );
  assert.match(
    app,
    /<Route\s+element=\{<Navigate\s+replace\s+to=["']\/["']\s*\/>\}\s+path=["']\/stories["']\s*\/>/,
  );
});

test("canonical Parrot scene routes start without premature scene content", () => {
  const html = renderApplicationRoute(
    "/lessons/parrot/01-peppas-high-ball/scenes/2",
  );

  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.match(html, /5 scenes/);
  assert.match(html, /aria-label="Start lesson"/);
  assert.doesNotMatch(html, /Peppa Cannot Reach/);
  assert.doesNotMatch(html, /The Ball Up High/);
  assert.doesNotMatch(html, /Scene 2 of 5/);
});

test("lesson routes expose one back control to the lesson list", () => {
  const html = renderApplicationRoute(
    "/lessons/parrot/01-peppas-high-ball/scenes/2",
  );

  assert.match(html, /aria-label="Back to lesson list"/);
  assert.match(html, />Back to lessons<\/span>/);
  assert.doesNotMatch(html, /aria-label="Back to main menu"/);
  assert.equal(
    (html.match(/<nav[^>]*aria-label="Page navigation"[\s\S]*?<\/nav>/g) ?? [])
      .length,
    1,
  );
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
  assert.match(app, /const\s+isLearnerProfileRoute\s*=\s*gateRoute\s*===\s*["']learner-profile["']/);
  assert.match(app, /const\s+isProfileRoute\s*=\s*gateRoute\s*===\s*["']profile["']/);
  assert.doesNotMatch(
    app,
    /location\.pathname\s*===\s*["']\/(?:login|profile(?:\/setup)?)["']/,
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

test("the authenticated shell declares login, learner-profile, profile, and wildcard routes", () => {
  assert.match(app, /<Routes>/);
  for (const path of [
    "/",
    "/talk-to-peppa",
    "/lessons",
    "/lessons/my/create",
    "/lessons/my/:lessonId/edit",
    "/lessons/parrot/:lessonId",
    "/lessons/parrot/:lessonId/scenes/:sceneNumber",
    "/lessons/my/:lessonId",
    "/lessons/my/:lessonId/scenes/:sceneNumber",
    "/progress",
    "/stories",
    "/login",
    "/profile/setup",
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
  assert.match(app, /getLearnerProfilePath\(requestedProtectedTarget\)/);
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
  assert.match(app, /function\s+MyLessonRoute/);
  assert.match(app, /loadMyLesson\(lessonId/);
  assert.match(app, /resolveMyLessonRouteDecision\(entry,\s*lessonId,\s*sceneNumber\)/);
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
    /const openProfileRoute = useCallback\(\(\) => \{\s*lessonRouteExitRegistryRef\.current\.exit\(\);\s*navigate\(getProfilePath\(requestedProtectedTarget\)\);\s*\}, \[navigate,\s*requestedProtectedTarget\]\)/,
  );
  assert.match(
    app,
    /<LessonRouteExitBarrierContext\.Provider\s+value=\{registerLessonRouteExitBarrier\}\s*>[\s\S]*?<AuthGate/,
  );
  assert.match(app, /onOpenProfileRoute=\{openProfileRoute\}/);
});

test("Create Lesson stays statically ranked ahead of dynamic My lesson routes", () => {
  const createLesson = renderApplicationRoute("/lessons/my/create");
  assert.match(createLesson, /<h1[^>]*>Create a custom lesson<\/h1>/);
  assert.match(createLesson, /Make with AI/);
  assert.match(createLesson, /Import JSON/);
  assert.doesNotMatch(createLesson, /Parrot English speaking lesson/);
});
