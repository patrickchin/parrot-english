import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Talk to Peppa is a durable main-menu feature route", () => {
  const home = source("../src/HomeMenu.tsx");
  const app = source("../src/App.tsx");
  const routes = source("../src/app-routes.ts");

  assert.match(home, /MessageCircle/);
  assert.match(home, /label:\s*["']Talk to Peppa["']/);
  assert.match(home, /to:\s*["']\/talk-to-peppa["']/);
  assert.match(app, /path=["']\/talk-to-peppa["']/);
  assert.match(app, /isTalkToPeppaRoute\(location\.pathname\)/);
  assert.match(routes, /export function isTalkToPeppaRoute/);
  assert.match(routes, /\^\\\/talk-to-peppa\\\/*\$/i);
});

test("the learner gate gives completed learners a reusable conversation route", () => {
  const gate = source("../src/OnboardingGate.tsx");

  assert.match(gate, /isConversationRoute:\s*boolean/);
  assert.match(
    gate,
    /isConversationRoute[\s\S]*?<ConversationSurface \{\.\.\.conversationProps\} \/>/,
  );
  assert.match(gate, /onConversationCompleted:\s*\(\)\s*=>\s*void/);
  assert.match(gate, /if \(isConversationRoute\) onConversationCompleted\(\)/);
});

test("conversation content reserves room for fixed account controls", () => {
  const styles = source("../src/styles.css");

  assert.match(
    styles,
    /\.user-session-bar\s*\+\s*\.conversation-screen\s*\{[^}]*--conversation-account-inset:\s*112px[^}]*padding-top:\s*max\([^;]*var\(--conversation-account-inset\)[^;]*\)/s,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*720px\)[\s\S]*?\.user-session-bar\s*\+\s*\.conversation-screen\s*\{[^}]*--conversation-account-inset:\s*174px/s,
  );
});
