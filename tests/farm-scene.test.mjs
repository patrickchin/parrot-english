import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { FarmScene } = await vite.ssrLoadModule("/src/dubbing/FarmScene.tsx");
const { OLD_MACDONALD_DUB } = await vite.ssrLoadModule("/src/dubbing/rhyme-catalog.ts");

after(async () => {
  await vite.close();
});

describe("farm scene renderer", () => {
  it("renders the generated illustration for the active farm scene", () => {
    const pigs = renderToStaticMarkup(createElement(FarmScene, {
      line: OLD_MACDONALD_DUB.lines[14],
      thumbnail: true,
    }));
    const cows = renderToStaticMarkup(createElement(FarmScene, {
      line: OLD_MACDONALD_DUB.lines[0],
      thumbnail: true,
    }));

    assert.match(pigs, /old-macdonald\/scene-3-pigs\.webp/);
    assert.match(pigs, /alt="Old MacDonald laughs with three pink pigs/);
    assert.match(cows, /old-macdonald\/scene-1-cows\.webp/);
    assert.notEqual(pigs, cows);
    assert.equal((pigs.match(/<img/g) ?? []).length, 1);
    assert.doesNotMatch(pigs, /data-farm-animal|snort-snort/);
  });
});
