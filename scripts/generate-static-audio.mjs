import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPrivateStoryPreview } from "../lib/private-story-preview.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";

const execFileAsync = promisify(execFile);
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const ELEVENLABS_DEFAULT_MODEL = "eleven_v3";
const ELEVENLABS_DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_PEPPA_VOICE_ID = "Oqy85UMasXzUjUxF0ta5";
const ELEVENLABS_DOLLY_VOICE_ID = "5N1BjZ10t6GcJUhZCP40";
const ELEVENLABS_NARRATOR_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";
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

  if (line.speaker === "narrator") {
    return {
      similarity_boost: 0.82,
      speed: 0.96,
      stability: 0.5,
      style: 0.35,
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
  if (line.outputFilePath) {
    return validatePrivateOutputPath(
      line.outputFilePath,
      join(rootDir, "content/private-story-preview"),
    );
  }
  if (!outputDir) return join(rootDir, "public", line.src);

  return join(outputDir, basename(line.src));
}

function validatePrivateOutputPath(outputFilePath, previewDirectory) {
  if (typeof outputFilePath !== "string" || !outputFilePath) {
    throw new Error("Private audio output must stay inside the private preview directory");
  }
  const directory = resolve(previewDirectory);
  const outputPath = resolve(outputFilePath);
  const relativePath = relative(directory, outputPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Private audio output must stay inside the private preview directory");
  }
  return outputPath;
}

async function validatePrivateOutputPathOnDisk(
  outputFilePath,
  previewDirectory,
  projectRoot,
) {
  const root = resolve(projectRoot);
  const directory = validatePrivateOutputPath(previewDirectory, root);
  if (directory === root) {
    throw new Error("Private audio output must stay inside the private preview directory");
  }
  const outputPath = validatePrivateOutputPath(
    outputFilePath,
    directory,
  );
  const rootStats = await lstat(root);
  if (rootStats.isSymbolicLink()) {
    throw new Error("Private audio output must stay inside the private preview directory");
  }
  const realRoot = await realpath(root);
  const realDirectory = await realpath(directory);
  validatePrivateOutputPath(realDirectory, realRoot);
  const relativePath = relative(root, outputPath);
  let currentPath = root;

  for (const segment of relativePath.split(process.platform === "win32" ? "\\" : "/")) {
    currentPath = join(currentPath, segment);
    try {
      const currentStats = await lstat(currentPath);
      if (currentStats.isSymbolicLink()) {
        throw new Error("Private audio output must stay inside the private preview directory");
      }
      const realCurrentPath = await realpath(currentPath);
      validatePrivateOutputPath(realCurrentPath, realRoot);
      if (
        currentPath === directory ||
        !relative(directory, currentPath).startsWith("..")
      ) {
        validatePrivateOutputPath(realCurrentPath, realDirectory);
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }

  return outputPath;
}

export async function getGenerationLines({
  includePrivateStories = false,
  previewDirectory,
  projectRoot = rootDir,
} = {}) {
  if (!includePrivateStories) return STATIC_AUDIO_LINES;

  const directory = resolve(
    previewDirectory ?? join(projectRoot, "content/private-story-preview"),
  );
  const { audioLines } = await loadPrivateStoryPreview({
    previewDirectory: directory,
    projectRoot,
    requireAudio: false,
  });
  const privateAudioLines = Object.fromEntries(
    await Promise.all(
      Object.entries(audioLines).map(async ([id, line]) => [
        id,
        {
          ...line,
          outputFilePath: await validatePrivateOutputPathOnDisk(
            line.outputFilePath,
            directory,
            projectRoot,
          ),
        },
      ]),
    ),
  );

  return { ...STATIC_AUDIO_LINES, ...privateAudioLines };
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

async function main() {
  if (provider !== "elevenlabs") {
    throw new Error(`Unsupported TTS provider: ${provider}`);
  }

  const apiKey = await readLocalSecret("ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY");
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required in the environment or .dev.vars.");
  }

  await mkdir(outputDir ?? audioDir, { recursive: true });
  const lines = await getGenerationLines({
    includePrivateStories: args.includes("--private-story-preview"),
    projectRoot: rootDir,
  });

  for (const [id, line] of Object.entries(lines)) {
    if (onlyIds.length > 0 && !onlyIds.includes(id)) continue;

    const status = await generateAudioFile(apiKey, id, line);
    globalThis.console.log(`${status}: ${id} (${provider})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
