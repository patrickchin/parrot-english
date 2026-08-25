import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement, useEffect, useState } from "react";
import test from "node:test";
import {
  cleanupMountedRoots,
  click,
  deferred,
  flush,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";
import { createHermeticViteServer } from "./helpers/hermetic-vite-server.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(
  globalThis,
  "createImageBitmap",
);
const originalOffscreenCanvas = Object.getOwnPropertyDescriptor(
  globalThis,
  "OffscreenCanvas",
);
let decodeImage = async () => ({ height: 480, width: 480 });
let usePersonalizedStoryArt;
let viteHarness;

class TestCanvas {
  constructor(width, height) {
    this.height = height;
    this.width = width;
  }

  async convertToBlob() {
    return new Blob(["png"], { type: "image/png" });
  }

  getContext() {
    return { clearRect() {}, drawImage() {} };
  }
}

Object.defineProperty(globalThis, "createImageBitmap", {
  configurable: true,
  value: (image) => decodeImage(image),
});
Object.defineProperty(globalThis, "OffscreenCanvas", {
  configurable: true,
  value: TestCanvas,
});

test.before(async () => {
  viteHarness = await createHermeticViteServer({
    appType: "custom",
    logLevel: "silent",
    root: projectRoot,
  });
  ({ usePersonalizedStoryArt } = await viteHarness.server.ssrLoadModule(
    "/src/stories/usePersonalizedStoryArt.ts",
  ));
});

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  decodeImage = async () => ({ height: 480, width: 480 });
});

test.after(async () => {
  try {
    await viteHarness?.close();
  } finally {
    restoreDom();
    if (originalCreateImageBitmap) {
      Object.defineProperty(
        globalThis,
        "createImageBitmap",
        originalCreateImageBitmap,
      );
    } else {
      Reflect.deleteProperty(globalThis, "createImageBitmap");
    }
    if (originalOffscreenCanvas) {
      Object.defineProperty(
        globalThis,
        "OffscreenCanvas",
        originalOffscreenCanvas,
      );
    } else {
      Reflect.deleteProperty(globalThis, "OffscreenCanvas");
    }
  }
});

function metadata(alt, version = 1) {
  return {
    enabled: true,
    guardianConsentVersion: "storybook-consent-v1",
    hasStoredArt: true,
    stories: {
      "the-red-ball": {
        pages: {
          "my-red-ball": {
            alt,
            src: `/api/stories/the-red-ball/personalized-art/asset?v=${version}`,
          },
        },
      },
    },
  };
}

function ArtHookProbe({ learnerId = "learner-a", onArt }) {
  const art = usePersonalizedStoryArt();
  useEffect(() => {
    onArt(art);
  }, [art, onArt]);
  return createElement(
    "section",
    { "aria-label": `Art for ${learnerId}` },
    createElement("output", { "aria-label": "Learner" }, learnerId),
    createElement(
      "output",
      { "aria-label": "Artwork" },
      art.personalizedArtwork?.alt ?? "none",
    ),
    createElement("output", { "aria-label": "Art error" }, art.error || "none"),
    createElement(
      "output",
      { "aria-label": "Art status" },
      art.statusMessage || "none",
    ),
    createElement(
      "output",
      { "aria-label": "Art busy" },
      art.isGenerating ? "yes" : "no",
    ),
  );
}

function KeyedArtHarness({ onArt, onSwitch }) {
  const [learnerId, setLearnerId] = useState("learner-a");
  return createElement(
    "section",
    null,
    createElement(
      "button",
      {
        onClick: () => {
          onSwitch("learner-b");
          setLearnerId("learner-b");
        },
        type: "button",
      },
      "Use learner B",
    ),
    createElement(ArtHookProbe, { key: learnerId, learnerId, onArt }),
  );
}

function output(container, label) {
  return container.querySelector(`output[aria-label="${label}"]`)?.textContent;
}

async function prepareGeneration(getArt) {
  await act(async () => {
    getArt().setConsentChecked(true);
    getArt().setSelectedFile(
      new File([new Uint8Array([1, 2, 3])], "learner.png", {
        type: "image/png",
      }),
    );
  });
}

test("a delete replacement aborts pending loads and rejects their late state", async () => {
  const loads = [];
  const deletion = deferred();
  let deleteSignal;
  globalThis.fetch = async (_path, init = {}) => {
    if (init.method === "GET") {
      const request = deferred();
      loads.push({ ...request, signal: init.signal });
      return request.promise;
    }
    if (init.method === "DELETE") {
      deleteSignal = init.signal;
      return deletion.promise;
    }
    throw new Error(`Unexpected art request: ${init.method}`);
  };
  let art;
  const container = await mountStrict(
    createElement(ArtHookProbe, { onArt: (nextArt) => (art = nextArt) }),
  );
  await waitFor(() => assert.equal(loads.length, 2));

  await act(() => void art.remove());
  await waitFor(() => assert.ok(deleteSignal));
  assert.ok(loads.every(({ signal }) => signal instanceof AbortSignal));
  assert.ok(loads.every(({ signal }) => signal.aborted));
  assert.equal(deleteSignal.aborted, false);

  await act(async () => {
    loads[0].resolve(Response.json(metadata("old learner art", 11)));
    loads[1].reject(new Error("old learner load failed"));
    await Promise.allSettled(loads.map(({ promise }) => promise));
  });
  await flush();
  assert.equal(output(container, "Artwork"), "none");
  assert.equal(output(container, "Art error"), "none");
  assert.equal(output(container, "Art status"), "none");
  assert.equal(output(container, "Art busy"), "yes");

  await act(async () => {
    deletion.resolve(Response.json({ ok: true }));
    await deletion.promise;
  });
  await waitFor(() => assert.equal(output(container, "Art busy"), "no"));
  assert.equal(output(container, "Art status"), "Personalized story art removed.");
});

test("a delete replacement keeps late generated art from committing", async () => {
  const generation = deferred();
  const deletion = deferred();
  let generateSignal;
  let deleteSignal;
  globalThis.fetch = async (_path, init = {}) => {
    if (init.method === "GET") return Response.json(metadata("current art", 1));
    if (init.method === "POST") {
      generateSignal = init.signal;
      return generation.promise;
    }
    if (init.method === "DELETE") {
      deleteSignal = init.signal;
      return deletion.promise;
    }
    throw new Error(`Unexpected art request: ${init.method}`);
  };
  let art;
  const container = await mountStrict(
    createElement(ArtHookProbe, { onArt: (nextArt) => (art = nextArt) }),
  );
  await waitFor(() => assert.equal(output(container, "Artwork"), "current art"));
  await prepareGeneration(() => art);
  await act(() => void art.generate());
  await waitFor(() => assert.ok(generateSignal));
  await act(() => void art.remove());
  await waitFor(() => assert.ok(deleteSignal));

  assert.equal(generateSignal.aborted, true);
  assert.equal(deleteSignal.aborted, false);
  await act(async () => {
    generation.resolve(Response.json(metadata("stale generated art", 2)));
    await generation.promise;
  });
  await flush();
  assert.equal(output(container, "Artwork"), "current art");
  assert.equal(output(container, "Art error"), "none");
  assert.equal(output(container, "Art status"), "none");
  assert.equal(output(container, "Art busy"), "yes");

  await act(async () => {
    deletion.resolve(Response.json({ ok: true }));
    await deletion.promise;
  });
  await waitFor(() => assert.equal(output(container, "Art busy"), "no"));
  assert.equal(output(container, "Artwork"), "none");
  assert.equal(output(container, "Art status"), "Personalized story art removed.");
});

test("a generate replacement keeps a late delete from clearing art or loading", async () => {
  const deletion = deferred();
  const generation = deferred();
  let deleteSignal;
  let generateSignal;
  globalThis.fetch = async (_path, init = {}) => {
    if (init.method === "GET") return Response.json(metadata("current art", 1));
    if (init.method === "DELETE") {
      deleteSignal = init.signal;
      return deletion.promise;
    }
    if (init.method === "POST") {
      generateSignal = init.signal;
      return generation.promise;
    }
    throw new Error(`Unexpected art request: ${init.method}`);
  };
  let art;
  const container = await mountStrict(
    createElement(ArtHookProbe, { onArt: (nextArt) => (art = nextArt) }),
  );
  await waitFor(() => assert.equal(output(container, "Artwork"), "current art"));
  await act(() => void art.remove());
  await waitFor(() => assert.ok(deleteSignal));
  await prepareGeneration(() => art);
  await act(() => void art.generate());
  await waitFor(() => assert.ok(generateSignal));

  assert.equal(deleteSignal.aborted, true);
  assert.equal(generateSignal.aborted, false);
  await act(async () => {
    deletion.resolve(Response.json({ ok: true }));
    await deletion.promise;
  });
  await flush();
  assert.equal(output(container, "Artwork"), "current art");
  assert.equal(output(container, "Art error"), "none");
  assert.equal(output(container, "Art status"), "none");
  assert.equal(output(container, "Art busy"), "yes");

  await act(async () => {
    generation.resolve(Response.json(metadata("new generated art", 3)));
    await generation.promise;
  });
  await waitFor(() => assert.equal(output(container, "Art busy"), "no"));
  assert.equal(output(container, "Artwork"), "new generated art");
  assert.equal(output(container, "Art status"), "Story art ready");
});

test("a keyed learner switch during normalization cannot post old learner art", async () => {
  const normalization = deferred();
  decodeImage = async () => normalization.promise;
  let activeLearner = "learner-a";
  let postCalls = 0;
  globalThis.fetch = async (_path, init = {}) => {
    if (init.method === "GET") {
      return Response.json(
        metadata(
          activeLearner === "learner-a" ? "learner A art" : "learner B art",
          activeLearner === "learner-a" ? 1 : 2,
        ),
      );
    }
    if (init.method === "POST") {
      postCalls += 1;
      return Response.json(metadata("old learner generated art", 3));
    }
    throw new Error(`Unexpected art request: ${init.method}`);
  };
  let art;
  const container = await mountStrict(
    createElement(KeyedArtHarness, {
      onArt: (nextArt) => (art = nextArt),
      onSwitch: (learnerId) => (activeLearner = learnerId),
    }),
  );
  await waitFor(() => assert.equal(output(container, "Artwork"), "learner A art"));
  await prepareGeneration(() => art);
  await act(() => void art.generate());
  await waitFor(() => assert.equal(output(container, "Art busy"), "yes"));

  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Use learner B",
    ),
  );
  await waitFor(() => assert.equal(output(container, "Artwork"), "learner B art"));
  await act(async () => {
    normalization.resolve({ height: 480, width: 480 });
    await normalization.promise;
  });
  await flush();

  assert.equal(postCalls, 0);
  assert.equal(output(container, "Learner"), "learner-b");
  assert.equal(output(container, "Artwork"), "learner B art");
  assert.equal(output(container, "Art error"), "none");
  assert.equal(output(container, "Art status"), "none");
  assert.equal(output(container, "Art busy"), "no");
});

test("uses a hermetic Vite module-transform server", () => {
  assert.equal(viteHarness.server.config.configFile, undefined);
  assert.equal(viteHarness.server.config.envDir, false);
  assert.equal(path.isAbsolute(viteHarness.server.config.cacheDir), true);
  assert.equal(path.dirname(viteHarness.server.config.cacheDir), os.tmpdir());
});
