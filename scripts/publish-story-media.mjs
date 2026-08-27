/* global URL, process */

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createStoryMediaPublishPlan,
  prepareStoryMediaUploads,
  verifyStoryMediaDelivery,
} from "./story-media.mjs";

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

function requireMediaOrigin(env) {
  const value = requireEnvironmentValue(env, "PARROT_MEDIA_ORIGIN");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PARROT_MEDIA_ORIGIN must be an absolute URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("PARROT_MEDIA_ORIGIN must contain only an https origin");
  }
  return url.origin;
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

function createGetArguments(upload) {
  return [
    "exec",
    "--offline",
    "--",
    "wrangler",
    "r2",
    "object",
    "get",
    `${upload.bucket}/${upload.key}`,
    "--pipe",
    "--remote",
  ];
}

function createPutArguments(upload) {
  const args = [
    "exec",
    "--offline",
    "--",
    "wrangler",
    "r2",
    "object",
    "put",
    `${upload.bucket}/${upload.key}`,
    "--pipe",
    "--remote",
    "--content-type",
    upload.contentType,
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

export async function runStoryMediaPublisher({
  args = process.argv.slice(2),
  cacheBust = randomUUID(),
  cwd = process.cwd(),
  env = process.env,
  fetch = globalThis.fetch,
  runCommand = runProcess,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const { apply, manifestFile } = parseArguments(args);
  const manifestPath = path.resolve(cwd, manifestFile);
  const manifest = await readManifest(manifestPath);
  const plan = createStoryMediaPublishPlan(manifest);
  const prepared = await prepareStoryMediaUploads(plan, { cwd });

  if (!apply) {
    writeOutput(
      `Dry run: ${prepared.assets.length} source images validated; ${prepared.uploads.length} objects planned.\n`,
    );
    return {
      applied: false,
      assetCount: prepared.assets.length,
      publicCount: prepared.publicOutputs.length,
      uploadCount: prepared.uploads.length,
    };
  }

  const mediaOrigin = requireMediaOrigin(env);
  const publicBucket = requireEnvironmentValue(
    env,
    "PARROT_MEDIA_PUBLIC_BUCKET",
  );
  const sourceBucket = requireEnvironmentValue(
    env,
    "PARROT_MEDIA_SOURCE_BUCKET",
  );
  const uploads = prepared.uploads.map((upload) => ({
    ...upload,
    bucket: upload.scope === "public" ? publicBucket : sourceBucket,
  }));
  const existing = [];
  const unavailable = [];

  for (const upload of uploads) {
    const result = runCommand("npm", createGetArguments(upload), {
      cwd,
      input: undefined,
    });
    if (result.status === 0) {
      existing.push(`${upload.bucket}/${upload.key}`);
    } else if (!isMissingObjectError(result.stderr)) {
      unavailable.push(
        `${upload.bucket}/${upload.key}: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    }
  }
  if (existing.length > 0) {
    throw new Error(
      `${existing.sort().join(", ")} already exists; increment the story media version`,
    );
  }
  if (unavailable.length > 0) {
    throw new Error(
      `Could not preflight story media:\n${unavailable
        .sort()
        .map((message) => `- ${message}`)
        .join("\n")}`,
    );
  }

  // Wrangler has no create-only R2 put. Keep this a single-writer operation:
  // if an upload fails after preflight, increment the manifest's media version
  // instead of retrying the partially consumed immutable key set.
  for (const upload of uploads) {
    const result = runCommand("npm", createPutArguments(upload), {
      cwd,
      input: upload.bytes,
    });
    if (result.status !== 0) {
      throw new Error(
        `Could not upload ${upload.bucket}/${upload.key}: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    }
    writeOutput(`Uploaded ${upload.bucket}/${upload.key}\n`);
  }

  const verification = await verifyStoryMediaDelivery(prepared, {
    cacheBust,
    fetch,
    mediaOrigin,
  });
  writeOutput(
    `Published ${uploads.length} and verified ${verification.verified.length} story media objects.\n`,
  );
  writeOutput(`${JSON.stringify(verification.mappings, null, 2)}\n`);
  return {
    applied: true,
    mappings: verification.mappings,
    uploadCount: uploads.length,
    verified: verification.verified,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runStoryMediaPublisher().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
