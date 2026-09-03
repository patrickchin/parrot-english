import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import type {
  ConversationScenarioDescriptor,
  ConversationSession,
  ConversationStartResponse,
  ConversationTurn,
} from "./src/conversation/conversation-api.ts";
import type {
  FullLearnerProfileState,
  LearnerProfileSummary,
  ProfileState,
} from "./src/learner-profile/learner-profile-api.ts";

type PackageManifest = {
  version?: string;
};

const E2E_TIMESTAMP = "2026-07-10T08:00:00.000Z";

const E2E_PROFILE = {
  id: "e2e-learner",
  name: "Mia",
  age: 8,
  description: null,
  answers: {
    description: null,
    schemaVersion: 2,
    questionnaireVersion: 2,
    responses: {},
  },
  currentQuestionKey: null,
  profileStatus: "completed",
  completedAt: E2E_TIMESTAMP,
  storyLevel: "first-words",
} satisfies LearnerProfileSummary;

const E2E_LEARNER_PROFILE_STATE = {
  mode: "full",
  profile: E2E_PROFILE,
  question: null,
  progress: { answered: 2, current: 2, total: 2 },
  canBypass: true,
} satisfies FullLearnerProfileState;

const E2E_GUARDIAN_PROFILE_STATE = {
  profile: {
    ...E2E_PROFILE,
    lessonRecordingCleanupPending: false,
    lessonRecordingConsent: false,
  },
  questions: [],
} satisfies ProfileState;

const E2E_CONVERSATION = {
  id: "e2e-conversation",
  authUserId: "e2e-user",
  scenarioKey: "onboarding",
  scenarioVersion: 1,
  promptStyle: null,
  roomName: "e2e-room",
  status: "starting",
  finishReason: null,
  controllerState: {},
  startedAt: E2E_TIMESTAMP,
  endedAt: null,
  createdAt: E2E_TIMESTAMP,
  updatedAt: E2E_TIMESTAMP,
} satisfies ConversationSession;

const E2E_CONVERSATION_SCENARIO = {
  key: "onboarding",
  version: 1,
  requiredDetails: ["name", "age"],
  summaryMode: "prose",
  maxOptionalExchanges: 3,
} satisfies ConversationScenarioDescriptor;

const E2E_CONVERSATION_START_RESPONSE = {
  conversation: E2E_CONVERSATION,
  livekit: {
    participantToken: "parrot-e2e-participant-token",
    url: "wss://parrot-e2e.invalid",
  },
  scenario: E2E_CONVERSATION_SCENARIO,
} satisfies ConversationStartResponse;

const E2E_CONVERSATION_TURN = {
  id: "e2e-agent-greeting",
  conversationId: E2E_CONVERSATION.id,
  providerItemId: "e2e-agent-greeting-provider-item",
  sequence: 0,
  role: "assistant",
  text: "Lovely chat! I'll remember that.",
  language: "en",
  inputMode: "voice",
  interrupted: false,
  startedAt: E2E_TIMESTAMP,
  endedAt: E2E_TIMESTAMP,
  createdAt: E2E_TIMESTAMP,
} satisfies ConversationTurn;

const E2E_ACTIVE_CONVERSATION = {
  ...E2E_CONVERSATION,
  status: "active",
  turns: [E2E_CONVERSATION_TURN],
} satisfies ConversationSession;

const E2E_STOPPED_CONVERSATION = {
  ...E2E_CONVERSATION,
  status: "stopped",
  finishReason: "finished_by_learner",
  endedAt: E2E_TIMESTAMP,
} satisfies ConversationSession;

function sendMockJson(response: ServerResponse, payload: unknown, status = 200) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("X-Parrot-Mock-Api", "true");
  response.end(JSON.stringify(payload));
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
              name: "Alex Guardian",
              email: "alex@example.test",
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

        if (
          pathname === `/api/learner-profiles/${E2E_PROFILE.id}` &&
          request.method === "GET"
        ) {
          sendMockJson(response, E2E_GUARDIAN_PROFILE_STATE);
          return;
        }

        if (pathname === "/api/build-info" && request.method === "GET") {
          sendMockJson(response, {
            backend: {
              commitSha: "e2e-api",
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
          sendMockJson(response, E2E_CONVERSATION_START_RESPONSE, 201);
          return;
        }

        if (
          pathname === "/api/conversations/e2e-conversation" &&
          request.method === "GET"
        ) {
          sendMockJson(response, {
            conversation: E2E_ACTIVE_CONVERSATION,
          });
          return;
        }

        if (
          pathname === "/api/conversations/e2e-conversation/finish" &&
          request.method === "POST"
        ) {
          sendMockJson(response, {
            conversation: E2E_STOPPED_CONVERSATION,
          });
          return;
        }

        if (
          pathname === "/api/conversations/e2e-conversation/review" &&
          request.method === "PUT"
        ) {
          sendMockJson(response, {
            bypassed: false,
            conversationId: "e2e-conversation",
            profileCompleted: true,
          });
          return;
        }

        next();
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
    rolldownOptions: {
      output: {
        codeSplitting: true,
      },
    },
  },
});
