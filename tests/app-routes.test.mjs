import assert from "node:assert/strict";
import { fileURLToPath, URLSearchParams } from "node:url";
import { after, describe, it } from "node:test";
import { matchPath } from "react-router";
import { createServer } from "vite";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";

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

function getStoryRouteDecision(storyId, pageNumber) {
  assert.equal(
    typeof routes.resolveStoryRouteDecision,
    "function",
    "Expected an executable story route decision boundary",
  );
  return routes.resolveStoryRouteDecision(storyId, pageNumber);
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
    assert.equal(
      routes.getMyLessonCreatePath("learner /Noah"),
      "/lessons/my/create?learnerProfileId=learner+%2FNoah",
    );
  });

  it("rejects empty, dot-segment, and unencodable lesson IDs", () => {
    for (const lessonId of ["", "   ", ".", "..", "\ud800"]) {
      assert.throws(
        () => routes.getLessonPath("parrot", lessonId),
        /Lesson ID must be non-empty, encodable, and cannot be a dot segment/,
      );
    }
  });

  it("builds encoded story and story-page paths", () => {
    assert.equal(
      routes.getStoryPath("the-lantern-trail"),
      "/stories/the-lantern-trail",
    );
    assert.equal(
      routes.getStoryPath("story/id"),
      "/stories/story%2Fid",
    );
    assert.equal(
      routes.getStoryPath("100% ready"),
      "/stories/100%25%20ready",
    );
    assert.equal(
      routes.getStoryPagePath("the-lantern-trail", 0),
      "/stories/the-lantern-trail/pages/1",
    );
    assert.equal(
      routes.getStoryPagePath("story/id", 2),
      "/stories/story%2Fid/pages/3",
    );
  });

  it("builds one canonical all-library story shelf path", () => {
    for (const levelId of [
      undefined,
      "first-english-words",
      "first-words",
      "repeating-patterns",
      "tiny-stories",
      "early-a1",
      "long-stories",
    ]) {
      assert.equal(routes.getStoryShelfPath(levelId), "/stories");
    }
  });

  it("rejects empty, dot-segment, and unencodable story IDs", () => {
    for (const storyId of ["", "   ", ".", "..", "\ud800"]) {
      for (const buildPath of [
        () => routes.getStoryPath(storyId),
        () => routes.getStoryPagePath(storyId, 0),
      ]) {
        assert.throws(
          buildPath,
          /Story ID must be non-empty, encodable, and cannot be a dot segment/,
        );
      }
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
      routes.getProfilePath("/lessons?source=home#ready-made"),
      "/guardian/profile?returnTo=%2Flessons%3Fsource%3Dhome%23ready-made",
    );
    assert.equal(
      routes.getRedoLearnerProfilePath("/profile"),
      "/guardian/profile/setup?redo=1&returnTo=%2Fprofile",
    );
    assert.equal(
      routes.isRedoLearnerProfileRequest("?redo=1&returnTo=%2Fprofile"),
      true,
    );
    assert.equal(routes.isRedoLearnerProfileRequest("?redo=0"), false);
  });

  it("builds and classifies only canonical guardian routes", () => {
    assert.equal(
      typeof routes.getGuardianAccountPath,
      "function",
      "Expected a canonical Account & privacy path helper",
    );
    assert.equal(routes.getGuardianAccountPath(), "/guardian/account");
    assert.equal(routes.getGuardianPath(), "/guardian");
    assert.equal(routes.getGuardianDubbingPath(), "/guardian/dubbing");
    assert.equal(routes.getGuardianLessonsPath(), "/guardian/lessons");
    assert.equal(
      routes.getGuardianDubbingPath("learner /Noah"),
      "/guardian/dubbing?learnerProfileId=learner+%2FNoah",
    );
    assert.equal(
      routes.getGuardianLessonsPath("learner /Noah"),
      "/guardian/lessons?learnerProfileId=learner+%2FNoah",
    );
    assert.equal(routes.getGuardianLearnersPath(), "/guardian/learners");
    assert.equal(
      routes.getGuardianLearnerPath("learner/noah"),
      "/guardian/learners/learner%2Fnoah",
    );
    assert.equal(routes.getGuardianStoriesPath(), "/guardian/stories");
    assert.equal(
      routes.getGuardianStoriesPath("learner /Noah"),
      "/guardian/stories?learnerProfileId=learner+%2FNoah",
    );
    assert.equal(
      routes.getProfilePath("/guardian"),
      "/guardian/profile?returnTo=%2Fguardian",
    );
    assert.equal(
      routes.getRedoLearnerProfilePath("/guardian/profile"),
      "/guardian/profile/setup?redo=1&returnTo=%2Fguardian%2Fprofile",
    );

    for (const [pathname, search = ""] of [
      ["/guardian"],
      ["/guardian/account"],
      ["/guardian/dubbing"],
      ["/guardian/lessons"],
      ["/guardian/learners/learner-noah"],
      ["/guardian/learners/learner%2Fnoah"],
      ["/guardian/profile"],
      ["/guardian/profile/setup"],
      ["/guardian/profile/setup", "?redo=1"],
      ["/guardian/stories"],
      ["/profile"],
      ["/profile/setup", "?redo=1"],
      ["/lessons/my/create"],
    ]) {
      assert.equal(routes.isGuardianRoute(pathname, search), true);
    }

    for (const [pathname, search = ""] of [
      ["/"],
      ["/lessons"],
      ["/profile/setup"],
      ["/profile/setup", "?redo=01"],
      ["/guardianish"],
      ["/guardian/lessons/extra"],
      ["/guardian/dubbing/extra"],
      ["/guardian/learners/%E0%A4%A"],
      ["/guardian/learners/learner-noah/extra"],
      ["/lessons/my/lesson-1/edit"],
      ["/lessons/my/lesson-1/edit/extra"],
      ["/%2F%2Fevil.example/guardian"],
    ]) {
      assert.equal(routes.isGuardianRoute(pathname, search), false);
    }

    assert.equal(routes.isGuardianRoute("/profile/setup"), false);
    assert.equal(routes.isGuardianRoute("/profile/setup", "?redo=1"), true);
  });

  it("rejects unsafe Guardian learner route IDs and classifies only valid manager children", () => {
    for (const learnerId of ["", "   ", ".", "..", "\ud800"]) {
      assert.throws(
        () => routes.getGuardianLearnerPath(learnerId),
        /Learner ID must be non-empty, encodable, and cannot be a dot segment/,
      );
    }

    assert.equal(
      routes.isGuardianLearnerManagerRoute("/guardian/learners"),
      true,
    );
    assert.equal(
      routes.isGuardianLearnerManagerRoute(
        "/guardian/learners/learner%2Fnoah",
      ),
      true,
    );
    assert.equal(
      routes.isGuardianLearnerManagerRoute("/guardian/learners/%E0%A4%A"),
      false,
    );
    assert.equal(
      routes.isGuardianLearnerManagerRoute(
        "/guardian/learners/learner-noah/extra",
      ),
      false,
    );
  });

  it("recognizes structurally matched learner children without accepting unsafe IDs", () => {
    for (const pathname of [
      "/guardian/learners/learner-noah",
      "/guardian/learners/%20",
      "/guardian/learners/%E0%A4%A",
    ]) {
      assert.equal(routes.isGuardianLearnerChildRoute(pathname), true);
    }
    for (const pathname of [
      "/guardian/learners",
      "/guardian/learners/learner-noah/extra",
    ]) {
      assert.equal(routes.isGuardianLearnerChildRoute(pathname), false);
    }

    assert.equal(
      routes.isGuardianLearnerManagerRoute("/guardian/learners/%20"),
      false,
    );
    assert.equal(
      routes.getSafeReturnTo(
        returnToSearch("/guardian/learners/%E0%A4%A"),
      ),
      null,
    );
  });

  it("returns guardian gates only to non-gate guardian destinations", () => {
    assert.equal(routes.getSafeGuardianReturnTo(""), "/guardian");
    assert.equal(
      routes.getSafeGuardianReturnTo("?returnTo=%2Fguardian%2Fstories"),
      "/guardian/stories",
    );
    assert.equal(
      routes.getSafeGuardianReturnTo("?returnTo=%2Fguardian%2Faccount"),
      "/guardian/account",
    );
    for (const value of [
      "/",
      "/lessons",
      "/guardian/profile",
      "https://evil.test/",
    ]) {
      assert.equal(
        routes.getSafeGuardianReturnTo(
          `?returnTo=${encodeURIComponent(value)}`,
        ),
        "/guardian",
      );
    }
  });

  it("resumes only a validated Guardian destination after a header unlock", () => {
    assert.equal(
      routes.getSafeGuardianUnlockDestination(
        "/guardian/account",
        "",
        "#danger-zone",
      ),
      "/guardian/account#danger-zone",
    );
    assert.equal(
      routes.getSafeGuardianUnlockDestination(
        "/guardian/stories",
        "?section=art",
        "#cover",
      ),
      "/guardian/stories?section=art#cover",
    );
    assert.equal(
      routes.getSafeGuardianUnlockDestination(
        "/profile/setup",
        "?redo=1&returnTo=%2Fguardian",
        "#questions",
      ),
      "/profile/setup?redo=1&returnTo=%2Fguardian#questions",
    );

    for (const pathname of [
      "/login",
      "/lessons",
      "/guardian/unknown",
      "/guardianish",
    ]) {
      assert.equal(
        routes.getSafeGuardianUnlockDestination(
          pathname,
          "?returnTo=%2Fguardian%2Fstories",
          "#loop",
        ),
        "/guardian",
      );
    }
  });

  it("classifies gate routes case-insensitively with router-equivalent trailing slashes", () => {
    for (const [pathname, kind] of [
      ["/login", "login"],
      ["/Login///", "login"],
      ["/PROFILE/SETUP", "learner-profile"],
      ["/Profile/Setup//", "learner-profile"],
      ["/profile", "profile"],
      ["/Profile//", "profile"],
      ["/guardian/profile", "profile"],
      ["/guardian/profile/setup", "learner-profile"],
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
      ["/stories", "/Stories///", null],
      ["/dubs/five-little-ducks", "/Dubs/Five-Little-Ducks///", null],
      ["/dubs/old-macdonald", "/Dubs/Old-MacDonald///", null],
      ["/stories/:storyId", "/Stories/the-lantern-trail//", null],
      [
        "/stories/:storyId/pages/:pageNumber",
        "/Stories/the-lantern-trail/Pages/2///",
        null,
      ],
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

  it("preserves an initial legacy learner-profile return target when reauthentication is required", () => {
    for (const [pathname, search] of [
      ["/profile/setup", "?returnTo=%2Fprogress"],
      ["/Profile/Setup//", "?returnTo=%2Fprogress"],
      ["/PROFILE/SETUP///", "?redo=01&returnTo=%2Fprogress"],
    ]) {
      assert.equal(
        routes.getRequestedProtectedTarget(pathname, search, ""),
        "/progress",
      );
    }
  });

  it("preserves canonical and legacy redo management URLs through reauthentication", () => {
    for (const [pathname, search, hash, expected] of [
      [
        "/guardian/profile/setup",
        "?returnTo=%2Fguardian",
        "#questions",
        "/guardian/profile/setup?returnTo=%2Fguardian#questions",
      ],
      [
        "/guardian/profile/setup",
        "?redo=1&returnTo=%2Fguardian%2Fprofile",
        "",
        "/guardian/profile/setup?redo=1&returnTo=%2Fguardian%2Fprofile",
      ],
      [
        "/profile/setup",
        "?redo=1&returnTo=%2Fguardian",
        "#review",
        "/profile/setup?redo=1&returnTo=%2Fguardian#review",
      ],
    ]) {
      assert.equal(
        routes.getRequestedProtectedTarget(pathname, search, hash),
        expected,
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

  it("builds and safely returns to the fixed duck dubbing route", () => {
    assert.equal(routes.getDuckDubPath(), "/dubs/five-little-ducks");
    for (const pathname of [
      "/dubs/five-little-ducks",
      "/Dubs/Five-Little-Ducks//",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(pathname)), pathname);
    }
    assert.equal(
      routes.getSafeReturnTo(returnToSearch("/dubs/five-little-ducks/extra")),
      null,
    );
  });

  it("builds and safely returns to the nursery rhymes hub", () => {
    assert.equal(routes.getNurseryRhymesPath(), "/dubs");
    assert.equal(routes.getSafeReturnTo(returnToSearch("/dubs")), "/dubs");
    assert.equal(routes.getSafeReturnTo(returnToSearch("/dubs/extra")), null);
  });

  it("builds and safely returns to the Old MacDonald dubbing route", () => {
    assert.equal(
      routes.getOldMacDonaldDubPath(),
      "/dubs/old-macdonald",
    );
    for (const pathname of [
      "/dubs/old-macdonald",
      "/Dubs/Old-MacDonald//",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(pathname)), pathname);
    }
    assert.equal(
      routes.getSafeReturnTo(returnToSearch("/dubs/old-macdonald/extra")),
      null,
    );
  });

  it("safely returns to every catalog nursery-rhyme route and no nested path", () => {
    for (const { route } of DUB_DEFINITIONS) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(route)), route);
      assert.equal(
        routes.getSafeReturnTo(returnToSearch(`${route}/extra`)),
        null,
      );
    }
  });

  it("builds and safely returns to guardian voice-dubbing settings", () => {
    assert.equal(routes.getGuardianDubbingPath(), "/guardian/dubbing");
    for (const pathname of [
      "/guardian/dubbing",
      "/Guardian/Dubbing//",
    ]) {
      assert.equal(routes.isGuardianRoute(pathname), true);
      assert.equal(routes.getSafeReturnTo(returnToSearch(pathname)), pathname);
    }
    assert.equal(
      routes.getSafeReturnTo(returnToSearch("/guardian/dubbing/extra")),
      null,
    );
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

  it("resolves a stable story ID and one-based page", () => {
    assert.equal(typeof routes.resolveStory, "function");
    assert.equal(typeof routes.resolveStoryPage, "function");
    const story = routes.resolveStory("the-lantern-trail");
    const resolved = routes.resolveStoryPage("the-lantern-trail", "2");
    const finalPage = routes.resolveStoryPage("the-lantern-trail", "6");

    assert.equal(story.id, "the-lantern-trail");
    assert.equal(story.pages.length, 6);
    assert.equal(
      routes.getStoryPagePath(story.id, 0),
      "/stories/the-lantern-trail/pages/1",
    );
    assert.equal(resolved.story, story);
    assert.equal(resolved.pageIndex, 1);
    assert.equal(finalPage.story, story);
    assert.equal(finalPage.pageIndex, 5);
  });

  it("resolves a new first-words story with its own page boundary", () => {
    const story = routes.resolveStory("the-red-ball");
    const finalPage = routes.resolveStoryPage("the-red-ball", "5");

    assert.equal(story.id, "the-red-ball");
    assert.equal(story.pages.length, 5);
    assert.equal(
      routes.getStoryPagePath(story.id, 0),
      "/stories/the-red-ball/pages/1",
    );
    assert.equal(finalPage.story, story);
    assert.equal(finalPage.pageIndex, 4);
    assert.equal(routes.resolveStoryPage("the-red-ball", "6"), null);
  });

  it("redirects a short story URL to its canonical first page", () => {
    assert.deepEqual(
      getStoryRouteDecision("the-lantern-trail", undefined),
      {
        kind: "redirect",
        replace: true,
        to: "/stories/the-lantern-trail/pages/1",
      },
    );
  });

  it("redirects invalid story pages to the canonical first page", () => {
    for (const pageNumber of ["", "0", "01", "1.5", "7", "99", "x"]) {
      assert.deepEqual(
        getStoryRouteDecision("the-lantern-trail", pageNumber),
        {
          kind: "redirect",
          replace: true,
          to: "/stories/the-lantern-trail/pages/1",
        },
      );
    }
  });

  it("redirects unknown and encoded story IDs to the story list", () => {
    for (const storyId of [
      "missing",
      "the-lantern-trail%2Fpages%2F1",
      "the-lantern-trail/../missing",
    ]) {
      assert.deepEqual(getStoryRouteDecision(storyId, "1"), {
        kind: "redirect",
        replace: true,
        to: "/stories",
      });
    }
  });

  it("returns a playable decision only for a valid story page", () => {
    const decision = getStoryRouteDecision("the-lantern-trail", "2");

    assert.equal(decision.kind, "story");
    assert.equal(decision.story.id, "the-lantern-trail");
    assert.equal(decision.pageIndex, 1);
  });

  it("rejects unknown stories and non-canonical page values", () => {
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
        routes.resolveStoryPage("the-lantern-trail", value),
        null,
      );
    }
    assert.equal(routes.resolveStory(undefined), null);
    assert.equal(routes.resolveStory("missing"), null);
    assert.equal(routes.resolveStoryPage("missing", "1"), null);
    assert.equal(routes.resolveStoryPage("the-lantern-trail", "7"), null);
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
      "/stories/the-lantern-trail//",
      "/stories/the-lantern-trail/pages/2///",
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
      routes.getSafeReturnTo(
        "?returnTo=%2Fstories%2Fthe-lantern-trail%2Fpages%2F2",
      ),
      "/stories/the-lantern-trail/pages/2",
    );
    for (const guardianPath of [
      "/guardian",
      "/guardian/lessons",
      "/guardian/stories",
    ]) {
      assert.equal(
        routes.getSafeReturnTo(returnToSearch(guardianPath)),
        guardianPath,
      );
    }
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
      "/stories//the-lantern-trail",
      "/stories/the-lantern-trail//pages/1",
      "/stories/the-lantern-trail/pages/1/extra",
      "/lessons//parrot/01-peppas-high-ball",
      "/lessons/parrot//",
      "//lessons",
      "/guardianish",
      "/guardian/lessons/extra",
      "/guardian/learners/%20",
      "/guardian/learners/%E0%A4%A",
      "/guardian%2Fstories",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(returnTo)), null);
    }

    for (const returnTo of [
      "https://evil.example/guardian",
      "//evil.example/guardian",
      "%2F%2Fevil.example%2Fguardian",
    ]) {
      assert.equal(routes.getSafeReturnTo(returnToSearch(returnTo)), null);
    }
  });

  it("rejects retired experiment routes as return targets", () => {
    for (const returnTo of [
      "/games",
      "/games/worlds",
      "/lessons/parrot/02-garden-colors/variants/full-scene",
      "/Lessons/Parrot/02-garden-colors/Variants/full-scene///",
      "/lessons/parrot/02-garden-colors/variants/full-scene/scenes/2",
      "/Lessons/Parrot/02-garden-colors/Variants/full-scene/Scenes/2///",
      "/lessons/parrot/02-garden-colors/variants/full-scene/scenes/2/extra",
      "/lessons/parrot/02-garden-colors/variants//scenes/2",
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
