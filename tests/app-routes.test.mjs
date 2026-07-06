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

function getParrotLessonRouteDecision(lessonId, sceneNumber) {
  assert.equal(
    typeof routes.resolveParrotLessonRouteDecision,
    "function",
    "Expected an executable Parrot lesson route decision boundary",
  );
  return routes.resolveParrotLessonRouteDecision(lessonId, sceneNumber);
}

function getMyLessonRouteDecision(lessonId, sceneNumber) {
  assert.equal(
    typeof routes.resolveMyLessonRouteDecision,
    "function",
    "Expected an executable My lesson route decision boundary",
  );
  return routes.resolveMyLessonRouteDecision(lessonId, sceneNumber);
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
      routes.getLessonPath("my", "100% ready"),
      "/lessons/my/100%25%20ready",
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

  it("classifies gate routes case-insensitively with one optional trailing slash", () => {
    for (const [pathname, kind] of [
      ["/login", "login"],
      ["/Login/", "login"],
      ["/ONBOARDING", "onboarding"],
      ["/Onboarding/", "onboarding"],
      ["/profile", "profile"],
      ["/Profile/", "profile"],
    ]) {
      assert.equal(routes.getGateRouteKind(pathname), kind);
    }

    for (const pathname of [
      "/",
      "/progress",
      "/login/extra",
      "/login//",
      "/onboarding//",
      "/profile//",
      "//login",
    ]) {
      assert.equal(routes.getGateRouteKind(pathname), null);
    }
  });

  it("preserves an onboarding return target when reauthentication is required", () => {
    for (const pathname of ["/onboarding", "/Onboarding/", "/ONBOARDING"]) {
      assert.equal(
        routes.getRequestedProtectedTarget(
          pathname,
          "?returnTo=%2Fprogress",
          "",
        ),
        "/progress",
      );
    }
  });

  it("treats case-variant login routes as auth gates", () => {
    assert.equal(routes.getRequestedProtectedTarget("/Login/", "", ""), "/");
  });

  it("keeps a case-variant profile route as a protected target", () => {
    assert.equal(
      routes.getRequestedProtectedTarget("/Profile/", "", ""),
      "/Profile/",
    );
  });

  it("keeps an ordinary protected URL as its reauthentication target", () => {
    assert.equal(
      routes.getRequestedProtectedTarget(
        "/progress",
        "?period=week",
        "#today",
      ),
      "/progress?period=week#today",
    );
  });

  it("falls back home from an unsafe auth gate return target", () => {
    assert.equal(
      routes.getRequestedProtectedTarget(
        "/onboarding",
        "?returnTo=https%3A%2F%2Fevil.example",
        "",
      ),
      "/",
    );
  });

  it("resolves a stable Parrot lesson ID and one-based scene", () => {
    const entry = routes.resolveParrotLesson("01-peppas-high-ball");
    const resolved = routes.resolveParrotLessonScene("01-peppas-high-ball", "2");

    assert.equal(entry.id, "01-peppas-high-ball");
    assert.equal(
      routes.getLessonScenePath("parrot", entry.id, 0),
      "/lessons/parrot/01-peppas-high-ball/scenes/1",
    );
    assert.equal(resolved.entry, entry);
    assert.equal(resolved.sceneIndex, 1);
  });

  it("keeps My lesson scene resolution behind a future data boundary", () => {
    assert.equal(typeof routes.resolveMyLessonScene, "function");
    assert.equal(routes.resolveMyLessonScene("same-id", "1"), null);
    assert.equal(routes.resolveMyLessonScene(undefined, undefined), null);
  });

  it("redirects a short Parrot lesson URL to its canonical first scene", () => {
    assert.deepEqual(
      getParrotLessonRouteDecision("01-peppas-high-ball", undefined),
      {
        kind: "redirect",
        replace: true,
        to: "/lessons/parrot/01-peppas-high-ball/scenes/1",
      },
    );
  });

  it("redirects invalid Parrot scenes to the canonical first scene", () => {
    for (const sceneNumber of ["", "0", "01", "1.5", "6", "99", "x"]) {
      assert.deepEqual(
        getParrotLessonRouteDecision(
          "01-peppas-high-ball",
          sceneNumber,
        ),
        {
          kind: "redirect",
          replace: true,
          to: "/lessons/parrot/01-peppas-high-ball/scenes/1",
        },
      );
    }
  });

  it("redirects unknown and encoded Parrot IDs to the lesson list", () => {
    for (const lessonId of [
      "missing",
      "01-peppas-high-ball%2Fscenes%2F1",
      "01-peppas-high-ball/../02-garden-colors",
    ]) {
      assert.deepEqual(getParrotLessonRouteDecision(lessonId, "1"), {
        kind: "redirect",
        replace: true,
        to: "/lessons",
      });
    }
  });

  it("returns a playable decision only for a valid Parrot scene", () => {
    const decision = getParrotLessonRouteDecision(
      "01-peppas-high-ball",
      "2",
    );

    assert.equal(decision.kind, "lesson");
    assert.equal(decision.entry.id, "01-peppas-high-ball");
    assert.equal(decision.sceneIndex, 1);
  });

  it("redirects both My lesson route forms until authenticated loading exists", () => {
    assert.deepEqual(getMyLessonRouteDecision("same-id", undefined), {
      kind: "redirect",
      replace: true,
      to: "/lessons",
    });
    assert.deepEqual(getMyLessonRouteDecision("same-id", "2"), {
      kind: "redirect",
      replace: true,
      to: "/lessons",
    });
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
      routes.getSafeReturnTo("?returnTo=%2FProgress%2F"),
      "/Progress/",
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
    assert.equal(
      routes.getSafeReturnTo(
        returnToSearch("/Login/?returnTo=%2Fprogress"),
      ),
      null,
    );
    assert.equal(
      routes.getSafeReturnTo(
        returnToSearch("/ONBOARDING?returnTo=%2Fprogress"),
      ),
      null,
    );
    for (const returnTo of [
      "/progress/history",
      "/progress//",
      "/stories//",
      "/profile//",
      "/lessons//",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(returnTo)), null);
    }
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
      null,
    );
  });
});
