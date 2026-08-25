import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
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
const PRIVATE_AUDIO_OUTPUT_ERROR =
  "Private audio output must stay inside the private preview directory";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
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
    throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
  }
  const directory = resolve(previewDirectory);
  const outputPath = resolve(outputFilePath);
  const relativePath = relative(directory, outputPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
  }
  return outputPath;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function inspectPrivateMutationPath(
  outputFilePath,
  previewDirectory,
  projectRoot,
  { allowFinalSymlink = false, createParents = false } = {},
) {
  try {
    const root = resolve(projectRoot);
    const directory = validatePrivateOutputPath(previewDirectory, root);
    const outputPath = validatePrivateOutputPath(outputFilePath, directory);
    if (directory === root) throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);

    const rootStats = await lstat(root);
    const realRoot = await realpath(root);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }

    let currentPath = root;
    for (const segment of relative(root, directory).split(sep)) {
      currentPath = join(currentPath, segment);
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
      }
      const realCurrentPath = await realpath(currentPath);
      validatePrivateOutputPath(realCurrentPath, realRoot);
    }

    const realDirectory = await realpath(directory);
    if (realDirectory === realRoot) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }
    validatePrivateOutputPath(realDirectory, realRoot);

    const parentPath = dirname(outputPath);
    currentPath = directory;
    let parentMissing = false;
    for (const segment of relative(directory, parentPath).split(sep)) {
      currentPath = join(currentPath, segment);
      let stats;
      try {
        stats = await lstat(currentPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        if (!createParents) {
          parentMissing = true;
          break;
        }
        try {
          await mkdir(currentPath, { mode: 0o700 });
        } catch (mkdirError) {
          if (mkdirError?.code !== "EEXIST") throw mkdirError;
        }
        stats = await lstat(currentPath);
      }
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
      }
      const realCurrentPath = await realpath(currentPath);
      validatePrivateOutputPath(realCurrentPath, realDirectory);
    }

    if (parentMissing) {
      return {
        outputPath,
        outputStats: null,
        parentPath,
        parentStats: null,
      };
    }

    const parentStats = await lstat(parentPath);
    let outputStats = null;
    try {
      outputStats = await lstat(outputPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (
      outputStats &&
      (outputStats.isDirectory() ||
        (outputStats.isSymbolicLink() && !allowFinalSymlink))
    ) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }

    return { outputPath, outputStats, parentPath, parentStats };
  } catch (error) {
    if (error?.message === PRIVATE_AUDIO_OUTPUT_ERROR) throw error;
    throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
  }
}

function sameFileSnapshot(left, right) {
  return (
    sameFileIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function hasStablePrivateAudioOutput(
  filePath,
  previewDirectory,
  projectRoot,
) {
  let fileHandle;
  try {
    const initial = await inspectPrivateMutationPath(
      filePath,
      previewDirectory,
      projectRoot,
    );
    if (!initial.outputStats) return false;
    if (!initial.outputStats.isFile() || initial.outputStats.size === 0) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }

    fileHandle = await open(
      filePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = await fileHandle.stat();
    if (!before.isFile() || before.size === 0 || !sameFileSnapshot(initial.outputStats, before)) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }
    const final = await inspectPrivateMutationPath(
      filePath,
      previewDirectory,
      projectRoot,
    );
    const after = await fileHandle.stat();
    if (
      !final.outputStats ||
      !sameFileSnapshot(before, after) ||
      !sameFileSnapshot(after, final.outputStats)
    ) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }
    return true;
  } catch (error) {
    if (error?.message === PRIVATE_AUDIO_OUTPUT_ERROR) throw error;
    throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
  } finally {
    try {
      await fileHandle?.close();
    } catch {
      // A failed read-only close does not change the existing output.
    }
  }
}

async function writePrivateAudioFileAtomically(
  filePath,
  audioBytes,
  {
    beforePublish,
    forceOverwrite,
    previewDirectory,
    projectRoot,
    writeBytes = (fileHandle, bytes) => fileHandle.writeFile(bytes),
  },
) {
  const initial = await inspectPrivateMutationPath(
    filePath,
    previewDirectory,
    projectRoot,
    { allowFinalSymlink: forceOverwrite, createParents: true },
  );
  const temporaryPath = join(
    initial.parentPath,
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let temporaryHandle;
  let temporaryStats;

  try {
    temporaryHandle = await open(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    await writeBytes(temporaryHandle, audioBytes);
    await temporaryHandle.sync();
    temporaryStats = await temporaryHandle.stat();
    if (!temporaryStats.isFile() || temporaryStats.size !== audioBytes.byteLength) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }
    await temporaryHandle.close();
    temporaryHandle = undefined;

    await beforePublish?.();
    const final = await inspectPrivateMutationPath(
      filePath,
      previewDirectory,
      projectRoot,
      { allowFinalSymlink: forceOverwrite },
    );
    if (!sameFileIdentity(initial.parentStats, final.parentStats)) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }
    const publishStats = await lstat(temporaryPath);
    if (!publishStats.isFile() || !sameFileSnapshot(temporaryStats, publishStats)) {
      throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
    }

    if (forceOverwrite) {
      await rename(temporaryPath, filePath);
    } else {
      await link(temporaryPath, filePath);
    }
  } catch (error) {
    if (error?.message === PRIVATE_AUDIO_OUTPUT_ERROR) throw error;
    throw new Error(PRIVATE_AUDIO_OUTPUT_ERROR);
  } finally {
    try {
      await temporaryHandle?.close();
    } catch {
      // The final path remains untouched when a temporary-file close fails.
    }
    try {
      await rm(temporaryPath, { force: true });
    } catch {
      // A failed best-effort cleanup never changes the published final path.
    }
  }
}

export async function getGenerationLines({
  privateStoriesOnly = false,
  previewDirectory,
  projectRoot = rootDir,
} = {}) {
  if (!privateStoriesOnly) return STATIC_AUDIO_LINES;

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
          outputFilePath: (
            await inspectPrivateMutationPath(
              line.outputFilePath,
              directory,
              projectRoot,
            )
          ).outputPath,
        },
      ]),
    ),
  );

  return privateAudioLines;
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

async function cancelSpeechResponseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Provider-controlled cancellation failures must not replace safe diagnostics.
  }
}

export async function readSpeechAudioResponse(id, response) {
  if (!response.ok) {
    const status = Number.isInteger(response.status) ? response.status : 0;
    await cancelSpeechResponseBody(response);
    throw new Error(`${id} failed with HTTP ${status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function requestSpeechWithRateLimitRetry(
  apiKey,
  line,
  {
    requestSpeechImplementation = requestSpeech,
    waitImplementation = wait,
  } = {},
) {
  let response = await requestSpeechImplementation(apiKey, line);
  if (response.status === 429) {
    await cancelSpeechResponseBody(response);
    await waitImplementation(7000);
    response = await requestSpeechImplementation(apiKey, line);
  }
  return response;
}

export async function generateAudioFile(
  apiKey,
  id,
  line,
  {
    forceOverwrite = force,
    previewDirectory = join(rootDir, "content/private-story-preview"),
    privateWriteOptions = {},
    projectRoot = rootDir,
    requestSpeechImplementation = requestSpeech,
  } = {},
) {
  const filePath = line.outputFilePath
    ? validatePrivateOutputPath(line.outputFilePath, previewDirectory)
    : getOutputPath(line);
  if (line.outputFilePath) {
    if (forceOverwrite) {
      await inspectPrivateMutationPath(
        filePath,
        previewDirectory,
        projectRoot,
        { allowFinalSymlink: true },
      );
    } else if (
      await hasStablePrivateAudioOutput(
        filePath,
        previewDirectory,
        projectRoot,
      )
    ) {
      return "skipped";
    }
  } else if (existsSync(filePath) && !forceOverwrite) {
    return "skipped";
  }

  const response = await requestSpeechWithRateLimitRetry(apiKey, line, {
    requestSpeechImplementation,
  });

  const audioBytes = await readSpeechAudioResponse(id, response);
  if (line.outputFilePath) {
    await writePrivateAudioFileAtomically(
      filePath,
      audioBytes,
      {
        ...privateWriteOptions,
        forceOverwrite,
        previewDirectory,
        projectRoot,
      },
    );
  } else {
    await writeAudioFile(filePath, audioBytes);
  }
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

  const lines = await getGenerationLines({
    privateStoriesOnly: args.includes("--private-story-preview"),
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
