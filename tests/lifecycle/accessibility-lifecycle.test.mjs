import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useEffect, useRef, useState } from "react";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
} from "react-router";
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

let AboutDialog;
let AccountDeleteDialog;
let AccountHeader;
let createAuthGate;
let ConversationSurface;
let GuardianUnlockDialog;
let GuardianUnlockForm;
let RouteFocusManager;
let AccountActionProvider;
let useProfileAccountAction;
let createGuardianAccessProvider;
let notifyGuardianAccessRequired;
let useGuardianAccess;

before(async () => {
  ({ AboutDialog } = await vite.ssrLoadModule("/src/app/AboutDialog.tsx"));
  ({ AccountDeleteDialog } = await vite.ssrLoadModule(
    "/src/app/AccountDeleteDialog.tsx",
  ));
  ({ AccountHeader } = await vite.ssrLoadModule("/src/app/AppHeader.tsx"));
  ({ createAuthGate } = await vite.ssrLoadModule("/src/auth/AuthGate.tsx"));
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
  ({ RouteFocusManager } = await vite.ssrLoadModule(
    "/src/app/RouteFocusManager.tsx",
  ));
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
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

function DialogHarness({ kind }) {
  const [isOpen, setIsOpen] = useState(false);
  const label = kind === "about" ? "Open AI and saved data" : "Open delete";
  return createElement(
    "main",
    null,
    createElement(
      "button",
      { onClick: () => setIsOpen(true), type: "button" },
      label,
    ),
    isOpen && kind === "about"
      ? createElement(AboutDialog, { onClose: () => setIsOpen(false) })
      : null,
    isOpen && kind === "delete"
      ? createElement(AccountDeleteDialog, {
          onClose: () => setIsOpen(false),
          onDelete: async () => null,
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
  return createElement("output", { "aria-label": "Guardian access mode" }, mode);
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
    dialog && createElement(
      "button",
      { onClick: () => setIsOpen(true), ref: openerRef, type: "button" },
      "Open guardian mode",
    ),
    isOpen && (dialog
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

    await waitFor(() => assert.equal(document.activeElement.textContent, "Home"));
    await click(document.querySelector('a[href="/stories"]'));
    await waitFor(() =>
      assert.equal(document.activeElement.textContent, "Pick a story"),
    );
    assert.equal(document.activeElement.tagName, "H1");
    assert.equal(document.activeElement.tabIndex, -1);
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

  it("traps AI and saved data focus in both directions and restores its opener on Escape", async () => {
    globalThis.fetch = async () =>
      Response.json({
        backend: {
          commitSha: "local",
          deployedAt: null,
          deploymentId: "local",
          details: { models: { lessonScript: "test-model" } },
          version: "test",
        },
        components: [],
      });
    await mountStrict(createElement(DialogHarness, { kind: "about" }));

    const opener = button("Open AI and saved data");
    opener.focus();
    await click(opener);
    const close = button("Close AI and saved data");
    const done = button("Done");
    await waitFor(() => assert.equal(document.activeElement, close));

    const backwardTab = await press(close, "Tab", { shiftKey: true });
    assert.equal(backwardTab.defaultPrevented, true);
    assert.equal(document.activeElement, done);

    const forwardTab = await press(done, "Tab");
    assert.equal(forwardTab.defaultPrevented, true);
    assert.equal(document.activeElement, close);

    await press(close, "Escape");
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
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

  it("learner mode exposes only the locked grown-up gateway beneath the active identity", async () => {
    await mountStrict(createElement(AccountHeader, accountHeaderProps()));

    await click(button("Profile for Mia, learner mode"));
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.deepEqual(
      [...menu.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      ["Grown-up accessAccount password required"],
    );
    assert.match(document.body.textContent, /Mia/);
    assert.equal(
      document.querySelector('[aria-label="Choose profile mode"]'),
      null,
    );
    assert.doesNotMatch(
      document.body.textContent,
      /AI and saved data|Sign out|Delete account|Manage learner details/,
    );
  });

  it("guardian mode keeps all management actions after its one-way learner switch", async () => {
    await mountStrict(
      createElement(AccountHeader, accountHeaderProps({ activeMode: "guardian" })),
    );

    await click(button("Profile for Patrick, guardian mode"));
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.equal(document.querySelector('[aria-label="Choose profile mode"]'), null);
    assert.deepEqual(
      [...menu.children].map((item) => ({
        role: item.getAttribute("role"),
        text: item.textContent.trim(),
      })),
      [
        { role: "menuitem", text: "Switch to learner" },
        { role: "menuitem", text: "Manage learner details" },
        { role: "menuitem", text: "AI and saved data" },
        { role: "menuitem", text: "Sign out" },
        { role: "menuitem", text: "Delete account" },
      ],
    );
  });

  it("tears down every open guardian account surface for every learner transition", async () => {
    for (const transition of ["expiry", "explicit lock", "guardian_required"]) {
      for (const surface of ["menu", "about", "delete"]) {
        let access;
        let expire = () => assert.fail("Expected guardian expiry to be scheduled.");
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
        if (surface === "about") await click(button("AI and saved data"));
        if (surface === "delete") await click(button("Delete account"));
        if (surface === "menu") {
          assert.ok(document.querySelector('[role="menu"]'));
        } else {
          assert.ok(document.querySelector('[role="dialog"]'));
        }

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
          `${surface} dialog remained exposed after ${transition}`,
        );
        assert.ok(
          !document.querySelector('[role="menu"]'),
          `${surface} menu remained exposed after ${transition}`,
        );
        assert.doesNotMatch(
          document.body.textContent,
          /AI and saved data|Delete account now|Sign out again/,
          `${surface} remained exposed after ${transition}`,
        );

        await cleanupMountedRoots();
        document.body.replaceChildren();
      }
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
        [...document.querySelectorAll('[role="alert"]')].find(
          (alert) => alert.textContent.trim() !== "",
        )?.textContent.trim(),
        "Guardian status is unavailable.",
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

  it("keeps all guardian actions before the learner experience registers", async () => {
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

    await click(await waitFor(() => button("Profile for Patrick, guardian mode")));
    assert.deepEqual(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      [
        "Switch to learner",
        "Manage learner details",
        "AI and saved data",
        "Sign out",
        "Delete account",
      ],
    );
  });

  it("keeps all guardian actions when the profile route registers no opener", async () => {
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

    await click(button("Profile for Patrick, guardian mode"));
    assert.deepEqual(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
      [
        "Switch to learner",
        "Manage learner details",
        "AI and saved data",
        "Sign out",
        "Delete account",
      ],
    );
    await click(button("Manage learner details"));
    assert.deepEqual(navigations, ["/guardian/profile?returnTo=%2Fguardian"]);
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
            registrations.push(typeof next === "function" ? next(current) : next);
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

  it("clears an incorrect password and stays in the unlock form", async () => {
    const passwords = [];
    await mountStrict(
      createElement(UnlockHarness, {
        api: guardianApi({
          async unlockGuardianAccess(password) {
            passwords.push(password);
            throw new Error("The password did not match this account.");
          },
        }),
      }),
    );
    const password = document.querySelector('input[name="password"]');
    await input(password, "wrong-password");
    const unlock = button("Unlock guardian mode");
    unlock.focus();
    await click(unlock);
    await waitFor(() =>
      assert.equal(
        document.querySelector('[role="alert"]').textContent.trim(),
        "The password did not match this account.",
      ),
    );

    assert.deepEqual(passwords, ["wrong-password"]);
    assert.equal(password.value, "");
    assert.equal(password.getAttribute("aria-invalid"), "true");
    assert.equal(
      password.getAttribute("aria-describedby"),
      document.querySelector('[role="alert"]').id,
    );
    assert.equal(document.activeElement, password);
    assert.equal(document.querySelector('output[aria-label="Guardian access mode"]').textContent, "learner");
  });

  it("renders one field-associated invalid-password alert in the account unlock dialog", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi({
        async unlockGuardianAccess() {
          throw new Error("The password did not match this account.");
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
    await click(button("Grown-up accessAccount password required"));
    const password = document.querySelector('input[name="password"]');
    await input(password, "wrong-password");
    const unlock = button("Unlock guardian mode");
    unlock.focus();
    await click(unlock);
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
    assert.equal(alert.textContent.trim(), "The password did not match this account.");
    assert.equal(password.getAttribute("aria-invalid"), "true");
    assert.equal(password.getAttribute("aria-describedby"), alert.id);
    assert.equal(document.activeElement, password);
  });

  it("keeps learner and expired unlock responses in the password form", async () => {
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
      const password = document.querySelector('input[name="password"]');
      await input(password, "correct-password");
      const unlock = button("Unlock guardian mode");
      unlock.focus();
      await click(unlock);
      await waitFor(() =>
        assert.equal(
          document.querySelector('[role="alert"]')?.textContent.trim(),
          "Guardian access could not be checked. Please try again.",
        ),
      );

      assert.equal(unlocked, 0);
      assert.equal(document.activeElement, password);
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

  it("disables unlock controls while pending and submits the password with Enter", async () => {
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
    const password = document.querySelector('input[name="password"]');
    await input(password, "correct-password");
    password.focus();
    await act(async () => password.form.requestSubmit());

    assert.deepEqual(passwords, ["correct-password"]);
    assert.equal(password.form.querySelector("fieldset").disabled, true);
    assert.match(password.form.textContent, /Unlocking guardian mode…/);
    attempt.resolve({
      expiresAt: "2099-01-01T00:00:00.000Z",
      mode: "guardian",
    });
    await waitFor(() => assert.equal(password.value, ""));
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
    const password = document.querySelector('input[name="password"]');
    await input(password, "correct-password");
    await click(button("Unlock guardian mode"));
    await waitFor(() =>
      assert.equal(
        [...document.querySelectorAll('[role="status"]')].filter(
          (status) =>
            status.textContent.trim() ===
            "Guardian mode unlocked for 15 minutes",
        ).length,
        1,
      ),
    );

    assert.equal(unlocked, 1);
    assert.equal(password.value, "");
    assert.ok(
      !document
        .querySelector('main[aria-label="Deep-link guardian unlock"]')
        .querySelector('[role="status"]'),
    );
    assert.ok(button("Profile for Patrick, guardian mode"));
  });

  it("keeps network failures in learner mode and clears the password", async () => {
    await mountStrict(
      createElement(UnlockHarness, {
        api: guardianApi({
          async unlockGuardianAccess() {
            throw new Error("Guardian access could not be checked. Please try again.");
          },
        }),
      }),
    );
    const password = document.querySelector('input[name="password"]');
    await input(password, "correct-password");
    await click(button("Unlock guardian mode"));
    await waitFor(() => assert.ok(document.querySelector('[role="alert"]')));

    assert.equal(password.value, "");
    assert.equal(document.querySelector('output[aria-label="Guardian access mode"]').textContent, "learner");
  });

  it("focuses the unlock password and restores the mode opener on cancel", async () => {
    await mountStrict(
      createElement(UnlockHarness, { api: guardianApi(), dialog: true }),
    );
    const opener = button("Open guardian mode");
    opener.focus();
    await click(opener);
    const password = document.querySelector('input[name="password"]');
    assert.equal(
      document.querySelector('[role="dialog"]').getAttribute("aria-label"),
      "Unlock guardian mode",
    );
    await waitFor(() => assert.equal(document.activeElement, password));

    await click(button("Cancel"));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
  });

  it("keeps guardian selected and shows the safety error when lock fails", async () => {
    const Provider = createGuardianAccessProvider({
      api: guardianApi({
        async loadGuardianAccess() {
          return {
            expiresAt: "2099-01-01T00:00:00.000Z",
            mode: "guardian",
          };
        },
        async lockGuardianAccess() {
          throw new Error("offline");
        },
      }),
      schedule: () => () => {},
    });
    const TestAuthGate = createAuthGate({
      client: authClientForHeader(),
      GuardianAccessBoundary: Provider,
    });
    await mountStrict(createElement(TestAuthGate, null, "LEARNER APP"));
    const trigger = await waitFor(() =>
      button("Profile for Patrick, guardian mode"),
    );
    await click(trigger);
    await click(button("Switch to learner"));
    await waitFor(() =>
      assert.ok(
        [...document.querySelectorAll('[role="alert"]')].some((alert) =>
          /Could not lock guardian mode\. Try again before handing over the device\./.test(
            alert.textContent,
          ),
        ),
      ),
    );

    assert.ok(button("Profile for Patrick, guardian mode"));
    assert.ok(button("Switch to learner"));
  });

  it("navigates a successful profile-dropdown unlock to guardian home", async () => {
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
    const guardian = button("Grown-up accessAccount password required");
    await click(guardian);
    const password = document.querySelector('input[name="password"]');
    await input(password, "correct-password");
    await click(button("Unlock guardian mode"));
    await waitFor(() => assert.equal(window.location.pathname, "/guardian"));

    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.match(
      document.body.textContent,
      /Guardian mode unlocked for 15 minutes/,
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
    await mountStrict(createElement(TestAuthGate, null, "LEARNER APP"));
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
          "Grown-up accessAccount password required",
      );
      if (!guardian) {
        await click(
          await waitFor(() => button("Profile for Learner, learner mode")),
        );
        guardian = button("Grown-up accessAccount password required");
      }
      await click(guardian);
      const password = document.querySelector('input[name="password"]');
      await input(password, "correct-password");
      await click(button("Unlock guardian mode"));
      await waitFor(() =>
        assert.equal(
          liveStatus.textContent.trim(),
          "Guardian mode unlocked for 15 minutes",
        ),
      );
    }

    await unlock();
    await click(
      await waitFor(() => button("Profile for Patrick, guardian mode")),
    );
    await click(button("Switch to learner"));
    await waitFor(() => button("Profile for Learner, learner mode"));
    await unlock();
    await waitFor(() => assert.equal(announcements.length, 3));
    observer.disconnect();

    assert.deepEqual(announcements, [
      "Guardian mode unlocked for 15 minutes",
      "Learner mode",
      "Guardian mode unlocked for 15 minutes",
    ]);
  });

  it("keeps the profile switch mounted while the unlock dialog owns interaction", async () => {
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
    const guardian = button("Grown-up accessAccount password required");
    await click(guardian);
    const password = document.querySelector('input[name="password"]');
    await act(async () =>
      password.dispatchEvent(
        new window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
        }),
      ),
    );

    assert.ok(document.querySelector('[role="menu"]'));
    await press(password, "Escape");
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, guardian);
  });

  it("supports menu arrow, Home, End, and Escape keyboard navigation", async () => {
    await mountStrict(
      createElement(AccountHeader, accountHeaderProps({ activeMode: "guardian" })),
    );

    const trigger = button("Profile for Patrick, guardian mode");
    trigger.focus();
    await press(trigger, "ArrowDown");
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      items.map((item) => item.textContent.trim()),
      [
        "Switch to learner",
        "Manage learner details",
        "AI and saved data",
        "Sign out",
        "Delete account",
      ],
    );
    await waitFor(() => assert.equal(document.activeElement, items[0]));

    await press(items[0], "ArrowDown");
    assert.equal(document.activeElement, items[1]);
    await press(items[1], "End");
    assert.equal(document.activeElement, items[4]);
    await press(items[4], "ArrowUp");
    assert.equal(document.activeElement, items[3]);
    await press(items[3], "ArrowDown");
    assert.equal(document.activeElement, items[4]);
    await press(items[4], "ArrowDown");
    assert.equal(document.activeElement, items[0]);
    await press(items[0], "ArrowUp");
    assert.equal(document.activeElement, items[4]);
    await press(items[4], "Home");
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

    globalThis.fetch = async () =>
      Response.json({
        backend: {
          commitSha: "local",
          deployedAt: null,
          deploymentId: "local",
          details: { models: { lessonScript: "test-model" } },
          version: "test",
        },
        components: [],
      });
    await click(reopenedItems[2]);
    await waitFor(() =>
      assert.equal(document.activeElement, button("Close AI and saved data")),
    );
    await press(document.activeElement, "Escape");
    assert.equal(document.activeElement, trigger);

    await press(trigger, "ArrowDown");
    const deleteItem = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent.trim() === "Delete account",
    );
    assert.ok(deleteItem);
    await click(deleteItem);
    await waitFor(() =>
      assert.equal(
        document.activeElement,
        document.querySelector("#delete-account-password"),
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
    await waitFor(() => assert.equal(document.querySelector('[role="menu"]'), null));
    assert.equal(document.activeElement, destination);
  });
});
