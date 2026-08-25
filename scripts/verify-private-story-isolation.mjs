/* global Buffer, URL */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPrivateStoryPreview } from "../lib/private-story-preview.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const PRIVATE_INPUT_DIRECTORY = "content/private-story-preview";
const PRIVATE_ASSET_DIRECTORY = "assets/private-story-preview";
const MAX_GIT_BUFFER = 128 * 1024 * 1024;
const GIT_BLOB_MODES = new Set(["100644", "100755", "120000"]);
const GIT_ENTRY_MODES = new Set([
  "000000",
  ...GIT_BLOB_MODES,
  "160000",
]);

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value));
}

function asText(value) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function normalizePath(filePath) {
  return asText(filePath).replaceAll(path.sep, "/");
}

function hash(value) {
  return createHash("sha256").update(asBuffer(value)).digest("hex");
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

function normalizedWords(value) {
  return (
    asText(value)
      .replace(/\\[nrt]/giu, " ")
      .replace(/[‘’]/gu, "'")
      .toLowerCase()
      .match(/[a-z]+(?:'[a-z]+)?/g) ?? []
  );
}

function wordsHash(words) {
  return hash(words.join(" "));
}

function createExcerptFingerprints(sourceUnits) {
  const fingerprints = new Map();
  const add = (words) => {
    const count = words.length;
    if (!fingerprints.has(count)) fingerprints.set(count, new Set());
    fingerprints.get(count).add(wordsHash(words));
  };

  for (const unit of sourceUnits) {
    const words = normalizedWords(unit);
    if (words.length >= 12) {
      for (let index = 0; index <= words.length - 12; index += 1) {
        add(words.slice(index, index + 12));
      }
      continue;
    }
    if (
      words.length >= 8 &&
      words.join(" ").length >= 50 &&
      new Set(words).size >= 5
    ) {
      add(words);
    }
  }
  return fingerprints;
}

function matchesExcerpt(value, fingerprints) {
  if (!fingerprints.size) return false;
  const words = normalizedWords(value);
  for (const [count, expected] of fingerprints) {
    for (let index = 0; index <= words.length - count; index += 1) {
      if (expected.has(wordsHash(words.slice(index, index + count)))) return true;
    }
  }
  return false;
}

function createPrivacyContext({ audioHashes = [], markers = [], sourceUnits = [] }) {
  return {
    audioHashes: new Set(audioHashes),
    excerptFingerprints: createExcerptFingerprints(sourceUnits),
    variants: markerVariants(markers),
  };
}

function containsPrivatePath(filePath) {
  const normalized = normalizePath(filePath).replace(/^\.\//u, "");
  return (
    normalized === PRIVATE_INPUT_DIRECTORY ||
    normalized.startsWith(`${PRIVATE_INPUT_DIRECTORY}/`) ||
    normalized === PRIVATE_ASSET_DIRECTORY ||
    normalized.includes(`/${PRIVATE_ASSET_DIRECTORY}/`) ||
    normalized.endsWith(`/${PRIVATE_ASSET_DIRECTORY}`)
  );
}

function textLeaks(value, { excerptFingerprints, variants }) {
  const text = asText(value);
  return (
    variants.some((marker) => text.includes(marker)) ||
    matchesExcerpt(value, excerptFingerprints)
  );
}

function fileLeaks(filePath, contents, context) {
  return (
    containsPrivatePath(filePath) ||
    textLeaks(filePath, context) ||
    textLeaks(contents, context) ||
    (context.audioHashes.size > 0 && context.audioHashes.has(hash(contents)))
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

function markerSafeSuffix(filePath, redactedPath, variants) {
  const digest = hash(filePath);
  const conciseSuffix = `~${digest.slice(0, 12)}`;
  if (!variants.some((marker) => `${redactedPath}${conciseSuffix}`.includes(marker))) {
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

function escapeDiagnostic(value) {
  return JSON.stringify(value)
    .slice(1, -1)
    .replace(/[\u007f-\u009f]/gu, (character) =>
      `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`
    )
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function redactLeakedPath(filePath, variants) {
  const decodedPath = asText(filePath);
  const decodedLosslessly =
    !Buffer.isBuffer(filePath) || Buffer.from(decodedPath).equals(filePath);
  const normalizedPath = decodedPath.replaceAll(path.sep, "/");
  const redaction = removeMarkers(normalizedPath, variants);
  const escaped = escapeDiagnostic(redaction.value);
  const escapedRedaction = removeMarkers(escaped, variants);
  if (decodedLosslessly && !redaction.changed && !escapedRedaction.changed) {
    return escapedRedaction.value;
  }

  const diagnostic = `${escapedRedaction.value}${markerSafeSuffix(
    filePath,
    escapedRedaction.value,
    variants,
  )}`;
  if (variants.some((marker) => diagnostic.includes(marker))) {
    throw new Error("Unable to create a safe leak diagnostic");
  }
  return diagnostic;
}

function diagnosticPrefix(label) {
  const match = /^(git-(?:commit|history) [0-9a-f]{12})(?: |$)/u.exec(
    asText(label),
  );
  return match?.[1] ?? "private-leak";
}

function safeLeakDiagnostic(label, context) {
  const redacted = redactLeakedPath(label, context.variants);
  if (!textLeaks(redacted, context)) return redacted;

  const fallback = redactLeakedPath(
    `${diagnosticPrefix(label)} ~${hash(label).slice(0, 12)}`,
    context.variants,
  );
  if (textLeaks(fallback, context) || /[\0\r\n\t\u2028\u2029]/u.test(fallback)) {
    throw new Error("Unable to create a safe leak diagnostic");
  }
  return fallback;
}

export function scanPrivateStoryIsolation({
  audioHashes = [],
  distFiles = [],
  markers = [],
  sourceUnits = [],
  trackedFiles = [],
} = {}) {
  const context = createPrivacyContext({ audioHashes, markers, sourceUnits });
  const leakedPaths = [...trackedFiles, ...distFiles].filter(
    ([label, contents, scannedPath]) =>
      fileLeaks(scannedPath ?? label, contents, context),
  );
  const safePaths = leakedPaths.map(([label]) => safeLeakDiagnostic(label, context));
  const uniquePaths = [...new Set(safePaths)].sort();

  return {
    leakedPaths: uniquePaths,
    message: uniquePaths.join("\n"),
  };
}

function executeGit(projectRoot, args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: projectRoot,
        encoding: null,
        env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" },
        maxBuffer: MAX_GIT_BUFFER,
      },
      (error, stdout) => {
        resolve({
          code: error ? error.code : 0,
          stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.alloc(0),
        });
      },
    );
  });
}

async function gitOutput(projectRoot, args, message = "Git isolation audit failed") {
  let result;
  try {
    result = await executeGit(projectRoot, args);
  } catch {
    throw new Error(message);
  }
  if (result.code !== 0) throw new Error(message);
  return result.stdout;
}

async function gitTrackedPaths(projectRoot, pathspec) {
  const args = ["ls-files", "-z"];
  if (pathspec) args.push("--", pathspec);
  const stdout = await gitOutput(projectRoot, args);
  return stdout.toString("utf8").split("\0").filter(Boolean);
}

async function gitTrackedEntries(projectRoot) {
  const stdout = await gitOutput(projectRoot, ["ls-files", "--stage", "-z"]);
  return stdout.toString("utf8").split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    const metadata = record.slice(0, separator);
    const match = /^(\d{6}) ([0-9a-f]+) ([0-3])$/u.exec(metadata);
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
    if (!GIT_BLOB_MODES.has(entry.mode)) {
      throw new Error("Unexpected Git index entry mode");
    }
    const contents = await gitOutput(projectRoot, [
      "cat-file",
      "blob",
      entry.objectId,
    ]);
    files.push([entry.path, contents]);
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

function requireObjectId(value) {
  if (!/^[0-9a-f]{40,64}$/u.test(value)) {
    throw new Error("Git isolation audit failed");
  }
  return value;
}

async function resolveCommit(projectRoot, revision, name) {
  const stdout = await gitOutput(
    projectRoot,
    ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`],
    `Unable to resolve Git history ${name}`,
  );
  return requireObjectId(stdout.toString("ascii").trim());
}

function parseCommitParents(commitObject) {
  const headerEnd = commitObject.indexOf(Buffer.from("\n\n"));
  if (headerEnd < 0) throw new Error("Git isolation audit failed");
  const parents = [];
  for (const line of commitObject.subarray(0, headerEnd).toString("ascii").split("\n")) {
    if (line.startsWith("parent ")) parents.push(requireObjectId(line.slice(7)));
  }
  return parents;
}

function parseRawDiff(output) {
  const entries = [];
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0, offset);
    const pathEnd = output.indexOf(0, headerEnd + 1);
    if (headerEnd < 0 || pathEnd < 0 || output[offset] !== 0x3a) {
      throw new Error("Git isolation audit failed");
    }
    const header = output.subarray(offset, headerEnd).toString("ascii");
    const match = /^:(\d{6}) (\d{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([ADMT])$/u.exec(
      header,
    );
    const filePath = output.subarray(headerEnd + 1, pathEnd);
    if (
      !match ||
      !filePath.length ||
      !GIT_ENTRY_MODES.has(match[1]) ||
      !GIT_ENTRY_MODES.has(match[2])
    ) {
      throw new Error("Git isolation audit failed");
    }
    entries.push({
      newMode: match[2],
      newObjectId: match[4],
      path: filePath,
    });
    offset = pathEnd + 1;
  }
  return entries;
}

async function historyFiles(projectRoot, baseRevision) {
  const baseObjectId = await resolveCommit(projectRoot, baseRevision, "base");
  const headObjectId = await resolveCommit(projectRoot, "HEAD", "HEAD");
  const ancestor = await executeGit(projectRoot, [
    "merge-base",
    "--is-ancestor",
    baseObjectId,
    headObjectId,
  ]);
  if (ancestor.code === 1) {
    throw new Error("Git history base must be an ancestor of HEAD");
  }
  if (ancestor.code !== 0) throw new Error("Git isolation audit failed");

  const rangeOutput = await gitOutput(projectRoot, [
    "rev-list",
    "--reverse",
    "--topo-order",
    `${baseObjectId}..${headObjectId}`,
  ]);
  const commitObjectIds = rangeOutput.toString("ascii").split("\n").filter(Boolean);
  commitObjectIds.forEach(requireObjectId);

  const files = [];
  for (const commitObjectId of commitObjectIds) {
    const shortObjectId = commitObjectId.slice(0, 12);
    const commitObject = await gitOutput(projectRoot, [
      "cat-file",
      "commit",
      commitObjectId,
    ]);
    files.push([`git-commit ${shortObjectId}`, commitObject, ""]);
    const parents = parseCommitParents(commitObject);
    const comparisons = parents.length
      ? parents.map((parent) => [parent, commitObjectId])
      : [[commitObjectId]];

    for (const comparison of comparisons) {
      const args = [
        "diff-tree",
        "--no-commit-id",
        "--raw",
        "-r",
        "-z",
        "--no-renames",
      ];
      if (comparison.length === 1) args.push("--root");
      args.push(...comparison);
      const entries = parseRawDiff(await gitOutput(projectRoot, args));
      for (const entry of entries) {
        const label = Buffer.concat([
          Buffer.from(`git-history ${shortObjectId} `),
          entry.path,
        ]);
        const contents = GIT_BLOB_MODES.has(entry.newMode)
          ? await gitOutput(projectRoot, ["cat-file", "blob", entry.newObjectId])
          : Buffer.alloc(0);
        files.push([label, contents, entry.path]);
      }
    }
  }
  return files;
}

async function hashPrivateAudio(assets) {
  const hashes = [];
  for (const asset of assets) {
    try {
      hashes.push(hash(await readFile(asset.sourceFilePath)));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error("Unable to read private narration for isolation audit");
      }
    }
  }
  return hashes;
}

export async function verifyPrivateStoryIsolation({
  baseRevision,
  distDirectory,
  previewDirectory,
  projectRoot = rootDir,
  requirePrivateInputs = false,
} = {}) {
  if (requirePrivateInputs && !baseRevision) {
    throw new Error("Git history base is required for release verification");
  }
  const historicalFiles = baseRevision
    ? await historyFiles(projectRoot, baseRevision)
    : [];
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

  let privateData;
  if (hasPrivateInputs) {
    try {
      privateData = await loadPrivateStoryPreview({
        previewDirectory: directory,
        projectRoot,
        requireAudio: false,
      });
    } catch {
      throw new Error("Unable to load private story audit inputs");
    }
  }
  const markers = privateData?.markers ?? [];
  const sourceUnits = privateData?.excerptSourceUnits ?? [];
  const audioHashes = privateData ? await hashPrivateAudio(privateData.assets) : [];
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
    audioHashes,
    distFiles,
    markers,
    sourceUnits,
    trackedFiles: [
      ...privateTrackedPaths.map((filePath) => [filePath, ""]),
      ...indexFiles,
      ...workingTreeFiles,
      ...historicalFiles,
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
      baseRevision: readArg("base"),
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
