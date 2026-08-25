/* global Buffer, process */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  link,
  mkdtemp,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import {
  loadPrivateStoryPreview,
  normalizeStoryBody,
  paginatePrivateStoryText,
} from "../lib/private-story-preview.js";
import { preparePrivateStoryPreview } from "../scripts/prepare-private-story-preview.mjs";

const temporaryDirectories = [];
const execFileAsync = promisify(execFile);

const defaultManifest = {
  version: 1,
  stories: [
    {
      id: "private-story-fixture",
      textFile: "story-1.txt",
      title: "Fixture Story",
    },
    {
      id: "private-story-second",
      textFile: "story-2.txt",
      title: "Second Fixture",
    },
  ],
};

const defaultTexts = {
  "story-1.txt": "# Fixture Story\n\nFirst complete paragraph.\n\nSecond complete paragraph!\n",
  "story-2.txt": "# Second Fixture\n\nA second synthetic page.\n",
};

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
    manifest = defaultManifest,
    text = defaultTexts["story-1.txt"],
    text2 = defaultTexts["story-2.txt"],
  } = {},
) {
  await writeFile(
    path.join(fixture.previewDirectory, "manifest.json"),
    JSON.stringify(manifest),
  );
  if (text !== null) {
    await writeFile(path.join(fixture.previewDirectory, "story-1.txt"), text);
  }
  if (text2 !== null) {
    await writeFile(path.join(fixture.previewDirectory, "story-2.txt"), text2);
  }
}

async function writeRequiredAudio(fixture, { emptyFirst = false } = {}) {
  for (const [id, contents] of [
    ["private-story-fixture", emptyFirst ? "" : "synthetic audio"],
    ["private-story-second", "second synthetic audio"],
  ]) {
    const directory = path.join(fixture.previewDirectory, "audio", id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "page-001.mp3"), contents);
  }
}

function transactionDirectoryFor(previewDirectory) {
  return path.join(
    path.dirname(previewDirectory),
    ".private-story-preview-transaction",
  );
}

async function writeBundle(directory, files) {
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, contents]) =>
      writeFile(path.join(directory, name), contents),
    ),
  );
}

async function readBundle(directory) {
  const names = (await readdir(directory)).sort();
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(path.join(directory, name))]),
    ),
  );
}

async function createPreparationSources(fixture, directoryName = "replacement-sources") {
  const sourcesDirectory = path.join(fixture.projectRoot, directoryName);
  await mkdir(sourcesDirectory);
  const sourceFiles = [
    path.join(sourcesDirectory, "new-one.txt"),
    path.join(sourcesDirectory, "new-two.txt"),
  ];
  const sourceBytes = [
    Buffer.from("# New One\n\nNew first body.\n"),
    Buffer.from("# New Two\n\nNew second body.\n"),
  ];
  await Promise.all(
    sourceFiles.map((file, index) => writeFile(file, sourceBytes[index])),
  );
  return { sourceBytes, sourceFiles };
}

const oldBundle = {
  "manifest.json": Buffer.from('{"version":1,"stories":[]}\n'),
  "story-1.txt": Buffer.from("# Old One\n\nOld first body.\n"),
  "story-2.txt": Buffer.from("# Old Two\n\nOld second body.\n"),
};

async function leavePartialBackupCleanupResidue(fixture, directoryName) {
  await writeBundle(fixture.previewDirectory, oldBundle);
  const { sourceBytes, sourceFiles } = await createPreparationSources(
    fixture,
    directoryName,
  );
  const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
  let injectedFailure = false;
  const manifest = await preparePrivateStoryPreview({
    fileSystem: {
      async rm(target, options) {
        const basename = path.basename(target);
        if (
          !injectedFailure &&
          (basename === "backup" || basename.includes(".backup-"))
        ) {
          injectedFailure = true;
          await rm(path.join(target, "story-1.txt"));
          throw new Error("Synthetic partial backup cleanup failure");
        }
        return rm(target, options);
      },
    },
    force: true,
    previewDirectory: fixture.previewDirectory,
    sourceFiles,
  });
  assert.equal(injectedFailure, true);
  return {
    manifest,
    sourceBytes,
    sourceFiles,
    transactionDirectory,
  };
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
    assert.deepEqual(
      paginated.pages.flatMap((page) => page.split("\n")),
      [
        words(35, "first"),
        words(35, "second"),
        words(10, "third"),
      ],
    );
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

  it("preserves multiple blank-line paragraph delimiters during pagination", () => {
    const rawText = [
      "# Delimiter Fixture",
      "",
      "First complete paragraph.",
      "",
      "",
      "",
      "Second complete paragraph!",
    ].join("\n");

    const paginated = paginatePrivateStoryText(rawText);

    assert.deepEqual(paginated.pages, [
      "First complete paragraph.\n\n\n\nSecond complete paragraph!",
    ]);
    assert.equal(
      normalizeStoryBody(paginated.body),
      normalizeStoryBody(rawText.replace(/^# Delimiter Fixture\n+/, "")),
    );
  });

  it("preserves source-normalized fidelity through an ordinary page join at a multi-blank boundary", () => {
    const sourceBody = [
      words(70, "first"),
      "",
      "",
      "",
      words(1, "second"),
    ].join("\n");
    const paginated = paginatePrivateStoryText(
      `# Boundary Delimiter Fixture\n${sourceBody}`,
    );

    assert.equal(paginated.pages.length, 2);
    assert.equal(
      normalizeStoryBody(sourceBody),
      normalizeStoryBody(paginated.pages.join("\n\n")),
    );
    assert.equal(normalizeStoryBody(paginated.body), normalizeStoryBody(sourceBody));
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
    await writeRequiredAudio(fixture);

    const result = await loadPrivateStoryPreview({ projectRoot: fixture.projectRoot });

    assert.deepEqual(result.markers, [
      "private-story-fixture",
      "Fixture Story",
      "First complete paragraph.\n\nSecond complete paragraph!",
      "/assets/private-story-preview/private-story-fixture/page-001.mp3",
      "private-story-second",
      "Second Fixture",
      "A second synthetic page.",
      "/assets/private-story-preview/private-story-second/page-001.mp3",
    ]);
    assert.deepEqual(result.excerptSourceGroups, [
      ["First complete paragraph.", "Second complete paragraph!"],
      ["A second synthetic page."],
    ]);
    assert.equal(Object.hasOwn(result, "excerptSourceUnits"), false);
    assert.equal(result.stories.length, 2);
    assert.deepEqual(result.stories[0], {
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
      });
    assert.deepEqual(
      result.stories[1].pages.map(({ id, narrationAudioSrc, text }) => ({
        id,
        narrationAudioSrc,
        text,
      })),
      [{
        id: "page-001",
        narrationAudioSrc:
          "/assets/private-story-preview/private-story-second/page-001.mp3",
        text: "A second synthetic page.",
      }],
    );
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
      "private-story-second-page-001-narration": {
        lang: "en-GB",
        outputFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-second/page-001.mp3",
        ),
        speaker: "narrator",
        text: "A second synthetic page.",
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
        source: Buffer.from("synthetic audio"),
        sourceFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-fixture/page-001.mp3",
        ),
      },
      {
        fileName: "assets/private-story-preview/private-story-second/page-001.mp3",
        outputFile: "assets/private-story-preview/private-story-second/page-001.mp3",
        outputFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-second/page-001.mp3",
        ),
        publicPath:
          "/assets/private-story-preview/private-story-second/page-001.mp3",
        source: Buffer.from("second synthetic audio"),
        sourceFilePath: path.join(
          fixture.previewDirectory,
          "audio/private-story-second/page-001.mp3",
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
    assert.equal(prepared.assets.length, 2);
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      /Missing required narration audio/,
    );
  });

  it("accepts a 32 MiB narration snapshot and rejects one byte more", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    await writeRequiredAudio(fixture);
    const audioFile = path.join(
      fixture.previewDirectory,
      "audio/private-story-fixture/page-001.mp3",
    );
    const byteLimit = 32 * 1024 * 1024;
    await truncate(audioFile, byteLimit);

    const atLimit = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
    });
    assert.equal(atLimit.assets[0].source.length, byteLimit);

    await truncate(audioFile, byteLimit + 1);
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      /Narration audio.*at most 33554432 bytes/,
    );
  });

  it("counts duplicate narration assets at the 64 MiB aggregate boundary", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      text: `# Fixture Story\n\n${words(70, "first-")}\n\nfinal\n`,
    });
    await writeRequiredAudio(fixture);
    const firstAudio = path.join(
      fixture.previewDirectory,
      "audio/private-story-fixture/page-001.mp3",
    );
    const duplicateAudio = path.join(
      fixture.previewDirectory,
      "audio/private-story-fixture/page-002.mp3",
    );
    const finalAudio = path.join(
      fixture.previewDirectory,
      "audio/private-story-second/page-001.mp3",
    );
    const duplicateSize = 32 * 1024 * 1024 - 1;
    await truncate(firstAudio, duplicateSize);
    await link(firstAudio, duplicateAudio);
    await truncate(finalAudio, 2);

    const atLimit = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
    });
    assert.equal(
      atLimit.assets.reduce((total, asset) => total + asset.source.length, 0),
      64 * 1024 * 1024,
    );
    atLimit.assets.length = 0;

    await truncate(finalAudio, 3);
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      { message: "Narration audio must total at most 67108864 bytes" },
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
        stories: [
          { id: "private/unsafe", textFile: "story-1.txt", title: "Fixture Story" },
          defaultManifest.stories[1],
        ],
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

  it("rejects duplicate manifest text-file basenames", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          defaultManifest.stories[0],
          {
            id: "private-story-second",
            textFile: "story-1.txt",
            title: "Fixture Story",
          },
        ],
      },
    });

    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      { message: "Private story preview manifest has duplicate text file" },
    );
  });

  it("rejects distinct manifest names that identify the same text file", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          defaultManifest.stories[0],
          {
            id: "private-story-second",
            textFile: "story-2.txt",
            title: "Fixture Story",
          },
        ],
      },
    });
    await rm(path.join(fixture.previewDirectory, "story-2.txt"));
    await link(
      path.join(fixture.previewDirectory, "story-1.txt"),
      path.join(fixture.previewDirectory, "story-2.txt"),
    );

    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      { message: "Private story preview manifest has duplicate text file" },
    );
  });

  it("rejects traversal and absolute manifest paths", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: "private-story-fixture", textFile: "../story-1.txt", title: "Fixture Story" },
          defaultManifest.stories[1],
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
          defaultManifest.stories[1],
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

  it("rejects a text-file symlink that escapes the private preview directory", async () => {
    const fixture = await createFixtureRoot();
    const outsideFile = path.join(fixture.projectRoot, "outside-story.txt");
    await writeFile(outsideFile, "# Fixture Story\n\nOutside fixture text.");
    await writePreviewFixture(fixture, { text: null });
    await symlink(
      outsideFile,
      path.join(fixture.previewDirectory, "story-1.txt"),
    );

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

  it("rejects private preview directories outside the real project root", async () => {
    const fixture = await createFixtureRoot();
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), "parrot-private-external-"));
    temporaryDirectories.push(externalRoot);
    const externalFixture = {
      previewDirectory: path.join(externalRoot, "preview"),
      projectRoot: fixture.projectRoot,
    };
    await mkdir(externalFixture.previewDirectory);
    await writePreviewFixture(externalFixture);

    await assert.rejects(
      () => loadPrivateStoryPreview({
        previewDirectory: externalFixture.previewDirectory,
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      /must stay inside the private preview directory/,
    );
  });

  it("rejects a symlinked private preview directory", async () => {
    const fixture = await createFixtureRoot();
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), "parrot-private-link-"));
    temporaryDirectories.push(externalRoot);
    const externalFixture = {
      previewDirectory: path.join(externalRoot, "preview"),
      projectRoot: externalRoot,
    };
    await mkdir(externalFixture.previewDirectory);
    await writePreviewFixture(externalFixture);
    await rm(fixture.previewDirectory, { recursive: true });
    await symlink(externalFixture.previewDirectory, fixture.previewDirectory);

    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      /must stay inside the private preview directory/,
    );
  });

  it("rejects a symlinked manifest", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    const externalManifest = path.join(fixture.projectRoot, "external-manifest.json");
    await writeFile(externalManifest, JSON.stringify(defaultManifest));
    await rm(path.join(fixture.previewDirectory, "manifest.json"));
    await symlink(externalManifest, path.join(fixture.previewDirectory, "manifest.json"));

    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      /must stay inside the private preview directory/,
    );
  });

  it("rejects a symlinked narration audio ancestor", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    const externalAudio = path.join(fixture.projectRoot, "external-audio");
    await mkdir(path.join(externalAudio, "private-story-fixture"), { recursive: true });
    await writeFile(
      path.join(externalAudio, "private-story-fixture/page-001.mp3"),
      "synthetic audio",
    );
    await mkdir(path.join(externalAudio, "private-story-second"));
    await writeFile(
      path.join(externalAudio, "private-story-second/page-001.mp3"),
      "second synthetic audio",
    );
    await symlink(externalAudio, path.join(fixture.previewDirectory, "audio"));

    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      /must stay inside the private preview directory/,
    );
  });

  it("rejects a symlinked narration audio file", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    await writeRequiredAudio(fixture);
    const externalAudio = path.join(fixture.projectRoot, "external-page.mp3");
    await writeFile(externalAudio, "synthetic audio");
    const audioFile = path.join(
      fixture.previewDirectory,
      "audio/private-story-fixture/page-001.mp3",
    );
    await rm(audioFile);
    await symlink(externalAudio, audioFile);

    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      /must stay inside the private preview directory/,
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      /must stay inside the private preview directory/,
    );
  });

  it("rejects a zero-byte narration MP3", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    await writeRequiredAudio(fixture, { emptyFirst: true });

    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot }),
      /non-empty regular MP3/,
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      /non-empty regular MP3/,
    );
  });

  it("requires exactly two stories", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture, {
      manifest: { version: 1, stories: [defaultManifest.stories[0]] },
    });
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /exactly 2 stories/,
    );

    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          ...defaultManifest.stories,
          { id: "private-story-third", textFile: "story-3.txt", title: "Third Fixture" },
        ],
      },
    });
    await writeFile(
      path.join(fixture.previewDirectory, "story-3.txt"),
      "# Third Fixture\n\nA third synthetic page.\n",
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /exactly 2 stories/,
    );
  });

  it("accepts story ID and title limits and rejects one character over", async () => {
    const fixture = await createFixtureRoot();
    const idAtLimit = `private-${"a".repeat(56)}`;
    const titleAtLimit = "T".repeat(160);
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: idAtLimit, textFile: "story-1.txt", title: titleAtLimit },
          defaultManifest.stories[1],
        ],
      },
      text: `# ${titleAtLimit}\n\nSynthetic body.\n`,
    });
    const atLimit = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });
    assert.equal(atLimit.stories[0].id.length, 64);
    assert.equal(atLimit.stories[0].title.length, 160);

    const idOverLimit = `private-${"a".repeat(57)}`;
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: idOverLimit, textFile: "story-1.txt", title: titleAtLimit },
          defaultManifest.stories[1],
        ],
      },
      text: `# ${titleAtLimit}\n\nSynthetic body.\n`,
    });
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /id must be at most 64 characters/,
    );

    const titleOverLimit = "T".repeat(161);
    await writePreviewFixture(fixture, {
      manifest: {
        version: 1,
        stories: [
          { id: "private-story-fixture", textFile: "story-1.txt", title: titleOverLimit },
          defaultManifest.stories[1],
        ],
      },
      text: `# ${titleOverLimit}\n\nSynthetic body.\n`,
    });
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /title must be at most 160 characters/,
    );
  });

  it("accepts the raw source byte limit and rejects removable whitespace one byte over", async () => {
    const fixture = await createFixtureRoot();
    const prefix = "# Fixture Story\n\n";
    const sourceAtLimit = `${prefix}${"!".repeat(131072 - Buffer.byteLength(prefix))}`;
    await writePreviewFixture(fixture, { text: sourceAtLimit });
    const atLimit = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });
    assert.equal(atLimit.stories.length, 2);

    await writePreviewFixture(fixture, { text: `${sourceAtLimit} ` });
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /source must be at most 131072 UTF-8 bytes/,
    );
  });

  it("accepts a 64 KiB manifest and rejects one byte more", async () => {
    const fixture = await createFixtureRoot();
    const manifestJson = JSON.stringify(defaultManifest);
    const manifestByteLimit = 64 * 1024;
    await writePreviewFixture(fixture);
    await writeFile(
      path.join(fixture.previewDirectory, "manifest.json"),
      `${manifestJson}${" ".repeat(manifestByteLimit - Buffer.byteLength(manifestJson))}`,
    );

    const atLimit = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });
    assert.equal(atLimit.stories.length, 2);

    await writeFile(
      path.join(fixture.previewDirectory, "manifest.json"),
      `${manifestJson}${" ".repeat(manifestByteLimit - Buffer.byteLength(manifestJson) + 1)}`,
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      { message: "Unable to read private story preview manifest" },
    );
  });

  it("rejects oversized manifest metadata before opening the file", async () => {
    const fixture = await createFixtureRoot();
    const manifestJson = JSON.stringify(defaultManifest);
    const manifestByteLimit = 64 * 1024;
    await writePreviewFixture(fixture);
    let openCalls = 0;
    const openImplementation = async (...args) => {
      openCalls += 1;
      return openFile(...args);
    };

    await loadPrivateStoryPreview({
      openImplementation,
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });
    assert.equal(openCalls, 3);

    openCalls = 0;
    await writeFile(
      path.join(fixture.previewDirectory, "manifest.json"),
      `${manifestJson}${" ".repeat(manifestByteLimit - Buffer.byteLength(manifestJson) + 1)}`,
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({
        openImplementation,
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      { message: "Unable to read private story preview manifest" },
    );
    assert.equal(openCalls, 0);
  });

  it("rejects malformed UTF-8 in the manifest and story source", async () => {
    const fixture = await createFixtureRoot();
    await writePreviewFixture(fixture);
    const validManifest = JSON.stringify(defaultManifest);
    const titleOffset = validManifest.indexOf("Fixture Story") + "Fixture ".length;
    await writeFile(
      path.join(fixture.previewDirectory, "manifest.json"),
      Buffer.concat([
        Buffer.from(validManifest.slice(0, titleOffset)),
        Buffer.from([0xff]),
        Buffer.from(validManifest.slice(titleOffset)),
      ]),
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      { message: "Unable to read private story preview manifest" },
    );

    await writeFile(
      path.join(fixture.previewDirectory, "manifest.json"),
      validManifest,
    );
    await writeFile(
      path.join(fixture.previewDirectory, "story-1.txt"),
      Buffer.concat([
        Buffer.from("# Fixture Story\n\nSynthetic body "),
        Buffer.from([0xff]),
        Buffer.from(".\n"),
      ]),
    );
    await assert.rejects(
      () => loadPrivateStoryPreview({
        projectRoot: fixture.projectRoot,
        requireAudio: false,
      }),
      { message: "Unable to read private story text" },
    );
  });

  it("accepts valid Unicode manifest and source text", async () => {
    const fixture = await createFixtureRoot();
    const unicodeManifest = {
      version: 1,
      stories: [
        {
          id: "private-story-fixture",
          textFile: "story-1.txt",
          title: "Café 月亮 🦊",
        },
        defaultManifest.stories[1],
      ],
    };
    await writePreviewFixture(fixture, {
      manifest: unicodeManifest,
      text: "# Café 月亮 🦊\n\nLumière 故事 ✨\n",
    });

    const result = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });

    assert.equal(result.stories[0].title, "Café 月亮 🦊");
    assert.equal(result.stories[0].pages[0].text, "Lumière 故事 ✨");
  });

  it("accepts 40 pages and 2000 words and rejects either limit over", async () => {
    const fixture = await createFixtureRoot();
    const fortyPages = Array.from(
      { length: 40 },
      (_, index) => words(50, `full${index}-`),
    ).join("\n\n");
    await writePreviewFixture(fixture, { text: `# Fixture Story\n\n${fortyPages}\n` });
    const atLimit = await loadPrivateStoryPreview({
      projectRoot: fixture.projectRoot,
      requireAudio: false,
    });
    assert.equal(atLimit.stories[0].pages.length, 40);
    assert.equal(
      atLimit.stories[0].pages.reduce((total, page) => total + wordCountForTest(page.text), 0),
      2000,
    );

    const fortyOnePages = Array.from(
      { length: 41 },
      (_, index) => words(48, `page${index}-`),
    ).join("\n\n");
    await writePreviewFixture(fixture, { text: `# Fixture Story\n\n${fortyOnePages}\n` });
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /must have at most 40 pages/,
    );

    const tooManyWords = [
      ...Array.from({ length: 28 }, (_, index) => words(70, `many${index}-`)),
      words(41, "over-"),
    ].join("\n\n");
    await writePreviewFixture(fixture, { text: `# Fixture Story\n\n${tooManyWords}\n` });
    await assert.rejects(
      () => loadPrivateStoryPreview({ projectRoot: fixture.projectRoot, requireAudio: false }),
      /must have at most 2000 words/,
    );
  });
});

describe("private story preview preparation", () => {
  it("uses exact repository ignore rules for private source and transaction directories", async () => {
    const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
    for (const [filePath, pattern] of [
      ["content/local-stories/synthetic.txt", "/content/local-stories/"],
      ["content/private-story-preview/synthetic.txt", "/content/private-story-preview/"],
      [
        "content/.private-story-preview-transaction/synthetic.txt",
        "/content/.private-story-preview-transaction/",
      ],
    ]) {
      const { stdout } = await execFileAsync(
        "git",
        ["check-ignore", "--no-index", "--verbose", filePath],
        { cwd: repositoryRoot, encoding: "utf8" },
      );
      assert.match(
        stdout.trim(),
        new RegExp(
          `\\.gitignore:\\d+:${pattern.replaceAll("/", "\\/")}\\s+${filePath.replaceAll("/", "\\/")}$`,
        ),
      );
    }
  });

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
    const secondSource = path.join(fixture.projectRoot, "fixture-two.txt");
    await writeFile(source, "# Fixture\n\nBody.");
    await writeFile(secondSource, "# Fixture Two\n\nSecond body.");

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
          sourceFiles: [source, secondSource],
        }),
      /already exists.*--force/,
    );
    await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles: [source, secondSource],
    });
    await access(path.join(fixture.previewDirectory, "manifest.json"));
    assert.equal((await stat(path.join(fixture.previewDirectory, "story-1.txt"))).isFile(), true);
  });

  it("rejects the same preparation source argument before destination mutation", async () => {
    const fixture = await createFixtureRoot();
    const source = path.join(fixture.projectRoot, "source.txt");
    const sourceBytes = Buffer.from("# Fixture\n\nSynthetic body.\n");
    await writeFile(source, sourceBytes);

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [source, source],
      }),
      { message: "Private story source files must be distinct" },
    );

    assert.deepEqual(await readdir(fixture.previewDirectory), []);
    assert.deepEqual(await readFile(source), sourceBytes);
  });

  it("rejects a symlink alias to the same preparation source", async () => {
    const fixture = await createFixtureRoot();
    const source = path.join(fixture.projectRoot, "source.txt");
    const alias = path.join(fixture.projectRoot, "source-alias.txt");
    const sourceBytes = Buffer.from("# Fixture\n\nSynthetic body.\n");
    await writeFile(source, sourceBytes);
    await symlink(source, alias);

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [source, alias],
      }),
      { message: "Private story source files must be distinct" },
    );

    assert.deepEqual(await readdir(fixture.previewDirectory), []);
    assert.deepEqual(await readFile(source), sourceBytes);
    assert.deepEqual(await readFile(alias), sourceBytes);
  });

  it("rejects a source symlink retargeted while it is being read", async () => {
    const fixture = await createFixtureRoot();
    const sourceOne = path.join(fixture.projectRoot, "source-one.txt");
    const sourceTwo = path.join(fixture.projectRoot, "source-two.txt");
    const alias = path.join(fixture.projectRoot, "source-alias.txt");
    const sourceOneBytes = Buffer.from("# Source One\n\nFirst synthetic body.\n");
    const sourceTwoBytes = Buffer.from("# Source Two\n\nSecond synthetic body.\n");
    await writeFile(sourceOne, sourceOneBytes);
    await writeFile(sourceTwo, sourceTwoBytes);
    await symlink(sourceOne, alias);
    let aliasRealpathCalls = 0;
    let swapped = false;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async realpath(file) {
            if (file === alias && ++aliasRealpathCalls === 2) {
              swapped = true;
              await unlink(alias);
              await symlink(sourceTwo, alias);
            }
            return realpath(file);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [alias, sourceTwo],
      }),
      { message: "Expected exactly two readable source files" },
    );

    assert.equal(swapped, true);
    assert.deepEqual(await readdir(fixture.previewDirectory), []);
    assert.deepEqual(await readFile(sourceOne), sourceOneBytes);
    assert.deepEqual(await readFile(sourceTwo), sourceTwoBytes);
  });

  it("rejects a hardlink alias to the same preparation source", async () => {
    const fixture = await createFixtureRoot();
    const source = path.join(fixture.projectRoot, "source.txt");
    const alias = path.join(fixture.projectRoot, "source-hardlink.txt");
    const sourceBytes = Buffer.from("# Fixture\n\nSynthetic body.\n");
    await writeFile(source, sourceBytes);
    await link(source, alias);

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [source, alias],
      }),
      { message: "Private story source files must be distinct" },
    );

    assert.deepEqual(await readdir(fixture.previewDirectory), []);
    assert.deepEqual(await readFile(source), sourceBytes);
    assert.deepEqual(await readFile(alias), sourceBytes);
  });

  it("fails closed when the filesystem cannot identify hardlink aliases", async () => {
    const fixture = await createFixtureRoot();
    const source = path.join(fixture.projectRoot, "source.txt");
    const alias = path.join(fixture.projectRoot, "source-hardlink.txt");
    const sourceBytes = Buffer.from("# Fixture\n\nSynthetic body.\n");
    await writeFile(source, sourceBytes);
    await link(source, alias);

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async stat(file, options) {
            const stats = await stat(file, options);
            if (file !== source && file !== alias) return stats;
            return { ...stats, ino: 0, isFile: () => stats.isFile() };
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [source, alias],
      }),
      {
        message:
          "Unable to verify that private story source files are distinct",
      },
    );

    assert.deepEqual(await readdir(fixture.previewDirectory), []);
    assert.deepEqual(await readFile(source), sourceBytes);
    assert.deepEqual(await readFile(alias), sourceBytes);
  });

  it("leaves an existing forced bundle unchanged when later source validation fails", async () => {
    const fixture = await createFixtureRoot();
    const oldFiles = {
      "manifest.json": Buffer.from('{"version":1,"stories":[]}\n'),
      "story-1.txt": Buffer.from("# Old One\n\nOld first body.\n"),
      "story-2.txt": Buffer.from("# Old Two\n\nOld second body.\n"),
    };
    await Promise.all(
      Object.entries(oldFiles).map(([name, contents]) =>
        writeFile(path.join(fixture.previewDirectory, name), contents),
      ),
    );
    const sourcesDirectory = path.join(fixture.projectRoot, "replacement-sources");
    await mkdir(sourcesDirectory);
    const sourceFiles = [
      path.join(sourcesDirectory, "valid.txt"),
      path.join(sourcesDirectory, "invalid.txt"),
    ];
    const sourceBytes = [
      Buffer.from("# New One\n\nNew first body.\n"),
      Buffer.from(`# New Two\n\nNew second body.${" ".repeat(131072)}`),
    ];
    await Promise.all(sourceFiles.map((file, index) => writeFile(file, sourceBytes[index])));

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /Markdown H1|at most 131072 UTF-8 bytes/,
    );

    assert.deepEqual(
      (await readdir(fixture.previewDirectory)).sort(),
      Object.keys(oldFiles).sort(),
    );
    for (const [name, contents] of Object.entries(oldFiles)) {
      assert.deepEqual(await readFile(path.join(fixture.previewDirectory, name)), contents);
    }
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("rejects an oversized source from metadata before reading its contents", async () => {
    const fixture = await createFixtureRoot();
    const { sourceFiles } = await createPreparationSources(
      fixture,
      "oversized-source-fixtures",
    );
    await truncate(sourceFiles[1], 131073);
    let oversizedSourceWasRead = false;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async readFile(file, options) {
            if (file === sourceFiles[1]) oversizedSourceWasRead = true;
            return readFile(file, options);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /source must be at most 131072 UTF-8 bytes/,
    );

    assert.equal(oversizedSourceWasRead, false);
  });

  it("rejects malformed UTF-8 preparation input before destination mutation", async () => {
    const fixture = await createFixtureRoot();
    const { sourceFiles } = await createPreparationSources(
      fixture,
      "malformed-utf8-sources",
    );
    await writeFile(
      sourceFiles[0],
      Buffer.concat([
        Buffer.from("# New One\n\nSynthetic body "),
        Buffer.from([0xff]),
        Buffer.from(".\n"),
      ]),
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      { message: "Private story source must be valid UTF-8" },
    );

    assert.deepEqual(await readdir(fixture.previewDirectory), []);
  });

  it("refuses source files inside the destination so originals cannot be replaced", async () => {
    const fixture = await createFixtureRoot();
    const sourceFiles = [
      path.join(fixture.previewDirectory, "original-one.txt"),
      path.join(fixture.previewDirectory, "original-two.txt"),
    ];
    const sourceBytes = [
      Buffer.from("# Original One\n\nFirst original body.\n"),
      Buffer.from("# Original Two\n\nSecond original body.\n"),
    ];
    await Promise.all(sourceFiles.map((file, index) => writeFile(file, sourceBytes[index])));

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /source files must stay outside the preview directory/,
    );

    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("refuses an outside source symlink whose real target is inside the destination", async () => {
    const fixture = await createFixtureRoot();
    const insideSource = path.join(fixture.previewDirectory, "original-inside.txt");
    const insideBytes = Buffer.from("# Inside Original\n\nOriginal body.\n");
    await writeFile(insideSource, insideBytes);
    const sourcesDirectory = path.join(fixture.projectRoot, "outside-sources");
    await mkdir(sourcesDirectory);
    const outsideAlias = path.join(sourcesDirectory, "inside-alias.txt");
    const outsideSecond = path.join(sourcesDirectory, "second-source.txt");
    const secondBytes = Buffer.from("# Outside Second\n\nSecond body.\n");
    await symlink(insideSource, outsideAlias);
    await writeFile(outsideSecond, secondBytes);

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [outsideAlias, outsideSecond],
      }),
      /source files must stay outside the preview directory/,
    );

    assert.deepEqual(await readFile(insideSource), insideBytes);
    assert.deepEqual(await readFile(outsideAlias), insideBytes);
    assert.deepEqual(await readFile(outsideSecond), secondBytes);
  });

  it("refuses a source alias into transaction residue so recovery cannot delete it", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const insideSource = path.join(transactionDirectory, "stage", "original.txt");
    const insideBytes = Buffer.from("# Transaction Original\n\nOriginal body.\n");
    await writeBundle(path.dirname(insideSource), {
      [path.basename(insideSource)]: insideBytes,
    });
    const sourcesDirectory = path.join(fixture.projectRoot, "transaction-alias-sources");
    await mkdir(sourcesDirectory);
    const outsideAlias = path.join(sourcesDirectory, "original-alias.txt");
    const outsideSecond = path.join(sourcesDirectory, "second.txt");
    const secondBytes = Buffer.from("# Outside Second\n\nSecond body.\n");
    await symlink(insideSource, outsideAlias);
    await writeFile(outsideSecond, secondBytes);

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles: [outsideAlias, outsideSecond],
      }),
      /source files must stay outside the preview and transaction directories/,
    );

    assert.deepEqual(await readFile(insideSource), insideBytes);
    assert.deepEqual(await readFile(outsideAlias), insideBytes);
    assert.deepEqual(await readFile(outsideSecond), secondBytes);
  });

  it("keeps the complete new bundle after backup cleanup partially deletes then throws", async () => {
    const fixture = await createFixtureRoot();
    const {
      manifest,
      sourceBytes,
      sourceFiles,
      transactionDirectory,
    } = await leavePartialBackupCleanupResidue(
      fixture,
      "partial-cleanup-sources",
    );

    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(
      activeBundle["manifest.json"],
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    );
    assert.deepEqual(await readdir(transactionDirectory), ["backup"]);
    assert.deepEqual(
      (await readdir(path.dirname(fixture.previewDirectory))).sort(),
      [path.basename(fixture.previewDirectory), path.basename(transactionDirectory)].sort(),
    );
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("cleans post-commit backup residue before starting the next replacement", async () => {
    const fixture = await createFixtureRoot();
    const { sourceBytes, sourceFiles, transactionDirectory } =
      await leavePartialBackupCleanupResidue(fixture, "recovery-cleanup-sources");

    const manifest = await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(
      activeBundle["manifest.json"],
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    );
    assert.deepEqual(await readdir(transactionDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("keeps a committed bundle when lock release fails and recovers the residual lock next time", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "committed-lock-release-sources",
    );
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const lockPath = path.join(transactionDirectory, "lock");

    const manifest = await preparePrivateStoryPreview({
      fileSystem: {
        async unlink(target) {
          if (target === lockPath) {
            throw new Error("Synthetic final lock release failure");
          }
          return unlink(target);
        },
      },
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    const committedBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(committedBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(committedBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(
      committedBundle["manifest.json"],
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    );
    assert.deepEqual(await readFile(lockPath, "utf8"), `${process.pid}\n`);

    await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    assert.deepEqual(await readdir(transactionDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("preserves a pre-commit error when lock release also fails and recovers next time", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "failed-commit-lock-release-sources",
    );
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const lockPath = path.join(transactionDirectory, "lock");
    let commitFailureInjected = false;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async rename(source, destination) {
            if (
              !commitFailureInjected &&
              destination === fixture.previewDirectory &&
              path.basename(source) === "stage"
            ) {
              commitFailureInjected = true;
              throw new Error("Synthetic commit rename failure");
            }
            return rename(source, destination);
          },
          async unlink(target) {
            if (target === lockPath) {
              throw new Error("Synthetic final lock release failure");
            }
            return unlink(target);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      (error) => {
        assert.equal(error.message, "Synthetic commit rename failure");
        return true;
      },
    );

    assert.equal(commitFailureInjected, true);
    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(await readFile(lockPath, "utf8"), `${process.pid}\n`);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );

    await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(await readdir(transactionDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("restores the byte-identical old bundle when the commit rename fails", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "commit-failure-sources",
    );
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    let commitSource;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async rename(source, destination) {
            if (
              !commitSource &&
              destination === fixture.previewDirectory &&
              (path.basename(source) === "stage" || path.basename(source).includes(".stage-"))
            ) {
              commitSource = source;
              throw new Error("Synthetic commit rename failure");
            }
            return rename(source, destination);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /Synthetic commit rename failure/,
    );

    assert.equal(path.dirname(commitSource), transactionDirectory);
    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("recovers an absent destination from backup and removes a stale stage", async () => {
    const fixture = await createFixtureRoot();
    await rm(fixture.previewDirectory, { recursive: true });
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    await writeBundle(path.join(transactionDirectory, "backup"), oldBundle);
    await writeBundle(path.join(transactionDirectory, "stage"), {
      "partial.txt": Buffer.from("incomplete staged output"),
    });
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "absent-destination-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /already exists.*--force/,
    );

    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(await readdir(transactionDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("treats an existing destination as authoritative and cleans crash residue first", async () => {
    const fixture = await createFixtureRoot();
    const authoritativeBundle = {
      ...oldBundle,
      "story-1.txt": Buffer.from("# Authoritative One\n\nCommitted body.\n"),
    };
    await writeBundle(fixture.previewDirectory, authoritativeBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    await writeBundle(path.join(transactionDirectory, "backup"), oldBundle);
    await writeBundle(path.join(transactionDirectory, "stage"), {
      "partial.txt": Buffer.from("stale staged output"),
    });
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "authoritative-destination-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /already exists.*--force/,
    );

    assert.deepEqual(
      await readBundle(fixture.previewDirectory),
      authoritativeBundle,
    );
    assert.deepEqual(await readdir(transactionDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("refuses a new transaction when crash-residue cleanup still fails", async () => {
    const fixture = await createFixtureRoot();
    const authoritativeBundle = {
      ...oldBundle,
      "story-2.txt": Buffer.from("# Authoritative Two\n\nCommitted body.\n"),
    };
    await writeBundle(fixture.previewDirectory, authoritativeBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const backupDirectory = path.join(transactionDirectory, "backup");
    await writeBundle(backupDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "failed-recovery-cleanup-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async rm(target, options) {
            if (target === backupDirectory) {
              await rm(path.join(target, "story-1.txt"));
              throw new Error("Synthetic recovery cleanup failure");
            }
            return rm(target, options);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /Synthetic recovery cleanup failure/,
    );

    assert.deepEqual(
      await readBundle(fixture.previewDirectory),
      authoritativeBundle,
    );
    assert.deepEqual(await readdir(transactionDirectory), ["backup"]);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("rejects a symlinked transaction root without touching the active bundle", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const outsideDirectory = path.join(fixture.projectRoot, "outside-transaction");
    await mkdir(outsideDirectory);
    await symlink(
      outsideDirectory,
      transactionDirectoryFor(fixture.previewDirectory),
    );
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "symlinked-transaction-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /transaction root must be a real directory/,
    );

    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(await readdir(outsideDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("rejects a symlinked transaction component without following it", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const outsideDirectory = path.join(fixture.projectRoot, "outside-stage");
    await mkdir(transactionDirectory);
    await mkdir(outsideDirectory);
    await symlink(outsideDirectory, path.join(transactionDirectory, "stage"));
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "symlinked-component-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /transaction entries must be real files or directories/,
    );

    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(await readdir(outsideDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("fails closed on an unknown transaction entry", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    await mkdir(transactionDirectory);
    await writeFile(
      path.join(transactionDirectory, "unknown"),
      "ambiguous residue",
    );
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "unknown-entry-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /Unexpected private story transaction entry/,
    );

    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("reserves the transaction before the new lock handle finishes closing", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "acquisition-race-sources",
    );
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const lockPath = path.join(transactionDirectory, "lock");
    let releaseLockClose;
    const lockCloseGate = new Promise((resolve) => {
      releaseLockClose = resolve;
    });
    let reportLockCloseStarted;
    const lockCloseStarted = new Promise((resolve) => {
      reportLockCloseStarted = resolve;
    });
    let wrappedLockHandle = false;
    const firstWriter = preparePrivateStoryPreview({
      fileSystem: {
        async open(target, flags, mode) {
          const handle = await openFile(target, flags, mode);
          if (target !== lockPath || wrappedLockHandle) return handle;
          wrappedLockHandle = true;
          return {
            async close() {
              reportLockCloseStarted();
              await lockCloseGate;
              return handle.close();
            },
            sync: handle.sync.bind(handle),
            writeFile: handle.writeFile.bind(handle),
          };
        },
      },
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });
    await lockCloseStarted;

    let secondWriterAssertion;
    try {
      await assert.rejects(
        () => preparePrivateStoryPreview({
          force: true,
          previewDirectory: fixture.previewDirectory,
          sourceFiles,
        }),
        /preparation is already in progress/,
      );
    } catch (error) {
      secondWriterAssertion = error;
    } finally {
      releaseLockClose();
    }
    await firstWriter.catch((error) => {
      if (!secondWriterAssertion) throw error;
    });
    if (secondWriterAssertion) throw secondWriterAssertion;

    assert.equal(wrappedLockHandle, true);
    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(await readdir(transactionDirectory), []);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("uses the real transaction root identity across a symlinked parent alias", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "aliased-parent-concurrency-sources",
    );
    const aliasParent = path.join(fixture.projectRoot, "content-alias");
    await symlink(path.dirname(fixture.previewDirectory), aliasParent);
    const aliasedPreviewDirectory = path.join(
      aliasParent,
      path.basename(fixture.previewDirectory),
    );
    let releaseFirstWriter;
    const firstWriterGate = new Promise((resolve) => {
      releaseFirstWriter = resolve;
    });
    let reportFirstWriterPaused;
    const firstWriterPaused = new Promise((resolve) => {
      reportFirstWriterPaused = resolve;
    });
    let interceptedCommit = false;
    const firstWriter = preparePrivateStoryPreview({
      fileSystem: {
        async rename(source, destination) {
          if (
            !interceptedCommit &&
            destination === fixture.previewDirectory &&
            path.basename(source) === "stage"
          ) {
            interceptedCommit = true;
            reportFirstWriterPaused();
            await firstWriterGate;
          }
          return rename(source, destination);
        },
      },
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });
    await firstWriterPaused;

    let secondWriterAssertion;
    try {
      await assert.rejects(
        () => preparePrivateStoryPreview({
          force: true,
          previewDirectory: aliasedPreviewDirectory,
          sourceFiles,
        }),
        /preparation is already in progress/,
      );
    } catch (error) {
      secondWriterAssertion = error;
    } finally {
      releaseFirstWriter();
    }
    await firstWriter.catch((error) => {
      if (!secondWriterAssertion) throw error;
    });
    if (secondWriterAssertion) throw secondWriterAssertion;

    assert.equal(interceptedCommit, true);
    const activeBundle = await readBundle(aliasedPreviewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("preserves a lock write error when close and partial-lock cleanup also fail", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "lock-write-failure-sources",
    );
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const lockPath = path.join(transactionDirectory, "lock");
    const writeError = new Error("Synthetic lock write failure");
    const closeError = new Error("Synthetic lock close failure");
    const unlinkError = new Error("Synthetic partial-lock cleanup failure");
    let closeAttempted = false;
    let unlinkAttempted = false;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async open(target, flags, mode) {
            const handle = await openFile(target, flags, mode);
            if (target !== lockPath) return handle;
            return {
              async close() {
                closeAttempted = true;
                await handle.close();
                throw closeError;
              },
              sync: handle.sync.bind(handle),
              async writeFile() {
                throw writeError;
              },
            };
          },
          async unlink(target) {
            if (target === lockPath) {
              unlinkAttempted = true;
              throw unlinkError;
            }
            return unlink(target);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      (error) => {
        assert.equal(error.message, writeError.message);
        assert.equal(error.cause, writeError);
        return true;
      },
    );

    assert.equal(closeAttempted, true);
    assert.equal(unlinkAttempted, true);
    assert.deepEqual(await readdir(transactionDirectory), ["lock"]);
    assert.equal((await stat(lockPath)).size, 0);
    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /transaction lock is ambiguous/,
    );
    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("preserves a lock read error when closing its handle also fails", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "lock-read-failure-sources",
    );
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    const lockPath = path.join(transactionDirectory, "lock");
    await mkdir(transactionDirectory);
    await writeFile(lockPath, `${process.pid}\n`);
    const readError = new Error("Synthetic lock read failure");
    const closeError = new Error("Synthetic lock close failure");
    let closeAttempted = false;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async open(target, flags, mode) {
            const handle = await openFile(target, flags, mode);
            if (target !== lockPath) return handle;
            return {
              async close() {
                closeAttempted = true;
                await handle.close();
                throw closeError;
              },
              async readFile() {
                throw readError;
              },
              stat: handle.stat.bind(handle),
            };
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      (error) => {
        assert.equal(
          error.message,
          "Private story transaction lock is ambiguous",
        );
        assert.equal(error.cause?.cause, readError);
        return true;
      },
    );

    assert.equal(closeAttempted, true);
    assert.deepEqual(await readFile(lockPath, "utf8"), `${process.pid}\n`);

    await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(await readdir(transactionDirectory), []);
  });

  it("recovers a transaction protected only by a dead local lock owner", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, "lock"), "99999999\n");
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "dead-lock-sources",
    );

    await preparePrivateStoryPreview({
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });

    assert.deepEqual(await readdir(transactionDirectory), []);
    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("fails closed when stale-lock recovery is already claimed", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    await mkdir(path.join(transactionDirectory, "recovery"), { recursive: true });
    await writeFile(path.join(transactionDirectory, "lock"), "99999999\n");
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "claimed-recovery-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /transaction lock is ambiguous/,
    );

    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(
      (await readdir(transactionDirectory)).sort(),
      ["lock", "recovery"],
    );
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("fails closed on an ambiguous local lock owner", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const transactionDirectory = transactionDirectoryFor(fixture.previewDirectory);
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, "lock"), "not-a-pid\n");
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "ambiguous-lock-sources",
    );

    await assert.rejects(
      () => preparePrivateStoryPreview({
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /transaction lock is ambiguous/,
    );

    assert.deepEqual(await readBundle(fixture.previewDirectory), oldBundle);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });

  it("rejects a second writer while the first holds the transaction lock", async () => {
    const fixture = await createFixtureRoot();
    await writeBundle(fixture.previewDirectory, oldBundle);
    const { sourceBytes, sourceFiles } = await createPreparationSources(
      fixture,
      "concurrent-writer-sources",
    );
    let releaseFirstWriter;
    const firstWriterGate = new Promise((resolve) => {
      releaseFirstWriter = resolve;
    });
    let reportFirstWriterPaused;
    const firstWriterPaused = new Promise((resolve) => {
      reportFirstWriterPaused = resolve;
    });
    let interceptedCommit = false;
    const firstWriter = preparePrivateStoryPreview({
      fileSystem: {
        async rename(source, destination) {
          if (
            !interceptedCommit &&
            destination === fixture.previewDirectory &&
            (path.basename(source) === "stage" || path.basename(source).includes(".stage-"))
          ) {
            interceptedCommit = true;
            reportFirstWriterPaused();
            await firstWriterGate;
          }
          return rename(source, destination);
        },
      },
      force: true,
      previewDirectory: fixture.previewDirectory,
      sourceFiles,
    });
    await firstWriterPaused;

    let secondWriterAssertion;
    try {
      await assert.rejects(
        () => preparePrivateStoryPreview({
          force: true,
          previewDirectory: fixture.previewDirectory,
          sourceFiles,
        }),
        /preparation is already in progress/,
      );
    } catch (error) {
      secondWriterAssertion = error;
    } finally {
      releaseFirstWriter();
    }
    await firstWriter.catch((error) => {
      if (!secondWriterAssertion) throw error;
    });
    if (secondWriterAssertion) throw secondWriterAssertion;

    const activeBundle = await readBundle(fixture.previewDirectory);
    assert.deepEqual(activeBundle["story-1.txt"], sourceBytes[0]);
    assert.deepEqual(activeBundle["story-2.txt"], sourceBytes[1]);
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });
});

function wordCountForTest(text) {
  return text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
}
