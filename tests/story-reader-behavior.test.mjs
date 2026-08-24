import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
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
const originalSpeechSynthesis = Object.getOwnPropertyDescriptor(
  globalThis,
  "speechSynthesis",
);
const originalSpeechUtterance = Object.getOwnPropertyDescriptor(
  globalThis,
  "SpeechSynthesisUtterance",
);
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
  restoreProperty("speechSynthesis", originalSpeechSynthesis);
  restoreProperty("SpeechSynthesisUtterance", originalSpeechUtterance);
});

after(async () => {
  await vite.close();
  restoreDom();
});

describe("child-first story reader behavior", () => {
  it("reads a page with the English device voice when saved narration is null", async () => {
    const events = [];
    let finishSpeech;

    class TestSpeechUtterance {
      constructor(text) {
        this.text = text;
      }
    }

    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestSpeechUtterance,
    });
    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          events.push("cancel");
        },
        getVoices() {
          return [
            {
              default: true,
              lang: "en-US",
              localService: true,
              name: "Test English",
            },
          ];
        },
        pause() {
          events.push("pause");
        },
        resume() {
          events.push("resume");
        },
        speak(utterance) {
          events.push(`speak:${utterance.text}`);
          finishSpeech = () => utterance.onend?.();
        },
      },
    });

    const container = await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/stories/the-red-ball/pages/1"] },
        createElement(StoryReader, {
          backToStories: "/stories",
          onNavigatePage() {},
          pageIndex: 0,
          story: firstStory,
        }),
      ),
    );
    const readButton = container.querySelector('[aria-label="Listen"]');
    assert.ok(readButton);
    assert.equal(readButton.disabled, false);
    assert.match(container.textContent, /Tap Listen/);

    await click(readButton);
    await waitFor(() =>
      assert.ok(container.querySelector('[aria-label="Pause story"]')),
    );
    assert.deepEqual(events, [
      "speak:Here is my red ball.",
    ]);

    await click(container.querySelector('[aria-label="Pause story"]'));
    await waitFor(() =>
      assert.ok(container.querySelector('[aria-label="Resume story"]')),
    );
    await click(container.querySelector('[aria-label="Resume story"]'));
    assert.deepEqual(events, [
      "speak:Here is my red ball.",
      "pause",
      "resume",
    ]);

    await act(async () => finishSpeech());
    await waitFor(() =>
      assert.deepEqual(events, [
        "speak:Here is my red ball.",
        "pause",
        "resume",
        "speak:Red ball!",
      ]),
    );
    assert.match(container.textContent, /Listen and say it/);

    await act(async () => finishSpeech());
    await waitFor(() =>
      assert.ok(container.querySelector('[aria-label="Listen again"]')),
    );
    assert.match(container.textContent, /Your turn/);
  });

  it("keeps a combined saved narration on the sentence until completion reveals the prompt", async () => {
    const events = [];
    let finishAudio;

    class TestAudio {
      constructor(url) {
        this.url = url;
      }

      pause() {
        events.push("pause");
      }

      play() {
        events.push(`play:${this.url}`);
        finishAudio = () => this.onended?.(new window.Event("ended"));
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
          joinIn: "Dolly!",
          narrationAudioId: "narrator-copy-dolly",
          text: "Let's copy",
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
      '[aria-label="Say it: Dolly!"]',
    );
    assert.ok(prompt);
    const pane = prompt.parentElement;
    assert.ok(pane);
    pane.getBoundingClientRect = () => ({ bottom: 100, top: 0 });
    prompt.getBoundingClientRect = () => ({
      bottom: 140 - pane.scrollTop,
      top: 80 - pane.scrollTop,
    });

    const readButton = container.querySelector('[aria-label="Listen"]');
    assert.ok(readButton);
    await click(readButton);
    await waitFor(() => assert.equal(typeof finishAudio, "function"));
    assert.equal(pane.scrollTop, 0);
    assert.deepEqual(events, [
      "play:/assets/audio/narrator-copy-dolly.mp3",
    ]);

    await act(async () => finishAudio());
    await waitFor(() =>
      assert.ok(container.querySelector('[aria-label="Listen again"]')),
    );
    assert.equal(pane.scrollTop, 40);
    assert.match(container.textContent, /Your turn/);
  });
});
