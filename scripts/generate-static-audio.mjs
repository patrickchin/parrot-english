import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";

const execFileAsync = promisify(execFile);
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english";
const GROQ_TTS_VOICE = "hannah";
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const ELEVENLABS_DEFAULT_MODEL = "eleven_flash_v2_5";
const ELEVENLABS_DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const audioDir = join(rootDir, "public", "assets", "audio");
const args = process.argv.slice(2);
const force = args.includes("--force");
const provider =
  readArg("provider") ??
  (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY
    ? "elevenlabs"
    : "groq");
const onlyIds = args
  .filter((arg) => arg.startsWith("--only="))
  .map((arg) => arg.replace("--only=", ""));
const outputDir = readArg("output-dir");

function readArg(name) {
  return args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.replace(`--${name}=`, "");
}

function parseDotenvValue(contents, key) {
  const line = contents
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) =>
      new RegExp(`^(?:export\\s+)?${key}\\s*=`).test(entry)
    );

  return (
    line
      ?.replace(new RegExp(`^(?:export\\s+)?${key}\\s*=\\s*`), "")
      .trim()
      .replace(/^['"]|['"]$/g, "") ?? ""
  );
}

async function readLocalSecret(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }

  const varsPath = join(rootDir, ".dev.vars");
  if (!existsSync(varsPath)) return "";

  const contents = await readFile(varsPath, "utf8");
  for (const key of keys) {
    const value = parseDotenvValue(contents, key);
    if (value) return value;
  }

  return "";
}

function createGroqSpeechInput(line) {
  if (line.style === "character") {
    return `[cheerful] ${line.text}`;
  }

  return line.text;
}

async function requestGroqSpeech(apiKey, line) {
  return globalThis.fetch(`${GROQ_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: createGroqSpeechInput(line),
      model: GROQ_TTS_MODEL,
      response_format: "wav",
      voice: GROQ_TTS_VOICE,
    }),
  });
}

async function requestElevenLabsSpeech(apiKey, line) {
  const voiceId =
    process.env.ELEVENLABS_VOICE_ID ||
    (await readLocalSecret("ELEVENLABS_VOICE_ID")) ||
    ELEVENLABS_DEFAULT_VOICE_ID;
  const modelId =
    process.env.ELEVENLABS_MODEL_ID ||
    (await readLocalSecret("ELEVENLABS_MODEL_ID")) ||
    ELEVENLABS_DEFAULT_MODEL;
  const outputFormat =
    process.env.ELEVENLABS_OUTPUT_FORMAT ||
    (await readLocalSecret("ELEVENLABS_OUTPUT_FORMAT")) ||
    ELEVENLABS_DEFAULT_OUTPUT_FORMAT;
  const url = new globalThis.URL(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", outputFormat);

  return globalThis.fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      model_id: modelId,
      text: line.text,
      voice_settings: {
        similarity_boost: 0.8,
        speed: line.style === "character" ? 1.08 : 1,
        stability: line.style === "character" ? 0.35 : 0.55,
        style: line.style === "character" ? 0.45 : 0.15,
        use_speaker_boost: true,
      },
    }),
  });
}

function getOutputPath(line) {
  if (!outputDir) return join(rootDir, "public", line.src);

  return join(outputDir, basename(line.src));
}

async function requestSpeech(apiKey, line) {
  if (provider === "elevenlabs") return requestElevenLabsSpeech(apiKey, line);
  if (provider === "groq") return requestGroqSpeech(apiKey, line);
  throw new Error(`Unsupported TTS provider: ${provider}`);
}

async function writeAudioFile(filePath, audioBytes) {
  await mkdir(dirname(filePath), { recursive: true });

  if (provider !== "elevenlabs" || extname(filePath) !== ".wav") {
    await writeFile(filePath, audioBytes);
    return;
  }

  const mp3Path = `${filePath}.tmp.mp3`;
  await writeFile(mp3Path, audioBytes);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    mp3Path,
    filePath,
  ]);
  await rm(mp3Path, { force: true });
}

async function generateAudioFile(apiKey, id, line) {
  const filePath = getOutputPath(line);
  if (existsSync(filePath) && !force) {
    return "skipped";
  }

  let response = await requestSpeech(apiKey, line);
  if (response.status === 429) {
    await wait(7000);
    response = await requestSpeech(apiKey, line);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `${id} failed with ${response.status}: ${detail.slice(0, 300)}`
    );
  }

  await writeAudioFile(filePath, Buffer.from(await response.arrayBuffer()));
  return "generated";
}

const apiKey =
  provider === "elevenlabs"
    ? await readLocalSecret("ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY")
    : await readLocalSecret("GROQ_API_KEY");
if (!apiKey) {
  throw new Error(
    provider === "elevenlabs"
      ? "ELEVENLABS_API_KEY is required in the environment or .dev.vars."
      : "GROQ_API_KEY is required in the environment or .dev.vars."
  );
}

await mkdir(outputDir ?? audioDir, { recursive: true });

for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
  if (onlyIds.length > 0 && !onlyIds.includes(id)) continue;

  const status = await generateAudioFile(apiKey, id, line);
  globalThis.console.log(`${status}: ${id} (${provider})`);
}
