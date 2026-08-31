/* global URL, process */

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createWordGameMediaPublishPlan,
  prepareWordGameMediaUploads,
  verifyWordGameMediaDelivery,
} from "./word-game-media.mjs";

function parseArguments(args) {
  let apply = false;
  let dryRun = false;
  for (const argument of args) {
    if (argument === "--apply") apply = true;
    else if (argument === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (apply && dryRun) throw new Error("--apply and --dry-run cannot be combined");
  return { apply };
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

function getArguments(upload) {
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

function putArguments(upload) {
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

async function readManifest(cwd) {
  const filename = path.join(cwd, "content/media/word-games-v8.json");
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

async function preflightOrigin(publicOutputs, { cacheBust, fetch, mediaOrigin }) {
  const problems = await Promise.all(
    publicOutputs.map(async (output) => {
      const url = new URL(`${mediaOrigin}/${output.key}`);
      url.searchParams.set(
        "parrot-word-game-media-check",
        `preflight-${cacheBust}`,
      );
      let response;
      try {
        response = await fetch(url.href, {
          cache: "no-store",
          method: "GET",
          redirect: "error",
        });
      } catch (error) {
        return `${output.key} could not be requested: ${error.message}`;
      }
      if (response.status === 404) return null;
      if (response.status === 200) {
        return `${output.key} origin already exists (HTTP 200)`;
      }
      return `${output.key} origin absence is unknown (HTTP ${response.status})`;
    }),
  );
  return problems.filter(Boolean).sort();
}

export async function runWordGameMediaPublisher({
  args = process.argv.slice(2),
  cacheBust = randomUUID(),
  cwd = process.cwd(),
  env = process.env,
  fetch = globalThis.fetch,
  runCommand = runProcess,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const { apply } = parseArguments(args);
  const manifest = await readManifest(cwd);
  const plan = createWordGameMediaPublishPlan(manifest);
  const prepared = await prepareWordGameMediaUploads(plan, { cwd });

  if (!apply) {
    writeOutput(
      `Dry run: ${prepared.publicOutputs.length} public and ${prepared.privateUploads.length} private word-game objects planned (${prepared.uploads.length} total).\n`,
    );
    return {
      applied: false,
      privateCount: prepared.privateUploads.length,
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
  if (typeof fetch !== "function") throw new Error("fetch must be available");
  const uploads = prepared.uploads.map((upload) => ({
    ...upload,
    bucket: upload.scope === "public" ? publicBucket : sourceBucket,
  }));
  const existing = [];
  const unavailable = [];

  for (const upload of uploads) {
    const objectName = `${upload.bucket}/${upload.key}`;
    let result;
    try {
      result = runCommand("npm", getArguments(upload), {
        cwd,
        input: undefined,
      });
    } catch (error) {
      unavailable.push(`${objectName}: ${error.message}`);
      continue;
    }
    if (result.status === 0) {
      existing.push(objectName);
    } else if (!isMissingObjectError(result.stderr)) {
      unavailable.push(
        `${objectName}: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    }
  }
  if (existing.length > 0) {
    throw new Error(
      `${existing.sort().join(", ")} already exists; use a new word-game media version`,
    );
  }
  if (unavailable.length > 0) {
    throw new Error(
      `Could not preflight word-game R2 objects:\n${unavailable
        .sort()
        .map((message) => `- ${message}`)
        .join("\n")}`,
    );
  }

  const originProblems = await preflightOrigin(prepared.publicOutputs, {
    cacheBust,
    fetch,
    mediaOrigin,
  });
  if (originProblems.length > 0) {
    throw new Error(
      `Word-game media origin preflight failed:\n${originProblems
        .map((problem) => `- ${problem}`)
        .join("\n")}`,
    );
  }

  // Wrangler has no create-only R2 put. Any failed apply consumes this version:
  // never retry or overwrite the partially uploaded immutable key set.
  for (const upload of uploads) {
    const result = runCommand("npm", putArguments(upload), {
      cwd,
      input: upload.bytes,
    });
    if (result.status !== 0) {
      throw new Error(
        `Could not upload ${upload.bucket}/${upload.key}: ${result.stderr.trim() || `exit ${result.status}`}. Do not retry this media version.`,
      );
    }
    writeOutput(`Uploaded ${upload.bucket}/${upload.key}\n`);
  }

  const verification = await verifyWordGameMediaDelivery(prepared, {
    cacheBust,
    fetch,
    mediaOrigin,
  });
  writeOutput(
    `Published ${uploads.length} and verified ${verification.verified.length} word-game media objects.\n`,
  );
  return {
    applied: true,
    uploadCount: uploads.length,
    verified: verification.verified,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runWordGameMediaPublisher().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
