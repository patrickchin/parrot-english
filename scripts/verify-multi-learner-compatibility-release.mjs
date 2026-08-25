#!/usr/bin/env node
/* global console, process */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const COMPATIBILITY_ENV = "MULTI_LEARNER_COMPATIBILITY_DEPLOYED";
const COMPATIBILITY_MIGRATION = "migrations/0012_multi_learner_expand.sql";
const ENABLE_MIGRATION = "migrations/0013_multi_learner_enable.sql";

function runGit(args, { cwd = process.cwd() } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result;
}

function requireGitSuccess(args, message, options) {
  const result = runGit(args, options);
  if (result.status === 0) return;
  const detail = result.stderr.trim();
  throw new Error(detail ? `${message}\nGit said: ${detail}` : message);
}

export function verifyMultiLearnerCompatibilityRelease({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  if (!existsSync(resolve(cwd, ENABLE_MIGRATION))) return;

  const revision = env[COMPATIBILITY_ENV];
  if (typeof revision !== "string" || revision.length === 0) {
    throw new Error(
      "Set MULTI_LEARNER_COMPATIBILITY_DEPLOYED to the deployed compatibility commit before applying 0013.",
    );
  }

  requireGitSuccess(
    ["cat-file", "-e", `${revision}^{commit}`],
    `${COMPATIBILITY_ENV} does not resolve to a Git commit. Record the deployed compatibility release from /api/build-info and try again.`,
    { cwd },
  );
  requireGitSuccess(
    ["merge-base", "--is-ancestor", revision, "HEAD"],
    `${COMPATIBILITY_ENV} must be an ancestor of HEAD so rollback never crosses the recorded compatibility release.`,
    { cwd },
  );
  requireGitSuccess(
    ["cat-file", "-e", `${revision}:${COMPATIBILITY_MIGRATION}`],
    `${COMPATIBILITY_ENV} must include ${COMPATIBILITY_MIGRATION} before applying 0013.`,
    { cwd },
  );

  if (
    runGit(["cat-file", "-e", `${revision}:${ENABLE_MIGRATION}`], { cwd }).status === 0
  ) {
    throw new Error(
      `${COMPATIBILITY_ENV} must not already include ${ENABLE_MIGRATION}; record the deployed compatibility release before 0013 instead.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyMultiLearnerCompatibilityRelease();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
