import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { runBackgroundPublisher } from "../scripts/publish-backgrounds.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function createVp8xWebp(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

async function createPublisherFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "parrot-media-publisher-"));
  temporaryDirectories.push(cwd);
  const stagingDirectory = path.join(
    cwd,
    "tmp/imagegen/backgrounds/playground-day",
  );
  await mkdir(stagingDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(stagingDirectory, "landscape.webp"),
      createVp8xWebp(2048, 1152),
    ),
    writeFile(path.join(stagingDirectory, "original.png"), "source-image"),
    writeFile(
      path.join(stagingDirectory, "prompt.json"),
      JSON.stringify({ prompt: "Create a sunny playground background." }),
    ),
  ]);

  const manifestFile = "tmp/imagegen/backgrounds/publish.json";
  await writeFile(
    path.join(cwd, manifestFile),
    JSON.stringify({
      assets: [
        {
          alt: "A sunny playground with a swing and slide",
          finalFile:
            "tmp/imagegen/backgrounds/playground-day/landscape.webp",
          id: "playground-day",
          promptFile:
            "tmp/imagegen/backgrounds/playground-day/prompt.json",
          sourceFile:
            "tmp/imagegen/backgrounds/playground-day/original.png",
          version: 1,
        },
      ],
      schemaVersion: 1,
    }),
  );
  return { cwd, manifestFile };
}

function createEnvironment() {
  return {
    PARROT_MEDIA_ORIGIN: "https://media.example.com",
    PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
    PARROT_MEDIA_SOURCE_BUCKET: "parrot-english-art-source",
  };
}

function createSuccessfulHeadResponse() {
  return new Response(null, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": "482193",
      "content-type": "image/webp",
    },
    status: 200,
  });
}

describe("background publisher CLI", () => {
  it("defaults to a dry run and prints catalog entries without running Wrangler", async () => {
    const { cwd, manifestFile } = await createPublisherFixture();
    let output = "";

    const result = await runBackgroundPublisher({
      args: ["--manifest", manifestFile],
      cwd,
      env: createEnvironment(),
      runCommand() {
        throw new Error("Wrangler must not run during a dry run");
      },
      writeOutput(value) {
        output += value;
      },
    });

    assert.equal(result.applied, false);
    assert.equal(result.uploadCount, 3);
    assert.match(output, /Dry run: 3 objects validated/);
    assert.match(
      output,
      /https:\/\/media\.example\.com\/backgrounds\/playground-day\/v1\/landscape\.webp/,
    );
  });

  it("preflights every immutable key before uploading and verifies delivery", async () => {
    const { cwd, manifestFile } = await createPublisherFixture();
    const commands = [];

    const result = await runBackgroundPublisher({
      args: ["--manifest", manifestFile, "--apply"],
      cwd,
      env: createEnvironment(),
      fetch: async () => createSuccessfulHeadResponse(),
      runCommand(command, args) {
        commands.push({ args, command });
        if (args.includes("get")) {
          return {
            status: 1,
            stderr: "The specified key does not exist.",
          };
        }
        return { status: 0, stderr: "" };
      },
      writeOutput() {},
    });

    assert.equal(result.applied, true);
    assert.deepEqual(result.verified, [
      {
        bytes: 482193,
        id: "playground-day",
        src: "https://media.example.com/backgrounds/playground-day/v1/landscape.webp",
      },
    ]);
    assert.equal(
      commands.filter(({ args }) => args.includes("get")).length,
      3,
    );
    assert.equal(
      commands.filter(({ args }) => args.includes("put")).length,
      3,
    );
    assert.ok(
      commands
        .filter(({ args }) => args.includes("put"))
        .at(-1)
        .args.includes("public, max-age=31536000, immutable"),
    );
  });

  it("refuses to overwrite an existing versioned object", async () => {
    const { cwd, manifestFile } = await createPublisherFixture();
    const commands = [];

    await assert.rejects(
      runBackgroundPublisher({
        args: ["--manifest", manifestFile, "--apply"],
        cwd,
        env: createEnvironment(),
        runCommand(command, args) {
          commands.push({ args, command });
          return { status: 0, stderr: "" };
        },
        writeOutput() {},
      }),
      /already exists; increment the asset version/,
    );
    assert.equal(
      commands.filter(({ args }) => args.includes("put")).length,
      0,
    );
  });

  it("requires explicit media configuration", async () => {
    const { cwd, manifestFile } = await createPublisherFixture();

    await assert.rejects(
      runBackgroundPublisher({
        args: ["--manifest", manifestFile],
        cwd,
        env: {},
        writeOutput() {},
      }),
      /PARROT_MEDIA_ORIGIN must be set/,
    );
  });
});
