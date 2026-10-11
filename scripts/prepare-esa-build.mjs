import { rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire("/tmp/parrot-esa-tools/package.json");

// ESA's build image lacks the tools used by the audio catalog checks.
for (const [name, binary] of [
  ["ffmpeg", require("ffmpeg-static")],
  ["ffprobe", require("ffprobe-static").path],
]) {
  const command = resolve("node_modules/.bin", name);
  rmSync(command, { force: true });
  symlinkSync(binary, command);
}
