import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultAudioDir = join(rootDir, "public", "assets", "audio");
const defaultWorkDir = join(rootDir, "tmp", "long-story-audio-split-v1");
const AUDIO_FORMAT = {
  bitRate: 128000,
  channels: 1,
  codec: "mp3",
  sampleRate: 44100,
};
const CUT_TIME_TOLERANCE_SECONDS = 1e-9;

function createStoryManifest(storyId, sources) {
  let pageNumber = 0;

  return sources.map((source, sourceIndex) => {
    const points = [
      0,
      ...source.boundaries.map(({ at }) => at),
      source.duration,
    ];
    const outputs = points.slice(0, -1).map((start, index) => {
      pageNumber += 1;
      return {
        end: points[index + 1],
        filename:
          "story-" +
          storyId +
          "-page-" +
          String(pageNumber).padStart(3, "0") +
          "-narration.mp3",
        start,
      };
    });

    return {
      ...source,
      filename:
        "story-" +
        storyId +
        "-page-" +
        String(sourceIndex + 1).padStart(3, "0") +
        "-narration.mp3",
      outputs,
    };
  });
}

// Every cut is the midpoint of a measured silent interval following the
// exact text boundary in LONG_STORY_SPLITS. Source hashes prevent these times
// from ever being applied to a different recording.
export const LONG_STORY_AUDIO_MANIFEST = [
  ...createStoryManifest("the-gruffalo", [
    {
      boundaries: [{ at: 9.13, silenceEnd: 9.580771, silenceStart: 8.690113 }],
      duration: 29.44,
      sha256: "657e76b71ecc11cb30368c6145a22c582b052387aa4f5a0359082a3a2e579cf2",
    },
    {
      boundaries: [{ at: 12.89, silenceEnd: 13.071315, silenceStart: 12.709184 }],
      duration: 27.6,
      sha256: "4e120fbcf9bdec3215fbaa70956cba53e84a4cc61fa94aeeae1530a9fb8a5ef1",
    },
    {
      boundaries: [{ at: 8.54, silenceEnd: 9.141701, silenceStart: 7.930522 }],
      duration: 29.44,
      sha256: "bd8b8c263f6e8a6e7b3f4c08719b65edfd6297b12e2b3bbd041f2dcd2b5d11ce",
    },
    {
      boundaries: [{ at: 15.19, silenceEnd: 15.649864, silenceStart: 14.732472 }],
      duration: 29.28,
      sha256: "e89e3cd8bc1b3bc2b6c93b081ce2fcb6f86d7098f9f0d9f98790bfecfd9ea89a",
    },
    {
      boundaries: [{ at: 13.74, silenceEnd: 14.262585, silenceStart: 13.216032 }],
      duration: 26.72,
      sha256: "a599faf5fcf83542dd1fbf775b49e9ecafab0e0243c040092e29508937047aef",
    },
    {
      boundaries: [{ at: 14.53, silenceEnd: 14.97746, silenceStart: 14.079887 }],
      duration: 31.6,
      sha256: "7fe0f6cf48a9d55a04880d9a411de3dd7dca6c98de131fb032c0e13b8199488c",
    },
    {
      boundaries: [{ at: 12.68, silenceEnd: 13.168844, silenceStart: 12.189388 }],
      duration: 30.72,
      sha256: "3899eee801527591f7625e71381d943a071fcfa0badf646483c62adb2b4afbae",
    },
    {
      boundaries: [{ at: 10.95, silenceEnd: 11.428912, silenceStart: 10.481429 }],
      duration: 24.24,
      sha256: "828a74970badc247f6feaa96ceb1799d29cf63b67db7d23b91744863bf437bcc",
    },
    {
      boundaries: [{ at: 10.57, silenceEnd: 10.769909, silenceStart: 10.368639 }],
      duration: 29.12,
      sha256: "2aaac67102b736c6121f62255982dbbb33e9a4ade00831805c55eef606109810",
    },
    {
      boundaries: [{ at: 10.66, silenceEnd: 10.945011, silenceStart: 10.382313 }],
      duration: 29.84,
      sha256: "c7d8082d1f8458de1e0026f229a5ed8e1a72e429a4343fabd1e11b1c93007fa9",
    },
    {
      boundaries: [{ at: 11.32, silenceEnd: 11.600295, silenceStart: 11.032041 }],
      duration: 34.72,
      sha256: "428a9cff595f3d1ace6a7c2e4784012ee20ba1b76858d5389db3d5af29c24fcc",
    },
    {
      boundaries: [],
      duration: 6.64,
      sha256: "41d976a7c1f45eefe8c94dc040d29a6eb4d893b2b4ec11ac87fccdd359a648af",
    },
  ]),
  ...createStoryManifest("we-re-going-on-a-bear-hunt", [
    {
      boundaries: [
        { at: 12.56, silenceEnd: 12.928753, silenceStart: 12.184943 },
        { at: 21.37, silenceEnd: 21.684354, silenceStart: 21.050249 },
      ],
      duration: 33.28,
      sha256: "3de7dd725110a61b31aa83256142f51fb184d947bf7274c836af5e2892d717a7",
    },
    {
      boundaries: [
        { at: 8.31, silenceEnd: 8.635011, silenceStart: 7.98771 },
        { at: 19.84, silenceEnd: 20.144671, silenceStart: 19.53449 },
      ],
      duration: 27.92,
      sha256: "2df061a61e85cf96f9737c58f272b420386a988859bef415ff2bd0867470d199",
    },
    {
      boundaries: [
        { at: 12.53, silenceEnd: 12.969615, silenceStart: 12.085488 },
        { at: 20.83, silenceEnd: 21.121338, silenceStart: 20.536145 },
      ],
      duration: 29.68,
      sha256: "085d610d9443f073b31cd8c5bcf73eea5cb07793a2711c3c369b057bf0144256",
    },
    {
      boundaries: [
        { at: 11.25, silenceEnd: 11.554717, silenceStart: 10.953152 },
        { at: 18.22, silenceEnd: 18.324649, silenceStart: 18.12195 },
      ],
      duration: 37.28,
      sha256: "65767a89f8161bab920c0ac24cd323debcc5d0b23ffe6a35187c46d3755cc017",
    },
    {
      boundaries: [],
      duration: 16.64,
      sha256: "e0dd370eca6a09b3af2caa5e035f5b51751ba8f958f08201f3929f67a155ff64",
    },
  ]),
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedOutputNames(manifest) {
  return manifest.flatMap(({ outputs }) => outputs.map(({ filename }) => filename));
}

function outputFamily(filename) {
  const match = filename.match(/^(.*-page-)\d{3}-narration\.mp3$/u);
  if (!match) throw new Error(`Invalid narration output filename: ${filename}`);
  return match[1];
}

function validateManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("The audio split manifest must contain at least one source.");
  }

  const sourceNames = new Set();
  const outputNames = new Set();
  for (const source of manifest) {
    if (
      basename(source.filename) !== source.filename ||
      !source.filename.endsWith(".mp3")
    ) {
      throw new Error(`Invalid source filename: ${source.filename}`);
    }
    if (sourceNames.has(source.filename)) {
      throw new Error(`Duplicate source filename: ${source.filename}`);
    }
    sourceNames.add(source.filename);
    if (!/^[a-f0-9]{64}$/u.test(source.sha256)) {
      throw new Error(`Invalid source SHA-256: ${source.filename}`);
    }
    if (!(source.duration > 0) || !Array.isArray(source.outputs)) {
      throw new Error(`Invalid source duration or outputs: ${source.filename}`);
    }
    const expectedBoundaryCount = source.outputs.length - 1;
    if (
      !Array.isArray(source.boundaries) ||
      source.boundaries.length !== expectedBoundaryCount
    ) {
      throw new Error(
        `${source.filename} must define exactly ${expectedBoundaryCount} audited silence ${expectedBoundaryCount === 1 ? "boundary" : "boundaries"}.`,
      );
    }

    let previousEnd = 0;
    for (const output of source.outputs) {
      outputFamily(output.filename);
      if (outputNames.has(output.filename)) {
        throw new Error(`Duplicate output filename: ${output.filename}`);
      }
      outputNames.add(output.filename);
      if (
        output.start !== previousEnd ||
        !(output.end > output.start) ||
        output.end > source.duration
      ) {
        throw new Error(`Invalid contiguous cuts for ${source.filename}`);
      }
      previousEnd = output.end;
    }
    if (Math.abs(previousEnd - source.duration) > 0.001) {
      throw new Error(`Outputs do not cover all of ${source.filename}`);
    }
    for (const [index, boundary] of source.boundaries.entries()) {
      if (!(boundary.at > boundary.silenceStart && boundary.at < boundary.silenceEnd)) {
        throw new Error(`Cut is outside audited silence in ${source.filename}`);
      }
      const junction = source.outputs[index].end;
      if (Math.abs(boundary.at - junction) > CUT_TIME_TOLERANCE_SECONDS) {
        throw new Error(
          `${source.filename} audited cut ${boundary.at} does not match output junction ${junction}.`,
        );
      }
    }
  }
}

async function probeAudio(filename) {
  const [{ stdout }] = await Promise.all([
    execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_name,sample_rate,channels,bit_rate",
        "-of",
        "json",
        filename,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
    execFileAsync(
      "ffmpeg",
      ["-v", "error", "-xerror", "-i", filename, "-map", "0:a:0", "-f", "null", "-"],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
  ]);
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  const duration = Number(probe.format?.duration);
  if (
    probe.streams?.length !== 1 ||
    stream.codec_name !== AUDIO_FORMAT.codec ||
    Number(stream.sample_rate) !== AUDIO_FORMAT.sampleRate ||
    stream.channels !== AUDIO_FORMAT.channels ||
    Number(stream.bit_rate) !== AUDIO_FORMAT.bitRate ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error(`Unexpected MP3 format: ${filename}`);
  }
  return duration;
}

async function validateSources(sourceDir, manifest) {
  for (const source of manifest) {
    const filename = join(sourceDir, source.filename);
    let bytes;
    try {
      bytes = await readFile(filename);
    } catch {
      throw new Error(`Missing source audio: ${filename}`);
    }
    const actualSha = sha256(bytes);
    if (actualSha !== source.sha256) {
      throw new Error(
        `SHA-256 mismatch for ${source.filename}: expected ${source.sha256}, received ${actualSha}`,
      );
    }
    const duration = await probeAudio(filename);
    if (Math.abs(duration - source.duration) > 0.05) {
      throw new Error(`Duration mismatch for ${source.filename}`);
    }
  }
}

async function copyAndValidateSources(sourceDir, backupDir, manifest) {
  const backupParent = dirname(backupDir);
  await mkdir(backupParent, { recursive: true });
  const temporaryBackup = await mkdtemp(join(backupParent, "sources."));
  try {
    for (const source of manifest) {
      await copyFile(
        join(sourceDir, source.filename),
        join(temporaryBackup, source.filename),
      );
    }
    await validateSources(temporaryBackup, manifest);
    await rename(temporaryBackup, backupDir);
  } catch (error) {
    await rm(temporaryBackup, { force: true, recursive: true });
    throw error;
  }
}

async function stageOutputs(sourceDir, stageDir, manifest) {
  await rm(stageDir, { force: true, recursive: true });
  await mkdir(stageDir, { recursive: true });

  for (const source of manifest) {
    const input = join(sourceDir, source.filename);
    for (const output of source.outputs) {
      const destination = join(stageDir, output.filename);
      if (output.start === 0 && output.end === source.duration) {
        await copyFile(input, destination);
        continue;
      }
      await execFileAsync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-y",
          "-ss",
          String(output.start),
          "-to",
          String(output.end),
          "-i",
          input,
          "-map",
          "0:a:0",
          "-map_metadata",
          "-1",
          "-c:a",
          "copy",
          "-avoid_negative_ts",
          "make_zero",
          destination,
        ],
        { encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
    }
  }

  await validateOutputs(stageDir, manifest);
}

async function validateOutputs(directory, manifest) {
  const expectedNames = expectedOutputNames(manifest).sort();
  const families = new Set(expectedNames.map(outputFamily));
  const actualNames = (await readdir(directory))
    .filter((filename) => [...families].some((family) => filename.startsWith(family)))
    .sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((filename, index) => filename !== expectedNames[index])
  ) {
    throw new Error(
      `Expected exactly ${expectedNames.length} narration outputs in ${directory}.`,
    );
  }

  for (const source of manifest) {
    for (const output of source.outputs) {
      const duration = await probeAudio(join(directory, output.filename));
      const expectedDuration = output.end - output.start;
      if (Math.abs(duration - expectedDuration) > 0.12) {
        throw new Error(`Duration mismatch for ${output.filename}`);
      }
    }
  }
}

async function applyOutputs(
  audioDir,
  stageDir,
  snapshotDir,
  manifest,
  operationOverrides = {},
) {
  const {
    copyFile: applyCopyFile = copyFile,
    rename: applyRename = rename,
    rm: applyRm = rm,
  } = operationOverrides;
  const outputNames = expectedOutputNames(manifest);
  const preexisting = new Set();
  await applyRm(snapshotDir, { force: true, recursive: true });
  await mkdir(snapshotDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });

  for (const filename of outputNames) {
    const destination = join(audioDir, filename);
    if (!existsSync(destination)) continue;
    preexisting.add(filename);
    await applyCopyFile(destination, join(snapshotDir, filename));
  }

  const temporaryFiles = outputNames.map((filename) =>
    join(audioDir, `${filename}.tmp.${process.pid}`),
  );
  try {
    for (let index = 0; index < outputNames.length; index += 1) {
      await applyCopyFile(join(stageDir, outputNames[index]), temporaryFiles[index]);
    }
    for (let index = 0; index < outputNames.length; index += 1) {
      await applyRename(temporaryFiles[index], join(audioDir, outputNames[index]));
    }
    await validateOutputs(audioDir, manifest);
  } catch (applyError) {
    const rollbackErrors = [];
    for (let index = 0; index < outputNames.length; index += 1) {
      const filename = outputNames[index];
      try {
        await applyRm(temporaryFiles[index], { force: true });
      } catch (error) {
        rollbackErrors.push(error);
      }
      try {
        if (preexisting.has(filename)) {
          await applyCopyFile(join(snapshotDir, filename), join(audioDir, filename));
        } else {
          await applyRm(join(audioDir, filename), { force: true });
        }
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    if (rollbackErrors.length > 0) {
      const applyMessage =
        applyError instanceof Error ? applyError.message : String(applyError);
      const rollbackMessage = rollbackErrors
        .map((error) => (error instanceof Error ? error.message : String(error)))
        .join("; ");
      throw new AggregateError(
        [applyError, ...rollbackErrors],
        `Apply failed: ${applyMessage}. Rollback failed: ${rollbackMessage}. Recovery snapshot retained at ${snapshotDir}.`,
      );
    }
    await applyRm(snapshotDir, { force: true, recursive: true });
    throw applyError;
  }
  await applyRm(snapshotDir, { force: true, recursive: true });
}

function assertSeparateDirectories(audioDir, workDir) {
  const audioPath = resolve(audioDir);
  const workPath = resolve(workDir);
  if (
    audioPath === workPath ||
    audioPath.startsWith(workPath + sep) ||
    workPath.startsWith(audioPath + sep)
  ) {
    throw new Error("Audio and work directories must be separate.");
  }
}

export async function splitLongStoryAudio({
  apply = false,
  applyOperations,
  audioDir = defaultAudioDir,
  manifest = LONG_STORY_AUDIO_MANIFEST,
  workDir = defaultWorkDir,
} = {}) {
  validateManifest(manifest);
  assertSeparateDirectories(audioDir, workDir);
  const backupDir = join(workDir, "sources");
  const result = {
    mode: "dry-run",
    outputCount: expectedOutputNames(manifest).length,
    sourceCount: manifest.length,
  };
  let sourceDir = backupDir;
  if (existsSync(backupDir)) {
    await validateSources(backupDir, manifest);
  } else {
    sourceDir = audioDir;
    try {
      await validateSources(audioDir, manifest);
    } catch (sourceError) {
      try {
        await validateOutputs(audioDir, manifest);
      } catch {
        throw sourceError;
      }
      if (apply) {
        throw new Error(
          "Preserved original sources are required for --apply; restore the ignored work-directory backup before reapplying.",
        );
      }
      return { ...result, mode: "already-applied" };
    }
  }
  if (!apply) return result;

  if (!existsSync(backupDir)) {
    await copyAndValidateSources(sourceDir, backupDir, manifest);
  }
  const stageDir = join(workDir, "stage");
  await stageOutputs(backupDir, stageDir, manifest);
  await applyOutputs(
    audioDir,
    stageDir,
    join(workDir, "apply-snapshot"),
    manifest,
    applyOperations,
  );
  await rm(stageDir, { force: true, recursive: true });
  return { ...result, mode: "applied" };
}

function readCliOptions(args) {
  const allowed = new Set(["--apply"]);
  const options = {};
  for (const arg of args) {
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg.startsWith("--audio-dir=")) {
      options.audioDir = arg.slice("--audio-dir=".length);
    } else if (arg.startsWith("--work-dir=")) {
      options.workDir = arg.slice("--work-dir=".length);
    } else if (!allowed.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await splitLongStoryAudio(readCliOptions(process.argv.slice(2)));
  globalThis.console.log(
    `${result.mode}: ${result.sourceCount} sources -> ${result.outputCount} outputs`,
  );
}
