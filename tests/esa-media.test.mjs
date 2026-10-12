import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectEsaMediaUrls, copyEsaMedia, esaMediaPath } from "../scripts/build-esa-media.mjs";

test("ESA media includes constructed story paths and the UI's responsive artwork", () => {
  const urls = collectEsaMediaUrls();
  assert.ok(urls.includes("https://media.parrotbook.com/assets/v7/story-pages/hello-cat-cat-hello.webp"));
  assert.ok(urls.includes("https://media.parrotbook.com/assets/v5/stories/the-gruffalo-cover-384.webp"));
  assert.ok(urls.includes("https://media.parrotbook.com/assets/v3/characters/peppa/peppa-talking-1024.webp"));
  assert.ok(urls.includes("https://media.parrotbook.com/assets/v3/brand/icon-512.png"));
  assert.ok(urls.every((url) => !/-(384|768|1024)-(384|768)\.webp$/.test(url)));
});

test("ESA media copies exact public bytes and rewrites the web manifest without changing its source", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parrot-esa-media-"));
  const source = "https://media.parrotbook.com/assets/v3/brand/favicon.png";
  writeFileSync(join(directory, "manifest.webmanifest"), JSON.stringify({ icons: [{ src: source }] }));
  try {
    const result = await copyEsaMedia({ urls: [source, source], directory, fetch: async (url, options) => {
      assert.equal(url, source);
      assert.equal(options.redirect, "error");
      return new Response(Uint8Array.from([1, 2, 3]), { headers: { "content-type": "image/png" } });
    } });
    assert.equal(result.media.length, 1);
    assert.equal(result.media[0].sha256, "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    assert.deepEqual([...readFileSync(join(directory, "china-media/assets/v3/brand/favicon.png"))], [1, 2, 3]);
    assert.equal(JSON.parse(readFileSync(join(directory, "manifest.webmanifest"), "utf8")).icons[0].src, "/china-media/assets/v3/brand/favicon.png");
    assert.match(readFileSync("public/manifest.webmanifest", "utf8"), /https:\/\/media\.parrotbook\.com/);
    await assert.rejects(copyEsaMedia({ urls: [source], directory, fetch: async () => new Response("html", { headers: { "content-type": "text/html" } }) }), /unexpected content type/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ESA media rejects foreign hosts, private paths, traversal and URL options", () => {
  for (const source of [
    "https://evil.example/assets/v3/file.webp",
    "https://media.parrotbook.com/private/recording.webm",
    "https://media.parrotbook.com/backgrounds/unversioned/file.webp",
    "https://media.parrotbook.com/assets/v3/../v3/file.webp",
    "https://media.parrotbook.com/assets/v3//file.webp",
    "https://media.parrotbook.com/assets/v3/file.webp?token=secret",
  ]) assert.throws(() => esaMediaPath(source), /Only versioned public/);
});
