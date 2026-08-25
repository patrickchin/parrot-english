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
const MAX_SCANNED_BYTES = 512 * 1024 * 1024;
const BYTE_BUDGET_ERROR = "Private story isolation scan exceeded its byte budget";
const READ_ERROR = "Unable to read isolation scan input";
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

function isMeaningfulExcerpt(words) {
  return words.join(" ").length >= 50 && new Set(words).size >= 5;
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
        const window = words.slice(index, index + 12);
        if (isMeaningfulExcerpt(window)) add(window);
      }
      continue;
    }
    if (words.length >= 8 && isMeaningfulExcerpt(words)) {
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

function isPrivateInputPath(filePath) {
  const normalized = normalizePath(filePath).replace(/^\.\//u, "");
  return (
    normalized === PRIVATE_INPUT_DIRECTORY ||
    normalized.startsWith(`${PRIVATE_INPUT_DIRECTORY}/`)
  );
}

function containsPrivatePath(filePath) {
  const normalized = normalizePath(filePath).replace(/^\.\//u, "");
  return (
    isPrivateInputPath(normalized) ||
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
  if (!decodedLosslessly) {
    return redactLeakedPath(
      `${diagnosticPrefix(filePath)} ~${hash(filePath).slice(0, 12)}`,
      variants,
    );
  }
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
    ([label, contents, scannedPath, unreadable]) =>
      unreadable || fileLeaks(scannedPath ?? label, contents, context),
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

function createScanBudget(limit) {
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    limit > MAX_SCANNED_BYTES
  ) {
    throw new Error(BYTE_BUDGET_ERROR);
  }

  let scannedBytes = 0;
  return {
    add(value) {
      this.addSize(asBuffer(value).length);
    },
    addSize(size) {
      if (
        !Number.isSafeInteger(size) ||
        size < 0 ||
        scannedBytes > limit - size
      ) {
        throw new Error(BYTE_BUDGET_ERROR);
      }
      scannedBytes += size;
    },
  };
}

function nulRecords(output, message) {
  if (!output.length) return [];
  if (output.at(-1) !== 0) throw new Error(message);

  const records = [];
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    if (end <= offset) throw new Error(message);
    records.push(output.subarray(offset, end));
    offset = end + 1;
  }
  return records;
}

async function gitTrackedPaths(projectRoot, pathspec, budget) {
  const args = ["ls-files", "-z"];
  if (pathspec) args.push("--", pathspec);
  const stdout = await gitOutput(projectRoot, args);
  budget.add(stdout);
  return nulRecords(stdout, "Unable to parse tracked Git paths");
}

async function gitTrackedEntries(projectRoot, budget) {
  const stdout = await gitOutput(projectRoot, ["ls-files", "--stage", "-z"]);
  budget.add(stdout);
  return nulRecords(stdout, "Unable to parse the Git index").map((record) => {
    const separator = record.indexOf(0x09);
    if (separator < 0) throw new Error("Unable to parse the Git index");
    const metadata = record.subarray(0, separator).toString("ascii");
    const match = /^(\d{6}) ([0-9a-f]+) ([0-3])$/u.exec(metadata);
    const filePath = record.subarray(separator + 1);
    if (
      !match ||
      !filePath.length ||
      (!GIT_BLOB_MODES.has(match[1]) && match[1] !== "160000") ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(match[2])
    ) {
      throw new Error("Unable to parse the Git index");
    }
    return {
      mode: match[1],
      objectId: match[2],
      path: filePath,
    };
  });
}

function validateRawGitPath(filePath) {
  let offset = 0;
  while (offset <= filePath.length) {
    const separator = filePath.indexOf(0x2f, offset);
    const end = separator < 0 ? filePath.length : separator;
    const segment = filePath.subarray(offset, end);
    if (
      !segment.length ||
      (segment.length === 1 && segment[0] === 0x2e) ||
      (segment.length === 2 && segment[0] === 0x2e && segment[1] === 0x2e)
    ) {
      throw new Error("Tracked path escaped the project root");
    }
    if (separator < 0) break;
    offset = separator + 1;
  }
}

function resolveInsideProject(projectRoot, filePath) {
  const decodedPath = asText(filePath);
  if (Buffer.isBuffer(filePath) && !Buffer.from(decodedPath).equals(filePath)) {
    validateRawGitPath(filePath);
    if (process.platform === "win32") throw new Error(READ_ERROR);
    const resolvedRoot = path.resolve(projectRoot);
    return Buffer.concat([
      Buffer.from(resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`),
      filePath,
    ]);
  }

  const resolved = path.resolve(projectRoot, decodedPath);
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

function uniqueRawPaths(entries) {
  return [
    ...new Map(entries.map((entry) => [entry.path.toString("hex"), entry.path])).values(),
  ];
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

function reserveFileRead(budget, fileStats) {
  budget.addSize(fileStats.size);
}

function accountFileReadGrowth(budget, fileStats, contents) {
  if (contents.length > fileStats.size) {
    budget.addSize(contents.length - fileStats.size);
  }
}

async function readTrackedFiles(projectRoot, trackedPaths, budget) {
  const files = [];
  for (const filePath of trackedPaths) {
    const decodedPath = asText(filePath);
    const rawPath =
      Buffer.isBuffer(filePath) && !Buffer.from(decodedPath).equals(filePath);
    if (rawPath && process.platform === "win32") {
      validateRawGitPath(filePath);
      budget.add(filePath);
      files.push([filePath, Buffer.alloc(0), filePath, true]);
      continue;
    }
    const absolutePath = resolveInsideProject(projectRoot, filePath);
    let fileStats;
    try {
      fileStats = await lstat(absolutePath);
    } catch (error) {
      if (rawPath) {
        budget.add(filePath);
        files.push([filePath, Buffer.alloc(0), filePath, true]);
        continue;
      }
      if (error?.code === "ENOENT") continue;
      throw new Error(READ_ERROR);
    }
    if (!fileStats.isFile() && !fileStats.isSymbolicLink()) {
      throw new Error("Unsupported file type in isolation scan");
    }
    budget.add(filePath);
    reserveFileRead(budget, fileStats);

    let contents;
    try {
      contents = fileStats.isSymbolicLink()
        ? await readlink(absolutePath, { encoding: "buffer" })
        : await readFile(absolutePath);
    } catch {
      if (rawPath) {
        files.push([filePath, Buffer.alloc(0), filePath, true]);
        continue;
      }
      throw new Error(READ_ERROR);
    }
    accountFileReadGrowth(budget, fileStats, contents);
    files.push([filePath, contents]);
  }
  return files;
}

async function readIndexFiles(projectRoot, trackedEntries, budget) {
  const files = [];
  for (const entry of trackedEntries) {
    if (entry.mode === "160000") {
      files.push([entry.path, Buffer.alloc(0)]);
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
    budget.add(contents);
    files.push([entry.path, contents]);
  }
  return files;
}

async function readDirectoryFiles(
  directory,
  projectRoot,
  budget,
  allowDirectorySymlink = false,
) {
  let directoryStats;
  try {
    directoryStats = await lstat(directory);
  } catch {
    throw new Error(READ_ERROR);
  }
  if (
    !directoryStats.isDirectory() &&
    !(allowDirectorySymlink && directoryStats.isSymbolicLink())
  ) {
    throw new Error("Unsupported file type in isolation scan");
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error(READ_ERROR);
  }
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    let fileStats;
    try {
      fileStats = await lstat(absolutePath);
    } catch {
      throw new Error(READ_ERROR);
    }
    if (fileStats.isDirectory()) {
      files.push(...(await readDirectoryFiles(absolutePath, projectRoot, budget)));
      continue;
    }
    if (!fileStats.isFile() && !fileStats.isSymbolicLink()) {
      throw new Error("Unsupported file type in isolation scan");
    }
    const label = normalizePath(path.relative(projectRoot, absolutePath));
    budget.add(label);
    reserveFileRead(budget, fileStats);

    let contents;
    try {
      contents = fileStats.isSymbolicLink()
        ? await readlink(absolutePath, { encoding: "buffer" })
        : await readFile(absolutePath);
    } catch {
      throw new Error(READ_ERROR);
    }
    accountFileReadGrowth(budget, fileStats, contents);
    files.push([label, contents]);
  }

  return files;
}

function requireObjectId(value) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
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
    const match = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) ([ADMT])$/u.exec(
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

async function historyFiles(projectRoot, baseRevision, budget) {
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
  budget.add(rangeOutput);
  const commitObjectIds = rangeOutput.toString("ascii").split("\n").filter(Boolean);
  commitObjectIds.forEach(requireObjectId);

  const files = [];
  const blobCache = new Map();
  for (const commitObjectId of commitObjectIds) {
    const shortObjectId = commitObjectId.slice(0, 12);
    const commitObject = await gitOutput(projectRoot, [
      "cat-file",
      "commit",
      commitObjectId,
    ]);
    budget.add(commitObject);
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
      const diffOutput = await gitOutput(projectRoot, args);
      budget.add(diffOutput);
      const entries = parseRawDiff(diffOutput);
      for (const entry of entries) {
        const label = Buffer.concat([
          Buffer.from(`git-history ${shortObjectId} `),
          entry.path,
        ]);
        let contents = Buffer.alloc(0);
        if (GIT_BLOB_MODES.has(entry.newMode)) {
          contents = blobCache.get(entry.newObjectId);
          if (!contents) {
            contents = await gitOutput(projectRoot, [
              "cat-file",
              "blob",
              entry.newObjectId,
            ]);
            blobCache.set(entry.newObjectId, contents);
          }
          budget.add(contents);
        }
        files.push([label, contents, entry.path]);
      }
    }
  }
  return files;
}

function hashPrivateAudio(assets, budget, requireAll) {
  const hashes = [];
  for (const asset of assets) {
    if (!Buffer.isBuffer(asset.source) || !asset.source.length) continue;
    budget.add(asset.source);
    hashes.push(hash(asset.source));
  }
  if (requireAll && hashes.length !== assets.length) {
    throw new Error("Unable to hash required private narration");
  }
  return hashes;
}

export async function verifyPrivateStoryIsolation({
  baseRevision,
  distDirectory,
  previewDirectory,
  projectRoot = rootDir,
  requirePrivateInputs = false,
  maxScannedBytes = MAX_SCANNED_BYTES,
} = {}) {
  if (requirePrivateInputs && !baseRevision) {
    throw new Error("Git history base is required for release verification");
  }
  const budget = createScanBudget(maxScannedBytes);
  const historicalFiles = baseRevision
    ? await historyFiles(projectRoot, baseRevision, budget)
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
    budget,
  );
  const hasPrivateInputs = existsSync(manifestPath);

  let privateData;
  if (hasPrivateInputs) {
    try {
      privateData = await loadPrivateStoryPreview({
        previewDirectory: directory,
        projectRoot,
        requireAudio: requirePrivateInputs,
      });
    } catch {
      throw new Error("Unable to load private story audit inputs");
    }
  }
  const markers = privateData?.markers ?? [];
  const sourceUnits = privateData?.excerptSourceUnits ?? [];
  for (const marker of markers) budget.add(marker);
  for (const sourceUnit of sourceUnits) budget.add(sourceUnit);
  const audioHashes = privateData
    ? hashPrivateAudio(privateData.assets, budget, requirePrivateInputs)
    : [];
  const trackedEntries = await gitTrackedEntries(projectRoot, budget);
  const trackedPaths = uniqueRawPaths(trackedEntries);
  const publicTrackedPaths = trackedPaths.filter(
    (filePath) => !isPrivateInputPath(filePath),
  );
  const publicTrackedEntries = trackedEntries.filter(
    (entry) => !isPrivateInputPath(entry.path),
  );
  const worktreePathKeys = new Set(
    publicTrackedEntries
      .filter((entry) => entry.mode !== "160000")
      .map((entry) => entry.path.toString("hex")),
  );
  const indexFiles = await readIndexFiles(
    projectRoot,
    publicTrackedEntries,
    budget,
  );
  const workingTreeFiles = await readTrackedFiles(
    projectRoot,
    publicTrackedPaths.filter((filePath) =>
      worktreePathKeys.has(filePath.toString("hex"))
    ),
    budget,
  );
  const distFiles = existsSync(resolvedDistDirectory)
    ? await readDirectoryFiles(
        resolvedDistDirectory,
        projectRoot,
        budget,
        true,
      )
    : [];
  for (const filePath of privateTrackedPaths) budget.add(filePath);
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
