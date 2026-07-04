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
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const ELEVENLABS_DEFAULT_MODEL = "eleven_v3";
const ELEVENLABS_DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_PEPPA_VOICE_ID = "Oqy85UMasXzUjUxF0ta5";
const ELEVENLABS_DOLLY_VOICE_ID = "4NQthjVhIGGVfL3Si000";
const ELEVENLABS_NARRATOR_VOICE_ID = "4NQthjVhIGGVfL3Si000";
const ELEVENLABS_SPEAKER_VOICE_IDS = {
  peppa: ELEVENLABS_PEPPA_VOICE_ID,
  dolly: ELEVENLABS_DOLLY_VOICE_ID,
  narrator: ELEVENLABS_NARRATOR_VOICE_ID,
};

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const audioDir = join(rootDir, "public", "assets", "audio");
const args = process.argv.slice(2);
const force = args.includes("--force");
const provider = readArg("provider") ?? "elevenlabs";
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

async function requestElevenLabsSpeech(apiKey, line) {
  const voiceId = await getElevenLabsVoiceId(line);
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
      text: line.ttsText ?? line.text,
      voice_settings: getElevenLabsVoiceSettings(line),
    }),
  });
}

async function getElevenLabsVoiceId(line) {
  const speakerKey = `ELEVENLABS_${line.speaker.toUpperCase()}_VOICE_ID`;
  const configuredVoice = await readLocalSecret(
    speakerKey,
    "ELEVENLABS_VOICE_ID"
  );

  if (configuredVoice) return configuredVoice;
  const defaultVoice = ELEVENLABS_SPEAKER_VOICE_IDS[line.speaker];
  if (!defaultVoice) {
    throw new Error(`No ElevenLabs voice configured for speaker: ${line.speaker}`);
  }
  return defaultVoice;
}

function getElevenLabsVoiceSettings(line) {
  if (line.voiceStyle === "energetic-character") {
    return {
      similarity_boost: 0.8,
      speed: 1.1,
      stability: 0.28,
      style: 0.7,
      use_speaker_boost: true,
    };
  }

  return {
    similarity_boost: 0.8,
    speed: line.style === "character" ? 1.08 : 1,
    stability: line.style === "character" ? 0.35 : 0.55,
    style: line.style === "character" ? 0.45 : 0.15,
    use_speaker_boost: true,
  };
}

function getOutputPath(line) {
  if (!outputDir) return join(rootDir, "public", line.src);

  return join(outputDir, basename(line.src));
}

async function requestSpeech(apiKey, line) {
  if (provider === "elevenlabs") return requestElevenLabsSpeech(apiKey, line);
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

if (provider !== "elevenlabs") {
  throw new Error(`Unsupported TTS provider: ${provider}`);
}

const apiKey = await readLocalSecret("ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY");
if (!apiKey) {
  throw new Error("ELEVENLABS_API_KEY is required in the environment or .dev.vars.");
}

await mkdir(outputDir ?? audioDir, { recursive: true });

for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
  if (onlyIds.length > 0 && !onlyIds.includes(id)) continue;

  const status = await generateAudioFile(apiKey, id, line);
  globalThis.console.log(`${status}: ${id} (${provider})`);
}
