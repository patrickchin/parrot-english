/* global process, URL */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readBuildMetadata } from "./build-metadata.mjs";

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

  const metadata = readBuildMetadata({ env });
  const configSource = readFileSync(configUrl, "utf8");
  writeFileSync(configUrl, injectWorkersCiMetadata(configSource, metadata));
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareWorkersCiMetadata();
}
