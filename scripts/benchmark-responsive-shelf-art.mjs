/* global Buffer, URL, document, performance, process */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const journeys = [
  {
    alt: "Peppa reaching for a red ball high in a tree while Dolly flies up to help",
    linkName: "Play a lesson",
    name: "lesson shelf",
  },
  {
    alt: "A bright red ball beside a smiling young child",
    linkName: "Story time",
    name: "story shelf",
  },
];
const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
const profile = {
  name: "Mia",
  age: 8,
  answers: {
    schemaVersion: 2,
    questionnaireVersion: 2,
    responses: {},
    legacyAnswers: null,
  },
  questionnaireVersion: 2,
  currentQuestionKey: null,
  profileStatus: "completed",
  completedAt: "2026-07-10T08:00:00.000Z",
};

function sendJson(response, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": body.length,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/api/auth/get-session") {
      sendJson(response, {
        session: {
          id: "benchmark-session",
          userId: "benchmark-user",
          token: "benchmark-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt: profile.completedAt,
          updatedAt: profile.completedAt,
        },
        user: {
          id: "benchmark-user",
          name: "Mia",
          email: "mia@example.test",
          emailVerified: true,
          createdAt: profile.completedAt,
          updatedAt: profile.completedAt,
        },
      });
      return;
    }
    if (pathname === "/api/learner-profile") {
      sendJson(response, {
        mode: "full",
        experienceMode: "realtime",
        profile,
        questionnaire: { version: 2 },
        question: null,
        progress: { answered: 2, current: 2, total: 2 },
        canBypass: true,
      });
      return;
    }
    if (pathname === "/api/lessons/my") {
      sendJson(response, { lessons: [] });
      return;
    }
    if (pathname === "/api/stories/the-red-ball/personalized-art") {
      sendJson(response, {
        enabled: false,
        hasStoredArt: false,
        stories: {},
      });
      return;
    }
    const requested =
      pathname === "/" || !path.extname(pathname)
        ? "index.html"
        : decodeURIComponent(pathname).replace(/^\/+/, "");
    const filename = path.resolve(dist, requested);
    if (!filename.startsWith(`${dist}${path.sep}`)) throw new Error("bad path");
    const source = await readFile(filename);
    const type = types.get(path.extname(filename)) ?? "application/octet-stream";
    const compress = /^(application\/json|text\/)/.test(type);
    const body = compress ? gzipSync(source) : source;
    const headers = {
      "cache-control": "no-store",
      "content-length": body.length,
      "content-type": type,
    };
    if (compress) headers["content-encoding"] = "gzip";
    response.writeHead(200, headers);
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("No benchmark port");

const browser = await chromium.launch();
const results = [];
try {
  for (const journey of journeys) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const context = await browser.newContext({
        deviceScaleFactor: 1,
        viewport: { height: 844, width: 390 },
      });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await session.send("Network.emulateNetworkConditions", {
        connectionType: "cellular3g",
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        latency: 150,
        offline: false,
        uploadThroughput: (0.75 * 1024 * 1024) / 8,
      });
      await page.goto(`http://127.0.0.1:${address.port}/`, {
        waitUntil: "domcontentloaded",
      });
      const link = page.getByRole("link", { name: journey.linkName });
      await link.waitFor({ state: "visible" });
      const startedMs = await page.evaluate(() => performance.now());
      await link.click();
      await page.waitForFunction(
        (alt) => {
          const image = [...document.images].find(
            (candidate) => candidate.alt === alt,
          );
          return image?.complete && image.naturalWidth > 0;
        },
        journey.alt,
        { polling: "raf", timeout: 15_000 },
      );
      const measured = await page.evaluate(({ alt, startedMs }) => {
        const image = [...document.images].find(
          (candidate) => candidate.alt === alt,
        );
        if (!image) throw new Error("Shelf cover did not render");
        const resource = performance.getEntriesByName(image.currentSrc).at(-1);
        return {
          completedMs: performance.now() - startedMs,
          currentSrc: image.currentSrc,
          encodedBytes: resource?.encodedBodySize ?? null,
          renderedWidth: image.getBoundingClientRect().width,
        };
      }, { alt: journey.alt, startedMs });
      results.push({ ...journey, ...measured, sample });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

for (const journey of journeys) {
  const samples = results.filter(({ name }) => name === journey.name);
  const middle = median(samples.map(({ completedMs }) => completedMs));
  process.stdout.write(
    `${journey.name}: ${samples.map(({ completedMs }) => completedMs.toFixed(0)).join(" / ")} ms; median ${middle.toFixed(0)} ms\n`,
  );
  for (const sample of samples) {
    process.stdout.write(
      `  ${new URL(sample.currentSrc).pathname} (${sample.encodedBytes} bytes, ${sample.renderedWidth.toFixed(0)} CSS px)\n`,
    );
  }
  if (middle > 1_500) process.exitCode = 1;
}
