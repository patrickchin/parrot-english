/* global URL, console, fetch, process, setTimeout */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const defaultPort = Number(process.env.MAESTRO_PORT ?? 5173);
const maestroBin = process.env.MAESTRO_BIN ?? "maestro";
const defaultFlowFiles = [
  ".maestro/lesson-success.yaml",
  ".maestro/lesson-incorrect.yaml",
  ".maestro/lesson-no-speech.yaml",
];

function getFlowFiles() {
  if (process.env.MAESTRO_FLOW) return [process.env.MAESTRO_FLOW];
  if (process.env.MAESTRO_FLOWS) {
    return process.env.MAESTRO_FLOWS.split(",")
      .map((flowFile) => flowFile.trim())
      .filter(Boolean);
  }

  return defaultFlowFiles;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }

  throw new Error(`No available port found from ${startPort} to ${startPort + 19}.`);
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} exited with signal ${signal}.`
            : `${command} exited with code ${code}.`
        )
      );
    });
  });
}

async function main() {
  const port = await findAvailablePort(defaultPort);
  const appUrl = process.env.MAESTRO_APP_URL ?? `http://localhost:${port}`;
  const flowFiles = getFlowFiles();
  const env = {
    ...process.env,
    MAESTRO_APP_URL: appUrl,
    PARROT_E2E_MOCK_API: "1",
    VITE_PARROT_E2E: "1",
  };

  const server = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev:vite", "--", "--port", String(port), "--strictPort"],
    {
      cwd: rootDir,
      env,
      stdio: "inherit",
    }
  );

  const stopServer = () => {
    if (!server.killed) server.kill("SIGTERM");
  };

  process.once("SIGINT", () => {
    stopServer();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopServer();
    process.exit(143);
  });

  try {
    await waitForServer(appUrl);
    for (const flowFile of flowFiles) {
      await run(maestroBin, ["test", flowFile], {
        cwd: rootDir,
        env,
        stdio: "inherit",
      });
    }
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
