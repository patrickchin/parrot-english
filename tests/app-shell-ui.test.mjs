import assert from "node:assert/strict";
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
const wordGameListModule = await vite
  .ssrLoadModule("/src/games/WordGameList.tsx")
  .catch(() => ({}));
const appModule = await vite
  .ssrLoadModule("/src/app/App.tsx")
  .catch(() => ({}));
const { LearnerProfileProvider, LearnerSelectionProvider } =
  await vite.ssrLoadModule("/src/learner-profile/LearnerProfileContext.tsx");
const { HomeMenu } = homeModule;
const { FeaturePlaceholder } = placeholderModule;
const { WordGameList } = wordGameListModule;
const { ApplicationRoutes } = appModule;

after(async () => {
  await vite.close();
});

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

test("home menu prioritizes the five learner activities", () => {
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
    "/dubs",
    "/word-games",
  ]);
  assert.doesNotMatch(html, /href="\/dubs\/(?:five-little-ducks|old-macdonald)"/);
  assert.equal((html.match(/<button/g) ?? []).length, 0);
  assert.match(html, /<h1[^>]*>Parrot English<\/h1>/);
  assert.match(html, />Lessons</);
  assert.match(html, />Talk to Peppa</);
  assert.match(html, />Story time</);
  assert.match(html, />Nursery rhymes</);
  assert.match(html, />Word game</);
  assert.equal((html.match(/<img alt=""/g) ?? []).length, 5);
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

  const nursery = renderApplicationRoute("/dubs");
  assert.match(nursery, />Nursery rhymes</);
  for (const route of [
    "/dubs/five-little-ducks",
    "/dubs/old-macdonald",
    "/dubs/twinkle-twinkle",
    "/dubs/row-row-row-your-boat",
    "/dubs/mary-had-a-little-lamb",
    "/dubs/humpty-dumpty",
  ]) {
    assert.match(nursery, new RegExp(`href="${route}"`));
  }
  assert.equal((nursery.match(/>Sing &amp; record</g) ?? []).length, 6);
});

test("word-game library renders six topic choices and a home link", () => {
  assert.equal(
    typeof WordGameList,
    "function",
    "Expected an executable word-game library",
  );
  const html = renderInRouter(createElement(WordGameList), "/word-games");
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*>Pick a word game<\/h1>/);
  assert.match(html, /aria-label="Back to home"/);
  assert.ok(hrefs.includes("/"));
  assert.deepEqual(
    hrefs.filter((href) => href.startsWith("/word-games/")),
    [
      "/word-games/animals",
      "/word-games/colors",
      "/word-games/body-parts",
      "/word-games/food",
      "/word-games/toys",
      "/word-games/feelings",
    ],
  );
  for (const title of [
    "Animals",
    "Colors",
    "Body Parts",
    "Food",
    "Toys",
    "Feelings",
  ]) {
    assert.match(html, new RegExp(`>${title}<`));
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
  const wordGameLibrary = renderApplicationRoute("/word-games");
  assert.match(wordGameLibrary, /<h1[^>]*>Pick a word game<\/h1>/);
  const wordGame = renderApplicationRoute("/word-games/animals");
  assert.match(wordGame, /<h1[^>]*>Animals<\/h1>/);
  assert.match(wordGame, /Which is the cat\?/);
  assert.match(wordGame, /Start listening/);
  assert.match(wordGame, /aria-valuetext="1 of 6"/);
  const encodedWordGame = renderApplicationRoute("/word-games/%61nimals");
  assert.doesNotMatch(encodedWordGame, /<h1[^>]*>Animals<\/h1>/);
  assert.doesNotMatch(encodedWordGame, /Which is the cat\?/);
  const dub = renderApplicationRoute("/dubs/five-little-ducks");
  assert.match(dub, /Five Little Ducks/);
  assert.match(dub, /Loading your private dub…/);
  const farmDub = renderApplicationRoute("/dubs/old-macdonald");
  assert.match(farmDub, /Old MacDonald Had a Farm/);
  assert.match(farmDub, /Loading your private dub…/);
  for (const [route, title] of [
    ["/dubs/twinkle-twinkle", "Twinkle Twinkle Little Star"],
    ["/dubs/row-row-row-your-boat", "Row Row Row Your Boat"],
    ["/dubs/mary-had-a-little-lamb", "Mary Had a Little Lamb"],
    ["/dubs/humpty-dumpty", "Humpty Dumpty"],
  ]) {
    const rhyme = renderApplicationRoute(route);
    assert.match(rhyme, new RegExp(title));
    assert.match(rhyme, /Loading your private dub…/);
  }

  const retiredProgress = renderApplicationRoute("/progress");
  assert.doesNotMatch(retiredProgress, /Progress|coming soon/i);
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

  assert.match(html, /<h1[^>]*>Peppa&#x27;s High Ball<\/h1>/);
  assert.match(html, /say the big words with the group/);
  assert.doesNotMatch(html, /5 parts|Watch and join in/);
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

test("retired lesson routes do not render retired feature screens", () => {
  for (const route of ["/guardian/lessons", "/lessons/my/create"]) {
    const html = renderApplicationRoute(route);

    assert.doesNotMatch(html, /Made for you|My Lessons|custom lesson/i);
  }
});
