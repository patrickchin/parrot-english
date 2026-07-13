import assert from "node:assert/strict";
import { fileURLToPath, URLSearchParams } from "node:url";
import { after, describe, it } from "node:test";
import { matchPath } from "react-router";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const routes = await vite.ssrLoadModule("/src/app/app-routes.ts").catch(() => ({}));

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

function getMyLessonRouteDecision(entry, lessonId, sceneNumber) {
  assert.equal(
    typeof routes.resolveMyLessonRouteDecision,
    "function",
    "Expected an executable My lesson route decision boundary",
  );
  return routes.resolveMyLessonRouteDecision(entry, lessonId, sceneNumber);
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
      routes.getLearnerProfilePath(
        "/lessons/parrot/01-peppas-high-ball/scenes/2",
      ),
      "/profile/setup?returnTo=%2Flessons%2Fparrot%2F01-peppas-high-ball%2Fscenes%2F2",
    );
    assert.equal(
      routes.getRedoLearnerProfilePath("/profile"),
      "/profile/setup?redo=1&returnTo=%2Fprofile",
    );
    assert.equal(
      routes.isRedoLearnerProfileRequest("?redo=1&returnTo=%2Fprofile"),
      true,
    );
    assert.equal(routes.isRedoLearnerProfileRequest("?redo=0"), false);
  });

  it("classifies gate routes case-insensitively with router-equivalent trailing slashes", () => {
    for (const [pathname, kind] of [
      ["/login", "login"],
      ["/Login///", "login"],
      ["/PROFILE/SETUP", "learner-profile"],
      ["/Profile/Setup//", "learner-profile"],
      ["/profile", "profile"],
      ["/Profile//", "profile"],
    ]) {
      assert.equal(routes.getGateRouteKind(pathname), kind);
    }

    for (const pathname of [
      "/",
      "/progress",
      "/login/extra",
      "/login//extra",
      "//login",
    ]) {
      assert.equal(routes.getGateRouteKind(pathname), null);
    }
  });

  it("stays aligned with React Router matching for declared route shapes", () => {
    for (const [pattern, pathname, gateKind] of [
      ["/login", "/Login///", "login"],
      ["/profile/setup", "/Profile/Setup//", "learner-profile"],
      ["/profile", "/Profile//", "profile"],
      ["/talk-to-peppa", "/Talk-To-Peppa///", null],
      ["/progress", "/Progress///", null],
      ["/lessons", "/Lessons//", null],
      ["/lessons/my/create", "/Lessons/My/Create///", null],
      ["/lessons/parrot/:lessonId", "/Lessons/Parrot/demo//", null],
      [
        "/lessons/parrot/:lessonId/scenes/:sceneNumber",
        "/Lessons/Parrot/demo/Scenes/2///",
        null,
      ],
    ]) {
      assert.ok(matchPath({ path: pattern, end: true }, pathname));
      if (gateKind) {
        assert.equal(routes.getGateRouteKind(pathname), gateKind);
      } else {
        assert.equal(
          routes.getSafeReturnTo(returnToSearch(pathname)),
          pathname,
        );
      }
    }

    for (const pathname of ["//login", "/login/extra"]) {
      assert.equal(matchPath({ path: "/login", end: true }, pathname), null);
      assert.equal(routes.getGateRouteKind(pathname), null);
    }
  });

  it("preserves a learner-profile return target when reauthentication is required", () => {
    for (const pathname of ["/profile/setup", "/Profile/Setup//", "/PROFILE/SETUP///"]) {
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
    assert.equal(routes.getRequestedProtectedTarget("/Login///", "", ""), "/");
  });

  it("keeps a case-variant profile route as a protected target", () => {
    assert.equal(
      routes.getRequestedProtectedTarget("/Profile//", "", ""),
      "/Profile//",
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

  it("recognizes the standalone Talk to Peppa route and keeps it as a safe return target", () => {
    for (const pathname of [
      "/talk-to-peppa",
      "/Talk-To-Peppa//",
      "/TALK-TO-PEPPA///",
    ]) {
      assert.equal(routes.isTalkToPeppaRoute(pathname), true);
      assert.equal(
        routes.getSafeReturnTo(returnToSearch(pathname)),
        pathname,
      );
    }
    assert.equal(routes.isTalkToPeppaRoute("/talk-to-peppa/extra"), false);
  });

  it("falls back home from an unsafe auth gate return target", () => {
    assert.equal(
      routes.getRequestedProtectedTarget(
        "/profile/setup",
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

  it("resolves a loaded owner-scoped My lesson scene", () => {
    assert.equal(typeof routes.resolveMyLessonScene, "function");
    const entry = {
      id: "same-id",
      lesson: routes.resolveParrotLesson("01-peppas-high-ball").lesson,
    };
    assert.deepEqual(routes.resolveMyLessonScene(entry, "same-id", "2"), {
      entry,
      sceneIndex: 1,
    });
    assert.equal(routes.resolveMyLessonScene(entry, "other-id", "1"), null);
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

  it("canonicalizes loaded My lesson routes and rejects invalid scenes", () => {
    const entry = {
      id: "same-id",
      lesson: routes.resolveParrotLesson("01-peppas-high-ball").lesson,
    };
    assert.deepEqual(getMyLessonRouteDecision(entry, "same-id", undefined), {
      kind: "redirect",
      replace: true,
      to: "/lessons/my/same-id/scenes/1",
    });
    const playable = getMyLessonRouteDecision(entry, "same-id", "2");
    assert.equal(playable.kind, "lesson");
    assert.equal(playable.entry, entry);
    assert.equal(playable.sceneIndex, 1);
    assert.deepEqual(getMyLessonRouteDecision(entry, "same-id", "99"), {
      kind: "redirect",
      replace: true,
      to: "/lessons/my/same-id/scenes/1",
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
    for (const returnTo of [
      "/progress//",
      "/stories///",
      "/profile//",
      "/lessons//",
      "/lessons/my/create///",
      "/lessons/parrot/01-peppas-high-ball//",
      "/lessons/parrot/01-peppas-high-ball/scenes/2///",
    ]) {
      assert.equal(
        routes.getSafeReturnTo(returnToSearch(returnTo)),
        returnTo,
      );
    }
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
    assert.equal(routes.getSafeReturnTo("?returnTo=%2Fprofile%2Fsetup"), null);
    assert.equal(
      routes.getSafeReturnTo(
        returnToSearch("/Login/?returnTo=%2Fprogress"),
      ),
      null,
    );
    assert.equal(
      routes.getSafeReturnTo(
        returnToSearch("/LEARNER_PROFILE?returnTo=%2Fprogress"),
      ),
      null,
    );
    for (const returnTo of [
      "/progress/history",
      "/progress//history",
      "/lessons//parrot/01-peppas-high-ball",
      "/lessons/parrot//",
      "//lessons",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(returnTo)), null);
    }
  });

  it("normalizes return destinations before checking durable routes", () => {
    for (const returnTo of [
      "/progress/../login",
      "/lessons/../profile/setup",
      "/stories/../admin",
      "/profile/../../outside",
      "/progress/%2e%2e/login",
      "/lessons/%2E%2E/profile/setup",
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
