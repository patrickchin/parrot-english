import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const SAMPLE_RATE = 16_000;
const BAR_COUNT = 32;
const MAX_TIMELINE_DURATION_MS = 8_000;
const execFileAsync = promisify(execFile);

function audioError(filePath, message) {
  return new Error(`${filePath}: ${message}`);
}

function normalizedPeakBars(samples, timelineSampleCount) {
  const peaks = Array.from({ length: BAR_COUNT }, (_, barIndex) => {
    const start = Math.floor((barIndex * timelineSampleCount) / BAR_COUNT);
    const end = Math.floor(((barIndex + 1) * timelineSampleCount) / BAR_COUNT);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex]));
    }
    return peak;
  });
  const maximum = Math.max(...peaks);
  return maximum ? peaks.map((peak) => peak / maximum) : peaks;
}

function quantizePeakBars(peakBars) {
  return peakBars.map((peak) => Math.min(1, Math.max(0, Math.round(peak * 1_000) / 1_000)));
}

/**
 * Validate an authored guide recording and derive its line-specific waveform.
 * @param {{ filePath: string, timelineDurationMs: number, ffmpegPath?: string, ffprobePath?: string, runTool?: typeof execFileAsync }} options
 */
export async function inspectGuideAudio({
  filePath,
  timelineDurationMs,
  ffmpegPath = "ffmpeg",
  ffprobePath = "ffprobe",
  runTool = execFileAsync,
}) {
  const displayPath = String(filePath);
  if (!Number.isFinite(timelineDurationMs) || timelineDurationMs <= 0 || timelineDurationMs > MAX_TIMELINE_DURATION_MS) {
    throw audioError(displayPath, `timeline duration must be greater than 0 and at most ${MAX_TIMELINE_DURATION_MS}ms`);
  }
  const timelineSampleCount = Math.round(SAMPLE_RATE * timelineDurationMs / 1_000);
  const maxBuffer = timelineSampleCount * 2 + 64 * 1024;

  let guideStat;
  try {
    guideStat = await stat(filePath);
  } catch (error) {
    throw audioError(displayPath, `guide file is missing or unreadable (${error.message})`);
  }
  if (!guideStat.isFile() || guideStat.size === 0) {
    throw audioError(displayPath, "guide file must be a non-empty regular file");
  }

  let probeOutput;
  try {
    ({ stdout: probeOutput } = await runTool(
      ffprobePath,
      [
        "-v", "error", "-select_streams", "a:0", "-show_frames",
        "-show_entries", "stream=sample_rate:frame=nb_samples", "-of", "json", filePath,
      ],
      { encoding: "utf8" },
    ));
  } catch (error) {
    throw audioError(displayPath, `FFprobe could not read guide audio (${error.message})`);
  }

  let probe;
  try {
    probe = JSON.parse(probeOutput);
  } catch {
    throw audioError(displayPath, "FFprobe returned invalid JSON");
  }
  const sampleRate = Number(probe?.streams?.[0]?.sample_rate);
  const frameSampleCounts = Array.isArray(probe?.frames)
    ? probe.frames.map((frame) => Number(frame?.nb_samples))
    : [];
  if (
    !Number.isSafeInteger(sampleRate)
    || sampleRate <= 0
    || frameSampleCounts.length === 0
    || frameSampleCounts.some((count) => !Number.isSafeInteger(count) || count <= 0)
  ) {
    throw audioError(displayPath, "FFprobe did not report positive integer decoded sample metadata");
  }
  const decodedSampleCount = frameSampleCounts.reduce((total, count) => total + count, 0);
  const durationMs = Math.round(decodedSampleCount / sampleRate * 1_000);
  if (!Number.isSafeInteger(decodedSampleCount) || !Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw audioError(displayPath, "FFprobe decoded sample duration is invalid");
  }

  let pcm;
  try {
    ({ stdout: pcm } = await runTool(
      ffmpegPath,
      [
        "-v", "error", "-xerror", "-i", filePath, "-map", "0:a:0",
        "-t", String(timelineDurationMs / 1_000), "-ac", "1", "-ar", String(SAMPLE_RATE),
        "-f", "s16le", "-",
      ],
      { encoding: null, maxBuffer },
    ));
  } catch (error) {
    throw audioError(displayPath, `FFmpeg could not decode guide audio (${error.message})`);
  }
  if (!Buffer.isBuffer(pcm) || pcm.length % 2 !== 0 || pcm.length > maxBuffer) {
    throw audioError(displayPath, "FFmpeg returned invalid PCM output");
  }

  const sampleCount = pcm.length / 2;
  const samples = new Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = pcm.readInt16LE(index * 2) / 32_768;
  }

  return {
    durationMs,
    peakBars: quantizePeakBars(normalizedPeakBars(samples, timelineSampleCount)),
  };
}
