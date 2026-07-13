import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const app = source("../src/App.tsx");
const authGate = source("../src/AuthGate.tsx");
const conversation = source("../src/ConversationSurface.tsx");
const designSystem = source("../src/design-system.css");
const lessonList = source("../src/LessonList.tsx");
const styles = source("../src/styles.css");

test("global CSS owns the shared type, color, size, radius, and shadow tokens", () => {
  assert.match(styles, /@import\s+["']\.\/design-system\.css["']/);
  assert.match(designSystem, /@theme\s*\{/);

  for (const token of [
    "--font-ui",
    "--color-brand-navy",
    "--color-brand-pink",
    "--color-brand-green",
    "--radius-control",
    "--shadow-control-navy",
    "--shadow-control-pink",
    "--app-header-control-size",
    "--app-header-top",
  ]) {
    assert.match(designSystem, new RegExp(token), token);
  }

  assert.match(designSystem, /\.app-button\s*\{/);
  assert.match(designSystem, /font-family:\s*var\(--font-ui\)/);
  assert.match(styles, /font-family:\s*var\(--font-ui\)/);
});

test("the account header uses one route-independent CSS implementation", () => {
  assert.doesNotMatch(authGate, /SESSION_[A-Z_]+_CLASSES/);
  assert.doesNotMatch(authGate, /:has|group-has|conversation-screen/);
  assert.match(authGate, /className="app-header-account"/);
  assert.match(authGate, /className="app-header-account-label"/);
  assert.match(authGate, /app-button app-button--account/);

  assert.match(designSystem, /\.app-header-account\s*\{/);
  assert.match(
    designSystem,
    /\.app-header-account[\s\S]*?top:\s*var\(--app-header-top\)/,
  );
  assert.match(
    designSystem,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.app-header-account-label\s*\{[\s\S]*?display:\s*none/,
  );
});

test("every top-level navigation control uses the same header primitive", () => {
  assert.match(conversation, /conversation-back-button app-header-control/);
  assert.match(lessonList, /lesson-main-menu-link app-header-control/);
  assert.match(app, /lesson-list-back-button app-header-control/);
  assert.match(app, /lesson-home-button app-header-control/);
  assert.doesNotMatch(conversation, /BACK_BUTTON_CLASSES|ACTION_BUTTON_FOCUS_CLASSES/);

  assert.match(designSystem, /\.app-header-control\s*\{/);
  assert.match(
    designSystem,
    /\.app-header-control[\s\S]*?min-height:\s*var\(--app-header-control-size\)/,
  );
});

test("shared buttons consume named variants without changing the global font", () => {
  assert.match(authGate, /app-button--surface/);
  assert.match(authGate, /app-button--brand/);
  assert.match(conversation, /app-button--success/);
  assert.match(conversation, /app-button--large app-button--brand/);
  assert.match(conversation, /app-button--large app-button--surface/);
  assert.doesNotMatch(authGate, /font-\[|bg-\[#|shadow-\[/);
  assert.doesNotMatch(conversation, /font-\[950\]|bg-\[#(?:204c7f|ff467b|087451)\]/);
});
