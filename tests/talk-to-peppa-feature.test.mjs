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
  assert.match(routes, /const TALK_TO_PEPPA_ROUTE_PATH/);
});

test("the learner gate gives completed learners a reusable conversation route", () => {
  const gate = source("../src/OnboardingGate.tsx");

  assert.match(gate, /isConversationRoute:\s*boolean/);
  assert.match(
    gate,
    /isConversationRoute[\s\S]*?<ConversationSurface \{\.\.\.conversationProps\} \/>/,
  );
  assert.match(gate, /onConversationCompleted:\s*\(\)\s*=>\s*void/);
  assert.match(
    gate,
    /if\s*\(isConversationRoute\)\s*\{\s*onConversationCompleted\(\)/,
  );
});

test("conversation route uses a compact same-row mobile header", () => {
  const app = source("../src/App.tsx");
  const authGate = source("../src/AuthGate.tsx");
  const styles = source("../src/styles.css");

  assert.match(app, /compactSessionBar=\{isConversationRoute\}/);
  assert.match(authGate, /user-session-bar--conversation/);
  assert.match(
    styles,
    /\.user-session-bar\s*\+\s*\.conversation-screen\s*\{[^}]*--conversation-account-inset:\s*112px[^}]*padding-top:\s*max\([^;]*var\(--conversation-account-inset\)[^;]*\)/s,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*720px\)[\s\S]*?\.user-session-bar--conversation\s*\{[^}]*top:\s*clamp\(14px,\s*2\.2vh,\s*28px\)[^}]*max-width:\s*calc\(100vw\s*-\s*92px\)/s,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*720px\)[\s\S]*?\.user-session-bar--conversation\s*>\s*span:first-child\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*720px\)[\s\S]*?\.user-session-bar\s*\+\s*\.conversation-screen\s*\{[^}]*--conversation-account-inset:\s*92px/s,
  );
});
