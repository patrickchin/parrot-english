/* global Buffer */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
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
  it("uses the repository ignore rules for both private source directories", async () => {
    const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
    for (const [filePath, pattern] of [
      ["content/local-stories/synthetic.txt", "/content/local-stories/"],
      ["content/private-story-preview/synthetic.txt", "/content/private-story-preview/"],
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

  it("rolls back the old bundle when post-install backup cleanup fails", async () => {
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
    const sourcesDirectory = path.join(fixture.projectRoot, "cleanup-failure-sources");
    await mkdir(sourcesDirectory);
    const sourceFiles = [
      path.join(sourcesDirectory, "new-one.txt"),
      path.join(sourcesDirectory, "new-two.txt"),
    ];
    const sourceBytes = [
      Buffer.from("# New One\n\nNew first body.\n"),
      Buffer.from("# New Two\n\nNew second body.\n"),
    ];
    await Promise.all(sourceFiles.map((file, index) => writeFile(file, sourceBytes[index])));
    let failedBackupCleanup = false;

    await assert.rejects(
      () => preparePrivateStoryPreview({
        fileSystem: {
          async rm(target, options) {
            if (!failedBackupCleanup && path.basename(target).includes(".backup-")) {
              failedBackupCleanup = true;
              throw new Error("Synthetic backup cleanup failure");
            }
            return rm(target, options);
          },
        },
        force: true,
        previewDirectory: fixture.previewDirectory,
        sourceFiles,
      }),
      /Synthetic backup cleanup failure/,
    );

    assert.equal(failedBackupCleanup, true);
    assert.deepEqual(
      (await readdir(fixture.previewDirectory)).sort(),
      Object.keys(oldFiles).sort(),
    );
    for (const [name, contents] of Object.entries(oldFiles)) {
      assert.deepEqual(await readFile(path.join(fixture.previewDirectory, name)), contents);
    }
    assert.deepEqual(
      await readdir(path.dirname(fixture.previewDirectory)),
      [path.basename(fixture.previewDirectory)],
    );
    assert.deepEqual(
      await Promise.all(sourceFiles.map((file) => readFile(file))),
      sourceBytes,
    );
  });
});

function wordCountForTest(text) {
  return text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
}
