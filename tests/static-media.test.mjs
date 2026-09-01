import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
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

    assert.equal(plan.length, 296);
    assert.equal(
      plan.filter(({ contentType }) => contentType === "image/webp").length,
      291,
    );
    assert.equal(
      plan.filter(({ contentType }) => contentType === "image/png").length,
      5,
    );
    assert.equal(new Set(plan.map(({ targetKey }) => targetKey)).size, 296);
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

  it("plans responsive derivatives for every full scene and unique dubbing master", () => {
    const plan = createStaticMediaPublishPlan(
      STATIC_MEDIA_ASSETS,
      createOptions(),
    );
    const responsive = plan.filter(({ resizeWidth }) => resizeWidth);
    const fullScenes = responsive.filter(({ path }) =>
      path.startsWith("full-scenes/"),
    );
    const dubbing = responsive.filter(({ path }) =>
      path.startsWith("dubbing/"),
    );

    assert.equal(fullScenes.length, 70);
    assert.equal(dubbing.length, 50);
    assert.deepEqual(
      fullScenes.find(({ path }) =>
        path === "full-scenes/01-peppas-high-ball/01-ball-up-high-384.webp"),
      {
        bucket: "parrot-english-media",
        cacheControl: CACHE_CONTROL,
        contentType: "image/webp",
        path: "full-scenes/01-peppas-high-ball/01-ball-up-high-384.webp",
        resizeWidth: 384,
        sourceKey:
          "assets/v2/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        sourceUrl:
          "https://media.example.com/assets/v2/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        targetKey:
          "assets/v3/full-scenes/01-peppas-high-ball/01-ball-up-high-384.webp",
        targetUrl:
          "https://media.example.com/assets/v3/full-scenes/01-peppas-high-ball/01-ball-up-high-384.webp",
      },
    );
    assert.deepEqual(
      dubbing.find(({ path }) =>
        path === "dubbing/humpty-dumpty/line-2-great-fall-768.webp"),
      {
        bucket: "parrot-english-media",
        cacheControl: CACHE_CONTROL,
        contentType: "image/webp",
        path: "dubbing/humpty-dumpty/line-2-great-fall-768.webp",
        resizeWidth: 768,
        sourceKey:
          "assets/v7/dubbing/humpty-dumpty/line-2-great-fall.webp",
        sourceUrl:
          "https://media.example.com/assets/v7/dubbing/humpty-dumpty/line-2-great-fall.webp",
        targetKey:
          "assets/v7/dubbing/humpty-dumpty/line-2-great-fall-768.webp",
        targetUrl:
          "https://media.example.com/assets/v7/dubbing/humpty-dumpty/line-2-great-fall-768.webp",
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

  it("publishes a responsive variant resized from its canonical versioned source", async () => {
    const sourceBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 864,
        width: 1536,
      },
    }).webp().toBuffer();
    const commands = [];
    const requestedSources = [];

    const result = await runStaticMediaPublisher({
      args: ["--apply"],
      assets: [
        {
          contentType: "image/webp",
          path: "dubbing/humpty-dumpty/line-2-great-fall-384.webp",
          resizeWidth: 384,
          sourcePath: "dubbing/humpty-dumpty/line-2-great-fall.webp",
          sourceVersion: 7,
          targetVersion: 7,
        },
        {
          contentType: "image/webp",
          path: "dubbing/humpty-dumpty/line-2-great-fall-768.webp",
          resizeWidth: 768,
          sourcePath: "dubbing/humpty-dumpty/line-2-great-fall.webp",
          sourceVersion: 7,
          targetVersion: 7,
        },
      ],
      cacheBust: "responsive-fixture",
      env: {
        PARROT_MEDIA_ORIGIN: "https://media.example.com",
        PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
      },
      fetch: async (url, init) => {
        const parsed = new URL(url);
        if (init?.method === "HEAD") {
          return parsed.searchParams.get("parrot-media-check") ===
            "preflight-responsive-fixture"
            ? new Response(null, { status: 404 })
            : createImageResponse("image/webp");
        }
        const uploaded = commands.find(({ args }) =>
          args.some((argument) => argument.endsWith(parsed.pathname)),
        );
        if (uploaded) {
          return createImageResponse("image/webp", uploaded.input);
        }
        requestedSources.push(parsed.pathname);
        return createImageResponse("image/webp", sourceBytes);
      },
      runCommand(command, args, options) {
        commands.push({ args, command, input: options.input });
        return { status: 0, stderr: "", stdout: "" };
      },
      writeOutput() {},
    });

    assert.deepEqual(requestedSources, [
      "/assets/v7/dubbing/humpty-dumpty/line-2-great-fall.webp",
    ]);
    assert.equal(
      commands[0].args.includes(
        "parrot-english-media/assets/v7/dubbing/humpty-dumpty/line-2-great-fall-384.webp",
      ),
      true,
    );
    const metadata = await sharp(commands[0].input).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 384);
    assert.equal(metadata.height, 216);
    const largeMetadata = await sharp(commands[1].input).metadata();
    assert.equal(largeMetadata.format, "webp");
    assert.equal(largeMetadata.width, 768);
    assert.equal(largeMetadata.height, 432);
    assert.deepEqual(result.published, [
      "dubbing/humpty-dumpty/line-2-great-fall-384.webp",
      "dubbing/humpty-dumpty/line-2-great-fall-768.webp",
    ]);
  });

  it("rejects an existing responsive object with the wrong decoded width", async () => {
    const sourceBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 864,
        width: 1536,
      },
    }).webp().toBuffer();
    const wrongBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 12,
        width: 12,
      },
    }).webp().toBuffer();
    let commandCount = 0;

    await assert.rejects(
      runStaticMediaPublisher({
        args: ["--apply"],
        assets: [
          {
            contentType: "image/webp",
            path: "dubbing/nursery-rhymes-cover-384.webp",
            resizeWidth: 384,
            sourcePath: "dubbing/nursery-rhymes-cover.webp",
            sourceVersion: 6,
            targetVersion: 6,
          },
        ],
        cacheBust: "wrong-width-fixture",
        env: {
          PARROT_MEDIA_ORIGIN: "https://media.example.com",
          PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
        },
        fetch: async (url, init) => {
          if (init?.method === "HEAD") {
            return createImageResponse("image/webp");
          }
          return createImageResponse(
            "image/webp",
            new URL(url).pathname.endsWith("-384.webp")
              ? wrongBytes
              : sourceBytes,
          );
        },
        runCommand() {
          commandCount += 1;
          return { status: 0, stderr: "", stdout: "" };
        },
        writeOutput() {},
      }),
      /nursery-rhymes-cover-384\.webp.*384px wide/,
    );
    assert.equal(commandCount, 0);
  });

  it("rejects an existing responsive object with the right width but wrong height", async () => {
    const sourceBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 864,
        width: 1536,
      },
    }).webp().toBuffer();
    const wrongBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 1,
        width: 384,
      },
    }).webp().toBuffer();

    await assert.rejects(
      runStaticMediaPublisher({
        args: ["--apply"],
        assets: [
          {
            contentType: "image/webp",
            path: "dubbing/nursery-rhymes-cover-384.webp",
            resizeWidth: 384,
            sourcePath: "dubbing/nursery-rhymes-cover.webp",
            sourceVersion: 6,
            targetVersion: 6,
          },
        ],
        cacheBust: "wrong-height-fixture",
        env: {
          PARROT_MEDIA_ORIGIN: "https://media.example.com",
          PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
        },
        fetch: async (url, init) => {
          if (init?.method === "HEAD") {
            return createImageResponse("image/webp");
          }
          return createImageResponse(
            "image/webp",
            new URL(url).pathname.endsWith("-384.webp")
              ? wrongBytes
              : sourceBytes,
          );
        },
        runCommand() {
          throw new Error("An invalid immutable derivative must not be uploaded");
        },
        writeOutput() {},
      }),
      /nursery-rhymes-cover-384\.webp.*216px high/,
    );
  });

  it("rejects a mislabeled or unrelated responsive object", async () => {
    const sourceBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 864,
        width: 1536,
      },
    }).webp().toBuffer();
    const pngBytes = await sharp(sourceBytes).resize({ width: 384 }).png().toBuffer();
    const unrelatedBytes = await sharp({
      create: {
        background: "#fb7185",
        channels: 3,
        height: 216,
        width: 384,
      },
    }).webp({ quality: 82 }).toBuffer();

    async function publishWithTarget(targetBytes, cacheBust) {
      return runStaticMediaPublisher({
        args: ["--apply"],
        assets: [
          {
            contentType: "image/webp",
            path: "dubbing/nursery-rhymes-cover-384.webp",
            resizeWidth: 384,
            sourcePath: "dubbing/nursery-rhymes-cover.webp",
            sourceVersion: 6,
            targetVersion: 6,
          },
        ],
        cacheBust,
        env: {
          PARROT_MEDIA_ORIGIN: "https://media.example.com",
          PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
        },
        fetch: async (url, init) => {
          if (init?.method === "HEAD") {
            return createImageResponse("image/webp");
          }
          return createImageResponse(
            "image/webp",
            new URL(url).pathname.endsWith("-384.webp")
              ? targetBytes
              : sourceBytes,
          );
        },
        runCommand() {
          throw new Error("An invalid immutable derivative must not be uploaded");
        },
        writeOutput() {},
      });
    }

    await assert.rejects(
      publishWithTarget(pngBytes, "wrong-format-fixture"),
      /nursery-rhymes-cover-384\.webp.*decode as webp/,
    );
    await assert.rejects(
      publishWithTarget(unrelatedBytes, "wrong-source-fixture"),
      /nursery-rhymes-cover-384\.webp.*match its canonical source/,
    );
  });

  it("validates canonical responsive sources even when every derivative exists", async () => {
    const targetBytes = await sharp({
      create: {
        background: "#7dd3fc",
        channels: 3,
        height: 216,
        width: 384,
      },
    }).webp().toBuffer();
    const requested = [];

    await assert.rejects(
      runStaticMediaPublisher({
        args: ["--apply"],
        assets: [
          {
            contentType: "image/webp",
            path: "dubbing/nursery-rhymes-cover-384.webp",
            resizeWidth: 384,
            sourcePath: "dubbing/nursery-rhymes-cover.webp",
            sourceVersion: 6,
            targetVersion: 6,
          },
        ],
        cacheBust: "missing-source-fixture",
        env: {
          PARROT_MEDIA_ORIGIN: "https://media.example.com",
          PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
        },
        fetch: async (url, init) => {
          const pathname = new URL(url).pathname;
          requested.push([init?.method ?? "GET", pathname]);
          if (init?.method === "HEAD") {
            return createImageResponse("image/webp");
          }
          if (pathname.endsWith("nursery-rhymes-cover.webp")) {
            return new Response(null, { status: 404 });
          }
          return createImageResponse("image/webp", targetBytes);
        },
        runCommand() {
          throw new Error("Existing responsive media must not be uploaded.");
        },
        writeOutput() {},
      }),
      /nursery-rhymes-cover\.webp source returned HTTP 404/,
    );
    assert.ok(requested.some(([method, pathname]) =>
      method === "GET" && pathname.endsWith("nursery-rhymes-cover.webp"),
    ));
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
