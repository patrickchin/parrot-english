#!/usr/bin/env node

/* global process */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

const DEFAULT_BASE_URL = "http://127.0.0.1:4174";
const READY_TIMEOUT_MS = 30_000;
const MOVE_DISTANCE = 150;
const MOVE_NUDGES = 9;
const CAPTURE_TIMESTAMP = "2026-07-10T08:00:00.000Z";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(
  projectRoot,
  "artifacts",
  "pixel-world",
  "final",
);

const deterministicCss = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }
`;

const viewportMatrix = [
  {
    heldItem: "red apple",
    label: "original",
    parallax: "camera",
    scene: { id: "garden-party", name: "Garden Party" },
    viewport: { height: 822, width: 1024 },
  },
  {
    heldItem: "paint brush",
    label: "desktop",
    parallax: "camera",
    scene: { id: "market-morning", name: "Market Morning" },
    viewport: { height: 720, width: 1280 },
  },
  {
    heldItem: "green pear",
    label: "desktop-orchard",
    parallax: "camera",
    scene: { id: "orchard-walk", name: "Orchard Walk" },
    viewport: { height: 900, width: 1280 },
  },
  {
    heldItem: "teddy bear",
    label: "desktop-playground",
    parallax: "camera",
    scene: { id: "playground-afternoon", name: "Playground Afternoon" },
    viewport: { height: 900, width: 1280 },
  },
  {
    heldItem: "garden shovel",
    label: "desktop-forest",
    parallax: "camera",
    scene: { id: "forest-trail", name: "Forest Trail" },
    viewport: { height: 900, width: 1280 },
  },
  {
    heldItem: "kite",
    label: "desktop-meadow",
    parallax: "camera",
    scene: { id: "kite-meadow", name: "Kite Meadow" },
    viewport: { height: 900, width: 1280 },
  },
  {
    heldItem: "storybook",
    label: "mobile",
    parallax: "off",
    scene: { id: "pond-picnic", name: "Pond Picnic" },
    viewport: { height: 844, width: 390 },
  },
  {
    heldItem: "lantern",
    label: "wide",
    parallax: "camera",
    scene: { id: "village-sunset", name: "Village Sunset" },
    viewport: { height: 1080, width: 1920 },
  },
];

const parallaxMatrix = ["off", "camera"].map((parallax) => ({
  heldItem: "paint brush",
  label: "parallax-review",
  moveRight: true,
  parallax,
  scene: { id: "garden-party", name: "Garden Party" },
  viewport: { height: 900, width: 1280 },
}));

const captureSession = {
  session: {
    createdAt: CAPTURE_TIMESTAMP,
    expiresAt: "2099-01-01T00:00:00.000Z",
    id: "pixel-world-capture-session",
    ipAddress: null,
    token: "pixel-world-capture-token",
    updatedAt: CAPTURE_TIMESTAMP,
    userAgent: "Playwright pixel world capture",
    userId: "pixel-world-capture-user",
  },
  user: {
    createdAt: CAPTURE_TIMESTAMP,
    email: "mia@example.test",
    emailVerified: true,
    id: "pixel-world-capture-user",
    name: "Mia",
    updatedAt: CAPTURE_TIMESTAMP,
  },
};

const captureLearnerProfile = {
  canBypass: true,
  experienceMode: "realtime",
  mode: "full",
  profile: {
    age: 8,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt: CAPTURE_TIMESTAMP,
    currentQuestionKey: null,
    name: "Mia",
    profileStatus: "completed",
    questionnaireVersion: 2,
  },
  progress: { answered: 2, current: 2, total: 2 },
  question: null,
  questionnaire: { version: 2 },
};

function slug(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function explorerUrl() {
  const baseUrl = new globalThis.URL(
    process.env.PIXEL_WORLD_CAPTURE_URL ?? DEFAULT_BASE_URL,
  );
  return new globalThis.URL("/games/worlds", baseUrl).href;
}

async function settleRendering(page, frameCount = 2) {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const advance = () => {
          if (frames <= 0) {
            resolve();
            return;
          }
          frames -= 1;
          globalThis.requestAnimationFrame(advance);
        };
        advance();
      }),
    frameCount,
  );
}

async function installCaptureApiMocks(page) {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({ json: captureSession, status: 200 });
  });
  await page.route("**/api/learner-profile", async (route) => {
    await route.fulfill({ json: captureLearnerProfile, status: 200 });
  });
}

async function waitForWorldState(world, expected, message) {
  await expect
    .poll(
      async () => {
        const state = await world.evaluate((element) => ({
          heldItem: element.dataset.heldItem,
          parallaxMode: element.dataset.parallaxMode,
          ready: element.dataset.ready,
          sceneId: element.dataset.sceneId,
        }));
        return Object.entries(expected).every(
          ([key, value]) => state[key] === value,
        );
      },
      { message, timeout: READY_TIMEOUT_MS },
    )
    .toBe(true);
}

async function openExplorer(page) {
  await page.goto(explorerUrl(), {
    timeout: READY_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
  await page.addStyleTag({ content: deterministicCss });
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });

  await expect(
    page.getByRole("heading", { name: "Pixel World Explorer" }),
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });

  const world = page.getByRole("group", {
    name: "Pixel world explorer game world",
  });
  await waitForWorldState(
    world,
    { ready: "true" },
    "Wait for the pixel world engine to become ready",
  );
  await expect(world).toHaveAttribute("data-reduced-motion", "false");
  await page.evaluate(() => globalThis.document.fonts.ready);
  await settleRendering(page);
  return world;
}

async function chooseState(page, world, scenario) {
  const sceneChooser = page.getByRole("region", { name: "Scene chooser" });
  const itemChooser = page.getByRole("region", {
    name: "Holdable item chooser",
  });
  const parallaxControls = page.getByRole("region", {
    name: "Parallax controls",
  });

  if ((await world.getAttribute("data-scene-id")) !== scenario.scene.id) {
    await sceneChooser
      .getByRole("button", { exact: true, name: scenario.scene.name })
      .click();
  }
  await waitForWorldState(
    world,
    { ready: "true", sceneId: scenario.scene.id },
    `Wait for ${scenario.scene.name} to become ready`,
  );

  if ((await world.getAttribute("data-parallax-mode")) !== scenario.parallax) {
    const parallaxLabel =
      scenario.parallax === "off" ? "Parallax off" : "Camera parallax";
    await parallaxControls
      .getByRole("button", { exact: true, name: parallaxLabel })
      .click();
  }
  await waitForWorldState(
    world,
    {
      parallaxMode: scenario.parallax,
      ready: "true",
      sceneId: scenario.scene.id,
    },
    `Wait for ${scenario.parallax} parallax to become ready`,
  );

  const heldItemId = slug(scenario.heldItem);
  if ((await world.getAttribute("data-held-item")) !== heldItemId) {
    await itemChooser
      .getByRole("button", { exact: true, name: scenario.heldItem })
      .click();
  }
  await waitForWorldState(
    world,
    {
      heldItem: heldItemId,
      parallaxMode: scenario.parallax,
      ready: "true",
      sceneId: scenario.scene.id,
    },
    `Wait for ${scenario.heldItem} to appear in the selected world state`,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => globalThis.document.fonts.ready);
  await settleRendering(page);
}

async function movePlayerRight(page, world) {
  const startX = Number(await world.getAttribute("data-x"));
  if (!Number.isFinite(startX)) {
    throw new Error("The pixel world did not expose a numeric data-x value.");
  }
  const moveRight = page.getByRole("button", { name: "Move right" });
  await moveRight.scrollIntoViewIfNeeded();
  for (let index = 0; index < MOVE_NUDGES; index += 1) {
    const previousX = Number(await world.getAttribute("data-x"));
    await moveRight.click();
    await expect
      .poll(async () => Number(await world.getAttribute("data-x")), {
        message: `Apply right nudge ${index + 1} of ${MOVE_NUDGES}`,
        timeout: 10_000,
      })
      .toBeGreaterThan(previousX);
    await page.waitForTimeout(180);
  }

  await expect(world).toHaveAttribute("data-frame", "0");
  await settleRendering(page, 12);
  const endX = Number(await world.getAttribute("data-x"));
  if (endX - startX < MOVE_DISTANCE) {
    throw new Error(
      `Player movement was too short: expected ${MOVE_DISTANCE}px, got ${endX - startX}px.`,
    );
  }
  return { endX, startX };
}

function screenshotStem(scenario, suffix) {
  const { height, width } = scenario.viewport;
  const movement = scenario.moveRight ? "-moved-right" : "";
  return [
    scenario.label,
    `${width}x${height}`,
    scenario.scene.id,
    slug(scenario.heldItem),
    `parallax-${scenario.parallax}${movement}`,
    suffix,
  ].join("-");
}

async function captureScenario(browser, scenario) {
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    timezoneId: "UTC",
    viewport: scenario.viewport,
  });
  const page = await context.newPage();
  const writtenFiles = [];

  try {
    await installCaptureApiMocks(page);
    const world = await openExplorer(page);
    await chooseState(page, world, scenario);
    const movement = scenario.moveRight
      ? await movePlayerRight(page, world)
      : null;

    const fullPageName = `${screenshotStem(scenario, "viewport")}.png`;
    const fullPagePath = path.join(outputDirectory, fullPageName);
    await page.screenshot({
      animations: "disabled",
      caret: "hide",
      fullPage: true,
      path: fullPagePath,
      scale: "css",
    });
    writtenFiles.push(fullPageName);

    const reviewStage = page.getByRole("region", {
      name: "Pixel world explorer stage",
    });
    const reviewStageName = `${screenshotStem(scenario, "world-stage")}.png`;
    const reviewStagePath = path.join(outputDirectory, reviewStageName);
    await reviewStage.screenshot({
      animations: "disabled",
      caret: "hide",
      path: reviewStagePath,
      scale: "css",
      style: '[aria-label="Account"] { visibility: hidden !important; }',
    });
    writtenFiles.push(reviewStageName);

    return { movement, writtenFiles };
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const scenario of [...viewportMatrix, ...parallaxMatrix]) {
      results.push({
        result: await captureScenario(browser, scenario),
        scenario,
      });
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(
    `Captured ${results.length * 2} screenshots in ${outputDirectory}:\n`,
  );
  for (const { result } of results) {
    const movement = result.movement
      ? ` (player x ${result.movement.startX} -> ${result.movement.endX})`
      : "";
    for (const filename of result.writtenFiles) {
      process.stdout.write(`- ${filename}${movement}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `Pixel world capture failed. Start the dev server at ${
      process.env.PIXEL_WORLD_CAPTURE_URL ?? DEFAULT_BASE_URL
    } and try again.\n`,
  );
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
