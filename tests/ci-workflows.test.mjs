import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const verificationUrl = new URL(
  "../.github/workflows/verify-pr.yml",
  import.meta.url,
);
const deploymentUrl = new URL(
  "../.github/workflows/deploy-cloudflare.yml",
  import.meta.url,
);

test("pull requests run one complete verification job including lifecycle tests", () => {
  assert.equal(
    existsSync(verificationUrl),
    true,
    "Expected a pull-request verification workflow.",
  );
  const workflow = readFileSync(verificationUrl, "utf8");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /node-version: ["']22["']/);
  assert.match(workflow, /cache: npm/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /name: Run tests including mounted lifecycle/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run build/);
  assert.doesNotMatch(workflow, /npm run test:lifecycle/);
  assert.equal((workflow.match(/^ {2}verify:/gm) ?? []).length, 1);
});

test("main deployment does not repeat the pull-request verification sequence", () => {
  const workflow = readFileSync(deploymentUrl, "utf8");

  assert.match(workflow, /push:\s+branches:\s+- main/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /Verify Cloudflare credentials/);
  assert.match(workflow, /wrangler d1 migrations apply/);
  assert.match(workflow, /npm run deploy:worker/);
  assert.doesNotMatch(workflow, /run: npm test/);
  assert.doesNotMatch(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run build/);
});
