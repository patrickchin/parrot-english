/* global process */

import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  decodePrivateStorySource,
  paginatePrivateStoryText,
} from "../lib/private-story-preview.js";

const DEFAULT_FILE_SYSTEM = {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
};

async function requireReadable(file, fileSystem) {
  try {
    const [bytes, realFilePath] = await Promise.all([
      fileSystem.readFile(file),
      fileSystem.realpath(file),
    ]);
    return { bytes, realFilePath };
  } catch {
    throw new Error("Expected exactly two readable source files");
  }
}

async function pathExists(filePath, fileSystem) {
  try {
    await fileSystem.lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isInside(directory, filePath) {
  const relativePath = path.relative(directory, filePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

async function existingRealPath(filePath, fileSystem) {
  try {
    return await fileSystem.realpath(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function preparePrivateStoryPreview({
  fileSystem,
  force = false,
  previewDirectory,
  sourceFiles,
} = {}) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length !== 2) {
    throw new Error("Expected exactly two readable source files");
  }
  const operations = { ...DEFAULT_FILE_SYSTEM, ...fileSystem };
  const directory = path.resolve(previewDirectory ?? "content/private-story-preview");
  const destinationRealPath = await existingRealPath(directory, operations);
  const sources = await Promise.all(
    sourceFiles.map((sourceFile) => requireReadable(sourceFile, operations)),
  );
  if (
    sourceFiles.some((sourceFile) => isInside(directory, path.resolve(sourceFile))) ||
    (destinationRealPath &&
      sources.some(({ realFilePath }) => isInside(destinationRealPath, realFilePath)))
  ) {
    throw new Error("Private story source files must stay outside the preview directory");
  }
  const validatedSources = sources.map(({ bytes }) => {
    const { title } = paginatePrivateStoryText(decodePrivateStorySource(bytes));
    return { bytes, title };
  });
  const manifestPath = path.join(directory, "manifest.json");
  if (!force && await pathExists(manifestPath, operations)) {
    throw new Error("Private story preview manifest already exists; use --force to replace it");
  }
  const stories = validatedSources.map(({ title }, index) => ({
    id: `private-story-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    textFile: `story-${index + 1}.txt`,
    title,
  }));
  const manifest = { stories, version: 1 };

  const parentDirectory = path.dirname(directory);
  await operations.mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = path.join(
    parentDirectory,
    `.${path.basename(directory)}.stage-${randomUUID()}.tmp`,
  );
  await operations.mkdir(stagingDirectory);
  let backupDirectory = null;
  let stagingExists = true;
  try {
    await Promise.all(
      validatedSources.map(({ bytes }, index) =>
        operations.writeFile(path.join(stagingDirectory, `story-${index + 1}.txt`), bytes),
      ),
    );
    await operations.writeFile(
      path.join(stagingDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    if (await pathExists(directory, operations)) {
      backupDirectory = path.join(
        parentDirectory,
        `.${path.basename(directory)}.backup-${randomUUID()}.tmp`,
      );
      await operations.rename(directory, backupDirectory);
    }
    try {
      await operations.rename(stagingDirectory, directory);
      stagingExists = false;
    } catch (error) {
      if (backupDirectory) await operations.rename(backupDirectory, directory);
      throw error;
    }
    if (backupDirectory) {
      try {
        await operations.rm(backupDirectory, { force: true, recursive: true });
        backupDirectory = null;
      } catch (cleanupError) {
        await operations.rename(directory, stagingDirectory);
        stagingExists = true;
        await operations.rename(backupDirectory, directory);
        backupDirectory = null;
        await operations.rm(stagingDirectory, { force: true, recursive: true });
        stagingExists = false;
        throw cleanupError;
      }
    }
  } finally {
    if (stagingExists) {
      await operations.rm(stagingDirectory, { force: true, recursive: true });
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
