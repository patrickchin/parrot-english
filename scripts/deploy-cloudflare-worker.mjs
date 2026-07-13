/* global process */

import { spawnSync } from "node:child_process";
import { readBuildMetadata } from "./build-metadata.mjs";

const { commitSha, version } = readBuildMetadata();
const result = spawnSync(
  "npx",
  [
    "wrangler",
    "deploy",
    "--config",
    "wrangler.jsonc",
    "--tag",
    `v${version}-${commitSha}`,
    "--var",
    `PARROT_BACKEND_VERSION:${version}`,
    "--var",
    `PARROT_BACKEND_COMMIT_SHA:${commitSha}`,
    "--var",
    "REALTIME_CONVERSATIONS_ENABLED:1",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
