import { randomUUID } from "node:crypto";
import console from "node:console";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import {
  appendCatalogToDeploymentLedger,
  compileNurseryRhymePackages,
  readRhymeDeploymentLedger,
  serializeDeploymentLedger,
  serializeGeneratedCatalog,
} from "./nursery-rhyme/compiler.mjs";

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

export async function runRhymeCatalogGenerator({ check, rootDir, runTool }) {
  const contentRoot = path.join(rootDir, "public", "assets", "nursery-rhymes");
  const ledgerPath = path.join(rootDir, "scripts", "nursery-rhyme-deployed-ids.json");
  const outputPath = path.join(rootDir, "src", "dubbing", "generated-rhyme-catalog.ts");
  const catalog = await compileNurseryRhymePackages({
    contentRoot,
    ledgerPath,
    runTool,
  });
  const ledger = await readRhymeDeploymentLedger(ledgerPath);
  const expectedLedger = serializeDeploymentLedger(
    appendCatalogToDeploymentLedger(catalog, ledger, ledgerPath),
  );
  const expectedGenerated = serializeGeneratedCatalog(catalog);
  const [currentLedger, currentGenerated] = await Promise.all([
    readExisting(ledgerPath),
    readExisting(outputPath),
  ]);

  if (check) {
    const stale = [];
    if (currentLedger !== expectedLedger) stale.push(path.relative(rootDir, ledgerPath));
    const generatedIsStale = currentGenerated !== expectedGenerated;
    if (generatedIsStale) stale.push(path.relative(rootDir, outputPath));
    if (stale.length > 0) {
      const generatedDiagnostic = generatedIsStale
        ? ` ${firstGeneratedDifference(expectedGenerated, currentGenerated)}`
        : "";
      throw new Error(
        `Nursery rhyme catalog is stale (${stale.join(", ")}). Run npm run generate:rhyme-catalog.${generatedDiagnostic}`,
      );
    }
    return;
  }

  if (currentLedger !== expectedLedger) await atomicWrite(ledgerPath, expectedLedger);
  if (currentGenerated !== expectedGenerated) {
    await atomicWrite(outputPath, expectedGenerated);
  }
}

function cliMode(arguments_) {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === "--check") return true;
  throw new Error(
    `Unknown nursery rhyme catalog argument: ${arguments_.join(" ")}. Usage: node scripts/generate-rhyme-catalog.mjs [--check]`,
  );
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  try {
    await runRhymeCatalogGenerator({
      check: cliMode(process.argv.slice(2)),
      rootDir,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
