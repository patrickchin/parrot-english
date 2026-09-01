import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { AccountPrivacyPage } = await vite.ssrLoadModule(
  "/src/app/AccountPrivacyPage.tsx",
);
const { AccountPrivacySections } = await vite.ssrLoadModule(
  "/src/app/AboutDialog.tsx",
);
const { AccountActionProvider } = await vite.ssrLoadModule(
  "/src/auth/account-actions.tsx",
);
const { GuardianLanguageProvider } = await vite.ssrLoadModule(
  "/src/i18n/guardian-language.tsx",
);
const { GuardianLanguageControl } = await vite.ssrLoadModule(
  "/src/i18n/GuardianLanguageControl.tsx",
);

const webVersion = JSON.parse(
  vite.config.define["import.meta.env.VITE_PARROT_APP_VERSION"],
);
const webCommit = JSON.parse(
  vite.config.define["import.meta.env.VITE_PARROT_COMMIT_SHA"],
);

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function buildInfo(overrides = {}) {
  return {
    backend: {
      commitSha: "backend-commit-123",
      deployedAt: "2026-08-31T12:34:56.000Z",
      deploymentId: "worker-deployment-456",
      version: "worker-version-1.2.3",
      ...overrides.backend,
    },
    components: overrides.components ?? [
      {
        commitSha: "agent-commit-789",
        component: "conversation-agent",
        details: {
          models: {
            realtime: "gpt-realtime-raw",
            transcription: "gpt-transcribe-raw",
          },
        },
        reportedAt: "invalid-agent-timestamp",
        version: "agent-version-4.5.6",
      },
    ],
  };
}

function languageHarness(element, language = "zh-Hans") {
  return createElement(
    GuardianLanguageProvider,
    { initialLanguage: language, storage: null },
    createElement(GuardianLanguageControl),
    element,
  );
}

function accountPageHarness(language = "zh-Hans") {
  return languageHarness(
    createElement(
      AccountActionProvider,
      {
        deleteAccount: async () => null,
        setProfileAction() {},
      },
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian/account"] },
        createElement(AccountPrivacyPage),
      ),
    ),
    language,
  );
}

function button(label) {
  const match = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  assert.ok(match, `Expected button named "${label}".`);
  return match;
}

test("Chinese account privacy localizes every guardian-facing section and danger action", async () => {
  globalThis.fetch = async () => Response.json(buildInfo());
  await mountStrict(accountPageHarness());

  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.equal(document.querySelector("h1")?.textContent, "账户与隐私");
  assert.equal(
    document.querySelector("nav")?.getAttribute("aria-label"),
    "页面导航",
  );
  assert.match(document.body.textContent, /返回家长中心/);
  for (const heading of [
    "AI 与已保存的数据",
    "Parrot 如何使用 AI",
    "此账户保存什么",
    "你可以做什么",
    "技术构建详情",
    "危险操作区",
  ]) {
    assert.ok(
      [...document.querySelectorAll("h2, h3")].some(
        (candidate) => candidate.textContent === heading,
      ),
      `Expected localized heading ${heading}.`,
    );
  }
  for (const fragment of [
    /AI 可帮助把语音转成文字/,
    /AI 可能听错或说错/,
    /所有孩子资料及其已保存的数据/,
    /学习模式只会通过“切换到学习模式”更改/,
    /“和 Peppa 聊天”/,
    /Parrot 不会把这些活动的音频保存到账户中/,
    /童谣配音会保存这位孩子的私密配音片段/,
    /课程会为每个跟读时刻保存一个私密语音片段/,
    /以前创建过私密故事图片的账户/,
    /原始照片不会被保存/,
    /外部 AI 和语音服务/,
    /删除账户会移除账户、所有孩子资料及其已保存的数据/,
    /永久删除此账户及其已保存的孩子数据/,
  ]) {
    assert.match(document.body.textContent, fragment);
  }
  assert.doesNotMatch(document.body.textContent, /佩奇/);
  assert.ok(button("删除账户"));
});

test("technical build states localize labels but preserve raw values and date policy", async () => {
  const request = deferred();
  globalThis.fetch = async () => Response.json(await request.promise);
  await mountStrict(
    languageHarness(createElement(AccountPrivacySections), "zh-Hans"),
  );
  assert.match(document.body.textContent, /正在加载技术详情…/);

  const payload = buildInfo({
    backend: { deployedAt: null },
  });
  await act(async () => {
    request.resolve(payload);
    await request.promise;
  });
  await waitFor(() =>
    assert.match(document.body.textContent, /worker-version-1\.2\.3/),
  );

  for (const label of [
    "网页应用",
    "Cloudflare Worker",
    "对话代理",
    "Git 提交",
    "部署",
    "上传时间",
    "最近报告",
    "实时语音模型",
    "输入转写模型",
  ]) {
    assert.match(document.body.textContent, new RegExp(label));
  }
  for (const value of [
    webVersion,
    webCommit,
    "worker-version-1.2.3",
    "backend-commit-123",
    "worker-deployment-456",
    "agent-version-4.5.6",
    "agent-commit-789",
    "gpt-realtime-raw",
    "gpt-transcribe-raw",
    "invalid-agent-timestamp",
  ]) {
    assert.match(document.body.textContent, new RegExp(value));
  }
  assert.match(document.body.textContent, /暂无/);
  assert.doesNotMatch(document.body.textContent, /Not available/);
});

test("build matching uses stable kinds and retranslates without refetching", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return Response.json(
      buildInfo({
        backend: { commitSha: webCommit },
        components: [
          {
            commitSha: "different-agent-commit",
            component: "conversation-agent",
            reportedAt: "2026-08-31T13:14:15.000Z",
            version: "agent-version-4.5.6",
          },
        ],
      }),
    );
  };
  await mountStrict(
    languageHarness(createElement(AccountPrivacySections), "zh-Hans"),
  );
  const matchStatus = await waitFor(() => {
    const candidate = [...document.querySelectorAll('[role="status"]')].find(
      (status) => /与网页提交一致/.test(status.textContent ?? ""),
    );
    assert.ok(candidate);
    return candidate;
  });
  const mismatchAlert = [...document.querySelectorAll('[role="alert"]')].find(
    (alert) => /与网页应用的提交不同/.test(alert.textContent ?? ""),
  );
  assert.ok(mismatchAlert);
  assert.match(
    document.body.textContent,
    new RegExp(
      new Date("2026-08-31T13:14:15.000Z")
        .toLocaleString()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  );
  const webHeading = [...document.querySelectorAll("h3")].find(
    (heading) => heading.textContent === "网页应用",
  );
  assert.ok(webHeading);
  assert.equal(
    webHeading.parentElement?.parentElement?.querySelector(
      '[role="status"], [role="alert"]',
    ),
    null,
  );
  const settledFetchCount = fetchCount;

  await click(button("English"));
  assert.equal(document.querySelector('[role="status"]'), matchStatus);
  assert.match(matchStatus.textContent, /Matches the web commit/);
  assert.match(mismatchAlert.textContent, /Different commit from the web app/);
  assert.equal(fetchCount, settledFetchCount);
  assert.equal(
    [...document.querySelectorAll("h3")]
      .find((heading) => heading.textContent === "Web app")
      ?.parentElement?.parentElement?.querySelector(
        '[role="status"], [role="alert"]',
      ),
    null,
  );
});

test("uncomparable and missing build reporting remain semantic and localized", async () => {
  globalThis.fetch = async () =>
    Response.json(
      buildInfo({
        backend: { commitSha: "unknown" },
        components: [],
      }),
    );
  await mountStrict(languageHarness(createElement(AccountPrivacySections)));
  await waitFor(() =>
    assert.match(document.body.textContent, /对话代理尚未报告/),
  );
  assert.equal(
    document.querySelectorAll('[role="status"], [role="alert"]').length,
    0,
  );
});

test("technical failure is catalogued and retranslates without another request", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("SERVER BUILD SENTENCE");
  };
  await mountStrict(languageHarness(createElement(AccountPrivacySections)));
  const failure = await waitFor(() => {
    const candidate = [...document.querySelectorAll("p")].find((paragraph) =>
      /无法加载技术详情/.test(paragraph.textContent ?? ""),
    );
    assert.ok(candidate);
    return candidate;
  });
  assert.doesNotMatch(document.body.textContent, /SERVER BUILD SENTENCE/);
  const settledFetchCount = fetchCount;
  await click(button("English"));
  assert.match(failure.textContent, /Technical details could not load/);
  assert.equal(fetchCount, settledFetchCount);
});
