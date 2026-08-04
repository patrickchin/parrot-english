import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import { verifyPixelStageMedia } from "../scripts/pixel-stage-media.mjs";

function createPngHeader(width, height) {
  const buffer = Buffer.alloc(33);
  buffer.set([137, 80, 78, 71, 13, 10, 26, 10]);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

function createCatalog(png) {
  return {
    schemaVersion: 1,
    mediaRoot:
      "https://media.parrotbook.com/prototypes/pixel-stage/v1",
    assets: [
      {
        filename: "garden-tree-ball.png",
        height: 192,
        sha256: createHash("sha256").update(png).digest("hex"),
        width: 144,
      },
    ],
  };
}

function createResponse(png, headers = {}) {
  return new Response(png, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(png.length),
      "content-type": "image/png",
      ...headers,
    },
    status: 200,
  });
}

describe("pixel-stage media verification", () => {
  it("verifies immutable public PNG bytes against the committed catalog", async () => {
    const png = createPngHeader(144, 192);

    const result = await verifyPixelStageMedia(createCatalog(png), {
      fetch: async () => createResponse(png),
    });

    assert.deepEqual(result, {
      verified: [
        {
          bytes: png.length,
          filename: "garden-tree-ball.png",
          src: "https://media.parrotbook.com/prototypes/pixel-stage/v1/garden-tree-ball.png",
        },
      ],
    });
  });

  it("reports content, cache, CORS, dimension, and hash failures together", async () => {
    const expected = createPngHeader(144, 192);
    const received = createPngHeader(120, 80);

    await assert.rejects(
      verifyPixelStageMedia(createCatalog(expected), {
        fetch: async () =>
          createResponse(received, {
            "access-control-allow-origin": "https://example.com",
            "cache-control": "max-age=60",
            "content-type": "application/octet-stream",
          }),
      }),
      (error) => {
        assert.match(error.message, /must return image\/png/);
        assert.match(error.message, /must use immutable caching/);
        assert.match(error.message, /must allow cross-origin loading/);
        assert.match(error.message, /must be 144x192/);
        assert.match(error.message, /does not match its catalog SHA-256/);
        return true;
      },
    );
  });
});
