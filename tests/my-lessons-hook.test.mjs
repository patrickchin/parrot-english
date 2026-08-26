import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useEffect, useState } from "react";
import test from "node:test";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
import {
  cleanupMountedRoots,
  click,
  deferred,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";
import { createHermeticViteServer } from "./helpers/hermetic-vite-server.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
let useMyLessons;
let viteHarness;

test.before(async () => {
  viteHarness = await createHermeticViteServer({
    appType: "custom",
    logLevel: "silent",
    root: projectRoot,
  });
  ({ useMyLessons } = await viteHarness.server.ssrLoadModule(
    "/src/lessons/useMyLessons.ts",
  ));
});

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await viteHarness?.close();
  restoreDom();
});

function descriptor(id, title) {
  return {
    id,
    lesson: createLessonScript({ title }),
    revision: "a".repeat(64),
    source: "uploaded",
  };
}

function Probe({ learnerProfileId, onLessons }) {
  const lessons = useMyLessons({ learnerProfileId });
  useEffect(() => {
    onLessons(lessons);
  }, [lessons, onLessons]);
  return createElement(
    "section",
    null,
    createElement("output", { "aria-label": "Target" }, learnerProfileId),
    createElement("output", { "aria-label": "Phase" }, lessons.phase),
    createElement(
      "output",
      { "aria-label": "Lessons" },
      lessons.lessons.map(({ lesson }) => lesson.title).join(", ") || "none",
    ),
  );
}

function Harness({ onLessons }) {
  const [learnerProfileId, setLearnerProfileId] = useState("learner-a");
  return createElement(
    "section",
    null,
    createElement(
      "button",
      { onClick: () => setLearnerProfileId("learner-b"), type: "button" },
      "Use learner B",
    ),
    createElement(Probe, { learnerProfileId, onLessons }),
  );
}

function output(container, label) {
  return container.querySelector(`output[aria-label="${label}"]`)?.textContent;
}

test("a My Lessons target change aborts stale work and clears the old learner list", async () => {
  const learnerALoads = [];
  const learnerBLoad = deferred();
  let learnerBSignal;
  globalThis.fetch = async (path, init = {}) => {
    const learnerProfileId = new URL(path, "https://example.test").searchParams.get(
      "learnerProfileId",
    );
    if (learnerProfileId === "learner-b") {
      learnerBSignal = init.signal;
      return learnerBLoad.promise;
    }
    const load = deferred();
    learnerALoads.push({ ...load, path, signal: init.signal });
    return load.promise;
  };

  let lessons;
  const container = await mountStrict(
    createElement(Harness, {
      onLessons: (nextLessons) => (lessons = nextLessons),
    }),
  );
  await waitFor(() => assert.equal(learnerALoads.length, 2));
  assert.ok(
    learnerALoads.every(
      ({ path }) =>
        path === "/api/lessons/my?learnerProfileId=learner-a",
    ),
  );

  await act(async () => {
    learnerALoads[1].resolve(
      Response.json({ lessons: [descriptor("lesson-a", "Learner A lesson")] }),
    );
    await learnerALoads[1].promise;
  });
  await waitFor(() =>
    assert.equal(output(container, "Lessons"), "Learner A lesson"),
  );

  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Use learner B",
    ),
  );
  await waitFor(() => assert.equal(output(container, "Target"), "learner-b"));
  assert.equal(output(container, "Phase"), "loading");
  assert.equal(output(container, "Lessons"), "none");
  assert.ok(learnerALoads.every(({ signal }) => signal.aborted));
  assert.equal(learnerBSignal.aborted, false);

  await act(async () => {
    learnerALoads[0].resolve(
      Response.json({ lessons: [descriptor("stale-a", "Stale learner A lesson")] }),
    );
    learnerBLoad.resolve(
      Response.json({ lessons: [descriptor("lesson-b", "Learner B lesson")] }),
    );
    await Promise.all([learnerALoads[0].promise, learnerBLoad.promise]);
  });
  await waitFor(() =>
    assert.equal(output(container, "Lessons"), "Learner B lesson"),
  );
  assert.equal(lessons.phase, "ready");
});
