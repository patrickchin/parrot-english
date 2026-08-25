/* global process */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const verificationUrl = new URL(
  "../.github/workflows/verify-pr.yml",
  import.meta.url,
);
const deploymentUrl = new URL(
  "../.github/workflows/deploy-cloudflare.yml",
  import.meta.url,
);
const compatibilityGuardUrl = new URL(
  "../scripts/verify-multi-learner-compatibility-release.mjs",
  import.meta.url,
);

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function writeRepoFile(root, relativePath, contents) {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function commitAll(root, message) {
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "--quiet", "-m", message]);
  return runGit(root, ["rev-parse", "HEAD"]);
}

function createCompatibilityHistory(context, { includeEnableMigration = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "parrot-rollout-floor-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));

  runGit(root, ["init", "--quiet", "--initial-branch=main"]);
  runGit(root, ["config", "user.email", "test@example.test"]);
  runGit(root, ["config", "user.name", "Parrot Test"]);

  writeRepoFile(root, "README.md", "compatibility rollout fixture\n");
  const initialSha = commitAll(root, "initial");

  runGit(root, ["checkout", "--quiet", "-b", "side", initialSha]);
  writeRepoFile(root, "SIDE.txt", "side branch\n");
  const foreignSha = commitAll(root, "side");
  runGit(root, ["checkout", "--quiet", "main"]);

  writeRepoFile(
    root,
    "migrations/0012_multi_learner_expand.sql",
    "-- compatibility migration\n",
  );
  writeRepoFile(
    root,
    "wrangler.jsonc",
    `${JSON.stringify(
      {
        vars: {
          MULTI_LEARNER_PROFILES_ENABLED: "0",
        },
      },
      null,
      2,
    )}\n`,
  );
  const compatibilitySha = commitAll(root, "compatibility");

  let headSha = compatibilitySha;
  if (includeEnableMigration) {
    writeRepoFile(
      root,
      "migrations/0013_multi_learner_enable.sql",
      "-- enable migration\n",
    );
    writeRepoFile(
      root,
      "wrangler.jsonc",
      `${JSON.stringify(
        {
          vars: {
            MULTI_LEARNER_PROFILES_ENABLED: "1",
          },
        },
        null,
        2,
      )}\n`,
    );
    headSha = commitAll(root, "enable");
  }

  return { root, compatibilitySha, foreignSha, headSha, initialSha };
}

function runCompatibilityGuard(cwd, env = {}) {
  const childEnv = { ...process.env };
  if (!Object.hasOwn(env, "MULTI_LEARNER_COMPATIBILITY_DEPLOYED")) {
    delete childEnv.MULTI_LEARNER_COMPATIBILITY_DEPLOYED;
  }
  return spawnSync(process.execPath, [fileURLToPath(compatibilityGuardUrl)], {
    cwd,
    env: { ...childEnv, ...env },
    encoding: "utf8",
  });
}

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
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /Verify Cloudflare credentials/);
  assert.match(
    workflow,
    /MULTI_LEARNER_COMPATIBILITY_DEPLOYED:\s*\$\{\{\s*vars\.MULTI_LEARNER_COMPATIBILITY_DEPLOYED\s*\}\}/,
  );
  assert.match(workflow, /Verify multi-learner compatibility release/);
  assert.match(workflow, /verify-multi-learner-compatibility-release\.mjs/);
  assert.ok(
    workflow.indexOf("Verify multi-learner compatibility release") <
      workflow.indexOf("Apply D1 migrations"),
  );
  assert.match(workflow, /wrangler d1 migrations apply/);
  assert.match(workflow, /npm run deploy:worker/);
  assert.doesNotMatch(workflow, /run: npm test/);
  assert.doesNotMatch(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run build/);
});

test("lint ignores browser artifacts generated earlier in pull-request verification", async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL("../", import.meta.url)) });

  for (const artifact of [
    "playwright-report/trace/assets/code.js",
    "test-results/run/trace.zip",
  ]) {
    assert.equal(
      await eslint.isPathIgnored(fileURLToPath(new URL(`../${artifact}`, import.meta.url))),
      true,
      artifact,
    );
  }
});

test("compatibility guard allows compatibility deploys before the enable migration exists", (context) => {
  const repository = createCompatibilityHistory(context, {
    includeEnableMigration: false,
  });
  const result = runCompatibilityGuard(repository.root);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("compatibility guard enforces the rollback-floor invariants once the enable migration exists", (context) => {
  const repository = createCompatibilityHistory(context);
  const variableName = "MULTI_LEARNER_COMPATIBILITY_DEPLOYED";
  const cases = [
    {
      name: "missing compatibility acknowledgment",
      env: {},
      expectedStatus: 1,
      expectedStderr: /Set MULTI_LEARNER_COMPATIBILITY_DEPLOYED to the deployed compatibility commit before applying 0013\./,
    },
    {
      name: "unresolvable revision",
      env: { [variableName]: "not-a-commit" },
      expectedStatus: 1,
      expectedStderr: /does not resolve to a Git commit/,
    },
    {
      name: "non-ancestor compatibility release",
      env: { [variableName]: repository.foreignSha },
      expectedStatus: 1,
      expectedStderr: /must be an ancestor of HEAD/,
    },
    {
      name: "ancestor without migration 0012",
      env: { [variableName]: repository.initialSha },
      expectedStatus: 1,
      expectedStderr: /must include migrations\/0012_multi_learner_expand\.sql/,
    },
    {
      name: "enable commit reused as the compatibility release",
      env: { [variableName]: repository.headSha },
      expectedStatus: 1,
      expectedStderr: /must not already include migrations\/0013_multi_learner_enable\.sql/,
    },
    {
      name: "recorded compatibility ancestor",
      env: { [variableName]: repository.compatibilitySha },
      expectedStatus: 0,
      expectedStderr: /^$/,
    },
  ];

  for (const { name, env, expectedStatus, expectedStderr } of cases) {
    const result = runCompatibilityGuard(repository.root, env);

    assert.equal(
      result.status,
      expectedStatus,
      `${name}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    assert.match(result.stderr, expectedStderr, name);
  }
});
