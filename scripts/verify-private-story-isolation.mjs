/* global Buffer, URL */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
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

function redactLeakedPath(filePath, variants) {
  let redactedPath = normalizePath(filePath);
  for (const marker of [...variants].sort((left, right) => right.length - left.length)) {
    redactedPath = redactedPath.replaceAll(marker, "[private-marker]");
  }
  return JSON.stringify(redactedPath).slice(1, -1);
}

export function scanPrivateStoryIsolation({
  distFiles = [],
  markers = [],
  trackedFiles = [],
} = {}) {
  const variants = markerVariants(markers);
  const leakedPaths = [...trackedFiles, ...distFiles]
    .filter(([filePath, contents]) => fileLeaks(filePath, contents, variants))
    .map(([filePath]) => redactLeakedPath(filePath, variants));
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

function pathEscapes(root, target) {
  const relativePath = path.relative(root, target);
  return (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

async function resolveDistDirectory(projectRoot, distDirectory) {
  const root = path.resolve(projectRoot);
  const directory = path.resolve(root, distDirectory ?? "dist");
  if (pathEscapes(root, directory)) {
    throw new Error("The dist directory must stay inside the project root");
  }

  const realRoot = await realpath(root);
  let currentPath = root;
  for (const segment of path.relative(root, directory).split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    try {
      await lstat(currentPath);
      if (pathEscapes(realRoot, await realpath(currentPath))) {
        throw new Error("The dist directory must stay inside the project root");
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }

  return directory;
}

async function readTrackedFiles(projectRoot, trackedPaths) {
  const files = await Promise.all(
    trackedPaths.map(async (filePath) => {
      const absolutePath = resolveInsideProject(projectRoot, filePath);
      try {
        const fileStats = await lstat(absolutePath);
        const contents = fileStats.isSymbolicLink()
          ? await readlink(absolutePath)
          : await readFile(absolutePath);
        return [filePath, contents];
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
  return files.filter(Boolean);
}

async function readIndexFiles(projectRoot, trackedPaths) {
  const files = [];
  for (const filePath of trackedPaths) {
    const { stdout } = await execFileAsync(
      "git",
      ["cat-file", "blob", `:${filePath}`],
      {
        cwd: projectRoot,
        encoding: null,
        maxBuffer: 128 * 1024 * 1024,
      },
    );
    files.push([filePath, stdout]);
  }
  return files;
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
  distDirectory,
  previewDirectory,
  projectRoot = rootDir,
  requirePrivateInputs = false,
} = {}) {
  const resolvedDistDirectory = await resolveDistDirectory(
    projectRoot,
    distDirectory,
  );
  const directory = path.resolve(
    previewDirectory ?? path.join(projectRoot, PRIVATE_INPUT_DIRECTORY),
  );
  const manifestPath = path.join(directory, "manifest.json");
  const privateTrackedPaths = await gitTrackedPaths(
    projectRoot,
    PRIVATE_INPUT_DIRECTORY,
  );
  const hasPrivateInputs = existsSync(manifestPath);
  if (!hasPrivateInputs && requirePrivateInputs) {
    throw new Error("Private story inputs are required");
  }

  const markers = hasPrivateInputs
    ? (
        await loadPrivateStoryPreview({
          previewDirectory: directory,
          projectRoot,
          requireAudio: false,
        })
      ).markers
    : [];
  const trackedPaths = await gitTrackedPaths(projectRoot);
  const publicTrackedPaths = trackedPaths.filter(
    (filePath) => !normalizePath(filePath).startsWith(`${PRIVATE_INPUT_DIRECTORY}/`),
  );
  const [indexFiles, workingTreeFiles] = await Promise.all([
    readIndexFiles(projectRoot, publicTrackedPaths),
    readTrackedFiles(projectRoot, publicTrackedPaths),
  ]);
  const distFiles = existsSync(resolvedDistDirectory)
    ? await readDirectoryFiles(resolvedDistDirectory, projectRoot)
    : [];
  const result = scanPrivateStoryIsolation({
    distFiles,
    markers,
    trackedFiles: [
      ...privateTrackedPaths.map((filePath) => [filePath, ""]),
      ...indexFiles,
      ...workingTreeFiles,
    ],
  });

  return {
    ...result,
    message:
      result.message ||
      (hasPrivateInputs ? "" : "Private story inputs absent; skipped."),
    status: result.leakedPaths.length
      ? "leaks"
      : hasPrivateInputs
        ? "clean"
        : "skipped",
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
      distDirectory: readArg("dist"),
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
