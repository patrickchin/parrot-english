import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const viteConfig = readFileSync(
  new URL("../vite.config.ts", import.meta.url),
  "utf8"
);
const viteEnv = readFileSync(new URL("../src/vite-env.d.ts", import.meta.url), "utf8");
const deployWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8"
);

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

  it("fetches full history in CI so the commit-count version can increase", () => {
    assert.match(deployWorkflow, /fetch-depth:\s*0/);
  });
});
