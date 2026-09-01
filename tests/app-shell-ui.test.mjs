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
const wordGameCategoryModule = await vite
  .ssrLoadModule("/src/games/WordGameCategory.tsx")
  .catch(() => ({}));
const wordGameCatalogModule = await vite
  .ssrLoadModule("/src/games/word-game-catalog.ts")
  .catch(() => ({}));
const appModule = await vite
  .ssrLoadModule("/src/app/App.tsx")
  .catch(() => ({}));
const { LearnerProfileProvider, LearnerSelectionProvider } =
  await vite.ssrLoadModule("/src/learner-profile/LearnerProfileContext.tsx");
const { HomeMenu } = homeModule;
const { FeaturePlaceholder } = placeholderModule;
const { WordGameList } = wordGameListModule;
const { WordGameCategory } = wordGameCategoryModule;
const { resolveWordGameCategory } = wordGameCatalogModule;
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
  assert.equal((html.match(/<img alt=""/g) ?? []).length, 4);
  assert.match(
    html,
    /<img[^>]*alt="A friendly cat\."[^>]*height="512"[^>]*src="\/assets\/word-games\/noto\/emoji_u1f431\.svg"[^>]*width="512"/,
  );
  assert.match(
    html,
    /<img[^>]*sizes="\(max-width: 767px\) calc\(\(100vw - 3.25rem\) \/ 2\), \(max-width: 1279px\) calc\(\(100vw - 7rem\) \/ 3\), min\(calc\(\(100vw - 8rem\) \/ 5\), 15rem\)"[^>]*src="https:\/\/media\.parrotbook\.com\/assets\/v6\/dubbing\/nursery-rhymes-cover\.webp"[^>]*srcSet="https:\/\/media\.parrotbook\.com\/assets\/v6\/dubbing\/nursery-rhymes-cover-384\.webp 384w, https:\/\/media\.parrotbook\.com\/assets\/v6\/dubbing\/nursery-rhymes-cover-768\.webp 768w, https:\/\/media\.parrotbook\.com\/assets\/v6\/dubbing\/nursery-rhymes-cover\.webp 1536w"/,
  );
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
  assert.match(nursery, />Ask a grown-up before recording\.<\/p>/);
  assert.doesNotMatch(nursery, /Sing &amp; record/);
  assert.equal((nursery.match(/<img[^>]*srcSet="[^"]+"/g) ?? []).length, 6);
  assert.equal(
    (nursery.match(/sizes="\(max-width: 519px\) calc\(100vw - 1.5rem\), \(max-width: 1023px\) calc\(\(100vw - 3rem\) \/ 2\), min\(calc\(\(100vw - 10rem\) \/ 3\), 25rem\)"/g) ?? []).length,
    6,
  );
});

test("word-game library renders nine category choices and a home link", () => {
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
  assert.doesNotMatch(
    html,
    /Parrot English|Listen, look, and choose|Listen and find the|>Start\s*</,
  );
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
      "/word-games/home",
      "/word-games/clothes",
      "/word-games/transport",
    ],
  );
  for (const title of [
    "Animals",
    "Colors",
    "Body Parts",
    "Food",
    "Toys",
    "Feelings",
    "Home",
    "Clothes",
    "Transport",
  ]) {
    assert.match(html, new RegExp(`>${title}<`));
  }
  assert.match(html, /<img[^>]*alt="A friendly cat\."[^>]*src="\/assets\/word-games\/noto\/emoji_u1f431\.svg"/);
});

test("word-game category renders ordered tier sections and canonical quiz links", () => {
  assert.equal(typeof WordGameCategory, "function");
  const category = resolveWordGameCategory("animals");
  assert.ok(category);
  const html = renderInRouter(
    createElement(WordGameCategory, { category }),
    "/word-games/animals",
  );
  const headings = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(([, heading]) => heading);
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(([, href]) => href);

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*>Animals<\/h1>/);
  assert.deepEqual(headings, ["Simple", "Intermediate", "Advanced"]);
  assert.deepEqual(hrefs.filter((href) => href.startsWith("/word-games/animals/")), [
    "/word-games/animals/simple-1",
    "/word-games/animals/intermediate-1",
    "/word-games/animals/advanced-1",
  ]);
  assert.match(html, /aria-label="Back to word games"/);
  assert.match(html, /<img[^>]*alt="A friendly cat\."/);
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
  const wordGameCategory = renderApplicationRoute("/word-games/animals");
  assert.match(wordGameCategory, /<h1[^>]*>Animals<\/h1>/);
  assert.match(wordGameCategory, /<h2[^>]*>Simple<\/h2>/);
  assert.match(wordGameCategory, /href="\/word-games\/animals\/advanced-1"/);
  const wordGame = renderApplicationRoute("/word-games/animals/simple-1");
  assert.match(wordGame, /<h1[^>]*>Simple animals<\/h1>/);
  assert.match(wordGame, /Cat\. Which is the cat\?/);
  assert.match(wordGame, /aria-label="Choose cat"/);
  assert.match(wordGame, /aria-valuetext="1 of 6"/);
  const encodedWordGame = renderApplicationRoute("/word-games/%61nimals");
  assert.doesNotMatch(encodedWordGame, /<h1[^>]*>Animals<\/h1>/);
  assert.doesNotMatch(encodedWordGame, /Cat\. Which is the cat\?/);
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
