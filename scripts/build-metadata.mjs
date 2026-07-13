/* global process, URL */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function gitValue(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function createBuildMetadata({
  commitCount,
  commitSha,
  packageVersion,
}) {
  const versionMatch = String(packageVersion).match(SEMVER_PATTERN);
  if (!versionMatch) throw new Error("package.json must contain a semver version.");

  const normalizedCount = String(commitCount).trim();
  if (!/^\d+$/.test(normalizedCount)) {
    throw new Error("Git commit count must be available for deployment.");
  }

  const normalizedSha = String(commitSha).trim().toLowerCase();
  if (!GIT_SHA_PATTERN.test(normalizedSha)) {
    throw new Error("Git commit SHA must be available for deployment.");
  }

  const [, major, minor] = versionMatch;
  return {
    commitSha: normalizedSha.slice(0, 7),
    version: `${major}.${minor}.${Number(normalizedCount)}`,
  };
}

export function readBuildMetadata() {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  return createBuildMetadata({
    commitCount: gitValue(["rev-list", "--count", "HEAD"]),
    commitSha: process.env.GITHUB_SHA || gitValue(["rev-parse", "HEAD"]),
    packageVersion: manifest.version,
  });
}
