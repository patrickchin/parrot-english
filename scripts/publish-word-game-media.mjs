/* global AbortSignal, Response, URL, process, setTimeout */

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
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

function isMissingObjectError(stderr) {
  return /\bNoSuchKey\b|\bR2 object does not exist\b|\b(?:specified )?(?:object|key) does not exist\b/i.test(
    stderr,
  );
}

export async function atomicR2WorkerFetch(request, environment, secret) {
  if (!secret || request.headers.get("x-parrot-upload-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "PUT" || url.pathname !== "/upload") {
    return new Response("Invalid request", { status: 400 });
  }
  const scope = url.searchParams.get("scope");
  const key = url.searchParams.get("key");
  if ((scope !== "public" && scope !== "private") || !key) {
    return new Response("Invalid upload target", { status: 400 });
  }
  const bucket = scope === "public"
    ? environment.PUBLIC_BUCKET
    : environment.SOURCE_BUCKET;
  const contentType = request.headers.get("content-type");
  if (!contentType || !request.body) {
    return new Response("Missing upload body or content type", { status: 400 });
  }
  const cacheControl = request.headers.get("cache-control");
  const httpMetadata = cacheControl
    ? { cacheControl, contentType }
    : { contentType };
  try {
    const created = await bucket.put(key, request.body, {
      httpMetadata,
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (created === null) {
      return new Response("Object was created concurrently", { status: 412 });
    }
    return new Response(null, { status: 201 });
  } catch (error) {
    return new Response(`R2 create-only upload failed: ${error.message}`, {
      status: 502,
    });
  }
}

function atomicWorkerSource() {
  return `const atomicR2WorkerFetch = ${atomicR2WorkerFetch.toString()};\nexport default { fetch(request, environment) { return atomicR2WorkerFetch(request, environment, environment.UPLOAD_SECRET); } };\n`;
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!port) throw new Error("Could not reserve a loopback port");
  return port;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exitPromise.then(() => true),
    wait(5_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exitPromise;
  }
}

async function startAtomicR2Uploader({ cwd, publicBucket, sourceBucket }) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "parrot-word-game-r2-"),
  );
  const workerFile = path.join(temporaryDirectory, "worker.mjs");
  const configFile = path.join(temporaryDirectory, "wrangler.json");
  const secret = randomUUID();
  const port = await reserveLoopbackPort();
  const config = {
    compatibility_date: "2026-08-31",
    main: workerFile,
    name: `parrot-wg-${randomUUID()}`,
    r2_buckets: [
      { binding: "PUBLIC_BUCKET", bucket_name: publicBucket, remote: true },
      { binding: "SOURCE_BUCKET", bucket_name: sourceBucket, remote: true },
    ],
    vars: { UPLOAD_SECRET: secret },
  };
  await Promise.all([
    writeFile(workerFile, atomicWorkerSource(), { mode: 0o600 }),
    writeFile(configFile, `${JSON.stringify(config)}\n`, { mode: 0o600 }),
  ]);

  const wrangler = path.join(cwd, "node_modules/.bin/wrangler");
  const child = spawn(
    wrangler,
    [
      "dev",
      "--config",
      configFile,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--log-level",
      "error",
    ],
    {
      cwd: temporaryDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let diagnostics = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-4_000);
    });
  }
  let exited = false;
  const exitPromise = new Promise((resolve) => {
    child.once("error", (error) => {
      diagnostics = `${diagnostics}\n${error.message}`.slice(-4_000);
    });
    child.once("close", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  try {
    for (let attempt = 0; attempt < 300 && !exited; attempt += 1) {
      try {
        const response = await globalThis.fetch(`${baseUrl}/health`, {
          headers: { "x-parrot-upload-secret": secret },
          signal: AbortSignal.timeout(500),
        });
        if (response.status === 204) {
          ready = true;
          break;
        }
      } catch {
        // The loopback listener is not ready yet.
      }
      await wait(100);
    }
    if (!ready) {
      throw new Error(
        `Could not start the create-only R2 upload helper${diagnostics.trim() ? `: ${diagnostics.trim()}` : ""}`,
      );
    }
  } catch (error) {
    await stopProcess(child, exitPromise);
    await rm(temporaryDirectory, { force: true, recursive: true });
    throw error;
  }

  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      await stopProcess(child, exitPromise);
      await rm(temporaryDirectory, { force: true, recursive: true });
    },
    async put(upload) {
      const url = new URL(`${baseUrl}/upload`);
      url.searchParams.set("scope", upload.scope);
      url.searchParams.set("key", upload.key);
      const headers = {
        "content-type": upload.contentType,
        "x-parrot-upload-secret": secret,
      };
      if (upload.cacheControl) headers["cache-control"] = upload.cacheControl;
      const response = await globalThis.fetch(url, {
        body: upload.bytes,
        headers,
        method: "PUT",
      });
      if (response.status === 201) return;
      if (response.status === 412) {
        throw new Error("was created concurrently; do not retry this media version");
      }
      const detail = (await response.text()).trim();
      throw new Error(detail || `create-only helper returned HTTP ${response.status}`);
    },
  };
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
  createUploader = startAtomicR2Uploader,
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

  const uploader = await createUploader({ cwd, publicBucket, sourceBucket });
  try {
    for (const upload of uploads) {
      try {
        await uploader.put(upload);
      } catch (error) {
        throw new Error(
          `Could not upload ${upload.bucket}/${upload.key}: ${error.message}. Do not retry this media version.`,
        );
      }
      writeOutput(`Uploaded ${upload.bucket}/${upload.key}\n`);
    }
  } finally {
    await uploader.close();
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
