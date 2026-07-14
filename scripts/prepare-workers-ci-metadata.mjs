/* global process, URL */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readBuildMetadata } from "./build-metadata.mjs";

function executeGit(args, { cwd } = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

export function ensureWorkersCiHistory({
  cwd,
  env = process.env,
  runGit = (args) => executeGit(args, { cwd }),
} = {}) {
  if (env.WORKERS_CI !== "1") return false;
  if (runGit(["rev-parse", "--is-shallow-repository"]) !== "true") {
    return false;
  }

  const branch = env.WORKERS_CI_BRANCH?.trim();
  if (!branch) {
    throw new Error("Workers CI branch is required to fetch build history.");
  }
  runGit([
    "fetch",
    "--unshallow",
    "--filter=blob:none",
    "--no-tags",
    "origin",
    `refs/heads/${branch}`,
  ]);
  return true;
}

export function injectWorkersCiMetadata(configSource, { commitSha, version }) {
  const config = JSON.parse(configSource);
  return `${JSON.stringify(
    {
      ...config,
      vars: {
        ...config.vars,
        PARROT_BACKEND_COMMIT_SHA: commitSha,
        PARROT_BACKEND_VERSION: version,
      },
    },
    null,
    2,
  )}\n`;
}

export function prepareWorkersCiMetadata({
  configUrl = new URL("../wrangler.jsonc", import.meta.url),
  env = process.env,
} = {}) {
  if (env.WORKERS_CI !== "1") return false;

  ensureWorkersCiHistory({ env });
  const metadata = readBuildMetadata({ env });
  const configSource = readFileSync(configUrl, "utf8");
  writeFileSync(configUrl, injectWorkersCiMetadata(configSource, metadata));
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareWorkersCiMetadata();
}
