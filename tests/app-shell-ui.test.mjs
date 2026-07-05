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

test("home menu exposes four equal learning activity links", () => {
  assert.equal(typeof HomeMenu, "function", "Expected an executable HomeMenu");

  const html = renderInRouter(createElement(HomeMenu));

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<nav[^>]*aria-label="Learning activities"/);
  assert.equal((html.match(/class="home-menu-card"/g) ?? []).length, 4);
  assert.deepEqual(
    [...html.matchAll(/class="home-menu-card"[^>]*href="([^"]+)"/g)].map(
      ([, href]) => href,
    ),
    ["/lessons", "/lessons/my/create", "/progress", "/stories"],
  );
  assert.match(html, />Lessons</);
  assert.match(html, /Parrot|learner-created/i);
  assert.match(html, />Create a Lesson</);
  assert.match(html, />Progress</);
  assert.match(html, />Storytelling</);
  for (const icon of ["play", "plus", "sparkles", "book-open"]) {
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
      eyebrow: "PARROT ENGLISH",
      title: "Progress",
    }),
    "/progress",
  );

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /PARROT ENGLISH/);
  assert.match(html, /<h1>Progress<\/h1>/);
  assert.match(html, /This activity is coming soon\./);
  assert.match(html, /<a[^>]*href="\/"[^>]*>Back to main menu<\/a>/);
});

test("authenticated application routes render durable home and activity pages", () => {
  assert.match(renderApplicationRoute("/"), /Learning activities/);
  assert.match(renderApplicationRoute("/lessons"), /Choose a lesson/);

  const createLesson = renderApplicationRoute("/lessons/my/create");
  assert.match(createLesson, /<h1>Create a Lesson<\/h1>/);
  assert.match(createLesson, /coming soon/i);
  assert.doesNotMatch(createLesson, /<form|<input|<textarea/);

  assert.match(renderApplicationRoute("/progress"), /<h1>Progress<\/h1>/);
  assert.match(
    renderApplicationRoute("/stories"),
    /<h1>Storytelling<\/h1>/,
  );
});

test("the application shell builds login redirects from the current URL", () => {
  assert.match(
    app,
    /import\s+\{[^}]*\bNavigate\b[^}]*\buseLocation\b[^}]*\}\s+from\s+["']react-router["']/s,
  );
  assert.match(
    app,
    /import\s+\{[^}]*\bgetLoginPath\b[^}]*\}\s+from\s+["']\.\/app-routes["']/s,
  );
  assert.match(app, /const\s+location\s*=\s*useLocation\(\)/);
  assert.match(
    app,
    /const\s+currentTarget\s*=\s*`\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`/,
  );
});

test("protected signed-out URLs replace themselves with a login redirect", () => {
  assert.match(app, /const\s+onLoginRoute\s*=\s*location\.pathname\s*===\s*["']\/login["']/);
  assert.match(app, /signedOutFallback=\{/);
  assert.match(
    app,
    /<Navigate\s+replace\s+to=\{getLoginPath\(currentTarget\)\}\s*\/>/,
  );
  assert.match(app, /onLoginRoute\s*\?\s*null\s*:/);
});

test("the authenticated shell declares login, onboarding, profile, and wildcard routes", () => {
  assert.match(app, /<Routes>/);
  for (const path of [
    "/",
    "/lessons",
    "/lessons/my/create",
    "/progress",
    "/stories",
    "/login",
    "/onboarding",
    "/profile",
    "*",
  ]) {
    assert.match(app, new RegExp(`path=["']${path.replace("*", "\\*")}["']`));
  }
  assert.match(app, /getLessonScenePath\(["']parrot["'],\s*lessonId,\s*0\)/);
  assert.match(app, /const\s+safeReturnTo\s*=\s*getSafeReturnTo\(location\.search\)\s*\?\?\s*["']\/["']/);
  assert.match(app, /const\s+requestedProtectedTarget\s*=/);
  assert.match(app, /getOnboardingPath\(requestedProtectedTarget\)/);
});
