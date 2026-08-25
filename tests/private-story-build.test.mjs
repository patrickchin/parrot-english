/* global Buffer */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "node:process";
import { afterEach, describe, it } from "node:test";
import viteConfig, {
  getPrivateStoryPreviewBuildData,
  privateStoryPreviewAssets,
} from "../vite.config.ts";

const temporaryDirectories = [];
const originalPrivatePreviewFlag = env.PARROT_PRIVATE_STORY_PREVIEW;

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
  const audioDirectory = path.join(previewDirectory, "audio/private-fixture");
  await mkdir(audioDirectory, { recursive: true });
  await writeFile(
    path.join(previewDirectory, "manifest.json"),
    JSON.stringify({
      version: 1,
      stories: [
        {
          id: "private-fixture",
          textFile: "story.txt",
          title: "Synthetic Fixture",
        },
      ],
    }),
  );
  await writeFile(
    path.join(previewDirectory, "story.txt"),
    "# Synthetic Fixture\n\nA synthetic story page for a build boundary test.\n",
  );

  const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x7f]);
  if (withAudio) {
    await writeFile(path.join(audioDirectory, "page-001.mp3"), audioBytes);
  }
  await writeFile(path.join(audioDirectory, "not-allowlisted.mp3"), "do not emit");

  return { audioBytes, previewDirectory, projectRoot };
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

  it("emits only loader-allowlisted MP3s with exact filenames and bytes", async () => {
    const fixture = await createFixture({ withAudio: true });
    const data = await getPrivateStoryPreviewBuildData({
      command: "build",
      enabled: true,
      previewDirectory: fixture.previewDirectory,
      projectRoot: fixture.projectRoot,
    });

    assert.deepEqual(
      data.assets.map(({ fileName }) => fileName),
      ["assets/private-story-preview/private-fixture/page-001.mp3"],
    );

    const emitted = [];
    const plugin = privateStoryPreviewAssets(data.assets);
    plugin.generateBundle.call({
      emitFile(asset) {
        emitted.push(asset);
      },
    });

    assert.equal(emitted.length, 1);
    assert.equal(
      emitted[0].fileName,
      "assets/private-story-preview/private-fixture/page-001.mp3",
    );
    assert.deepEqual(emitted[0].source, fixture.audioBytes);
  });
});
