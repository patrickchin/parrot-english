/* global process */

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  STATIC_MEDIA_ASSETS,
  createStaticMediaPublishPlan,
  ensureStaticMedia,
} from "./static-media.mjs";

function parseArguments(args) {
  let apply = false;
  for (const argument of args) {
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { apply };
}

function requireEnvironmentValue(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be set`);
  }
  return value.trim();
}

function runProcess(command, args, { cwd, input }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function createPutArguments(asset) {
  return [
    "exec",
    "--offline",
    "--",
    "wrangler",
    "r2",
    "object",
    "put",
    `${asset.bucket}/${asset.targetKey}`,
    "--pipe",
    "--remote",
    "--content-type",
    asset.contentType,
    "--cache-control",
    asset.cacheControl,
  ];
}

export async function runStaticMediaPublisher({
  args = process.argv.slice(2),
  assets = STATIC_MEDIA_ASSETS,
  cacheBust = randomUUID(),
  cwd = process.cwd(),
  env = process.env,
  fetch = globalThis.fetch,
  runCommand = runProcess,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const { apply } = parseArguments(args);
  const plan = createStaticMediaPublishPlan(assets, {
    bucket: requireEnvironmentValue(env, "PARROT_MEDIA_PUBLIC_BUCKET"),
    mediaOrigin: requireEnvironmentValue(env, "PARROT_MEDIA_ORIGIN"),
    sourceVersion: 2,
    targetVersion: 3,
  });
  if (!apply) {
    writeOutput(`Dry run: ${plan.length} static media objects planned.\n`);
    return { applied: false, published: [], verified: [] };
  }

  const result = await ensureStaticMedia(plan, {
    cacheBust,
    fetch,
    async putObject(asset, bytes) {
      const commandResult = runCommand(
        "npm",
        createPutArguments(asset),
        { cwd, input: bytes },
      );
      if (commandResult.status !== 0) {
        throw new Error(
          `Could not upload ${asset.bucket}/${asset.targetKey}: ${commandResult.stderr.trim() || `exit ${commandResult.status}`}`,
        );
      }
      writeOutput(`Uploaded ${asset.targetKey}\n`);
    },
  });
  writeOutput(
    `Published ${result.published.length} and verified ${result.verified.length} static media objects.\n`,
  );
  return { applied: true, ...result };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runStaticMediaPublisher().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
