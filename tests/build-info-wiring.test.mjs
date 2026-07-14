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
  const buildInfo = readFileSync(
    new URL("../worker/build-info.ts", import.meta.url),
    "utf8",
  );
  const lessonGenerator = readFileSync(
    new URL("../worker/lesson-generator.ts", import.meta.url),
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
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const wrangler = readFileSync(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  );
  const agentDeploy = readFileSync(
    new URL("../scripts/deploy-livekit-agent.mjs", import.meta.url),
    "utf8",
  );
  const workerDeploy = readFileSync(
    new URL("../scripts/deploy-cloudflare-worker.mjs", import.meta.url),
    "utf8",
  );
  const workersCiPrepare = readFileSync(
    new URL("../scripts/prepare-workers-ci-metadata.mjs", import.meta.url),
    "utf8",
  );

  assert.match(header, />\s*About\s*</s);
  assert.match(about, /About Parrot English/);
  assert.match(about, /\/api\/build-info/);
  assert.match(about, /Lesson script LLM/);
  assert.match(about, /Realtime voice model/);
  assert.match(about, /Input transcription/);
  assert.match(worker, /\/api\/build-info/);
  assert.match(buildInfo, /LESSON_GENERATOR_MODEL/);
  assert.match(lessonGenerator, /LESSON_GENERATOR_MODEL/);
  assert.match(agent, /reportBuild/);
  assert.match(agent, /await ingest\.reportBuild/);
  assert.equal(manifest.scripts["deploy:worker"], "node scripts/deploy-cloudflare-worker.mjs");
  assert.equal(manifest.scripts.prebuild, "node scripts/prepare-workers-ci-metadata.mjs");
  assert.match(workflow, /npm run deploy:worker/);
  assert.match(workerDeploy, /PARROT_BACKEND_VERSION/);
  assert.match(workerDeploy, /PARROT_BACKEND_COMMIT_SHA/);
  assert.match(workersCiPrepare, /WORKERS_CI/);
  assert.match(workersCiPrepare, /ensureWorkersCiHistory\(\{ env \}\)/);
  assert.match(workerDeploy, /"REALTIME_CONVERSATIONS_ENABLED:1"/);
  assert.match(wrangler, /version_metadata/);
  assert.doesNotMatch(wrangler, /"PARROT_BACKEND_(?:COMMIT_SHA|VERSION)": "local"/);
  assert.match(agentDeploy, /PARROT_AGENT_VERSION/);
  assert.match(agentDeploy, /PARROT_AGENT_COMMIT_SHA/);
});
