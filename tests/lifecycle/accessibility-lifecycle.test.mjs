import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useState } from "react";
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
let ConversationSurface;
let RouteFocusManager;

before(async () => {
  ({ AboutDialog } = await vite.ssrLoadModule("/src/app/AboutDialog.tsx"));
  ({ AccountDeleteDialog } = await vite.ssrLoadModule(
    "/src/app/AccountDeleteDialog.tsx",
  ));
  ({ AccountHeader } = await vite.ssrLoadModule("/src/app/AppHeader.tsx"));
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
    bubbles: true,
    cancelable: true,
    code: options.code ?? key,
    key,
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

function conversationProps(overrides = {}) {
  return {
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneBusy: false,
    microphoneEnabled: false,
    onBack() {},
    onChooseLesson() {},
    onFinish() {},
    onPromptStyleChange() {},
    onRepeatAudio() {},
    onRetryVoice() {},
    onStart() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    promptStyle: "tiny-turns",
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

  it("supports menu arrow, Home, End, and Escape keyboard navigation", async () => {
    await mountStrict(
      createElement(AccountHeader, {
        error: "",
        isSigningOut: false,
        onDeleteAccount: async () => null,
        onOpenProfile() {},
        onSignOut() {},
        userEmail: "mia@example.test",
        userLabel: "Mia",
      }),
    );

    const trigger = button("Account for Mia");
    trigger.focus();
    await press(trigger, "ArrowDown");
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      items.map((item) => item.textContent.trim()),
      ["Learner profile", "AI and saved data", "Delete account", "Sign out"],
    );
    await waitFor(() => assert.equal(document.activeElement, items[0]));

    await press(items[0], "ArrowDown");
    assert.equal(document.activeElement, items[1]);
    await press(items[1], "End");
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
    await click(reopenedItems[1]);
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
});
