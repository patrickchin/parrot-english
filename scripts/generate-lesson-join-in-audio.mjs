import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  LESSON_JOIN_IN_AUDIO_LINES,
  STATIC_AUDIO_LINES,
} from "../lib/static-audio.js";

const execFileAsync = promisify(execFile);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const audioDir = join(rootDir, "public", "assets", "audio");
const filterGraph = [
  "[0:a]volume=0.82[a0]",
  "[1:a]asetrate=44100*0.98,aresample=44100,adelay=28|28,volume=0.62[a1]",
  "[2:a]asetrate=44100*1.025,aresample=44100,adelay=55|55,volume=0.58[a2]",
  "[a0][a1][a2]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.95[out]",
].join(";");

await mkdir(audioDir, { recursive: true });

for (const line of Object.values(LESSON_JOIN_IN_AUDIO_LINES)) {
  const source = STATIC_AUDIO_LINES[line.sourceAudioId];
  if (!source) throw new Error(`Missing source audio: ${line.sourceAudioId}`);

  const sourcePath = join(rootDir, "public", source.src);
  const outputPath = join(audioDir, `${line.id}.mp3`);
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", sourcePath, "-i", sourcePath, "-i", sourcePath,
    "-filter_complex", filterGraph, "-map", "[out]", outputPath,
  ]);
  globalThis.console.log(`generated: ${line.id}`);
}
