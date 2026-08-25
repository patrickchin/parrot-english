/* global Buffer */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import {
  scanPrivateStoryIsolation,
  verifyPrivateStoryIsolation,
} from "../scripts/verify-private-story-isolation.mjs";

const temporaryDirectories = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("private story isolation scanner", () => {
  it("reports only paths when serialized private markers leak", () => {
    const pageText = "Synthetic page text.\nSecond synthetic line.";
    const markers = [
      "private-fixture",
      "Fixture Story",
      pageText,
      "/assets/private-story-preview/private-fixture/page-001.mp3",
    ];
    const scanResult = scanPrivateStoryIsolation({
      distFiles: [
        ["dist/assets/index.js", `window.fixture=${JSON.stringify(pageText)}`],
      ],
      markers,
      trackedFiles: [["README.md", "Public documentation only."]],
    });

    assert.deepEqual(scanResult.leakedPaths, ["dist/assets/index.js"]);
    assert.equal(scanResult.message, "dist/assets/index.js");
    for (const marker of markers) {
      assert.doesNotMatch(scanResult.message, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("detects private tracked and dist asset paths without echoing contents", () => {
    const scanResult = scanPrivateStoryIsolation({
      distFiles: [
        [
          "dist/assets/private-story-preview/private-fixture/page-001.mp3",
          Buffer.from("synthetic audio"),
        ],
      ],
      markers: ["Synthetic secret marker"],
      trackedFiles: [
        ["content/private-story-preview/manifest.json", "Synthetic secret marker"],
      ],
    });

    assert.deepEqual(scanResult.leakedPaths, [
      "content/private-story-preview/manifest.json",
      "dist/assets/private-story-preview/private-fixture/page-001.mp3",
    ]);
    assert.doesNotMatch(scanResult.message, /Synthetic secret marker/);
  });

  it("allows generic private workflow paths in tracked tooling", () => {
    const scanResult = scanPrivateStoryIsolation({
      markers: ["private-opaque-fixture"],
      trackedFiles: [
        [
          "scripts/tooling.mjs",
          [
            "content/private-story-preview",
            "assets/private-story-preview",
          ].join("\n"),
        ],
      ],
    });

    assert.deepEqual(scanResult.leakedPaths, []);
    assert.equal(scanResult.message, "");
  });

  it("clean-skips absent inputs unless they are required", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-"));
    temporaryDirectories.push(projectRoot);
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });

    assert.deepEqual(
      await verifyPrivateStoryIsolation({ projectRoot }),
      { leakedPaths: [], message: "Private story inputs absent; skipped.", status: "skipped" },
    );
    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          projectRoot,
          requirePrivateInputs: true,
        }),
      /Private story inputs are required/,
    );
  });

  it("fails closed when a private path is tracked without a manifest", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-tracked-"));
    temporaryDirectories.push(projectRoot);
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    await mkdir(previewDirectory, { recursive: true });
    await writeFile(join(previewDirectory, "leak.txt"), "synthetic leak\n");
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync(
      "git",
      ["add", "--force", "content/private-story-preview/leak.txt"],
      { cwd: projectRoot },
    );

    const result = await verifyPrivateStoryIsolation({ projectRoot });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [
      "content/private-story-preview/leak.txt",
    ]);
    assert.equal(result.message, "content/private-story-preview/leak.txt");
  });

  it("finds marker leaks in synthetic tracked files and a normal dist", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-git-"));
    temporaryDirectories.push(projectRoot);
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const distDirectory = join(projectRoot, "dist/assets");
    await mkdir(previewDirectory, { recursive: true });
    await mkdir(distDirectory, { recursive: true });
    await writeFile(
      join(previewDirectory, "manifest.json"),
      JSON.stringify({
        version: 1,
        stories: [
          {
            id: "private-fixture",
            textFile: "story.txt",
            title: "Fixture Story",
          },
        ],
      }),
    );
    await writeFile(
      join(previewDirectory, "story.txt"),
      "# Fixture Story\n\nSynthetic page text.\n",
    );
    await writeFile(
      join(projectRoot, ".gitignore"),
      "/content/private-story-preview/\n/dist/\n",
    );
    await writeFile(join(projectRoot, "app.js"), "export const title = 'Fixture Story';\n");
    await writeFile(
      join(distDirectory, "index.js"),
      `window.page=${JSON.stringify("Synthetic page text.")};\n`,
    );
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync("git", ["add", ".gitignore", "app.js"], {
      cwd: projectRoot,
    });

    const result = await verifyPrivateStoryIsolation({
      distDirectory: join(projectRoot, "dist"),
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, ["app.js", "dist/assets/index.js"]);
    assert.equal(result.message, "app.js\ndist/assets/index.js");
    assert.doesNotMatch(result.message, /Fixture Story|Synthetic page text/);
  });
});
