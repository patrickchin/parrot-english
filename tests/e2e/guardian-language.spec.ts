import { expect, test } from "@playwright/test";

const languageGroup = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: /Guardian guidance language|家长指导语言/ });

async function expectUnchangedNavigation(
  page: import("@playwright/test").Page,
  snapshot: { historyLength: number; href: string },
) {
  await expect
    .poll(() => page.evaluate(() => location.href))
    .toBe(snapshot.href);
  await expect
    .poll(() => page.evaluate(() => history.length))
    .toBe(snapshot.historyLength);
}

test("language selection persists locally without changing login navigation", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ contentType: "application/json", json: null }),
  );
  await page.goto("/login");
  await expect(languageGroup(page)).toBeVisible();
  const snapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));

  const chinese = page.getByRole("button", { exact: true, name: "中文" });
  await chinese.click();
  await expect(chinese).toBeFocused();
  await expectUnchangedNavigation(page, snapshot);
  await expect(chinese).toHaveAttribute("aria-pressed", "true");
  await expect(chinese).toHaveAttribute("lang", "zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.getByLabel("电子邮箱")).toBeVisible();
  await expect(page.getByLabel(/^密码/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "以访客身份继续" }),
  ).toBeVisible();

  await page.reload();
  await expect(languageGroup(page)).toHaveAttribute("lang", "zh-Hans");
  await expect(chinese).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
});

test("language control is always visible and keeps learner documents English", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  for (const route of [
    "/guardian?parrotE2eGuardian=guardian",
    "/guardian/learners/e2e-learner?parrotE2eGuardian=guardian",
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
    "/login",
  ]) {
    await page.goto(route);
    await expect(languageGroup(page)).toBeVisible();
  }

  await page.goto("/lessons");
  await expect(languageGroup(page)).toHaveAttribute("lang", "zh-Hans");
  await expect(
    page.getByRole("button", { exact: true, name: "中文" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("language control remains available when the session check fails", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.route("**/api/auth/get-session", (route) => route.abort("failed"));
  await page.goto("/login");
  await expect(languageGroup(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "暂时无法登录" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
});

test("learner session recovery stays English under a Chinese preference", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.route("**/api/auth/get-session", (route) => route.abort("failed"));
  await page.goto("/lessons");

  await expect(
    page.getByRole("heading", { name: "Sign-in is temporarily unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("暂时无法登录")).toHaveCount(0);
});

test("account chrome localizes Guardian mode and keeps learner chrome English", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto("/guardian?parrotE2eGuardian=guardian");
  await page.getByRole("button", { name: /家长模式/ }).click();
  const guardianMenu = page.getByRole("menu", { name: "账户菜单" });
  await expect(
    guardianMenu.getByRole("menuitem", { name: "家长控制面板" }),
  ).toBeVisible();
  await expect(
    guardianMenu.getByRole("menuitem", { name: "管理孩子" }),
  ).toBeVisible();
  await expect(
    guardianMenu.getByRole("menuitem", { name: "账户与隐私" }),
  ).toBeVisible();
  await expect(
    guardianMenu.getByRole("menuitem", { name: "退出登录" }),
  ).toBeVisible();

  await page.goto("/lessons");
  await page.getByRole("button", { name: /learner mode/i }).click();
  const learnerMenu = page.getByRole("menu", { name: "Account menu" });
  const grownUpAccess = learnerMenu.getByRole("menuitem", {
    name: /Grown-up access.*家长入口/,
  });
  await expect(grownUpAccess).toBeVisible();
  await expect(
    learnerMenu.getByText("Switch modes", { exact: true }),
  ).toBeVisible();

  await grownUpAccess.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "家长中心" })).toBeVisible();
});

test("Chinese preference keeps representative learner destinations English and locale-free", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto("/?parrotE2eLesson=held-story");
  await expect(languageGroup(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("link", { name: "Play a lesson" }).click();
  await page
    .getByRole("link", { name: "Start lesson: Peppa's High Ball" })
    .click();
  const lessonSnapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));
  await expect(languageGroup(page)).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(languageGroup(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const peppaDialogue = page.getByRole("status", { name: "Peppa is speaking" });
  await expect(peppaDialogue).toContainText("Look! My ball!");
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toContainText("Scene 1 of 5");
  await expect(
    page.getByRole("button", { name: "Pause lesson" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Lesson updates" }),
  ).toContainText(/Playing|Listen|Scene/);
  await expectUnchangedNavigation(page, lessonSnapshot);

  const failedActiveSound = await page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMedia?: { failNextCue(): boolean };
      }
    ).__parrotE2eLessonMedia;
    if (!controller) throw new Error("Lesson media controller is missing.");
    return controller.failNextCue();
  });
  expect(failedActiveSound).toBe(true);
  const soundError = page.getByRole("alert").filter({
    hasText: "The sound stopped. Try it again or skip this sound.",
  });
  await expect(soundError).toBeVisible();
  await expect(page.getByRole("button", { name: "Try sound" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip sound" })).toBeVisible();
  await expect(page.getByRole("main").locator('[lang="zh-Hans"]')).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Try sound" }).click();
  await expect(soundError).toHaveCount(0);
  await expect(peppaDialogue).toContainText("Look! My ball!");
  await expect(languageGroup(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const destinations = [
    ["/", "Parrot English"],
    ["/lessons", "Pick a lesson"],
    ["/lessons/parrot/01-peppas-high-ball/scenes/1", "Peppa's High Ball"],
    ["/stories", "Pick a story"],
    ["/stories/the-red-ball/pages/1", "The Red Ball"],
    ["/word-games", "Pick a word game"],
    ["/word-games/animals", "Animals"],
    ["/dubs", "Nursery rhymes"],
    ["/dubs/five-little-ducks?parrotE2eDub=empty", "Five little ducks"],
    ["/talk-to-peppa", "Chat with Peppa"],
  ] as const;

  for (const [route, heading] of destinations) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    const links = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href") ?? ""),
      );
    for (const href of links) {
      const url = new URL(href, page.url());
      expect(url.searchParams.has("lang"), href).toBe(false);
      expect(url.pathname, href).not.toMatch(/^\/(?:en|zh|zh-Hans)(?:\/|$)/);
    }
  }

  await page.goto("/dubs");
  await expect(
    page.getByText("Ask a grown-up before recording."),
  ).toBeVisible();
  await expect(page.getByText("录音前请先征得家长同意。")).toHaveAttribute(
    "lang",
    "zh-Hans",
  );
});

test("browser Chinese preference is inferred without a persistence write", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("parrot:guardian-language");
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["zh-CN", "en-US"],
    });
  });
  await page.goto("/login");
  await expect(
    page.getByRole("button", { exact: true, name: "中文" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("parrot:guardian-language")),
    )
    .toBeNull();
});

test("guardian document language changes immediately while learner document language stays English", async ({
  page,
}) => {
  await page.goto("/guardian?parrotE2eGuardian=guardian");
  const guardianSnapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));
  await page.getByRole("button", { exact: true, name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expectUnchangedNavigation(page, guardianSnapshot);

  await page.goto("/lessons");
  const learnerSnapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));
  await page.getByRole("button", { exact: true, name: "English" }).click();
  await page.getByRole("button", { exact: true, name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("button", { exact: true, name: "中文" }),
  ).toHaveAttribute("lang", "zh-Hans");
  await expectUnchangedNavigation(page, learnerSnapshot);

  await page.goto("/stories");
  await page.goBack();
  await expect(page).toHaveURL(learnerSnapshot.href);
  await page.goForward();
  await expect(page).toHaveURL(/\/stories(?:\?|$)/);
});

test("Chinese Guardian dashboard and learner chooser are consistently localized", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto(
    "/guardian?parrotE2eGuardian=guardian&parrotE2eLearners=multiple",
  );

  await expect(
    page.getByRole("navigation", { name: "页面导航" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "家长中心" })).toBeVisible();
  for (const heading of ["孩子资料", "学习与内容", "配音管理", "账户与隐私"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  await page.getByRole("button", { name: "切换到学习模式" }).click();
  const dialog = page.getByRole("dialog", { name: "谁在学习？" });
  await expect(dialog).toHaveAttribute("lang", "zh-Hans");
  await expect(
    dialog.getByRole("group", { name: "家长指导语言" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "以 ⁨Noah⁩ 身份开始学习模式" }),
  ).toBeVisible();
  await expect(dialog.getByText("Noah", { exact: true })).toBeVisible();
});

test("Chinese Guardian learner roster and profile editor localize without renaming learners", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto(
    "/guardian/learners?parrotE2eGuardian=guardian&parrotE2eLearners=multiple",
  );

  await expect(
    page.getByRole("navigation", { name: "页面导航" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "管理孩子" })).toBeVisible();
  await expect(page.getByText("Mia", { exact: true })).toBeVisible();
  await expect(page.getByText("Noah", { exact: true })).toBeVisible();
  await expect(page.getByLabel("常用名")).toBeVisible();
  await page.getByRole("button", { name: "编辑 ⁨Mia⁩ 的资料" }).click();

  await expect(page.getByRole("heading", { name: "孩子资料" })).toBeVisible();
  await expect(page.getByText("正在管理 Mia", { exact: true })).toBeVisible();
  await expect(page.getByLabel("姓名")).toHaveValue("Mia");
  await expect(page.getByLabel("年龄")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "课程语音录音" }),
  ).toBeVisible();
});

test("Chinese account privacy and deletion dialog keep technical data and focus safety", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto("/guardian/account?parrotE2eGuardian=guardian");

  await expect(
    page.getByRole("navigation", { name: "页面导航" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "账户与隐私" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AI 与已保存的数据" }),
  ).toBeVisible();
  await expect(
    page.getByText("以前创建过私密故事图片的账户", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "危险操作区" })).toBeVisible();

  const opener = page.getByRole("button", { name: "删除账户" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "删除账户" });
  await expect(dialog).toHaveAttribute("lang", "zh-Hans");
  await expect(
    dialog.getByRole("group", { name: "家长指导语言" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("密码")).toBeFocused();
  await expect(dialog.getByRole("button", { name: "取消" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "立即删除账户" }),
  ).toBeDisabled();
});

test("Guardian redo setup localizes controls while learning content stays English", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto(
    "/guardian/profile/setup?redo=1&returnTo=%2Fguardian&parrotE2eGuardian=guardian&parrotE2eLearners=multiple&parrotE2eProfile=viewport-stability",
  );

  const prompt = page.getByRole("heading", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveAttribute("lang", "en");
  await expect(page.getByText("问题 1/6", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重播问题" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "你的回答" })).toHaveAttribute(
    "lang",
    "en",
  );
  await expect(page.getByRole("button", { name: "返回" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
});

test("learner document stays English while its adult chooser is fully Chinese", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto(
    "/lessons?parrotE2eGuardian=guardian&parrotE2eLearners=multiple",
  );

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Switch to learner mode" }),
  ).toBeVisible();
  await expect(page.getByText("请家长切换到学习模式后继续。")).toHaveAttribute(
    "lang",
    "zh-Hans",
  );
  const opener = page.getByRole("button", { name: "Switch to learner mode" });
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "谁在学习？" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(dialog).toHaveAttribute("lang", "zh-Hans");
  await expect(dialog).toContainText("请选择谁来使用学习模式。");
  await expect(dialog.getByRole("button", { name: "取消" })).toBeVisible();
  await expect(dialog.getByText("Who is learning now?")).toHaveCount(0);

  await dialog.getByRole("button", { exact: true, name: "English" }).click();
  const englishDialog = page.getByRole("dialog", {
    name: "Who is learning now?",
  });
  await expect(englishDialog).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await englishDialog
    .getByRole("button", { exact: true, name: "中文" })
    .click();
  await expect(dialog).toHaveAttribute("lang", "zh-Hans");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(opener).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
