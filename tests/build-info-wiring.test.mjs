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
  writeFileSync(
    join(binDirectory, "git"),
    `#!/bin/sh
case "$*" in
  "rev-list --count HEAD") printf '42\\n' ;;
  "rev-parse HEAD") printf 'abcdef0123456789abcdef0123456789abcdef01\\n' ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o755 },
  );
  context.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

  const env = {
    ...process.env,
    PARROT_DEPLOY_ARGS: argumentsPath,
    PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
  };
  delete env.GITHUB_SHA;
  delete env.WORKERS_CI_COMMIT_SHA;
  execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    cwd: projectRoot,
    env,
    stdio: "pipe",
  });

  return readFileSync(argumentsPath, "utf8").trim().split("\n");
}

test("Worker deployment sends release metadata and enables realtime conversations", (context) => {
  const arguments_ = captureDeploymentArguments(
    context,
    "npx",
    "../scripts/deploy-cloudflare-worker.mjs",
  );

  assert.deepEqual(arguments_, [
    "wrangler",
    "deploy",
    "--config",
    "wrangler.jsonc",
    "--tag",
    "v0.1.42-abcdef0",
    "--var",
    "PARROT_BACKEND_VERSION:0.1.42",
    "--var",
    "PARROT_BACKEND_COMMIT_SHA:abcdef0",
    "--var",
    "REALTIME_CONVERSATIONS_ENABLED:1",
  ]);
});

test("conversation-agent deployment sends its release identity as secrets", (context) => {
  const arguments_ = captureDeploymentArguments(
    context,
    "lk",
    "../scripts/deploy-livekit-agent.mjs",
  );

  assert.deepEqual(arguments_, [
    "agent",
    "deploy",
    "--secrets",
    "PARROT_AGENT_VERSION=0.1.42",
    "--secrets",
    "PARROT_AGENT_COMMIT_SHA=abcdef0",
  ]);
});
