import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";

const execFileAsync = promisify(execFile);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const supportedAnswerTypes = new Set(["text", "number", "choice"]);
const supportedCardinalities = new Set(["scalar", "array"]);
const supportedOperators = new Set([
  "equals",
  "notEquals",
  "includes",
  "notIncludes",
]);

function fail(message) {
  throw new Error(`Invalid questionnaire: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateJsonObject(value, label, nullable = false) {
  if (value === null && nullable) return;
  if (!isPlainObject(value)) fail(`${label} must be an object${nullable ? " or null" : ""}.`);
}

function validateAudio(audioId, expectedText) {
  const line = STATIC_AUDIO_LINES[audioId];
  if (!line || line.speaker !== "peppa") {
    fail(`${audioId} must reference registered Peppa audio.`);
  }
  if (expectedText != null && line.text !== expectedText) {
    fail(`${audioId} audio text must exactly match promptEn.`);
  }
  if (!existsSync(join(rootDir, "public", line.src))) {
    fail(`${audioId} source audio file does not exist.`);
  }
  return line;
}

export function validateQuestionnaireDefinition(definition) {
  if (!isPlainObject(definition)) fail("definition must be an object.");
  if (typeof definition.id !== "string" || !definition.id.trim()) fail("id is required.");
  if (!Number.isInteger(definition.version) || definition.version <= 0) {
    fail("version must be a positive integer.");
  }
  if (!Array.isArray(definition.questions) || definition.questions.length < 4 || definition.questions.length > 6) {
    fail("four to six questions are required.");
  }

  const keys = new Set();
  const positions = new Set();
  const earlierQuestions = new Map();
  for (const [index, entry] of definition.questions.entries()) {
    if (!isPlainObject(entry)) fail(`question ${index + 1} must be an object.`);
    if (typeof entry.answerKey !== "string" || !entry.answerKey.trim()) {
      fail(`question ${index + 1} answerKey is required.`);
    }
    if (keys.has(entry.answerKey)) fail("answer keys must be unique.");
    keys.add(entry.answerKey);
    if (!Number.isInteger(entry.position) || entry.position !== index + 1 || positions.has(entry.position)) {
      fail("positions must be unique and contiguous.");
    }
    positions.add(entry.position);
    if (typeof entry.promptEn !== "string" || !entry.promptEn.trim()) fail(`${entry.answerKey} promptEn is required.`);
    if (entry.promptZh != null && typeof entry.promptZh !== "string") fail(`${entry.answerKey} promptZh must be text or null.`);
    if (!supportedAnswerTypes.has(entry.answerType)) fail(`${entry.answerKey} answerType is unsupported.`);
    if (!supportedCardinalities.has(entry.cardinality)) fail(`${entry.answerKey} cardinality is unsupported.`);
    if (typeof entry.required !== "boolean") fail(`${entry.answerKey} required must be boolean.`);
    if (entry.options !== null && (!Array.isArray(entry.options) || entry.options.length === 0 || entry.options.some((option) => typeof option !== "string" || !option.trim()))) {
      fail(`${entry.answerKey} options must be non-empty strings or null.`);
    }
    validateJsonObject(entry.validation, `${entry.answerKey} validation`);
    validateJsonObject(entry.branching, `${entry.answerKey} branching`, true);

    if (entry.answerType === "choice" && !entry.options) {
      fail(`${entry.answerKey} choice questions require options.`);
    }
    if (entry.branching) {
      const prior = earlierQuestions.get(entry.branching.key);
      if (!prior) fail(`${entry.answerKey} branch must reference an earlier question.`);
      if (!supportedOperators.has(entry.branching.operator) || !("value" in entry.branching)) {
        fail(`${entry.answerKey} branch is unsupported.`);
      }
      if (
        (entry.branching.operator === "includes" ||
          entry.branching.operator === "notIncludes") &&
        prior.cardinality !== "array"
      ) {
        fail(`${entry.answerKey} array branch must reference an array question.`);
      }
      if (
        Array.isArray(prior.options) &&
        prior.options.length > 0 &&
        !prior.options.some(
          (option) =>
            option.toLocaleLowerCase("en") ===
            String(entry.branching.value).trim().toLocaleLowerCase("en"),
        )
      ) {
        fail(`${entry.answerKey} required branch is unreachable.`);
      }
    }

    validateAudio(entry.audioId, entry.promptEn);
    earlierQuestions.set(entry.answerKey, entry);
  }

  const introductionLine = validateAudio(definition.introductionAudioId, null);
  return {
    ...definition,
    audioLines: {
      [definition.introductionAudioId]: introductionLine,
      ...Object.fromEntries(
        definition.questions.map((entry) => [
          entry.audioId,
          STATIC_AUDIO_LINES[entry.audioId],
        ]),
      ),
    },
  };
}

function sqlValue(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot serialize a non-finite number.");
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonValue(value) {
  return value == null ? "NULL" : sqlValue(JSON.stringify(value));
}

export function questionnaireDefinitionHash(definition) {
  const validated = validateQuestionnaireDefinition(definition);
  const persisted = {
    id: validated.id,
    version: validated.version,
    introductionAudioId: validated.introductionAudioId,
    questions: validated.questions.map((entry) => ({
      answerKey: entry.answerKey,
      position: entry.position,
      promptEn: entry.promptEn,
      promptZh: entry.promptZh,
      answerType: entry.answerType,
      cardinality: entry.cardinality,
      required: entry.required,
      options: entry.options,
      validation: entry.validation,
      branching: entry.branching,
      audioId: entry.audioId,
    })),
  };
  return createHash("sha256")
    .update(JSON.stringify(persisted))
    .digest("hex");
}

export function buildQuestionnaireSql(definition, activatedAt = Date.now()) {
  const validated = validateQuestionnaireDefinition(definition);
  const definitionHash = questionnaireDefinitionHash(definition);
  const statements = [
    `UPDATE questionnaire SET status = 'inactive' WHERE status = 'active' AND id <> ${sqlValue(validated.id)};`,
    [
      "INSERT INTO questionnaire (id, version, status, definition_hash, created_at, activated_at)",
      `VALUES (${sqlValue(validated.id)}, ${validated.version}, 'active', ${sqlValue(definitionHash)}, ${activatedAt}, ${activatedAt})`,
      "ON CONFLICT(id) DO UPDATE SET",
      "version = excluded.version,",
      "status = CASE",
      "  WHEN questionnaire.version = excluded.version",
      "   AND questionnaire.definition_hash = excluded.definition_hash",
      "  THEN 'active'",
      "  ELSE 'immutable_conflict'",
      "END,",
      "definition_hash = excluded.definition_hash,",
      "activated_at = excluded.activated_at;",
    ].join("\n"),
    `DELETE FROM questionnaire_question WHERE questionnaire_id = ${sqlValue(validated.id)};`,
    ...validated.questions.map((entry) =>
      [
        "INSERT INTO questionnaire_question (id, questionnaire_id, answer_key, position, prompt_en, prompt_zh, answer_type, cardinality, required, options_json, validation_json, branching_json, audio_id)",
        `VALUES (${[
          `${validated.id}:${entry.answerKey}`,
          validated.id,
          entry.answerKey,
          entry.position,
          entry.promptEn,
          entry.promptZh,
          entry.answerType,
          entry.cardinality,
          entry.required ? 1 : 0,
        ]
          .map(sqlValue)
          .join(", ")}, ${jsonValue(entry.options)}, ${jsonValue(entry.validation)}, ${jsonValue(entry.branching)}, ${sqlValue(entry.audioId)});`,
      ].join("\n"),
    ),
  ];
  return `${statements.join("\n")}\n`;
}

function readArgument(name) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

export async function publishQuestionnaire() {
  const local = process.argv.includes("--local");
  const remote = process.argv.includes("--remote");
  if (local === remote) {
    throw new Error("Choose exactly one publish target: --local or --remote.");
  }

  const requestedPath = readArgument("definition");
  const definitionPath = requestedPath
    ? resolve(process.cwd(), requestedPath)
    : join(rootDir, "content", "onboarding", "questionnaire-v1.json");
  const definition = JSON.parse(await readFile(definitionPath, "utf8"));
  const sql = buildQuestionnaireSql(definition);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "parrot-questionnaire-"));
  const sqlPath = join(temporaryDirectory, "publish.sql");

  try {
    await writeFile(sqlPath, sql, "utf8");
    const { stdout, stderr } = await execFileAsync("wrangler", [
      "d1",
      "execute",
      "parrot-english",
      local ? "--local" : "--remote",
      "--file",
      sqlPath,
    ]);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) await publishQuestionnaire();
