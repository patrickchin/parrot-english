import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorker } from "../worker/index.ts";

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function createEnvironment(fetchAsset) {
  let calls = 0;

  return {
    env: {
      ASSETS: {
        async fetch(request) {
          calls += 1;
          return fetchAsset(request);
        },
      },
    },
    getCalls: () => calls,
  };
}

function assertLowRiskAppHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value, name);
  }
  for (const name of [
    "Content-Security-Policy",
    "Cross-Origin-Embedder-Policy",
    "Cross-Origin-Opener-Policy",
    "Permissions-Policy",
  ]) {
    assert.equal(response.headers.get(name), null, name);
  }
}

describe("Worker app delivery", () => {
  it("returns JSON 404s for only the unmatched API namespace without fetching assets", async () => {
    const { env, getCalls } = createEnvironment(() =>
      new Response("<main>app shell</main>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    const worker = createWorker();

    for (const pathname of ["/api", "/api/", "/api/missing", "/api/missing.js"]) {
      const response = await worker.fetch(
        new Request(`https://example.test${pathname}`),
        env,
      );

      assert.equal(response.status, 404, pathname);
      assert.equal(response.headers.get("Cache-Control"), "no-store", pathname);
      assert.match(response.headers.get("Content-Type") ?? "", /^application\/json\b/);
      assert.deepEqual(await response.json(), { error: "not_found" }, pathname);
    }

    assert.equal(getCalls(), 0);

    const lookalike = await worker.fetch(
      new Request("https://example.test/apiary"),
      env,
    );
    assert.equal(lookalike.status, 200);
    assert.equal(await lookalike.text(), "<main>app shell</main>");
    assert.equal(getCalls(), 1);
  });

  it("returns retired feature APIs as unmatched API routes", async () => {
    const { env } = createEnvironment(() => new Response("asset"));
    const worker = createWorker({
      createAuth: () => ({
        api: {
          async getSession() {
            return null;
          },
        },
      }),
    });

    for (const [method, pathname] of [
      ["GET", "/api/lessons/my"],
      ["PUT", "/api/profile/preferences"],
      ["GET", "/api/stories/the-red-ball/personalized-art"],
      ["POST", "/api/stories/the-red-ball/personalized-art"],
      ["DELETE", "/api/stories/the-red-ball/personalized-art"],
      ["GET", "/api/stories/the-red-ball/personalized-art/asset"],
    ]) {
      const response = await worker.fetch(
        new Request(`https://example.test${pathname}`, { method }),
        env,
      );
      const label = `${method} ${pathname}`;
      assert.equal(response.status, 404, label);
      assert.deepEqual(await response.json(), { error: "not_found" }, label);
    }
  });

  it("turns SPA-shell fallbacks for static-looking paths into uncached 404s", async () => {
    const worker = createWorker();

    for (const pathname of [
      "/assets",
      "/assets/missing.js",
      "/assets/nursery-rhymes/missing/rhyme.json",
      "/.well-known/assetlinks.json",
      "/favicon.ico",
      "/robots.txt",
    ]) {
      const { env, getCalls } = createEnvironment(() =>
        new Response("<main>app shell</main>", {
          headers: {
            "Cache-Control": "max-age=0, must-revalidate",
            "Content-Type": "text/html; charset=utf-8",
            ETag: '"shell"',
          },
        }),
      );
      const response = await worker.fetch(
        new Request(`https://example.test${pathname}`),
        env,
      );

      assert.equal(getCalls(), 1, pathname);
      assert.equal(response.status, 404, pathname);
      assert.equal(response.headers.get("Cache-Control"), "no-store", pathname);
      assert.match(response.headers.get("Content-Type") ?? "", /^text\/plain\b/);
      assert.equal(await response.text(), "Not found", pathname);
      assertLowRiskAppHeaders(response);
    }
  });

  it("returns an empty body for HEAD requests to missing static assets", async () => {
    const { env, getCalls } = createEnvironment(() =>
      new Response("<main>app shell</main>", {
        headers: { "Content-Type": "text/html" },
      }),
    );

    const response = await createWorker().fetch(
      new Request("https://example.test/assets/missing.js", { method: "HEAD" }),
      env,
    );

    assert.equal(getCalls(), 1);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assertLowRiskAppHeaders(response);
  });

  it("preserves the SPA shell for app routes, including dotted route parameters", async () => {
    const worker = createWorker();

    for (const pathname of [
      "/",
      "/index.html",
      "/.well-known",
      "/stories/story.v2",
      "/lessons/01-peppas-high-ball/scenes/1",
    ]) {
      const { env, getCalls } = createEnvironment(() =>
        new Response("<main>app shell</main>", {
          headers: {
            "Cache-Control": "max-age=0, must-revalidate",
            "Content-Type": "text/html; charset=utf-8",
            ETag: '"shell"',
          },
        }),
      );
      const response = await worker.fetch(
        new Request(`https://example.test${pathname}`),
        env,
      );

      assert.equal(getCalls(), 1, pathname);
      assert.equal(response.status, 200, pathname);
      assert.equal(await response.text(), "<main>app shell</main>", pathname);
      assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
      assert.equal(response.headers.get("ETag"), '"shell"');
      assert.equal(
        response.headers.get("Cache-Control"),
        "max-age=0, must-revalidate",
      );
      assertLowRiskAppHeaders(response);
    }
  });

  it("preserves genuine static responses and makes only exact top-level Vite hashes immutable", async () => {
    const worker = createWorker();
    const cases = [
      ["/assets/app-abcdefgh.js", "public, max-age=31536000, immutable"],
      ["/assets/app-Ab01_x-y.css?theme=1", "public, max-age=31536000, immutable"],
      ["/assets/app-abcdefg.js", "max-age=0, must-revalidate"],
      ["/assets/app-abcdefghi.js", "max-age=0, must-revalidate"],
      ["/assets/nested/app-abcdefgh.js", "max-age=0, must-revalidate"],
      ["/assets/audio/song-abcdefgh.mp3", "max-age=0, must-revalidate"],
      ["/assets/media/picture-abcdefgh.webp", "max-age=0, must-revalidate"],
      ["/assets/app.js", "max-age=0, must-revalidate"],
    ];

    for (const [pathname, expectedCache] of cases) {
      const { env, getCalls } = createEnvironment(() =>
        new Response("static body", {
          headers: {
            "Cache-Control": "max-age=0, must-revalidate",
            "Content-Type": "application/octet-stream",
            ETag: '"asset-etag"',
          },
        }),
      );
      const response = await worker.fetch(
        new Request(`https://example.test${pathname}`),
        env,
      );

      assert.equal(getCalls(), 1, pathname);
      assert.equal(response.status, 200, pathname);
      assert.equal(await response.text(), "static body", pathname);
      assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
      assert.equal(response.headers.get("ETag"), '"asset-etag"');
      assert.equal(response.headers.get("Cache-Control"), expectedCache, pathname);
      assertLowRiskAppHeaders(response);
    }
  });
});
