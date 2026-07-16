/* global process */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyBackgroundCatalogMedia } from "./background-media.mjs";

async function readBackgroundCatalog(cwd) {
  const filename = path.resolve(cwd, "content/catalogs/backgrounds.json");
  let source;
  try {
    source = await readFile(filename, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${filename}: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${filename} must contain valid JSON`);
  }
}

function inferMediaOrigin(backgrounds, env) {
  const configured = env.PARROT_MEDIA_ORIGIN;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  const remote = backgrounds.find(
    ({ src }) => typeof src === "string" && !src.startsWith("/"),
  );
  if (!remote) return null;
  try {
    return new URL(remote.src).origin;
  } catch {
    throw new Error(`${remote.id ?? "background"} has an invalid media URL`);
  }
}

export async function runBackgroundVerifier({
  backgrounds,
  cwd = process.cwd(),
  env = process.env,
  fetch = globalThis.fetch,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const catalog = backgrounds ?? (await readBackgroundCatalog(cwd));
  if (!Array.isArray(catalog)) throw new Error("backgrounds must be an array");
  const mediaOrigin = inferMediaOrigin(catalog, env);
  if (!mediaOrigin) {
    const result = {
      skipped: catalog
        .map(({ id }) => id)
        .filter((id) => typeof id === "string")
        .sort(),
      verified: [],
    };
    writeOutput(
      `No remote background assets to verify; skipped ${result.skipped.length} repository-local assets.\n`,
    );
    return result;
  }

  const result = await verifyBackgroundCatalogMedia(catalog, {
    fetch,
    mediaOrigin,
  });
  writeOutput(
    `Verified ${result.verified.length} remote background assets; skipped ${result.skipped.length} repository-local assets.\n`,
  );
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runBackgroundVerifier().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
