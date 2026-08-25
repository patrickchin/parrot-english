/* global Buffer */

import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  loadPrivateStoryPreview,
  normalizeStoryBody,
  paginatePrivateStoryText,
} from "../lib/private-story-preview.js";
import { preparePrivateStoryPreview } from "../scripts/prepare-private-story-preview.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function words(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(
    " ",
  );
}

async function createFixtureRoot() {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "parrot-private-story-preview-"),
  );
  temporaryDirectories.push(projectRoot);
  const previewDirectory = path.join(
    projectRoot,
    "content/private-story-preview",
  );
  await mkdir(previewDirectory, { recursive: true });
  return { previewDirectory, projectRoot };
}

async function writePreviewFixture(
  fixture,
  {
    manifest = {
      version: 1,
      stories: [
        {
          id: "private-story-fixture",
          textFile: "story-1.txt",
          title: "Fixture Story",
        },
      ],
    },
    text = "# Fixture Story\n\nFirst complete paragraph.\n\nSecond complete paragraph!\n",
  } = {},
) {
  await writeFile(
    path.join(fixture.previewDirectory, "manifest.json"),
    JSON.stringify(manifest),
  );
  if (text !== null) {
    await writeFile(path.join(fixture.previewDirectory, "story-1.txt"), text);
  }
}

describe("private story pagination", () => {
  it("removes the leading H1 and preserves paragraph text with normalized fidelity", () => {
    const paginated = paginatePrivateStoryText(
      [
        "# Fixture Story",
        "",
        "First complete paragraph.",
        "",
        "Second complete paragraph!",
      ].join("\n"),
    );

    assert.deepEqual(paginated.pages, [
      "First complete paragraph.\n\nSecond complete paragraph!",
    ]);
    assert.equal(
      normalizeStoryBody(paginated.pages.join("\n\n")),
      normalizeStoryBody(paginated.body),
    );
  });

  it("uses complete non-empty lines as units when there are no blank lines", () => {
    const paginated = paginatePrivateStoryText(
      ["# Line Fixture", words(35, "first"), words(35, "second"), words(10, "third")].join(
        "\n",
      ),
    );

    assert.deepEqual(paginated.pages, [
      `${words(35, "first")}\n${words(35, "second")}`,
      words(10, "third"),
    ]);
  });

  it("packs source units greedily up to 70 words", () => {
    const paginated = paginatePrivateStoryText(
      ["# Boundary Fixture", words(40, "first"), words(30, "second"), words(1, "third")].join(
        "\n\n",
      ),
    );

    assert.deepEqual(paginated.pages, [
      `${words(40, "first")}\n\n${words(30, "second")}`,
      words(1, "third"),
    ]);
  });

  it("rejects a single source unit over 90 words", () => {
    assert.throws(
      () => paginatePrivateStoryText(`# Too Long\n\n${words(91)}`),
      /over 90 words/,
    );
  });
});

describe("private story preview loader", () => {
  it("loads an ignored-directory fixture and derives page audio metadata", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    await mkdir(
      path.join(
        fixture.previewDirectory,
        "audio/private-story-fixture",
      ),
      { recursive: true },
    );
    await writeFile(
      path.join(
        fixture.previewDirectory,
        "audio/private-story-fixture/page-001.mp3",
      ),
      "synthetic audio",
    );

    const result = await loadPrivateStoryPreview({ projectRoot: fixture.projectRoot });

    assert.deepEqual(result.markers, [
      "private-story-fixture",
      "Fixture Story",
      "First complete paragraph.\n\nSecond complete paragraph!",
      "/assets/private-story-preview/private-story-fixture/page-001.mp3",
    ]);
    assert.deepEqual(result.stories, [
      {
        assumedKnownWords: [],
        category: "Long stories",
        completionText: "You finished Fixture Story!",
        cover: { alt: "", prompt: "", src: null },
        durationMinutes: 1,
        id: "private-story-fixture",
        level: "long-stories",
        pages: [
          {
            artwork: { alt: "", prompt: "", src: null },
            id: "page-001",
            joinIn: "Turn the page!",
            joinInAudioId: null,
            narrationAudioId: null,
            narrationAudioSrc:
              "/assets/private-story-preview/private-story-fixture/page-001.mp3",
            text: "First complete paragraph.\n\nSecond complete paragraph!",
          },
        ],
        promptExperiment: {
          focus: "Read aloud",
          hypothesis: "Saved narration supports reading along.",
          instruction: "Listen and read along.",
        },
        summary: "Fixture Story",
        targetWords: [],
        title: "Fixture Story",
      },
    ]);
    assert.deepEqual(result.audioLines, {
      "private-story-fixture-page-001-narration": {
        lang: "en-GB",
        outputFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-fixture/page-001.mp3",
        ),
        speaker: "narrator",
        text: "First complete paragraph.\n\nSecond complete paragraph!",
      },
    });
    assert.deepEqual(result.assets, [
      {
        fileName: "assets/private-story-preview/private-story-fixture/page-001.mp3",
        outputFile: "assets/private-story-preview/private-story-fixture/page-001.mp3",
        outputFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-fixture/page-001.mp3",
        ),
        publicPath:
          "/assets/private-story-preview/private-story-fixture/page-001.mp3",
        sourceFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-fixture/page-001.mp3",
        ),
      },
    ]);
  });

  it("permits preparation without audio but requires it by default", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);

    const prepared = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });
    assert.equal(prepared.assets.length, 1);
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      /Missing required narration audio/,
    );
  });

  it("rejects duplicate and unsafe manifest IDs", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: "private-story-fixture", textFile: "story-1.txt", title: "Fixture Story" },
          { id: "private-story-fixture", textFile: "story-2.txt", title: "Other Fixture" },
        ],
      },
    });
    await writeFile(
      path.join(fixture.previewDirectory, "story-2.txt"),
      "# Other Fixture\n\nA second fixture.",
    );
    await assert.rejects(
      () =>
        loadPrivateStoryPreview({
          projectRoot: fixture.projectRoot,
          requireAudio: false,
        }),
      /duplicate story id/,
    );

    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [{ id: "private/unsafe", textFile: "story-1.txt", title: "Fixture Story" }],
      },
    });
    await assert.rejects(
      () =>
        loadPrivateStoryPreview({
          projectRoot: fixture.projectRoot,
          requireAudio: false,
        }),
      /safe private story id/,
    );
  });

  it("rejects traversal and absolute manifest paths", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: "private-story-fixture", textFile: "../story-1.txt", title: "Fixture Story" },
        ],
      },
    });
    await assert.rejects(
      () =>
        loadPrivateStoryPreview({
          projectRoot: fixture.projectRoot,
          requireAudio: false,
        }),
      /must stay inside the private preview directory/,
    );

    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: "private-story-fixture", textFile: "/story-1.txt", title: "Fixture Story" },
        ],
      },
    });
    await assert.rejects(
      () =>
        loadPrivateStoryPreview({
          projectRoot: fixture.projectRoot,
          requireAudio: false,
        }),
      /must stay inside the private preview directory/,
    );
  });

  it("rejects missing text and a title that does not match the leading H1", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, { text: null });
    await assert.rejects(
      () =>
        loadPrivateStoryPreview({
          projectRoot: fixture.projectRoot,
          requireAudio: false,
        }),
      /Unable to read private story text/,
    );

    await writePreviewFixture(fixture, {
      text: "# Different Heading\n\nSynthetic story body.",
    });
    await assert.rejects(
      () =>
        loadPrivateStoryPreview({
          projectRoot: fixture.projectRoot,
          requireAudio: false,
        }),
      /must match the leading Markdown H1/,
    );
  });
});

describe("private story preview preparation", () => {
  it("byte-copies two source files to generic names and creates opaque manifest IDs", async () => {
    const fixture = await createFixtureRoot();
    const sourcesDirectory = path.join(fixture.projectRoot, "synthetic-sources");
    await mkdir(sourcesDirectory);
    const sourceFiles = [
      path.join(sourcesDirectory, "first-source.txt"),
      path.join(sourcesDirectory, "second-source.txt"),
    ];
    const sourceBytes = [
      Buffer.from("# First Fixture\r\n\r\nOne synthetic body.\r\n"),
      Buffer.from("# Second Fixture\n\nTwo synthetic bodies.\n"),
    ];
    await Promise.all(sourceFiles.map((file, index) => writeFile(file, sourceBytes[index])));

    const manifest = await preparePrivateStoryPreview({
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    assert.deepEqual(manifest.version, 1);
    assert.deepEqual(
      manifest.stories.map(({ textFile, title }) => ({ textFile, title })),
      [
        { textFile: "story-1.txt", title: "First Fixture" },
        { textFile: "story-2.txt", title: "Second Fixture" },
      ],
    );
    assert.ok(
      manifest.stories.every(({ id }) => /^private-story-[a-f0-9]{12}$/.test(id)),
    );
    assert.notEqual(manifest.stories[0].id, manifest.stories[1].id);
    assert.deepEqual(
      await Promise.all(
        ["story-1.txt", "story-2.txt"].map((name) =>
          readFile(path.join(fixture.previewDirectory, name)),
        ),
      ),
      sourceBytes,
    );
    assert.equal(
      await readFile(path.join(fixture.previewDirectory, "manifest.json"), "utf8"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  });

  it("requires exactly two readable inputs and refuses manifest replacement without force", async () => {
    const fixture = await createFixtureRoot();
    const source = path.join(fixture.projectRoot, "fixture.txt");
    await writeFile(source, "# Fixture\n\nBody.");

    await assert.rejects(
      () =>
        preparePrivateStoryPreview({
          previewDirectory: fixture.previewDirectory,
          sourceFiles: [source],
        }),
      /exactly two readable source files/,
    );

    await writeFile(path.join(fixture.previewDirectory, "manifest.json"), "{}");
    await assert.rejects(
      () =>
        preparePrivateStoryPreview({
          previewDirectory: fixture.previewDirectory,
          sourceFiles: [source, source],
        }),
      /already exists.*--force/,
    );
    await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles: [source, source],
    });
    await access(path.join(fixture.previewDirectory, "manifest.json"));
    assert.equal((await stat(path.join(fixture.previewDirectory, "story-1.txt"))).isFile(), true);
  });
});
