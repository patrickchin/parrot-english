/* global URL, process */

import { pathToFileURL } from "node:url";

const LIST_PREFIX = "personalized-story-art/";
const CUSTOM_LESSON_RECORDING_KEY = new RegExp(
  "^personalized-story-art/([^/]+)/(?:lesson-recordings/my|learners/([^/]+)/lesson-recordings/my)/([^/]+)/scene-(0|[1-9]\\d*)/step-(0|[1-9]\\d*)\\.audio$",
);
const HELP = `Usage: npm run purge:custom-lesson-recordings -- --bucket <name> [--execute]

Lists only these exact custom-recording key shapes:
  personalized-story-art/<account>/lesson-recordings/my/...
  personalized-story-art/<account>/learners/<learner>/lesson-recordings/my/...

Without --execute, this command is a dry run. --execute deletes exact matches
sequentially, then performs a fresh scan that must find zero matches.
`;

export function isCustomLessonRecordingKey(key) {
  if (
    typeof key !== "string" ||
    key.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return false;
  }

  const match = CUSTOM_LESSON_RECORDING_KEY.exec(key);
  if (!match) return false;

  try {
    return [match[1], match[2], match[3]]
      .filter((segment) => segment !== undefined)
      .every((segment) => encodeURIComponent(decodeURIComponent(segment)) === segment) &&
      Number.isSafeInteger(Number(match[4])) &&
      Number.isSafeInteger(Number(match[5]));
  } catch {
    return false;
  }
}

function parseArguments(argv) {
  let bucket;
  let execute = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--bucket") {
      const value = argv[index + 1];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
        throw new Error("--bucket requires a non-empty value");
      }
      if (bucket !== undefined) throw new Error("--bucket may be provided only once");
      bucket = value.trim();
      index += 1;
      continue;
    }
    throw new Error("Unsupported command argument");
  }

  return { bucket, execute, help: false };
}

function requireValue(name, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be non-empty`);
  }
  return value.trim();
}

function cloudflareBaseUrl(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
}

function listUrl(accountId, bucket, cursor) {
  const url = new URL(
    `${cloudflareBaseUrl(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects`,
  );
  url.searchParams.set("prefix", LIST_PREFIX);
  url.searchParams.set("per_page", "1000");
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  return url;
}

function objectUrl(accountId, bucket, key) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${cloudflareBaseUrl(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodedKey}`;
}

async function cloudflareResult(url, { apiToken, fetch, method }) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
      method,
    });
  } catch {
    throw new Error("Cloudflare API request could not be completed");
  }

  if (!response || response.ok !== true) {
    throw new Error(`Cloudflare API request returned HTTP ${response?.status ?? "unknown"}`);
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new Error("Cloudflare API response did not contain valid JSON");
  }
  if (!envelope || envelope.success !== true || !("result" in envelope)) {
    throw new Error("Cloudflare API response has an unsuccessful envelope");
  }
  return envelope.result;
}

async function listCustomLessonRecordingKeys({ accountId, apiToken, bucket, fetch }) {
  const keys = new Set();
  const seenCursors = new Set();
  let cursor;
  let shouldListMore = true;

  while (shouldListMore) {
    const result = await cloudflareResult(listUrl(accountId, bucket, cursor), {
      apiToken,
      fetch,
      method: "GET",
    });
    if (!result || !Array.isArray(result.objects) || typeof result.truncated !== "boolean") {
      throw new Error("Cloudflare list response has an invalid envelope");
    }
    for (const object of result.objects) {
      if (!object || typeof object.key !== "string") {
        throw new Error("Cloudflare list response has an invalid object key");
      }
      if (isCustomLessonRecordingKey(object.key)) keys.add(object.key);
    }
    shouldListMore = result.truncated;
    if (shouldListMore) {
      if (typeof result.cursor !== "string" || !result.cursor.trim()) {
        throw new Error("Cloudflare list response is truncated but has no next cursor");
      }
      if (seenCursors.has(result.cursor)) {
        throw new Error("Cloudflare list cursor did not advance");
      }
      seenCursors.add(result.cursor);
      cursor = result.cursor;
    }
  }

  return [...keys];
}

async function deleteObject({ accountId, apiToken, bucket, fetch, key }) {
  await cloudflareResult(objectUrl(accountId, bucket, key), {
    apiToken,
    fetch,
    method: "DELETE",
  });
}

export async function runPurgeCustomLessonRecordings({
  accountId,
  apiToken,
  argv,
  bucket,
  env = process.env,
  execute = false,
  fetch = globalThis.fetch,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  if (argv !== undefined) {
    const parsed = parseArguments(argv);
    if (parsed.help) {
      writeOutput(HELP);
      return { help: true };
    }
    return runPurgeCustomLessonRecordings({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      bucket: parsed.bucket,
      execute: parsed.execute,
      fetch,
      writeOutput,
    });
  }

  const configuration = {
    accountId: requireValue("CLOUDFLARE_ACCOUNT_ID", accountId),
    apiToken: requireValue("CLOUDFLARE_API_TOKEN", apiToken),
    bucket: requireValue("--bucket", bucket),
    fetch,
  };
  if (typeof fetch !== "function") throw new Error("A fetch implementation is required");

  const keys = await listCustomLessonRecordingKeys(configuration);
  if (execute !== true) {
    writeOutput(`Dry run: found ${keys.length} exact custom lesson recording keys.\n`);
    for (const key of keys) writeOutput(`${key}\n`);
    return { deleted: [], keys, verified: false };
  }

  writeOutput(`Execute: deleting ${keys.length} exact custom lesson recording keys.\n`);
  const deleted = [];
  for (const key of keys) {
    await deleteObject({ ...configuration, key });
    deleted.push(key);
    writeOutput(`Deleted: ${key}\n`);
  }

  const remainingKeys = await listCustomLessonRecordingKeys(configuration);
  if (remainingKeys.length !== 0) {
    throw new Error(
      `Verification failed: ${remainingKeys.length} exact custom lesson recording keys remain`,
    );
  }
  writeOutput("Verification: zero exact custom lesson recording keys remain.\n");
  return { deleted, keys, verified: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPurgeCustomLessonRecordings({ argv: process.argv.slice(2) }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
