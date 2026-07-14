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
const E2E_TIMESTAMP = "2026-07-10T08:00:00.000Z";

const E2E_PROFILE = {
  name: "Mia",
  age: 8,
  answers: {
    schemaVersion: 2,
    questionnaireVersion: 2,
    responses: {},
    legacyAnswers: null,
  },
  questionnaireVersion: 2,
  currentQuestionKey: null,
  profileStatus: "completed",
  completedAt: E2E_TIMESTAMP,
};

const E2E_LEARNER_PROFILE_STATE = {
  mode: "full",
  experienceMode: "realtime",
  profile: E2E_PROFILE,
  questionnaire: { version: 2 },
  question: null,
  progress: { answered: 2, current: 2, total: 2 },
  canBypass: true,
};

function sendMockJson(response: ServerResponse, payload: unknown, status = 200) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("X-Parrot-Mock-Api", "true");
  response.end(JSON.stringify(payload));
}

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
    feedbackText: "Great job! Let's continue.",
    retryAllowed: false,
  },
  incorrect: {
    transcript: "yellow ball",
    similarity: 0.25,
    passed: false,
    feedbackText: "Almost! Listen to Dolly and try again.",
    retryAllowed: true,
  },
  "no-speech": {
    transcript: "",
    similarity: 0,
    passed: false,
    feedbackText: "I couldn't hear you. Let's slow down and try again.",
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
  if (process.env.PARROT_FRONTEND_VERSION?.trim()) {
    return process.env.PARROT_FRONTEND_VERSION.trim();
  }
  const [major = "0", minor = "0"] = readPackageVersion().split(".");
  const commitCount = readGitValue("git rev-list --count HEAD", "0").replace(
    /\D/g,
    ""
  );

  return `${major}.${minor}.${commitCount || "0"}`;
}

function getShortCommitSha() {
  return (
    process.env.PARROT_FRONTEND_COMMIT_SHA?.trim() ||
    process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ||
    process.env.GITHUB_SHA?.slice(0, 7) ||
    readGitValue("git rev-parse --short=7 HEAD", "local")
  );
}

function parrotE2eMockApi(): Plugin {
  return {
    name: "parrot-e2e-mock-api",
    configureServer(server) {
      if (process.env.PARROT_E2E_MOCK_API !== "1") return;

      server.middlewares.use((request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://parrot-e2e.invalid",
        ).pathname;

        if (pathname === "/api/auth/get-session" && request.method === "GET") {
          sendMockJson(response, {
            session: {
              id: "e2e-session",
              userId: "e2e-user",
              token: "e2e-token",
              expiresAt: "2099-01-01T00:00:00.000Z",
              createdAt: E2E_TIMESTAMP,
              updatedAt: E2E_TIMESTAMP,
              ipAddress: null,
              userAgent: "Maestro",
            },
            user: {
              id: "e2e-user",
              name: "Mia",
              email: "mia@example.test",
              emailVerified: true,
              createdAt: E2E_TIMESTAMP,
              updatedAt: E2E_TIMESTAMP,
            },
          });
          return;
        }

        if (pathname === "/api/learner-profile" && request.method === "GET") {
          sendMockJson(response, E2E_LEARNER_PROFILE_STATE);
          return;
        }

        if (pathname === "/api/profile" && request.method === "GET") {
          sendMockJson(response, { profile: E2E_PROFILE, questions: [] });
          return;
        }

        if (pathname === "/api/build-info" && request.method === "GET") {
          sendMockJson(response, {
            backend: {
              commitSha: "e2e-api",
              details: {
                models: {
                  lessonScript: "openai/gpt-5.6-luna",
                },
              },
              deployedAt: "2026-07-14T01:02:03.000Z",
              deploymentId: "e2e-deployment",
              version: "0.1.e2e",
            },
            components: [
              {
                commitSha: "e2e-agent",
                component: "conversation-agent",
                details: {
                  models: {
                    realtime: "gpt-realtime-2.1-mini",
                    transcription: "gpt-4o-mini-transcribe",
                  },
                },
                reportedAt: "2026-07-14T01:04:05.000Z",
                version: "0.1.e2e",
              },
            ],
          });
          return;
        }

        if (pathname === "/api/conversations" && request.method === "POST") {
          sendMockJson(
            response,
            {
              conversation: {
                id: "e2e-conversation",
                authUserId: "e2e-user",
                scenarioKey: "onboarding",
                scenarioVersion: 1,
                roomName: "e2e-room",
                status: "starting",
                finishReason: null,
                controllerState: {},
                startedAt: E2E_TIMESTAMP,
                endedAt: null,
                createdAt: E2E_TIMESTAMP,
                updatedAt: E2E_TIMESTAMP,
              },
              livekit: {
                participantToken: "parrot-e2e-participant-token",
                url: "wss://parrot-e2e.invalid",
              },
              scenario: {
                key: "onboarding",
                version: 1,
                requiredDetails: ["name", "age"],
                summaryMode: "prose",
                maxOptionalExchanges: 3,
              },
            },
            201,
          );
          return;
        }

        next();
      });

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
