import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

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
test("ending a learner turn immediately exposes Peppa's response-loading state", () => {
  const controller = source("../src/useConversationOnboarding.ts");
  const surface = source("../src/ConversationSurface.tsx");

  assert.match(controller, /setStatus\(["']thinking["']\)/);
  assert.match(surface, /status === ["']thinking["']/);
  assert.match(surface, /Peppa is thinking/);
  assert.match(surface, /Getting her reply ready/);
});
