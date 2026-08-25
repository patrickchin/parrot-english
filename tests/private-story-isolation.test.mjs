/* global Buffer */

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import {
  scanPrivateStoryIsolation,
  verifyPrivateStoryIsolation,
} from "../scripts/verify-private-story-isolation.mjs";

const temporaryDirectories = [];
const execFileAsync = promisify(execFile);

async function git(projectRoot, args, options = {}) {
  return execFileAsync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    ...options,
  });
}

function gitWithInput(projectRoot, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: projectRoot, stdio: ["pipe", "pipe", "pipe"] });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8")));
    });
    child.stdin.end(input);
  });
}

async function commit(projectRoot, message) {
  await git(projectRoot, [
    "-c",
    "user.name=Synthetic Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "--allow-empty",
    "--quiet",
    "-m",
    message,
  ]);
}

async function commitAndDeleteFiles(projectRoot, files) {
  const filePaths = files.map(([filePath]) => filePath);
  await Promise.all(
    files.map(([filePath, contents]) =>
      mkdir(join(projectRoot, filePath, ".."), { recursive: true }).then(() =>
        writeFile(join(projectRoot, filePath), contents)
      )
    ),
  );
  await git(projectRoot, ["add", "--", ...filePaths]);
  await commit(projectRoot, "add synthetic historical blobs");
  const { stdout } = await git(projectRoot, ["rev-parse", "HEAD"]);
  await Promise.all(filePaths.map((filePath) => rm(join(projectRoot, filePath))));
  await git(projectRoot, ["add", "-u", "--", ...filePaths]);
  await commit(projectRoot, "remove synthetic historical blobs");
  return stdout.trim();
}

async function createReleaseAuditFixture({
  audioBytes = [
    Buffer.from("ID3 default synthetic narration one"),
    Buffer.from("ID3 default synthetic narration two"),
  ],
  firstBody = "Synthetic first page for the private fixture.",
  secondBody = "Synthetic second page for the private fixture.",
} = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-release-"));
  temporaryDirectories.push(projectRoot);
  const previewDirectory = join(projectRoot, "content/private-story-preview");
  await mkdir(previewDirectory, { recursive: true });
  await writeFile(
    join(previewDirectory, "manifest.json"),
    JSON.stringify({
      version: 1,
      stories: [
        { id: "private-fixture", textFile: "one.txt", title: "Fixture Story" },
        { id: "private-second", textFile: "two.txt", title: "Second Fixture" },
      ],
    }),
  );
  await writeFile(join(previewDirectory, "one.txt"), `# Fixture Story\n\n${firstBody}\n`);
  await writeFile(join(previewDirectory, "two.txt"), `# Second Fixture\n\n${secondBody}\n`);
  if (audioBytes) {
    const audioDirectories = [
      join(previewDirectory, "audio/private-fixture"),
      join(previewDirectory, "audio/private-second"),
    ];
    await Promise.all(
      audioDirectories.map((directory, index) =>
        audioBytes[index]
          ? mkdir(directory, { recursive: true }).then(() =>
              writeFile(join(directory, "page-001.mp3"), audioBytes[index])
            )
          : Promise.resolve()
      ),
    );
  }
  await writeFile(
    join(projectRoot, ".gitignore"),
    "/content/private-story-preview/\n/dist/\n",
  );
  await writeFile(join(projectRoot, "public.txt"), "public baseline\n");
  await git(projectRoot, ["init", "--quiet"]);
  await git(projectRoot, ["add", ".gitignore", "public.txt"]);
  await commit(projectRoot, "synthetic base");
  const { stdout } = await git(projectRoot, ["rev-parse", "HEAD"]);
  return {
    baseRevision: stdout.trim(),
    previewDirectory,
    projectRoot,
  };
}

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

  it("detects the exact transaction path in current and dist-relative locations", () => {
    const scanResult = scanPrivateStoryIsolation({
      distFiles: [[
        "dist/content/.private-story-preview-transaction/backup/residue.bin",
        "synthetic residue",
      ]],
      trackedFiles: [[
        "content/.private-story-preview-transaction/stage/residue.bin",
        "synthetic residue",
      ]],
    });

    assert.deepEqual(scanResult.leakedPaths, [
      "content/.private-story-preview-transaction/stage/residue.bin",
      "dist/content/.private-story-preview-transaction/backup/residue.bin",
    ]);
  });

  it("detects protected directory segment sequences without matching lookalikes", () => {
    const protectedPaths = [
      "content/local-stories/source.txt",
      "nested/content/local-stories/source.txt",
      "dist/content/private-story-preview/manifest.json",
      "nested/content/private-story-preview/story.txt",
      "dist/content/.private-story-preview-transaction/stage/residue.bin",
      "public/assets/private-story-preview/fixture/page.mp3",
    ];
    const cleanLookalikes = [
      "content/local-stories-copy/source.txt",
      "content/private-story-previewed/story.txt",
      "content/.private-story-preview-transactional/residue.bin",
      "assets/private-story-preview-old/page.mp3",
    ];

    const result = scanPrivateStoryIsolation({
      trackedFiles: [...protectedPaths, ...cleanLookalikes].map((filePath) => [
        filePath,
        "synthetic public bytes",
      ]),
    });

    assert.deepEqual(result.leakedPaths, [...protectedPaths].sort());
  });

  it("detects a legacy source path in the current index and worktree", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const leakedPath = "content/local-stories/source.txt";
    await mkdir(join(projectRoot, leakedPath, ".."), { recursive: true });
    await writeFile(join(projectRoot, leakedPath), "synthetic public bytes\n");
    await git(projectRoot, ["add", "--force", "--", leakedPath]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(result.leakedPaths, [leakedPath]);
  });

  it("detects a legacy source path that was committed and later deleted", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const leakedPath = "archive/content/local-stories/source.txt";
    const addCommit = await commitAndDeleteFiles(projectRoot, [[
      leakedPath,
      "synthetic public bytes\n",
    ]]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(
      result.leakedPaths.includes(
        `git-history ${addCommit.slice(0, 12)} ${leakedPath}`,
      ),
      true,
    );
  });

  it("detects a preview directory nested inside dist", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-nested-dist-"));
    temporaryDirectories.push(projectRoot);
    const leakedPath = "dist/content/private-story-preview/residue.bin";
    await mkdir(join(projectRoot, leakedPath, ".."), { recursive: true });
    await writeFile(join(projectRoot, leakedPath), "synthetic public bytes\n");
    await git(projectRoot, ["init", "--quiet"]);

    const result = await verifyPrivateStoryIsolation({ projectRoot });

    assert.deepEqual(result.leakedPaths, [leakedPath]);
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
    await writeFile(join(projectRoot, "seed.txt"), "synthetic seed\n");
    await execFileAsync("git", ["add", "seed.txt"], { cwd: projectRoot });
    await commit(projectRoot, "synthetic base");
    const { stdout } = await git(projectRoot, ["rev-parse", "HEAD"]);
    const baseRevision = stdout.trim();

    assert.deepEqual(
      await verifyPrivateStoryIsolation({ projectRoot }),
      { leakedPaths: [], message: "Private story inputs absent; skipped.", status: "skipped" },
    );
    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision,
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
    await writeFile(join(projectRoot, ".gitignore"), "/dist/\n");
    await execFileAsync("git", ["add", ".gitignore"], { cwd: projectRoot });
    await commit(projectRoot, "synthetic base");
    const { stdout } = await git(projectRoot, ["rev-parse", "HEAD"]);
    await execFileAsync(
      "git",
      ["add", "public/assets/private-story-preview/fixture/page.mp3"],
      { cwd: projectRoot },
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision: stdout.trim(),
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

  it("reports a force-added transaction file from the index and worktree without markers", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const leakedPath =
      "content/.private-story-preview-transaction/backup/residue.bin";
    await mkdir(join(projectRoot, leakedPath, ".."), { recursive: true });
    await writeFile(
      join(projectRoot, leakedPath),
      "synthetic transaction contents must not be echoed",
    );
    await git(projectRoot, ["add", "--force", "--", leakedPath]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [leakedPath]);
    assert.equal(
      result.message.includes("synthetic transaction contents must not be echoed"),
      false,
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

  it("scans an internal dist directory symlink", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-root-"));
    temporaryDirectories.push(projectRoot);
    const outputDirectory = join(projectRoot, "synthetic-output");
    const leakedAsset = join(
      outputDirectory,
      "assets/private-story-preview/fixture/page.mp3",
    );
    await mkdir(join(leakedAsset, ".."), { recursive: true });
    await writeFile(leakedAsset, "synthetic built audio");
    await symlink(outputDirectory, join(projectRoot, "dist"));
    await execFileAsync("git", ["init", "--quiet"], { cwd: projectRoot });

    const result = await verifyPrivateStoryIsolation({ projectRoot });

    assert.deepEqual(result.leakedPaths, [
      "dist/assets/private-story-preview/fixture/page.mp3",
    ]);
  });

  it("rejects a nested dist symlink to private narration without reading it", async () => {
    const { baseRevision, previewDirectory, projectRoot } =
      await createReleaseAuditFixture();
    const privateTarget = join(
      previewDirectory,
      "audio/private-fixture/page-001.mp3",
    );
    await mkdir(join(projectRoot, "dist"));
    await symlink(privateTarget, join(projectRoot, "dist/innocent.data"));

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision,
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Unsupported file type in isolation scan");
        assert.equal(error.message.includes("private-fixture"), false);
        assert.equal(error.message.includes(privateTarget), false);
        return true;
      },
    );
  });

  it("rejects a generic file symlink nested inside dist", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-file-link-"));
    temporaryDirectories.push(projectRoot);
    await mkdir(join(projectRoot, "dist"));
    await writeFile(join(projectRoot, "public.txt"), "synthetic public bytes\n");
    await symlink(join(projectRoot, "public.txt"), join(projectRoot, "dist/file.txt"));
    await git(projectRoot, ["init", "--quiet"]);

    await assert.rejects(
      () => verifyPrivateStoryIsolation({ projectRoot }),
      { message: "Unsupported file type in isolation scan" },
    );
  });

  it("rejects a generic directory symlink nested inside dist", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-dir-link-"));
    temporaryDirectories.push(projectRoot);
    await mkdir(join(projectRoot, "dist"));
    await mkdir(join(projectRoot, "public-output"));
    await writeFile(
      join(projectRoot, "public-output/index.js"),
      "synthetic public bytes\n",
    );
    await symlink(
      join(projectRoot, "public-output"),
      join(projectRoot, "dist/assets"),
    );
    await git(projectRoot, ["init", "--quiet"]);

    await assert.rejects(
      () => verifyPrivateStoryIsolation({ projectRoot }),
      { message: "Unsupported file type in isolation scan" },
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

  it("fails before scanning more than the aggregate byte budget", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-budget-"));
    temporaryDirectories.push(projectRoot);
    await writeFile(join(projectRoot, "a"), "");
    await git(projectRoot, ["init", "--quiet"]);
    await git(projectRoot, ["add", "a"]);

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          maxScannedBytes: 10,
          projectRoot,
        }),
      (error) => {
        assert.equal(error.message, "Private story isolation scan exceeded its byte budget");
        assert.equal(error.message.includes("public.txt"), false);
        return true;
      },
    );
  });

  it("rejects a dist socket without reading it", async (testContext) => {
    if (process.platform === "win32") {
      testContext.skip("Unix-domain filesystem sockets are unavailable");
      return;
    }
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-isolation-socket-"));
    temporaryDirectories.push(projectRoot);
    const distDirectory = join(projectRoot, "dist");
    const socketPath = join(distDirectory, "synthetic.sock");
    await mkdir(distDirectory);
    await git(projectRoot, ["init", "--quiet"]);
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    try {
      await assert.rejects(
        () => verifyPrivateStoryIsolation({ projectRoot }),
        (error) => {
          assert.equal(error.message, "Unsupported file type in isolation scan");
          assert.equal(error.message.includes(socketPath), false);
          return true;
        },
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("requires a Git base for release verification", async () => {
    const { projectRoot } = await createReleaseAuditFixture();

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          projectRoot,
          requirePrivateInputs: true,
        }),
      /Git history base is required/,
    );
  });

  it("fails release verification when every narration file is missing", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: null,
    });

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision,
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Unable to load private story audit inputs");
        assert.equal(error.message.includes("private-fixture"), false);
        return true;
      },
    );
  });

  it("fails release verification when one narration file is missing", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [Buffer.from("ID3 one available narration"), null],
    });

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision,
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Unable to load private story audit inputs");
        assert.equal(error.message.includes("private-second"), false);
        return true;
      },
    );
  });

  it("enforces the aggregate narration cap in release verification", async () => {
    const { baseRevision, previewDirectory, projectRoot } =
      await createReleaseAuditFixture({
        firstBody: `${Array.from({ length: 70 }, (_, index) => `word${index + 1}`).join(" ")}\n\nfinal`,
      });
    const firstAudio = join(
      previewDirectory,
      "audio/private-fixture/page-001.mp3",
    );
    const duplicateAudio = join(
      previewDirectory,
      "audio/private-fixture/page-002.mp3",
    );
    await truncate(firstAudio, 32 * 1024 * 1024 - 1);
    await link(firstAudio, duplicateAudio);
    await truncate(
      join(previewDirectory, "audio/private-second/page-001.mp3"),
      3,
    );

    await assert.rejects(
      () => verifyPrivateStoryIsolation({
        baseRevision,
        projectRoot,
        requirePrivateInputs: true,
      }),
      (error) => {
        assert.equal(error.message, "Unable to load private story audit inputs");
        assert.equal(error.message.includes("private-fixture"), false);
        return true;
      },
    );
  });

  it("rejects an invalid Git base without echoing the ref or Git stderr", async () => {
    const { projectRoot } = await createReleaseAuditFixture();
    const suppliedBase = "Fixture Story\nunknown-base";

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision: suppliedBase,
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Unable to resolve Git history base");
        assert.equal(error.message.includes(suppliedBase), false);
        assert.equal(error.message.includes("Fixture Story"), false);
        assert.equal(/[\r\n\t]/u.test(error.message), false);
        return true;
      },
    );
  });

  it("sanitizes a Git base containing a NUL byte before reporting failure", async () => {
    const { projectRoot } = await createReleaseAuditFixture();
    const suppliedBase = "private-fixture\0invalid";

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision: suppliedBase,
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Unable to resolve Git history base");
        assert.equal(error.message.includes("private-fixture"), false);
        assert.equal(error.message.includes("\0"), false);
        return true;
      },
    );
  });

  it("rejects a non-commit Git base with a sanitized error", async () => {
    const { projectRoot } = await createReleaseAuditFixture();
    const blobPath = join(projectRoot, "synthetic-blob.bin");
    await writeFile(blobPath, "synthetic blob\n");
    const { stdout } = await git(projectRoot, ["hash-object", "-w", blobPath]);

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision: stdout.trim(),
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Unable to resolve Git history base");
        assert.equal(error.message.includes(stdout.trim()), false);
        return true;
      },
    );
  });

  it("rejects a non-ancestor Git base with a sanitized error", async () => {
    const { projectRoot } = await createReleaseAuditFixture();
    const { stdout: tree } = await git(projectRoot, ["rev-parse", "HEAD^{tree}"]);
    const { stdout: unrelatedCommit } = await git(projectRoot, [
      "-c",
      "user.name=Synthetic Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit-tree",
      tree.trim(),
      "-m",
      "synthetic unrelated history",
    ]);

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision: unrelatedCommit.trim(),
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Git history base must be an ancestor of HEAD");
        assert.equal(error.message.includes(unrelatedCommit.trim()), false);
        return true;
      },
    );
  });

  it("fails closed without exposing a missing historical object", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    await writeFile(join(projectRoot, "temporary.bin"), "synthetic historical bytes\n");
    await git(projectRoot, ["add", "--", "temporary.bin"]);
    await commit(projectRoot, "add temporary object");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "rev-parse",
      "HEAD:temporary.bin",
    ]);
    const objectId = blobObjectId.trim();
    await rm(join(projectRoot, ".git/objects", objectId.slice(0, 2), objectId.slice(2)));

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision,
          projectRoot,
          requirePrivateInputs: true,
        }),
      (error) => {
        assert.equal(error.message, "Git isolation audit failed");
        assert.equal(error.message.includes(objectId), false);
        assert.equal(error.message.includes("temporary.bin"), false);
        return true;
      },
    );
  });

  it("accepts an empty history range and still scans current files", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    await writeFile(join(projectRoot, "public.txt"), "Fixture Story\n");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, ["public.txt"]);
  });

  it("detects a private marker in a branch commit message", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    await commit(projectRoot, "release note for Fixture Story");
    const { stdout } = await git(projectRoot, ["rev-parse", "HEAD"]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [`git-commit ${stdout.trim().slice(0, 12)}`]);
    assert.equal(result.message.includes("Fixture Story"), false);
  });

  it("detects a binary marker blob that was committed and later deleted", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const leakedPath = "archive.bin";
    await writeFile(
      join(projectRoot, leakedPath),
      Buffer.concat([
        Buffer.from([0, 255, 1]),
        Buffer.from("Fixture Story"),
        Buffer.from([0, 254]),
      ]),
    );
    await git(projectRoot, ["add", "--", leakedPath]);
    await commit(projectRoot, "add synthetic archive");
    const { stdout: leakCommit } = await git(projectRoot, ["rev-parse", "HEAD"]);
    await rm(join(projectRoot, leakedPath));
    await git(projectRoot, ["add", "-u", "--", leakedPath]);
    await commit(projectRoot, "remove synthetic archive");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.equal(
      result.leakedPaths.some((label) =>
        label.startsWith(`git-history ${leakCommit.trim().slice(0, 12)} `)
      ),
      true,
    );
    assert.equal(result.message.includes("Fixture Story"), false);
  });

  it("charges one retained historical blob once across distinct paths", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const sharedBlob = Buffer.alloc(256 * 1024, 0xff);
    Buffer.from("Fixture Story").copy(sharedBlob);
    const filePaths = ["archive/copy-one.bin", "archive/copy-two.bin"];
    const addCommit = await commitAndDeleteFiles(
      projectRoot,
      filePaths.map((filePath) => [filePath, sharedBlob]),
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      maxScannedBytes: 320 * 1024,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(
      result.leakedPaths,
      filePaths.map(
        (filePath) => `git-history ${addCommit.slice(0, 12)} ${filePath}`,
      ),
    );
  });

  it("charges distinct historical blobs separately", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const firstBlob = Buffer.alloc(256 * 1024, 0xfe);
    const secondBlob = Buffer.alloc(256 * 1024, 0xfd);
    Buffer.from("Fixture Story").copy(firstBlob);
    Buffer.from("Fixture Story").copy(secondBlob);
    await commitAndDeleteFiles(projectRoot, [
      ["archive/unique-one.bin", firstBlob],
      ["archive/unique-two.bin", secondBlob],
    ]);

    await assert.rejects(
      () =>
        verifyPrivateStoryIsolation({
          baseRevision,
          maxScannedBytes: 320 * 1024,
          projectRoot,
          requirePrivateInputs: true,
        }),
      { message: "Private story isolation scan exceeded its byte budget" },
    );
  });

  it("reports a force-added transaction file after it was deleted from history", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const leakedPath =
      "content/.private-story-preview-transaction/stage/residue.bin";
    await mkdir(join(projectRoot, leakedPath, ".."), { recursive: true });
    await writeFile(
      join(projectRoot, leakedPath),
      "synthetic historical transaction contents must not be echoed",
    );
    await git(projectRoot, ["add", "--force", "--", leakedPath]);
    await commit(projectRoot, "add synthetic transaction residue");
    const { stdout: addCommit } = await git(projectRoot, ["rev-parse", "HEAD"]);
    await rm(join(projectRoot, leakedPath));
    await git(projectRoot, ["add", "-u", "--", leakedPath]);
    await commit(projectRoot, "remove synthetic transaction residue");
    const { stdout: removeCommit } = await git(projectRoot, ["rev-parse", "HEAD"]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.equal(
      result.leakedPaths.includes(
        `git-history ${addCommit.trim().slice(0, 12)} ${leakedPath}`,
      ),
      true,
    );
    assert.equal(
      result.leakedPaths.includes(
        `git-history ${removeCommit.trim().slice(0, 12)} ${leakedPath}`,
      ),
      true,
    );
    assert.equal(
      result.message.includes(
        "synthetic historical transaction contents must not be echoed",
      ),
      false,
    );
  });

  it("audits every commit newly reachable through a merge", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const { stdout: mainBranch } = await git(projectRoot, [
      "symbolic-ref",
      "--short",
      "HEAD",
    ]);
    await git(projectRoot, ["checkout", "--quiet", "-b", "synthetic-side"]);
    await writeFile(join(projectRoot, "side.bin"), "Fixture Story\n");
    await git(projectRoot, ["add", "--", "side.bin"]);
    await commit(projectRoot, "add side-branch fixture");
    const { stdout: sideCommit } = await git(projectRoot, ["rev-parse", "HEAD"]);
    await git(projectRoot, ["checkout", "--quiet", mainBranch.trim()]);
    await writeFile(join(projectRoot, "main.txt"), "public main-branch change\n");
    await git(projectRoot, ["add", "--", "main.txt"]);
    await commit(projectRoot, "add main-branch fixture");
    await git(projectRoot, [
      "-c",
      "user.name=Synthetic Fixture",
      "-c",
      "user.email=fixture@example.test",
      "merge",
      "--quiet",
      "--no-ff",
      "-m",
      "merge synthetic side",
      "synthetic-side",
    ]);
    await rm(join(projectRoot, "side.bin"));
    await git(projectRoot, ["add", "-u", "--", "side.bin"]);
    await commit(projectRoot, "remove side-branch fixture");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(
      result.leakedPaths.some((label) =>
        label === `git-history ${sideCommit.trim().slice(0, 12)} side.bin`
      ),
      true,
    );
    assert.equal(result.message.includes("Fixture Story"), false);
  });

  it("redacts markers and control separators from renamed historical paths", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const directory = join(projectRoot, "archive");
    const leakedPath = "archive/Fixture Story\n\tsecret.js";
    const renamedPath = "archive/public.js";
    await mkdir(directory);
    await writeFile(join(projectRoot, leakedPath), "public content\n");
    await git(projectRoot, ["add", "--", leakedPath]);
    await commit(projectRoot, "add synthetic filename");
    await rename(join(projectRoot, leakedPath), join(projectRoot, renamedPath));
    await git(projectRoot, ["add", "-A", "--", "archive"]);
    await commit(projectRoot, "rename synthetic filename");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.equal(result.message.includes("Fixture Story"), false);
    for (const label of result.leakedPaths) {
      assert.equal(/[\r\n\t\0\u2028\u2029]/u.test(label), false);
    }
    assert.match(result.message, /^git-history [0-9a-f]{12} /m);
  });

  it("handles an invalid-UTF-8 historical path without exposing raw separators", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const blobPath = join(projectRoot, "synthetic-path-blob.txt");
    await writeFile(blobPath, "public content\n");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "hash-object",
      "-w",
      blobPath,
    ]);
    const rawPath = Buffer.concat([
      Buffer.from("Fixture Story\n\t"),
      Buffer.from([0xff]),
      Buffer.from(".txt"),
    ]);
    await gitWithInput(
      projectRoot,
      ["update-index", "-z", "--index-info"],
      Buffer.concat([
        Buffer.from(`100644 ${blobObjectId.trim()}\t`),
        rawPath,
        Buffer.from([0]),
      ]),
    );
    await commit(projectRoot, "add raw synthetic path");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    for (const label of result.leakedPaths) {
      assert.equal(label.includes("Fixture Story"), false);
      assert.equal(/[\r\n\t\0\u2028\u2029]/u.test(label), false);
    }
  });

  it("keeps distinct invalid-UTF-8 historical paths distinct", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const blobPath = join(projectRoot, "synthetic-private-blob.txt");
    await writeFile(blobPath, "Fixture Story\n");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "hash-object",
      "-w",
      blobPath,
    ]);
    const rawPaths = [0xfe, 0xff].map((byte) =>
      Buffer.concat([
        Buffer.from("raw-"),
        Buffer.from([byte]),
        Buffer.from(".txt"),
      ])
    );
    const records = rawPaths.flatMap((rawPath) => [
      Buffer.from(`100644 ${blobObjectId.trim()}\t`),
      rawPath,
      Buffer.from([0]),
    ]);
    await gitWithInput(
      projectRoot,
      ["update-index", "-z", "--index-info"],
      Buffer.concat(records),
    );
    await commit(projectRoot, "add distinct raw synthetic paths");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });
    const historyLabels = result.leakedPaths.filter((label) =>
      label.startsWith("git-history ")
    );

    assert.equal(historyLabels.length, 2);
    assert.equal(new Set(historyLabels).size, 2);
    assert.equal(result.message.includes("Fixture Story"), false);
  });

  it("keeps distinct invalid-UTF-8 index paths byte-safe", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const blobPath = join(projectRoot, "synthetic-index-private-blob.txt");
    await writeFile(blobPath, "Fixture Story\n");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "hash-object",
      "-w",
      blobPath,
    ]);
    const records = [0xfe, 0xff].flatMap((byte) => [
      Buffer.from(`100644 ${blobObjectId.trim()}\tindex-`),
      Buffer.from([byte]),
      Buffer.from(".txt\0"),
    ]);
    await gitWithInput(
      projectRoot,
      ["update-index", "-z", "--index-info"],
      Buffer.concat(records),
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.leakedPaths.length, 2);
    assert.equal(new Set(result.leakedPaths).size, 2);
    for (const label of result.leakedPaths) {
      assert.match(label, /^private-leak ~[0-9a-f]{12}$/u);
      assert.equal(label.includes("�"), false);
    }
    assert.equal(result.message.includes("Fixture Story"), false);
  });

  it("fails closed when a raw tracked worktree path cannot be opened", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const blobPath = join(projectRoot, "synthetic-raw-clean-blob.txt");
    await writeFile(blobPath, "public content\n");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "hash-object",
      "-w",
      blobPath,
    ]);
    const rawPath = Buffer.concat([
      Buffer.from("unavailable-"),
      Buffer.from([0xff]),
      Buffer.from(".data"),
    ]);
    await gitWithInput(
      projectRoot,
      ["update-index", "-z", "--index-info"],
      Buffer.concat([
        Buffer.from(`100644 ${blobObjectId.trim()}\t`),
        rawPath,
        Buffer.from([0]),
      ]),
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, [
      `private-leak ~${createHash("sha256").update(rawPath).digest("hex").slice(0, 12)}`,
    ]);
  });

  it("reports a non-ENOENT raw lookup failure with an opaque label", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const blobPath = join(projectRoot, "synthetic-overlong-clean-blob.txt");
    await writeFile(blobPath, "public content\n");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "hash-object",
      "-w",
      blobPath,
    ]);
    const lockedDirectory = join(projectRoot, "locked");
    await mkdir(lockedDirectory);
    const rawPath = Buffer.concat([
      Buffer.from("locked/opaque-"),
      Buffer.from([0xff]),
    ]);
    await gitWithInput(
      projectRoot,
      ["update-index", "-z", "--index-info"],
      Buffer.concat([
        Buffer.from(`100644 ${blobObjectId.trim()}\t`),
        rawPath,
        Buffer.from([0]),
      ]),
    );

    await chmod(lockedDirectory, 0);
    let result;
    try {
      result = await verifyPrivateStoryIsolation({
        baseRevision,
        projectRoot,
        requirePrivateInputs: true,
      });
    } finally {
      await chmod(lockedDirectory, 0o700);
    }

    assert.deepEqual(result.leakedPaths, [
      `private-leak ~${createHash("sha256").update(rawPath).digest("hex").slice(0, 12)}`,
    ]);
  });

  it("scans narration and marker bytes at raw POSIX worktree paths", async (testContext) => {
    const privateAudio = Buffer.from("ID3 raw working-tree narration bytes");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [privateAudio, Buffer.from("ID3 other narration bytes")],
    });
    const cleanBlobPath = join(projectRoot, "synthetic-raw-clean-blob.txt");
    await writeFile(cleanBlobPath, "public content\n");
    const { stdout: blobObjectId } = await git(projectRoot, [
      "hash-object",
      "-w",
      cleanBlobPath,
    ]);
    const rawPaths = [0xfe, 0xff].map((byte) =>
      Buffer.concat([
        Buffer.from("working-tree-"),
        Buffer.from([byte]),
        Buffer.from(".data"),
      ])
    );
    await gitWithInput(
      projectRoot,
      ["update-index", "-z", "--index-info"],
      Buffer.concat(
        rawPaths.flatMap((rawPath) => [
          Buffer.from(`100644 ${blobObjectId.trim()}\t`),
          rawPath,
          Buffer.from([0]),
        ]),
      ),
    );
    await commit(projectRoot, "add raw working-tree paths");
    let createdPathCount = 0;
    for (const rawPath of rawPaths) {
      try {
        await writeFile(
          Buffer.concat([Buffer.from(`${projectRoot}/`), rawPath]),
          "public content\n",
        );
        createdPathCount += 1;
      } catch (error) {
        if (!["EILSEQ", "EINVAL", "ENOTSUP", "ERR_INVALID_ARG_TYPE"].includes(error?.code)) {
          throw error;
        }
        testContext.skip("filesystem does not represent raw non-UTF-8 paths");
        return;
      }
    }

    assert.equal(createdPathCount, 2);
    const cleanResult = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });
    assert.equal(cleanResult.status, "clean");

    await Promise.all(
      rawPaths.map((rawPath, index) =>
        writeFile(
          Buffer.concat([Buffer.from(`${projectRoot}/`), rawPath]),
          index === 0 ? privateAudio : Buffer.from("Fixture Story\n"),
        )
      ),
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(
      result.leakedPaths,
      rawPaths
        .map(
          (rawPath) =>
            `private-leak ~${createHash("sha256").update(rawPath).digest("hex").slice(0, 12)}`,
        )
        .sort(),
    );
  });

  it("ignores Git replacement refs while auditing branch history", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    await writeFile(join(projectRoot, "replaced.txt"), "Fixture Story\n");
    await git(projectRoot, ["add", "--", "replaced.txt"]);
    await commit(projectRoot, "add replaced synthetic leak");
    const { stdout: leakedCommit } = await git(projectRoot, ["rev-parse", "HEAD"]);
    await rm(join(projectRoot, "replaced.txt"));
    await git(projectRoot, ["add", "-u", "--", "replaced.txt"]);
    await commit(projectRoot, "remove replaced synthetic leak");
    const { stdout: baseTree } = await git(projectRoot, [
      "rev-parse",
      `${baseRevision}^{tree}`,
    ]);
    const { stdout: replacementCommit } = await git(projectRoot, [
      "-c",
      "user.name=Synthetic Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit-tree",
      baseTree.trim(),
      "-p",
      baseRevision,
      "-m",
      "synthetic clean replacement",
    ]);
    await git(projectRoot, [
      "replace",
      leakedCommit.trim(),
      replacementCommit.trim(),
    ]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.equal(result.message.includes("Fixture Story"), false);
    assert.match(result.message, /^git-history [0-9a-f]{12} replaced\.txt$/m);
  });

  it("scrubs ambient Git repository selectors while auditing the real index and history", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    const historicalPath = "archive/ambient-selector.txt";
    const addCommit = await commitAndDeleteFiles(projectRoot, [[
      historicalPath,
      "Fixture Story\n",
    ]]);
    await writeFile(join(projectRoot, "current.txt"), "Fixture Story\n");
    await git(projectRoot, ["add", "--", "current.txt"]);

    const { stdout: realGitOutput } = await execFileAsync("which", ["git"], {
      encoding: "utf8",
    });
    const wrapperDirectory = join(projectRoot, "synthetic-bin");
    const wrapperPath = join(wrapperDirectory, "git");
    await mkdir(wrapperDirectory);
    await writeFile(
      wrapperPath,
      [
        "#!/usr/bin/env node",
        'import { spawnSync } from "node:child_process";',
        `const realGit = ${JSON.stringify(realGitOutput.trim())};`,
        'const unsafe = Object.keys(process.env).filter((name) => /^GIT_/iu.test(name) && name !== "GIT_NO_REPLACE_OBJECTS");',
        'if (unsafe.length || process.env.GIT_NO_REPLACE_OBJECTS !== "1") process.exit(97);',
        'const result = spawnSync(realGit, process.argv.slice(2), { env: process.env, stdio: "inherit" });',
        "if (result.error) throw result.error;",
        "process.exit(result.status ?? 1);",
      ].join("\n"),
    );
    await chmod(wrapperPath, 0o755);

    const ambientSelectors = {
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "ambient-alternate-selector",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_GLOBAL: "ambient-global-config",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_SYSTEM: "ambient-system-config",
      GIT_CONFIG_VALUE_0: "ambient-hooks",
      GIT_DIR: "ambient-git-directory",
      GIT_INDEX_FILE: "ambient-index-file",
      GIT_OBJECT_DIRECTORY: "ambient-object-directory",
      GIT_REPLACE_REF_BASE: "refs/ambient-replacements/",
      GIT_WORK_TREE: "ambient-work-tree",
    };
    const previousEnvironment = new Map(
      ["PATH", ...Object.keys(ambientSelectors)].map((name) => [
        name,
        process.env[name],
      ]),
    );
    let result;
    try {
      process.env.PATH = `${wrapperDirectory}${delimiter}${process.env.PATH}`;
      Object.assign(process.env, ambientSelectors);
      result = await verifyPrivateStoryIsolation({
        baseRevision,
        projectRoot,
        requirePrivateInputs: true,
      });
    } catch (error) {
      for (const value of Object.values(ambientSelectors)) {
        assert.equal(error.message.includes(value), false);
      }
      throw error;
    } finally {
      for (const [name, value] of previousEnvironment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }

    assert.deepEqual(result.leakedPaths, [
      "current.txt",
      `git-history ${addCommit.slice(0, 12)} ${historicalPath}`,
    ]);
  });

  it("treats historical gitlinks as paths without reading commits as blobs", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture();
    await git(projectRoot, [
      "update-index",
      "--add",
      "--cacheinfo",
      "160000",
      baseRevision,
      "modules/synthetic-fixture",
    ]);
    await commit(projectRoot, "add synthetic gitlink");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "clean");
    assert.deepEqual(result.leakedPaths, []);
  });

  it("detects an exact private narration file renamed in dist", async () => {
    const privateAudio = Buffer.from("ID3 synthetic private narration bytes");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [privateAudio, Buffer.from("ID3 different narration bytes")],
    });
    await mkdir(join(projectRoot, "dist/assets"), { recursive: true });
    await writeFile(join(projectRoot, "dist/assets/renamed.bin"), privateAudio);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, ["dist/assets/renamed.bin"]);
    assert.equal(
      result.message.includes(createHash("sha256").update(privateAudio).digest("hex")),
      false,
    );
  });

  it("detects an exact private narration file renamed in the index", async () => {
    const privateAudio = Buffer.from("ID3 synthetic staged narration bytes");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [privateAudio, Buffer.from("ID3 different narration bytes")],
    });
    await mkdir(join(projectRoot, "public"));
    await writeFile(join(projectRoot, "public/renamed.data"), privateAudio);
    await git(projectRoot, ["add", "--", "public/renamed.data"]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.deepEqual(result.leakedPaths, ["public/renamed.data"]);
  });

  it("detects exact private narration bytes committed and later deleted", async () => {
    const privateAudio = Buffer.from("ID3 synthetic archived narration bytes");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [privateAudio, Buffer.from("ID3 different narration bytes")],
    });
    const leakedPath = "archived.data";
    await writeFile(join(projectRoot, leakedPath), privateAudio);
    await git(projectRoot, ["add", "--", leakedPath]);
    await commit(projectRoot, "add archived bytes");
    await rm(join(projectRoot, leakedPath));
    await git(projectRoot, ["add", "-u", "--", leakedPath]);
    await commit(projectRoot, "remove archived bytes");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "leaks");
    assert.match(result.message, /^git-history [0-9a-f]{12} archived\.data$/m);
  });

  it("allows changed or embedded private narration bytes", async () => {
    const privateAudio = Buffer.from("ID3 synthetic exact narration bytes");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [privateAudio, Buffer.from("ID3 different narration bytes")],
    });
    await mkdir(join(projectRoot, "dist"));
    await writeFile(
      join(projectRoot, "dist/changed.bin"),
      Buffer.concat([privateAudio.subarray(0, -1), Buffer.from("X")]),
    );
    await writeFile(
      join(projectRoot, "dist/embedded.bin"),
      Buffer.concat([Buffer.from("prefix"), privateAudio, Buffer.from("suffix")]),
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "clean");
    assert.deepEqual(result.leakedPaths, []);
  });

  it("reports distinct paths for duplicate private narration hashes", async () => {
    const duplicateAudio = Buffer.from("ID3 synthetic duplicate narration bytes");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      audioBytes: [duplicateAudio, duplicateAudio],
    });
    await mkdir(join(projectRoot, "dist"));
    await writeFile(join(projectRoot, "dist/copy-one.data"), duplicateAudio);
    await writeFile(join(projectRoot, "dist/copy-two.data"), duplicateAudio);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(result.leakedPaths, [
      "dist/copy-one.data",
      "dist/copy-two.data",
    ]);
  });

  it("detects a normalized rolling twelve-word prose excerpt", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      firstBody:
        "Traveler’s amber lanterns drift quietly beyond silver rivers while patient foxes gather beneath ancient moonlit branches.",
    });
    await writeFile(
      join(projectRoot, "public.txt"),
      "TRAVELER'S, amber! lanterns\\ndrift quietly\tbeyond; SILVER rivers while patient foxes gather",
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(result.leakedPaths, ["public.txt"]);
  });

  it("detects a twelve-word excerpt spanning adjacent units in current, dist, and history", async () => {
    const units = [
      "Crimson astronomers quietly chart",
      "distant nebulae beyond frozen",
      "harbors while patient foxes",
    ];
    const excerpt = units.join(" ");
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      firstBody: units.join(".\n\n"),
    });
    const historicalPath = "archive/cross-unit.txt";
    const addCommit = await commitAndDeleteFiles(projectRoot, [[
      historicalPath,
      excerpt,
    ]]);
    await writeFile(join(projectRoot, "current.txt"), excerpt);
    await git(projectRoot, ["add", "--", "current.txt"]);
    await mkdir(join(projectRoot, "dist"));
    await writeFile(join(projectRoot, "dist/cross-unit.txt"), excerpt);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(result.leakedPaths, [
      "current.txt",
      "dist/cross-unit.txt",
      `git-history ${addCommit.slice(0, 12)} ${historicalPath}`,
    ]);
  });

  it("does not fingerprint across the boundary between two stories", () => {
    const firstStoryEnd = "crimson astronomers quietly chart distant nebulae";
    const secondStoryStart = "beyond frozen harbors while patient foxes";

    const result = scanPrivateStoryIsolation({
      excerptSourceGroups: [[firstStoryEnd], [secondStoryStart]],
      trackedFiles: [[
        "public.txt",
        `${firstStoryEnd} ${secondStoryStart}`,
      ]],
    });

    assert.deepEqual(result.leakedPaths, []);
  });

  it("ignores a twelve-word window with only one repeated token", () => {
    const repeatedWindow = Array.from({ length: 12 }, () => "echo").join(" ");

    const result = scanPrivateStoryIsolation({
      excerptSourceGroups: [[`${repeatedWindow} ending`]],
      trackedFiles: [["public.txt", repeatedWindow]],
    });

    assert.deepEqual(result.leakedPaths, []);
  });

  it("ignores a twelve-word window shorter than fifty normalized characters", () => {
    const shortWindow = "a an i in on at to by up no go do";

    const result = scanPrivateStoryIsolation({
      excerptSourceGroups: [[`${shortWindow} ending`]],
      trackedFiles: [["public.txt", shortWindow]],
    });

    assert.deepEqual(result.leakedPaths, []);
  });

  it("detects a distinctive whole eight-to-eleven-word prose unit", async () => {
    const privateUnit =
      "Curious marmots quietly catalogue shimmering constellations beyond distant valleys";
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      firstBody: `${privateUnit}.\n\nA harmless closing paragraph keeps the page marker different.`,
    });
    await writeFile(
      join(projectRoot, "public.txt"),
      "CURIOUS marmots, quietly catalogue shimmering constellations beyond distant valleys!",
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(result.leakedPaths, ["public.txt"]);
  });

  it("detects normalized prose excerpts in commit messages", async () => {
    const privateUnit =
      "Brilliant otters patiently arrange twelve gleaming pebbles beside quiet waterfalls before sunrise arrives";
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      firstBody: `${privateUnit}. Extra source words keep this from being a full marker.`,
    });
    await commit(
      projectRoot,
      "BRILLIANT otters, patiently arrange twelve gleaming pebbles beside quiet waterfalls before sunrise",
    );
    const { stdout } = await git(projectRoot, ["rev-parse", "HEAD"]);

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.deepEqual(result.leakedPaths, [`git-commit ${stdout.trim().slice(0, 12)}`]);
    assert.equal(result.message.includes("Brilliant otters"), false);
  });

  it("detects and redacts a normalized prose excerpt in a historical path", async () => {
    const privateUnit =
      "Curious marmots quietly catalogue shimmering constellations beyond distant valleys";
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      firstBody: `${privateUnit}.\n\nA harmless closing paragraph keeps the page marker different.`,
    });
    const leakedPath = `archive/${privateUnit.toUpperCase().replaceAll(" ", "-")}.txt`;
    await mkdir(join(projectRoot, "archive"));
    await writeFile(join(projectRoot, leakedPath), "public content\n");
    await git(projectRoot, ["add", "--", leakedPath]);
    await commit(projectRoot, "add synthetic prose path");

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.leakedPaths.length >= 1, true);
    assert.match(result.message, /^git-history [0-9a-f]{12} /);
    for (const label of result.leakedPaths) {
      assert.equal(label.toLowerCase().includes("curious"), false);
      assert.equal(/[\r\n\t\0\u2028\u2029]/u.test(label), false);
    }
  });

  it("ignores short, common, and highly repetitive source units", async () => {
    const { baseRevision, projectRoot } = await createReleaseAuditFixture({
      firstBody: [
        "One two three four five six seven.",
        "Echo echo echo echo echo echo echo echo.",
        "A harmless closing paragraph keeps the complete marker different.",
      ].join("\n\n"),
    });
    await writeFile(
      join(projectRoot, "public.txt"),
      "One, two three four five six seven. Echo echo echo echo echo echo echo echo.",
    );

    const result = await verifyPrivateStoryIsolation({
      baseRevision,
      projectRoot,
      requirePrivateInputs: true,
    });

    assert.equal(result.status, "clean");
    assert.deepEqual(result.leakedPaths, []);
  });
});
