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
  const expansionSha = commitAll(root, "expansion");
  writeRepoFile(
    root,
    "migrations/0014_personalized_art_deletion_closure.sql",
    "-- durable candidate closure migration\n",
  );
  const deletionClosureSha = commitAll(root, "deletion closure");
  writeRepoFile(
    root,
    "migrations/0015_learner_profile_deletion.sql",
    "-- durable learner-deletion state migration\n",
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

  return {
    root,
    compatibilitySha,
    deletionClosureSha,
    expansionSha,
    foreignSha,
    headSha,
    initialSha,
  };
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

function workflowSteps(url) {
  const steps = [];
  let currentStep;
  let multilineRunIndent;
  let stepIndent;
  let stepPropertyIndent;

  for (const line of readFileSync(url, "utf8").split(/\r?\n/u)) {
    const item = line.match(/^(\s*)-(?:\s+(.+?))?\s*$/u);
    const name = item?.[2]?.match(/^name:\s*(.+?)\s*$/u)?.[1];
    if (name && stepIndent === undefined) stepIndent = item[1].length;
    if (item && item[1].length === stepIndent) {
      if (currentStep) steps.push(currentStep);
      currentStep = { name, run: [] };
      multilineRunIndent = undefined;
      stepPropertyIndent = stepIndent + 2;
      continue;
    }
    if (!currentStep) continue;

    const property = line.match(/^(\s*)(if|continue-on-error):\s*(.*?)\s*$/u);
    if (property && property[1].length === stepPropertyIndent) {
      currentStep[property[2] === "if" ? "if" : "continueOnError"] = property[3];
      continue;
    }

    const run = line.match(/^(\s*)run:\s*(.*?)\s*$/u);
    if (run) {
      multilineRunIndent = run[2] === "|" ? run[1].length : undefined;
      if (run[2] !== "|") currentStep.run.push(run[2]);
      continue;
    }
    if (multilineRunIndent !== undefined) {
      const indent = line.match(/^\s*/u)[0].length;
      if (line.trim() && indent > multilineRunIndent) {
        currentStep.run.push(line.trim());
      } else if (line.trim()) {
        multilineRunIndent = undefined;
      }
    }
  }
  if (currentStep) steps.push(currentStep);
  return steps;
}

function stepRunning(steps, command) {
  return steps.findIndex(({ run }) => run.includes(command));
}

function assertRequiredWorkflowStep(step, label) {
  assert.equal(step.if, undefined, `Expected ${label} to be unconditional.`);
  assert.ok(
    step.continueOnError === undefined || step.continueOnError === "false",
    `Expected ${label} failure to stop the workflow.`,
  );
}

function deploymentWorkflowWithCheckSetting(context, setting) {
  const root = mkdtempSync(join(tmpdir(), "parrot-deploy-workflow-"));
  const workflowPath = join(root, "deploy-cloudflare.yml");
  const workflow = readFileSync(deploymentUrl, "utf8");
  const variant = workflow.replace(
    "      - name: Check generated content catalogs\n"
      + "        run: npm run check:content-catalogs",
    "      - name: Check generated content catalogs\n"
      + `        ${setting}\n`
      + "        run: npm run check:content-catalogs",
  );
  assert.notEqual(variant, workflow, "Expected to mutate the catalog-check step.");
  writeFileSync(workflowPath, variant);
  context.after(() => rmSync(root, { force: true, recursive: true }));
  return workflowPath;
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
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /name: Run tests including mounted lifecycle/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run build/);
  assert.doesNotMatch(workflow, /npm run test:lifecycle/);
  assert.equal((workflow.match(/^ {2}verify:/gm) ?? []).length, 1);
});

test("pull requests install FFmpeg before media integrity tests run", () => {
  const steps = workflowSteps(verificationUrl);
  const installIndex = stepRunning(steps, "sudo apt-get install --yes ffmpeg");
  const testIndex = stepRunning(steps, "npm test");

  assert.notEqual(installIndex, -1, "Expected FFmpeg installation in CI.");
  assert.ok(installIndex < testIndex, "Expected FFmpeg before npm test.");
});

test("deployment checks all generated content after FFmpeg and before publishing media", () => {
  const steps = workflowSteps(deploymentUrl);
  const installIndex = stepRunning(steps, "sudo apt-get install --yes ffmpeg");
  const checkIndex = stepRunning(steps, "npm run check:content-catalogs");
  const publishIndex = stepRunning(steps, "npm run publish:static-media -- --apply");

  assert.notEqual(installIndex, -1, "Expected FFmpeg installation before catalog checks.");
  assert.notEqual(checkIndex, -1, "Expected an explicit generated-catalog check.");
  assert.notEqual(publishIndex, -1, "Expected immutable media publishing.");
  assert.ok(installIndex < checkIndex, "Expected FFmpeg before the catalog check.");
  assert.ok(checkIndex < publishIndex, "Expected the catalog check before publishing.");
  assertRequiredWorkflowStep(steps[checkIndex], "the generated-catalog check");
});

test("unnamed following steps do not lend their conditions to the catalog check", (context) => {
  const root = mkdtempSync(join(tmpdir(), "parrot-workflow-steps-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));

  for (const [syntax, step] of Object.entries({
    inline: "      - uses: actions/cache@v4",
    standalone: "      -\n        uses: actions/cache@v4",
  })) {
    const workflowPath = join(root, `${syntax}.yml`);
    writeFileSync(workflowPath, `jobs:
  deploy:
    steps:
      - name: Check generated content catalogs
        run: npm run check:content-catalogs
${step}
        if: false
        with:
          path: |
            public/assets
            - nested-content
          key: fixture
`);

    const steps = workflowSteps(workflowPath);
    const checkIndex = stepRunning(steps, "npm run check:content-catalogs");
    assert.notEqual(checkIndex, -1, syntax);
    assertRequiredWorkflowStep(steps[checkIndex], `${syntax} generated-catalog check`);
    assert.equal(steps.length, 2, `Expected exact-indent ${syntax} workflow steps.`);
  }
});

test("deployment guard rejects a conditional generated-catalog check", (context) => {
  const steps = workflowSteps(
    deploymentWorkflowWithCheckSetting(context, "if: false"),
  );
  const checkIndex = stepRunning(steps, "npm run check:content-catalogs");
  assert.notEqual(checkIndex, -1);

  assert.throws(
    () => assertRequiredWorkflowStep(steps[checkIndex], "the generated-catalog check"),
    /unconditional/,
  );
});

test("deployment guard rejects a non-fatal generated-catalog check", (context) => {
  const steps = workflowSteps(
    deploymentWorkflowWithCheckSetting(context, "continue-on-error: true"),
  );
  const checkIndex = stepRunning(steps, "npm run check:content-catalogs");
  assert.notEqual(checkIndex, -1);

  assert.throws(
    () => assertRequiredWorkflowStep(steps[checkIndex], "the generated-catalog check"),
    /failure to stop the workflow/,
  );
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

test("enable release retains every multi-learner migration", () => {
  for (const migration of [
    "0012_multi_learner_expand.sql",
    "0013_multi_learner_enable.sql",
    "0014_personalized_art_deletion_closure.sql",
    "0015_learner_profile_deletion.sql",
  ]) {
    assert.equal(
      existsSync(new URL(`../migrations/${migration}`, import.meta.url)),
      true,
      migration,
    );
  }
});

test("enable release turns on roster mutations", () => {
  const wrangler = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const workerConfiguration = readFileSync(
    new URL("../worker-configuration.d.ts", import.meta.url),
    "utf8",
  );

  assert.equal(wrangler.vars.MULTI_LEARNER_PROFILES_ENABLED, "1");
  assert.match(
    workerConfiguration,
    /^\s*MULTI_LEARNER_PROFILES_ENABLED: "1";$/m,
  );
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
      name: "ancestor without the guarded art-deletion closure",
      env: { [variableName]: repository.expansionSha },
      expectedStatus: 1,
      expectedStderr:
        /must include migrations\/0014_personalized_art_deletion_closure\.sql/,
    },
    {
      name: "enable commit reused as the compatibility release",
      env: { [variableName]: repository.headSha },
      expectedStatus: 1,
      expectedStderr: /must not already include migrations\/0013_multi_learner_enable\.sql/,
    },
    {
      name: "ancestor without learner-deletion state",
      env: { [variableName]: repository.deletionClosureSha },
      expectedStatus: 1,
      expectedStderr:
        /must include migrations\/0015_learner_profile_deletion\.sql/,
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
