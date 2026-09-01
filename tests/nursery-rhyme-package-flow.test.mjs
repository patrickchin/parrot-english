import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { after, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import {
  compileNurseryRhymePackages,
  serializeGeneratedCatalog,
} from "../scripts/nursery-rhyme/compiler.mjs";
import { parseDubRoute } from "../worker/dub-route.ts";
import {
  createDubStorageKeys,
  dubStorageClosureKeys,
} from "../worker/dub-storage.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const execFileAsync = promisify(execFile);
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: repositoryRoot,
  server: { middlewareMode: true },
});
const { NurseryRhymeList } = await vite.ssrLoadModule(
  "/src/dubbing/NurseryRhymeList.tsx",
);
const { IllustratedDubScene } = await vite.ssrLoadModule(
  "/src/dubbing/IllustratedDubScene.tsx",
);
const { DUB_DEFINITIONS, normalizeGeneratedDubDefinitions } =
  await vite.ssrLoadModule("/src/dubbing/rhyme-catalog.ts");
const { getDubRoutePaths } = await vite.ssrLoadModule(
  "/src/app/app-routes.ts",
);

after(() => vite.close());

async function addSeventhPackage(contentRoot) {
  const packageRoot = path.join(contentRoot, "one-little-bell");
  const guideRoot = path.join(packageRoot, "guides");
  await mkdir(guideRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "rhyme.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      order: 7,
      id: "one-little-bell-v1",
      slug: "one-little-bell",
      title: "One Little Bell",
      countInBeats: 2,
      countInMidi: 72,
      score: {
        src: "score.musicxml",
        melodyPart: "P1",
        playbackParts: ["P1"],
        volume: 0.12,
      },
      scenes: [{
        id: "scene-1",
        title: "A bright bell",
        artwork: {
          src: "https://media.parrotbook.com/assets/v8/dubbing/one-little-bell/scene-1.webp",
          alt: "A bright bell rings in the sunshine.",
          width: 1536,
          height: 864,
        },
        lines: [
          {
            id: "one-little-bell-v1-line-1",
            text: "Ring.",
            guide: "guides/one-little-bell-v1-guide-line-1.mp3",
            artwork: {
              src: "https://media.parrotbook.com/assets/v8/dubbing/one-little-bell/line-1.webp",
              alt: "A small golden bell rings beside a sunny window.",
              width: 1536,
              height: 864,
            },
          },
          {
            id: "one-little-bell-v1-line-2",
            text: "Sing.",
            guide: "guides/one-little-bell-v1-guide-line-2.mp3",
          },
        ],
      }],
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(packageRoot, "score.musicxml"),
    [
      '<score-partwise version="4.0">',
      '<part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>',
      '<part id="P1"><measure number="1">',
      '<attributes><divisions>1</divisions></attributes>',
      '<direction><direction-type><metronome><beat-unit>quarter</beat-unit>',
      '<per-minute>60</per-minute></metronome></direction-type></direction>',
      '<note><rest/><duration>2</duration></note>',
      '<bookmark id="one-little-bell-v1-line-1"/>',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>',
      '<lyric number="1"><syllabic>single</syllabic><text>Ring</text><end-line/></lyric></note>',
      '<bookmark id="one-little-bell-v1-line-2"/>',
      '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>',
      '<lyric number="1"><syllabic>single</syllabic><text>Sing</text><end-line/></lyric></note>',
      '</measure></part></score-partwise>',
    ].join(""),
  );
  const sourceGuide = path.join(
    contentRoot,
    "five-little-ducks",
    "guides",
    "five-little-ducks-v2-guide-line-1.mp3",
  );
  await Promise.all([
    copyFile(sourceGuide, path.join(guideRoot, "one-little-bell-v1-guide-line-1.mp3")),
    copyFile(sourceGuide, path.join(guideRoot, "one-little-bell-v1-guide-line-2.mp3")),
  ]);
}

async function runAudioTool(file) {
  return file === "ffprobe"
    ? {
        stdout: JSON.stringify({
          frames: [{ nb_samples: "16000" }],
          streams: [{ sample_rate: "16000" }],
        }),
      }
    : { stdout: Buffer.alloc(4) };
}

it("flows one compiled seventh package through shelf, learner, Worker, and storage seams", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "parrot-rhyme-flow-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const contentRoot = path.join(root, "nursery-rhymes");
  await cp(
    path.join(repositoryRoot, "public", "assets", "nursery-rhymes"),
    contentRoot,
    { recursive: true },
  );
  await addSeventhPackage(contentRoot);

  const compiledLiterals = await compileNurseryRhymePackages({
    contentRoot,
    ledgerPath: path.join(
      repositoryRoot,
      "scripts",
      "nursery-rhyme-deployed-ids.json",
    ),
    runTool: runAudioTool,
  });

  assert.equal(compiledLiterals.length, 7);
  assert.deepEqual(compiledLiterals[6].lineArtwork, [
    {
      alt: "A small golden bell rings beside a sunny window.",
      height: 864,
      src: "https://media.parrotbook.com/assets/v8/dubbing/one-little-bell/line-1.webp",
      width: 1536,
    },
    null,
  ]);

  const generatedPath = path.join(root, "mixed-art-generated.ts");
  const typecheckPath = path.join(root, "mixed-art-typecheck.ts");
  const catalogImport = path.relative(
    root,
    path.join(repositoryRoot, "src", "dubbing", "rhyme-catalog.ts"),
  ).replaceAll(path.sep, "/");
  await writeFile(
    generatedPath,
    serializeGeneratedCatalog([compiledLiterals[6]]),
  );
  await writeFile(
    typecheckPath,
    [
      `import { normalizeGeneratedDubDefinitions } from "./${catalogImport}";`,
      'import { GENERATED_DUB_DEFINITIONS } from "./mixed-art-generated.ts";',
      "normalizeGeneratedDubDefinitions(GENERATED_DUB_DEFINITIONS);",
      "",
    ].join("\n"),
  );
  await execFileAsync(process.execPath, [
    path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
    "--allowImportingTsExtensions",
    "--isolatedModules",
    "--lib", "DOM,DOM.Iterable,ES2022",
    "--module", "ESNext",
    "--moduleResolution", "Bundler",
    "--noEmit",
    "--skipLibCheck",
    "--strict",
    "--target", "ES2022",
    typecheckPath,
  ], { cwd: repositoryRoot });

  assert.equal(DUB_DEFINITIONS.length, 6);
  assert.equal(
    typeof normalizeGeneratedDubDefinitions,
    "function",
    "Expected a pure generated-definition normalization seam",
  );
  assert.equal(
    typeof getDubRoutePaths,
    "function",
    "Expected learner routes to be derived from supplied definitions",
  );
  const definitions = normalizeGeneratedDubDefinitions(compiledLiterals);
  assert.equal(definitions[0].lineArtwork, null);
  const seventh = definitions[6];
  assert.equal(Object.isFrozen(seventh.lineArtwork), true);
  assert.equal(Object.isFrozen(seventh.lineArtwork[0]), true);
  assert.equal(seventh.lineArtwork[1], null);

  const firstLineScene = renderToStaticMarkup(
    createElement(IllustratedDubScene, {
      definition: seventh,
      line: seventh.lines[0],
    }),
  );
  assert.match(firstLineScene, /A small golden bell rings beside a sunny window\./);
  const secondLineScene = renderToStaticMarkup(
    createElement(IllustratedDubScene, {
      definition: seventh,
      line: seventh.lines[1],
    }),
  );
  assert.match(secondLineScene, /A bright bell rings in the sunshine\./);

  const shelf = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dubs"] },
      createElement(NurseryRhymeList, { definitions }),
    ),
  );
  assert.match(shelf, /One Little Bell/);
  assert.match(shelf, /href="\/dubs\/one-little-bell"/);
  assert.equal(getDubRoutePaths(definitions)[6], "/dubs/one-little-bell");

  const route = parseDubRoute(
    "/api/dubs/one-little-bell-v1/lines/one-little-bell-v1-line-2",
    definitions,
  );
  assert.equal(route?.definition, seventh);
  assert.equal(route?.lineId, "one-little-bell-v1-line-2");

  const storage = createDubStorageKeys({
    learnerProfileId: "learner-1",
    legacyStorageOwner: false,
    userId: "user-1",
  }, "one-little-bell-v1");
  assert.deepEqual(dubStorageClosureKeys(storage, definitions), {
    markerKeys: [
      "personalized-story-art/user-1/learners/learner-1/learner-dubs/one-little-bell-v1/.dub-generation",
    ],
    slotKeys: [
      "personalized-story-art/user-1/learners/learner-1/learner-dubs/one-little-bell-v1/one-little-bell-v1-line-1.audio",
      "personalized-story-art/user-1/learners/learner-1/learner-dubs/one-little-bell-v1/one-little-bell-v1-line-2.audio",
    ],
  });
});
