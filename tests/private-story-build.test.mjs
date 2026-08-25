/* global Buffer */

import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "node:process";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import viteConfig, {
  createViteConfig,
  getPrivateStoryPreviewBuildData,
  privateStoryPreviewAssets,
} from "../vite.config.ts";

const temporaryDirectories = [];
const originalPrivatePreviewFlag = env.PARROT_PRIVATE_STORY_PREVIEW;
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const viteManagedEnvironmentKeys = [
  "NODE_ENV",
  "VITE_USER_NODE_ENV",
  "BROWSER",
  "BROWSER_ARGS",
  "DEBUG",
];

function snapshotEnvironment(keys) {
  return new Map(
    keys.map((key) => [
      key,
      {
        present: Object.hasOwn(env, key),
        value: env[key],
      },
    ]),
  );
}

function restoreEnvironment(snapshot) {
  for (const [key, { present, value }] of snapshot) {
    if (present) env[key] = value;
    else delete env[key];
  }
}

afterEach(async () => {
  if (originalPrivatePreviewFlag === undefined) {
    delete env.PARROT_PRIVATE_STORY_PREVIEW;
  } else {
    env.PARROT_PRIVATE_STORY_PREVIEW = originalPrivatePreviewFlag;
  }
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createFixture({ withAudio }) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "parrot-private-story-build-"),
  );
  temporaryDirectories.push(projectRoot);
  const previewDirectory = path.join(projectRoot, "synthetic-preview");
  const audioDirectories = [
    path.join(previewDirectory, "audio/private-fixture"),
    path.join(previewDirectory, "audio/private-second"),
  ];
  await Promise.all(audioDirectories.map((directory) => mkdir(directory, { recursive: true })));
  await writeFile(
    path.join(previewDirectory, "manifest.json"),
    JSON.stringify({
      version: 1,
      stories: [
        {
          id: "private-fixture",
          textFile: "story-1.txt",
          title: "Synthetic Fixture",
        },
        {
          id: "private-second",
          textFile: "story-2.txt",
          title: "Second Synthetic Fixture",
        },
      ],
    }),
  );
  await writeFile(
    path.join(previewDirectory, "story-1.txt"),
    "# Synthetic Fixture\n\nA synthetic story page for a build boundary test.\n",
  );
  await writeFile(
    path.join(previewDirectory, "story-2.txt"),
    "# Second Synthetic Fixture\n\nA second synthetic build page.\n",
  );

  const audioBytes = [
    Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x7f]),
    Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x7e]),
  ];
  if (withAudio) {
    await Promise.all(
      audioDirectories.map((directory, index) =>
        writeFile(path.join(directory, "page-001.mp3"), audioBytes[index]),
      ),
    );
  }
  await writeFile(path.join(audioDirectories[0], "not-allowlisted.mp3"), "do not emit");

  return { audioBytes, previewDirectory, projectRoot };
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function readGeneratedText(directory) {
  const textFiles = (await listFiles(directory)).filter((filePath) =>
    /\.(?:css|html|js|json)$/.test(filePath),
  );
  return (
    await Promise.all(textFiles.map((filePath) => readFile(filePath, "utf8")))
  ).join("\n");
}

async function runViteBuild(options) {
  const environmentSnapshot = snapshotEnvironment(viteManagedEnvironmentKeys);
  const cacheDir = await mkdtemp(
    path.join(os.tmpdir(), "parrot-private-story-vite-cache-"),
  );
  temporaryDirectories.push(cacheDir);
  env.NODE_ENV = "production";
  for (const key of viteManagedEnvironmentKeys.slice(1)) delete env[key];

  try {
    const configFactory = createViteConfig(options);
    const config = await configFactory({ command: "build", mode: "production" });
    const buildConfig = {
      ...config,
      cacheDir,
      configFile: false,
      envDir: false,
      envPrefix: [],
      logLevel: "silent",
      mode: "production",
      publicDir: false,
      root: repositoryRoot,
    };
    await viteBuild(buildConfig);
    return buildConfig;
  } finally {
    restoreEnvironment(environmentSnapshot);
  }
}

describe("private story Vite build boundary", () => {
  it("returns empty data without touching private files for serve or disabled builds", async () => {
    const unavailableDirectory = path.join(
      os.tmpdir(),
      "synthetic-private-preview-that-does-not-exist",
    );

    assert.deepEqual(
      await getPrivateStoryPreviewBuildData({
        command: "serve",
        enabled: true,
        previewDirectory: unavailableDirectory,
      }),
      { assets: [], stories: [] },
    );
    assert.deepEqual(
      await getPrivateStoryPreviewBuildData({
        command: "build",
        enabled: false,
        previewDirectory: unavailableDirectory,
      }),
      { assets: [], stories: [] },
    );
  });

  it("requires the exact environment flag and build command in the default config", async () => {
    env.PARROT_PRIVATE_STORY_PREVIEW = "true";
    const disabledBuild = await viteConfig({ command: "build", mode: "test" });
    assert.equal(
      disabledBuild.define["import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW"],
      "false",
    );
    assert.equal(
      disabledBuild.define["import.meta.env.VITE_PARROT_PRIVATE_STORIES"],
      "[]",
    );

    env.PARROT_PRIVATE_STORY_PREVIEW = "1";
    const serve = await viteConfig({ command: "serve", mode: "test" });
    assert.equal(
      serve.define["import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW"],
      "false",
    );
    assert.equal(serve.define["import.meta.env.VITE_PARROT_PRIVATE_STORIES"], "[]");
  });

  it("fails an enabled build when allowlisted narration audio is missing", async () => {
    const fixture = await createFixture({ withAudio: false });

    await assert.rejects(
      () =>
        getPrivateStoryPreviewBuildData({
          command: "build",
          enabled: true,
          previewDirectory: fixture.previewDirectory,
          projectRoot: fixture.projectRoot,
        }),
      /Missing required narration audio/,
    );
  });

  it("emits snapshotted allowlisted MP3 bytes after the source path is replaced", async () => {
    const fixture = await createFixture({ withAudio: true });
    const data = await getPrivateStoryPreviewBuildData({
      command: "build",
      enabled: true,
      previewDirectory: fixture.previewDirectory,
      projectRoot: fixture.projectRoot,
    });

    assert.deepEqual(
      data.assets.map(({ fileName }) => fileName),
      [
        "assets/private-story-preview/private-fixture/page-001.mp3",
        "assets/private-story-preview/private-second/page-001.mp3",
      ],
    );

    const originalAudioPath = path.join(
      fixture.previewDirectory,
      "audio/private-fixture/page-001.mp3",
    );
    const externalAudioPath = path.join(fixture.projectRoot, "replacement.mp3");
    const externalBytes = Buffer.from([0x49, 0x44, 0x33, 0x09, 0x09, 0x09]);
    await writeFile(externalAudioPath, externalBytes);
    await rm(originalAudioPath);
    await symlink(externalAudioPath, originalAudioPath);

    const emitted = [];
    const plugin = privateStoryPreviewAssets(data.assets);
    plugin.generateBundle.call({
      emitFile(asset) {
        emitted.push(asset);
      },
    });

    assert.equal(emitted.length, 2);
    assert.equal(
      emitted[0].fileName,
      "assets/private-story-preview/private-fixture/page-001.mp3",
    );
    assert.deepEqual(emitted[0].source, fixture.audioBytes[0]);
    assert.notDeepEqual(emitted[0].source, externalBytes);
    assert.equal(
      emitted[1].fileName,
      "assets/private-story-preview/private-second/page-001.mp3",
    );
    assert.deepEqual(emitted[1].source, fixture.audioBytes[1]);
  });

  it("restores Vite-managed environment keys when a programmatic build fails", async () => {
    const environmentSnapshot = snapshotEnvironment(viteManagedEnvironmentKeys);
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "parrot-failing-vite-build-"),
    );
    temporaryDirectories.push(projectRoot);
    const blockedOutDir = path.join(projectRoot, "blocked-output");
    await writeFile(blockedOutDir, "synthetic non-directory output");

    try {
      for (const key of viteManagedEnvironmentKeys) delete env[key];
      await assert.rejects(
        runViteBuild({
          outDir: blockedOutDir,
          privateStoryPreviewDirectory: path.join(projectRoot, "missing-preview"),
          privateStoryPreviewEnabled: false,
          privateStoryProjectRoot: projectRoot,
        }),
      );
      for (const key of viteManagedEnvironmentKeys) {
        assert.equal(Object.hasOwn(env, key), false);
      }
    } finally {
      restoreEnvironment(environmentSnapshot);
    }
  });

  it("runs a normal Vite build without reading a nonexistent private preview", async () => {
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "parrot-normal-vite-build-"),
    );
    temporaryDirectories.push(projectRoot);
    const outDir = path.join(projectRoot, "vite-output");

    const buildConfig = await runViteBuild({
      outDir,
      privateStoryPreviewDirectory: path.join(projectRoot, "missing-preview"),
      privateStoryPreviewEnabled: false,
      privateStoryProjectRoot: projectRoot,
    });

    assert.equal(buildConfig.mode, "production");
    assert.equal(buildConfig.envDir, false);
    assert.equal(buildConfig.publicDir, false);
    assert.deepEqual(buildConfig.envPrefix, []);
    assert.equal(path.isAbsolute(buildConfig.cacheDir), true);
    assert.equal(buildConfig.cacheDir.startsWith(repositoryRoot), false);

    const generatedText = await readGeneratedText(outDir);
    for (const marker of [
      "private-fixture",
      "Synthetic Fixture",
      "A synthetic story page for a build boundary test.",
      "private-second",
      "Second Synthetic Fixture",
      "A second synthetic build page.",
    ]) {
      assert.equal(generatedText.includes(marker), false);
    }
    await assert.rejects(
      access(path.join(outDir, "assets/private-story-preview")),
      (error) => error.code === "ENOENT",
    );
  });

  it("runs a private Vite build with only allowlisted synthetic preview assets", async () => {
    const fixture = await createFixture({ withAudio: true });
    const outDir = path.join(fixture.projectRoot, "vite-output");

    await runViteBuild({
      outDir,
      privateStoryPreviewDirectory: fixture.previewDirectory,
      privateStoryPreviewEnabled: true,
      privateStoryProjectRoot: fixture.projectRoot,
    });

    const generatedText = await readGeneratedText(outDir);
    for (const markerSet of [
      [
        "private-fixture",
        "Synthetic Fixture",
        "A synthetic story page for a build boundary test.",
      ],
      [
        "private-second",
        "Second Synthetic Fixture",
        "A second synthetic build page.",
      ],
    ]) {
      for (const marker of markerSet) {
        assert.equal(generatedText.includes(marker), true);
      }
    }
    for (const privateBuildOnlyValue of [
      fixture.projectRoot,
      fixture.previewDirectory,
      path.join(fixture.previewDirectory, "story-1.txt"),
      path.join(fixture.previewDirectory, "story-2.txt"),
      "synthetic-preview/story-1.txt",
      "synthetic-preview/story-2.txt",
      "audio/private-fixture/page-001.mp3",
      "audio/private-second/page-001.mp3",
      "outputFilePath",
      "sourceFilePath",
      JSON.stringify(fixture.audioBytes[0]),
      JSON.stringify(fixture.audioBytes[1]),
    ]) {
      assert.equal(generatedText.includes(privateBuildOnlyValue), false);
    }

    const privateAssetDirectory = path.join(
      outDir,
      "assets/private-story-preview",
    );
    assert.deepEqual(
      (await listFiles(privateAssetDirectory))
        .map((filePath) =>
          path.relative(privateAssetDirectory, filePath).split(path.sep).join("/"),
        )
        .sort(),
      [
        "private-fixture/page-001.mp3",
        "private-second/page-001.mp3",
      ],
    );

    assert.deepEqual(
      await readFile(
        path.join(
          outDir,
          "assets/private-story-preview/private-fixture/page-001.mp3",
        ),
      ),
      fixture.audioBytes[0],
    );
    assert.deepEqual(
      await readFile(
        path.join(
          outDir,
          "assets/private-story-preview/private-second/page-001.mp3",
        ),
      ),
      fixture.audioBytes[1],
    );
  });
});
