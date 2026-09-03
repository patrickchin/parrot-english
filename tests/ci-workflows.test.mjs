import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const verificationUrl = new URL(
  "../.github/workflows/verify-pr.yml",
  import.meta.url,
);
const deploymentUrl = new URL(
  "../.github/workflows/deploy-production.yml",
  import.meta.url,
);
const workflowsUrl = new URL("../.github/workflows/", import.meta.url);

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
  assert.match(workflow, /node-version: ["']24["']/);
  assert.match(workflow, /cache: npm/);
  assert.match(workflow, /run: npm ci/);
  const verifyJobs = workflow.match(
    /^ {2}verify:\r?\n(?:(?!^ {2}\S)[\s\S])*/gmu,
  ) ?? [];
  assert.equal(verifyJobs.length, 1, "Expected exactly one verify job.");
  const timeoutValues = [
    ...verifyJobs[0].matchAll(/^ {4}timeout-minutes:\s*(\d+)\s*$/gmu),
  ].map((match) => match[1]);
  assert.equal(
    timeoutValues.length,
    1,
    "Expected exactly one timeout for the verify job.",
  );
  assert.match(timeoutValues[0], /^\d+$/u);
  const timeoutMinutes = Number(timeoutValues[0]);
  assert.ok(
    timeoutMinutes >= 30,
    "Expected pull-request verification to allow at least 30 minutes.",
  );
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
  assert.doesNotMatch(workflow, /workflow_dispatch|media_only/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /Verify Cloudflare credentials/);
  assert.match(workflow, /wrangler d1 migrations apply/);
  assert.match(workflow, /npm run deploy:worker/);
  assert.doesNotMatch(workflow, /run: npm test/);
  assert.doesNotMatch(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run build/);
});

test("no production workflow can be dispatched from a feature branch", () => {
  const deployingWorkflows = readdirSync(workflowsUrl)
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => [name, readFileSync(new URL(name, workflowsUrl), "utf8")])
    .filter(([, workflow]) => /(?:deploy:worker|wrangler deploy)/u.test(workflow));

  assert.deepEqual(deployingWorkflows.map(([name]) => name), ["deploy-production.yml"]);
  assert.doesNotMatch(deployingWorkflows[0][1], /workflow_dispatch/u);
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

test("deployment retains every applied multi-learner migration", () => {
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
