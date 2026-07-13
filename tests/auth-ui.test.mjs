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

const authClient = readSource("../src/auth/auth-client.ts");
const app = readSource("../src/app/App.tsx");

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
      return "The email or password is incorrect.";
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
  assert.match(retryHtml, /Checking your session…/);
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
  assert.equal(capturedProps.formError, "The email or password is incorrect.");

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
  assert.match(html, /cached@example\.com/);
  assert.doesNotMatch(html, /Checking your session…/);
});

test("signed-out views switch between sign-in and sign-up fields", () => {
  const signIn = renderAuthGate();
  const signUp = renderAuthGate({ mode: "sign-up" });

  assert.match(signIn, /name="email"/);
  assert.match(signIn, /name="password"/);
  assert.doesNotMatch(signIn, /name="name"/);
  assert.doesNotMatch(signIn, /LESSON CONTENT/);
  assert.doesNotMatch(signIn, /PARROT ENGLISH|登录后继续你的英语口语练习/);
  assert.match(signUp, /name="name"/);
  assert.match(signUp, /name="email"/);
  assert.match(signUp, /name="password"/);
  assert.doesNotMatch(signUp, /LESSON CONTENT/);
  assert.doesNotMatch(signUp, /PARROT ENGLISH|注册后就可以开始英语口语练习/);
});

test("failed form state preserves values and disables controls while submitting", () => {
  const html = renderAuthGate({
    fields: {
      name: " 小明 ",
      email: " learner@example.com ",
      password: "password",
    },
    formError: "The email or password is incorrect.",
    isSubmitting: true,
    mode: "sign-up",
  });

  assert.match(html, /value=" 小明 "/);
  assert.match(html, /value=" learner@example.com "/);
  assert.match(html, /The email or password is incorrect./);
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.match(html, /role="alert"/);
});

test("signed-in views keep signing-out progress on the collapsed account", () => {
  const html = renderAuthGate({
    isSigningOut: true,
    session: { user: { email: "learner@example.com", name: null } },
  });

  assert.match(html, /LESSON CONTENT/);
  assert.match(html, /learner@example.com/);
  assert.match(html, /<aside[^>]*aria-busy="true"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Signing out…/);
});

test("renders the learner name as the collapsed account menu trigger", () => {
  const html = renderAuthGate({
    onOpenProfile() {},
    session: { user: { email: "mia@example.test", name: "Mia" } },
  });
  const bar = html.match(
    /<aside[^>]*aria-label="Current account"[^>]*>[\s\S]*?<\/aside>/,
  )?.[0];

  assert.ok(bar);
  assert.match(bar, /<button[^>]*aria-expanded="false"[^>]*aria-haspopup="menu"/);
  assert.match(bar, />Mia</);
  assert.doesNotMatch(bar, /aria-label="Edit learner profile"/);
  assert.doesNotMatch(bar, />Log out</);
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

  assert.equal(error, "Enter a valid email address.");
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

  assert.equal(error, "The email or password is incorrect.");
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
  assert.equal(failure, "Unable to log you out. Please try again.");
  assert.equal(refetchCalls, 0);

  const thrownFailure = await signOutSession({
    client: createAuthClientStub({
      signOut: async () => {
        throw new Error("offline");
      },
    }),
    refetch,
  });
  assert.equal(thrownFailure, "Unable to log you out. Please try again.");
  assert.equal(refetchCalls, 0);

  const success = await signOutSession({
    client: createAuthClientStub(),
    refetch,
  });
  assert.equal(success, null);
  assert.equal(refetchCalls, 1);
});

test("App composes AuthGate, route-aware onboarding, and authenticated routes", () => {
  assert.match(app, /import\s+\{\s*AuthGate\s*\}\s+from\s+["']\.\.\/auth\/AuthGate["']/);
  assert.match(
    app,
    /import\s+\{\s*LearnerProfileGate\s*\}\s+from\s+["']\.\.\/learner-profile\/LearnerProfileGate["']/,
  );
  assert.match(app, /export function ApplicationRoutes\(/);
  assert.match(
    app,
    /<Route\s+element=\{<LessonList\s*\/>\}\s+path=["']\/lessons["']\s*\/>/,
  );
  assert.match(
    app,
    /<AuthGate[\s\S]*?<LearnerProfileGate[\s\S]*?<ApplicationRoutes\s+loginTarget=\{safeReturnTo\}\s*\/>\s*<\/LearnerProfileGate>\s*<\/AuthGate>/,
  );
});
