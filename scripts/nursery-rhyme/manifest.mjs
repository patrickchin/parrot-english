import path from "node:path";
import { URL } from "node:url";
import { z } from "zod";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSIONED_ARTWORK_PATH = /(?:^|\/)v[1-9]\d*(?:\/|$)/;

const nonEmptyText = z.string().refine((value) => value.trim().length > 0, {
  error: "must be a non-empty string",
});

const id = z.string().regex(ID_PATTERN, "must be lowercase kebab-case");

const artwork = z
  .object({
    alt: nonEmptyText,
    height: z.number().int().positive("must be a positive integer"),
    src: z.string().superRefine((value, context) => {
      let url;
      try {
        url = new URL(value);
      } catch {
        context.addIssue({
          code: "custom",
          message: "must be an absolute immutable artwork URL",
        });
        return;
      }
      if (
        url.protocol !== "https:" ||
        url.hostname !== "media.parrotbook.com" ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        context.addIssue({
          code: "custom",
          message: "must use immutable https://media.parrotbook.com artwork",
        });
      } else if (!VERSIONED_ARTWORK_PATH.test(url.pathname)) {
        context.addIssue({
          code: "custom",
          message: "must use a versioned artwork pathname such as /v8/",
        });
      }
    }),
    width: z.number().int().positive("must be a positive integer"),
  })
  .strict();

const line = z
  .object({
    artwork: artwork.optional(),
    guide: z.string().min(1, "must be a non-empty string"),
    id,
    text: nonEmptyText,
  })
  .strict();

const scene = z
  .object({
    artwork,
    id,
    lines: z.array(line).min(1, "must contain at least one line"),
    title: nonEmptyText,
  })
  .strict();

const rhymeManifestSchema = z
  .object({
    countInBeats: z.union([z.literal(2), z.literal(4)], {
      error: "must equal 2 or 4 in schemaVersion 1",
    }),
    countInMidi: z
      .number()
      .int("must be an integer from 0 through 127")
      .min(0, "must be an integer from 0 through 127")
      .max(127, "must be an integer from 0 through 127"),
    id,
    order: z.number().int().positive("must be a positive integer"),
    scenes: z.array(scene).min(1, "must contain at least one scene"),
    schemaVersion: z.literal(1, "must equal 1"),
    score: z
      .object({
        melodyPart: nonEmptyText,
        playbackParts: z.array(nonEmptyText).min(1, "must contain a part"),
        src: z.string().min(1, "must be a non-empty string"),
        volume: z.number().finite().min(0).max(1),
      })
      .strict(),
    slug: id,
    title: nonEmptyText,
  })
  .strict();

function zodIssueFieldPath(issue) {
  if (issue.code === "unrecognized_keys" && issue.keys?.length) {
    return [...issue.path, issue.keys.join(", ")].join(".");
  }
  return issue.path.join(".") || "manifest";
}

function assetError(fieldPath, message) {
  return new Error(`${fieldPath}: ${message}`);
}

function requiresExtension(fieldPath) {
  if (fieldPath === "score.src") return ".musicxml";
  if (fieldPath.endsWith(".guide")) return ".mp3";
  return null;
}

export function resolvePackageAsset(packageDir, relativePath, fieldPath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw assetError(fieldPath, "must be a non-empty path inside its package");
  }
  if (
    relativePath.includes("\\") ||
    relativePath.includes("?") ||
    relativePath.includes("#") ||
    relativePath.endsWith("/") ||
    path.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.split("/").includes("..")
  ) {
    throw assetError(fieldPath, "must be a relative path inside its package");
  }

  const extension = requiresExtension(fieldPath);
  if (extension && path.posix.extname(relativePath) !== extension) {
    throw assetError(fieldPath, `must use a ${extension} file`);
  }
  if (fieldPath.endsWith(".guide") && !relativePath.startsWith("guides/")) {
    throw assetError(fieldPath, "must be inside guides/");
  }

  const root = path.resolve(packageDir);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw assetError(fieldPath, "must resolve inside its package");
  }
  return resolved;
}

function assertUniqueManifestIds(manifest, sourcePath) {
  const sceneIds = new Set();
  const lines = [];

  for (const [sceneIndex, currentScene] of manifest.scenes.entries()) {
    if (sceneIds.has(currentScene.id)) {
      throw new Error(
        `${sourcePath}:scenes[${sceneIndex}].id: duplicate scene id ${currentScene.id}`,
      );
    }
    sceneIds.add(currentScene.id);

    const sceneLineIds = new Set();
    for (const [lineIndex, currentLine] of currentScene.lines.entries()) {
      if (sceneLineIds.has(currentLine.id)) {
        throw new Error(
          `${sourcePath}:scenes[${sceneIndex}].lines[${lineIndex}].id: duplicate line id ${currentLine.id}`,
        );
      }
      sceneLineIds.add(currentLine.id);
    }
    lines.push(...currentScene.lines.map((currentLine, lineIndex) => ({
      lineIndex,
      sceneIndex,
      ...currentLine,
    })));
  }

  const lineIds = new Set();
  for (const currentLine of lines) {
    if (lineIds.has(currentLine.id)) {
      throw new Error(
        `${sourcePath}:scenes[${currentLine.sceneIndex}].lines[${currentLine.lineIndex}].id: duplicate line id ${currentLine.id}`,
      );
    }
    lineIds.add(currentLine.id);
  }
}

function validateManifestAssetPaths(manifest, sourcePath) {
  const packageDir = path.dirname(sourcePath);
  try {
    resolvePackageAsset(packageDir, manifest.score.src, "score.src");
    for (const [sceneIndex, currentScene] of manifest.scenes.entries()) {
      for (const [lineIndex, currentLine] of currentScene.lines.entries()) {
        resolvePackageAsset(
          packageDir,
          currentLine.guide,
          `scenes[${sceneIndex}].lines[${lineIndex}].guide`,
        );
      }
    }
  } catch (error) {
    throw new Error(`${sourcePath}:${error.message}`);
  }
}

export function parseRhymeManifest(value, sourcePath) {
  const result = rhymeManifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `${sourcePath}:${zodIssueFieldPath(issue)}: ${issue.message}`,
    );
  }

  const manifest = result.data;
  const counts = new Set(manifest.scenes.map(({ lines }) => lines.length));
  if (counts.size !== 1 || counts.has(0)) {
    throw new Error(
      `${sourcePath}:scenes: scenes must have one equal non-zero line count in schemaVersion 1`,
    );
  }
  assertUniqueManifestIds(manifest, sourcePath);
  validateManifestAssetPaths(manifest, sourcePath);
  return manifest;
}
