import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getStaticAudioLineById } from "../lib/static-audio.js";
import { inspectGuideAudio } from "../scripts/nursery-rhyme/audio.mjs";

const SAMPLE_RATE = 16_000;
const rootDir = fileURLToPath(new URL("..", import.meta.url));

function pcm(samples) {
  const output = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, index) => output.writeFloatLE(sample, index * 4));
  return output;
}

async function temporaryGuide(source) {
  const packageDir = await mkdtemp(path.join(tmpdir(), "parrot-rhyme-audio-"));
  const guidePath = path.join(packageDir, "guides", "guide.mp3");
  await mkdir(path.dirname(guidePath), { recursive: true });
  if (source) await copyFile(source, guidePath);
  return { guidePath, packageDir };
}

function runnerWithPcm(output, calls = []) {
  return async (file, args, options) => {
    calls.push({ args, file, options });
    if (file.includes("ffprobe")) {
      return { stdout: JSON.stringify({ format: { duration: "1.25" } }) };
    }
    return { stdout: output };
  };
}

describe("nursery rhyme guide audio inspection", () => {
  it("decodes an existing saved guide deterministically into finite peak bars", async () => {
    const line = getStaticAudioLineById("twinkle-twinkle-v1-guide-line-1");
    const source = path.join(rootDir, "public", line.src);
    const { guidePath, packageDir } = await temporaryGuide(source);
    try {
      const first = await inspectGuideAudio({ filePath: guidePath, timelineDurationMs: 4_000 });
      const second = await inspectGuideAudio({ filePath: guidePath, timelineDurationMs: 4_000 });

      assert.deepEqual(first, second);
      assert.equal(first.peakBars.length, 32);
      assert.ok(first.peakBars.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1));
      assert.ok(first.peakBars.some((peak) => peak > 0));
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("passes binary-safe FFprobe and FFmpeg argument arrays with bounded output", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    await writeFile(guidePath, "guide bytes");
    const calls = [];
    try {
      const result = await inspectGuideAudio({
        filePath: guidePath,
        timelineDurationMs: 1_000,
        ffmpegPath: "/tools/ffmpeg with spaces",
        ffprobePath: "/tools/ffprobe with spaces",
        runTool: runnerWithPcm(pcm([0.5]), calls),
      });

      assert.equal(result.durationMs, 1_250);
      assert.deepEqual(calls, [
        {
          file: "/tools/ffprobe with spaces",
          args: [
            "-v", "error", "-show_entries", "format=duration", "-of", "json", guidePath,
          ],
          options: { encoding: "utf8" },
        },
        {
          file: "/tools/ffmpeg with spaces",
          args: [
            "-v", "error", "-xerror", "-i", guidePath, "-map", "0:a:0", "-t", "1",
            "-ac", "1", "-ar", "16000", "-f", "f32le", "-",
          ],
          options: { encoding: null, maxBuffer: 129_536 },
        },
      ]);
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("rejects missing, empty, text, malformed, and undecodable guide inputs with their paths", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    const missingPath = path.join(packageDir, "guides", "missing.mp3");
    try {
      await assert.rejects(
        inspectGuideAudio({ filePath: missingPath, timelineDurationMs: 1_000 }),
        new RegExp(missingPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );

      await writeFile(guidePath, "");
      await assert.rejects(
        inspectGuideAudio({ filePath: guidePath, timelineDurationMs: 1_000 }),
        new RegExp(guidePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );

      await writeFile(guidePath, "this is not an MP3");
      await assert.rejects(
        inspectGuideAudio({ filePath: guidePath, timelineDurationMs: 1_000 }),
        new RegExp(guidePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );

      await assert.rejects(
        inspectGuideAudio({
          filePath: guidePath,
          timelineDurationMs: 1_000,
          runTool: async () => ({ stdout: "not JSON" }),
        }),
        new RegExp(guidePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("pads a shorter guide with trailing zero bars", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    await writeFile(guidePath, "guide bytes");
    try {
      const result = await inspectGuideAudio({
        filePath: guidePath,
        timelineDurationMs: 2_000,
        runTool: runnerWithPcm(pcm(Array.from({ length: SAMPLE_RATE }, () => 0.25))),
      });

      assert.deepEqual(result.peakBars.slice(0, 16), Array(16).fill(1));
      assert.deepEqual(result.peakBars.slice(16), Array(16).fill(0));
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("omits guide audio after the score phrase", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    await writeFile(guidePath, "guide bytes");
    try {
      const result = await inspectGuideAudio({
        filePath: guidePath,
        timelineDurationMs: 1_000,
        runTool: runnerWithPcm(pcm([
          ...Array.from({ length: SAMPLE_RATE }, () => 0.25),
          ...Array.from({ length: SAMPLE_RATE }, () => 1),
        ])),
      });

      assert.deepEqual(result.peakBars, Array(32).fill(1));
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("derives line-specific bars when a guide is shared across score durations", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    await writeFile(guidePath, "guide bytes");
    const output = pcm(Array.from({ length: SAMPLE_RATE }, () => 0.5));
    try {
      const short = await inspectGuideAudio({
        filePath: guidePath,
        timelineDurationMs: 1_000,
        runTool: runnerWithPcm(output),
      });
      const long = await inspectGuideAudio({
        filePath: guidePath,
        timelineDurationMs: 2_000,
        runTool: runnerWithPcm(output),
      });

      assert.deepEqual(short.peakBars, Array(32).fill(1));
      assert.deepEqual(long.peakBars.slice(0, 16), Array(16).fill(1));
      assert.deepEqual(long.peakBars.slice(16), Array(16).fill(0));
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("quantizes normalized peak bars to three decimals", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    await writeFile(guidePath, "guide bytes");
    const samples = Array(501).fill(0);
    samples[0] = 0.1234;
    samples[500] = 1;
    try {
      const result = await inspectGuideAudio({
        filePath: guidePath,
        timelineDurationMs: 1_000,
        runTool: runnerWithPcm(pcm(samples)),
      });

      // Bar 1 peaks at 0.1234, bar 2 peaks at 1, so 0.1234 / 1 rounds to 0.123.
      assert.equal(result.peakBars[0], 0.123);
      assert.equal(result.peakBars[1], 1);
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });

  it("rejects non-buffer, misaligned, and non-finite decoded PCM", async () => {
    const { guidePath, packageDir } = await temporaryGuide();
    await writeFile(guidePath, "guide bytes");
    try {
      for (const output of ["not a buffer", Buffer.from([0, 0, 0]), pcm([Number.NaN])]) {
        await assert.rejects(
          inspectGuideAudio({
            filePath: guidePath,
            timelineDurationMs: 1_000,
            runTool: runnerWithPcm(output),
          }),
          new RegExp(guidePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
      }
    } finally {
      await rm(packageDir, { force: true, recursive: true });
    }
  });
});
