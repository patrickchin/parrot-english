/* global process */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function captureDeploymentArguments(context, command, script) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "parrot-deploy-contract-"));
  const binDirectory = join(temporaryRoot, "bin");
  const argumentsPath = join(temporaryRoot, "arguments.txt");
  mkdirSync(binDirectory);
  writeFileSync(
    join(binDirectory, command),
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$PARROT_DEPLOY_ARGS"\n',
    { mode: 0o755 },
  );
  context.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

  execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PARROT_DEPLOY_ARGS: argumentsPath,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: "pipe",
  });

  return readFileSync(argumentsPath, "utf8").trim().split("\n");
}

function optionValues(arguments_, option) {
  return arguments_.flatMap((argument, index) =>
    argument === option ? [arguments_[index + 1]] : [],
  );
}

test("Worker deployment sends release metadata and enables realtime conversations", (context) => {
  const arguments_ = captureDeploymentArguments(
    context,
    "npx",
    "../scripts/deploy-cloudflare-worker.mjs",
  );

  assert.deepEqual(arguments_.slice(0, 4), [
    "wrangler",
    "deploy",
    "--config",
    "wrangler.jsonc",
  ]);
  const tag = optionValues(arguments_, "--tag")[0];
  assert.match(tag, /^v(\d+\.\d+\.\d+)-([0-9a-f]{7})$/);
  const [, version, commitSha] = tag.match(
    /^v(\d+\.\d+\.\d+)-([0-9a-f]{7})$/,
  );
  assert.deepEqual(optionValues(arguments_, "--var"), [
    `PARROT_BACKEND_VERSION:${version}`,
    `PARROT_BACKEND_COMMIT_SHA:${commitSha}`,
    "REALTIME_CONVERSATIONS_ENABLED:1",
  ]);
});

test("conversation-agent deployment sends its release identity as secrets", (context) => {
  const arguments_ = captureDeploymentArguments(
    context,
    "lk",
    "../scripts/deploy-livekit-agent.mjs",
  );

  assert.deepEqual(arguments_.slice(0, 2), ["agent", "deploy"]);
  const secrets = optionValues(arguments_, "--secrets");
  assert.equal(secrets.length, 2);
  assert.match(secrets[0], /^PARROT_AGENT_VERSION=\d+\.\d+\.\d+$/);
  assert.match(secrets[1], /^PARROT_AGENT_COMMIT_SHA=[0-9a-f]{7}$/);
});
