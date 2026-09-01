import { z } from "zod";

export const WORD_GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ASSET_ID_PATTERN = /^[a-f0-9]+(?:_[a-f0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[a-f0-9]{6}$/;
const FLUENT_REVISION = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TIER_IDS = ["simple", "intermediate", "advanced"];

const text = z.string().refine((value) => value.trim().length > 0, {
  error: "must be a non-empty string",
});
const id = z.string().regex(WORD_GAME_ID_PATTERN, "must be lowercase kebab-case");
const assetId = z.string().regex(
  ASSET_ID_PATTERN,
  "must be lowercase hexadecimal codepoints joined with underscores",
);

const audio = z
  .object({
    id,
    text,
  })
  .strict();

const visual = z.discriminatedUnion("kind", [
  z
    .object({
      assetId,
      kind: z.literal("fluent-3d"),
    })
    .strict(),
  z
    .object({
      color: z.string().regex(HEX_COLOR_PATTERN, "must be a six-digit hexadecimal color"),
      kind: z.literal("swatch"),
    })
    .strict(),
]);

const item = z
  .object({
    alt: text,
    id,
    label: text,
    labelAudio: audio,
    promptAudio: audio,
    visual,
  })
  .strict();

const fourChoices = z.tuple([id, id, id, id]);
const question = z
  .object({
    choiceIds: fourChoices,
    id,
    targetId: id,
  })
  .strict();
const sixQuestions = z.tuple([
  question,
  question,
  question,
  question,
  question,
  question,
]);
const quiz = z
  .object({
    description: text,
    id,
    questions: sixQuestions,
    title: text,
  })
  .strict();
const tier = z
  .object({
    description: text,
    id,
    quizzes: z.tuple([quiz, quiz, quiz]),
    title: text,
  })
  .strict();

const category = z
  .object({
    coverItemId: id,
    description: text,
    id,
    items: z.array(item).min(1, "must contain at least one item"),
    order: z.number().int().positive("must be a positive integer"),
    schemaVersion: z.literal(2, "must equal 2"),
    theme: text,
    tiers: z.array(tier),
    title: text,
  })
  .strict();

const player = z
  .object({
    completeAudio: audio.extend({ id: z.literal("word-game-complete") }).strict(),
    retryAudio: audio.extend({ id: z.literal("word-game-retry") }).strict(),
    schemaVersion: z.literal(1, "must equal 1"),
    successAudio: audio.extend({ id: z.literal("word-game-correct") }).strict(),
  })
  .strict();

const fluentAsset = z
  .object({
    id: assetId,
    publicPath: text,
    sha256: z.string().regex(SHA256_PATTERN, "must be a lowercase 64-character SHA-256"),
    upstreamPath: text,
  })
  .strict();

const fluentAssetManifest = z
  .object({
    assets: z.array(fluentAsset).min(1, "must contain at least one asset"),
    license: z.literal("MIT", "must equal MIT"),
    licensePath: z.literal("LICENSE", "must equal LICENSE"),
    repository: z.literal(
      "https://github.com/microsoft/fluentui-emoji",
      "must equal the official Fluent Emoji repository",
    ),
    revision: z.literal(FLUENT_REVISION, "must equal the pinned Fluent Emoji revision"),
    schemaVersion: z.literal(1, "must equal 1"),
  })
  .strict();

function issuePath(issue) {
  const path = [...issue.path];
  if (issue.code === "unrecognized_keys" && issue.keys?.length) {
    path.push(issue.keys.join(", "));
  }
  return path.reduce(
    (result, segment) =>
      typeof segment === "number" ? `${result}[${segment}]` : result ? `${result}.${segment}` : segment,
    "",
  ) || "manifest";
}

function manifestError(sourcePath, issue) {
  return new Error(`${sourcePath}:${issuePath(issue)}: ${issue.message}`);
}

function fixedShapeError(sourcePath, fieldPath, message) {
  throw new Error(`${sourcePath}:${fieldPath}: ${message}`);
}

function validateFixedCategoryShape(manifest, sourcePath) {
  if (manifest.tiers.length !== TIER_IDS.length) {
    fixedShapeError(sourcePath, "tiers", "must contain simple, intermediate, and advanced tiers");
  }

  for (const [tierIndex, currentTier] of manifest.tiers.entries()) {
    if (currentTier.id !== TIER_IDS[tierIndex]) {
      fixedShapeError(
        sourcePath,
        `tiers[${tierIndex}].id`,
        `must equal ${TIER_IDS[tierIndex]}`,
      );
    }
    for (const [quizIndex, currentQuiz] of currentTier.quizzes.entries()) {
      for (const [questionIndex, currentQuestion] of currentQuiz.questions.entries()) {
        const questionPath = `tiers[${tierIndex}].quizzes[${quizIndex}].questions[${questionIndex}]`;
        if (new Set(currentQuestion.choiceIds).size !== currentQuestion.choiceIds.length) {
          fixedShapeError(sourcePath, `${questionPath}.choiceIds`, "must contain four unique choices");
        }
        if (currentQuestion.targetId !== currentQuestion.choiceIds[0]) {
          fixedShapeError(sourcePath, `${questionPath}.targetId`, "must be the first choice ID");
        }
      }
    }
  }

  const audioPrefix = `word-game-${manifest.id}-`;
  for (const [itemIndex, currentItem] of manifest.items.entries()) {
    const expectedLabelId = `${audioPrefix}${currentItem.id}-label`;
    if (
      currentItem.labelAudio.id !== expectedLabelId
      && !currentItem.labelAudio.id.startsWith("word-game-shared-")
    ) {
      fixedShapeError(
        sourcePath,
        `items[${itemIndex}].labelAudio.id`,
        `must equal ${expectedLabelId} or begin with word-game-shared-`,
      );
    }
    const expectedPromptId = `${audioPrefix}${currentItem.id}-prompt`;
    if (currentItem.promptAudio.id !== expectedPromptId) {
      fixedShapeError(
        sourcePath,
        `items[${itemIndex}].promptAudio.id`,
        `must equal ${expectedPromptId}`,
      );
    }
  }
}

export function parseWordGameManifest(value, sourcePath) {
  const result = category.safeParse(value);
  if (!result.success) throw manifestError(sourcePath, result.error.issues[0]);
  validateFixedCategoryShape(result.data, sourcePath);
  return result.data;
}

export function parseWordGamePlayerManifest(value, sourcePath) {
  const result = player.safeParse(value);
  if (!result.success) throw manifestError(sourcePath, result.error.issues[0]);
  return result.data;
}

export function parseFluentAssetManifest(value, sourcePath) {
  const result = fluentAssetManifest.safeParse(value);
  if (!result.success) throw manifestError(sourcePath, result.error.issues[0]);
  return result.data;
}
