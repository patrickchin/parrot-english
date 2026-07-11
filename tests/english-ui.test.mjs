import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const textExtensions = new Set([".html", ".js", ".json", ".mjs", ".svg", ".ts", ".tsx", ".webmanifest"]);

function collectTextFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) return collectTextFiles(child);
    return textExtensions.has(extname(child)) ? [child] : [];
  });
}

describe("English-only shipped UI", () => {
  it("contains no Chinese characters in runtime source or web metadata", () => {
    const paths = ["src", "lib", "worker", "index.html", "vite.config.ts", "public/manifest.webmanifest"].map(
      (path) => fileURLToPath(new URL(`../${path}`, import.meta.url)),
    );
    for (const file of paths.flatMap(collectTextFiles)) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /\p{Script=Han}/u, file);
    }
  });
});
