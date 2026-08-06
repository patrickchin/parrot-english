import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  STORIES,
  UPCOMING_STORIES,
  resolveStory,
} from "../src/stories/story-catalog.ts";
import { getStaticAudioLineForSpeech } from "../lib/static-audio.js";

const storyAssetPaths = [
  "/assets/stories/the-lantern-trail-cover.webp",
  ...Array.from(
    { length: 6 },
    (_, index) =>
      `/assets/stories/the-lantern-trail-${String(index + 1).padStart(2, "0")}.webp`,
  ),
];

const lanternTrailNarrationIds = [
  "story-lantern-trail-the-garden-gate",
  "story-lantern-trail-the-moonlit-stream",
  "story-lantern-trail-the-rain-leaf",
  "story-lantern-trail-the-windy-sunflowers",
  "story-lantern-trail-the-lantern-tree",
  "story-lantern-trail-one-last-glow",
];

function publicAssetUrl(src) {
  return new URL(`../public${src}`, import.meta.url);
}

describe("story catalog", () => {
  it("publishes one complete read-aloud adventure", () => {
    assert.equal(STORIES.length, 1);

    const story = STORIES[0];
    assert.equal(story.id, "the-lantern-trail");
    assert.equal(story.title, "The Lantern Trail");
    assert.equal(story.category, "Adventure");
    assert.equal(story.durationMinutes, 4);
    assert.match(story.summary, /Pip.*firefly.*home/i);
    assert.equal(story.pages.length, 6);
    assert.equal(new Set(story.pages.map(({ id }) => id)).size, 6);
  });

  it("keeps the six page illustrations and join-in lines in story order", () => {
    const story = resolveStory("the-lantern-trail");
    assert.ok(story);
    assert.deepEqual(
      [story.coverSrc, ...story.pages.map(({ imageSrc }) => imageSrc)],
      storyAssetPaths,
    );
    assert.deepEqual(
      story.pages.map(({ joinIn }) => joinIn),
      [
        "Glow, little lantern, show us the way!",
        "Glow, little lantern, show us the way!",
        "Glow, little lantern, show us the way!",
        "Glow, little lantern, show us the way!",
        "Welcome home, Flicker!",
        "Good night, little lantern.",
      ],
    );

    const fullStory = story.pages.map(({ text }) => text).join(" ");
    assert.match(fullStory, /Pip the green parrot/);
    assert.match(fullStory, /Flicker/);
  });

  it("registers one saved narrator performance for every story page", () => {
    const story = resolveStory("the-lantern-trail");
    assert.ok(story);

    for (const [index, page] of story.pages.entries()) {
      const narrationText = `${page.text} ${page.joinIn}`;
      const narration = getStaticAudioLineForSpeech("narrator", narrationText);
      const expectedId = lanternTrailNarrationIds[index];

      assert.equal(narration.id, expectedId);
      assert.equal(narration.src, `/assets/audio/${expectedId}.mp3`);
      assert.equal(
        existsSync(publicAssetUrl(narration.src)),
        true,
        `${expectedId} saved narration exists`,
      );
      assert.ok(
        statSync(publicAssetUrl(narration.src)).size > 0,
        `${expectedId} saved narration is non-empty`,
      );
    }
  });

  it("resolves only exact playable story IDs", () => {
    assert.equal(resolveStory("the-lantern-trail"), STORIES[0]);
    assert.equal(resolveStory("The-Lantern-Trail"), null);
    assert.equal(resolveStory("missing-story"), null);
    assert.equal(resolveStory(undefined), null);
  });

  it("registers three distinct upcoming story examples", () => {
    assert.deepEqual(
      UPCOMING_STORIES.map(({ title }) => title),
      [
        "The Cloud Who Lost Its Rain",
        "The Tiny Dragon’s Big Sneeze",
        "Robot’s First Picnic",
      ],
    );
    for (const story of UPCOMING_STORIES) {
      assert.ok(story.category.trim(), `${story.title} category`);
      assert.ok(story.summary.trim(), `${story.title} summary`);
      assert.ok(story.durationMinutes > 0, `${story.title} duration`);
    }
  });

  it("points every playable image at a non-empty WebP with useful alt text", () => {
    const story = STORIES[0];
    const assets = [
      { alt: story.coverAlt, src: story.coverSrc },
      ...story.pages.map(({ imageAlt: alt, imageSrc: src }) => ({ alt, src })),
    ];

    assert.equal(assets.length, storyAssetPaths.length);
    for (const { alt, src } of assets) {
      assert.ok(alt.trim(), `${src} alt text`);
      assert.match(src, /^\/assets\/stories\/[a-z0-9-]+\.webp$/);

      const assetUrl = publicAssetUrl(src);
      assert.equal(existsSync(assetUrl), true, `${src} exists`);
      assert.ok(statSync(assetUrl).size > 0, `${src} is non-empty`);

      const header = readFileSync(assetUrl).subarray(0, 12);
      assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF", `${src} RIFF header`);
      assert.equal(header.subarray(8, 12).toString("ascii"), "WEBP", `${src} WebP header`);
    }
  });
});
