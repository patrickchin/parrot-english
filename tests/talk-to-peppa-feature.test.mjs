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
  const conversationSurface = source("../src/ConversationSurface.tsx");
  const styles = source("../src/styles.css");

  assert.doesNotMatch(app, /compactSessionBar/);
  assert.match(
    authGate,
    /max-\[720px\]:\[&:has\(\+_\.conversation-screen\)\]:min-h-\[52px\]/,
  );
  assert.match(
    authGate,
    /\[@media\(max-height:620px\)\]:\[&:has\(\+_\.conversation-screen\)\]:top-\[10px\]/,
  );
  assert.match(conversationSurface, /max-\[720px\]:pt-\[92px\]/);
  assert.match(conversationSurface, /after:content-\[''\]/);
  assert.doesNotMatch(styles, /\.user-session-bar/);
  assert.doesNotMatch(styles, /\.conversation-[a-z-]+\s*(?:[,{:]|::)/);
});
