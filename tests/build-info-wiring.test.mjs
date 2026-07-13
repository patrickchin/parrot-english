import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the account About panel is wired to deployed component metadata", () => {
  const header = readFileSync(
    new URL("../src/app/AppHeader.tsx", import.meta.url),
    "utf8",
  );
  const about = readFileSync(
    new URL("../src/app/AboutDialog.tsx", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  const agent = readFileSync(
    new URL("../agent/index.ts", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
    "utf8",
  );
  const wrangler = readFileSync(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  );
  const agentDeploy = readFileSync(
    new URL("../scripts/deploy-livekit-agent.mjs", import.meta.url),
    "utf8",
  );

  assert.match(header, />\s*About\s*</s);
  assert.match(about, /About Parrot English/);
  assert.match(about, /\/api\/build-info/);
  assert.match(worker, /\/api\/build-info/);
  assert.match(agent, /reportBuild/);
  assert.match(workflow, /PARROT_BACKEND_VERSION/);
  assert.match(workflow, /PARROT_BACKEND_COMMIT_SHA/);
  assert.match(wrangler, /version_metadata/);
  assert.match(agentDeploy, /PARROT_AGENT_VERSION/);
  assert.match(agentDeploy, /PARROT_AGENT_COMMIT_SHA/);
});
