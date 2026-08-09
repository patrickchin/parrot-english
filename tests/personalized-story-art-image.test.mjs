import assert from "node:assert/strict";
import sharp from "sharp";
import { describe, it } from "node:test";

async function createTaggedPng({ width, height }) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .withMetadata({
      density: 144,
      exif: {
        IFD0: {
          Artist: "Parent camera roll",
          Copyright: "Private",
        },
      },
    })
    .toBuffer();
}

describe("personalized story art image pipeline", () => {
  it("rejects forged PNG uploads and corrupt critical-chunk checksums", async () => {
    const { createPersonalizedStoryArtImage } = await import(
      "../worker/personalized-story-art-image.ts"
    );
    const valid = await createTaggedPng({ width: 480, height: 320 });
    const corrupted = new Uint8Array(valid);
    corrupted[32] ^= 0xff;
    let aiCalls = 0;
    const ai = {
      async run() {
        aiCalls += 1;
        return { image: "" };
      },
    };

    await assert.rejects(
      createPersonalizedStoryArtImage({
        ai,
        prompt: "Replace only the child.",
        sceneImage: new File([valid], "scene.png", { type: "image/png" }),
        sourceImage: new File([valid], "forged.jpg", { type: "image/jpeg" }),
      }),
      /PNG/i,
    );
    await assert.rejects(
      createPersonalizedStoryArtImage({
        ai,
        prompt: "Replace only the child.",
        sceneImage: new File([valid], "scene.png", { type: "image/png" }),
        sourceImage: new File([corrupted], "corrupt.png", {
          type: "image/png",
        }),
      }),
      /CRC|corrupt/i,
    );
    assert.equal(aiCalls, 0);
  });

  it("rejects uploaded PNGs that are not below the provider's 512px input limit", async () => {
    const { createPersonalizedStoryArtImage } = await import(
      "../worker/personalized-story-art-image.ts"
    );
    let aiCalls = 0;
    const oversized = await createTaggedPng({ width: 481, height: 480 });
    const scene = await createTaggedPng({ width: 480, height: 320 });

    await assert.rejects(
      createPersonalizedStoryArtImage({
        ai: {
          async run() {
            aiCalls += 1;
            return { image: "" };
          },
        },
        prompt: "Replace only the child in image 0 with the learner in image 1.",
        sceneImage: new File([scene], "scene.png", { type: "image/png" }),
        sourceImage: new File([oversized], "source.png", { type: "image/png" }),
      }),
      (error) => {
        assert.match(String(error?.message ?? error), /480px/i);
        return true;
      },
    );
    assert.equal(aiCalls, 0);
  });

  it("strips source metadata and converts Workers AI base64 output into stored WebP bytes", async () => {
    const { createPersonalizedStoryArtImage } = await import(
      "../worker/personalized-story-art-image.ts"
    );
    const source = await createTaggedPng({ width: 480, height: 384 });
    const scene = await createTaggedPng({ width: 480, height: 320 });
    let providerInput = null;
    const providerWebp = await sharp({
      create: {
        width: 512,
        height: 384,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    })
      .webp()
      .toBuffer();

    const result = await createPersonalizedStoryArtImage({
      ai: {
        async run(model, payload) {
          const multipart = payload.multipart;
          assert.ok(multipart?.body);
          assert.match(multipart.contentType, /^multipart\/form-data; boundary=/);
          const form = await new Response(multipart.body, {
            headers: { "Content-Type": multipart.contentType },
          }).formData();
          providerInput = { form, model };
          return { image: providerWebp.toString("base64") };
        },
      },
      prompt: "Replace only the child in image 0 with the learner in image 1.",
      sceneImage: new File([scene], "scene.png", { type: "image/png" }),
      sourceImage: new File([source], "source.png", { type: "image/png" }),
    });

    assert.equal(providerInput.model, "@cf/black-forest-labs/flux-2-klein-4b");
    assert.equal(
      providerInput.form.get("prompt"),
      "Replace only the child in image 0 with the learner in image 1.",
    );
    assert.equal(providerInput.form.get("width"), "1152");
    assert.equal(providerInput.form.get("height"), "768");
    assert.equal(providerInput.form.get("input_image_0").type, "image/png");
    assert.equal(providerInput.form.get("input_image_1").type, "image/png");

    const learnerSource = Buffer.from(
      await providerInput.form.get("input_image_1").arrayBuffer(),
    );
    const sourceMetadata = await sharp(learnerSource).metadata();
    assert.equal(sourceMetadata.width, 480);
    assert.equal(sourceMetadata.height, 384);
    assert.equal(sourceMetadata.format, "png");
    assert.equal(sourceMetadata.exif, undefined);
    assert.equal(sourceMetadata.icc, undefined);

    const outputMetadata = await sharp(result.bytes).metadata();
    assert.equal(outputMetadata.format, "webp");
    assert.equal(result.contentType, "image/webp");
  });

  it("rejects provider output that is not a supported raster image", async () => {
    const { createPersonalizedStoryArtImage } = await import(
      "../worker/personalized-story-art-image.ts"
    );
    const source = await createTaggedPng({ width: 480, height: 320 });

    await assert.rejects(
      createPersonalizedStoryArtImage({
        ai: {
          async run() {
            return { image: Buffer.from("not an image").toString("base64") };
          },
        },
        prompt: "Replace only the child.",
        sceneImage: new File([source], "scene.png", { type: "image/png" }),
        sourceImage: new File([source], "source.png", { type: "image/png" }),
      }),
      /supported image|provider/i,
    );
  });

  it("preserves the detected provider output content type and extension", async () => {
    const { createPersonalizedStoryArtImage } = await import(
      "../worker/personalized-story-art-image.ts"
    );
    const source = await createTaggedPng({ width: 480, height: 320 });
    const scene = await createTaggedPng({ width: 480, height: 320 });
    const rasterOutputs = [
      {
        build: () =>
          sharp({
            create: {
              width: 512,
              height: 384,
              channels: 3,
              background: { r: 220, g: 180, b: 80 },
            },
          })
            .jpeg()
            .toBuffer(),
        contentType: "image/jpeg",
        extension: "jpg",
      },
      {
        build: () =>
          sharp({
            create: {
              width: 512,
              height: 384,
              channels: 4,
              background: { r: 40, g: 130, b: 200, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
        contentType: "image/png",
        extension: "png",
      },
      {
        build: () =>
          sharp({
            create: {
              width: 512,
              height: 384,
              channels: 4,
              background: { r: 40, g: 180, b: 120, alpha: 1 },
            },
          })
            .webp()
            .toBuffer(),
        contentType: "image/webp",
        extension: "webp",
      },
    ];

    for (const expected of rasterOutputs) {
      const bytes = await expected.build();
      const result = await createPersonalizedStoryArtImage({
        ai: {
          async run() {
            return { image: bytes.toString("base64") };
          },
        },
        prompt: "Replace only the child.",
        sceneImage: new File([scene], "scene.png", { type: "image/png" }),
        sourceImage: new File([source], "source.png", { type: "image/png" }),
      });

      assert.equal(result.contentType, expected.contentType);
      assert.equal(result.extension, expected.extension);
    }
  });
});
