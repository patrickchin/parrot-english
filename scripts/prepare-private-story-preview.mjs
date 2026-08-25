/* global process */

import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

function titleFromSource(source) {
  const normalized = source.replace(/\r\n?/g, "\n");
  const match = /^# ([^\n]+)(?:\n|$)/.exec(normalized);
  if (!match) throw new Error("Each private story source must start with a Markdown H1");
  return match[1].replace(/[ \t]+$/, "");
}

async function requireReadable(file) {
  try {
    await access(file);
    return await readFile(file);
  } catch {
    throw new Error("Expected exactly two readable source files");
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
  await Promise.all(sourceFiles.map(requireReadable));
  const manifestPath = path.join(directory, "manifest.json");
  if (!force) {
    try {
      await access(manifestPath);
      throw new Error("Private story preview manifest already exists; use --force to replace it");
    } catch (error) {
      if (error.message.includes("already exists")) throw error;
    }
  }
  await mkdir(directory, { recursive: true });
  const stories = await Promise.all(
    sourceFiles.map(async (sourceFile, index) => {
      const source = await readFile(sourceFile, "utf8");
      const textFile = `story-${index + 1}.txt`;
      await copyFile(sourceFile, path.join(directory, textFile));
      return {
        id: `private-story-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        textFile,
        title: titleFromSource(source),
      };
    }),
  );
  const manifest = { stories, version: 1 };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
