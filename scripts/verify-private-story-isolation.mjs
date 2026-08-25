/* global Buffer, URL */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

function removeMarkers(value, variants) {
  const sortedVariants = [...variants].sort(
    (left, right) => right.length - left.length,
  );
  let redacted = value;
  let changed = false;

  while (true) {
    const previous = redacted;
    for (const marker of sortedVariants) {
      redacted = redacted.replaceAll(marker, "");
    }
    if (redacted === previous) return { changed, value: redacted };
    changed = true;
  }
}

function markerSafeSuffix(filePath, variants) {
  const digest = createHash("sha256").update(filePath).digest("hex");
  const conciseSuffix = `~${digest.slice(0, 12)}`;
  if (!variants.some((marker) => conciseSuffix.includes(marker))) {
    return conciseSuffix;
  }

  const markerCharacters = new Set(variants.join(""));
  const safeCharacters = [];
  for (let codePoint = 0xe000; safeCharacters.length < 3; codePoint += 1) {
    const character = String.fromCodePoint(codePoint);
    if (!markerCharacters.has(character)) safeCharacters.push(character);
  }
  const binaryDigest = [...Buffer.from(digest, "hex")]
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("");
  const bits = [...binaryDigest.slice(0, 64)]
    .map((bit) => safeCharacters[Number(bit)])
    .join("");
  return `${safeCharacters[2]}${bits}`;
}

function redactLeakedPath(filePath, variants) {
  const normalizedPath = normalizePath(filePath);
  const redaction = removeMarkers(normalizedPath, variants);
  const diagnostic = redaction.changed
    ? `${redaction.value}${markerSafeSuffix(normalizedPath, variants)}`
    : redaction.value;
  const escaped = JSON.stringify(diagnostic)
    .slice(1, -1)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return removeMarkers(escaped, variants).value;
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

async function gitTrackedEntries(projectRoot) {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--stage", "-z"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return stdout.split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    const metadata = record.slice(0, separator);
    const match = /^(\d{6}) ([0-9a-f]+) ([0-3])$/.exec(metadata);
    if (separator < 0 || !match) {
      throw new Error("Unable to parse the Git index");
    }
    return {
      mode: match[1],
      objectId: match[2],
      path: record.slice(separator + 1),
    };
  });
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
          : fileStats.isFile()
            ? await readFile(absolutePath)
            : "";
        return [filePath, contents];
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
  return files.filter(Boolean);
}

async function readIndexFiles(projectRoot, trackedEntries) {
  const files = [];
  for (const entry of trackedEntries) {
    if (entry.mode === "160000") {
      files.push([entry.path, ""]);
      continue;
    }
    if (!["100644", "100755", "120000"].includes(entry.mode)) {
      throw new Error("Unexpected Git index entry mode");
    }
    const { stdout } = await execFileAsync(
      "git",
      ["cat-file", "blob", entry.objectId],
      {
        cwd: projectRoot,
        encoding: null,
        maxBuffer: 128 * 1024 * 1024,
      },
    );
    files.push([entry.path, stdout]);
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

  const markers = hasPrivateInputs
    ? (
        await loadPrivateStoryPreview({
          previewDirectory: directory,
          projectRoot,
          requireAudio: false,
        })
      ).markers
    : [];
  const trackedEntries = await gitTrackedEntries(projectRoot);
  const trackedPaths = [...new Set(trackedEntries.map((entry) => entry.path))];
  const publicTrackedPaths = trackedPaths.filter(
    (filePath) => !normalizePath(filePath).startsWith(`${PRIVATE_INPUT_DIRECTORY}/`),
  );
  const publicTrackedEntries = trackedEntries.filter(
    (entry) => !normalizePath(entry.path).startsWith(`${PRIVATE_INPUT_DIRECTORY}/`),
  );
  const [indexFiles, workingTreeFiles] = await Promise.all([
    readIndexFiles(projectRoot, publicTrackedEntries),
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

  if (!result.leakedPaths.length && !hasPrivateInputs && requirePrivateInputs) {
    throw new Error("Private story inputs are required");
  }

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
