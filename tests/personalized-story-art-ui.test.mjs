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
const { GuardianLanguageProvider } = await vite.ssrLoadModule(
  "/src/i18n/guardian-language.tsx",
);

const { StoryArtwork } = storyUiModule;
const { StoryReader } = storyReaderModule;
const { STORIES } = storyCatalogModule;
const { LessonUserPrompt } = lessonPlayerUiModule;
const { PersonalizedStoryArtPanel } = panelModule;

after(async () => {
  await vite.close();
});

function renderInRouter(
  element,
  initialEntry = "/stories/the-red-ball/pages/1",
) {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [initialEntry] }, element),
  );
}

function textFromMarkup(markup) {
  return markup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function renderStoryArtwork(props) {
  assert.equal(
    typeof StoryArtwork,
    "function",
    "Expected StoryArtwork to load",
  );
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

function renderSetupPanel(props, language = "en") {
  assert.equal(
    typeof PersonalizedStoryArtPanel,
    "function",
    "Expected PersonalizedStoryArtPanel in src/stories/PersonalizedStoryArtPanel.tsx",
  );
  return renderToStaticMarkup(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: language, storage: null },
      createElement(PersonalizedStoryArtPanel, {
        learnerName: "Mia",
        ...props,
      }),
    ),
  );
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
      src: "https://media.parrotbook.com/assets/v3/stories/the-red-ball-cover.webp",
    };
    const sizes = "(max-width: 519px) calc(100vw - 24px), 273px";

    const publicHtml = renderStoryArtwork({ artwork, sizes });
    assert.match(
      publicHtml,
      new RegExp(`sizes="${sizes.replace(/[()]/g, "\\$&")}"`),
    );
    assert.match(
      publicHtml,
      /srcSet="https:\/\/media\.parrotbook\.com\/assets\/v3\/stories\/the-red-ball-cover-384\.webp 384w, https:\/\/media\.parrotbook\.com\/assets\/v3\/stories\/the-red-ball-cover-768\.webp 768w"/,
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
      "https://media.parrotbook.com/assets/v3/story-pages/the-red-ball-my-red-ball.webp",
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
    assert.match(html, /Choose how to listen/);
    assert.match(html, /aria-label="Listen to this page"/);
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
    const lockedText = textFromMarkup(locked);
    assert.doesNotMatch(locked, />\s*Guardian consent\s*</i);
    assert.match(locked, /I am 18 or older/i);
    assert.match(lockedText, /look like Mia/);
    assert.match(lockedText, /I am Mia's guardian/i);
    assert.match(locked, /Cloudflare Workers AI/i);
    assert.match(locked, /type="checkbox"/);
    assert.match(lockedText, /Upload Mia's photo/);
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
    assert.match(removable, /Regenerate story art/);
    assert.match(removable, /Personalized story art for Mia in The Red Ball/);
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
    assert.doesNotMatch(
      textFromMarkup(html),
      /Upload .* photo|Generate story art/,
    );

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
      status: "removed",
      storyTitle: "The Red Ball",
    });

    assert.match(completed, /Personalized story art removed\./);
    assert.doesNotMatch(
      textFromMarkup(completed),
      /Delete stored story art|Upload .* photo|Generate story art/,
    );
  });

  it("localizes private-art guidance, controls, statuses, and stable failures in Chinese", () => {
    const base = {
      consentChecked: false,
      fileName: "mary.png",
      hasSelectedPhoto: true,
      isGenerating: false,
      learnerName: "Mary",
      onConsentChange() {},
      onFileChange() {},
      onGenerate() {},
      onRemove() {},
      personalizedArtwork: null,
      storyTitle: "The Red Ball",
    };
    const html = renderSetupPanel(base, "zh-Hans");
    const text = textFromMarkup(html);

    assert.match(html, /<section aria-label="个性化故事图片"/);
    assert.match(text, /AI · 私密/);
    assert.match(text, /让 The Red Ball 的第一页看起来像 Mary/);
    assert.match(text, /上传 Mary 的照片/);
    assert.match(text, /已选择：mary\.png/);
    assert.match(text, /我已年满 18 岁/);
    assert.match(text, /Cloudflare Workers AI/);
    assert.match(text, /生成故事图片/);
    assert.match(html, /lang="en"[^>]*>The Red Ball</);
    assert.match(html, /<bdi[^>]*dir="auto"[^>]*>Mary<\/bdi>/);

    const ready = renderSetupPanel(
      {
        ...base,
        consentChecked: true,
        error: "generate-failed",
        personalizedArtwork: {
          alt: "SERVER ALT",
          src: "/api/stories/the-red-ball/personalized-art/asset",
        },
        status: "ready",
      },
      "zh-Hans",
    );
    assert.match(ready, /重新生成故事图片/);
    assert.match(ready, /删除故事图片/);
    assert.match(ready, /故事图片已准备好/);
    assert.match(ready, /无法生成故事图片/);
    assert.doesNotMatch(ready, /SERVER ALT/);

    const pending = renderSetupPanel(
      { ...base, isGenerating: true },
      "zh-Hans",
    );
    assert.match(pending, /正在创建故事图片…/);

    for (const [code, expected] of [
      ["load-failed", /无法加载个性化故事图片/],
      ["generate-failed", /无法生成故事图片/],
      ["delete-failed", /无法删除故事图片/],
    ]) {
      const failed = renderSetupPanel({ ...base, error: code }, "zh-Hans");
      assert.match(failed, expected);
      assert.doesNotMatch(failed, new RegExp(code));
    }

    const cleanup = renderSetupPanel(
      {
        ...base,
        featureEnabled: false,
        hasStoredArt: true,
        isGenerating: true,
      },
      "zh-Hans",
    );
    assert.match(cleanup, /私密图片清理/);
    assert.match(textFromMarkup(cleanup), /删除 Mary 已保存的故事图片/);
    assert.match(cleanup, /正在删除已保存的故事图片…/);

    const removed = renderSetupPanel(
      {
        ...base,
        featureEnabled: false,
        hasStoredArt: false,
        status: "removed",
      },
      "zh-Hans",
    );
    assert.match(removed, /个性化故事图片已删除/);
  });
});
