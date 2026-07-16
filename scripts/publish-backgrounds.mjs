/* global process */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createBackgroundPublishPlan,
  inspectBackgroundPublishFiles,
  verifyBackgroundCatalogMedia,
} from "./background-media.mjs";

function parseArguments(args) {
  let apply = false;
  let manifestFile;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--manifest") {
      manifestFile = args[index + 1];
      index += 1;
      if (!manifestFile) throw new Error("--manifest requires a file path");
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!manifestFile) throw new Error("--manifest is required");
  return { apply, manifestFile };
}

function requireEnvironmentValue(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be set`);
  }
  return value.trim();
}

function runProcess(command, args, { cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function createGetArguments(upload) {
  return [
    "wrangler",
    "r2",
    "object",
    "get",
    `${upload.bucket}/${upload.key}`,
    "--pipe",
    "--remote",
  ];
}

function createPutArguments(upload, cwd) {
  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${upload.bucket}/${upload.key}`,
    "--file",
    path.resolve(cwd, upload.file),
    "--content-type",
    upload.contentType,
    "--remote",
  ];
  if (upload.cacheControl) {
    args.push("--cache-control", upload.cacheControl);
  }
  return args;
}

function isMissingObjectError(stderr) {
  return /does not exist|NoSuchKey|\b404\b/i.test(stderr);
}

async function readManifest(filename) {
  let source;
  try {
    source = await readFile(filename, "utf8");
  } catch (error) {
    throw new Error(`Could not read manifest ${filename}: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`Manifest ${filename} must contain valid JSON`);
  }
}

export async function runBackgroundPublisher({
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  fetch = globalThis.fetch,
  runCommand = runProcess,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const { apply, manifestFile } = parseArguments(args);
  const options = {
    mediaOrigin: requireEnvironmentValue(env, "PARROT_MEDIA_ORIGIN"),
    publicBucket: requireEnvironmentValue(
      env,
      "PARROT_MEDIA_PUBLIC_BUCKET",
    ),
    sourceBucket: requireEnvironmentValue(
      env,
      "PARROT_MEDIA_SOURCE_BUCKET",
    ),
  };
  const manifestPath = path.resolve(cwd, manifestFile);
  const manifest = await readManifest(manifestPath);
  const plan = createBackgroundPublishPlan(manifest, options);
  const inspected = await inspectBackgroundPublishFiles(plan, { cwd });

  if (!apply) {
    writeOutput(
      `Dry run: ${plan.uploads.length} objects validated from ${inspected.length} assets.\n`,
    );
    writeOutput(`${JSON.stringify(plan.catalogEntries, null, 2)}\n`);
    return {
      applied: false,
      catalogEntries: plan.catalogEntries,
      uploadCount: plan.uploads.length,
    };
  }

  for (const upload of plan.uploads) {
    const result = runCommand(
      "npm",
      ["exec", "--offline", "--", ...createGetArguments(upload)],
      { cwd },
    );
    if (result.status === 0) {
      throw new Error(
        `${upload.bucket}/${upload.key} already exists; increment the asset version`,
      );
    }
    if (!isMissingObjectError(result.stderr)) {
      throw new Error(
        `Could not preflight ${upload.bucket}/${upload.key}: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    }
  }

  for (const upload of plan.uploads) {
    const result = runCommand(
      "npm",
      ["exec", "--offline", "--", ...createPutArguments(upload, cwd)],
      { cwd },
    );
    if (result.status !== 0) {
      throw new Error(
        `Could not upload ${upload.bucket}/${upload.key}: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    }
    writeOutput(`Uploaded ${upload.bucket}/${upload.key}\n`);
  }

  const verification = await verifyBackgroundCatalogMedia(
    plan.catalogEntries,
    {
      fetch,
      mediaOrigin: plan.mediaOrigin,
    },
  );
  writeOutput(
    `Published and verified ${verification.verified.length} backgrounds.\n`,
  );
  writeOutput(`${JSON.stringify(plan.catalogEntries, null, 2)}\n`);
  return {
    applied: true,
    catalogEntries: plan.catalogEntries,
    uploadCount: plan.uploads.length,
    verified: verification.verified,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runBackgroundPublisher().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
