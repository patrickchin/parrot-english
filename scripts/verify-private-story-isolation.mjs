/* global Buffer, URL */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPrivateStoryPreview } from "../lib/private-story-preview.js";

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const PRIVATE_INPUT_DIRECTORY = "content/private-story-preview";
const PRIVATE_ASSET_DIRECTORY = "assets/private-story-preview";

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, "/");
}

function markerVariants(markers) {
  const variants = new Set();
  for (const marker of markers) {
    if (typeof marker !== "string" || !marker) continue;
    variants.add(marker);
    variants.add(JSON.stringify(marker).slice(1, -1));
  }
  return [...variants];
}

function containsPrivatePath(filePath) {
  const normalized = normalizePath(filePath).replace(/^\.\//, "");
  return (
    normalized === PRIVATE_INPUT_DIRECTORY ||
    normalized.startsWith(`${PRIVATE_INPUT_DIRECTORY}/`) ||
    normalized === PRIVATE_ASSET_DIRECTORY ||
    normalized.includes(`/${PRIVATE_ASSET_DIRECTORY}/`) ||
    normalized.endsWith(`/${PRIVATE_ASSET_DIRECTORY}`)
  );
}

function fileLeaks(filePath, contents, variants) {
  if (containsPrivatePath(filePath)) return true;
  const text = Buffer.isBuffer(contents) ? contents.toString("utf8") : String(contents);
  return variants.some(
    (marker) => filePath.includes(marker) || text.includes(marker),
  );
}

export function scanPrivateStoryIsolation({
  distFiles = [],
  markers = [],
  trackedFiles = [],
} = {}) {
  const variants = markerVariants(markers);
  const leakedPaths = [...trackedFiles, ...distFiles]
    .filter(([filePath, contents]) => fileLeaks(filePath, contents, variants))
    .map(([filePath]) => normalizePath(filePath));
  const uniquePaths = [...new Set(leakedPaths)].sort();

  return {
    leakedPaths: uniquePaths,
    message: uniquePaths.join("\n"),
  };
}

async function gitTrackedPaths(projectRoot, pathspec) {
  const args = ["ls-files", "-z"];
  if (pathspec) args.push("--", pathspec);
  const { stdout } = await execFileAsync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return stdout.split("\0").filter(Boolean);
}

function resolveInsideProject(projectRoot, filePath) {
  const resolved = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, resolved);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Tracked path escaped the project root");
  }
  return resolved;
}

async function readTrackedFiles(projectRoot, trackedPaths) {
  return Promise.all(
    trackedPaths.map(async (filePath) => {
      const absolutePath = resolveInsideProject(projectRoot, filePath);
      const fileStats = await lstat(absolutePath);
      const contents = fileStats.isSymbolicLink()
        ? await readlink(absolutePath)
        : await readFile(absolutePath);
      return [filePath, contents];
    }),
  );
}

async function readDirectoryFiles(directory, projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirectoryFiles(absolutePath, projectRoot)));
      continue;
    }
    const contents = entry.isSymbolicLink()
      ? await readlink(absolutePath)
      : await readFile(absolutePath);
    files.push([normalizePath(path.relative(projectRoot, absolutePath)), contents]);
  }

  return files;
}

export async function verifyPrivateStoryIsolation({
  distDirectory = path.join(rootDir, "dist"),
  previewDirectory,
  projectRoot = rootDir,
  requirePrivateInputs = false,
} = {}) {
  const directory = path.resolve(
    previewDirectory ?? path.join(projectRoot, PRIVATE_INPUT_DIRECTORY),
  );
  const manifestPath = path.join(directory, "manifest.json");
  const privateTrackedPaths = await gitTrackedPaths(
    projectRoot,
    PRIVATE_INPUT_DIRECTORY,
  );
  if (privateTrackedPaths.length) {
    const result = scanPrivateStoryIsolation({
      trackedFiles: privateTrackedPaths.map((filePath) => [filePath, ""]),
    });
    return { ...result, status: "leaks" };
  }
  if (!existsSync(manifestPath)) {
    if (requirePrivateInputs) throw new Error("Private story inputs are required");
    return {
      leakedPaths: [],
      message: "Private story inputs absent; skipped.",
      status: "skipped",
    };
  }

  const { markers } = await loadPrivateStoryPreview({
    previewDirectory: directory,
    projectRoot,
    requireAudio: false,
  });
  const trackedPaths = await gitTrackedPaths(projectRoot);
  const trackedFiles = await readTrackedFiles(
    projectRoot,
    trackedPaths.filter(
      (filePath) => !normalizePath(filePath).startsWith(`${PRIVATE_INPUT_DIRECTORY}/`),
    ),
  );
  const distFiles = await readDirectoryFiles(distDirectory, projectRoot);
  const result = scanPrivateStoryIsolation({ distFiles, markers, trackedFiles });

  return {
    ...result,
    status: result.leakedPaths.length ? "leaks" : "clean",
  };
}

function readArg(name) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

async function main() {
  try {
    const result = await verifyPrivateStoryIsolation({
      distDirectory: readArg("dist")
        ? path.resolve(rootDir, readArg("dist"))
        : undefined,
      requirePrivateInputs: process.argv.includes("--require-private-inputs"),
    });
    if (result.status === "leaks") {
      globalThis.console.error(result.message);
      process.exitCode = 1;
    } else {
      globalThis.console.log(result.message || "Private story isolation verified.");
    }
  } catch {
    globalThis.console.error("Private story isolation verification failed.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
