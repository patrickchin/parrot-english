import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const viteConfig = readFileSync(
  new URL("../vite.config.ts", import.meta.url),
  "utf8"
);
const viteEnv = readFileSync(new URL("../src/vite-env.d.ts", import.meta.url), "utf8");
const deployWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8"
);

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected to find CSS rule for ${selector}`);
  return match[1];
}

describe("visual build versioning", () => {
  it("injects a commit-count app version and short commit SHA at build time", () => {
    assert.match(viteConfig, /git rev-list --count HEAD/);
    assert.match(viteConfig, /git rev-parse --short=7 HEAD/);
    assert.match(viteConfig, /VITE_PARROT_APP_VERSION/);
    assert.match(viteConfig, /VITE_PARROT_COMMIT_SHA/);
  });

  it("types the public version fields exposed to the React app", () => {
    assert.match(viteEnv, /readonly VITE_PARROT_APP_VERSION: string/);
    assert.match(viteEnv, /readonly VITE_PARROT_COMMIT_SHA: string/);
  });

  it("renders a visible version badge with the app version and commit SHA", () => {
    assert.match(app, /versionLabel/);
    assert.match(app, /build-version-badge/);
    assert.match(app, /aria-label=\{`Build version \$\{versionLabel\}`\}/);

    const badgeRule = getRule(".build-version-badge");
    assert.match(badgeRule, /grid-column:\s*1 \/ -1/);
    assert.match(badgeRule, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.82\)/);
  });

  it("fetches full history in CI so the commit-count version can increase", () => {
    assert.match(deployWorkflow, /fetch-depth:\s*0/);
  });
});
