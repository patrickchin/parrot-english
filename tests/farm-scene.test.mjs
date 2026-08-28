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
  it("renders the active farm animal and keeps thumbnails accessible", () => {
    const html = renderToStaticMarkup(createElement(FarmScene, {
      line: OLD_MACDONALD_DUB.lines[14],
      thumbnail: true,
    }));

    assert.match(html, /data-farm-animal="pigs"/);
    assert.match(html, /aria-label="Farm scene"/);
    assert.doesNotMatch(html, /https?:\/\//);
  });
});
