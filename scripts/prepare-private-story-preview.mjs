/* global process */

import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  decodePrivateStorySource,
  paginatePrivateStoryText,
  PRIVATE_STORY_SOURCE_BYTE_LIMIT,
} from "../lib/private-story-preview.js";

const TRANSACTION_DIRECTORY_NAME = ".private-story-preview-transaction";
const TRANSACTION_ENTRY_NAMES = new Set(["backup", "lock", "stage"]);
const TRANSACTION_ROOT_ERROR =
  "Private story transaction root must be a real directory";
const TRANSACTION_ENTRY_ERROR =
  "Private story transaction entries must be real files or directories";
const TRANSACTION_LOCK_AMBIGUOUS =
  "Private story transaction lock is ambiguous";
const TRANSACTION_LOCKED =
  "Private story preparation is already in progress";
const activeTransactionLocks = new Set();

const DEFAULT_FILE_SYSTEM = {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
};

function requireSourceByteLimit(byteLength) {
  if (byteLength > PRIVATE_STORY_SOURCE_BYTE_LIMIT) {
    throw new Error(
      `Private story source must be at most ${PRIVATE_STORY_SOURCE_BYTE_LIMIT} UTF-8 bytes`,
    );
  }
}

async function requireReadable(file, fileSystem) {
  try {
    const [sourceStats, realFilePath] = await Promise.all([
      fileSystem.stat(file),
      fileSystem.realpath(file),
    ]);
    if (!sourceStats.isFile()) {
      throw new Error("Expected exactly two readable source files");
    }
    requireSourceByteLimit(sourceStats.size);
    const bytes = await fileSystem.readFile(file);
    requireSourceByteLimit(bytes.byteLength);
    return { bytes, realFilePath, sourceStats };
  } catch (error) {
    if (error?.message?.includes("source must be at most")) throw error;
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

function sameFileSnapshot(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function finishFileHandle(handle, primaryError, cleanup) {
  let error = primaryError;
  const cleanupErrors = [];
  if (handle) {
    try {
      await handle.close();
    } catch (closeError) {
      if (error) cleanupErrors.push(closeError);
      else error = closeError;
    }
    if (error && cleanup) {
      try {
        await cleanup();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
  }
  if (!error) return;
  if (cleanupErrors.length === 0) throw error;
  throw new AggregateError(
    [error, ...cleanupErrors],
    error.message,
    { cause: error },
  );
}

async function ensureTransactionRoot(parentDirectory, transactionDirectory, fileSystem) {
  if (
    path.dirname(transactionDirectory) !== parentDirectory ||
    !isInside(parentDirectory, transactionDirectory)
  ) {
    throw new Error(TRANSACTION_ROOT_ERROR);
  }

  const [parentStats, realParentDirectory] = await Promise.all([
    fileSystem.stat(parentDirectory),
    fileSystem.realpath(parentDirectory),
  ]);
  if (!parentStats.isDirectory()) throw new Error(TRANSACTION_ROOT_ERROR);
  try {
    await fileSystem.mkdir(transactionDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  let transactionStats;
  let realTransactionDirectory;
  try {
    [transactionStats, realTransactionDirectory] = await Promise.all([
      fileSystem.lstat(transactionDirectory),
      fileSystem.realpath(transactionDirectory),
    ]);
  } catch {
    throw new Error(TRANSACTION_ROOT_ERROR);
  }
  if (
    transactionStats.isSymbolicLink() ||
    !transactionStats.isDirectory() ||
    transactionStats.dev !== parentStats.dev ||
    realTransactionDirectory === realParentDirectory ||
    !isInside(realParentDirectory, realTransactionDirectory)
  ) {
    throw new Error(TRANSACTION_ROOT_ERROR);
  }
  return { realTransactionDirectory, transactionStats };
}

async function readLockOwner(lockPath, fileSystem) {
  let handle;
  let owner;
  let primaryError;
  try {
    handle = await fileSystem.open(
      lockPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = await handle.stat();
    if (!before.isFile() || before.size < 2 || before.size > 32) {
      throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
    }
    const contents = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileSnapshot(before, after)) {
      throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
    }
    const match = /^([1-9]\d*)\n$/u.exec(contents.toString("ascii"));
    const pid = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(pid)) {
      throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
    }
    owner = { pid, stats: after };
  } catch (error) {
    primaryError = error?.message === TRANSACTION_LOCK_AMBIGUOUS
      ? error
      : new Error(TRANSACTION_LOCK_AMBIGUOUS, { cause: error });
  }
  await finishFileHandle(handle, primaryError);
  return owner;
}

async function createLockFile(lockPath, fileSystem) {
  let handle;
  let primaryError;
  try {
    handle = await fileSystem.open(
      lockPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    await handle.writeFile(`${process.pid}\n`);
    await handle.sync();
  } catch (error) {
    primaryError = error;
  }
  await finishFileHandle(
    handle,
    primaryError,
    () => fileSystem.unlink(lockPath),
  );
}

async function acquireTransactionLockFile(lockPath, recoveryPath, fileSystem) {
  if (await pathExists(recoveryPath, fileSystem)) {
    throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
  }
  try {
    await createLockFile(lockPath, fileSystem);
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const owner = await readLockOwner(lockPath, fileSystem);
  if (owner.pid !== process.pid) {
    try {
      process.kill(owner.pid, 0);
      throw new Error(TRANSACTION_LOCKED);
    } catch (error) {
      if (error?.message === TRANSACTION_LOCKED) throw error;
      if (error?.code !== "ESRCH") {
        throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
      }
    }
  }

  if (await pathExists(recoveryPath, fileSystem)) {
    throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
  }
  try {
    await fileSystem.mkdir(recoveryPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
    }
    throw error;
  }
  try {
    let currentStats;
    try {
      currentStats = await fileSystem.lstat(lockPath);
    } catch {
      throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
    }
    if (
      currentStats.isSymbolicLink() ||
      !sameFileSnapshot(owner.stats, currentStats)
    ) {
      throw new Error(TRANSACTION_LOCK_AMBIGUOUS);
    }
    await fileSystem.unlink(lockPath);
    try {
      await createLockFile(lockPath, fileSystem);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error(TRANSACTION_LOCKED);
      throw error;
    }
  } finally {
    await fileSystem.rmdir(recoveryPath);
  }
}

async function acquireTransactionLock(
  lockPath,
  recoveryPath,
  transactionIdentity,
  fileSystem,
) {
  if (activeTransactionLocks.has(transactionIdentity)) {
    throw new Error(TRANSACTION_LOCKED);
  }
  activeTransactionLocks.add(transactionIdentity);
  try {
    await acquireTransactionLockFile(lockPath, recoveryPath, fileSystem);
  } catch (error) {
    activeTransactionLocks.delete(transactionIdentity);
    throw error;
  }
}

async function releaseTransactionLock(lockPath, transactionIdentity, fileSystem) {
  try {
    await fileSystem.unlink(lockPath);
    return null;
  } catch (error) {
    return error;
  } finally {
    activeTransactionLocks.delete(transactionIdentity);
  }
}

async function validateTransactionEntries({
  fileSystem,
  realTransactionDirectory,
  transactionDirectory,
  transactionStats,
}) {
  const names = await fileSystem.readdir(transactionDirectory);
  for (const name of names) {
    if (!TRANSACTION_ENTRY_NAMES.has(name)) {
      throw new Error("Unexpected private story transaction entry");
    }
    const entryPath = path.join(transactionDirectory, name);
    let entryStats;
    let realEntryPath;
    try {
      [entryStats, realEntryPath] = await Promise.all([
        fileSystem.lstat(entryPath),
        fileSystem.realpath(entryPath),
      ]);
    } catch {
      throw new Error(TRANSACTION_ENTRY_ERROR);
    }
    const expectedType = name === "lock"
      ? entryStats.isFile()
      : entryStats.isDirectory();
    if (
      entryStats.isSymbolicLink() ||
      !expectedType ||
      entryStats.dev !== transactionStats.dev ||
      !isInside(realTransactionDirectory, realEntryPath)
    ) {
      throw new Error(TRANSACTION_ENTRY_ERROR);
    }
  }
  return new Set(names);
}

async function recoverTransaction({
  backupDirectory,
  directory,
  fileSystem,
  stageDirectory,
  transactionDirectory,
  transactionRoot,
}) {
  const entries = await validateTransactionEntries({
    fileSystem,
    transactionDirectory,
    ...transactionRoot,
  });
  const destinationExists = await pathExists(directory, fileSystem);
  const backupExists = entries.has("backup");
  const stageExists = entries.has("stage");

  if (!destinationExists && backupExists) {
    await fileSystem.rename(backupDirectory, directory);
    if (stageExists) {
      await fileSystem.rm(stageDirectory, { force: true, recursive: true });
    }
    return;
  }

  if (destinationExists && backupExists) {
    await fileSystem.rm(backupDirectory, { force: true, recursive: true });
  }
  if (stageExists) {
    await fileSystem.rm(stageDirectory, { force: true, recursive: true });
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
  const parentDirectory = path.dirname(directory);
  const transactionDirectory = path.join(
    parentDirectory,
    TRANSACTION_DIRECTORY_NAME,
  );
  if (directory === transactionDirectory) throw new Error(TRANSACTION_ROOT_ERROR);
  const [destinationRealPath, transactionRealPath] = await Promise.all([
    existingRealPath(directory, operations),
    existingRealPath(transactionDirectory, operations),
  ]);
  const sources = await Promise.all(
    sourceFiles.map((sourceFile) => requireReadable(sourceFile, operations)),
  );
  if (
    sources.some(({ sourceStats }) =>
      !Number.isSafeInteger(sourceStats.ino) || sourceStats.ino <= 0
    )
  ) {
    throw new Error(
      "Unable to verify that private story source files are distinct",
    );
  }
  if (
    sources[0].realFilePath === sources[1].realFilePath ||
    (sources[0].sourceStats.dev === sources[1].sourceStats.dev &&
      sources[0].sourceStats.ino === sources[1].sourceStats.ino)
  ) {
    throw new Error("Private story source files must be distinct");
  }
  if (
    sourceFiles.some((sourceFile) => isInside(directory, path.resolve(sourceFile))) ||
    (destinationRealPath &&
      sources.some(({ realFilePath }) => isInside(destinationRealPath, realFilePath)))
  ) {
    throw new Error("Private story source files must stay outside the preview directory");
  }
  if (
    sourceFiles.some((sourceFile) =>
      isInside(transactionDirectory, path.resolve(sourceFile))) ||
    (transactionRealPath &&
      sources.some(({ realFilePath }) =>
        isInside(transactionRealPath, realFilePath)))
  ) {
    throw new Error(
      "Private story source files must stay outside the preview and transaction directories",
    );
  }
  const validatedSources = sources.map(({ bytes }) => {
    const { title } = paginatePrivateStoryText(decodePrivateStorySource(bytes));
    return { bytes, title };
  });
  const manifestPath = path.join(directory, "manifest.json");
  const stories = validatedSources.map(({ title }, index) => ({
    id: `private-story-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    textFile: `story-${index + 1}.txt`,
    title,
  }));
  const manifest = { stories, version: 1 };

  await operations.mkdir(parentDirectory, { recursive: true });
  const transactionRoot = await ensureTransactionRoot(
    parentDirectory,
    transactionDirectory,
    operations,
  );
  const backupDirectory = path.join(transactionDirectory, "backup");
  const lockPath = path.join(transactionDirectory, "lock");
  const recoveryPath = path.join(transactionDirectory, "recovery");
  const stageDirectory = path.join(transactionDirectory, "stage");
  const transactionIdentity = transactionRoot.realTransactionDirectory;
  await acquireTransactionLock(
    lockPath,
    recoveryPath,
    transactionIdentity,
    operations,
  );
  let committed = false;
  let operationError;
  try {
    await recoverTransaction({
      backupDirectory,
      directory,
      fileSystem: operations,
      stageDirectory,
      transactionDirectory,
      transactionRoot,
    });
    if (!force && await pathExists(manifestPath, operations)) {
      throw new Error(
        "Private story preview manifest already exists; use --force to replace it",
      );
    }

    await operations.mkdir(stageDirectory);
    let backupExists = false;
    let stageExists = true;
    try {
      await Promise.all(
        validatedSources.map(({ bytes }, index) =>
          operations.writeFile(
            path.join(stageDirectory, `story-${index + 1}.txt`),
            bytes,
          ),
        ),
      );
      await operations.writeFile(
        path.join(stageDirectory, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );

      if (await pathExists(directory, operations)) {
        await operations.rename(directory, backupDirectory);
        backupExists = true;
      }
      await operations.rename(stageDirectory, directory);
      stageExists = false;
      committed = true;
    } catch (error) {
      if (backupExists) {
        try {
          await operations.rename(backupDirectory, directory);
          backupExists = false;
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            "Unable to restore the previous private story preview bundle",
          );
        }
      }
      if (stageExists) {
        await operations.rm(stageDirectory, { force: true, recursive: true })
          .catch(() => {});
      }
      throw error;
    }

    if (backupExists) {
      await operations.rm(backupDirectory, { force: true, recursive: true })
        .catch(() => undefined);
    }
  } catch (error) {
    operationError = error;
  }

  const releaseError = await releaseTransactionLock(
    lockPath,
    transactionIdentity,
    operations,
  );
  if (operationError) throw operationError;
  if (releaseError && !committed) throw releaseError;
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
