import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const PRIVATE_STORY_ID = /^private-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORDS = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
const PAGE_WORD_LIMIT = 70;
const UNIT_WORD_LIMIT = 90;

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

function wordCount(text) {
  return text.match(WORDS)?.length ?? 0;
}

export function normalizeStoryBody(text) {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
}

function parseStoryText(rawText) {
  const normalized = normalizeStoryBody(rawText);
  const match = /^# ([^\n]+)(?:\n|$)/.exec(normalized);
  if (!match) throw new Error("Private story text must start with a Markdown H1");

  const body = normalized.slice(match[0].length).replace(/^\n+/, "");
  if (!body) throw new Error("Private story text must have a non-empty body");
  return { body, title: match[1] };
}

function sourceUnits(body) {
  const hasParagraphBreak = /\n[ \t]*\n/.test(body);
  const units = (hasParagraphBreak ? body.split(/\n[ \t]*\n+/) : body.split("\n"))
    .map((unit) => unit.replace(/^\n+|\n+$/g, ""))
    .filter(Boolean);
  if (!units.length) throw new Error("Private story text must have a non-empty body");
  return { separator: hasParagraphBreak ? "\n\n" : "\n", units };
}

export function paginatePrivateStoryText(rawText) {
  const { body: sourceBody, title } = parseStoryText(rawText);
  const pages = [];
  let page = [];
  let pageWords = 0;
  const { separator, units } = sourceUnits(sourceBody);

  for (const unit of units) {
    const unitWords = wordCount(unit);
    if (unitWords > UNIT_WORD_LIMIT) {
      throw new Error(`Private story source unit is over ${UNIT_WORD_LIMIT} words`);
    }
    if (page.length && pageWords + unitWords > PAGE_WORD_LIMIT) {
      pages.push(page.join(separator));
      page = [];
      pageWords = 0;
    }
    page.push(unit);
    pageWords += unitWords;
  }
  if (page.length) pages.push(page.join(separator));

  const body = pages.join(separator);
  if (normalizeStoryBody(body) !== normalizeStoryBody(sourceBody)) {
    throw new Error("Private story pagination changed normalized content");
  }
  return { body, pages, title };
}

function privatePreviewDirectory(projectRoot, previewDirectory) {
  return path.resolve(
    previewDirectory ?? path.join(projectRoot, "content/private-story-preview"),
  );
}

function resolvePreviewFile(previewDirectory, filename) {
  if (
    typeof filename !== "string" ||
    path.isAbsolute(filename) ||
    path.basename(filename) !== filename ||
    !filename.endsWith(".txt")
  ) {
    throw new Error("Private story files must stay inside the private preview directory");
  }
  const resolved = path.resolve(previewDirectory, filename);
  if (!resolved.startsWith(`${previewDirectory}${path.sep}`)) {
    throw new Error("Private story files must stay inside the private preview directory");
  }
  return resolved;
}

async function readPrivateText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
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
  projectRoot,
  previewDirectory,
  requireAudio = true,
} = {}) {
  const root = requireText(projectRoot, "projectRoot");
  const directory = privatePreviewDirectory(root, previewDirectory);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  } catch {
    throw new Error("Unable to read private story preview manifest");
  }
  requireRecord(manifest, "private story preview manifest");
  requireExactKeys(manifest, ["stories", "version"], "private story preview manifest");
  if (manifest.version !== 1) throw new Error("Private story preview manifest version must be 1");
  if (!Array.isArray(manifest.stories) || !manifest.stories.length) {
    throw new Error("Private story preview manifest stories must be a non-empty array");
  }

  const ids = new Set();
  const audioLines = {};
  const assets = [];
  const markers = [];
  const stories = [];

  for (const [index, value] of manifest.stories.entries()) {
    const story = requireRecord(value, `private story preview manifest.stories[${index}]`);
    requireExactKeys(story, ["id", "textFile", "title"], `private story preview manifest.stories[${index}]`);
    story.id = requireText(story.id, `private story preview manifest.stories[${index}].id`);
    story.title = requireText(story.title, `private story preview manifest.stories[${index}].title`);
    if (!PRIVATE_STORY_ID.test(story.id)) {
      throw new Error("Private story id must be a safe private story id");
    }
    if (ids.has(story.id)) throw new Error("Private story preview manifest has duplicate story id");
    ids.add(story.id);

    const textFilePath = resolvePreviewFile(directory, story.textFile);
    const paginated = paginatePrivateStoryText(await readPrivateText(textFilePath));
    if (paginated.title !== story.title) {
      throw new Error("Private story manifest title must match the leading Markdown H1");
    }
    const pages = [];
    markers.push(story.id, story.title);
    for (const [pageIndex, text] of paginated.pages.entries()) {
      const pageId = `page-${String(pageIndex + 1).padStart(3, "0")}`;
      const audioId = `${story.id}-${pageId}-narration`;
      const publicAudioPath = `/assets/private-story-preview/${story.id}/${pageId}.mp3`;
      const outputFile = `assets/private-story-preview/${story.id}/${pageId}.mp3`;
      const outputFilePath = path.join(directory, "audio", story.id, `${pageId}.mp3`);
      if (requireAudio) {
        try {
          if (!(await stat(outputFilePath)).isFile()) throw new Error("not a file");
        } catch {
          throw new Error(`Missing required narration audio for ${story.id} ${pageId}`);
        }
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
        sourceFilePath: outputFilePath,
      });
      markers.push(text, publicAudioPath);
    }
    stories.push(createStory(story, pages));
  }

  return { assets, audioLines, markers: [...new Set(markers)], stories };
}
