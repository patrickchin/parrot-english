import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useState } from "react";
import { MemoryRouter } from "react-router";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let StoryReader;
let firstStory;

before(async () => {
  ({ StoryReader } = await vite.ssrLoadModule(
    "/src/stories/StoryReader.tsx",
  ));
  const { STORIES } = await vite.ssrLoadModule(
    "/src/stories/story-catalog.ts",
  );
  firstStory = STORIES.find(({ id }) => id === "the-red-ball");
});

function restoreProperty(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  restoreProperty("Audio", originalAudio);
});

after(async () => {
  await vite.close();
  restoreDom();
});

describe("child-first story reader behavior", () => {
  it("reveals the prompt between separate saved narration and join-in clips", async () => {
    const events = [];
    const finishAudio = [];
    let createdCount = 0;

    class TestAudio {
      constructor(url) {
        createdCount += 1;
        this.url = url;
      }

      set src(url) {
        this.url = url;
      }

      pause() {
        events.push("pause");
      }

      play() {
        events.push(`play:${this.url}`);
        const onended = this.onended;
        finishAudio.push(() => onended?.(new window.Event("ended")));
        return Promise.resolve();
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: TestAudio,
    });
    const savedStory = {
      ...firstStory,
      id: "saved-narration-test",
      pages: [
        {
          ...firstStory.pages[0],
          joinIn: "Let's copy Peppa!",
          joinInAudioId: "narrator-copy-peppa",
          narrationAudioId: "narrator-copy-dolly",
          text: "Let's copy Dolly!",
        },
      ],
    };
    const container = await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/stories/saved-narration-test/pages/1"] },
        createElement(StoryReader, {
          backToStories: "/stories",
          onNavigatePage() {},
          pageIndex: 0,
          story: savedStory,
        }),
      ),
    );
    const prompt = container.querySelector(
      '[aria-label="Say it: Let\'s copy Peppa!"]',
    );
    assert.ok(prompt);
    const pane = prompt.parentElement;
    assert.ok(pane);
    pane.getBoundingClientRect = () => ({ bottom: 100, top: 0 });
    prompt.getBoundingClientRect = () => ({
      bottom: 140 - pane.scrollTop,
      top: 80 - pane.scrollTop,
    });

    const readButton = container.querySelector(
      '[aria-label="Listen to this page"]',
    );
    assert.ok(readButton);
    await click(readButton);
    await waitFor(() => assert.equal(finishAudio.length, 1));
    assert.equal(pane.scrollTop, 0);
    assert.deepEqual(events, [
      "play:/assets/audio/narrator-copy-dolly.mp3",
    ]);

    await act(async () => finishAudio.shift()());
    await waitFor(() => assert.equal(finishAudio.length, 1));
    assert.equal(pane.scrollTop, 40);
    assert.match(container.textContent, /Listen and say it/);
    assert.deepEqual(events, [
      "play:/assets/audio/narrator-copy-dolly.mp3",
      "play:/assets/audio/narrator-copy-peppa.mp3",
    ]);
    assert.equal(createdCount, 1);

    await act(async () => finishAudio.shift()());
    await waitFor(() =>
      assert.ok(
        container.querySelector('[aria-label="Listen to this page again"]'),
      ),
    );
    assert.equal(pane.scrollTop, 40);
    assert.match(container.textContent, /Your turn/);
  });

  it("plays saved narration when a read-aloud has no join-in clip", async () => {
    const finishAudio = [];
    const playedUrls = [];

    class TestAudio {
      constructor(url) {
        this.url = url;
      }

      set src(url) {
        this.url = url;
      }

      pause() {}

      play() {
        playedUrls.push(this.url);
        const onended = this.onended;
        finishAudio.push(() => onended?.(new window.Event("ended")));
        return Promise.resolve();
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: TestAudio,
    });
    const savedNarrationStory = {
      ...firstStory,
      id: "saved-narration-only-test",
      pages: [
        {
          ...firstStory.pages[0],
          joinInAudioId: null,
          narrationAudioId: "narrator-copy-dolly",
          text: "Let's copy Dolly!",
        },
      ],
    };
    const container = await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/stories/saved-narration-only-test/pages/1"] },
        createElement(StoryReader, {
          backToStories: "/stories",
          onNavigatePage() {},
          pageIndex: 0,
          story: savedNarrationStory,
        }),
      ),
    );

    await click(
      container.querySelector('[aria-label="Listen to this page"]'),
    );
    await waitFor(() => assert.equal(finishAudio.length, 1));
    assert.deepEqual(playedUrls, [
      "/assets/audio/narrator-copy-dolly.mp3",
    ]);

    await act(async () => finishAudio.shift()());
    await waitFor(() =>
      assert.ok(
        container.querySelector('[aria-label="Listen to this page again"]'),
      ),
    );
  });

  it("starts and advances when whole-story playback is enabled", async () => {
    const navigatedPages = [];
    const finishAudio = [];
    const playedUrls = [];
    let createdCount = 0;

    class TestAudio {
      constructor(url) {
        createdCount += 1;
        this.url = url;
      }

      set src(url) {
        this.url = url;
      }

      pause() {}

      play() {
        playedUrls.push(this.url);
        const onended = this.onended;
        finishAudio.push(() => onended?.(new window.Event("ended")));
        return Promise.resolve();
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: TestAudio,
    });

    function WholeStoryHarness() {
      const [pageIndex, setPageIndex] = useState(0);
      return createElement(StoryReader, {
        backToStories: "/stories",
        onNavigatePage(pageIndex) {
          navigatedPages.push(pageIndex);
          setPageIndex(pageIndex);
        },
        pageIndex,
        story: firstStory,
      });
    }

    const container = await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/stories/the-red-ball/pages/1"] },
        createElement(WholeStoryHarness),
      ),
    );

    const wholeStoryButton = container.querySelector(
      '[aria-label="Keep playing to the end"]',
    );
    assert.ok(wholeStoryButton);
    await click(wholeStoryButton);
    await waitFor(() => assert.equal(finishAudio.length, 1));
    assert.equal(wholeStoryButton.getAttribute("aria-pressed"), "true");

    await act(async () => finishAudio.shift()());
    await waitFor(() => assert.equal(finishAudio.length, 1));
    assert.match(container.textContent, /Listen and say it/);

    await act(async () => finishAudio.shift()());
    await waitFor(() => assert.deepEqual(navigatedPages, [1]));
    await waitFor(() => assert.equal(finishAudio.length, 1));
    assert.equal(createdCount, 1);
    assert.deepEqual(playedUrls, [
      `/assets/audio/${firstStory.pages[0].narrationAudioId}.mp3`,
      `/assets/audio/${firstStory.pages[0].joinInAudioId}.mp3`,
      `/assets/audio/${firstStory.pages[1].narrationAudioId}.mp3`,
    ]);
  });

  it("finishes with one focused heading and the story recap", async () => {
    const container = await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/stories/the-red-ball/pages/5"] },
        createElement(StoryReader, {
          backToStories: "/stories",
          onNavigatePage() {},
          pageIndex: firstStory.pages.length - 1,
          story: firstStory,
        }),
      ),
    );

    const finishButton = container.querySelector(
      '[aria-label="Finish story"]',
    );
    assert.ok(finishButton);
    await click(finishButton);

    await waitFor(() => {
      const completion = container.querySelector(
        '[aria-label="Story finished"]',
      );
      assert.ok(completion);
      const headings = completion.querySelectorAll("h1");
      assert.equal(headings.length, 1);
      assert.equal(headings[0].textContent.trim(), "Great job!");
      assert.equal(document.activeElement, headings[0]);
      assert.match(completion.textContent, /The red ball is home\./);
      assert.doesNotMatch(completion.textContent, /The end!/);
      assert.match(completion.textContent, /Start again/);
      assert.match(completion.textContent, /Pick another story/);
    });
  });
});
