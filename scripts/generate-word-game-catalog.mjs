import { randomUUID } from "node:crypto";
import console from "node:console";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import {
  compileWordGamePackages,
  serializeGeneratedWordGameCatalog,
} from "./word-game/compiler.mjs";

const MAX_DIAGNOSTIC_LINE_LENGTH = 160;

async function readExisting(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
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
  const outputPath = path.join(rootDir, "src", "games", "generated-word-game-catalog.ts");
  const compiled = await compileWordGamePackages({ rootDir });
  const expected = serializeGeneratedWordGameCatalog(compiled);
  const current = await readExisting(outputPath);
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
