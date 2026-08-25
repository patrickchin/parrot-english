/* global Buffer */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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

  it("redacts a marker that equals the former diagnostic token", () => {
    const marker = "[private-marker]";
    const scanResult = scanPrivateStoryIsolation({
      markers: [marker],
      trackedFiles: [[`src/${marker}.js`, "public content"]],
    });

    assert.equal(scanResult.leakedPaths.length, 1);
    assert.match(scanResult.leakedPaths[0], /^src\/.*\.js/);
    assert.equal(scanResult.message.includes(marker), false);
    assert.equal(scanResult.leakedPaths[0].includes(marker), false);
  });

  it("does not introduce a marker substring through redaction", () => {
    const marker = "private";
    const scanResult = scanPrivateStoryIsolation({
      markers: [marker],
      trackedFiles: [[`src/${marker}-fixture.js`, "public content"]],
    });

    assert.equal(scanResult.leakedPaths.length, 1);
    assert.equal(scanResult.message.includes(marker), false);
    assert.equal(scanResult.leakedPaths[0].includes(marker), false);
  });

  it("keeps distinct leaked paths distinct after marker redaction", () => {
    const markers = ["private-one", "private-two"];
    const scanResult = scanPrivateStoryIsolation({
      markers,
      trackedFiles: [
        ["src/private-one.js", "public content"],
        ["src/private-two.js", "public content"],
      ],
    });

    assert.equal(scanResult.leakedPaths.length, 2);
    assert.notEqual(scanResult.leakedPaths[0], scanResult.leakedPaths[1]);
    for (const marker of markers) {
      assert.equal(scanResult.message.includes(marker), false);
    }
  });

  it("keeps valid-manifest leaks distinct when titles span path and suffix", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-boundary-"));
    temporaryDirectories.push(projectRoot);
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const leakedPaths = ["src/private-oneX", "src/private-twoX"];
    const titles = leakedPaths.map((filePath) =>
      `X~${createHash("sha256").update(filePath).digest("hex").slice(0, 12)}`
    );
    await mkdir(previewDirectory, { recursive: true });
    await mkdir(join(projectRoot, "src"));
    await writeFile(
      join(previewDirectory, "manifest.json"),
      JSON.stringify({
        version: 1,
        stories: [
          { id: "private-one", textFile: "one.txt", title: titles[0] },
          { id: "private-two", textFile: "two.txt", title: titles[1] },
        ],
      }),
    );
    await writeFile(
      join(previewDirectory, "one.txt"),
      `# ${titles[0]}\n\nSynthetic first page.\n`,
    );
    await writeFile(
      join(previewDirectory, "two.txt"),
      `# ${titles[1]}\n\nSynthetic second page.\n`,
    );
    await writeFile(
      join(projectRoot, ".gitignore"),
      "/content/private-story-preview/\n",
    );
    await Promise.all(
      leakedPaths.map((filePath) =>
        writeFile(join(projectRoot, filePath), "public content\n")
      ),
    );
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync("git", ["add", ".gitignore", ...leakedPaths], {
      cwd: projectRoot,
    });

    const result = await verifyPrivateStoryIsolation({
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.equal(result.leakedPaths.length, 2);
    assert.equal(new Set(result.leakedPaths).size, 2);
    for (const leakedPath of result.leakedPaths) {
      assert.match(leakedPath, /^src\/.+/);
      assert.equal(/[\r\n\u2028\u2029]/u.test(leakedPath), false);
    }
    for (const marker of ["private-one", "private-two", ...titles]) {
      assert.equal(result.message.includes(marker), false);
    }
  });

  it("escapes every JavaScript line separator in reported paths", () => {
    const scanResult = scanPrivateStoryIsolation({
      markers: ["synthetic marker"],
      trackedFiles: [
        ["src/carriage\rreturn\nline\u2028paragraph\u2029.js", "synthetic marker"],
      ],
    });

    assert.equal(/[\r\n\u2028\u2029]/u.test(scanResult.message), false);
    assert.match(scanResult.message, /\\r/);
    assert.match(scanResult.message, /\\n/);
    assert.match(scanResult.message, /\\u2028/);
    assert.match(scanResult.message, /\\u2029/);
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

  it("scans generic tracked and dist asset paths when the manifest is absent", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-absent-"));
    temporaryDirectories.push(projectRoot);
    const trackedAsset = join(
      projectRoot,
      "public/assets/private-story-preview/fixture/page.mp3",
    );
    const distAsset = join(
      projectRoot,
      "dist/assets/private-story-preview/fixture/page.mp3",
    );
    await mkdir(join(trackedAsset, ".."), { recursive: true });
    await mkdir(join(distAsset, ".."), { recursive: true });
    await writeFile(trackedAsset, "synthetic tracked audio");
    await writeFile(distAsset, "synthetic built audio");
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync(
      "git",
      ["add", "public/assets/private-story-preview/fixture/page.mp3"],
      { cwd: projectRoot },
    );

    const result = await verifyPrivateStoryIsolation({
      distDirectory: join(projectRoot, "dist"),
      projectRoot,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [
      "dist/assets/private-story-preview/fixture/page.mp3",
      "public/assets/private-story-preview/fixture/page.mp3",
    ]);
  });

  it("reports generic leaks before required absent private inputs", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-required-"));
    temporaryDirectories.push(projectRoot);
    const trackedAsset = join(
      projectRoot,
      "public/assets/private-story-preview/fixture/page.mp3",
    );
    const distAsset = join(
      projectRoot,
      "dist/assets/private-story-preview/fixture/page.mp3",
    );
    await mkdir(join(trackedAsset, ".."), { recursive: true });
    await mkdir(join(distAsset, ".."), { recursive: true });
    await writeFile(trackedAsset, "synthetic tracked audio");
    await writeFile(distAsset, "synthetic built audio");
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync(
      "git",
      ["add", "public/assets/private-story-preview/fixture/page.mp3"],
      { cwd: projectRoot },
    );

    const result = await verifyPrivateStoryIsolation({
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [
      "dist/assets/private-story-preview/fixture/page.mp3",
      "public/assets/private-story-preview/fixture/page.mp3",
    ]);
  });

  it("fails closed when a private path is tracked without a manifest", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-tracked-"));
    temporaryDirectories.push(projectRoot);
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const distAsset = join(
      projectRoot,
      "dist/assets/private-story-preview/fixture/page.mp3",
    );
    await mkdir(previewDirectory, { recursive: true });
    await mkdir(join(distAsset, ".."), { recursive: true });
    await writeFile(join(previewDirectory, "leak.txt"), "synthetic leak\n");
    await writeFile(distAsset, "synthetic built audio");
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
      "dist/assets/private-story-preview/fixture/page.mp3",
    ]);
    assert.equal(
      result.message,
      "content/private-story-preview/leak.txt\ndist/assets/private-story-preview/fixture/page.mp3",
    );
  });

  it("redacts markers in tracked private filenames", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-private-name-"));
    temporaryDirectories.push(projectRoot);
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    await mkdir(previewDirectory, { recursive: true });
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
          {
            id: "private-second",
            textFile: "story-2.txt",
            title: "Second Fixture",
          },
        ],
      }),
    );
    await writeFile(
      join(previewDirectory, "story.txt"),
      "# Fixture Story\n\nSynthetic page text.\n",
    );
    await writeFile(
      join(previewDirectory, "story-2.txt"),
      "# Second Fixture\n\nSecond synthetic page text.\n",
    );
    await writeFile(
      join(previewDirectory, "private-fixture-leak.txt"),
      "synthetic leak\n",
    );
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync(
      "git",
      ["add", "--force", "content/private-story-preview"],
      { cwd: projectRoot },
    );

    const result = await verifyPrivateStoryIsolation({ projectRoot });

    assert.equal(result.status, "leaks");
    assert.equal(
      result.leakedPaths.some((filePath) =>
        filePath.startsWith(
          "content/private-story-preview/-leak.txt~",
        )
      ),
      true,
    );
    assert.doesNotMatch(result.message, /private-fixture/);
    assert.equal(result.message.includes("Synthetic page text."), false);
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
          {
            id: "private-second",
            textFile: "story-2.txt",
            title: "Second Fixture",
          },
        ],
      }),
    );
    await writeFile(
      join(previewDirectory, "story.txt"),
      "# Fixture Story\n\nSynthetic page text.\n",
    );
    await writeFile(
      join(previewDirectory, "story-2.txt"),
      "# Second Fixture\n\nSecond synthetic page text.\n",
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

  it("scans staged index bytes when the working tree copy is clean", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-index-"));
    temporaryDirectories.push(projectRoot);
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    await mkdir(previewDirectory, { recursive: true });
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
          {
            id: "private-second",
            textFile: "story-2.txt",
            title: "Second Fixture",
          },
        ],
      }),
    );
    await writeFile(
      join(previewDirectory, "story.txt"),
      "# Fixture Story\n\nSynthetic page text.\n",
    );
    await writeFile(
      join(previewDirectory, "story-2.txt"),
      "# Second Fixture\n\nSecond synthetic page text.\n",
    );
    await writeFile(
      join(projectRoot, ".gitignore"),
      "/content/private-story-preview/\n",
    );
    const trackedPath = "staged\nfixture.js";
    await writeFile(
      join(projectRoot, trackedPath),
      "export const title = 'Fixture Story';\n",
    );
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync("git", ["add", ".gitignore", trackedPath], {
      cwd: projectRoot,
    });
    await writeFile(
      join(projectRoot, trackedPath),
      "export const title = 'Public';\n",
    );

    const result = await verifyPrivateStoryIsolation({
      distDirectory: join(projectRoot, "dist"),
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, ["staged\\nfixture.js"]);
    assert.equal(result.message, "staged\\nfixture.js");
  });

  it("scans a gitlink path without reading the commit as a blob", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-gitlink-"));
    temporaryDirectories.push(projectRoot);
    await writeFile(join(projectRoot, "seed.txt"), "synthetic seed\n");
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });
    await execFileAsync("git", ["add", "seed.txt"], { cwd: projectRoot });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.name=Synthetic Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "--quiet",
        "-m",
        "synthetic base",
      ],
      { cwd: projectRoot },
    );
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    const gitlinkPath = "modules/assets/private-story-preview/fixture";
    await execFileAsync(
      "git",
      [
        "update-index",
        "--add",
        "--cacheinfo",
        "160000",
        stdout.trim(),
        gitlinkPath,
      ],
      { cwd: projectRoot },
    );

    const result = await verifyPrivateStoryIsolation({ projectRoot });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [gitlinkPath]);
  });

  it("rejects an external dist directory", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-root-"));
    const externalDirectory = await mkdtemp(join(tmpdir(), "parrot-isolation-external-"));
    temporaryDirectories.push(projectRoot, externalDirectory);
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          distDirectory: externalDirectory,
          projectRoot,
        }),
      /dist directory must stay inside the project root/,
    );
  });

  it("rejects a relative dist traversal", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "parrot-isolation-parent-"));
    temporaryDirectories.push(parentDirectory);
    const projectRoot = join(parentDirectory, "project");
    const externalDirectory = join(parentDirectory, "external-dist");
    await mkdir(projectRoot);
    await mkdir(externalDirectory);
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          distDirectory: "../external-dist",
          projectRoot,
        }),
      /dist directory must stay inside the project root/,
    );
  });

  it("rejects a dist symlink that escapes the project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-root-"));
    const externalDirectory = await mkdtemp(join(tmpdir(), "parrot-isolation-external-"));
    temporaryDirectories.push(projectRoot, externalDirectory);
    await writeFile(join(externalDirectory, "outside.js"), "public content\n");
    await symlink(externalDirectory, join(projectRoot, "dist"));
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });

    await assert.rejects(
      () => verifyPrivateStoryIsolation({ projectRoot }),
      /dist directory must stay inside the project root/,
    );
  });

  it("derives the default dist directory from the supplied project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-default-dist-"));
    temporaryDirectories.push(projectRoot);
    const distAsset = join(
      projectRoot,
      "dist/assets/private-story-preview/fixture/page.mp3",
    );
    await mkdir(join(distAsset, ".."), { recursive: true });
    await writeFile(distAsset, "synthetic built audio");
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });

    const result = await verifyPrivateStoryIsolation({ projectRoot });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [
      "dist/assets/private-story-preview/fixture/page.mp3",
    ]);
  });
});
