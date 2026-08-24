import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { after, describe, it } from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const storyUiModule = await vite
  .ssrLoadModule("/src/stories/StoryArtwork.tsx")
  .catch(() => ({}));
const storyReaderModule = await vite
  .ssrLoadModule("/src/stories/StoryReader.tsx")
  .catch(() => ({}));
const storyCatalogModule = await vite
  .ssrLoadModule("/src/stories/story-catalog.ts")
  .catch(() => ({}));
const lessonPlayerUiModule = await vite
  .ssrLoadModule("/src/lessons/LessonPlayerUi.tsx")
  .catch(() => ({}));
const panelModule = await vite
  .ssrLoadModule("/src/stories/PersonalizedStoryArtPanel.tsx")
  .catch(() => ({}));

const { StoryArtwork } = storyUiModule;
const { StoryReader } = storyReaderModule;
const { STORIES } = storyCatalogModule;
const { LessonUserPrompt } = lessonPlayerUiModule;
const { PersonalizedStoryArtPanel } = panelModule;

after(async () => {
  await vite.close();
});

function renderInRouter(element, initialEntry = "/stories/the-red-ball/pages/1") {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [initialEntry] }, element),
  );
}

function renderStoryArtwork(props) {
  assert.equal(typeof StoryArtwork, "function", "Expected StoryArtwork to load");
  return renderToStaticMarkup(createElement(StoryArtwork, props));
}

function renderStoryReader(props) {
  assert.equal(typeof StoryReader, "function", "Expected StoryReader to load");
  return renderInRouter(createElement(StoryReader, props));
}

function renderLessonUserPrompt(props) {
  assert.equal(
    typeof LessonUserPrompt,
    "function",
    "Expected LessonUserPrompt to load",
  );
  return renderToStaticMarkup(createElement(LessonUserPrompt, props));
}

function renderSetupPanel(props) {
  assert.equal(
    typeof PersonalizedStoryArtPanel,
    "function",
    "Expected PersonalizedStoryArtPanel in src/stories/PersonalizedStoryArtPanel.tsx",
  );
  return renderToStaticMarkup(createElement(PersonalizedStoryArtPanel, props));
}

describe("personalized story art UI", () => {
  it("renders script-only artwork as an accessible storybook scene without prototype copy", () => {
    const html = renderStoryArtwork({
      artwork: {
        alt: "Artwork placeholder for The Red Ball, page 1",
        prompt: "A child holding one bright red ball",
        src: null,
      },
    });

    assert.match(
      html,
      /role="img"[^>]*aria-label="A child holding one bright red ball"|aria-label="A child holding one bright red ball"[^>]*role="img"/,
    );
    assert.doesNotMatch(html, /Artwork placeholder|Picture coming later/);
  });

  it("lets StoryArtwork prefer a private override image over the catalog placeholder", () => {
    const html = renderStoryArtwork({
      artwork: {
        alt: "Artwork placeholder for The Red Ball, page 1",
        prompt: "A child holding one bright red ball",
        src: null,
      },
      personalizedOverride: {
        alt: "You holding a bright red ball",
        src: "/api/stories/the-red-ball/personalized-art/asset",
      },
    });

    assert.match(
      html,
      /<img[^>]*alt="You holding a bright red ball"[^>]*src="\/api\/stories\/the-red-ball\/personalized-art\/asset"/,
    );
    assert.doesNotMatch(html, /Artwork placeholder|Picture coming later/);
  });

  it("offers responsive public cover art without rewriting a private override", () => {
    const artwork = {
      alt: "A red ball",
      prompt: "A red ball",
      src: "https://media.parrotbook.com/assets/v1/stories/the-red-ball-cover.webp",
    };
    const sizes = "(max-width: 519px) calc(100vw - 24px), 273px";

    const publicHtml = renderStoryArtwork({ artwork, sizes });
    assert.match(publicHtml, new RegExp(`sizes="${sizes.replace(/[()]/g, "\\$&")}"`));
    assert.match(
      publicHtml,
      /srcSet="https:\/\/media\.parrotbook\.com\/assets\/v1\/stories\/the-red-ball-cover-384\.webp 384w, https:\/\/media\.parrotbook\.com\/assets\/v1\/stories\/the-red-ball-cover-768\.webp 768w"/,
    );

    const privateHtml = renderStoryArtwork({
      artwork,
      personalizedOverride: {
        alt: "You holding a red ball",
        src: "/api/stories/the-red-ball/personalized-art/asset",
      },
      sizes,
    });
    assert.doesNotMatch(privateHtml, /srcSet=|sizes=/);
  });

  it("lets StoryReader render one private override for The Red Ball page 1 without mutating the illustrated catalog story", () => {
    assert.ok(Array.isArray(STORIES), "Expected story catalog stories");
    const story = STORIES.find(({ id }) => id === "the-red-ball");
    assert.ok(story, "Expected The Red Ball in the story catalog");
    assert.equal(story.pages[0].id, "my-red-ball");
    const catalogArtworkSource = story.pages[0].artwork.src;
    assert.equal(
      catalogArtworkSource,
      "https://media.parrotbook.com/assets/v1/story-pages/the-red-ball-my-red-ball.webp",
    );

    const html = renderStoryReader({
      backToStories: "/stories",
      onNavigatePage() {},
      pageIndex: 0,
      personalizedOverrides: {
        "the-red-ball": {
          pages: {
            "my-red-ball": {
              alt: "You holding a bright red ball",
              src: "/api/stories/the-red-ball/personalized-art/asset",
            },
          },
        },
      },
      story,
    });

    assert.equal(story.pages[0].artwork.src, catalogArtworkSource);

    assert.match(html, /The Red Ball/);
    assert.match(
      html,
      /<img[^>]*alt="You holding a bright red ball"[^>]*src="\/api\/stories\/the-red-ball\/personalized-art\/asset"/,
    );
    assert.doesNotMatch(html, /Picture coming later/);
    assert.match(html, /Tap Listen/);
    assert.match(html, /aria-label="Listen"/);
    assert.doesNotMatch(html, /Words to notice|First words|One object/);
  });

  it("lets LessonUserPrompt show the same private art as an accessible storybook portrait during user turns", () => {
    const html = renderLessonUserPrompt({
      dialogue: "What color is it?",
      portrait: {
        alt: "You in storybook style",
        src: "/api/stories/the-red-ball/personalized-art/asset",
      },
    });

    assert.match(html, /aria-label="Your turn"/);
    assert.match(html, /What color is it\?/);
    assert.match(
      html,
      /<img[^>]*alt="You in storybook style"[^>]*src="\/api\/stories\/the-red-ball\/personalized-art\/asset"/,
    );
  });

  it("requires guardian consent and exposes generate and remove states in the setup panel", () => {
    const locked = renderSetupPanel({
      consentChecked: false,
      hasSelectedPhoto: false,
      isGenerating: false,
      onConsentChange() {},
      onFileChange() {},
      onGenerate() {},
      onRemove() {},
      personalizedArtwork: null,
      storyTitle: "The Red Ball",
    });
    assert.match(locked, /guardian consent/i);
    assert.match(locked, /I am 18 or older/i);
    assert.match(locked, /Cloudflare Workers AI/i);
    assert.match(locked, /type="checkbox"/);
    assert.match(locked, /Upload learner photo/);
    assert.match(locked, /Generate story art/);
    assert.match(locked, /disabled=""/);

    const generating = renderSetupPanel({
      consentChecked: true,
      hasSelectedPhoto: true,
      isGenerating: true,
      onConsentChange() {},
      onFileChange() {},
      onGenerate() {},
      onRemove() {},
      personalizedArtwork: null,
      storyTitle: "The Red Ball",
    });
    assert.match(generating, /Creating story art/i);

    const removable = renderSetupPanel({
      consentChecked: true,
      hasSelectedPhoto: false,
      isGenerating: false,
      onConsentChange() {},
      onFileChange() {},
      onGenerate() {},
      onRemove() {},
      personalizedArtwork: {
        alt: "You holding a bright red ball",
        src: "/api/stories/the-red-ball/personalized-art/asset",
      },
      storyTitle: "The Red Ball",
    });
    assert.match(removable, /Delete story art/);
    assert.match(removable, /You holding a bright red ball/);
  });

  it("keeps private-art cleanup available and confirms it when generation is disabled", () => {
    const html = renderSetupPanel({
      consentChecked: false,
      featureEnabled: false,
      hasStoredArt: true,
      isGenerating: false,
      onConsentChange() {},
      onFileChange() {},
      onGenerate() {},
      onRemove() {},
      personalizedArtwork: null,
      storyTitle: "The Red Ball",
    });

    assert.match(html, /aria-label="Personalized story art"/);
    assert.match(html, /Delete stored story art/);
    assert.doesNotMatch(html, /Upload learner photo|Generate story art/);

    const completed = renderSetupPanel({
      consentChecked: false,
      featureEnabled: false,
      hasStoredArt: false,
      isGenerating: false,
      onConsentChange() {},
      onFileChange() {},
      onGenerate() {},
      onRemove() {},
      personalizedArtwork: null,
      statusMessage: "Personalized story art removed.",
      storyTitle: "The Red Ball",
    });

    assert.match(completed, /Personalized story art removed\./);
    assert.doesNotMatch(
      completed,
      /Delete stored story art|Upload learner photo|Generate story art/,
    );
  });
});
