import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import type { ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

type MockEvaluationScenario = "correct" | "incorrect" | "no-speech";

type PackageManifest = {
  version?: string;
};

const MOCK_API_DELAY_MS = Number.parseInt(
  process.env.PARROT_E2E_MOCK_API_DELAY_MS ?? "900",
  10
);

const MOCK_EVALUATIONS: Record<
  MockEvaluationScenario,
  {
    transcript: string;
    similarity: number;
    passed: boolean;
    feedbackText: string;
    retryAllowed: boolean;
  }
> = {
  correct: {
    transcript: "Hello, Peppa!",
    similarity: 1,
    passed: true,
    feedbackText: "太棒了！我们继续下一句。",
    retryAllowed: false,
  },
  incorrect: {
    transcript: "yellow ball",
    similarity: 0.25,
    passed: false,
    feedbackText: "差一点点，听多莉慢慢说，再试一次。",
    retryAllowed: true,
  },
  "no-speech": {
    transcript: "",
    similarity: 0,
    passed: false,
    feedbackText: "我没有听清楚，我们慢一点再试一次。",
    retryAllowed: true,
  },
};

function getMockEvaluationScenario(bodyText: string): MockEvaluationScenario {
  if (bodyText.includes("parrot-e2e-audio:incorrect")) return "incorrect";
  if (bodyText.includes("parrot-e2e-audio:no-speech")) return "no-speech";
  if (process.env.PARROT_E2E_SCENARIO === "incorrect") return "incorrect";
  if (process.env.PARROT_E2E_SCENARIO === "no-speech") return "no-speech";

  return "correct";
}

function sendMockEvaluationResponse(
  response: ServerResponse,
  scenario: MockEvaluationScenario
) {
  response.statusCode = 200;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("X-Parrot-Mock-Api", "true");
  response.end(JSON.stringify(MOCK_EVALUATIONS[scenario]));
}

function readPackageVersion() {
  const packageJson = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8")
  ) as PackageManifest;

  return packageJson.version ?? "0.0.0";
}

function readGitValue(command: string, fallback: string) {
  try {
    return (
      execSync(command, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || fallback
    );
  } catch {
    return fallback;
  }
}

function getBuildVersion() {
  const [major = "0", minor = "0"] = readPackageVersion().split(".");
  const commitCount = readGitValue("git rev-list --count HEAD", "0").replace(
    /\D/g,
    ""
  );

  return `${major}.${minor}.${commitCount || "0"}`;
}

function getShortCommitSha() {
  return (
    process.env.GITHUB_SHA?.slice(0, 7) ??
    readGitValue("git rev-parse --short=7 HEAD", "local")
  );
}

function parrotE2eMockApi(): Plugin {
  return {
    name: "parrot-e2e-mock-api",
    configureServer(server) {
      if (process.env.PARROT_E2E_MOCK_API !== "1") return;

      server.middlewares.use("/api/evaluate-speech", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        request.on("end", () => {
          const scenario = getMockEvaluationScenario(
            Buffer.concat(chunks).toString("utf8")
          );

          setTimeout(() => {
            sendMockEvaluationResponse(response, scenario);
          }, Number.isFinite(MOCK_API_DELAY_MS) ? MOCK_API_DELAY_MS : 900);
        });
        request.on("error", () => {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "mock_request_failed" }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), parrotE2eMockApi()],
  define: {
    "import.meta.env.VITE_PARROT_APP_VERSION": JSON.stringify(getBuildVersion()),
    "import.meta.env.VITE_PARROT_COMMIT_SHA": JSON.stringify(getShortCommitSha()),
  },
  build: {
    outDir: "dist",
  },
});
