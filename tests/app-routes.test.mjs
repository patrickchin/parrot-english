import assert from "node:assert/strict";
import { fileURLToPath, URLSearchParams } from "node:url";
import { after, describe, it } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const routes = await vite.ssrLoadModule("/src/app-routes.ts").catch(() => ({}));

after(async () => vite.close());

function returnToSearch(returnTo) {
  return `?${new URLSearchParams({ returnTo })}`;
}

describe("app route helpers", () => {
  it("builds source-specific lesson paths", () => {
    assert.equal(
      routes.getLessonPath("parrot", "01-peppas-high-ball"),
      "/lessons/parrot/01-peppas-high-ball",
    );
    assert.equal(
      routes.getLessonPath("my", "lesson/id"),
      "/lessons/my/lesson%2Fid",
    );
    assert.equal(
      routes.getLessonScenePath("parrot", "01-peppas-high-ball", 0),
      "/lessons/parrot/01-peppas-high-ball/scenes/1",
    );
    assert.equal(
      routes.getLessonScenePath("my", "same-id", 2),
      "/lessons/my/same-id/scenes/3",
    );
  });

  it("rejects empty and dot-segment lesson IDs", () => {
    for (const lessonId of ["", "   ", ".", ".."]) {
      assert.throws(
        () => routes.getLessonPath("parrot", lessonId),
        /Lesson ID must be non-empty and cannot be a dot segment/,
      );
    }
  });

  it("builds auth paths with encoded return destinations", () => {
    assert.equal(
      routes.getLoginPath("/progress?period=week"),
      "/login?returnTo=%2Fprogress%3Fperiod%3Dweek",
    );
    assert.equal(
      routes.getOnboardingPath(
        "/lessons/parrot/01-peppas-high-ball/scenes/2",
      ),
      "/onboarding?returnTo=%2Flessons%2Fparrot%2F01-peppas-high-ball%2Fscenes%2F2",
    );
  });

  it("resolves a stable Parrot lesson ID and one-based scene", () => {
    const entry = routes.resolveParrotLesson("01-peppas-high-ball");
    const resolved = routes.resolveParrotLessonScene("01-peppas-high-ball", "2");

    assert.equal(entry.id, "01-peppas-high-ball");
    assert.equal(resolved.entry, entry);
    assert.equal(resolved.sceneIndex, 1);
  });

  it("rejects unknown lessons and non-canonical scene values", () => {
    for (const value of [
      undefined,
      "",
      "0",
      "-1",
      "01",
      "1.5",
      "x",
      "9007199254740992",
    ]) {
      assert.equal(
        routes.resolveParrotLessonScene("01-peppas-high-ball", value),
        null,
      );
    }
    assert.equal(routes.resolveParrotLesson(undefined), null);
    assert.equal(routes.resolveParrotLesson("missing"), null);
    assert.equal(routes.resolveParrotLessonScene("missing", "1"), null);
    assert.equal(
      routes.resolveParrotLessonScene("01-peppas-high-ball", "99"),
      null,
    );
  });

  it("accepts only known same-origin return paths", () => {
    assert.equal(routes.getSafeReturnTo("?returnTo=%2F"), "/");
    assert.equal(
      routes.getSafeReturnTo("?returnTo=%2Fprogress"),
      "/progress",
    );
    assert.equal(
      routes.getSafeReturnTo(
        "?returnTo=%2Flessons%2Fparrot%2F01-peppas-high-ball%2Fscenes%2F2",
      ),
      "/lessons/parrot/01-peppas-high-ball/scenes/2",
    );
    assert.equal(
      routes.getSafeReturnTo("?returnTo=https%3A%2F%2Fevil.example"),
      null,
    );
    assert.equal(
      routes.getSafeReturnTo("?returnTo=%2F%2Fevil.example"),
      null,
    );
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Flogin"), null);
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Fonboarding"), null);
  });

  it("normalizes return destinations before checking durable routes", () => {
    for (const returnTo of [
      "/progress/../login",
      "/lessons/../onboarding",
      "/stories/../admin",
      "/profile/../../outside",
      "/progress/%2e%2e/login",
      "/lessons/%2E%2E/onboarding",
      "/stories/%2e%2e/admin",
      "/profile/%2e%2e/%2e%2e/outside",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(returnTo)), null);
    }

    assert.equal(
      routes.getSafeReturnTo(
        returnToSearch("/progress/./history?period=week#today"),
      ),
      "/progress/history?period=week#today",
    );
  });
});
