import { randomUUID } from "node:crypto";
import console from "node:console";
import { constants } from "node:fs";
import { lstat, open, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import {
  compileWordGamePackages,
  serializeGeneratedWordGameCatalog,
} from "./word-game/compiler.mjs";

const MAX_DIAGNOSTIC_LINE_LENGTH = 160;

function pathIsInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative.length > 0
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

async function inspectOutputPaths(rootDir) {
  let rootStat;
  try {
    rootStat = await lstat(rootDir);
  } catch (error) {
    throw new Error(`${rootDir}: repository root is missing or unreadable (${error.message})`, {
      cause: error,
    });
  }
  if (rootStat.isSymbolicLink()) {
    throw new Error(`${rootDir}: repository root must not be a symbolic link`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`${rootDir}: repository root must be a directory`);
  }
  const rootRealPath = await realpath(rootDir);
  const outputDirectory = path.join(rootDir, "src", "games");
  let outputDirectoryStat;
  try {
    outputDirectoryStat = await lstat(outputDirectory);
  } catch (error) {
    throw new Error(`${outputDirectory}: output directory is missing or unreadable (${error.message})`, {
      cause: error,
    });
  }
  if (outputDirectoryStat.isSymbolicLink()) {
    throw new Error(`${outputDirectory}: output directory must not be a symbolic link`);
  }
  if (!outputDirectoryStat.isDirectory()) {
    throw new Error(`${outputDirectory}: output directory must be a directory`);
  }
  const outputDirectoryRealPath = await realpath(outputDirectory);
  if (!pathIsInside(rootRealPath, outputDirectoryRealPath)) {
    throw new Error(`${outputDirectory}: output directory resolves outside the repository root`);
  }
  return {
    outputDirectoryRealPath,
    outputPath: path.join(outputDirectory, "generated-word-game-catalog.ts"),
  };
}

async function readExisting(filePath, outputDirectoryRealPath) {
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`${filePath}: generated catalog is unreadable (${error.message})`, {
      cause: error,
    });
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${filePath}: generated catalog must not be a symbolic link`);
  }
  if (!stat.isFile()) {
    throw new Error(`${filePath}: generated catalog must be a regular file`);
  }
  const outputRealPath = await realpath(filePath);
  if (!pathIsInside(outputDirectoryRealPath, outputRealPath)) {
    throw new Error(`${filePath}: generated catalog resolves outside its output directory`);
  }
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`${filePath}: generated catalog changed before it could be opened safely`, {
      cause: error,
    });
  }
  try {
    if (!(await handle.stat()).isFile()) {
      throw new Error(`${filePath}: opened generated catalog must be a regular file`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, contents, { flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function compactLine(line) {
  if (line === undefined) return "<missing>";
  const serialized = JSON.stringify(line);
  if (serialized.length <= MAX_DIAGNOSTIC_LINE_LENGTH) return serialized;
  return `${serialized.slice(0, MAX_DIAGNOSTIC_LINE_LENGTH - 3)}...`;
}

function firstGeneratedDifference(expected, current) {
  const expectedLines = expected.split("\n");
  const currentLines = current === null ? [] : current.split("\n");
  const lineCount = Math.max(expectedLines.length, currentLines.length);
  for (let index = 0; index < lineCount; index += 1) {
    if (expectedLines[index] !== currentLines[index]) {
      return `First generated difference at line ${index + 1}: expected=${compactLine(expectedLines[index])} current=${compactLine(currentLines[index])}`;
    }
  }
  return "";
}

export async function runWordGameCatalogGenerator({ check, rootDir }) {
  const { outputDirectoryRealPath, outputPath } = await inspectOutputPaths(rootDir);
  const current = await readExisting(outputPath, outputDirectoryRealPath);
  const compiled = await compileWordGamePackages({ rootDir });
  const expected = serializeGeneratedWordGameCatalog(compiled);
  if (check) {
    if (current !== expected) {
      throw new Error(
        `Word-game catalog is stale (${path.relative(rootDir, outputPath)}). Run node scripts/generate-word-game-catalog.mjs. ${firstGeneratedDifference(expected, current)}`,
      );
    }
    return;
  }
  if (current !== expected) await atomicWrite(outputPath, expected);
}

function cliMode(arguments_) {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === "--check") return true;
  throw new Error(
    `Unknown word-game catalog argument: ${arguments_.join(" ")}. Usage: node scripts/generate-word-game-catalog.mjs [--check]`,
  );
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    await runWordGameCatalogGenerator({
      check: cliMode(process.argv.slice(2)),
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
