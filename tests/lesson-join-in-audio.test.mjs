import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import * as staticAudio from "../lib/static-audio.js";

const lessonDirectory = new URL("../content/lessons/", import.meta.url);
const lessons = readdirSync(lessonDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right))
  .map((filename) =>
    JSON.parse(readFileSync(new URL(filename, lessonDirectory), "utf8")),
  );

describe("ready-made lesson join-in audio", () => {
  it("provides a playable exact-text cue for every built-in learner step", () => {
    for (const lesson of lessons) {
      for (const scene of lesson.scenes) {
        for (const step of scene.steps) {
          if (step.speaker !== "user") continue;

          const line = staticAudio.LESSON_JOIN_IN_AUDIO_LINES?.[step.dialogue];
          assert.ok(line, `${lesson.title}: ${step.dialogue}`);
          assert.equal(line.text, step.dialogue);

          const asset = new URL(
            `../public/assets/audio/${line.id}.mp3`,
            import.meta.url,
          );
          assert.equal(existsSync(asset), true, `${line.id} exists`);
          assert.ok(statSync(asset).size > 0, `${line.id} is non-empty`);
          assert.doesNotThrow(() =>
            execFileSync("ffprobe", [
              "-v", "error", "-show_entries", "format=duration",
              "-of", "default=noprint_wrappers=1:nokey=1", asset.pathname,
            ], { stdio: "pipe" }),
          );
        }
      }
    }
  });
});
