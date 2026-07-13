/* global process, URL */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const [major = "0", minor = "0"] = String(manifest.version ?? "0.0.0").split(".");
const commitCount = gitValue(["rev-list", "--count", "HEAD"], "0").replace(
  /\D/g,
  "",
);
const version = `${major}.${minor}.${commitCount || "0"}`;
const commitSha = gitValue(["rev-parse", "--short=7", "HEAD"], "local");

const result = spawnSync(
  "lk",
  [
    "agent",
    "deploy",
    "--secrets",
    `PARROT_AGENT_VERSION=${version}`,
    "--secrets",
    `PARROT_AGENT_COMMIT_SHA=${commitSha}`,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
