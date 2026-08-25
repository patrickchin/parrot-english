/* global process */

import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { paginatePrivateStoryText } from "../lib/private-story-preview.js";

async function requireReadable(file) {
  try {
    return await readFile(file);
  } catch {
    throw new Error("Expected exactly two readable source files");
  }
}

async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function preparePrivateStoryPreview({
  force = false,
  previewDirectory,
  sourceFiles,
} = {}) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length !== 2) {
    throw new Error("Expected exactly two readable source files");
  }
  const directory = path.resolve(previewDirectory ?? "content/private-story-preview");
  if (
    sourceFiles.some((sourceFile) => {
      const relativePath = path.relative(directory, path.resolve(sourceFile));
      return (
        relativePath === "" ||
        (relativePath !== ".." &&
          !relativePath.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relativePath))
      );
    })
  ) {
    throw new Error("Private story source files must stay outside the preview directory");
  }
  const validatedSources = await Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const bytes = await requireReadable(sourceFile);
      const { title } = paginatePrivateStoryText(bytes.toString("utf8"));
      return { bytes, title };
    }),
  );
  const manifestPath = path.join(directory, "manifest.json");
  if (!force && await pathExists(manifestPath)) {
    throw new Error("Private story preview manifest already exists; use --force to replace it");
  }
  const stories = validatedSources.map(({ title }, index) => ({
    id: `private-story-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    textFile: `story-${index + 1}.txt`,
    title,
  }));
  const manifest = { stories, version: 1 };

  const parentDirectory = path.dirname(directory);
  await mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = path.join(
    parentDirectory,
    `.${path.basename(directory)}.stage-${randomUUID()}.tmp`,
  );
  await mkdir(stagingDirectory);
  let backupDirectory = null;
  let stagingExists = true;
  try {
    await Promise.all(
      validatedSources.map(({ bytes }, index) =>
        writeFile(path.join(stagingDirectory, `story-${index + 1}.txt`), bytes),
      ),
    );
    await writeFile(
      path.join(stagingDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    if (await pathExists(directory)) {
      backupDirectory = path.join(
        parentDirectory,
        `.${path.basename(directory)}.backup-${randomUUID()}.tmp`,
      );
      await rename(directory, backupDirectory);
    }
    try {
      await rename(stagingDirectory, directory);
      stagingExists = false;
    } catch (error) {
      if (backupDirectory) await rename(backupDirectory, directory);
      throw error;
    }
    if (backupDirectory) {
      await rm(backupDirectory, { force: true, recursive: true });
      backupDirectory = null;
    }
  } finally {
    if (stagingExists) {
      await rm(stagingDirectory, { force: true, recursive: true });
    }
  }
  return manifest;
}

function parseArguments(args, cwd) {
  const sourceFiles = [];
  let force = false;
  for (const arg of args) {
    if (arg === "--force") force = true;
    else if (arg.startsWith("--source=")) sourceFiles.push(path.resolve(cwd, arg.slice(9)));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { force, sourceFiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { force, sourceFiles } = parseArguments(process.argv.slice(2), process.cwd());
  await preparePrivateStoryPreview({ force, sourceFiles });
}
