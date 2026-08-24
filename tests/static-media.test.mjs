import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STATIC_MEDIA_ASSETS,
  createStaticMediaPublishPlan,
} from "../scripts/static-media.mjs";
import { runStaticMediaPublisher } from "../scripts/publish-static-media.mjs";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

function createOptions() {
  return {
    bucket: "parrot-english-media",
    mediaOrigin: "https://media.example.com",
    sourceVersion: 2,
    targetVersion: 3,
  };
}

function createImageResponse(contentType, body = null) {
  return new Response(body, {
    headers: {
      "cache-control": CACHE_CONTROL,
      "content-length": body ? String(body.byteLength) : "482193",
      "content-type": contentType,
    },
    status: 200,
  });
}

describe("static media publishing", () => {
  it("plans every migrated product image under a fresh immutable version", () => {
    const plan = createStaticMediaPublishPlan(
      STATIC_MEDIA_ASSETS,
      createOptions(),
    );

    assert.equal(plan.length, 176);
    assert.equal(
      plan.filter(({ contentType }) => contentType === "image/webp").length,
      171,
    );
    assert.equal(
      plan.filter(({ contentType }) => contentType === "image/png").length,
      5,
    );
    assert.equal(new Set(plan.map(({ targetKey }) => targetKey)).size, 176);
    assert.deepEqual(
      plan.find(({ path }) => path === "full-scenes/01-peppas-high-ball/01-ball-up-high.webp"),
      {
        bucket: "parrot-english-media",
        cacheControl: CACHE_CONTROL,
        contentType: "image/webp",
        path: "full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        sourceKey:
          "assets/v2/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        sourceUrl:
          "https://media.example.com/assets/v2/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        targetKey:
          "assets/v3/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        targetUrl:
          "https://media.example.com/assets/v3/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
      },
    );
  });

  it("copies only missing objects and then verifies every target", async () => {
    const assets = [
      {
        contentType: "image/webp",
        path: "characters/peppa/peppa-idle.webp",
      },
      { contentType: "image/png", path: "brand/icon-192.png" },
    ];
    const commands = [];
    const requests = [];
    const pngBytes = new Uint8Array([137, 80, 78, 71]);

    const result = await runStaticMediaPublisher({
      args: ["--apply"],
      assets,
      cacheBust: "fixture",
      env: {
        PARROT_MEDIA_ORIGIN: "https://media.example.com",
        PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
      },
      fetch: async (url, init) => {
        const parsed = new URL(url);
        requests.push({
          method: init?.method ?? "GET",
          redirect: init?.redirect,
          url: parsed,
        });
        if (init?.method === "HEAD") {
          const phase = parsed.searchParams.get("parrot-media-check");
          if (
            phase === "preflight-fixture" &&
            parsed.pathname.endsWith("/brand/icon-192.png")
          ) {
            return new Response(null, { status: 404 });
          }
          return createImageResponse(
            parsed.pathname.endsWith(".png") ? "image/png" : "image/webp",
          );
        }
        assert.equal(
          parsed.pathname,
          "/assets/v2/brand/icon-192.png",
        );
        return createImageResponse("image/png", pngBytes);
      },
      runCommand(command, args, options) {
        commands.push({ args, command, input: options.input });
        return { status: 0, stderr: "", stdout: "" };
      },
      writeOutput() {},
    });

    assert.deepEqual(result, {
      applied: true,
      published: ["brand/icon-192.png"],
      verified: [
        "brand/icon-192.png",
        "characters/peppa/peppa-idle.webp",
      ],
    });
    assert.deepEqual(
      requests
        .filter(({ method }) => method === "HEAD")
        .map(({ url }) => [
          url.pathname,
          url.searchParams.get("parrot-media-check"),
        ]),
      [
        [
          "/assets/v3/characters/peppa/peppa-idle.webp",
          "preflight-fixture",
        ],
        ["/assets/v3/brand/icon-192.png", "preflight-fixture"],
        [
          "/assets/v3/characters/peppa/peppa-idle.webp",
          "verify-fixture",
        ],
        ["/assets/v3/brand/icon-192.png", "verify-fixture"],
      ],
    );
    assert.ok(requests.every(({ redirect }) => redirect === "error"));
    assert.equal(commands.length, 1);
    assert.deepEqual(commands[0], {
      args: [
        "exec",
        "--offline",
        "--",
        "wrangler",
        "r2",
        "object",
        "put",
        "parrot-english-media/assets/v3/brand/icon-192.png",
        "--pipe",
        "--remote",
        "--content-type",
        "image/png",
        "--cache-control",
        CACHE_CONTROL,
      ],
      command: "npm",
      input: pngBytes,
    });
  });

  it("refuses to overwrite an existing immutable object with bad metadata", async () => {
    let commandCount = 0;

    await assert.rejects(
      runStaticMediaPublisher({
        args: ["--apply"],
        assets: [
          {
            contentType: "image/webp",
            path: "characters/peppa/peppa-idle.webp",
          },
        ],
        cacheBust: "fixture",
        env: {
          PARROT_MEDIA_ORIGIN: "https://media.example.com",
          PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
        },
        fetch: async (_url, init) => {
          if (init?.method === "HEAD") {
            return createImageResponse("text/plain");
          }
          return createImageResponse(
            "image/webp",
            new Uint8Array([82, 73, 70, 70]),
          );
        },
        runCommand() {
          commandCount += 1;
          return { status: 0, stderr: "", stdout: "" };
        },
        writeOutput() {},
      }),
      /already exists with invalid immutable metadata; use a new asset version/,
    );
    assert.equal(commandCount, 0);
  });

  it("rejects contradictory cache directives on an existing object", async () => {
    await assert.rejects(
      runStaticMediaPublisher({
        args: ["--apply"],
        assets: [
          {
            contentType: "image/webp",
            path: "characters/peppa/peppa-idle.webp",
          },
        ],
        cacheBust: "fixture",
        env: {
          PARROT_MEDIA_ORIGIN: "https://media.example.com",
          PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
        },
        fetch: async () =>
          new Response(null, {
            headers: {
              "cache-control":
                "private, no-store, max-age=31536000, immutable",
              "content-length": "482193",
              "content-type": "image/webp",
            },
            status: 200,
          }),
        runCommand() {
          throw new Error("An existing immutable key must not be overwritten");
        },
        writeOutput() {},
      }),
      /already exists with invalid immutable metadata; use a new asset version/,
    );
  });
});
