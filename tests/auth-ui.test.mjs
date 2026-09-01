import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { createServer } from "vite";
import { SHARED_GUEST_USER_ID } from "../lib/shared-guest.ts";

function readSource(path) {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function textFromMarkup(markup) {
  return markup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

const authClient = readSource("../src/auth/auth-client.ts");

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const authGateModule = await vite.ssrLoadModule("/src/auth/AuthGate.tsx");
const {
  AuthGateView,
  createAuthGate,
  deleteAccountSession,
  signInGuestSession,
  signOutSession,
  submitAuthForm,
} = authGateModule;
const { AccountHeader, GuardianLearnerContextLabel } = await vite.ssrLoadModule(
  "/src/app/AppHeader.tsx",
);
const { createGuardianAccessProvider } = await vite.ssrLoadModule(
  "/src/auth/GuardianAccess.tsx",
);
const { GuardianLanguageProvider } = await vite.ssrLoadModule(
  "/src/i18n/guardian-language.tsx",
);
const StaticGuardianAccessProvider = createGuardianAccessProvider({
  api: {
    loadGuardianAccess: async () => ({ mode: "learner" }),
    lockGuardianAccess: async () => ({ mode: "learner" }),
    unlockGuardianAccess: async () => ({
      expiresAt: "2099-01-01T00:00:00.000Z",
      mode: "guardian",
    }),
  },
  schedule: () => () => {},
});

test.after(async () => {
  await vite.close();
});

function createAuthClientStub(overrides = {}) {
  return {
    $fetch: async () => ({ error: null }),
    deleteUser: async () => ({ error: null }),
    signIn: {
      email: async () => ({ error: null }),
    },
    signOut: async () => ({ error: null }),
    signUp: { email: async () => ({ error: null }) },
    ...overrides,
  };
}

function renderAuthGate(overrides = {}, language = "en") {
  assert.equal(
    typeof AuthGateView,
    "function",
    "Expected an executable AuthGateView",
  );

  const props = {
    fields: { name: "", email: "", password: "" },
    formError: "",
    isPending: false,
    isRetrying: false,
    isSigningOut: false,
    isSubmitting: false,
    isGuestSubmitting: false,
    learnerName: "Mia",
    mode: "sign-in",
    onFieldChange() {},
    onGuestSignIn() {},
    onModeChange() {},
    onNavigate() {},
    onOpenProfile: null,
    onRetry() {},
    onSignOut() {},
    onSubmit() {},
    profileError: "",
    session: null,
    sessionError: null,
    signOutError: "",
    signedOutFallback: null,
    turnstileResetKey: 0,
    turnstileSiteKey: "turnstile-site-key",
    turnstileToken: "turnstile-token",
    onTurnstileTokenChange() {},
    ...overrides,
  };

  return renderAuthGateView(
    props,
    createElement("div", { "data-lesson-child": true }, "LESSON CONTENT"),
    language,
  );
}

function renderAuthGateView(props, children = props.children, language = "en") {
  return renderToStaticMarkup(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: language, storage: null },
      createElement(
        StaticGuardianAccessProvider,
        { sessionIdentity: "id:test" },
        createElement(AuthGateView, props, children),
      ),
    ),
  );
}

function renderAccountHeader(overrides = {}, language = "en") {
  return renderToStaticMarkup(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: language, storage: null },
      createElement(AccountHeader, {
        activeMode: "learner",
        error: "",
        guardianLabel: "Patrick",
        isModePending: false,
        isSigningOut: false,
        hasActiveLearner: true,
        learnerLabel: "Mia",
        onDeleteAccount: async () => null,
        onOpenGuardianDashboard() {},
        onOpenLearnerProfiles() {},
        onOpenLearnerSwitcher() {},
        onOpenProfile() {},
        onSelectGuardian() {},
        onSelectLearner() {},
        onSignOut() {},
        signOutError: "",
        userEmail: "patrick@example.test",
        ...overrides,
      }),
    ),
  );
}

function createStateHookHarness() {
  const slots = [];
  let cursor = 0;

  return {
    beginRender() {
      cursor = 0;
    },
    useState(initialValue) {
      const index = cursor;
      cursor += 1;

      if (index === slots.length) {
        slots.push(
          typeof initialValue === "function" ? initialValue() : initialValue,
        );
      }

      return [
        slots[index],
        (nextValue) => {
          slots[index] =
            typeof nextValue === "function"
              ? nextValue(slots[index])
              : nextValue;
        },
      ];
    },
  };
}

test("auth gate container bridges its session hook, state, and actions", async () => {
  assert.equal(
    typeof createAuthGate,
    "function",
    "Expected an injectable AuthGate factory",
  );

  const session = {
    session: { id: "session-1" },
    user: {
      email: "learner@example.com",
      id: SHARED_GUEST_USER_ID,
      name: "小明",
    },
  };
  const sessionError = new Error("stale session");
  let useSessionCalls = 0;
  let refetchCalls = 0;
  let resolveRefetch;
  const refetchPromise = new Promise((resolve) => {
    resolveRefetch = resolve;
  });
  const refetch = async () => {
    refetchCalls += 1;
    await refetchPromise;
  };
  let sessionState = {
    data: session,
    error: sessionError,
    isPending: false,
    isRefetching: false,
  };
  const client = createAuthClientStub({
    useSession() {
      useSessionCalls += 1;
      return {
        ...sessionState,
        refetch,
      };
    },
  });
  const submitCalls = [];
  const signOutCalls = [];
  const stateHarness = createStateHookHarness();
  let capturedProps;

  function CaptureView(props) {
    capturedProps = props;
    return createElement("div", { "data-captured-gate": true }, props.children);
  }

  const TestAuthGate = createAuthGate({
    client,
    signOutAction: async (options) => {
      signOutCalls.push(options);
      return null;
    },
    submitAction: async (options) => {
      submitCalls.push(options);
      return "invalid-credentials";
    },
    stateHook: stateHarness.useState,
    View: CaptureView,
  });

  function renderContainer() {
    stateHarness.beginRender();
    return renderToStaticMarkup(
      createElement(
        TestAuthGate,
        null,
        createElement("span", null, "CONTAINER CHILD"),
      ),
    );
  }

  const html = renderContainer();

  assert.equal(useSessionCalls, 1);
  assert.match(html, /CONTAINER CHILD/);
  assert.equal(capturedProps.session, session);
  assert.equal(capturedProps.sessionError, sessionError);
  assert.equal(capturedProps.isPending, false);
  assert.equal(capturedProps.isRetrying, false);
  assert.equal(capturedProps.mode, "sign-in");
  assert.deepEqual(capturedProps.fields, { name: "", email: "", password: "" });
  assert.equal(capturedProps.formError, "");
  assert.equal(capturedProps.isSubmitting, false);
  assert.equal(capturedProps.isSigningOut, false);
  assert.equal(capturedProps.signOutError, "");

  capturedProps.onRetry();
  assert.equal(refetchCalls, 1);

  renderContainer();
  assert.equal(capturedProps.isRetrying, true);
  const retryHtml = renderAuthGateView(capturedProps);
  assert.match(retryHtml, /Checking your session…/);
  assert.doesNotMatch(retryHtml, /CONTAINER CHILD/);

  sessionState = { ...sessionState, error: null };
  resolveRefetch();
  await refetchPromise;
  await Promise.resolve();
  renderContainer();
  assert.equal(capturedProps.isRetrying, false);
  const retrySuccessHtml = renderAuthGateView(capturedProps);
  assert.match(retrySuccessHtml, /CONTAINER CHILD/);
  assert.doesNotMatch(retrySuccessHtml, /Checking your session…/);

  let prevented = false;
  await capturedProps.onSubmit({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(submitCalls.length, 1);
  assert.equal(submitCalls[0].client, client);
  assert.equal(submitCalls[0].refetch, refetch);
  assert.equal(submitCalls[0].mode, "sign-in");
  assert.deepEqual(submitCalls[0].fields, {
    name: "",
    email: "",
    password: "",
  });

  renderContainer();
  assert.equal(capturedProps.formError, "invalid-credentials");

  capturedProps.onFieldChange("email", "new@example.com");
  capturedProps.onModeChange("sign-up");
  renderContainer();
  assert.equal(capturedProps.fields.email, "new@example.com");
  assert.equal(capturedProps.mode, "sign-up");
  assert.equal(capturedProps.formError, "");

  await capturedProps.onSignOut();
  assert.equal(signOutCalls.length, 1);
  assert.deepEqual(signOutCalls[0], { client });
});

test("auth gate container forwards an optional signed-out fallback", () => {
  let capturedProps;
  const fallback = createElement("span", null, "REDIRECT");
  const client = createAuthClientStub({
    useSession() {
      return {
        data: null,
        error: null,
        isPending: false,
        refetch: async () => {},
      };
    },
  });

  function CaptureView(props) {
    capturedProps = props;
    return createElement("div");
  }

  const TestAuthGate = createAuthGate({ client, View: CaptureView });
  renderToStaticMarkup(
    createElement(TestAuthGate, { signedOutFallback: fallback }),
  );

  assert.equal(capturedProps.signedOutFallback, fallback);
});

test("auth gate mounts one guardian boundary with the current session identity", () => {
  let session = {
    session: { id: "session-1" },
    user: { email: " FIRST@Example.com ", id: " user-1 ", name: "Mia" },
  };
  const identities = [];
  const client = createAuthClientStub({
    useSession() {
      return {
        data: session,
        error: null,
        isPending: false,
        refetch: async () => {},
      };
    },
  });
  function CaptureGuardianBoundary({ children, sessionIdentity }) {
    identities.push(sessionIdentity);
    return children;
  }
  const TestAuthGate = createAuthGate({
    client,
    GuardianAccessBoundary: CaptureGuardianBoundary,
    View: ({ children }) => children,
  });

  renderToStaticMarkup(createElement(TestAuthGate, null, "SIGNED IN"));
  session = {
    session: { id: "session-2" },
    user: { email: " SECOND@Example.com ", name: "Maya" },
  };
  renderToStaticMarkup(createElement(TestAuthGate, null, "CHANGED ACCOUNT"));
  session = null;
  renderToStaticMarkup(createElement(TestAuthGate, null, "SIGNED OUT"));

  assert.deepEqual(identities, [
    "id:user-1|session:session-1",
    "email:second@example.com|session:session-2",
    null,
  ]);
});

test("auth client uses Better Auth's same-origin defaults", () => {
  assert.match(authClient, /from ["']better-auth\/react["']/);
  assert.match(
    authClient,
    /export const authClient\s*=\s*createAuthClient\(\s*\)/,
  );
  assert.doesNotMatch(authClient, /anonymousClient/);
  assert.doesNotMatch(authClient, /baseURL|http:\/\/|https:\/\//);
});

test("pending sessions hide lesson children", () => {
  const html = renderAuthGate({
    isPending: true,
    session: { user: { email: "cached@example.com", name: "缓存用户" } },
    sessionError: new Error("refresh pending"),
  });

  assert.match(html, /Checking your session…/);
  assert.doesNotMatch(html, /Sign-in is temporarily unavailable/);
  assert.doesNotMatch(html, /LESSON CONTENT/);
});

test("session errors show retry UI and hide lesson children", () => {
  const html = renderAuthGate({ sessionError: new Error("offline") });

  assert.match(html, /Sign-in is temporarily unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /LESSON CONTENT/);
});

test("session errors reject cached sessions until retry succeeds", () => {
  const html = renderAuthGate({
    session: {
      user: { email: "cached@example.com", name: "缓存用户" },
    },
    sessionError: new Error("refresh failed"),
  });

  assert.match(html, /Sign-in is temporarily unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /LESSON CONTENT/);
  assert.doesNotMatch(html, /cached@example\.com/);
});

test("signed-out route fallbacks replace the form after session checks finish", () => {
  const html = renderAuthGate({
    signedOutFallback: createElement(
      "span",
      { "data-login-redirect": true },
      "REDIRECT",
    ),
  });

  assert.match(html, /data-login-redirect/);
  assert.doesNotMatch(html, /name="email"/);
  assert.doesNotMatch(html, /LESSON CONTENT/);
});

test("pending, retrying, and failed session checks take priority over redirects", () => {
  const fallback = createElement("span", null, "REDIRECT");
  const pending = renderAuthGate({
    isPending: true,
    signedOutFallback: fallback,
  });
  const retrying = renderAuthGate({
    isRetrying: true,
    signedOutFallback: fallback,
  });
  const failed = renderAuthGate({
    sessionError: new Error("offline"),
    signedOutFallback: fallback,
  });

  assert.match(pending, /Checking your session/);
  assert.doesNotMatch(pending, /REDIRECT/);
  assert.match(retrying, /Checking your session/);
  assert.doesNotMatch(retrying, /REDIRECT/);
  assert.match(failed, /Sign-in is temporarily unavailable/);
  assert.doesNotMatch(failed, /REDIRECT/);
});

test("authenticated sessions render lesson children instead of signed-out fallbacks", () => {
  const html = renderAuthGate({
    session: { user: { email: "learner@example.com", name: "小明" } },
    signedOutFallback: createElement("span", null, "REDIRECT"),
  });

  assert.match(html, /LESSON CONTENT/);
  assert.doesNotMatch(html, /REDIRECT/);
});

test("background session refetches preserve mounted lesson children", () => {
  const session = {
    user: { email: "cached@example.com", name: "缓存用户" },
  };
  const client = createAuthClientStub({
    useSession() {
      return {
        data: session,
        error: null,
        isPending: false,
        isRefetching: true,
        refetch: async () => {},
      };
    },
  });
  const TestAuthGate = createAuthGate({ client });
  const html = renderToStaticMarkup(
    createElement(
      TestAuthGate,
      null,
      createElement("div", null, "BACKGROUND REFRESH CHILD"),
    ),
  );

  assert.match(html, /BACKGROUND REFRESH CHILD/);
  assert.match(html, /aria-label="Profile for ⁨Learner⁩, learner mode"/);
  assert.doesNotMatch(html, /Checking your session…/);
});

test("signed-out views switch between sign-in and sign-up fields", () => {
  const signIn = renderAuthGate();
  const signUp = renderAuthGate({ mode: "sign-up" });

  assert.match(signIn, /<h1[^>]*>Welcome back<\/h1>/);
  assert.match(signIn, /name="email"/);
  assert.match(signIn, /name="password"/);
  assert.match(signIn, /aria-label="Security check"/);
  assert.match(signIn, />Continue as guest</);
  assert.doesNotMatch(signIn, /name="name"/);
  assert.doesNotMatch(signIn, /LESSON CONTENT/);
  assert.doesNotMatch(signIn, /PARROT ENGLISH|登录后继续你的英语口语练习/);
  assert.match(signUp, /name="name"/);
  assert.match(signUp, /name="email"/);
  assert.match(signUp, /name="password"/);
  assert.match(signUp, /aria-label="Security check"/);
  assert.match(signUp, />Continue as guest</);
  assert.match(signUp, /<h1[^>]*>Create your account<\/h1>/);
  assert.match(signUp, /grown-up’s name for this Guardian account/i);
  assert.match(signUp, /add learner profiles next/i);
  assert.match(signUp, /<label[^>]*for="auth-name"[^>]*>.*Account name/is);
  assert.doesNotMatch(signUp, /LESSON CONTENT/);
  assert.doesNotMatch(signUp, /PARROT ENGLISH|注册后就可以开始英语口语练习/);
});

test("guardian auth surfaces render the selected Chinese catalog", () => {
  const pending = renderAuthGate({ isPending: true }, "zh-Hans");
  const failed = renderAuthGate(
    { sessionError: new Error("SERVER COPY") },
    "zh-Hans",
  );
  const signIn = renderAuthGate({}, "zh-Hans");
  const signUp = renderAuthGate({ mode: "sign-up" }, "zh-Hans");

  assert.match(pending, /正在检查登录状态…/);
  assert.match(failed, /暂时无法登录/);
  assert.match(failed, /请检查网络连接，然后重试。/);
  assert.match(failed, />重试</);
  assert.doesNotMatch(failed, /SERVER COPY/);
  assert.match(signIn, /欢迎回来/);
  assert.match(signIn, />登录</);
  assert.match(signIn, />电子邮箱</);
  assert.match(signIn, />密码</);
  assert.match(signUp, /创建账户/);
  assert.match(signUp, /接下来可以添加孩子资料。/);
  assert.doesNotMatch(signUp, /学习者档案/);
  assert.match(signUp, />账户姓名</);
  assert.match(signUp, /至少 8 个字符/);
  assert.match(signUp, /安全验证/);
  assert.match(signUp, /以访客身份继续/);
});

test("auth error codes resolve during render for both languages", () => {
  const expected = {
    "name-required": "请输入姓名。",
    "invalid-email": "请输入有效的电子邮箱地址。",
    "password-too-short": "密码必须至少包含 8 个字符。",
    "email-registered": "此电子邮箱已注册。请改为登录。",
    "invalid-credentials": "电子邮箱或密码不正确。",
    "security-check-required": "请先完成安全验证，然后重试。",
    "security-check-rejected": "安全验证已过期或被拒绝。请重试。",
    "sign-in-failed": "无法登录。请重试。",
    "sign-out-failed": "退出登录未完成。",
  };

  for (const [code, copy] of Object.entries(expected)) {
    assert.match(
      renderAuthGate({ formError: code }, "zh-Hans"),
      new RegExp(copy),
    );
  }

  assert.match(
    renderAuthGate({ formError: "invalid-credentials" }),
    /The email or password is incorrect\./,
  );
});

test("learner auth recovery remains English under a Chinese preference", () => {
  const pending = renderAuthGate(
    { guardianAudience: false, isPending: true },
    "zh-Hans",
  );
  const failed = renderAuthGate(
    { guardianAudience: false, sessionError: new Error("offline") },
    "zh-Hans",
  );

  assert.match(pending, /Checking your session…/);
  assert.match(failed, /Sign-in is temporarily unavailable/);
  assert.doesNotMatch(`${pending}${failed}`, /正在检查登录状态|暂时无法登录/);
});

test("account chrome localizes only Guardian mode and allowlisted learner helpers", () => {
  const guardian = renderAccountHeader(
    {
      activeMode: "guardian",
      error: "无法检查家长访问权限。请重试。",
      signOutError: "退出登录未完成。",
    },
    "zh-Hans",
  );
  const learner = renderAccountHeader({}, "zh-Hans");
  const learnerFailure = renderAccountHeader(
    {
      error: "Guardian access could not be checked. Please try again.",
      errorHelper: "guardianAccessErrorHelper",
    },
    "zh-Hans",
  );

  assert.match(guardian, /aria-label="账户"/);
  assert.match(guardian, /家长/);
  assert.match(learner, /aria-label="Account"/);
  assert.match(learner, />Learner</);
  assert.match(learnerFailure, /Guardian access could not be checked/);
  assert.match(
    learnerFailure,
    /<span[^>]*lang="zh-Hans"[^>]*>请让家长重试。<\/span>/,
  );
});

test("failed form state preserves values and disables controls while submitting", () => {
  const html = renderAuthGate({
    fields: {
      name: " 小明 ",
      email: " learner@example.com ",
      password: "password",
    },
    formError: "invalid-credentials",
    isSubmitting: true,
    mode: "sign-up",
  });

  assert.match(html, /value=" 小明 "/);
  assert.match(html, /value=" learner@example.com "/);
  assert.match(html, /The email or password is incorrect./);
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.match(html, /role="alert"/);
});

test("guardian account controls expose signing-out progress persistently", () => {
  const html = renderAccountHeader({
    activeMode: "guardian",
    isSigningOut: true,
  });

  assert.match(
    html,
    /aria-label="Signing out… Profile for ⁨Patrick⁩, guardian mode"/,
  );
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-atomic="true" aria-live="polite"[^>]*role="status"/);
  assert.match(html, /role="status"[\s\S]*Signing out…/);
  assert.match(html, />Signing out…</);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /<aside[^>]*aria-busy/);
  const accountButton = html.match(
    /<button[^>]*aria-label="Signing out… Profile for ⁨Patrick⁩, guardian mode"[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(accountButton);
  assert.doesNotMatch(accountButton, /title=/);
  assert.doesNotMatch(accountButton, />Signing out…</);
});

test("guardian account controls pre-mount one sign-out alert beside a specific retry", () => {
  const ordinary = renderAccountHeader({
    activeMode: "guardian",
  });
  const ordinaryBar = ordinary.match(
    /<aside[^>]*aria-label="Account"[^>]*>[\s\S]*?<\/aside>/,
  )?.[0];

  assert.ok(ordinaryBar);
  assert.match(
    ordinaryBar,
    /<span[^>]*aria-atomic="true"[^>]*role="alert"[^>]*><\/span>/,
  );
  assert.doesNotMatch(ordinaryBar, /Sign out again/);

  const failed = renderAccountHeader({
    activeMode: "guardian",
    signOutError: "Sign out did not finish.",
  });
  const failedBar = failed.match(
    /<aside[^>]*aria-label="Account"[^>]*>[\s\S]*?<\/aside>/,
  )?.[0];

  assert.ok(failedBar);
  assert.match(
    failedBar,
    /<span[^>]*aria-atomic="true"[^>]*role="alert"[^>]*>Sign out did not finish\.<\/span>/,
  );
  assert.match(
    failedBar,
    /aria-label="Profile for ⁨Patrick⁩, guardian mode"[\s\S]*Sign out again[\s\S]*<\/button>/,
  );
  assert.equal((failedBar.match(/role="alert"/g) ?? []).length, 1);
  assert.doesNotMatch(failedBar, /Unable to sign you out|Please try again/);
});

test("learner mode names the active learner in the compact profile trigger", () => {
  const html = renderAccountHeader();
  const bar = html.match(
    /<aside[^>]*aria-label="Account"[^>]*>[\s\S]*?<\/aside>/,
  )?.[0];

  assert.ok(bar);
  assert.match(
    bar,
    /<button[^>]*aria-label="Profile for ⁨Mia⁩, learner mode"[^>]*aria-expanded="false"[^>]*aria-haspopup="menu"/,
  );
  assert.match(bar, />Mia</);
  assert.match(bar, />Learner</);
  assert.doesNotMatch(bar, />Patrick</);
  assert.doesNotMatch(bar, />Sign out|>Log out</);
});

test("guardian mode names the account holder in the compact profile trigger", () => {
  const html = renderAccountHeader({ activeMode: "guardian" });

  assert.match(html, /aria-label="Profile for ⁨Patrick⁩, guardian mode"/);
  assert.match(html, />Patrick</);
  assert.match(html, />Guardian</);
  assert.doesNotMatch(html, /aria-label="Profile for ⁨Mia⁩, learner mode"/);
});

test("account triggers isolate adversarial runtime identities while preserving visible bidi direction", () => {
  const cjkName = "家庭学习者🦜".repeat(35);
  const rtlName = "اسم-العائلة-".repeat(24);
  const guardian = renderAccountHeader({
    activeMode: "guardian",
    guardianLabel: cjkName,
    isSigningOut: true,
  });
  const learner = renderAccountHeader({ learnerLabel: rtlName });

  assert.ok(
    guardian.includes(
      `aria-label="Signing out… Profile for ⁨${cjkName}⁩, guardian mode"`,
    ),
  );
  assert.ok(
    learner.includes(
      `aria-label="Profile for ⁨${rtlName}⁩, learner mode"`,
    ),
  );
  assert.match(
    guardian,
    new RegExp(`<bdi(?=[^>]*dir="auto")[^>]*>${cjkName}</bdi>`),
  );
  assert.match(
    learner,
    new RegExp(`<bdi(?=[^>]*dir="auto")[^>]*>${rtlName}</bdi>`),
  );
});

test("guardian learner context names the managed learner without clipping long names", () => {
  assert.equal(
    typeof GuardianLearnerContextLabel,
    "function",
    "Expected a shared Guardian learner context label",
  );
  const longName = "A".repeat(120);
  const html = renderToStaticMarkup(
    createElement(GuardianLearnerContextLabel, {
      learnerName: ` ${longName} `,
    }),
  );

  assert.match(textFromMarkup(html), new RegExp(`Managing ${longName}`));
  assert.match(html, /<bdi[^>]*dir="auto"/);
  assert.doesNotMatch(html, /\.\.\.|…/);
  assert.match(
    renderToStaticMarkup(
      createElement(GuardianLearnerContextLabel, { learnerName: "   " }),
    ),
    /Managing <bdi[^>]*>Learner<\/bdi>/,
  );
});

test("auth submission validates before calling the client", async () => {
  assert.equal(
    typeof submitAuthForm,
    "function",
    "Expected executable auth actions",
  );
  let clientCalls = 0;
  let refetchCalls = 0;
  const client = createAuthClientStub({
    signIn: {
      email: async () => {
        clientCalls += 1;
        return { error: null };
      },
    },
  });

  const error = await submitAuthForm({
    client,
    fields: { name: "", email: "bad", password: "short" },
    mode: "sign-in",
    refetch: async () => {
      refetchCalls += 1;
    },
  });

  assert.equal(error, "invalid-email");
  assert.equal(clientCalls, 0);
  assert.equal(refetchCalls, 0);
});

test("sign-up submits trimmed fields with Turnstile proof and refetches a successful session", async () => {
  assert.equal(
    typeof submitAuthForm,
    "function",
    "Expected executable auth actions",
  );
  const payloads = [];
  let refetchCalls = 0;
  const client = createAuthClientStub({
    signUp: {
      email: async (payload) => {
        payloads.push(payload);
        return { error: null };
      },
    },
  });

  const error = await submitAuthForm({
    client,
    fields: {
      name: " 小明 ",
      email: " learner@example.com ",
      password: "password",
    },
    mode: "sign-up",
    turnstileToken: "opaque-turnstile-proof",
    refetch: async () => {
      refetchCalls += 1;
    },
  });

  assert.equal(error, null);
  assert.deepEqual(payloads, [
    {
      name: "小明",
      email: "learner@example.com",
      password: "password",
      fetchOptions: {
        headers: { "x-captcha-response": "opaque-turnstile-proof" },
      },
    },
  ]);
  assert.equal(refetchCalls, 1);
});

test("sign-up waits for the security check before calling Better Auth", async () => {
  let clientCalls = 0;
  const error = await submitAuthForm({
    client: createAuthClientStub({
      signUp: {
        email: async () => {
          clientCalls += 1;
          return { error: null };
        },
      },
    }),
    fields: {
      name: "Mary",
      email: "mary@example.com",
      password: "password",
    },
    mode: "sign-up",
    refetch: async () => {},
    turnstileToken: null,
  });

  assert.equal(error, "security-check-required");
  assert.equal(clientCalls, 0);
});

test("guest login sends one Turnstile proof and refetches the new session", async () => {
  assert.equal(
    typeof signInGuestSession,
    "function",
    "Expected an executable guest sign-in action",
  );
  const calls = [];
  let refetchCalls = 0;
  const error = await signInGuestSession({
    client: createAuthClientStub({
      $fetch: async (path, options) => {
        calls.push({ path, options });
        return { error: null };
      },
    }),
    refetch: async () => {
      refetchCalls += 1;
    },
    turnstileToken: "opaque-guest-proof",
  });

  assert.equal(error, null);
  assert.deepEqual(calls, [
    {
      path: "/sign-in/shared-guest",
      options: {
        body: {},
        headers: { "x-captcha-response": "opaque-guest-proof" },
        method: "POST",
      },
    },
  ]);
  assert.equal(refetchCalls, 1);
});

test("guest login waits for the security check and maps rejected proof", async () => {
  let clientCalls = 0;
  const client = createAuthClientStub({
    $fetch: async () => {
      clientCalls += 1;
      return { error: { code: "VERIFICATION_FAILED" } };
    },
  });

  assert.equal(
    await signInGuestSession({
      client,
      refetch: async () => {},
      turnstileToken: null,
    }),
    "security-check-required",
  );
  assert.equal(clientCalls, 0);
  assert.equal(
    await signInGuestSession({
      client,
      refetch: async () => {},
      turnstileToken: "rejected-proof",
    }),
    "security-check-rejected",
  );
  assert.equal(clientCalls, 1);
});

test("failed shared guest sessions stay contained and can be retried", async () => {
  let fetchCalls = 0;
  let refetchCalls = 0;
  const client = createAuthClientStub({
    $fetch: async () => {
      fetchCalls += 1;
      return { error: { code: "SHARED_GUEST_SESSION_FAILED" } };
    },
  });
  const options = {
    client,
    refetch: async () => {
      refetchCalls += 1;
    },
    turnstileToken: "opaque-guest-proof",
  };

  assert.equal(await signInGuestSession(options), "sign-in-failed");
  assert.equal(await signInGuestSession(options), "sign-in-failed");
  assert.equal(fetchCalls, 2);
  assert.equal(refetchCalls, 0);
});

test("sign-in maps result errors, omits the name, and does not refetch", async () => {
  assert.equal(
    typeof submitAuthForm,
    "function",
    "Expected executable auth actions",
  );
  const payloads = [];
  let refetchCalls = 0;
  const client = createAuthClientStub({
    signIn: {
      email: async (payload) => {
        payloads.push(payload);
        return { error: { code: "INVALID_EMAIL_OR_PASSWORD" } };
      },
    },
  });

  const error = await submitAuthForm({
    client,
    fields: {
      name: "ignored",
      email: " learner@example.com ",
      password: "password",
    },
    mode: "sign-in",
    refetch: async () => {
      refetchCalls += 1;
    },
  });

  assert.equal(error, "invalid-credentials");
  assert.deepEqual(payloads, [
    { email: "learner@example.com", password: "password" },
  ]);
  assert.equal(refetchCalls, 0);
});

test("sign-out maps failures and lets the reactive session own successful refresh", async () => {
  assert.equal(
    typeof signOutSession,
    "function",
    "Expected executable sign-out actions",
  );
  const failure = await signOutSession({
    client: createAuthClientStub({
      signOut: async () => ({ error: { code: "UNKNOWN" } }),
    }),
  });
  assert.equal(failure, "sign-out-failed");

  const thrownFailure = await signOutSession({
    client: createAuthClientStub({
      signOut: async () => {
        throw new Error("offline");
      },
    }),
  });
  assert.equal(thrownFailure, "sign-out-failed");

  const success = await signOutSession({
    client: createAuthClientStub(),
  });
  assert.equal(success, null);
});

test("shared guest sign-out uses ordinary Better Auth session revocation", async () => {
  let signOutCalls = 0;
  const result = await signOutSession({
    client: createAuthClientStub({
      signOut: async () => {
        signOutCalls += 1;
        return { error: null };
      },
    }),
  });

  assert.equal(result, null);
  assert.equal(signOutCalls, 1);
});

test("account deletion sends the password, fails closed, and refetches only after success", async () => {
  assert.equal(
    typeof deleteAccountSession,
    "function",
    "Expected an executable account-deletion action",
  );
  const payloads = [];
  let refetchCalls = 0;
  const refetch = async () => {
    refetchCalls += 1;
  };

  const failure = await deleteAccountSession({
    client: createAuthClientStub({
      deleteUser: async (payload) => {
        payloads.push(payload);
        return { error: { code: "INTERNAL_SERVER_ERROR" } };
      },
    }),
    password: "parent-password",
    refetch,
  });
  assert.equal(failure, "account-delete-failed");
  assert.equal(refetchCalls, 0);

  const success = await deleteAccountSession({
    client: createAuthClientStub({
      deleteUser: async (payload) => {
        payloads.push(payload);
        return { error: null };
      },
    }),
    password: "parent-password",
    refetch,
  });
  assert.equal(success, null);
  assert.equal(refetchCalls, 1);
  assert.deepEqual(payloads, [
    { password: "parent-password" },
    { password: "parent-password" },
  ]);
});
