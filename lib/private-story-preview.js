import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

const PRIVATE_STORY_ID = /^private-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORDS = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
const PAGE_WORD_LIMIT = 70;
const UNIT_WORD_LIMIT = 90;
const PRIVATE_STORY_COUNT = 2;
const PRIVATE_STORY_ID_LIMIT = 64;
const PRIVATE_STORY_TITLE_LIMIT = 160;
export const PRIVATE_STORY_SOURCE_BYTE_LIMIT = 131_072;
export const PRIVATE_STORY_MANIFEST_BYTE_LIMIT = 64 * 1024;
const PRIVATE_STORY_AUDIO_BYTE_LIMIT = 32 * 1024 * 1024;
export const PRIVATE_STORY_AUDIO_TOTAL_BYTE_LIMIT = 64 * 1024 * 1024;
const PRIVATE_STORY_PAGE_LIMIT = 40;
const PRIVATE_STORY_WORD_LIMIT = 2_000;
const PRIVATE_PATH_ERROR =
  "Private story files must stay inside the private preview directory";
const PRIVATE_STORY_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${name} must contain exactly: ${expected.join(", ")}`);
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || !value) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function requireBoundedText(value, name, limit) {
  const text = requireText(value, name);
  if ([...text].length > limit) {
    throw new Error(`${name} must be at most ${limit} characters`);
  }
  return text;
}

function wordCount(text) {
  return text.match(WORDS)?.length ?? 0;
}

export function normalizeStoryBody(text) {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
}

function requirePrivateStorySourceByteLimit(byteLength) {
  if (byteLength > PRIVATE_STORY_SOURCE_BYTE_LIMIT) {
    throw new Error(
      `Private story source must be at most ${PRIVATE_STORY_SOURCE_BYTE_LIMIT} UTF-8 bytes`,
    );
  }
}

export function decodePrivateStorySource(bytes) {
  requirePrivateStorySourceByteLimit(bytes.byteLength);
  try {
    return PRIVATE_STORY_UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error("Private story source must be valid UTF-8");
  }
}

function parseStoryText(rawText) {
  const normalized = normalizeStoryBody(rawText);
  const match = /^# ([^\n]+)(?:\n|$)/.exec(normalized);
  if (!match) throw new Error("Private story text must start with a Markdown H1");

  const body = normalized.slice(match[0].length).replace(/^\n+/, "");
  if (!body) throw new Error("Private story text must have a non-empty body");
  const title = requireBoundedText(
    match[1],
    "Private story title",
    PRIVATE_STORY_TITLE_LIMIT,
  );
  if (wordCount(body) > PRIVATE_STORY_WORD_LIMIT) {
    throw new Error(`Private story must have at most ${PRIVATE_STORY_WORD_LIMIT} words`);
  }
  return { body, title };
}

function sourceUnits(body) {
  const delimiter = body.includes("\n\n") ? /\n{2,}/ : /\n/;
  const parts = body.split(new RegExp(`(${delimiter.source})`));
  const units = parts.filter((_, index) => index % 2 === 0);
  const delimiters = parts.filter((_, index) => index % 2 === 1);
  if (!units.length) throw new Error("Private story text must have a non-empty body");
  return { delimiters, units };
}

export function paginatePrivateStoryText(rawText) {
  requirePrivateStorySourceByteLimit(Buffer.byteLength(rawText, "utf8"));
  const { body: sourceBody, title } = parseStoryText(rawText);
  const pages = [];
  let page = [];
  let pageWords = 0;
  const { delimiters, units } = sourceUnits(sourceBody);

  for (const [unitIndex, unit] of units.entries()) {
    const unitWords = wordCount(unit);
    if (unitWords > UNIT_WORD_LIMIT) {
      throw new Error(`Private story source unit is over ${UNIT_WORD_LIMIT} words`);
    }
    if (page.length && pageWords + unitWords > PAGE_WORD_LIMIT) {
      page.push(delimiters[unitIndex - 1].slice(2));
      pages.push(page.join(""));
      page = [];
      pageWords = 0;
    }
    if (page.length) page.push(delimiters[unitIndex - 1]);
    page.push(unit);
    pageWords += unitWords;
  }
  if (page.length) pages.push(page.join(""));

  if (pages.length > PRIVATE_STORY_PAGE_LIMIT) {
    throw new Error(`Private story must have at most ${PRIVATE_STORY_PAGE_LIMIT} pages`);
  }

  const body = sourceBody;
  if (
    sourceBody.includes("\n\n") &&
    normalizeStoryBody(pages.join("\n\n")) !== normalizeStoryBody(sourceBody)
  ) {
    throw new Error("Private story pagination changed normalized content");
  }
  if (!sourceBody.includes("\n\n")) {
    const paginatedUnits = pages.flatMap((pageText) => pageText.split("\n"));
    if (
      paginatedUnits.length !== units.length ||
      paginatedUnits.some((unit, index) => unit !== units[index])
    ) {
      throw new Error("Private story pagination changed source unit order");
    }
  }
  return { body, pages, title };
}

function privatePreviewDirectory(projectRoot, previewDirectory) {
  return path.resolve(
    previewDirectory ?? path.join(projectRoot, "content/private-story-preview"),
  );
}

function isContained(basePath, targetPath, { allowEqual = false } = {}) {
  const relativePath = path.relative(basePath, targetPath);
  return (
    (allowEqual && relativePath === "") ||
    (relativePath !== "" &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

async function inspectContainedPath({
  allowMissing = false,
  basePath,
  realBasePath,
  targetPath,
}) {
  if (!isContained(basePath, targetPath, { allowEqual: true })) {
    throw new Error(PRIVATE_PATH_ERROR);
  }

  let currentPath = basePath;
  let currentStats;
  const relativePath = path.relative(basePath, targetPath);
  const segments = relativePath ? relativePath.split(path.sep) : [];

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    try {
      currentStats = await lstat(currentPath);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") {
        return { exists: false, stats: null };
      }
      throw new Error(PRIVATE_PATH_ERROR);
    }
    if (currentStats.isSymbolicLink()) throw new Error(PRIVATE_PATH_ERROR);

    let currentRealPath;
    try {
      currentRealPath = await realpath(currentPath);
    } catch {
      throw new Error(PRIVATE_PATH_ERROR);
    }
    if (!isContained(realBasePath, currentRealPath, { allowEqual: true })) {
      throw new Error(PRIVATE_PATH_ERROR);
    }
  }

  return { exists: true, stats: currentStats };
}

async function createPrivatePathGuard(projectRoot, previewDirectory) {
  const resolvedRoot = path.resolve(projectRoot);
  let rootStats;
  let realRoot;
  try {
    rootStats = await lstat(resolvedRoot);
    realRoot = await realpath(resolvedRoot);
  } catch {
    throw new Error(PRIVATE_PATH_ERROR);
  }
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(PRIVATE_PATH_ERROR);
  }
  if (!isContained(resolvedRoot, previewDirectory)) {
    throw new Error(PRIVATE_PATH_ERROR);
  }

  const previewInspection = await inspectContainedPath({
    basePath: resolvedRoot,
    realBasePath: realRoot,
    targetPath: previewDirectory,
  });
  if (!previewInspection.stats?.isDirectory()) throw new Error(PRIVATE_PATH_ERROR);

  let realPreviewDirectory;
  try {
    realPreviewDirectory = await realpath(previewDirectory);
  } catch {
    throw new Error(PRIVATE_PATH_ERROR);
  }

  return (targetPath, options = {}) =>
    inspectContainedPath({
      ...options,
      basePath: previewDirectory,
      realBasePath: realPreviewDirectory,
      targetPath,
    });
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

async function readStableFile(filePath, expectedStats, openImplementation) {
  let fileHandle;
  try {
    fileHandle = await openImplementation(
      filePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = await fileHandle.stat();
    if (
      !expectedStats?.isFile() ||
      !before.isFile() ||
      !sameFileSnapshot(expectedStats, before)
    ) {
      throw new Error(PRIVATE_PATH_ERROR);
    }
    const bytes = await fileHandle.readFile();
    const after = await fileHandle.stat();
    if (bytes.length !== after.size || !sameFileSnapshot(before, after)) {
      throw new Error(PRIVATE_PATH_ERROR);
    }
    return bytes;
  } catch (error) {
    if (error?.message === PRIVATE_PATH_ERROR) throw error;
    throw new Error(PRIVATE_PATH_ERROR);
  } finally {
    await fileHandle?.close();
  }
}

async function resolvePreviewFile(previewDirectory, filename, inspectPreviewPath) {
  if (
    typeof filename !== "string" ||
    path.isAbsolute(filename) ||
    path.basename(filename) !== filename ||
    !filename.endsWith(".txt")
  ) {
    throw new Error("Private story files must stay inside the private preview directory");
  }
  const resolved = path.resolve(previewDirectory, filename);
  if (!isContained(previewDirectory, resolved)) {
    throw new Error("Private story files must stay inside the private preview directory");
  }
  const inspection = await inspectPreviewPath(resolved, { allowMissing: true });
  if (inspection.exists && !inspection.stats?.isFile()) {
    throw new Error("Unable to read private story text");
  }
  return { filePath: resolved, stats: inspection.stats };
}

async function readPrivateText({ filePath, stats }, openImplementation) {
  if (!stats) throw new Error("Unable to read private story text");
  try {
    requirePrivateStorySourceByteLimit(stats.size);
    return decodePrivateStorySource(
      await readStableFile(filePath, stats, openImplementation),
    );
  } catch (error) {
    if (
      error?.message === PRIVATE_PATH_ERROR ||
      error?.message?.includes("source must be at most")
    ) {
      throw error;
    }
    throw new Error("Unable to read private story text");
  }
}

function createStory(story, pages) {
  return {
    assumedKnownWords: [],
    category: "Long stories",
    completionText: `You finished ${story.title}!`,
    cover: { alt: "", prompt: "", src: null },
    durationMinutes: Math.max(1, Math.ceil(pages.length / 2)),
    id: story.id,
    level: "long-stories",
    pages,
    promptExperiment: {
      focus: "Read aloud",
      hypothesis: "Saved narration supports reading along.",
      instruction: "Listen and read along.",
    },
    summary: story.title,
    targetWords: [],
    title: story.title,
  };
}

export async function loadPrivateStoryPreview({
  openImplementation = open,
  projectRoot,
  previewDirectory,
  requireAudio = true,
} = {}) {
  const root = requireText(projectRoot, "projectRoot");
  const directory = privatePreviewDirectory(root, previewDirectory);
  const inspectPreviewPath = await createPrivatePathGuard(root, directory);
  const manifestPath = path.join(directory, "manifest.json");
  let manifest;
  try {
    const inspection = await inspectPreviewPath(manifestPath, { allowMissing: true });
    if (inspection.exists && !inspection.stats?.isFile()) throw new Error("not a file");
    if (!inspection.stats) throw new Error("missing");
    if (inspection.stats.size > PRIVATE_STORY_MANIFEST_BYTE_LIMIT) {
      throw new Error("manifest too large");
    }
    manifest = JSON.parse(
      PRIVATE_STORY_UTF8_DECODER.decode(
        await readStableFile(
          manifestPath,
          inspection.stats,
          openImplementation,
        ),
      ),
    );
  } catch (error) {
    if (error?.message === PRIVATE_PATH_ERROR) throw error;
    throw new Error("Unable to read private story preview manifest");
  }
  requireRecord(manifest, "private story preview manifest");
  requireExactKeys(manifest, ["stories", "version"], "private story preview manifest");
  if (manifest.version !== 1) throw new Error("Private story preview manifest version must be 1");
  if (!Array.isArray(manifest.stories) || manifest.stories.length !== PRIVATE_STORY_COUNT) {
    throw new Error(
      `Private story preview manifest must contain exactly ${PRIVATE_STORY_COUNT} stories`,
    );
  }

  const ids = new Set();
  const textFiles = new Set();
  const validatedStories = [];

  for (const [index, value] of manifest.stories.entries()) {
    const story = requireRecord(value, `private story preview manifest.stories[${index}]`);
    requireExactKeys(story, ["id", "textFile", "title"], `private story preview manifest.stories[${index}]`);
    const id = requireBoundedText(
      story.id,
      "Private story id",
      PRIVATE_STORY_ID_LIMIT,
    );
    const title = requireBoundedText(
      story.title,
      "Private story title",
      PRIVATE_STORY_TITLE_LIMIT,
    );
    if (!PRIVATE_STORY_ID.test(id)) {
      throw new Error("Private story id must be a safe private story id");
    }
    if (ids.has(id)) throw new Error("Private story preview manifest has duplicate story id");
    ids.add(id);

    if (textFiles.has(story.textFile)) {
      throw new Error("Private story preview manifest has duplicate text file");
    }
    textFiles.add(story.textFile);

    const textFile = await resolvePreviewFile(
      directory,
      story.textFile,
      inspectPreviewPath,
    );
    const paginated = paginatePrivateStoryText(
      await readPrivateText(textFile, openImplementation),
    );
    if (paginated.title !== title) {
      throw new Error("Private story manifest title must match the leading Markdown H1");
    }
    validatedStories.push({ id, paginated, title });
  }

  const audioLines = {};
  const assets = [];
  const markers = [];
  const excerptSourceGroups = [];
  const stories = [];
  let totalAudioBytes = 0;

  for (const { id, paginated, title } of validatedStories) {
    const story = { id, title };
    const pages = [];
    markers.push(id, title);
    excerptSourceGroups.push(sourceUnits(paginated.body).units);
    for (const [pageIndex, text] of paginated.pages.entries()) {
      const pageId = `page-${String(pageIndex + 1).padStart(3, "0")}`;
      const audioId = `${id}-${pageId}-narration`;
      const publicAudioPath = `/assets/private-story-preview/${id}/${pageId}.mp3`;
      const outputFile = `assets/private-story-preview/${id}/${pageId}.mp3`;
      const outputFilePath = path.join(directory, "audio", id, `${pageId}.mp3`);
      const audioInspection = await inspectPreviewPath(outputFilePath, {
        allowMissing: true,
      });
      if (!audioInspection.exists && requireAudio) {
        throw new Error(`Missing required narration audio for ${id} ${pageId}`);
      }
      if (
        audioInspection.exists &&
        (path.extname(outputFilePath) !== ".mp3" ||
          !audioInspection.stats?.isFile() ||
          audioInspection.stats.size === 0)
      ) {
        throw new Error(`Narration audio for ${id} ${pageId} must be a non-empty regular MP3`);
      }
      if (
        audioInspection.exists &&
        audioInspection.stats.size > PRIVATE_STORY_AUDIO_BYTE_LIMIT
      ) {
        throw new Error(
          `Narration audio for ${id} ${pageId} must be at most ${PRIVATE_STORY_AUDIO_BYTE_LIMIT} bytes`,
        );
      }
      if (
        audioInspection.exists &&
        totalAudioBytes >
          PRIVATE_STORY_AUDIO_TOTAL_BYTE_LIMIT - audioInspection.stats.size
      ) {
        throw new Error(
          `Narration audio must total at most ${PRIVATE_STORY_AUDIO_TOTAL_BYTE_LIMIT} bytes`,
        );
      }
      if (audioInspection.exists) totalAudioBytes += audioInspection.stats.size;
      const source = audioInspection.exists
        ? await readStableFile(
            outputFilePath,
            audioInspection.stats,
            openImplementation,
          )
        : null;
      if (source && source.length === 0) {
        throw new Error(`Narration audio for ${id} ${pageId} must be a non-empty regular MP3`);
      }
      pages.push({
        artwork: { alt: "", prompt: "", src: null },
        id: pageId,
        joinIn: "Turn the page!",
        joinInAudioId: null,
        narrationAudioId: null,
        narrationAudioSrc: publicAudioPath,
        text,
      });
      audioLines[audioId] = {
        lang: "en-GB",
        outputFilePath,
        speaker: "narrator",
        text,
      };
      assets.push({
        fileName: outputFile,
        outputFile,
        outputFilePath,
        publicPath: publicAudioPath,
        source,
        sourceFilePath: outputFilePath,
      });
      markers.push(text, publicAudioPath);
    }
    stories.push(createStory(story, pages));
  }

  return {
    assets,
    audioLines,
    excerptSourceGroups,
    markers: [...new Set(markers)],
    stories,
  };
}
