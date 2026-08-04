/* global process */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyPixelStageMedia } from "./pixel-stage-media.mjs";

export async function runPixelStageMediaVerifier({
  cwd = process.cwd(),
  fetch = globalThis.fetch,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const catalogFile = path.resolve(
    cwd,
    "prototypes/pixel-stage/assets.json",
  );
  const catalog = JSON.parse(await readFile(catalogFile, "utf8"));
  const result = await verifyPixelStageMedia(catalog, { fetch });
  writeOutput(`Verified ${result.verified.length} pixel-stage media assets.\n`);
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runPixelStageMediaVerifier().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
