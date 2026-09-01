import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  act,
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  input,
  installDom,
  mountStrict,
  waitFor,
} from "../helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let AccountPrivacyPage;
let AccountDeleteDialog;
let AccountHeader;
let createAuthGate;
let AuthGateView;
let ConversationSurface;
let GuardianUnlockDialog;
let GuardianUnlockForm;
let RouteFocusManager;
let AccountActionProvider;
let useProfileAccountAction;
let createGuardianAccessProvider;
let notifyGuardianAccessRequired;
let useGuardianAccess;
let GuardianLanguageProvider;
let GuardianLanguageControl;
let FeaturePlaceholder;
let GuardianModeBoundary;
let LearnerModeBoundary;
let LearnerDeleteDialog;

before(async () => {
  ({ AccountPrivacyPage } = await vite
    .ssrLoadModule("/src/app/AccountPrivacyPage.tsx")
    .catch(() => ({})));
  ({ AccountDeleteDialog } = await vite.ssrLoadModule(
    "/src/app/AccountDeleteDialog.tsx",
  ));
  ({ AccountHeader } = await vite.ssrLoadModule("/src/app/AppHeader.tsx"));
  ({ AuthGateView, createAuthGate } = await vite.ssrLoadModule(
    "/src/auth/AuthGate.tsx",
  ));
  ({ GuardianUnlockDialog, GuardianUnlockForm } = await vite.ssrLoadModule(
    "/src/auth/GuardianUnlock.tsx",
  ));
  ({ AccountActionProvider, useProfileAccountAction } =
    await vite.ssrLoadModule("/src/auth/account-actions.tsx"));
  ({
    createGuardianAccessProvider,
    notifyGuardianAccessRequired,
    useGuardianAccess,
  } = await vite.ssrLoadModule("/src/auth/GuardianAccess.tsx"));
  ({ ConversationSurface } = await vite.ssrLoadModule(
    "/src/conversation/ConversationSurface.tsx",
  ));
  ({ GuardianLanguageProvider } = await vite.ssrLoadModule(
    "/src/i18n/guardian-language.tsx",
  ));
  ({ GuardianLanguageControl } = await vite.ssrLoadModule(
    "/src/i18n/GuardianLanguageControl.tsx",
  ));
  ({ RouteFocusManager } = await vite.ssrLoadModule(
    "/src/app/RouteFocusManager.tsx",
  ));
  ({ FeaturePlaceholder } = await vite.ssrLoadModule(
    "/src/app/FeaturePlaceholder.tsx",
  ));
  ({ GuardianModeBoundary, LearnerModeBoundary } = await vite.ssrLoadModule(
    "/src/app/ModeRouteBoundaries.tsx",
  ));
  ({ LearnerDeleteDialog } = await vite.ssrLoadModule(
    "/src/learner-profile/LearnerDeleteDialog.tsx",
  ));
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  window.localStorage.clear();
  globalThis.fetch = originalFetch;
});

after(async () => {
  await vite.close();
  restoreDom();
});

function button(name) {
  const match = [...document.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent.trim() === name,
  );
  assert.ok(match, `Expected a button named ${name}.`);
  return match;
}

async function press(target, key, options = {}) {
  const event = new window.KeyboardEvent("keydown", {
    altKey: options.altKey ?? false,
    bubbles: true,
    cancelable: true,
    code: options.code ?? key,
    ctrlKey: options.ctrlKey ?? false,
    isComposing: options.isComposing ?? false,
    key,
    metaKey: options.metaKey ?? false,
    repeat: options.repeat ?? false,
    shiftKey: options.shiftKey ?? false,
  });
  await act(async () => target.dispatchEvent(event));
  return event;
}

function DialogHarness({ kind, onDelete = async () => null, requiresPassword }) {
  const [isOpen, setIsOpen] = useState(false);
  return createElement(
    "main",
    null,
    createElement(
      "button",
      { onClick: () => setIsOpen(true), type: "button" },
      "Open delete",
    ),
    isOpen && kind === "delete"
      ? createElement(AccountDeleteDialog, {
          onClose: () => setIsOpen(false),
          onDelete,
          requiresPassword,
        })
      : null,
  );
}

function guardianApi(overrides = {}) {
  return {
    loadGuardianAccess: async () => ({ mode: "learner" }),
    lockGuardianAccess: async () => ({ mode: "learner" }),
    unlockGuardianAccess: async () => ({
      expiresAt: "2099-01-01T00:00:00.000Z",
      mode: "guardian",
    }),
    ...overrides,
  };
}

function AccessMode() {
  const { mode } = useGuardianAccess();
  return createElement(
    "output",
    { "aria-label": "Guardian access mode" },
    mode,
  );
}

function AccessCapture({ onAccess }) {
  const access = useGuardianAccess();
  useEffect(() => onAccess(access), [access, onAccess]);
  return null;
}

function UnlockHarness({ api, dialog = false, onUnlocked = () => {} }) {
  const [Provider] = useState(() =>
    createGuardianAccessProvider({ api, schedule: () => () => {} }),
  );
  const [isOpen, setIsOpen] = useState(!dialog);
  const openerRef = useRef(null);
  return createElement(
    Provider,
    { sessionIdentity: "id:guardian" },
    createElement(AccessMode),
    dialog &&
      createElement(
        "button",
        { onClick: () => setIsOpen(true), ref: openerRef, type: "button" },
        "Open guardian mode",
      ),
    isOpen &&
      (dialog
        ? createElement(GuardianUnlockDialog, {
            onClose: () => setIsOpen(false),
            onUnlocked,
            returnFocusRef: openerRef,
          })
        : createElement(GuardianUnlockForm, {
            onCancel: () => setIsOpen(false),
            onUnlocked,
          })),
  );
}

function modeBoundaryHarness({ api, guardianAudience }) {
  const Provider = createGuardianAccessProvider({
    api,
    schedule: () => () => {},
  });
  const Boundary = guardianAudience
    ? GuardianModeBoundary
    : LearnerModeBoundary;
  return createElement(
    GuardianLanguageProvider,
    { initialLanguage: "zh-Hans", storage: null },
    createElement(
      Provider,
      { sessionIdentity: "id:guardian" },
      createElement(
        MemoryRouter,
        { initialEntries: [guardianAudience ? "/guardian" : "/lessons"] },
        createElement(Boundary, null, "PROTECTED CONTENT"),
      ),
    ),
  );
}

function AccountExperienceRegistration({ experience }) {
  useProfileAccountAction(experience);
  return null;
}

function accountHeaderProps(overrides = {}) {
  return {
    activeMode: "learner",
    error: "",
    guardianLabel: "Patrick",
    isModePending: false,
    isSigningOut: false,
    learnerLabel: "Mia",
    onDeleteAccount: async () => null,
    onOpenAccountPrivacy() {},
    onOpenGuardianDashboard() {},
    onOpenLearnerProfiles() {},
    onOpenProfile() {},
    onSelectGuardian() {},
    onSelectLearner() {},
    onSignOut() {},
    signOutError: "",
    userEmail: "patrick@example.test",
    ...overrides,
  };
}

function authClientForHeader() {
  return {
    deleteUser: async () => ({ error: null }),
    signIn: { email: async () => ({ error: null }) },
    signOut: async () => ({ error: null }),
    signUp: { email: async () => ({ error: null }) },
    useSession: () => ({
      data: {
        session: { id: "header-session" },
        user: {
          email: "patrick@example.test",
          id: "guardian",
          name: "Patrick",
        },
      },
      error: null,
      isPending: false,
      refetch: async () => {},
    }),
  };
}

function guardianHeaderHarness({ api, onAccess, schedule }) {
  const Provider = createGuardianAccessProvider({ api, schedule });
  const TestAuthGate = createAuthGate({
    client: authClientForHeader(),
    GuardianAccessBoundary: Provider,
  });
  return createElement(
    TestAuthGate,
    null,
    createElement(AccessCapture, { onAccess }),
    "LEARNER APP",
  );
}

function conversationProps(overrides = {}) {
  return {
    audioPlaybackBlocked: false,
    audioPlaybackBusy: false,
    audioPlaybackError: "",
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneBusy: false,
    microphoneEnabled: false,
    onBack() {},
    onChooseLesson() {},
    onFinish() {},
    onRepeatAudio() {},
    onRetryVoice() {},
    onStart() {},
    onStartAudio() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    recoveryPhase: null,
    responseLatencyMs: null,
    status: "listening",
    turnReady: true,
    turns: [],
    voiceRetryUsed: false,
    waitCycle: 0,
    ...overrides,
  };
}

function DirectActionHarness({ action, onActivate }) {
  const [busy, setBusy] = useState(false);
  const activate = () => {
    onActivate();
    setBusy(true);
  };

  return createElement(
    ConversationSurface,
    conversationProps(
      action === "sound"
        ? {
            audioPlaybackBlocked: true,
            audioPlaybackBusy: busy,
            onStartAudio: activate,
            status: "connecting",
            turnReady: false,
          }
        : {
            microphoneBusy: busy,
            onToggleMicrophone: activate,
          },
    ),
  );
}

describe("keyboard accessibility lifecycles", () => {
  it("retranslates a visible auth error without resetting fields or submitting", async () => {
    let submissions = 0;
    await mountStrict(
      createElement(
        GuardianLanguageProvider,
        { initialLanguage: "en", storage: null },
        createElement(GuardianLanguageControl),
        createElement(AuthGateView, {
          children: null,
          fields: {
            email: "mary@example.com",
            name: "Mary",
            password: "password",
          },
          formError: "invalid-credentials",
          hasActiveLearner: false,
          isGuestSubmitting: false,
          isPending: false,
          isRetrying: false,
          isSigningOut: false,
          isSubmitting: false,
          learnerName: null,
          mode: "sign-in",
          onFieldChange() {},
          onGuestSignIn() {},
          onModeChange() {},
          onNavigate() {},
          onRetry() {},
          onSignOut() {},
          onSubmit() {
            submissions += 1;
          },
          onTurnstileTokenChange() {},
          profileError: "",
          session: null,
          sessionError: null,
          signOutError: "",
          signedOutFallback: null,
          turnstileResetKey: 0,
          turnstileSiteKey: "",
          turnstileToken: null,
        }),
      ),
    );
    const email = document.querySelector("#auth-email");
    assert.match(document.body.textContent, /The email or password is incorrect/);

    await click(button("中文"));

    assert.equal(document.querySelector("#auth-email"), email);
    assert.equal(email.value, "mary@example.com");
    assert.match(document.body.textContent, /电子邮箱或密码不正确/);
    assert.equal(submissions, 0);
  });

  it("moves focus to the new view heading after ordinary route navigation", async () => {
    await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        createElement(RouteFocusManager),
        createElement(
          Routes,
          null,
          createElement(Route, {
            element: createElement(
              "main",
              null,
              createElement("h1", null, "Home"),
              createElement(Link, { to: "/stories" }, "Open stories"),
            ),
            path: "/",
          }),
          createElement(Route, {
            element: createElement(
              "main",
              null,
              createElement("h1", null, "Pick a story"),
            ),
            path: "/stories",
          }),
        ),
      ),
    );

    await waitFor(() =>
      assert.equal(document.activeElement.textContent, "Home"),
    );
    await click(document.querySelector('a[href="/stories"]'));
    await waitFor(() =>
      assert.equal(document.activeElement.textContent, "Pick a story"),
    );
    assert.equal(document.activeElement.tagName, "H1");
    assert.equal(document.activeElement.tabIndex, -1);
  });

  it("does not steal focus when route focus starts after an account interaction", async () => {
    function FocusedAccountHarness() {
      const accountRef = useRef(null);
      useLayoutEffect(() => accountRef.current?.focus(), []);
      return createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        createElement(RouteFocusManager),
        createElement(
          "button",
          { ref: accountRef, type: "button" },
          "Account",
        ),
        createElement("main", null, createElement("h1", null, "Home")),
      );
    }

    await mountStrict(createElement(FocusedAccountHarness));
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(
      document.activeElement === button("Account"),
      true,
      "Route focus replaced an interaction that already owned focus.",
    );
  });

  it("leaves Space to focused captions and links, then removes its shortcut on unmount", async () => {
    const toggles = [];
    await mountStrict(
      createElement(
        ConversationSurface,
        conversationProps({
          onToggleMicrophone: () => toggles.push("toggle"),
        }),
      ),
    );

    const pageSpace = await press(window, " ", { code: "Space" });
    assert.deepEqual(toggles, ["toggle"]);
    assert.equal(pageSpace.defaultPrevented, true);

    for (const modifiers of [
      { altKey: true },
      { ctrlKey: true },
      { isComposing: true },
      { metaKey: true },
      { shiftKey: true },
    ]) {
      const modifiedSpace = await press(window, " ", {
        code: "Space",
        ...modifiers,
      });
      assert.deepEqual(toggles, ["toggle"]);
      assert.equal(modifiedSpace.defaultPrevented, false);
    }

    const captions = document.querySelector(
      '[role="region"][aria-label="Conversation captions"]',
    );
    assert.ok(captions);
    captions.focus();
    const captionSpace = await press(captions, " ", { code: "Space" });
    assert.deepEqual(toggles, ["toggle"]);
    assert.equal(captionSpace.defaultPrevented, false);

    const link = document.createElement("a");
    link.href = "/help";
    link.textContent = "Help";
    document.body.append(link);
    link.focus();
    const linkSpace = await press(link, " ", { code: "Space" });
    assert.deepEqual(toggles, ["toggle"]);
    assert.equal(linkSpace.defaultPrevented, false);

    await cleanupMountedRoots();
    await press(window, " ", { code: "Space" });
    assert.deepEqual(toggles, ["toggle"]);
  });

  it("keeps the sound action focused and inert while it starts", async () => {
    const activations = [];
    await mountStrict(
      createElement(DirectActionHarness, {
        action: "sound",
        onActivate: () => activations.push("sound"),
      }),
    );

    const action = button("Tap for sound");
    action.focus();
    await click(action);
    const pending = button("Starting sound");

    assert.equal(pending, action);
    assert.equal(document.activeElement, pending);
    assert.equal(pending.disabled, false);
    assert.equal(pending.getAttribute("aria-disabled"), "true");
    assert.deepEqual(activations, ["sound"]);

    await click(pending);
    assert.deepEqual(activations, ["sound"]);
    assert.equal(document.activeElement, pending);
  });

  it("keeps the microphone action focused and inert while it opens", async () => {
    const activations = [];
    await mountStrict(
      createElement(DirectActionHarness, {
        action: "microphone",
        onActivate: () => activations.push("microphone"),
      }),
    );

    const action = button("Tap, then talk");
    action.focus();
    await click(action);
    const pending = button("Opening microphone");

    assert.equal(pending, action);
    assert.equal(document.activeElement, pending);
    assert.equal(pending.disabled, false);
    assert.equal(pending.getAttribute("aria-disabled"), "true");
    assert.equal(pending.hasAttribute("aria-keyshortcuts"), false);
    assert.deepEqual(activations, ["microphone"]);

    await click(pending);
    assert.deepEqual(activations, ["microphone"]);
    assert.equal(document.activeElement, pending);
  });

  it("traps delete-confirmation focus and restores its opener on Escape", async () => {
    await mountStrict(createElement(DialogHarness, { kind: "delete" }));

    const opener = button("Open delete");
    opener.focus();
    await click(opener);
    const password = document.querySelector("#delete-account-password");
    assert.ok(password);
    const cancel = button("Cancel");
    await waitFor(() => assert.equal(document.activeElement, password));
    assert.match(
      document.querySelector('[role="dialog"]')?.textContent ?? "",
      /all learner profiles.*private voice clips.*story art/i,
    );

    await press(password, "Tab", { shiftKey: true });
    assert.equal(document.activeElement, cancel);
    await press(cancel, "Tab");
    assert.equal(document.activeElement, password);

    await input(password, "parent-password");
    const confirm = button("Delete account now");
    assert.equal(confirm.disabled, false);
    confirm.focus();
    await press(confirm, "Tab");
    assert.equal(document.activeElement, password);

    await press(password, "Escape");
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
  });

  it("keeps the learner-delete language control trapped and enabled while pending", async () => {
    const attempt = deferred();
    await mountStrict(
      createElement(
        GuardianLanguageProvider,
        { initialLanguage: "en", storage: null },
        createElement(LearnerDeleteDialog, {
          onClose() {},
          onDelete: () => attempt.promise,
          profile: {
            age: 7,
            createdAt: "2026-08-25T08:00:00.000Z",
            deletionPending: false,
            id: "learner-bob",
            name: "Bob",
            profileStatus: "completed",
          },
        }),
      ),
    );
    const dialog = document.querySelector('[role="dialog"]');
    const confirm = button("Delete Bob");
    await click(confirm);

    const chinese = button("中文");
    assert.equal(dialog.contains(chinese), true);
    assert.equal(chinese.closest("fieldset"), null);
    assert.equal(chinese.disabled, false);
    chinese.focus();
    await click(chinese);
    assert.equal(document.activeElement, chinese);
    assert.equal(dialog.getAttribute("lang"), "zh-Hans");

    await press(chinese, "Tab", { shiftKey: true });
    assert.equal(dialog.contains(document.activeElement), true);
    await act(async () => attempt.resolve("learner-busy"));
    await waitFor(() =>
      assert.match(
        dialog.querySelector('[role="alert"]')?.textContent ?? "",
        /请先结束这位孩子当前的对话/,
      ),
    );
  });

  it("learner mode exposes only the locked grown-up gateway beneath the active identity", async () => {
    await mountStrict(createElement(AccountHeader, accountHeaderProps()));

    await click(button("Profile for Mia, learner mode"));
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.deepEqual(
      [...menu.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      ["Grown-up accessSwitch modes"],
    );
    assert.match(document.body.textContent, /Mia/);
    assert.equal(
      document.querySelector('[aria-label="Choose profile mode"]'),
      null,
    );
    assert.doesNotMatch(
      document.body.textContent,
      /Guardian dashboard|Learner profiles|AI and saved data|Sign out|Delete account|Manage .* details|Switch to Mia|Patrick|Noah/,
    );
  });

  it("guardian mode exposes the approved learner-aware management order", async () => {
    await mountStrict(
      createElement(
        AccountHeader,
        accountHeaderProps({ activeMode: "guardian" }),
      ),
    );

    await click(button("Profile for Patrick, guardian mode"));
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.equal(
      document.querySelector('[aria-label="Choose profile mode"]'),
      null,
    );
    assert.deepEqual(
      [...menu.children].map((item) => ({
        role: item.getAttribute("role"),
        text: item.textContent.trim(),
      })),
      [
        { role: "menuitem", text: "Guardian dashboard" },
        { role: "menuitem", text: "Manage learners" },
        { role: "menuitem", text: "Account & privacy" },
        { role: "menuitem", text: "Sign out" },
      ],
    );
    assert.doesNotMatch(
      menu.textContent,
      /Manage Mia's details|Switch to Mia|AI and saved data|Delete account/,
    );
    assert.doesNotMatch(
      document.querySelector('[aria-label="Active profile"]')?.textContent ??
        "",
      /Managing Mia/,
    );
  });

  it("localizes Guardian account chrome while learner helpers follow preference", async () => {
    await mountStrict(
      createElement(
        GuardianLanguageProvider,
        { initialLanguage: "zh-Hans", storage: null },
        createElement(GuardianLanguageControl),
        createElement(
          AccountHeader,
          accountHeaderProps({
            error: "Guardian access could not be checked. Please try again.",
            errorHelper: "guardianAccessErrorHelper",
          }),
        ),
      ),
    );

    await click(button("Profile for Mia, learner mode"));
    const menu = document.querySelector('[role="menu"]');
    assert.equal(menu.getAttribute("aria-label"), "Account menu");
    assert.match(menu.textContent, /Grown-up access/);
    assert.match(menu.textContent, /Switch modes/);
    assert.equal(menu.querySelector('[lang="zh-Hans"]')?.textContent, "家长入口");
    assert.equal(
      document.querySelector('[role="alert"] [lang="zh-Hans"]')?.textContent,
      "请让家长重试。",
    );

    await click(button("English"));
    assert.equal(document.querySelector('[role="menu"]'), menu);
    assert.equal(menu.querySelector('[lang="zh-Hans"]'), null);
    assert.equal(document.querySelector('[role="alert"] [lang="zh-Hans"]'), null);
    assert.match(
      [...document.querySelectorAll('[role="alert"]')].find(
        (alert) => alert.textContent.trim() !== "",
      ).textContent,
      /Guardian access/,
    );

    await cleanupMountedRoots();
    document.body.replaceChildren();
    await mountStrict(
      createElement(
        GuardianLanguageProvider,
        { initialLanguage: "zh-Hans", storage: null },
        createElement(
          AccountHeader,
          accountHeaderProps({ activeMode: "guardian" }),
        ),
      ),
    );
    await click(button("Patrick的档案，家长模式"));
    const guardianMenu = document.querySelector('[role="menu"]');
    assert.equal(document.querySelector("aside").getAttribute("aria-label"), "账户");
    assert.equal(guardianMenu.getAttribute("aria-label"), "账户菜单");
    assert.deepEqual(
      [...guardianMenu.children].map((item) => item.textContent.trim()),
      ["家长控制面板", "管理学习者", "账户与隐私", "退出登录"],
    );
  });

  it("keeps account privacy content, dashboard navigation, and deletion on the protected page", async () => {
    assert.equal(
      typeof AccountPrivacyPage,
      "function",
      "Expected an executable AccountPrivacyPage",
    );
    const passwords = [];
    let refetchCalls = 0;
    const client = authClientForHeader();
    client.deleteUser = async ({ password }) => {
      passwords.push(password);
      return { error: null };
    };
    client.useSession = () => ({
      ...authClientForHeader().useSession(),
      refetch: async () => {
        refetchCalls += 1;
      },
    });
    const TestAuthGate = createAuthGate({
      client,
      GuardianAccessBoundary: ({ children }) => children,
      View: ({ children }) => children,
    });
    globalThis.fetch = async () =>
      Response.json({
        backend: {
          commitSha: "api-commit",
          deployedAt: null,
          deploymentId: "deployment-1",
          version: "1.2.3",
        },
        components: [],
      });

    await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian/account"] },
        createElement(
          TestAuthGate,
          null,
          createElement(
            Routes,
            null,
            createElement(Route, {
              element: createElement(AccountPrivacyPage),
              path: "/guardian/account",
            }),
            createElement(Route, {
              element: createElement("output", null, "DASHBOARD DESTINATION"),
              path: "/guardian",
            }),
          ),
        ),
      ),
    );

    assert.equal(document.querySelector("h1")?.textContent, "Account & privacy");
    assert.match(document.body.textContent, /How Parrot uses AI/);
    assert.match(document.body.textContent, /What this account keeps/);
    assert.match(
      document.body.textContent,
      /Voice-dubbing rhymes.*private voice clips/i,
    );
    assert.match(
      document.body.textContent,
      /Learner mode changes only through Switch to learner/,
    );
    assert.doesNotMatch(
      document.body.textContent,
      /Use in learner mode|Guardian profile editing can change the selected learner/,
    );
    assert.match(document.body.textContent, /Technical build details/);
    const deleteAccount = button("Delete account");
    assert.match(deleteAccount.closest("section")?.textContent ?? "", /Danger zone/);
    assert.equal(
      [...document.querySelectorAll("button")].filter(
        (candidate) => candidate.textContent.trim() === "Delete account",
      ).length,
      1,
    );

    await click(deleteAccount);
    assert.match(
      document.querySelector('[role="dialog"]')?.textContent ?? "",
      /private voice clips from all nursery rhymes/i,
    );
    await input(
      document.querySelector("#delete-account-password"),
      "parent-password",
    );
    await click(button("Delete account now"));
    await waitFor(() => assert.deepEqual(passwords, ["parent-password"]));
    assert.equal(refetchCalls, 1);

    await click(button("Cancel"));
    const back = [...document.querySelectorAll("a")].find(
      (candidate) =>
        candidate.textContent.trim() === "Back to Guardian dashboard",
    );
    assert.ok(back, "Expected a Back to Guardian dashboard link");
    await click(back);
    assert.match(document.body.textContent, /DASHBOARD DESTINATION/);
  });

  it("lets a guest confirm cleanup-first deletion without an impossible password", async () => {
    const passwords = [];
    await mountStrict(
      createElement(
        DialogHarness,
        {
          kind: "delete",
          onDelete: async (password) => {
            passwords.push(password);
            return null;
          },
          requiresPassword: false,
        },
      ),
    );

    await click(button("Open delete"));
    assert.ok(!document.querySelector("#delete-account-password"));
    const confirm = button("Delete account now");
    assert.equal(confirm.disabled, false);
    await waitFor(() => assert.equal(document.activeElement, confirm));

    await click(confirm);
    await waitFor(() => assert.deepEqual(passwords, [""]));
  });

  it("wires a guest account page to passwordless cleanup-first deletion", async () => {
    const deletionCalls = [];
    const client = authClientForHeader();
    client.useSession = () => ({
      data: {
        session: { id: "guest-session" },
        user: {
          email: "guest@example.test",
          id: "guest-user",
          isAnonymous: true,
          name: "Guest",
        },
      },
      error: null,
      isPending: false,
      refetch: async () => {},
    });
    const TestAuthGate = createAuthGate({
      client,
      deleteAccountAction: async (options) => {
        deletionCalls.push(options);
        return null;
      },
      GuardianAccessBoundary: ({ children }) => children,
      View: ({ children }) => children,
    });
    globalThis.fetch = async () =>
      Response.json({
        backend: {
          commitSha: "api-commit",
          deployedAt: null,
          deploymentId: "deployment-1",
          version: "1.2.3",
        },
        components: [],
      });

    await mountStrict(
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian/account"] },
        createElement(TestAuthGate, null, createElement(AccountPrivacyPage)),
      ),
    );

    await click(button("Delete account"));
    assert.ok(!document.querySelector("#delete-account-password"));
    await click(button("Delete account now"));
    await waitFor(() => assert.equal(deletionCalls.length, 1));
    assert.equal(deletionCalls[0].isAnonymous, true);
    assert.equal(deletionCalls[0].password, "");
  });

  it("tears down an open Guardian menu for every learner transition", async () => {
    for (const transition of ["expiry", "explicit lock", "guardian_required"]) {
        let access;
        let expire = () =>
          assert.fail("Expected guardian expiry to be scheduled.");
        let serverMode = "guardian";
        const expiresAt = "2099-01-01T00:00:00.000Z";
        const api = guardianApi({
          async loadGuardianAccess() {
            return serverMode === "guardian"
              ? { expiresAt, mode: "guardian" }
              : { mode: "learner" };
          },
          async lockGuardianAccess() {
            serverMode = "learner";
            return { mode: "learner" };
          },
        });
        await mountStrict(
          guardianHeaderHarness({
            api,
            onAccess: (nextAccess) => {
              access = nextAccess;
            },
            schedule(callback) {
              expire = callback;
              return () => {};
            },
          }),
        );

        await click(
          await waitFor(() => button("Profile for Patrick, guardian mode")),
        );
        assert.ok(document.querySelector('[role="menu"]'));

        if (transition === "expiry") {
          await act(async () => expire());
        } else if (transition === "explicit lock") {
          await act(async () => access.lock());
        } else {
          await act(async () => notifyGuardianAccessRequired());
        }

        await waitFor(() => button("Profile for Learner, learner mode"));
        assert.ok(
          !document.querySelector('[role="dialog"]'),
          `Dialog remained exposed after ${transition}`,
        );
        assert.ok(
          !document.querySelector('[role="menu"]'),
          `Menu remained exposed after ${transition}`,
        );
        assert.doesNotMatch(
          document.body.textContent,
          /AI and saved data|Delete account now|Sign out again/,
          `Guardian action remained exposed after ${transition}`,
        );

        await cleanupMountedRoots();
        document.body.replaceChildren();
        window.localStorage.clear();
    }
  });

  it("suppresses a guardian sign-out retry when the header becomes learner mode", async () => {
    let selectMode;
    function HeaderHarness() {
      const [activeMode, setActiveMode] = useState("guardian");
      selectMode = setActiveMode;
      return createElement(
        AccountHeader,
        accountHeaderProps({
          activeMode,
          signOutError: "Sign out did not finish.",
        }),
      );
    }

    await mountStrict(createElement(HeaderHarness));
    assert.ok(button("Sign out again"));
    await act(async () => selectMode("learner"));

    assert.equal(
      [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Sign out again",
      ) === undefined,
      true,
    );
    assert.doesNotMatch(document.body.textContent, /Sign out did not finish/);
  });

  it("offers one access retry and recovers status without a password or reload", async () => {
    let canRecover = false;
    const api = guardianApi({
      async loadGuardianAccess() {
        if (!canRecover) throw new Error("Guardian status is unavailable.");
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
    });
    await mountStrict(
      guardianHeaderHarness({
        api,
        onAccess() {},
        schedule: () => () => {},
      }),
    );

    await waitFor(() =>
      assert.equal(
        [...document.querySelectorAll('[role="alert"]')]
          .find((alert) => alert.textContent.trim() !== "")
          ?.textContent.trim(),
        "Guardian access could not be checked. Please try again.",
      ),
    );
    assert.equal(
      [...document.querySelectorAll("button")].filter(
        (candidate) => candidate.textContent.trim() === "Try again",
      ).length,
      1,
    );

    canRecover = true;
    await click(button("Try again"));
    await waitFor(() => button("Profile for Patrick, guardian mode"));
    assert.equal(
      [...document.querySelectorAll('[role="alert"]')].filter(
        (alert) => alert.textContent.trim() !== "",
      ).length,
      0,
    );
    assert.ok(!document.querySelector('input[name="password"]'));
  });

  it("hides active-learner actions before the learner experience registers", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi({
        async loadGuardianAccess() {
          return {
            expiresAt: "2099-01-01T00:00:00.000Z",
            mode: "guardian",
          };
        },
      }),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    await mountStrict(createElement(TestAuthGate, null, "LEARNER APP"));

    await click(
      await waitFor(() => button("Profile for Patrick, guardian mode")),
    );
    assert.deepEqual(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      [
        "Guardian dashboard",
        "Manage learners",
        "Account & privacy",
        "Sign out",
      ],
    );
  });

  it("keeps account navigation stable when a profile route is already open", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi({
        async loadGuardianAccess() {
          return {
            expiresAt: "2099-01-01T00:00:00.000Z",
            mode: "guardian",
          };
        },
      }),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    const profileRouteExperience = {
      error: "",
      hasActiveLearner: true,
      learnerName: "Mia",
      onOpenProfile: null,
    };
    const navigations = [];
    await mountStrict(
      createElement(
        TestAuthGate,
        { navigate: (path) => navigations.push(path) },
        createElement(AccountExperienceRegistration, {
          experience: profileRouteExperience,
        }),
      ),
    );

    await click(
      await waitFor(() => button("Profile for Patrick, guardian mode")),
    );
    assert.deepEqual(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      [
        "Guardian dashboard",
        "Manage learners",
        "Account & privacy",
        "Sign out",
      ],
    );
    await click(button("Guardian dashboard"));
    await click(button("Profile for Patrick, guardian mode"));
    await click(button("Manage learners"));
    await click(button("Profile for Patrick, guardian mode"));
    await click(button("Account & privacy"));
    assert.deepEqual(navigations, [
      "/guardian",
      "/guardian/learners",
      "/guardian/account",
    ]);
  });

  it("switches directly from the learner menu to guardian management", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi(),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    const navigations = [];

    await mountStrict(
      createElement(
        TestAuthGate,
        { navigate: (path) => navigations.push(path) },
        createElement(AccountExperienceRegistration, {
          experience: {
            error: "",
            guardianUnlockDestination: "/guardian/learners",
            hasActiveLearner: false,
            learnerName: null,
            onOpenProfile: null,
          },
        }),
      ),
    );

    await click(
      await waitFor(() => button("Profile for Learner, learner mode")),
    );
    await click(button("Grown-up accessSwitch modes"));
    await waitFor(() => assert.deepEqual(navigations, ["/guardian/learners"]));
    await click(button("Profile for Patrick, guardian mode"));
    assert.deepEqual(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      [
        "Guardian dashboard",
        "Manage learners",
        "Account & privacy",
        "Sign out",
      ],
    );
    assert.equal(
      [...document.querySelectorAll('[role="menuitem"]')].some((item) =>
        /Manage .*details|Switch to /.test(item.textContent),
      ),
      false,
    );
  });

  it("clears only the exact account experience registered by a profile", async () => {
    const first = {
      error: "",
      learnerName: "Mia",
      onOpenProfile() {},
    };
    const second = {
      error: "",
      learnerName: "Maya",
      onOpenProfile() {},
    };
    const registrations = [];
    let setExperience;
    function RegistrationHarness() {
      const [experiences, setExperiences] = useState([first]);
      setExperience = setExperiences;
      return createElement(
        AccountActionProvider,
        {
          setProfileAction(next) {
            const current = registrations.at(-1) ?? null;
            registrations.push(
              typeof next === "function" ? next(current) : next,
            );
          },
        },
        ...experiences.map((experience) =>
          createElement(AccountExperienceRegistration, {
            experience,
            key: experience.learnerName,
          }),
        ),
      );
    }

    await mountStrict(createElement(RegistrationHarness));
    await act(async () => setExperience([first, second]));
    await act(async () => setExperience([second]));

    assert.equal(registrations.at(-1), second);
  });

  it("keeps a failed direct switch in learner mode", async () => {
    let attempts = 0;
    await mountStrict(
      createElement(UnlockHarness, {
        api: guardianApi({
          async unlockGuardianAccess() {
            attempts += 1;
            throw new Error("Guardian mode could not be opened.");
          },
        }),
      }),
    );
    const switchButton = button("Switch to guardian mode");
    switchButton.focus();
    await click(switchButton);
    await waitFor(() =>
      assert.equal(
        document.querySelector('[role="alert"]').textContent.trim(),
        "Guardian access could not be checked. Please try again.",
      ),
    );

    assert.equal(attempts, 1);
    assert.equal(document.querySelector('input[name="password"]'), null);
    assert.equal(document.activeElement, switchButton);
    assert.equal(
      document.querySelector('output[aria-label="Guardian access mode"]')
        .textContent,
      "learner",
    );
  });

  it("shows a direct-switch failure in the account shell", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi({
        async unlockGuardianAccess() {
          throw new Error("Guardian mode could not be opened.");
        },
      }),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    await mountStrict(createElement(TestAuthGate, null, "LEARNER APP"));
    await click(
      await waitFor(() => button("Profile for Learner, learner mode")),
    );
    await click(button("Grown-up accessSwitch modes"));
    await waitFor(() =>
      assert.equal(
        [...document.querySelectorAll('[role="alert"]')].filter(
          (candidate) => candidate.textContent.trim() !== "",
        ).length,
        1,
      ),
    );

    const alert = [...document.querySelectorAll('[role="alert"]')].find(
      (candidate) => candidate.textContent.trim() !== "",
    );
    assert.equal(
      alert.textContent.trim(),
      "Guardian access could not be checked. Please try again.",
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.ok(button("Profile for Learner, learner mode"));
  });

  it("keeps learner and expired switch responses in the switch form", async () => {
    for (const { dialog, response } of [
      { dialog: false, response: { mode: "learner" } },
      {
        dialog: true,
        response: {
          expiresAt: "2000-01-01T00:00:00.000Z",
          mode: "guardian",
        },
      },
    ]) {
      let unlocked = 0;
      await mountStrict(
        createElement(UnlockHarness, {
          api: guardianApi({
            async unlockGuardianAccess() {
              return response;
            },
          }),
          dialog,
          onUnlocked: () => {
            unlocked += 1;
          },
        }),
      );
      if (dialog) await click(button("Open guardian mode"));
      const switchButton = button("Switch to guardian mode");
      switchButton.focus();
      await click(switchButton);
      await waitFor(() =>
        assert.equal(
          document.querySelector('[role="alert"]')?.textContent.trim(),
          "Guardian access could not be checked. Please try again.",
        ),
      );

      assert.equal(unlocked, 0);
      assert.equal(document.activeElement, switchButton);
      assert.equal(
        document.querySelector('output[aria-label="Guardian access mode"]')
          .textContent,
        "learner",
      );
      if (dialog) assert.ok(document.querySelector('[role="dialog"]'));

      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("disables switch controls while pending and submits without credentials", async () => {
    const attempt = deferred();
    const passwords = [];
    await mountStrict(
      createElement(UnlockHarness, {
        api: guardianApi({
          unlockGuardianAccess(password) {
            passwords.push(password);
            return attempt.promise;
          },
        }),
      }),
    );
    const switchButton = button("Switch to guardian mode");
    switchButton.focus();
    await act(async () => switchButton.form.requestSubmit());

    await waitFor(() => assert.deepEqual(passwords, [""]));
    assert.equal(switchButton.form.querySelector("fieldset").disabled, true);
    assert.match(switchButton.form.textContent, /Switching modes…/);
    attempt.resolve({
      expiresAt: "2099-01-01T00:00:00.000Z",
      mode: "guardian",
    });
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Guardian access mode"]')
          .textContent,
        "guardian",
      ),
    );
  });

  it("renders no password field for a guardian mode switch", async () => {
    const passwords = [];
    await mountStrict(
      createElement(UnlockHarness, {
        api: guardianApi({
          async unlockGuardianAccess(password) {
            passwords.push(password);
            return {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            };
          },
        }),
      }),
    );
    const switchButton = button("Switch to guardian mode");
    assert.equal(document.querySelector('input[name="password"]'), null);

    await act(async () => switchButton.form.requestSubmit());

    assert.deepEqual(passwords, [""]);
    assert.equal(
      document.querySelector('output[aria-label="Guardian access mode"]')
        .textContent,
      "guardian",
    );
  });

  it("announces a deep-link unlock from the stable account shell", async () => {
    let unlocked = 0;
    const Provider = createGuardianAccessProvider({
      api: guardianApi(),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement(
          "main",
          { "aria-label": "Deep-link guardian unlock" },
          createElement(GuardianUnlockForm, {
            onCancel() {},
            onUnlocked: () => {
              unlocked += 1;
            },
          }),
        ),
      ),
    );
    await click(button("Switch to guardian mode"));
    await waitFor(() =>
      assert.equal(
        [...document.querySelectorAll('[role="status"]')].filter(
          (status) =>
            status.textContent.trim() ===
            "Guardian mode",
        ).length,
        1,
      ),
    );

    assert.equal(unlocked, 1);
    assert.equal(document.querySelector('input[name="password"]'), null);
    assert.ok(
      !document
        .querySelector('main[aria-label="Deep-link guardian unlock"]')
        .querySelector('[role="status"]'),
    );
    assert.ok(button("Profile for Patrick, guardian mode"));
  });

  it("keeps network failures in learner mode", async () => {
    await mountStrict(
      createElement(UnlockHarness, {
        api: guardianApi({
          async unlockGuardianAccess() {
            throw new Error(
              "check-failed",
            );
          },
        }),
      }),
    );
    await click(button("Switch to guardian mode"));
    await waitFor(() => assert.ok(document.querySelector('[role="alert"]')));

    assert.equal(
      document.querySelector('output[aria-label="Guardian access mode"]')
        .textContent,
      "learner",
    );
  });

  it("localizes Guardian access checks but keeps learner checks English", async () => {
    const guardianLoad = deferred();
    await mountStrict(
      modeBoundaryHarness({
        guardianAudience: true,
        api: guardianApi({
          loadGuardianAccess: () => guardianLoad.promise,
        }),
      }),
    );
    assert.equal(
      document.querySelector("h1")?.textContent.trim(),
      "正在检查家长访问权限…",
    );
    assert.match(document.body.textContent, /正在确认哪个档案可以使用此页面/);

    await cleanupMountedRoots();
    document.body.replaceChildren();
    const learnerLoad = deferred();
    await mountStrict(
      modeBoundaryHarness({
        guardianAudience: false,
        api: guardianApi({
          loadGuardianAccess: () => learnerLoad.promise,
        }),
      }),
    );
    assert.equal(
      document.querySelector("h1")?.textContent.trim(),
      "Checking guardian access…",
    );
    assert.match(document.body.textContent, /Confirming which profile can use this screen/);
    assert.doesNotMatch(document.body.textContent, /正在检查家长访问权限/);
  });

  it("localizes Guardian unlock and adds only a Chinese learner-boundary helper", async () => {
    await mountStrict(
      modeBoundaryHarness({
        guardianAudience: true,
        api: guardianApi(),
      }),
    );
    await waitFor(() => button("切换到家长模式"));
    assert.match(document.body.textContent, /家长工具和学习活动分别保留在不同模式中/);

    await cleanupMountedRoots();
    document.body.replaceChildren();
    await mountStrict(
      modeBoundaryHarness({
        guardianAudience: false,
        api: guardianApi({
          loadGuardianAccess: async () => ({
            expiresAt: "2099-01-01T00:00:00.000Z",
            mode: "guardian",
          }),
        }),
      }),
    );
    await waitFor(() => button("Switch to learner mode"));
    assert.equal(
      document.querySelector("h1")?.textContent.trim(),
      "Switch to learner mode",
    );
    assert.match(document.body.textContent, /Learning activities are available in the learner profile/);
    const helper = [...document.querySelectorAll('span[lang="zh-Hans"]')].find(
      (candidate) => candidate.textContent.trim() === "请家长切换到学习模式后继续。",
    );
    assert.ok(helper);
  });

  it("keeps FeaturePlaceholder English defaults and accepts localized recovery labels", async () => {
    await mountStrict(
      createElement(
        MemoryRouter,
        null,
        createElement(FeaturePlaceholder, {
          actionTo: "/guardian",
          description: "无法加载。",
          onRetry() {},
          retryLabel: "重试",
          actionLabel: "返回家长中心",
          title: "暂时无法打开",
        }),
      ),
    );
    assert.ok(button("重试"));
    assert.equal(
      [...document.querySelectorAll("a")].find(
        (candidate) => candidate.textContent.trim() === "返回家长中心",
      )?.getAttribute("href"),
      "/guardian",
    );

    await cleanupMountedRoots();
    document.body.replaceChildren();
    await mountStrict(
      createElement(
        MemoryRouter,
        null,
        createElement(FeaturePlaceholder, {
          description: "Learner recovery.",
          onRetry() {},
          title: "Learner placeholder",
        }),
      ),
    );
    assert.ok(button("Try again"));
    assert.match(document.body.textContent, /Back to home/);
  });

  it("focuses the switch action and restores the mode opener on cancel", async () => {
    await mountStrict(
      createElement(UnlockHarness, { api: guardianApi(), dialog: true }),
    );
    const opener = button("Open guardian mode");
    opener.focus();
    await click(opener);
    const switchButton = button("Switch to guardian mode");
    assert.equal(
      document.querySelector('[role="dialog"]').getAttribute("aria-label"),
      "Switch to guardian mode",
    );
    await waitFor(() => assert.equal(document.activeElement, switchButton));

    await click(button("Cancel"));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
  });

  it("keeps dialog language control available during a pending unlock", async () => {
    const attempt = deferred();
    await mountStrict(
      createElement(
        GuardianLanguageProvider,
        { initialLanguage: "zh-Hans", storage: null },
        createElement(UnlockHarness, {
          api: guardianApi({
            unlockGuardianAccess() {
              return attempt.promise;
            },
          }),
          dialog: true,
        }),
      ),
    );
    const opener = button("Open guardian mode");
    opener.focus();
    await click(opener);
    const dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog.getAttribute("lang"), "zh-Hans");
    const switchButton = button("切换到家长模式");
    await waitFor(() => assert.equal(document.activeElement, switchButton));
    await act(async () => switchButton.form.requestSubmit());
    await waitFor(() => assert.match(dialog.textContent, /正在切换模式…/));

    const english = button("English");
    assert.equal(dialog.contains(english), true);
    assert.equal(english.closest("fieldset"), null);
    assert.equal(english.disabled, false);
    await click(english);
    assert.equal(document.querySelector('[role="dialog"]'), dialog);
    assert.equal(dialog.getAttribute("lang"), "en");
    assert.match(dialog.textContent, /Switching modes…/);

    attempt.reject(new Error("SERVER COPY"));
    await waitFor(() =>
      assert.match(dialog.textContent, /Guardian access could not be checked/),
    );
    assert.doesNotMatch(dialog.textContent, /SERVER COPY/);
    await click(button("Cancel"));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
  });

  it("navigates a successful profile-dropdown switch to guardian home", async () => {
    window.history.replaceState(null, "", "/");
    const Provider = createGuardianAccessProvider({
      api: guardianApi(),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    await mountStrict(createElement(TestAuthGate, null, "LEARNER APP"));
    const trigger = await waitFor(() =>
      button("Profile for Learner, learner mode"),
    );
    await click(trigger);
    const guardian = button("Grown-up accessSwitch modes");
    await click(guardian);
    await waitFor(() => assert.equal(window.location.pathname, "/guardian"));

    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.match(
      document.body.textContent,
      /Guardian mode/,
    );
  });

  it("lets the stable account shell resume a validated Guardian deep link", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi(),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    const navigations = [];
    await mountStrict(
      createElement(
        TestAuthGate,
        {
          guardianUnlockDestination:
            "/guardian/stories?section=art#cover",
          navigate: (path) => navigations.push(path),
        },
        "LOCKED GUARDIAN PAGE",
      ),
    );

    await click(
      await waitFor(() => button("Profile for Learner, learner mode")),
    );
    await click(button("Grown-up accessSwitch modes"));

    await waitFor(() =>
      assert.deepEqual(navigations, [
        "/guardian/stories?section=art#cover",
      ]),
    );
  });

  it("announces every successful unlock in one mounted account experience", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi(),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    let access;
    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement(AccessCapture, {
          onAccess: (nextAccess) => {
            access = nextAccess;
          },
        }),
        createElement(AccountExperienceRegistration, {
          experience: {
            error: "",
            hasActiveLearner: true,
            learnerName: "Mia",
            onOpenProfile() {},
          },
        }),
        "LEARNER APP",
      ),
    );
    const liveStatuses = document.querySelectorAll(
      'span[role="status"][aria-live="polite"]',
    );
    const liveStatus = liveStatuses[liveStatuses.length - 1];
    const announcements = [];
    const observer = new window.MutationObserver(() => {
      const message = liveStatus.textContent.trim();
      if (message) announcements.push(message);
    });
    observer.observe(liveStatus, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    async function unlock() {
      let guardian = [...document.querySelectorAll("button")].find(
        (candidate) =>
          candidate.textContent.trim() ===
          "Grown-up accessSwitch modes",
      );
      if (!guardian) {
        await click(
          await waitFor(() => button("Profile for Mia, learner mode")),
        );
        guardian = button("Grown-up accessSwitch modes");
      }
      await click(guardian);
      await waitFor(() =>
        assert.equal(
          liveStatus.textContent.trim(),
          "Guardian mode",
        ),
      );
    }

    await unlock();
    await act(async () => access.lock());
    await waitFor(() => button("Profile for Mia, learner mode"));
    await unlock();
    await waitFor(() => assert.equal(announcements.length, 3));
    observer.disconnect();

    assert.deepEqual(announcements, [
      "Guardian mode",
      "Learner mode",
      "Guardian mode",
    ]);
  });

  it("retranslates the mounted Guardian-mode announcement when language changes", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi(),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    await mountStrict(
      createElement(
        GuardianLanguageProvider,
        { initialLanguage: "en", storage: null },
        createElement(GuardianLanguageControl),
        createElement(
          TestAuthGate,
          null,
          createElement(AccountExperienceRegistration, {
            experience: {
              error: "",
              hasActiveLearner: true,
              learnerName: "Mia",
              onOpenProfile() {},
            },
          }),
          "LEARNER APP",
        ),
      ),
    );
    await click(await waitFor(() => button("Profile for Mia, learner mode")));
    await click(button("Grown-up accessSwitch modes"));
    const liveStatuses = document.querySelectorAll(
      'span[role="status"][aria-live="polite"]',
    );
    const liveStatus = liveStatuses[liveStatuses.length - 1];
    await waitFor(() =>
      assert.equal(liveStatus.textContent.trim(), "Guardian mode"),
    );

    await click(button("中文"));

    assert.equal(
      document.querySelectorAll('span[role="status"][aria-live="polite"]')
        .item(liveStatuses.length - 1),
      liveStatus,
    );
    assert.equal(liveStatus.textContent.trim(), "家长模式");
  });

  it("supports menu arrow, Home, End, and Escape keyboard navigation", async () => {
    await mountStrict(
      createElement(
        AccountHeader,
        accountHeaderProps({ activeMode: "guardian" }),
      ),
    );

    const trigger = button("Profile for Patrick, guardian mode");
    trigger.focus();
    await press(trigger, "ArrowDown");
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      items.map((item) => item.textContent.trim()),
      [
        "Guardian dashboard",
        "Manage learners",
        "Account & privacy",
        "Sign out",
      ],
    );
    await waitFor(() => assert.equal(document.activeElement, items[0]));

    await press(items[0], "ArrowDown");
    assert.equal(document.activeElement, items[1]);
    await press(items[1], "End");
    assert.equal(document.activeElement, items[3]);
    await press(items[3], "ArrowUp");
    assert.equal(document.activeElement, items[2]);
    await press(items[2], "ArrowDown");
    assert.equal(document.activeElement, items[3]);
    await press(items[3], "ArrowDown");
    assert.equal(document.activeElement, items[0]);
    await press(items[0], "ArrowUp");
    assert.equal(document.activeElement, items[3]);
    await press(items[3], "Home");
    assert.equal(document.activeElement, items[0]);

    await press(items[0], "Escape");
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, trigger);

    await press(trigger, "ArrowUp");
    const reopenedItems = [...document.querySelectorAll('[role="menuitem"]')];
    await waitFor(() =>
      assert.equal(
        document.activeElement,
        reopenedItems[reopenedItems.length - 1],
      ),
    );
    await press(document.activeElement, "Escape");
    assert.equal(document.activeElement, trigger);
  });

  it("closes the account menu when focus leaves it", async () => {
    await mountStrict(
      createElement(
        "div",
        null,
        createElement(AccountHeader, accountHeaderProps()),
        createElement("button", { type: "button" }, "Play a lesson"),
      ),
    );

    await click(button("Profile for Mia, learner mode"));
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu);
    await waitFor(() =>
      assert.equal(
        document.activeElement,
        menu.querySelector('[role="menuitem"]'),
      ),
    );

    const destination = button("Play a lesson");
    await act(async () => destination.focus());
    await waitFor(() =>
      assert.equal(document.querySelector('[role="menu"]'), null),
    );
    assert.equal(document.activeElement, destination);
  });
});
