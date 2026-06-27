import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);

describe("static audio generator", () => {
  it("rejects local macOS text-to-speech providers", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "parrot-audio-"));

    try {
      await assert.rejects(
        execFileAsync("node", [
          "scripts/generate-static-audio.mjs",
          "--provider=macos-say",
          "--only=turn-hello",
          `--output-dir=${outputDir}`,
          "--force",
        ]),
        /Unsupported TTS provider: macos-say/
      );
    } finally {
      await rm(outputDir, { force: true, recursive: true });
    }
  });
});
