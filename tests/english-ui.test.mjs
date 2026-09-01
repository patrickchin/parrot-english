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
  it("keeps Chinese copy confined to the Simplified-Chinese guardian catalog", () => {
    const paths = ["src", "lib", "worker", "index.html", "vite.config.ts", "public/manifest.webmanifest"].map(
      (path) => fileURLToPath(new URL(`../${path}`, import.meta.url)),
    );
    for (const file of paths.flatMap(collectTextFiles)) {
      const source = readFileSync(file, "utf8");
      if (file.endsWith("/src/i18n/messages/zh-Hans.ts")) {
        assert.match(source, /\p{Script=Han}/u, file);
        continue;
      }
      if (file.endsWith("/src/i18n/messages/en.ts")) {
        assert.doesNotMatch(source.replace("\u4e2d\u6587", ""), /\p{Script=Han}/u, file);
        continue;
      }
      assert.doesNotMatch(source, /\p{Script=Han}/u, file);
    }
  });
});
