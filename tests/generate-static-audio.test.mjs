import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { GENERATED_DUB_DEFINITIONS } from "../src/dubbing/generated-rhyme-catalog.ts";
import { WORD_GAME_MISSING_AUDIO_IDS } from "./fixtures/word-game-missing-audio-ids.mjs";

const execFileAsync = promisify(execFile);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

function shellChain(script) {
  return typeof script === "string" ? script.split(/\s*&&\s*/u) : [];
}

async function createWordGameGeneratorRepo() {
  const tempRoot = await mkdtemp(join(tmpdir(), "parrot-word-game-audio-"));
  await mkdir(join(tempRoot, "scripts"), { recursive: true });
  await mkdir(join(tempRoot, "public", "assets", "audio"), { recursive: true });
  await mkdir(join(tempRoot, "third_party"), { recursive: true });
  await cp(
    join(rootDir, "scripts", "generate-static-audio.mjs"),
    join(tempRoot, "scripts", "generate-static-audio.mjs"),
  );
  await cp(join(rootDir, "scripts", "word-game"), join(tempRoot, "scripts", "word-game"), {
    recursive: true,
  });
  await cp(join(rootDir, "content", "word-games"), join(tempRoot, "content", "word-games"), {
    recursive: true,
  });
  await cp(
    join(rootDir, "public", "assets", "word-games"),
    join(tempRoot, "public", "assets", "word-games"),
    { recursive: true },
  );
  await cp(
    join(rootDir, "third_party", "noto-emoji-svg-LICENSE"),
    join(tempRoot, "third_party", "noto-emoji-svg-LICENSE"),
  );
  await symlink(join(rootDir, "node_modules"), join(tempRoot, "node_modules"), "dir");

  const existingLabelFiles = (await readdir(join(rootDir, "public", "assets", "audio")))
    .filter((filename) => /^word-game-.+-label\.mp3$/u.test(filename))
    .sort();
  for (const filename of existingLabelFiles) {
    await cp(
      join(rootDir, "public", "assets", "audio", filename),
      join(tempRoot, "public", "assets", "audio", filename),
    );
  }
  assert.equal(existingLabelFiles.length, 36);
  return { existingLabelFiles, tempRoot };
}

function generatorEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of [
    "ELEVENLABS_MODEL_ID",
    "ELEVENLABS_OUTPUT_FORMAT",
    "ELEVENLABS_NARRATOR_VOICE_ID",
    "ELEVENLABS_VOICE_ID",
    "ELEVEN_LABS_API_KEY",
  ]) delete env[key];
  return env;
}

describe("static audio generator", () => {
  it("keeps separate explicit write and check commands for the rhyme catalog", () => {
    assert.equal(
      packageJson.scripts["generate:rhyme-catalog"],
      "node scripts/generate-rhyme-catalog.mjs",
    );
    assert.equal(
      packageJson.scripts["check:rhyme-catalog"],
      "node scripts/generate-rhyme-catalog.mjs --check",
    );
  });

  it("runs only catalog check mode before every content-sensitive lifecycle command", () => {
    const expectedHooks = {
      prebuild: [
        "npm run check:rhyme-catalog",
        "node scripts/prepare-workers-ci-metadata.mjs",
      ],
      pretest: ["npm run check:rhyme-catalog"],
      "pretest:browser": ["npm run check:rhyme-catalog"],
      "predev:vite": ["npm run check:rhyme-catalog"],
      prestart: ["npm run check:rhyme-catalog"],
      "pregenerate:audio:elevenlabs": ["npm run check:rhyme-catalog"],
      "predeploy:worker": ["npm run check:rhyme-catalog"],
    };

    for (const [hook, expectedCommands] of Object.entries(expectedHooks)) {
      assert.deepEqual(shellChain(packageJson.scripts[hook]), expectedCommands, hook);
      assert.equal(
        shellChain(packageJson.scripts[hook]).includes("npm run generate:rhyme-catalog"),
        false,
        hook,
      );
    }
  });

  it("recognizes an existing nested package guide without generating audio", async () => {
    const guide = GENERATED_DUB_DEFINITIONS[0].guides[0];
    assert.match(guide.src, /^\/assets\/nursery-rhymes\/[^/]+\/guides\/.+\.mp3$/);

    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/generate-static-audio.mjs", `--only=${guide.id}`],
      {
        env: { ...process.env, ELEVENLABS_API_KEY: "unused-test-key" },
      },
    );

    assert.equal(stdout.trim(), `skipped: ${guide.id} (elevenlabs)`);
  });

  it("lists only the 71 compiler-planned missing word-game IDs without a key or runtime registry", async () => {
    const { tempRoot } = await createWordGameGeneratorRepo();
    await mkdir(join(tempRoot, ".dev.vars"));

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["scripts/generate-static-audio.mjs", "--word-game-content", "--list-missing"],
        { cwd: tempRoot, env: generatorEnv() },
      );

      assert.deepEqual(stdout.trim().split("\n"), WORD_GAME_MISSING_AUDIO_IDS);
      assert.equal((await stat(join(tempRoot, ".dev.vars"))).isDirectory(), true);
      await assert.rejects(readFile(join(tempRoot, "lib", "static-audio.js"), "utf8"), {
        code: "ENOENT",
      });
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("generates exactly the 71 missing compiler-planned lines and skips 36 existing lines", async () => {
    const { existingLabelFiles, tempRoot } = await createWordGameGeneratorRepo();
    const outputDir = join(tempRoot, "generated-audio");
    const fetchLog = join(tempRoot, "fetch-log.ndjson");
    const fetchHarness = join(tempRoot, "fake-fetch.mjs");
    await mkdir(outputDir);
    for (const filename of existingLabelFiles) {
      await cp(
        join(tempRoot, "public", "assets", "audio", filename),
        join(outputDir, filename),
      );
    }
    await writeFile(fetchLog, "");
    await writeFile(fetchHarness, `
      import { appendFileSync } from "node:fs";
      globalThis.fetch = async (url, options) => {
        appendFileSync(process.env.FETCH_LOG, JSON.stringify({
          body: JSON.parse(options.body),
          url: String(url),
        }) + "\\n");
        return {
          status: 200,
          ok: true,
          arrayBuffer: async () => Uint8Array.from([73, 68, 51]).buffer,
          text: async () => "",
        };
      };
    `);

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          "--import",
          fetchHarness,
          "scripts/generate-static-audio.mjs",
          "--provider=elevenlabs",
          "--word-game-content",
          `--output-dir=${outputDir}`,
        ],
        {
          cwd: tempRoot,
          env: generatorEnv({
            ELEVENLABS_API_KEY: "fake-test-key",
            FETCH_LOG: fetchLog,
          }),
        },
      );
      const statuses = stdout.trim().split("\n");
      const requests = (await readFile(fetchLog, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      assert.equal(statuses.length, 107);
      assert.equal(statuses.filter((line) => line.startsWith("skipped:")).length, 36);
      assert.deepEqual(
        statuses.filter((line) => line.startsWith("generated:"))
          .map((line) => line.match(/^generated: (.+) \(elevenlabs\)$/u)[1]),
        WORD_GAME_MISSING_AUDIO_IDS,
      );
      assert.equal(requests.length, 71);
      assert.ok(requests.every(({ body }) => body.model_id === "eleven_v3"));
      assert.ok(requests.every(({ url }) => url.endsWith("?output_format=mp3_44100_128")));
      assert.equal((await readdir(outputDir)).length, 107);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("rejects invalid word-game mode flags and non-curriculum IDs", async () => {
    const { tempRoot } = await createWordGameGeneratorRepo();
    const invalidArguments = [
      ["--list-missing"],
      ["--word-game-content", "--list-missing", "--force"],
      ["--word-game-content", "--list-missing", "--only=word-game-animals-cat-label"],
      ["--word-game-content", "--list-missing", "--output-dir=unused"],
      ["--word-game-content", "--unknown"],
      ["--word-game-content", "--only=word-game-retry"],
    ];

    try {
      for (const invalid of invalidArguments) {
        await assert.rejects(
          execFileAsync(
            process.execPath,
            ["scripts/generate-static-audio.mjs", ...invalid],
            { cwd: tempRoot, env: generatorEnv({ ELEVENLABS_API_KEY: "fake-test-key" }) },
          ),
          /Invalid static-audio arguments|Unknown word-game audio ID/u,
          invalid.join(" "),
        );
      }
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("chooses ElevenLabs voices from speaker metadata", () => {
    const generator = readFileSync(
      new URL("../scripts/generate-static-audio.mjs", import.meta.url),
      "utf8"
    );

    assert.match(generator, /ELEVENLABS_SPEAKER_VOICE_IDS/);
    assert.match(generator, /ELEVENLABS_PEPPA_VOICE_ID/);
    assert.match(generator, /ELEVENLABS_DOLLY_VOICE_ID/);
    assert.match(generator, /ELEVENLABS_NARRATOR_VOICE_ID/);
    assert.match(generator, /line\.speaker/);
    assert.match(generator, /5N1BjZ10t6GcJUhZCP40/);
    assert.match(generator, /pFZP5JQG7iQjIQuC4Bku/);
    assert.doesNotMatch(generator, /4NQthjVhIGGVfL3Si000/);
    assert.match(generator, /line\.speaker === "narrator"/);
    assert.match(generator, /speed:\s*0\.96/);
    assert.match(generator, /style:\s*0\.35/);
    assert.doesNotMatch(generator, /line\.lang\s*===\s*["']zh-CN["']/);
  });

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
