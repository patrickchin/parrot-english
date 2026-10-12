/* global AbortSignal, console */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { URL, pathToFileURL } from "node:url";
import process from "node:process";
import { STORIES } from "../src/stories/story-catalog.ts";
import { GENERATED_DUB_DEFINITIONS } from "../src/dubbing/generated-rhyme-catalog.ts";
import { FULL_SCENE_LESSONS } from "../src/lessons/full-scene-lessons.ts";
import { NURSERY_RHYMES_COVER_ARTWORK } from "../src/dubbing/dub-artwork.ts";

export const MEDIA_ORIGIN = "https://media.parrotbook.com";
export const ESA_MEDIA_PREFIX = "/china-media";
const MAX_FILE_BYTES = 25_000_000;
const MAX_FILES = 2000;
const MAX_PACKAGE_BYTES = 1_000_000_000;
const mediaPattern = /https:\/\/media\.parrotbook\.com\/[a-zA-Z0-9_./-]+\.(?:webp|png|svg|jpg|jpeg|mp3|webm)/g;

export function collectEsaMediaUrls() {
  const urls = new Set();
  const collect = (value) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(mediaPattern)) urls.add(match[0]);
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) collect(item);
    }
  };
  // ponytail: enumerate this app's current constructed catalogs and responsive
  // rules. Extend this list before publishing a new dynamically built catalog.
  collect([STORIES, GENERATED_DUB_DEFINITIONS, FULL_SCENE_LESSONS, NURSERY_RHYMES_COVER_ARTWORK]);
  for (const folder of ["src", "lib", "content/catalogs"]) {
    for (const file of readdirSync(folder, { recursive: true })) {
      if (/\.(tsx?|json)$/.test(file)) collect(readFileSync(join(folder, file), "utf8"));
    }
  }
  collect(readFileSync("index.html", "utf8"));
  collect(readFileSync("public/manifest.webmanifest", "utf8"));
  for (const url of [...urls]) {
    if (/-(384|768|1024)\.webp$/.test(url)) continue;
    // Match the responsive images requested by the existing UI components.
    if (/\/(full-scenes|dubbing|lesson-covers)\//.test(url) || /\/stories\/[^/]+-cover\.webp$/.test(url)) {
      for (const width of [384, 768]) urls.add(url.replace(/\.webp$/, `-${width}.webp`));
    }
    if (/\/characters\/peppa\/peppa-(happy|listening|sad|surprised|talking)\.webp$/.test(url)) {
      for (const width of [384, 768, 1024]) urls.add(url.replace(/\.webp$/, `-${width}.webp`));
    }
  }
  return [...urls].sort();
}

export function esaMediaPath(source) {
  const url = new URL(source);
  if (url.href !== source || url.origin !== MEDIA_ORIGIN || url.search || url.hash || url.username || url.password ||
    !/^\/(assets\/v\d+\/|backgrounds\/[a-zA-Z0-9_-]+\/v\d+\/)[a-zA-Z0-9_./-]+\.(webp|png|svg|jpg|jpeg|mp3|webm)$/.test(url.pathname) ||
    url.pathname.slice(1).split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Only versioned public Parrot media may be copied into ESA.");
  }
  return ESA_MEDIA_PREFIX + url.pathname;
}

function inspectPackage(directory) {
  let files = 0;
  let bytes = 0;
  for (const path of readdirSync(directory, { recursive: true })) {
    const entry = statSync(join(directory, path));
    if (!entry.isFile()) continue;
    files++;
    bytes += entry.size;
    if (entry.size > MAX_FILE_BYTES) throw new Error("ESA static file exceeds 25 MB.");
  }
  if (files > MAX_FILES || bytes > MAX_PACKAGE_BYTES) throw new Error("ESA package exceeds its file-count or size limit.");
  return { files, bytes };
}

export async function copyEsaMedia({ urls = collectEsaMediaUrls(), directory = "dist", fetch = globalThis.fetch } = {}) {
  const initial = inspectPackage(directory);
  const sources = [...new Set(urls)];
  if (initial.files + sources.length > MAX_FILES) throw new Error("ESA package would exceed 2000 files.");
  const paths = sources.map(esaMediaPath);
  const inventory = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < sources.length) {
      const index = next++;
      const source = sources[index];
      const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.body) throw new Error(`Public media returned HTTP ${response.status}: ${source}`);
      const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      const extension = new URL(source).pathname.split(".").at(-1);
      const expected = { webp: "image/webp", png: "image/png", svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", mp3: "audio/mpeg", webm: "audio/webm" }[extension];
      if (type !== expected) throw new Error(`Public media has an unexpected content type: ${source}`);
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_FILE_BYTES) { await reader.cancel(); throw new Error("ESA static file exceeds 25 MB."); }
        chunks.push(value);
      }
      if (bytes === 0) throw new Error("Public media is empty.");
      const body = Buffer.concat(chunks);
      const path = join(directory, paths[index].slice(1));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
      inventory.push({ source, path: paths[index], bytes, sha256: createHash("sha256").update(body).digest("hex") });
    }
  }));
  const packaged = inspectPackage(directory);
  const manifest = join(directory, "manifest.webmanifest");
  try { writeFileSync(manifest, readFileSync(manifest, "utf8").replaceAll(MEDIA_ORIGIN, ESA_MEDIA_PREFIX)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return { ...packaged, media: inventory.sort((a, b) => a.path.localeCompare(b.path)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await copyEsaMedia();
  mkdirSync("build", { recursive: true });
  writeFileSync("build/esa-media-inventory.json", JSON.stringify(result, null, 2) + "\n");
  console.log(`ESA media: copied ${result.media.length} public files; package contains ${result.files} files / ${result.bytes} bytes.`);
}
