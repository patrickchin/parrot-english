import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

const GUARDIAN_PASSWORD = "e2e-guardian-password";

type TargetedRequestCase = {
  body?: string;
  bodyBytes?: number[];
  formData?: {
    fields?: Record<string, string>;
    file: {
      base64?: string;
      bytes?: number[];
      field: string;
      name: string;
      type: string;
    };
  };
  headers?: Record<string, string>;
  method: "DELETE" | "GET" | "POST" | "PUT";
  mutationCapable?: false;
  name: string;
  path: string;
};

const TARGETED_MIA_LESSON_ID = "lesson-learner-mia-1";
const TARGETED_NOAH_LESSON_ID = "lesson-learner-noah-1";
const TARGETED_WEBM_BYTES = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00];
const TARGETED_TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPQqNjyH4QZYAwATjwJTSZS7G8AAAAASUVORK5CYII=";
const targetedLessonBody = JSON.stringify({
  lesson: createLessonScript({ childName: "Mia", title: "Targeted lesson" }),
  source: "uploaded",
});

const targetedSecurityCases: TargetedRequestCase[] = [
  { method: "GET", name: "learner-profile alias", path: "/api/learner-profile" },
  {
    body: JSON.stringify({ questionKey: "name", rawAnswer: "Target changed" }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    name: "learner-profile answer",
    path: "/api/learner-profile/answer",
  },
  {
    body: JSON.stringify({ questionKey: "favoriteAnimals" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    mutationCapable: false,
    name: "learner-profile question skip",
    path: "/api/learner-profile/question/skip",
  },
  {
    method: "POST",
    name: "learner-profile skip",
    path: "/api/learner-profile/skip",
  },
  {
    method: "POST",
    name: "learner-profile completion",
    path: "/api/learner-profile/complete",
  },
  {
    formData: {
      file: {
        bytes: TARGETED_WEBM_BYTES,
        field: "audio",
        name: "speech.webm",
        type: "audio/webm",
      },
    },
    method: "POST",
    name: "learner-profile transcription",
    path: "/api/learner-profile/transcribe",
  },
  { method: "GET", name: "profile alias read", path: "/api/profile" },
  {
    body: JSON.stringify({ answers: { name: "Target changed" } }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    name: "profile alias write",
    path: "/api/profile",
  },
  {
    body: JSON.stringify({ storyLevel: "tiny-stories" }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    name: "profile preferences",
    path: "/api/profile/preferences",
  },
  {
    method: "GET",
    name: "recording consent read",
    path: "/api/lesson-recordings/consent",
  },
  {
    body: JSON.stringify({ enabled: true }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    name: "recording consent write",
    path: "/api/profile/lesson-recording-consent",
  },
  {
    bodyBytes: TARGETED_WEBM_BYTES,
    headers: {
      "Content-Type": "audio/webm",
      "X-Parrot-Expected-Learner-Profile": "learner-mia",
    },
    method: "PUT",
    name: "lesson recording slot",
    path: "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
  },
  { method: "GET", name: "My Lessons list", path: "/api/lessons/my" },
  {
    body: targetedLessonBody,
    headers: { "Content-Type": "application/json" },
    method: "POST",
    name: "My Lessons create",
    path: "/api/lessons/my",
  },
  {
    body: JSON.stringify({ topic: "targeted practice" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    name: "My Lessons generate",
    path: "/api/lessons/my/generate",
  },
  {
    method: "GET",
    name: "My Lessons detail",
    path: `/api/lessons/my/${TARGETED_MIA_LESSON_ID}`,
  },
  {
    body: JSON.stringify({
      lesson: createLessonScript({
        childName: "Mia",
        title: "Edited targeted lesson",
      }),
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    name: "My Lessons edit",
    path: `/api/lessons/my/${TARGETED_MIA_LESSON_ID}`,
  },
  {
    method: "GET",
    name: "dubbing status",
    path: "/api/dubs/five-little-ducks-v2",
  },
  {
    body: JSON.stringify({
      accepted: true,
      consentVersion: "guardian-voice-r2-v2",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    name: "dubbing consent",
    path: "/api/dubs/five-little-ducks-v2/consent",
  },
  {
    bodyBytes: TARGETED_WEBM_BYTES,
    headers: { "Content-Type": "audio/webm" },
    method: "PUT",
    name: "dubbing clip",
    path: "/api/dubs/five-little-ducks-v2/lines/line-1",
  },
  {
    method: "GET",
    name: "dubbing asset",
    path: "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
  },
  {
    method: "DELETE",
    name: "dubbing deletion",
    path: "/api/dubs/five-little-ducks-v2",
  },
  {
    method: "GET",
    name: "story-art metadata",
    path: "/api/stories/the-red-ball/personalized-art",
  },
  {
    method: "GET",
    name: "story-art asset",
    path: "/api/stories/the-red-ball/personalized-art/asset",
  },
  {
    formData: {
      fields: {
        guardianConsentAccepted: "true",
        guardianConsentVersion: "guardian-photo-cloudflare-v1",
      },
      file: {
        base64: TARGETED_TINY_PNG_BASE64,
        field: "source",
        name: "source.png",
        type: "image/png",
      },
    },
    method: "POST",
    name: "story-art generation",
    path: "/api/stories/the-red-ball/personalized-art",
  },
  {
    method: "DELETE",
    name: "story-art deletion",
    path: "/api/stories/the-red-ball/personalized-art",
  },
];

const targetedMutationCases = targetedSecurityCases.filter(
  ({ mutationCapable }) => mutationCapable !== false,
);

type LearnerScenario =
  | "create-error"
  | "multiple"
  | "select-error"
  | "selection-required"
  | "stale-selection";

function learnerScenarioUrl(
  path: string,
  scenario: LearnerScenario,
  guardian: "guardian" | "learner" = "guardian",
  sessionId?: string,
) {
  const url = new URL(path, "http://parrot-e2e.invalid");
  url.searchParams.set("parrotE2eGuardian", guardian);
  url.searchParams.set("parrotE2eLearners", scenario);
  if (sessionId) url.searchParams.set("parrotE2eSession", sessionId);
  return `${url.pathname}${url.search}${url.hash}`;
}

type TargetedQueryCase = {
  name: string;
  value: string;
};

async function setGuardianAccess(
  page: Page,
  mode: "guardian" | "learner",
) {
  const result = await page.evaluate(
    async ({ password, requestedMode }) => {
      const response = await fetch("/api/guardian-access", {
        ...(requestedMode === "guardian"
          ? {
              body: JSON.stringify({ password }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            }
          : { method: "DELETE" }),
      });
      return { body: await response.json(), status: response.status };
    },
    { password: GUARDIAN_PASSWORD, requestedMode: mode },
  );

  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ mode });
}

async function seedTargetedAuthorizationState(page: Page) {
  const result = await page.evaluate(
    async ({ miaLesson, noahLesson }) => {
      const create = async (
        lesson: ReturnType<typeof createLessonScript>,
        target: string,
      ) => {
        const response = await fetch(`/api/lessons/my${target}`, {
          body: JSON.stringify({ lesson, source: "uploaded" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = (await response.json()) as {
          lesson?: { id?: string };
        };
        return { id: body.lesson?.id ?? null, status: response.status };
      };

      return {
        mia: await create(miaLesson, ""),
        noah: await create(
          noahLesson,
          "?learnerProfileId=learner-noah",
        ),
        recordingConsent: await fetch(
          "/api/profile/lesson-recording-consent",
          {
            body: JSON.stringify({ enabled: true }),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
        ).then(async (response) => ({
          body: await response.json(),
          status: response.status,
        })),
      };
    },
    {
      miaLesson: createLessonScript({
        childName: "Mia",
        title: "Mia authorization fixture",
      }),
      noahLesson: createLessonScript({
        childName: "Noah",
        title: "Noah authorization fixture",
      }),
    },
  );

  expect(result).toEqual({
    mia: { id: TARGETED_MIA_LESSON_ID, status: 201 },
    noah: { id: TARGETED_NOAH_LESSON_ID, status: 201 },
    recordingConsent: {
      body: { cleanupPending: false, enabled: true },
      status: 200,
    },
  });
}

async function readTargetedAccountState(page: Page) {
  return page.evaluate(async () => {
    const account = (
      window as Window & {
        __parrotE2eLearners?: {
          snapshot(profileId?: string): {
            activeProfileId: string | null;
            lessonRecording: {
              cleanupPending: boolean;
              consent: boolean;
              pendingUploads: number;
              uploads: unknown[];
            } | null;
            profiles: Array<unknown>;
          };
        };
      }
    ).__parrotE2eLearners;
    if (!account) throw new Error("Learner controller is missing.");

    const json = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`State read failed for ${path}: ${response.status}`);
      }
      return { body: await response.json(), status: response.status };
    };
    const learner = async (profileId: string) => {
      const target = new URLSearchParams({
        learnerProfileId: profileId,
      }).toString();
      const [learnerProfile, profile, recording, lessons, dubbing, storyArt] =
        await Promise.all([
          json(`/api/learner-profile?${target}`),
          json(`/api/profile?${target}`),
          json(`/api/lesson-recordings/consent?${target}`),
          json(`/api/lessons/my?${target}`),
          json(`/api/dubs/five-little-ducks-v2?${target}`),
          json(`/api/stories/the-red-ball/personalized-art?${target}`),
        ]);
      const lessonRecording = account.snapshot(profileId).lessonRecording;
      if (!lessonRecording) {
        throw new Error(`Missing recording state for ${profileId}.`);
      }
      return {
        dubbing,
        learnerProfile,
        lessons,
        profile,
        recording: {
          endpoint: recording,
          fixture: {
            cleanupPending: lessonRecording.cleanupPending,
            consent: lessonRecording.consent,
            pendingUploads: lessonRecording.pendingUploads,
            uploads: lessonRecording.uploads,
          },
        },
        storyArt,
      };
    };

    const [roster, mia, noah] = await Promise.all([
      json("/api/learner-profiles"),
      learner("learner-mia"),
      learner("learner-noah"),
    ]);
    return {
      activeProfileId: account.snapshot().activeProfileId,
      learners: { mia, noah },
      roster,
    };
  });
}

async function exerciseTargetedRequests(
  page: Page,
  queries: TargetedQueryCase[],
) {
  return page.evaluate(
    async ({ mutationCaseNames, requests, targetQueries }) => {
      const mutationCases = new Set(mutationCaseNames);
      const initFor = (requestCase: TargetedRequestCase): RequestInit => {
        let body: BodyInit | undefined;
        if (requestCase.formData) {
          const form = new FormData();
          for (const [key, value] of Object.entries(
            requestCase.formData.fields ?? {},
          )) {
            form.set(key, value);
          }
          const file = requestCase.formData.file;
          const bytes = file.base64
            ? Uint8Array.from(atob(file.base64), (character) =>
                character.charCodeAt(0),
              )
            : new Uint8Array(file.bytes ?? []);
          form.set(
            file.field,
            new File([bytes], file.name, { type: file.type }),
          );
          body = form;
        } else if (requestCase.bodyBytes) {
          body = new Blob([new Uint8Array(requestCase.bodyBytes)], {
            type: requestCase.headers?.["Content-Type"],
          });
        } else {
          body = requestCase.body;
        }
        return {
          ...(body === undefined
            ? {}
            : {
                body,
                ...(requestCase.formData
                  ? {}
                  : { headers: requestCase.headers }),
              }),
          method: requestCase.method,
        };
      };

      const originalGetAll = URLSearchParams.prototype.getAll;
      let parseCalls = 0;
      URLSearchParams.prototype.getAll = function (
        this: URLSearchParams,
        name: string,
      ) {
        if (name === "learnerProfileId") parseCalls += 1;
        return originalGetAll.call(this, name);
      };
      let responses: Array<{
        body: unknown;
        cacheControl: string | null;
        contentType: string | null;
        method: TargetedRequestCase["method"];
        mockApi: string | null;
        mutationCapable: boolean;
        name: string;
        status: number;
      }>;
      try {
        responses = await Promise.all(
          requests.flatMap((requestCase) =>
            targetQueries.map(async (query) => {
              const response = await fetch(
                `${requestCase.path}?${query.value}`,
                initFor(requestCase),
              );
              return {
                body: await response.clone().json().catch(() => null),
                cacheControl: response.headers.get("Cache-Control"),
                contentType: response.headers.get("Content-Type"),
                method: requestCase.method,
                mockApi: response.headers.get("X-Parrot-Mock-Api"),
                mutationCapable: mutationCases.has(requestCase.name),
                name: `${requestCase.name} / ${query.name}`,
                status: response.status,
              };
            }),
          ),
        );
      } finally {
        URLSearchParams.prototype.getAll = originalGetAll;
      }
      return { parseCalls, responses };
    },
    {
      mutationCaseNames: targetedMutationCases.map(({ name }) => name),
      requests: targetedSecurityCases,
      targetQueries: queries,
    },
  );
}

async function createAuthenticatedBrowserContext(
  browser: Browser,
  baseURL: string,
  sessionId: string,
) {
  const context = await browser.newContext({ baseURL });
  await context.route("**/api/auth/get-session", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      session: { id: string; token: string; userId: string };
      user: { id: string };
    };
    payload.session.id = sessionId;
    payload.session.token = `e2e-token-${sessionId}`;
    payload.session.userId = "e2e-user";
    payload.user.id = "e2e-user";
    await route.fulfill({ response, json: payload });
  });
  return context;
}

function learnerCard(page: Page, name: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { exact: true, name }),
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const main = document.querySelector("main");
        return (
          document.documentElement.scrollWidth <= window.innerWidth &&
          (!main || main.scrollWidth <= main.clientWidth)
        );
      }),
    )
    .toBe(true);
}

async function expectContainedHorizontally(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function expectNameContentContained(page: Page, name: string) {
  const matches = page.getByText(name, { exact: true });
  const readMetrics = () =>
    matches.evaluateAll((elements) =>
      elements.flatMap((element) => {
        const style = window.getComputedStyle(element);
        const fragments = [...element.getClientRects()].filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          fragments.length === 0
        ) {
          return [];
        }
        const container =
          element.closest(
            "button, [role='menuitem'], h1, h2, h3, label, p, a",
          ) ?? element;
        const containerRect = container.getBoundingClientRect();
        return [
          {
            containerClientWidth: container.clientWidth,
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            containerScrollWidth: container.scrollWidth,
            direction: style.direction,
            fragments: fragments.map(({ left, right }) => ({ left, right })),
            viewportWidth: window.innerWidth,
          },
        ];
      }),
    );
  await expect
    .poll(async () => (await readMetrics()).length)
    .toBeGreaterThan(0);
  const metrics = await readMetrics();

  for (const [index, metric] of metrics.entries()) {
    expect(
      metric.containerLeft,
      `name container ${index} left edge`,
    ).toBeGreaterThanOrEqual(-0.5);
    expect(
      metric.containerRight,
      `name container ${index} right edge`,
    ).toBeLessThanOrEqual(metric.viewportWidth + 0.5);
    expect(
      metric.containerScrollWidth,
      `name container ${index} clipped content`,
    ).toBeLessThanOrEqual(metric.containerClientWidth + 1);
    for (const [fragmentIndex, fragment] of metric.fragments.entries()) {
      expect(
        fragment.left,
        `name ${index} fragment ${fragmentIndex} left edge`,
      ).toBeGreaterThanOrEqual(-0.5);
      expect(
        fragment.right,
        `name ${index} fragment ${fragmentIndex} right edge`,
      ).toBeLessThanOrEqual(metric.viewportWidth + 0.5);
    }
  }
  return metrics.map(({ direction }) => direction);
}

async function expectLearnerDeletionDialogContained(page: Page, name: string) {
  const card = learnerCard(page, name);
  const deleteButton = card.getByRole("button", { name: `Delete ${name}` });
  await expectContainedHorizontally(deleteButton, page);
  await deleteButton.click();

  const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: `Delete ${name}?` })).toBeVisible();
  await expect(dialog).toContainText(`This removes ${name}'s learner profile`);
  const confirm = dialog.getByRole("button", { name: `Delete ${name}` });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expectContainedHorizontally(dialog, page);
  await expectContainedHorizontally(confirm, page);
  await expectContainedHorizontally(cancel, page);
  await expectNameContentContained(page, name);
  await expectNoHorizontalOverflow(page);
  await cancel.click();
}

async function unlockGuardianScreen(page: Page) {
  const main = page.getByRole("main");
  await main.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await main.getByRole("button", { name: "Unlock guardian mode" }).click();
}

test("selects a sibling and keeps that session selection after refresh", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");

  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah in learner mode" })
    .click();

  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Now managing Noah",
  );
  await expect(
    page.getByRole("heading", { name: "Managing Noah" }),
  ).toBeFocused();
  await page.reload();
  await expect(learnerCard(page, "Noah")).toContainText("Learner mode");
  await expect(
    page.getByRole("button", { name: /Profile for Alex Guardian, guardian mode/ }),
  ).toBeVisible();
});

test("edits Noah by ID while Mia remains in learner mode after Back and refresh", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Edit Noah's profile" })
    .click();

  await expect(page).toHaveURL("/guardian/learners/learner-noah");
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await expect(page.getByText("Managing Noah", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { activeProfileId: string | null };
              };
            }
          ).__parrotE2eLearners?.snapshot().activeProfileId,
      ),
    )
    .toBe("learner-mia");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/guardian/learners");
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
  await page.reload();
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
  await expect(
    page.getByRole("button", { name: /Profile for Alex Guardian, guardian mode/ }),
  ).toBeVisible();
});

test("active learner detail and story saves reach learner-mode consumers in the same SPA", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Mia")
    .getByRole("button", { name: "Edit Mia's profile" })
    .click();

  await page.getByRole("textbox", { exact: true, name: "Name" }).fill(
    "Mia Updated",
  );
  await page
    .getByRole("button", { name: "Allow lesson voice recordings" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "currently allowed" }),
  ).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Save changes" }).click();
  await expect(page).toHaveURL("/guardian/learners");

  await page
    .getByRole("link", { name: /Back to Guardian dashboard/i })
    .click();
  await page.getByRole("link", { name: "Open story settings" }).click();
  await expect(
    page.getByText("Editing settings for Mia Updated", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Little stories/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Story level saved" }),
  ).toContainText("Little stories");

  await page
    .getByRole("link", { name: /Back to guardian dashboard/i })
    .click();
  await page.getByRole("button", { name: "Switch to learner" }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("button", {
      name: /Profile for Mia Updated, learner mode/,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Story time" }).click();
  await expect(page).toHaveURL("/stories?level=tiny-stories");
  await expect(
    page.getByRole("region", { name: "Little stories stories" }),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { activeProfileId: string | null };
              };
            }
          ).__parrotE2eLearners?.snapshot().activeProfileId,
      ),
    )
    .toBe("learner-mia");
});

test("adds a learner without changing learner mode and keeps the new roster after refresh", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

  await page.getByLabel("Preferred name").fill("Ava");
  await page.getByRole("button", { name: "Add learner" }).click();

  await expect(page).toHaveURL("/guardian/learners/learner-ava-3");
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await expect(page.getByText("Managing Ava", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  const ava = learnerCard(page, "Ava");
  await expect(ava).not.toContainText("Learner mode");
  await expect(ava).toContainText("Setup not started");
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
  await page.reload();
  await expect(learnerCard(page, "Ava")).not.toContainText("Learner mode");
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
});

test("scopes learner selections to authenticated browser sessions", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const firstContext = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-a",
  );
  const secondContext = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-b",
  );
  try {
    const firstSession = await firstContext.newPage();
    const sameSessionTab = await firstContext.newPage();
    const secondSession = await secondContext.newPage();
    await Promise.all([
      firstSession.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-a",
        ),
      ),
      sameSessionTab.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-a",
        ),
      ),
      secondSession.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-b",
        ),
      ),
    ]);
    await Promise.all(
      [firstSession, sameSessionTab, secondSession].map((sessionPage) =>
        expect(
          sessionPage.getByRole("heading", { name: "Manage learners" }),
        ).toBeVisible(),
      ),
    );

    const identities = await Promise.all(
      [firstSession, secondSession].map((sessionPage) =>
        sessionPage.evaluate(async () => {
          const auth = (await fetch("/api/auth/get-session").then((response) =>
            response.json(),
          )) as {
            session: { id: string };
            user: { id: string };
          };
          const mockSessionId = (
            window as typeof window & {
              __parrotE2eLearners?: {
                snapshot(): { sessionId: string };
              };
            }
          ).__parrotE2eLearners?.snapshot().sessionId;
          return {
            authSessionId: auth.session.id,
            authUserId: auth.user.id,
            mockSessionId,
          };
        }),
      ),
    );
    expect(identities).toEqual([
      {
        authSessionId: "e2e-session-a",
        authUserId: "e2e-user",
        mockSessionId: "e2e-session-a",
      },
      {
        authSessionId: "e2e-session-b",
        authUserId: "e2e-user",
        mockSessionId: "e2e-session-b",
      },
    ]);

    await expect(learnerCard(sameSessionTab, "Mia")).toContainText(
      "Learner mode",
    );
    await firstSession.bringToFront();
    await learnerCard(firstSession, "Noah")
      .getByRole("button", { name: "Use Noah in learner mode" })
      .click();

    await expect(learnerCard(firstSession, "Noah")).toContainText(
      "Learner mode",
    );
    await expect(learnerCard(firstSession, "Mia")).not.toContainText(
      "Learner mode",
    );
    await expect(learnerCard(sameSessionTab, "Noah")).toContainText(
      "Learner mode",
    );
    await expect(learnerCard(secondSession, "Mia")).toContainText(
      "Learner mode",
    );
    await expect(learnerCard(secondSession, "Noah")).not.toContainText(
      "Learner mode",
    );
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

test("synchronizes same-session learner selection through storage without BroadcastChannel", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-storage-selection",
  );
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    });
  });
  try {
    const sourcePage = await context.newPage();
    const siblingPage = await context.newPage();
    await Promise.all([
      sourcePage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-storage-selection",
        ),
      ),
      siblingPage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-storage-selection",
        ),
      ),
    ]);
    await expect(learnerCard(siblingPage, "Mia")).toContainText(
      "Learner mode",
    );

    await learnerCard(sourcePage, "Noah")
      .getByRole("button", { name: "Use Noah in learner mode" })
      .click();

    await expect(learnerCard(sourcePage, "Noah")).toContainText(
      "Learner mode",
    );
    await expect(learnerCard(siblingPage, "Noah")).toContainText(
      "Learner mode",
    );
    await expect(learnerCard(siblingPage, "Mia")).not.toContainText(
      "Learner mode",
    );
  } finally {
    await context.close();
  }
});

test("preserves a URL-targeted learner draft when learner mode changes in another tab", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-draft-revalidation",
  );
  try {
    const draftPage = await context.newPage();
    const managerPage = await context.newPage();
    await Promise.all([
      draftPage.goto(
        learnerScenarioUrl(
          "/lessons/my/create",
          "multiple",
          "guardian",
          "e2e-session-draft-revalidation",
        ),
      ),
      managerPage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-draft-revalidation",
        ),
      ),
    ]);

    const lessonTopic = draftPage.getByLabel(
      "What should this lesson be about?",
    );
    await lessonTopic.fill("Unsaved garden helpers lesson");
    await managerPage.bringToFront();
    await draftPage.bringToFront();
    await draftPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(lessonTopic).toHaveValue("Unsaved garden helpers lesson");

    await draftPage.goto(
      learnerScenarioUrl(
        "/guardian/learners/learner-mia",
        "multiple",
        "guardian",
        "e2e-session-draft-revalidation",
      ),
    );
    const profileName = draftPage.getByLabel("Name", { exact: true });
    await profileName.fill("Unsaved Mia name");
    await managerPage.bringToFront();
    await draftPage.bringToFront();
    await draftPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(profileName).toHaveValue("Unsaved Mia name");

    await managerPage.bringToFront();
    await learnerCard(managerPage, "Noah")
      .getByRole("button", { name: "Use Noah in learner mode" })
      .click();
    await expect(learnerCard(managerPage, "Noah")).toContainText(
      "Learner mode",
    );

    await draftPage.bringToFront();
    await expect(
      draftPage.getByText("Managing Mia", { exact: true }),
    ).toBeVisible();
    await expect(draftPage.getByLabel("Name", { exact: true })).toHaveValue(
      "Unsaved Mia name",
    );
  } finally {
    await context.close();
  }
});

test("saves the URL-targeted learner after another tab changes learner mode", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-targeted-profile-save",
  );
  try {
    const profilePage = await context.newPage();
    const managerPage = await context.newPage();
    await Promise.all([
      profilePage.goto(
        learnerScenarioUrl(
          "/guardian/learners/learner-mia",
          "multiple",
          "guardian",
          "e2e-session-targeted-profile-save",
        ),
      ),
      managerPage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-targeted-profile-save",
        ),
      ),
    ]);

    await profilePage
      .getByLabel("Name", { exact: true })
      .fill("Mia Targeted");

    await managerPage.bringToFront();
    await learnerCard(managerPage, "Noah")
      .getByRole("button", { name: "Use Noah in learner mode" })
      .click();
    await expect(learnerCard(managerPage, "Noah")).toContainText(
      "Learner mode",
    );
    await profilePage.bringToFront();
    await expect(
      profilePage.getByText("Managing Mia", { exact: true }),
    ).toBeVisible();
    await expect(profilePage.getByLabel("Name", { exact: true })).toHaveValue(
      "Mia Targeted",
    );
    await profilePage.getByRole("button", { name: "Save changes" }).click();
    await expect(profilePage).toHaveURL("/guardian/learners");
    await expect(learnerCard(profilePage, "Mia Targeted")).toBeVisible();
    await expect(learnerCard(profilePage, "Noah")).toContainText(
      "Learner mode",
    );
  } finally {
    await context.close();
  }
});

test("keeps lessons, conversations, art, and dubbing isolated by selected learner", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  const miaData = await page.evaluate(async (lesson) => {
    const savedLessonResponse = await fetch("/api/lessons/my", {
      body: JSON.stringify({ lesson, source: "uploaded" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const savedLesson = (await savedLessonResponse.json()) as {
      lesson: { id: string };
    };
    const conversationResponse = await fetch("/api/conversations", {
      body: JSON.stringify({ purpose: "small-chat" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const conversation = (await conversationResponse.json()) as {
      conversation: { id: string };
    };
    const generationResponse = await fetch("/api/lessons/my/generate", {
      body: JSON.stringify({ topic: "garden helpers" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const generated = (await generationResponse.json()) as {
      lesson?: { childName?: string };
    };
    const artResponse = await fetch(
      "/api/stories/the-red-ball/personalized-art",
      { body: new FormData(), method: "POST" },
    );
    const consentResponse = await fetch(
      "/api/dubs/five-little-ducks-v2/consent",
      {
        body: JSON.stringify({
          accepted: true,
          consentVersion: "guardian-voice-r2-v2",
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
    return {
      artStatus: artResponse.status,
      consentStatus: consentResponse.status,
      conversationId: conversation.conversation.id,
      generatedChildName: generated.lesson?.childName,
      generationStatus: generationResponse.status,
      lessonId: savedLesson.lesson.id,
    };
  }, createLessonScript());

  expect(miaData.artStatus).toBe(201);
  expect(miaData.consentStatus).toBe(204);
  expect(miaData.generationStatus).toBe(200);
  expect(miaData.generatedChildName).toBe("Mia");
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah in learner mode" })
    .click();

  const noahData = await page.evaluate(async ({ conversationId, lessonId }) => {
    const [lessons, siblingLesson, siblingConversation, art, dub, generated] =
      await Promise.all([
        fetch("/api/lessons/my").then((response) => response.json()),
        fetch(`/api/lessons/my/${lessonId}`),
        fetch(`/api/conversations/${conversationId}`),
        fetch("/api/stories/the-red-ball/personalized-art").then((response) =>
          response.json(),
        ),
        fetch("/api/dubs/five-little-ducks-v2").then((response) =>
          response.json(),
        ),
        fetch("/api/lessons/my/generate", {
          body: JSON.stringify({ topic: "rainy day" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then((response) => response.json()),
      ]);
    return {
      art,
      dub,
      generated,
      lessons,
      siblingConversationStatus: siblingConversation.status,
      siblingLessonStatus: siblingLesson.status,
    };
  }, miaData);

  expect(noahData.lessons).toEqual({ lessons: [] });
  expect(noahData.siblingLessonStatus).toBe(404);
  expect(noahData.siblingConversationStatus).toBe(404);
  expect(noahData.art).toMatchObject({ hasStoredArt: false, stories: {} });
  expect(noahData.dub).toMatchObject({
    consentState: "not_granted",
    recordingEnabled: false,
  });
  expect(noahData.generated).toMatchObject({
    lesson: { childName: "Noah" },
    warnings: [],
  });
});

test("keeps automatic lesson recordings isolated by selected learner", async ({
  page,
}) => {
  const recordingSnapshot = () =>
    page.evaluate(() => {
      const media = (
        window as Window & {
          __parrotE2eLessonMedia?: {
            snapshot(): {
              getUserMediaCalls: number;
              uploads: Array<{
                lessonId: string;
                sceneIndex: number;
                stepIndex: number;
              }>;
            };
          };
        }
      ).__parrotE2eLessonMedia;
      if (!media) throw new Error("Lesson media controller is missing.");
      return media.snapshot();
    });
  const lessonPath =
    "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eLesson=recording";

  await page.goto(
    learnerScenarioUrl("/guardian/learners/learner-mia", "multiple"),
  );
  const consentSection = page.getByRole("region", {
    name: "Lesson voice recordings",
  });
  await consentSection
    .getByRole("button", { name: "Allow lesson voice recordings" })
    .click();
  await expect(consentSection.getByRole("status")).toHaveText(
    "Lesson recording is currently allowed.",
  );

  await page.goto(learnerScenarioUrl(lessonPath, "multiple", "learner"));
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(
    page
      .getByRole("region", { name: "Join in" })
      .filter({ hasText: "It is up high!" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await recordingSnapshot()).uploads.length)
    .toBe(1);
  await expect(
    page.getByText(/tap to talk|start recording|stop recording/i),
  ).toHaveCount(0);
  expect((await recordingSnapshot()).uploads[0]).toMatchObject({
    lessonId: "01-peppas-high-ball",
    sceneIndex: 0,
    stepIndex: 2,
  });

  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah in learner mode" })
    .click();
  await page.goto(
    learnerScenarioUrl("/guardian/learners/learner-noah", "multiple"),
  );
  await expect(
    page
      .getByRole("region", { name: "Lesson voice recordings" })
      .getByRole("status"),
  ).toHaveText("Lesson recording is currently off.");

  await page.goto(learnerScenarioUrl(lessonPath, "multiple", "learner"));
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(
    page
      .getByRole("region", { name: "Join in" })
      .filter({ hasText: "It is up high!" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await recordingSnapshot()).uploads)
    .toEqual([]);
  expect((await recordingSnapshot()).getUserMediaCalls).toBe(0);

  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Mia")
    .getByRole("button", { name: "Use Mia in learner mode" })
    .click();
  await page.goto(
    learnerScenarioUrl("/guardian/learners/learner-mia", "multiple"),
  );
  await expect(
    page
      .getByRole("region", { name: "Lesson voice recordings" })
      .getByRole("status"),
  ).toHaveText("Lesson recording is currently allowed.");
  expect((await recordingSnapshot()).uploads).toHaveLength(1);
});

test("rejects Mia's queued lesson recording after the Guardian switches to Noah", async ({
  page,
}) => {
  const oneLineLesson = createLessonScript();
  oneLineLesson.scenes = oneLineLesson.scenes.slice(0, 1);
  const recordingFor = (profileId: string) =>
    page.evaluate((learnerProfileId) => {
      const learners = (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(profileId?: string): {
              lessonRecording: {
                pendingUploads: number;
                uploads: Array<{
                  expectedLearnerProfileId: string | null;
                  outcome: string;
                  size: number;
                  type: string;
                }>;
              } | null;
            };
          };
        }
      ).__parrotE2eLearners;
      if (!learners) throw new Error("Learner controller is missing.");
      return learners.snapshot(learnerProfileId).lessonRecording;
    }, profileId);
  const mediaSnapshot = () =>
    page.evaluate(() => {
      const media = (
        window as Window & {
          __parrotE2eLessonMedia?: {
            snapshot(): {
              recorderStops: Array<{ id: number }>;
            };
          };
        }
      ).__parrotE2eLessonMedia;
      if (!media) throw new Error("Lesson media controller is missing.");
      return media.snapshot();
    });
  const allowRecordings = async () => {
    const consent = page.getByRole("region", {
      name: "Lesson voice recordings",
    });
    await consent
      .getByRole("button", { name: "Allow lesson voice recordings" })
      .click();
    await expect(consent.getByRole("status")).toHaveText(
      "Lesson recording is currently allowed.",
    );
  };

  await page.goto(
    learnerScenarioUrl("/guardian/learners/learner-mia", "multiple"),
  );
  await allowRecordings();
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah in learner mode" })
    .click();
  await page.goto(
    learnerScenarioUrl("/guardian/learners/learner-noah", "multiple"),
  );
  await allowRecordings();
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Mia")
    .getByRole("button", { name: "Use Mia in learner mode" })
    .click();

  const lessonId = await page.evaluate(async (lesson) => {
    const response = await fetch("/api/lessons/my", {
      body: JSON.stringify({ lesson, source: "uploaded" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error("The Mia lesson could not be saved.");
    const payload = (await response.json()) as { lesson: { id: string } };
    return payload.lesson.id;
  }, oneLineLesson);
  const lessonPath = `/lessons/my/${encodeURIComponent(lessonId)}/scenes/1?parrotE2eLesson=upload-held`;

  await page.goto(learnerScenarioUrl(lessonPath, "multiple", "learner"));
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(
    page.getByRole("heading", { name: "Lesson complete!" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await recordingFor("learner-mia"))?.pendingUploads)
    .toBe(1);
  await expect
    .poll(async () => (await mediaSnapshot()).recorderStops.length)
    .toBe(1);

  await page.getByRole("button", { name: "Replay lesson" }).click();
  await expect
    .poll(async () => (await mediaSnapshot()).recorderStops.length)
    .toBe(2);
  await expect(
    page.getByRole("heading", { name: "Lesson complete!" }),
  ).toBeVisible();
  await expect(
    page.getByText("Saving your voices…", { exact: true }),
  ).toBeVisible();
  const queuedForMia = await recordingFor("learner-mia");
  expect(
    queuedForMia?.uploads,
    "only the first of two completed recordings should have started its PUT",
  ).toEqual([
    expect.objectContaining({
      expectedLearnerProfileId: "learner-mia",
      outcome: "held",
    }),
  ]);
  expect(queuedForMia?.pendingUploads).toBe(1);

  await page
    .getByRole("button", { name: /Profile for Mia, learner mode/ })
    .click();
  await page
    .getByRole("menu", { name: "Account menu" })
    .getByRole("menuitem", { name: /Grown-up access/ })
    .click();
  const unlock = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await unlock.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await unlock.getByRole("button", { name: "Unlock guardian mode" }).click();
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  await page.getByRole("link", { exact: true, name: "Manage learners" }).click();
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah in learner mode" })
    .click();
  const released = await page.evaluate(() =>
    (
      window as Window & {
        __parrotE2eLessonMedia?: { resolveNextUpload(): boolean };
      }
    ).__parrotE2eLessonMedia?.resolveNextUpload(),
  );
  expect(released).toBe(true);

  await expect
    .poll(async () => (await recordingFor("learner-mia"))?.pendingUploads)
    .toBe(0);
  await expect
    .poll(async () => (await recordingFor("learner-noah"))?.uploads.length)
    .toBe(1);
  const mia = await recordingFor("learner-mia");
  const noah = await recordingFor("learner-noah");
  expect(mia?.uploads).toEqual([
    expect.objectContaining({
      expectedLearnerProfileId: "learner-mia",
      outcome: "saved",
    }),
  ]);
  expect(noah?.uploads).toEqual([
    expect.objectContaining({
      expectedLearnerProfileId: "learner-mia",
      outcome: "learner_selection_changed",
      size: 0,
      type: "",
    }),
  ]);
  expect(noah?.pendingUploads).toBe(0);
});

test("requires the account password before revealing a selection-required roster", async ({
  page,
}) => {
  const requestedUrl = learnerScenarioUrl(
    "/guardian/learners",
    "selection-required",
    "learner",
  );
  await page.goto(requestedUrl);

  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toHaveCount(0);
  await expect(page.getByText("Noah", { exact: true })).toHaveCount(0);
  const lockedRoster = await page.evaluate(async () => {
    const response = await fetch("/api/learner-profiles");
    return { body: await response.json(), status: response.status };
  });
  expect(lockedRoster).toEqual({
    body: { error: "guardian_required" },
    status: 403,
  });

  await unlockGuardianScreen(page);
  await expect(page).toHaveURL(requestedUrl);
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose a learner" }),
  ).toBeVisible();
});

test("shows a learner-safe no-selection state and sends an incomplete learner to setup", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/", "selection-required", "learner"));

  await expect(
    page.getByRole("heading", {
      name: "Ask a grown-up to choose a learner",
    }),
  ).toBeVisible();
  await expect(page.getByText("Mia", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Noah", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: /Profile for Learner, learner mode/ })
    .click();
  await expect(
    page.getByRole("menu", { name: "Account menu" }).getByRole("menuitem"),
  ).toHaveText(["Grown-up accessAccount password required"]);

  await page.goto(
    learnerScenarioUrl("/guardian/learners", "selection-required"),
  );
  await page.getByLabel("Preferred name").fill("Ava");
  await page.getByRole("button", { name: "Add learner" }).click();
  await expect(page.getByText("Managing Ava", { exact: true })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Back" }).click();
  await learnerCard(page, "Ava")
    .getByRole("button", { name: "Use Ava in learner mode" })
    .click();
  await page
    .getByRole("link", { exact: true, name: "Back to guardian dashboard" })
    .click();
  await page.getByRole("button", { exact: true, name: "Switch to learner" }).click();
  await expect(page).toHaveURL(/\/profile\/setup/);
  await expect(
    page.getByRole("heading", { name: "Answer 6 questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Ava, learner mode/ }),
  ).toBeVisible();
});

test("fails closed when learner selection has an ambiguous server failure", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "select-error"));
  const selectNoah = learnerCard(page, "Noah").getByRole("button", {
    name: "Use Noah in learner mode",
  });

  await selectNoah.click();

  await expect(
    page.getByRole("heading", {
      name: /couldn't verify the current learner/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      includeHidden: true,
      name: "Use Noah in learner mode",
    }),
  ).toBeHidden();
  const pending = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.includes(":pending:"),
    );
    return key ? { key, value: localStorage.getItem(key) } : null;
  });
  expect(pending).toMatchObject({ value: "uncertain" });
  expect(pending?.key).not.toContain("e2e-session");
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: {
              snapshot(): { activeProfileId: string | null };
            };
          }
        ).__parrotE2eLearners?.snapshot().activeProfileId,
    ),
  ).toBe("learner-mia");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", {
      name: /couldn't verify the current learner/i,
    }),
  ).toBeVisible();
});

test("keeps the roster and learner mode stable when learner creation fails", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "create-error"));
  await page.getByLabel("Preferred name").fill("Ava");
  await page.getByRole("button", { name: "Add learner" }).click();

  await expect(
    page.getByRole("main").getByRole("alert"),
  ).toHaveText("The learner could not be added.");
  expect(
    await page.evaluate(() =>
      (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): {
              activeProfileId: string | null;
              profiles: Array<{ name: string }>;
            };
          };
        }
      ).__parrotE2eLearners?.snapshot(),
    ),
  ).toMatchObject({
    activeProfileId: "learner-mia",
    profiles: [{ name: "Mia" }, { name: "Noah" }],
  });
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
  await expect(page.getByLabel("Preferred name")).toHaveValue("Ava");
  await expect(page.getByRole("button", { name: "Add learner" })).toBeEnabled();
});

test("suppresses a held selection response after a newer selection wins", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "stale-selection"));
  const selectNoah = learnerCard(page, "Noah").getByRole("button", {
    name: "Use Noah in learner mode",
  });
  await selectNoah.click({ noWaitAfter: true });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { staleSelectionPending: boolean };
              };
            }
          ).__parrotE2eLearners?.snapshot().staleSelectionPending ?? false,
      ),
    )
    .toBe(true);

  const newerSelection = await page.evaluate(async () => {
    const selected = await fetch("/api/learner-profiles/learner-mia/active", {
      method: "PUT",
    }).then((response) => response.json());
    const profile = await fetch("/api/learner-profile").then((response) =>
      response.json(),
    );
    return { profile, selected };
  });
  expect(newerSelection).toMatchObject({
    profile: { profile: { id: "learner-mia", name: "Mia" } },
    selected: { activeProfileId: "learner-mia" },
  });
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: { releaseStaleSelection(): boolean };
          }
        ).__parrotE2eLearners?.releaseStaleSelection() ?? false,
    ),
  ).toBe(true);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The selected learner could not be loaded.",
  );
  await expect(selectNoah).toBeFocused();
  await expect(learnerCard(page, "Mia")).toContainText("Learner mode");
  await expect(page.getByText("Now managing Noah")).toHaveCount(0);
});

test("keeps the fixed Guardian account actions while a learner switch is pending", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "stale-selection"));
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah in learner mode" })
    .click({ noWaitAfter: true });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { staleSelectionPending: boolean };
              };
            }
          ).__parrotE2eLearners?.snapshot().staleSelectionPending ?? false,
      ),
    )
    .toBe(true);

  await expect(
    page.getByRole("heading", { name: "Checking the current learner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /guardian mode/ }).click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);
  await expect(page).toHaveURL(/\/guardian\/learners/);
  await page.keyboard.press("Escape");

  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: { releaseStaleSelection(): boolean };
          }
        ).__parrotE2eLearners?.releaseStaleSelection() ?? false,
    ),
  ).toBe(true);
  await expect(learnerCard(page, "Noah")).toContainText("Learner mode");
  await page.getByRole("button", { name: /guardian mode/ }).click();
  await expect(
    page.getByRole("menu", { name: "Account menu" }).getByRole("menuitem"),
  ).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);
});

const learnerRoutes = [
  "/",
  "/talk-to-peppa",
  "/lessons",
  "/lessons/parrot/01-peppas-high-ball/scenes/1",
  "/stories",
  "/stories/the-red-ball/pages/1",
  "/progress",
  "/profile/setup",
  "/dubs/five-little-ducks",
] as const;

test("keeps sibling identity and every Guardian action out of learner routes", async ({
  page,
}) => {
  for (const path of learnerRoutes) {
    await page.goto(learnerScenarioUrl(path, "multiple", "learner"));
    const trigger = page.getByRole("button", {
      name: /Profile for Mia, learner mode/,
    });
    await expect(trigger, `active learner header on ${path}`).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText, `rendered sibling name on ${path}`).not.toContain("Noah");
    for (const guardianAction of [
      "Guardian dashboard",
      "Manage learners",
      "Account & privacy",
      "Sign out",
    ]) {
      await expect(
        page.getByRole("menuitem", { name: guardianAction }),
        `${guardianAction} on ${path}`,
      ).toHaveCount(0);
    }

    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Grown-up accessAccount password required",
    ]);
    await expect(menu).not.toContainText("Noah");
    await page.keyboard.press("Escape");

    if (path === "/dubs/five-little-ducks") {
      await expect(
        page.getByRole("main").getByRole("paragraph").filter({
          hasText: "Ask a grown-up to turn on voice dubbing in Guardian mode.",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: /grown-up|guardian|consent/i }),
      ).toHaveCount(0);
      await trigger.click();
      await page
        .getByRole("menu", { name: "Account menu" })
        .getByRole("menuitem", { name: /Grown-up access/ })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Unlock guardian mode" }),
      ).toBeVisible();
    }
  }
});

const requiredViewports = [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of requiredViewports) {
  test(`keeps the roster, active context, and Guardian menu contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

    const main = page.getByRole("main");
    const back = page.getByRole("link", { name: "Back to guardian dashboard" });
    const trigger = page.getByRole("button", {
      name: /Profile for Alex Guardian, guardian mode/,
    });
    const noah = learnerCard(page, "Noah");
    const add = page.getByRole("button", { name: "Add learner" });
    await expect(
      page.getByRole("heading", { name: "Managing Mia" }),
    ).toBeVisible();
    await expect(noah).toContainText("Setup complete");
    await expect(
      noah.getByRole("button", { name: "Use Noah in learner mode" }),
    ).toBeVisible();
    await expect(
      noah.getByRole("button", { name: "Edit Noah's profile" }),
    ).toBeVisible();
    await expect(add).toBeVisible();
    await expectContainedHorizontally(back, page);
    await expectContainedHorizontally(trigger, page);
    await expectContainedHorizontally(noah, page);
    await expectContainedHorizontally(add, page);
    await expectNoHorizontalOverflow(page);

    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    const panel = menu.locator("..");
    await expect(
      panel.getByRole("group", { name: "Active profile" }),
    ).toContainText("Managing Mia");
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Guardian dashboard",
      "Manage learners",
      "Account & privacy",
      "Sign out",
    ]);
    await expectContainedHorizontally(panel, page);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(add).toBeVisible();
  });
}

const guardianNameSurfaces = [
  { heading: "Learner details", path: "/guardian/learners/learner-mia" },
  { heading: "My Lessons", path: "/guardian/lessons" },
  { heading: "Story settings", path: "/guardian/stories" },
  { heading: "Voice dubbing", path: "/guardian/dubbing" },
] as const;

async function renameActiveLearner(page: Page, name: string) {
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  const updated = await page.evaluate(async (nextName) => {
    const response = await fetch("/api/profile", {
      body: JSON.stringify({
        answers: { age: "8", description: "", name: nextName },
      }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    return {
      body: await response.json(),
      snapshot: (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): { profiles: Array<{ id: string; name: string }> };
          };
        }
      ).__parrotE2eLearners?.snapshot(),
      status: response.status,
    };
  }, name);
  expect(updated.status).toBe(200);
  expect(updated.body).toMatchObject({
    profile: { id: "learner-mia", name },
  });
  expect(
    updated.snapshot?.profiles.find(({ id }) => id === "learner-mia"),
  ).toMatchObject({ id: "learner-mia", name });
  await page.reload();
}

async function expectGuardianNameSurfacesContained(page: Page, name: string) {
  const directions: string[] = [];
  for (const surface of guardianNameSurfaces) {
    await page.goto(learnerScenarioUrl(surface.path, "multiple"));
    await expect(
      page.getByRole("heading", { exact: true, name: surface.heading }),
      `${surface.path} heading`,
    ).toBeVisible();

    if (surface.path === "/guardian/learners/learner-mia") {
      await expect(page.getByLabel("Name")).toHaveValue(name);
      await expect(
        page.getByText(`About ${name}`, { exact: true }),
      ).toBeVisible();
    } else if (surface.path === "/guardian/lessons") {
      await expect(
        page
          .getByRole("main")
          .getByRole("status")
          .filter({ hasText: "No custom lessons yet." }),
      ).toHaveText("No custom lessons yet.");
    } else if (surface.path === "/guardian/stories") {
      const art = page.getByRole("region", { name: "Personalized story art" });
      await expect(art).toBeVisible();
      await expect(
        art.getByLabel(`Upload ${name}'s photo`, { exact: false }),
      ).toBeVisible();
    } else {
      const consent = page.getByRole("checkbox");
      await expect(consent).toBeVisible();
      await expect(consent).toHaveAccessibleName(new RegExp(name));
    }

    directions.push(...(await expectNameContentContained(page, name)));
    await expectNoHorizontalOverflow(page);

    const trigger = page.getByRole("button", {
      name: /Profile for Alex Guardian, guardian mode/,
    });
    await expectContainedHorizontally(trigger, page);
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    await expect(
      menu.locator("..").getByRole("group", { name: "Active profile" }),
    ).toContainText(`Managing ${name}`);
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Guardian dashboard",
      "Manage learners",
      "Account & privacy",
      "Sign out",
    ]);
    directions.push(...(await expectNameContentContained(page, name)));
    await expectContainedHorizontally(menu.locator(".."), page);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
  }
  return directions;
}

test("wraps an unbroken 120-character active learner name without horizontal overflow", async ({
  page,
}) => {
  const longName = "A".repeat(120);
  await page.setViewportSize({ width: 280, height: 568 });
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await renameActiveLearner(page, longName);

  await expect(learnerCard(page, longName)).toContainText(longName);
  await expectNameContentContained(page, longName);
  await expectLearnerDeletionDialogContained(page, longName);
  const trigger = page.getByRole("button", {
    name: /Profile for Alex Guardian, guardian mode/,
  });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(
    menu.locator("..").getByRole("group", { name: "Active profile" }),
  ).toContainText(`Managing ${longName}`);
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);
  await expectContainedHorizontally(menu.locator(".."), page);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");

  await expectGuardianNameSurfacesContained(page, longName);
});

test("isolates a right-to-left learner name across every Guardian context at 280px", async ({
  page,
}) => {
  const rtlName = "مريم الببغاء ١٢٣";
  await page.setViewportSize({ width: 280, height: 568 });
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await renameActiveLearner(page, rtlName);

  await expect(learnerCard(page, rtlName)).toContainText(rtlName);
  const rosterDirections = await expectNameContentContained(page, rtlName);
  expect(rosterDirections).toContain("rtl");
  await expectLearnerDeletionDialogContained(page, rtlName);
  await expectNoHorizontalOverflow(page);

  const surfaceDirections = await expectGuardianNameSurfacesContained(
    page,
    rtlName,
  );
  expect(surfaceDirections).toContain("rtl");
});

test("keeps details, wildcard, mode-mismatch, and redo exits inside Guardian navigation", async ({
  page,
}) => {
  await page.goto(
    learnerScenarioUrl(
      "/guardian/learners/learner-mia",
      "multiple",
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/guardian/learners");
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  await page
    .getByRole("link", { exact: true, name: "Back to guardian dashboard" })
    .click();
  await expect(page).toHaveURL("/guardian");

  await page.goto(learnerScenarioUrl("/guardian/not-a-route", "multiple"));
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  await page.goto(learnerScenarioUrl("/lessons", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Switch to learner mode" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Guardian dashboard" }).click();
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  await page.goto(
    learnerScenarioUrl(
      "/guardian/profile/setup?redo=1&returnTo=%2Fguardian&parrotE2eProfile=viewport-stability",
      "multiple",
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/guardian");
});

test("targets Noah through lesson list, create, edit, Back, Save, refresh, and history without changing learner mode", async ({
  page,
}) => {
  const miaLesson = createLessonScript({ title: "Mia's garden lesson" });
  const noahLesson = createLessonScript({ title: "Noah's space lesson" });
  await page.goto(learnerScenarioUrl("/guardian/lessons", "multiple"));
  await expect(
    page.getByRole("group", { name: "Choose learner settings target" }),
  ).toBeVisible();
  const seeded = await page.evaluate(
    async ({ miaLesson, noahLesson }) => {
      const save = async (lesson: unknown, learnerProfileId?: string) => {
        const target = learnerProfileId
          ? `?${new URLSearchParams({ learnerProfileId })}`
          : "";
        const response = await fetch(`/api/lessons/my${target}`, {
          body: JSON.stringify({ lesson, source: "uploaded" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as { lesson: { id: string } };
        return payload.lesson.id;
      };
      return {
        miaLessonId: await save(miaLesson),
        noahLessonId: await save(noahLesson, "learner-noah"),
      };
    },
    { miaLesson, noahLesson },
  );
  await page.reload();

  const target = page.getByRole("group", {
    name: "Choose learner settings target",
  });
  await expect(
    target.getByRole("button", { exact: true, name: "Mia" }),
  ).toBeVisible();
  await expect(
    target.getByRole("button", { exact: true, name: "Noah" }),
  ).toBeVisible();
  await expect(
    page.getByText("Mia's garden lesson", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Noah's space lesson", { exact: true }),
  ).toHaveCount(0);

  await target.getByRole("button", { exact: true, name: "Noah" }).click();
  await expect(page).toHaveURL(/learnerProfileId=learner-noah/);
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Noah's space lesson", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Mia's garden lesson", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Switch and play/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage learners" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Create custom lesson" }).click();
  await expect(page).toHaveURL(
    /\/lessons\/my\/create.*learnerProfileId=learner-noah/,
  );
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Import JSON" }).click();
  await expect(page).toHaveURL(
    /tab=upload.*learnerProfileId=learner-noah|learnerProfileId=learner-noah.*tab=upload/,
  );
  await page
    .getByLabel("Editable lesson script (JSON)")
    .fill(JSON.stringify(createLessonScript({ title: "Noah's new lesson" })));
  await page.getByRole("button", { name: "Review script" }).click();
  await page.getByRole("button", { exact: true, name: "Save lesson" }).click();
  await expect(page).toHaveURL(
    /\/guardian\/lessons.*learnerProfileId=learner-noah/,
  );
  await expect(
    page.getByText("Noah's new lesson", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Edit lesson: Noah's space lesson" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/lessons/my/${encodeURIComponent(seeded.noahLessonId)}/edit.*learnerProfileId=learner-noah`,
    ),
  );
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to lessons" }).click();
  await expect(page).toHaveURL(
    /\/guardian\/lessons.*learnerProfileId=learner-noah/,
  );

  await page
    .getByRole("link", { name: "Edit lesson: Noah's space lesson" })
    .click();
  await page.getByRole("button", { exact: true, name: "Save changes" }).click();
  await expect(page).toHaveURL(
    /\/guardian\/lessons.*learnerProfileId=learner-noah/,
  );

  await target.getByRole("button", { exact: true, name: "Mia" }).click();
  await expect(
    page.getByText("Editing settings for Mia", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();

  const state = await page.evaluate(async ({ miaLessonId, noahLessonId }) => {
    const [mia, noah] = await Promise.all([
      fetch("/api/lessons/my").then((response) => response.json()) as Promise<{
        lessons: Array<{ id: string }>;
      }>,
      fetch("/api/lessons/my?learnerProfileId=learner-noah").then((response) =>
        response.json(),
      ) as Promise<{ lessons: Array<{ id: string }> }>,
    ]);
    return {
      activeProfileId: (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): { activeProfileId: string | null };
          };
        }
      ).__parrotE2eLearners?.snapshot().activeProfileId,
      miaHasMiaLesson: mia.lessons.some(({ id }) => id === miaLessonId),
      miaHasNoahLesson: mia.lessons.some(({ id }) => id === noahLessonId),
      noahHasNoahLesson: noah.lessons.some(({ id }) => id === noahLessonId),
      noahLessonCount: noah.lessons.length,
    };
  }, seeded);
  expect(state).toEqual({
    activeProfileId: "learner-mia",
    miaHasMiaLesson: true,
    miaHasNoahLesson: false,
    noahHasNoahLesson: true,
    noahLessonCount: 2,
  });
});

test("targets Noah's story level and personalized art without changing Mia's learner mode", async ({
  page,
}) => {
  await page.goto(
    learnerScenarioUrl(
      "/guardian/stories?learnerProfileId=learner-noah",
      "multiple",
    ),
  );

  const target = page.getByRole("group", {
    name: "Choose learner settings target",
  });
  await expect(
    target.getByRole("button", { exact: true, name: "Mia" }),
  ).toBeVisible();
  await expect(
    target.getByRole("button", { exact: true, name: "Noah" }),
  ).toBeVisible();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Little stories/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Story level saved" }),
  ).toContainText("Little stories");

  await page.evaluate(async () => {
    const response = await fetch(
      "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-noah",
      { body: new FormData(), method: "POST" },
    );
    if (!response.ok) throw new Error("Could not seed Noah's story art.");
  });
  await page.reload();
  const portrait = page.getByRole("img", {
    name: "Noah holding a bright red ball",
  });
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute(
    "src",
    "/api/stories/the-red-ball/personalized-art/asset?v=1786276800000&learnerProfileId=learner-noah",
  );

  await target.getByRole("button", { exact: true, name: "Mia" }).click();
  await expect(
    page.getByText("Editing settings for Mia", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();

  const state = await page.evaluate(async () => {
    const [miaProfile, noahProfile, miaArt, noahArt] = await Promise.all([
      fetch("/api/profile").then((response) => response.json()) as Promise<{
        profile: { storyLevel: string };
      }>,
      fetch("/api/profile?learnerProfileId=learner-noah").then((response) =>
        response.json(),
      ) as Promise<{ profile: { storyLevel: string } }>,
      fetch("/api/stories/the-red-ball/personalized-art").then((response) =>
        response.json(),
      ) as Promise<{ hasStoredArt: boolean }>,
      fetch(
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-noah",
      ).then((response) => response.json()) as Promise<{
        hasStoredArt: boolean;
      }>,
    ]);
    return {
      activeProfileId: (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): { activeProfileId: string | null };
          };
        }
      ).__parrotE2eLearners?.snapshot().activeProfileId,
      miaArt: miaArt.hasStoredArt,
      miaLevel: miaProfile.profile.storyLevel,
      noahArt: noahArt.hasStoredArt,
      noahLevel: noahProfile.profile.storyLevel,
    };
  });
  expect(state).toEqual({
    activeProfileId: "learner-mia",
    miaArt: false,
    miaLevel: "first-words",
    noahArt: true,
    noahLevel: "tiny-stories",
  });
});

test("targets Noah's dubbing grant and deletion without switching learner mode", async ({
  page,
}) => {
  await page.goto(
    learnerScenarioUrl(
      "/guardian/dubbing?learnerProfileId=learner-noah",
      "multiple",
    ),
  );

  const target = page.getByRole("group", {
    name: "Choose learner settings target",
  });
  await expect(
    target.getByRole("button", { exact: true, name: "Mia" }),
  ).toBeVisible();
  await expect(
    target.getByRole("button", { exact: true, name: "Noah" }),
  ).toBeVisible();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Switch to .*start dubbing/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage learners" }),
  ).toBeVisible();

  const granted = await page.evaluate(async () => {
    const [mia, noah] = await Promise.all([
      fetch("/api/dubs/five-little-ducks-v2").then((response) =>
        response.json(),
      ) as Promise<{ consentState: string }>,
      fetch(
        "/api/dubs/five-little-ducks-v2?learnerProfileId=learner-noah",
      ).then((response) => response.json()) as Promise<{
        consentState: string;
      }>,
    ]);
    return { mia: mia.consentState, noah: noah.consentState };
  });
  expect(granted).toEqual({ mia: "not_granted", noah: "granted" });

  await page
    .getByRole("button", {
      name: "Turn off Noah's voice dubbing and delete saved clips",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Allow voice dubbing" }),
  ).toBeVisible();
  const removed = await page.evaluate(async () => {
    const response = await fetch(
      "/api/dubs/five-little-ducks-v2?learnerProfileId=learner-noah",
    );
    return (await response.json()) as { consentState: string };
  });
  expect(removed.consentState).toBe("not_granted");

  await target.getByRole("button", { exact: true, name: "Mia" }).click();
  await expect(
    page.getByText("Editing settings for Mia", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByText("Editing settings for Noah", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { activeProfileId: string | null };
              };
            }
          ).__parrotE2eLearners?.snapshot().activeProfileId,
      ),
    )
    .toBe("learner-mia");
});

test("locked 26-row targeted security matrix handles all 52 requests before parsing or resolution", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/", "multiple", "learner"));
  await expect(
    page.getByRole("heading", { name: "Tap a picture." }),
  ).toBeVisible();

  await setGuardianAccess(page, "guardian");
  await seedTargetedAuthorizationState(page);
  const before = await readTargetedAccountState(page);
  await setGuardianAccess(page, "learner");
  const queries: TargetedQueryCase[] = [
    {
      name: "duplicate",
      value: "learnerProfileId=learner-mia&learnerProfileId=learner-noah",
    },
    { name: "foreign", value: "learnerProfileId=foreign-learner" },
  ];
  const result = await exerciseTargetedRequests(page, queries);
  await setGuardianAccess(page, "guardian");
  const after = await readTargetedAccountState(page);

  expect(result.responses).toHaveLength(52);
  expect(
    result.responses.filter(({ mutationCapable }) => mutationCapable),
    "25-row mutation-capable subset across two locked target shapes",
  ).toHaveLength(50);
  expect(
    result.responses
      .filter(({ mutationCapable }) => !mutationCapable)
      .map(({ name }) => name),
  ).toEqual([
    "learner-profile question skip / duplicate",
    "learner-profile question skip / foreign",
  ]);
  for (const response of result.responses) {
    expect(response.body, response.name).toEqual({ error: "guardian_required" });
    expect(response.cacheControl, response.name).toBe("no-store");
    expect(response.contentType, response.name).toContain("application/json");
    expect(response.mockApi, response.name).toBe("browser");
    expect(response.status, response.name).toBe(403);
  }
  expect(result.parseCalls).toBe(0);
  expect(after).toEqual(before);
});

test("question skip rejects a learner's current required question without changing account state", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  const created = await page.evaluate(async () => {
    const response = await fetch("/api/learner-profiles", {
      body: JSON.stringify({ activate: false, name: "Ava" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return { body: await response.json(), status: response.status };
  });
  expect(created).toMatchObject({
    body: {
      activeProfileId: "learner-mia",
      profiles: [
        { id: "learner-mia" },
        { id: "learner-noah" },
        { id: "learner-ava-3" },
      ],
    },
    status: 200,
  });

  const readAva = () =>
    page.evaluate(async () => {
      const response = await fetch(
        "/api/learner-profile?learnerProfileId=learner-ava-3",
      );
      return { body: await response.json(), status: response.status };
    });
  const beforeAccount = await readTargetedAccountState(page);
  const beforeAva = await readAva();
  expect(beforeAva).toMatchObject({
    body: {
      profile: { currentQuestionKey: "name", profileStatus: "not_started" },
      question: { answerKey: "name", required: true },
    },
    status: 200,
  });

  const skipped = await page.evaluate(async () => {
    const response = await fetch(
      "/api/learner-profile/question/skip?learnerProfileId=learner-ava-3",
      {
        body: JSON.stringify({ questionKey: "name" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    return { body: await response.json(), status: response.status };
  });
  expect(skipped).toEqual({
    body: {
      error: "invalid_answer",
      fieldError: "This question is required.",
    },
    status: 400,
  });

  expect(await readAva()).toEqual(beforeAva);
  expect(await readTargetedAccountState(page)).toEqual(beforeAccount);
});

test("question skip rejects a non-current question without changing either learner or active selection", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  const before = await readTargetedAccountState(page);
  expect(before).toMatchObject({
    activeProfileId: "learner-mia",
    learners: {
      mia: {
        learnerProfile: {
          body: {
            profile: { currentQuestionKey: null, profileStatus: "completed" },
          },
        },
      },
      noah: {
        learnerProfile: {
          body: {
            profile: { currentQuestionKey: null, profileStatus: "completed" },
          },
        },
      },
    },
  });

  const skipped = await page.evaluate(async () => {
    const response = await fetch(
      "/api/learner-profile/question/skip?learnerProfileId=learner-mia",
      {
        body: JSON.stringify({ questionKey: "favoriteAnimals" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    return { body: await response.json(), status: response.status };
  });
  expect(skipped).toEqual({
    body: {
      error: "invalid_answer",
      fieldError: "Please answer the current question first.",
    },
    status: 409,
  });
  expect(await readTargetedAccountState(page)).toEqual(before);
});

test("cross-origin learner-target paths stay with native fetch", async ({
  page,
}) => {
  await page.route("https://fixture.example/**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ source: "native-fetch" }),
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      status: 207,
    });
  });
  await page.goto(
    "/guardian/learners/e2e-learner?parrotE2eProfile=viewport-stability&parrotE2eGuardian=guardian",
  );
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();

  const response = await page.evaluate(async () => {
    const result = await fetch(
      "https://fixture.example/api/profile?learnerProfileId=unknown-learner",
    );
    return {
      body: await result.json(),
      mockApi: result.headers.get("X-Parrot-Mock-Api"),
      status: result.status,
    };
  });

  expect(response).toEqual({
    body: { source: "native-fetch" },
    mockApi: null,
    status: 207,
  });
});

test("singleton targeted fixtures return the Worker method contract without native fetch", async ({
  page,
}) => {
  await page.goto(
    "/guardian/learners/e2e-learner?parrotE2eProfile=viewport-stability&parrotE2eGuardian=guardian",
  );
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();

  const response = await page.evaluate(async () => {
    const result = await fetch(
      "/api/profile?learnerProfileId=e2e-learner",
      { method: "DELETE" },
    );
    const text = await result.text();
    return {
      body: text ? JSON.parse(text) : null,
      mockApi: result.headers.get("X-Parrot-Mock-Api"),
      status: result.status,
    };
  });

  expect(response).toEqual({
    body: { error: "method_not_allowed" },
    mockApi: "browser",
    status: 405,
  });
});

test("malformed targeted question-skip JSON matches the Worker invalid-json response", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  const before = await readTargetedAccountState(page);

  const response = await page.evaluate(async () => {
    const result = await fetch(
      "/api/learner-profile/question/skip?learnerProfileId=learner-mia",
      {
        body: "{",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    return { body: await result.json(), status: result.status };
  });

  expect(response).toEqual({ body: { error: "invalid_json" }, status: 400 });
  expect(await readTargetedAccountState(page)).toEqual(before);
});

test("unlocked malformed targets in the 26-row security matrix resolve all 182 combinations once to generic 404", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  await seedTargetedAuthorizationState(page);
  const before = await readTargetedAccountState(page);
  const invalidQueries: TargetedQueryCase[] = [
    { name: "blank", value: "learnerProfileId=" },
    { name: "whitespace", value: "learnerProfileId=%20%20" },
    {
      name: "duplicate",
      value: "learnerProfileId=learner-mia&learnerProfileId=learner-noah",
    },
    { name: "unknown", value: "learnerProfileId=unknown-learner" },
    { name: "foreign", value: "learnerProfileId=foreign-learner" },
    { name: "malformed encoding", value: "learnerProfileId=%E0%A4%A" },
    { name: "129-byte", value: `learnerProfileId=${"x".repeat(129)}` },
  ];
  const result = await exerciseTargetedRequests(page, invalidQueries);
  const after = await readTargetedAccountState(page);

  expect(result.responses).toHaveLength(182);
  expect(
    result.responses.filter(({ mutationCapable }) => mutationCapable),
    "25-row mutation-capable subset across seven invalid target shapes",
  ).toHaveLength(175);
  expect(
    result.responses
      .filter(({ mutationCapable }) => !mutationCapable)
      .map(({ name }) => name),
  ).toEqual(
    invalidQueries.map(
      ({ name }) => `learner-profile question skip / ${name}`,
    ),
  );
  for (const response of result.responses) {
    expect(response.body, response.name).toEqual({ error: "not_found" });
    expect(response.cacheControl, response.name).toBe("no-store");
    expect(response.contentType, response.name).toContain("application/json");
    expect(response.mockApi, response.name).toBe("browser");
    expect(response.status, response.name).toBe(404);
  }
  expect(result.parseCalls).toBe(result.responses.length);
  expect(after).toEqual(before);
});

test("targeted profile aliases and mutations stay on Noah while Mia remains in learner mode", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  const lesson = createLessonScript({ title: "Noah's targeted lesson" });

  const result = await page.evaluate(async (lessonScript) => {
    const target = "learnerProfileId=learner-noah";
    const json = async (path: string, init?: RequestInit) => {
      const response = await fetch(path, init);
      return { body: await response.json(), status: response.status };
    };
    const headers = { "Content-Type": "application/json" };
    const learnerProfile = await json(`/api/learner-profile?${target}`);
    const answer = await json(`/api/learner-profile/answer?${target}`, {
      body: JSON.stringify({
        questionKey: "favoriteAnimals",
        rawAnswer: "Likes rockets",
      }),
      headers,
      method: "PUT",
    });
    const profile = await json(`/api/profile?${target}`);
    const savedProfile = await json(`/api/profile?${target}`, {
      body: JSON.stringify({
        answers: { age: "10", description: "Likes space", name: "Noah" },
      }),
      headers,
      method: "PUT",
    });
    const preferences = await json(`/api/profile/preferences?${target}`, {
      body: JSON.stringify({ storyLevel: "tiny-stories" }),
      headers,
      method: "PUT",
    });
    const recording = await json(
      `/api/profile/lesson-recording-consent?${target}`,
      {
        body: JSON.stringify({ enabled: true }),
        headers,
        method: "PUT",
      },
    );
    const createdLesson = await json(`/api/lessons/my?${target}`, {
      body: JSON.stringify({ lesson: lessonScript, source: "uploaded" }),
      headers,
      method: "POST",
    });
    const lessonId = (
      createdLesson.body as { lesson: { id: string } }
    ).lesson.id;
    const editedLesson = await json(
      `/api/lessons/my/${encodeURIComponent(lessonId)}?${target}`,
      {
        body: JSON.stringify({ lesson: lessonScript }),
        headers,
        method: "PUT",
      },
    );
    const dubConsent = await fetch(
      `/api/dubs/five-little-ducks-v2/consent?${target}`,
      {
        body: JSON.stringify({
          accepted: true,
          consentVersion: "guardian-voice-r2-v2",
        }),
        headers,
        method: "PUT",
      },
    );
    const dubDelete = await fetch(
      `/api/dubs/five-little-ducks-v2?${target}`,
      { method: "DELETE" },
    );
    const artCreate = await json(
      `/api/stories/the-red-ball/personalized-art?${target}`,
      { body: new FormData(), method: "POST" },
    );
    const art = await json(
      `/api/stories/the-red-ball/personalized-art?${target}`,
    );
    const artSrc = (
      art.body as {
        stories: {
          "the-red-ball": { pages: { "my-red-ball": { src: string } } };
        };
      }
    ).stories["the-red-ball"].pages["my-red-ball"].src;
    const artAsset = await fetch(artSrc);
    const artDelete = await fetch(
      `/api/stories/the-red-ball/personalized-art?${target}`,
      { method: "DELETE" },
    );
    const recordingStatus = await json(
      `/api/lesson-recordings/consent?${target}`,
    );
    const miaProfile = await json("/api/profile");
    const snapshot = (
      window as Window & {
        __parrotE2eLearners?: {
          snapshot(): { activeProfileId: string | null };
        };
      }
    ).__parrotE2eLearners?.snapshot();
    return {
      activeProfileId: snapshot?.activeProfileId,
      answer,
      artAssetStatus: artAsset.status,
      artCreate,
      artDeleteStatus: artDelete.status,
      artSrc,
      createdLesson,
      dubConsentStatus: dubConsent.status,
      dubDeleteStatus: dubDelete.status,
      editedLesson,
      learnerProfile,
      miaProfile,
      preferences,
      profile,
      recording,
      recordingStatus,
      savedProfile,
    };
  }, lesson);

  expect(result).toMatchObject({
    activeProfileId: "learner-mia",
    answer: { body: { profile: { id: "learner-noah" } }, status: 200 },
    artAssetStatus: 200,
    artCreate: { body: { hasStoredArt: true }, status: 201 },
    artDeleteStatus: 204,
    createdLesson: {
      body: { lesson: { lesson: { title: "Noah's targeted lesson" } } },
      status: 201,
    },
    dubConsentStatus: 204,
    dubDeleteStatus: 204,
    editedLesson: { status: 200 },
    learnerProfile: {
      body: { profile: { id: "learner-noah", name: "Noah" } },
      status: 200,
    },
    miaProfile: {
      body: { profile: { id: "learner-mia", name: "Mia" } },
      status: 200,
    },
    preferences: {
      body: { profile: { id: "learner-noah", storyLevel: "tiny-stories" } },
      status: 200,
    },
    profile: {
      body: { profile: { id: "learner-noah", name: "Noah" } },
      status: 200,
    },
    recording: {
      body: { cleanupPending: false, enabled: true },
      status: 200,
    },
    recordingStatus: { body: { enabled: true }, status: 200 },
    savedProfile: {
      body: { profile: { id: "learner-noah", name: "Noah" } },
      status: 200,
    },
  });
  expect(result.artSrc).toBe(
    "/api/stories/the-red-ball/personalized-art/asset?v=1786276800000&learnerProfileId=learner-noah",
  );
});
