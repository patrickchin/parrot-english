import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "node:process";
import { createServer } from "vite";

export const viteManagedEnvironmentKeys = [
  "NODE_ENV",
  "VITE_USER_NODE_ENV",
  "BROWSER",
  "BROWSER_ARGS",
  "DEBUG",
];

export function snapshotViteEnvironment() {
  return new Map(
    viteManagedEnvironmentKeys.map((key) => [
      key,
      { present: Object.hasOwn(env, key), value: env[key] },
    ]),
  );
}

export function viteEnvironmentMatches(snapshot) {
  return [...snapshot].every(
    ([key, expected]) =>
      Object.hasOwn(env, key) === expected.present &&
      env[key] === expected.value,
  );
}

export function restoreViteEnvironment(snapshot) {
  for (const [key, { present, value }] of snapshot) {
    if (present) env[key] = value;
    else delete env[key];
  }
}

export async function createHermeticViteServer(config) {
  const environmentSnapshot = snapshotViteEnvironment();
  let cacheDir;

  try {
    cacheDir = await mkdtemp(
      path.join(os.tmpdir(), "parrot-hermetic-vite-cache-"),
    );
    const server = await createServer({
      ...config,
      cacheDir,
      configFile: false,
      envDir: false,
      envPrefix: [],
      optimizeDeps: {
        ...config.optimizeDeps,
        include: [],
        noDiscovery: true,
      },
      publicDir: false,
      server: {
        ...config.server,
        middlewareMode: true,
        watch: null,
      },
    });

    return {
      cacheDir,
      server,
      async close() {
        try {
          await server.close();
        } finally {
          await rm(cacheDir, { force: true, recursive: true });
        }
      },
    };
  } catch (error) {
    if (cacheDir) await rm(cacheDir, { force: true, recursive: true });
    throw error;
  } finally {
    restoreViteEnvironment(environmentSnapshot);
  }
}
