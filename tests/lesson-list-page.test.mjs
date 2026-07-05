import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const navigationUrl = new URL("../src/app-navigation.ts", import.meta.url);

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

test.after(async () => {
  await vite.close();
});

test("app navigation opens only available lessons and returns to the list", async () => {
  assert.equal(
    existsSync(navigationUrl),
    true,
    "Expected src/app-navigation.ts to define list-first navigation",
  );

  const {
    createInitialAppNavigation,
    reduceAppNavigation,
  } = await vite.ssrLoadModule("/src/app-navigation.ts");
  const availableLessonIds = new Set(["available"]);
  const initial = createInitialAppNavigation();

  assert.deepEqual(initial, { activeLessonId: null });
  assert.deepEqual(
    reduceAppNavigation(
      initial,
      { type: "OPEN_LESSON", lessonId: "available" },
      availableLessonIds,
    ),
    { activeLessonId: "available" },
  );
  assert.equal(
    reduceAppNavigation(
      initial,
      { type: "OPEN_LESSON", lessonId: "missing" },
      availableLessonIds,
    ),
    initial,
  );
  assert.deepEqual(
    reduceAppNavigation(
      { activeLessonId: "available" },
      { type: "BACK_TO_LIST" },
      availableLessonIds,
    ),
    { activeLessonId: null },
  );
});
