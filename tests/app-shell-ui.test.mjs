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
const appModule = await vite
  .ssrLoadModule("/src/app/App.tsx")
  .catch(() => ({}));
const { LearnerProfileProvider, LearnerSelectionProvider } =
  await vite.ssrLoadModule("/src/learner-profile/LearnerProfileContext.tsx");
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
    createElement(
      LearnerSelectionProvider,
      {
        activeProfileId: "learner-mia",
        async reloadSelectedLearner() {},
      },
      createElement(
        LearnerProfileProvider,
        {
          profile: {
            id: "learner-mia",
            age: 6,
            answers: {
              legacyAnswers: null,
              questionnaireVersion: 2,
              responses: {},
              schemaVersion: 2,
            },
            completedAt: "2026-08-25T08:00:00.000Z",
            currentQuestionKey: null,
            description: "Likes animals",
            name: "Mia",
            profileStatus: "completed",
            questionnaireVersion: 2,
            storyLevel: "first-words",
          },
          replaceProfile() {},
        },
        createElement(ApplicationRoutes, {
          learnerName: "Mia",
          loginTarget: "/",
        }),
      ),
    ),
    initialEntry,
  );
}

test("home menu prioritizes the four learner activities", () => {
  assert.equal(typeof HomeMenu, "function", "Expected an executable HomeMenu");

  const html = renderInRouter(createElement(HomeMenu));

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<nav[^>]*aria-label="Learning activities"/);
  const activityHrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );
  assert.deepEqual(activityHrefs, [
    "/lessons",
    "/talk-to-peppa",
    "/stories",
    "/dubs/five-little-ducks",
  ]);
  assert.equal((html.match(/<button/g) ?? []).length, 0);
  assert.match(html, /Tap a picture\./);
  assert.match(html, />Play a lesson</);
  assert.match(html, />Talk to Peppa</);
  assert.match(html, />Story time</);
  assert.match(html, />Dub a rhyme</);
  assert.equal((html.match(/<img alt=""/g) ?? []).length, 10);
  assert.equal((html.match(/data-story-layer="painted-environment"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<svg[^>]*viewBox="0 0 960 540"/);
  assert.doesNotMatch(
    html,
    /Listen and speak\.|Say hello and chat\.|Listen to a story\.|Tap one\./,
  );
  assert.doesNotMatch(
    html,
    /friendly English conversation|practice speaking out loud|at your level/i,
  );
  assert.match(html, /href="\/stories"/);
  assert.doesNotMatch(
    html,
    /World Explorer|Pixel Lesson Lab|Progress|Coming soon/,
  );
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

test("authenticated application routes include the core learner activities", () => {
  assert.match(renderApplicationRoute("/"), /Learning activities/);
  assert.match(
    renderApplicationRoute("/talk-to-peppa"),
    /Peppa is taking a break/,
  );
  assert.match(
    renderApplicationRoute("/lessons"),
    /<h1[^>]*>Pick a lesson<\/h1>/,
  );
  assert.match(
    renderApplicationRoute("/stories"),
    /<h1[^>]*>Pick a story<\/h1>/,
  );
  const dub = renderApplicationRoute("/dubs/five-little-ducks");
  assert.match(dub, /Five Little Ducks/);
  assert.match(dub, /Loading your private dub…/);
  assert.doesNotMatch(app, /path=["']\/games|PixelLesson|PixelWorld/);

  const createLesson = renderApplicationRoute("/lessons/my/create");
  assert.match(createLesson, /<h1[^>]*>Create a custom lesson<\/h1>/);
  assert.match(createLesson, /Make with AI/);
  assert.match(createLesson, /Import JSON/);
  assert.doesNotMatch(createLesson, /LEARN YOUR WAY/);
  assert.match(createLesson, /<form|<textarea/);

  const retiredProgress = renderApplicationRoute("/progress");
  assert.doesNotMatch(retiredProgress, /Progress|coming soon/i);
  assert.match(
    app,
    /<Route\s+element=\{<Navigate\s+replace\s+to=["']\/["']\s*\/>\}\s+path=["']\/progress["']\s*\/>/,
  );
  assert.doesNotMatch(
    app,
    /<Route\s+element=\{<Navigate\s+replace\s+to=["']\/["']\s*\/>\}\s+path=["']\/stories["']\s*\/>/,
  );
});

test("authenticated application routes include guardian voice-dubbing settings", () => {
  assert.match(
    app,
    /<GuardianDubbingSettings[\s\S]*?learnerName=\{learnerName\}[\s\S]*?onBeforeNavigate=\{onBeforeModeNavigate\}[\s\S]*?\/>/,
  );
});

test("guardian routes receive the active learner name without reading profile context", () => {
  for (const component of [
    "GuardianDashboard",
    "GuardianLessonManager",
    "GuardianStorySettings",
    "GuardianDubbingSettings",
    "LessonCreator",
    "LessonEditor",
  ]) {
    assert.match(
      app,
      new RegExp(`<${component}[^>]*\\blearnerName=\\{learnerName\\}`),
      `Expected ${component} to receive the active learner name`,
    );
  }
});

test("guardian learner route renders the concrete roster manager", () => {
  const html = renderApplicationRoute("/guardian/learners");

  assert.match(html, /<h1[^>]*>Manage learners<\/h1>/);
  assert.doesNotMatch(html, /Learning activities/);
});

test("canonical Parrot scene routes start without premature scene content", () => {
  const html = renderApplicationRoute(
    "/lessons/parrot/01-peppas-high-ball/scenes/2",
  );

  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.match(html, /5 parts/);
  assert.match(html, /Watch and join in/);
  assert.match(html, /say the big words with the group/);
  assert.match(html, /Loading picture…/);
  assert.doesNotMatch(html, /1\. Listen|2\. Talk|aria-label="Start lesson"/);
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
  assert.match(
    app,
    /const\s+onLoginRoute\s*=\s*gateRoute\s*===\s*["']login["']/,
  );
  assert.match(
    app,
    /const\s+isLearnerProfileRoute\s*=\s*gateRoute\s*===\s*["']learner-profile["']/,
  );
  assert.match(
    app,
    /const\s+isProfileRoute\s*=\s*gateRoute\s*===\s*["']profile["']/,
  );
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
    "/stories/:storyId",
    "/stories/:storyId/pages/:pageNumber",
    "/dubs/five-little-ducks",
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
  assert.match(
    app,
    /const\s+safeReturnTo\s*=\s*guardianRoute\s*\?\s*getSafeGuardianReturnTo\(location\.search\)\s*:\s*\(?\s*getSafeReturnTo\(location\.search\)\s*\?\?\s*["']\/["']\s*\)?/s,
  );
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
  assert.match(
    app,
    /resolveMyLessonRouteDecision\(entry,\s*lessonId,\s*sceneNumber\)/,
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
    /const openProfileRoute = useCallback\(\(\) => \{\s*onExitLessonRoute\(\);\s*navigate\(getProfilePath\(requestedProtectedTarget\)\);\s*\}, \[navigate,\s*onExitLessonRoute,\s*requestedProtectedTarget\]\)/,
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
