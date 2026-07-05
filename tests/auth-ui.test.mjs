import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { createServer } from "vite";

function readSource(path) {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const authClient = readSource("../src/auth-client.ts");
const app = readSource("../src/App.tsx");
const styles = readSource("../src/styles.css");

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const authGateModule = await vite.ssrLoadModule("/src/AuthGate.tsx");
const {
  AuthGateView,
  createAuthGate,
  signOutSession,
  submitAuthForm,
} = authGateModule;

test.after(async () => {
  await vite.close();
});

function createAuthClientStub(overrides = {}) {
  return {
    signIn: { email: async () => ({ error: null }) },
    signOut: async () => ({ error: null }),
    signUp: { email: async () => ({ error: null }) },
    ...overrides,
  };
}

function renderAuthGate(overrides = {}) {
  assert.equal(typeof AuthGateView, "function", "Expected an executable AuthGateView");

  const props = {
    fields: { name: "", email: "", password: "" },
    formError: "",
    isPending: false,
    isRetrying: false,
    isSigningOut: false,
    isSubmitting: false,
    mode: "sign-in",
    onFieldChange() {},
    onModeChange() {},
    onOpenProfile: null,
    onRetry() {},
    onSignOut() {},
    onSubmit() {},
    profileError: "",
    session: null,
    sessionError: null,
    signedOutFallback: null,
    ...overrides,
  };

  return renderToStaticMarkup(
    createElement(
      AuthGateView,
      props,
      createElement("div", { "data-lesson-child": true }, "LESSON CONTENT"),
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
  assert.equal(typeof createAuthGate, "function", "Expected an injectable AuthGate factory");

  const session = {
    user: { email: "learner@example.com", name: "小明" },
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
      return "邮箱或密码不正确。";
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

  capturedProps.onRetry();
  assert.equal(refetchCalls, 1);

  renderContainer();
  assert.equal(capturedProps.isRetrying, true);
  const retryHtml = renderToStaticMarkup(
    createElement(AuthGateView, capturedProps),
  );
  assert.match(retryHtml, /正在检查登录状态…/);
  assert.doesNotMatch(retryHtml, /CONTAINER CHILD/);

  sessionState = { ...sessionState, error: null };
  resolveRefetch();
  await refetchPromise;
  await Promise.resolve();
  renderContainer();
  assert.equal(capturedProps.isRetrying, false);
  const retrySuccessHtml = renderToStaticMarkup(
    createElement(AuthGateView, capturedProps),
  );
  assert.match(retrySuccessHtml, /CONTAINER CHILD/);
  assert.doesNotMatch(retrySuccessHtml, /正在检查登录状态…/);

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
  assert.equal(capturedProps.formError, "邮箱或密码不正确。");

  capturedProps.onFieldChange("email", "new@example.com");
  capturedProps.onModeChange("sign-up");
  renderContainer();
  assert.equal(capturedProps.fields.email, "new@example.com");
  assert.equal(capturedProps.mode, "sign-up");
  assert.equal(capturedProps.formError, "");

  await capturedProps.onSignOut();
  assert.equal(signOutCalls.length, 1);
  assert.equal(signOutCalls[0].client, client);
  assert.equal(signOutCalls[0].refetch, refetch);
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

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected to find CSS rule for ${selector}`);
  return match[1];
}

function getMaxWidthSection(maxWidth, nextMaxWidth) {
  const startMarker = `@media (max-width: ${maxWidth}px)`;
  const start = styles.indexOf(startMarker);
  const end = nextMaxWidth
    ? styles.indexOf(`@media (max-width: ${nextMaxWidth}px)`, start + 1)
    : styles.indexOf("@media (max-height:", start + 1);

  assert.ok(start >= 0, `Expected ${startMarker}`);
  assert.ok(end > start, `Expected a boundary after ${startMarker}`);
  return styles.slice(start, end);
}

test("auth client uses Better Auth's same-origin defaults", () => {
  assert.match(authClient, /from ["']better-auth\/react["']/);
  assert.match(authClient, /export const authClient\s*=\s*createAuthClient\(\s*\)/);
  assert.doesNotMatch(authClient, /baseURL|http:\/\/|https:\/\//);
});

test("pending sessions hide lesson children", () => {
  const html = renderAuthGate({
    isPending: true,
    session: { user: { email: "cached@example.com", name: "缓存用户" } },
    sessionError: new Error("refresh pending"),
  });

  assert.match(html, /正在检查登录状态…/);
  assert.doesNotMatch(html, /登录服务暂时不可用/);
  assert.doesNotMatch(html, /LESSON CONTENT/);
});

test("session errors show retry UI and hide lesson children", () => {
  const html = renderAuthGate({ sessionError: new Error("offline") });

  assert.match(html, /登录服务暂时不可用/);
  assert.match(html, /重试/);
  assert.doesNotMatch(html, /LESSON CONTENT/);
});

test("session errors reject cached sessions until retry succeeds", () => {
  const html = renderAuthGate({
    session: {
      user: { email: "cached@example.com", name: "缓存用户" },
    },
    sessionError: new Error("refresh failed"),
  });

  assert.match(html, /登录服务暂时不可用/);
  assert.match(html, /重试/);
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

test("pending and failed session checks take priority over redirects", () => {
  const fallback = createElement("span", null, "REDIRECT");

  assert.match(
    renderAuthGate({ isPending: true, signedOutFallback: fallback }),
    /正在检查登录状态/,
  );
  assert.match(
    renderAuthGate({
      sessionError: new Error("offline"),
      signedOutFallback: fallback,
    }),
    /登录服务暂时不可用/,
  );
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
  assert.match(html, /cached@example\.com/);
  assert.doesNotMatch(html, /正在检查登录状态…/);
});

test("signed-out views switch between sign-in and sign-up fields", () => {
  const signIn = renderAuthGate();
  const signUp = renderAuthGate({ mode: "sign-up" });

  assert.match(signIn, /name="email"/);
  assert.match(signIn, /name="password"/);
  assert.doesNotMatch(signIn, /name="name"/);
  assert.doesNotMatch(signIn, /LESSON CONTENT/);
  assert.match(signUp, /name="name"/);
  assert.match(signUp, /name="email"/);
  assert.match(signUp, /name="password"/);
  assert.doesNotMatch(signUp, /LESSON CONTENT/);
});

test("failed form state preserves values and disables controls while submitting", () => {
  const html = renderAuthGate({
    fields: {
      name: " 小明 ",
      email: " learner@example.com ",
      password: "password",
    },
    formError: "邮箱或密码不正确。",
    isSubmitting: true,
    mode: "sign-up",
  });

  assert.match(html, /value=" 小明 "/);
  assert.match(html, /value=" learner@example.com "/);
  assert.match(html, /邮箱或密码不正确。/);
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.match(html, /role="alert"/);
});

test("signed-in views render lesson children and disabled sign-out progress", () => {
  const html = renderAuthGate({
    isSigningOut: true,
    session: { user: { email: "learner@example.com", name: null } },
  });

  assert.match(html, /LESSON CONTENT/);
  assert.match(html, /learner@example.com/);
  assert.match(html, /正在退出…/);
  assert.match(html, /<button[^>]*disabled/);
});

test("renders Profile and Log out together in the account bar", () => {
  const html = renderAuthGate({
    onOpenProfile() {},
    session: { user: { email: "mia@example.test", name: "Mia" } },
  });
  const bar = html.match(
    /<aside[^>]*class="user-session-bar"[\s\S]*?<\/aside>/,
  )?.[0];

  assert.ok(bar);
  assert.match(bar, /aria-label="Edit learner profile"/);
  assert.match(bar, />退出登录</);
  assert.doesNotMatch(html, /class="profile-edit-button"/);
});

test("auth submission validates before calling the client", async () => {
  assert.equal(typeof submitAuthForm, "function", "Expected executable auth actions");
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

  assert.equal(error, "请输入有效的邮箱地址。");
  assert.equal(clientCalls, 0);
  assert.equal(refetchCalls, 0);
});

test("sign-up submits trimmed fields and refetches a successful session", async () => {
  assert.equal(typeof submitAuthForm, "function", "Expected executable auth actions");
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
    refetch: async () => {
      refetchCalls += 1;
    },
  });

  assert.equal(error, null);
  assert.deepEqual(payloads, [
    { name: "小明", email: "learner@example.com", password: "password" },
  ]);
  assert.equal(refetchCalls, 1);
});

test("sign-in maps result errors, omits the name, and does not refetch", async () => {
  assert.equal(typeof submitAuthForm, "function", "Expected executable auth actions");
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

  assert.equal(error, "邮箱或密码不正确。");
  assert.deepEqual(payloads, [
    { email: "learner@example.com", password: "password" },
  ]);
  assert.equal(refetchCalls, 0);
});

test("sign-out maps failures without refetching and refetches success", async () => {
  assert.equal(typeof signOutSession, "function", "Expected executable sign-out actions");
  let refetchCalls = 0;
  const refetch = async () => {
    refetchCalls += 1;
  };

  const failure = await signOutSession({
    client: createAuthClientStub({
      signOut: async () => ({ error: { code: "UNKNOWN" } }),
    }),
    refetch,
  });
  assert.equal(failure, "暂时无法退出登录，请稍后再试。");
  assert.equal(refetchCalls, 0);

  const thrownFailure = await signOutSession({
    client: createAuthClientStub({
      signOut: async () => {
        throw new Error("offline");
      },
    }),
    refetch,
  });
  assert.equal(thrownFailure, "暂时无法退出登录，请稍后再试。");
  assert.equal(refetchCalls, 0);

  const success = await signOutSession({
    client: createAuthClientStub(),
    refetch,
  });
  assert.equal(success, null);
  assert.equal(refetchCalls, 1);
});

test("App composes AuthGate, OnboardingGate, and the complete lesson experience", () => {
  assert.match(app, /import\s+\{\s*AuthGate\s*\}\s+from\s+["']\.\/AuthGate["']/);
  assert.match(
    app,
    /import\s+\{\s*OnboardingGate\s*\}\s+from\s+["']\.\/OnboardingGate["']/,
  );
  assert.match(app, /export function LessonExperience\(\)/);
  assert.match(
    app,
    /<AuthGate[\s\S]*?<OnboardingGate>\s*<LessonExperience\s*\/>\s*<\/OnboardingGate>\s*<\/AuthGate>/,
  );
});

test("auth layout is responsive, touch-friendly, and visually distinct", () => {
  for (const selector of [
    ".auth-screen",
    ".auth-card",
    ".auth-submit",
    ".user-session-bar",
  ]) {
    getRule(selector);
  }

  assert.match(styles, /@media\s*\(max-width:\s*560px\)/);
  assert.match(styles, /\.auth-(?:field input|submit)[\s\S]*?min-height:\s*48px/);
  assert.match(styles, /\.auth-card[\s\S]*?background:\s*(?:#fff|white|rgb\(255)/);
  assert.match(styles, /\.auth-submit[\s\S]*?background:\s*#ff467b/);
  assert.match(styles, /\.user-session-bar[\s\S]*?background:\s*#204c7f/);
  assert.match(styles, /:focus-visible/);
});

test("auth screen owns a reachable short-viewport scroll area", () => {
  const screen = getRule(".auth-screen");
  const card = getRule(".auth-card");

  assert.match(screen, /height:\s*100dvh/);
  assert.match(screen, /overflow-y:\s*auto/);
  assert.match(screen, /place-items:\s*start center/);
  assert.match(card, /margin-block:\s*auto/);
});

test("session controls relocate at the 720px lesson breakpoint", () => {
  const tablet = getMaxWidthSection(720, 560);

  assert.match(tablet, /\.user-session-bar\s*\{[\s\S]*?top:\s*82px/);
  assert.match(tablet, /\.user-session-bar\s*\{[\s\S]*?right:\s*12px/);
  assert.match(tablet, /\.lesson-flow-banner\s*\{[\s\S]*?top:\s*144px/);
});
