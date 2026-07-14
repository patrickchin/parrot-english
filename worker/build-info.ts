import { desc, sql } from "drizzle-orm";
import { conversationSession } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import { LESSON_GENERATOR_MODEL } from "./model-config.ts";

const MAX_BUILD_VALUE_LENGTH = 120;
const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const VERSION_TAG_PATTERN =
  /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-([0-9a-f]{7,40})$/i;

export interface BuildInfoEnv {
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  PARROT_BACKEND_COMMIT_SHA?: string;
  PARROT_BACKEND_VERSION?: string;
}

type StoredAgentBuild = {
  commitSha: string;
  details: {
    models: {
      llm: string;
      stt: string;
      tts: string;
    };
  };
  reportedAt: string;
  version: string;
};

function isBoundedString(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_BUILD_VALUE_LENGTH
  );
}

function parseAgentBuild(serialized: string): StoredAgentBuild | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const buildInfo = (value as Record<string, unknown>)._buildInfo;
  if (
    buildInfo === null ||
    typeof buildInfo !== "object" ||
    Array.isArray(buildInfo)
  ) {
    return null;
  }
  const agent = (buildInfo as Record<string, unknown>).agent;
  if (agent === null || typeof agent !== "object" || Array.isArray(agent)) {
    return null;
  }
  const report = agent as Record<string, unknown>;
  const details = report.details;
  if (details === null || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const models = (details as Record<string, unknown>).models;
  if (models === null || typeof models !== "object" || Array.isArray(models)) {
    return null;
  }
  const modelValues = models as Record<string, unknown>;
  if (
    !isBoundedString(report.version) ||
    !isBoundedString(report.commitSha) ||
    !isBoundedString(report.reportedAt) ||
    !isBoundedString(modelValues.llm) ||
    !isBoundedString(modelValues.stt) ||
    !isBoundedString(modelValues.tts)
  ) {
    return null;
  }

  return {
    commitSha: (report.commitSha as string).trim(),
    details: {
      models: {
        llm: (modelValues.llm as string).trim(),
        stt: (modelValues.stt as string).trim(),
        tts: (modelValues.tts as string).trim(),
      },
    },
    reportedAt: (report.reportedAt as string).trim(),
    version: (report.version as string).trim(),
  };
}

function noStoreJson(value: unknown, status = 200) {
  return Response.json(value, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function deployedBackendBuild(env: BuildInfoEnv) {
  const configuredCommit = env.PARROT_BACKEND_COMMIT_SHA?.trim() ?? "";
  const configuredVersion = env.PARROT_BACKEND_VERSION?.trim() ?? "";
  const tag = env.CF_VERSION_METADATA?.tag?.trim() ?? "";
  const tagMatch = tag.match(VERSION_TAG_PATTERN);
  const tagVersion = tagMatch?.[1] ?? "";
  const tagCommit = tagMatch?.[2]?.toLowerCase() ?? "";

  return {
    commitSha: GIT_SHA_PATTERN.test(configuredCommit)
      ? configuredCommit.toLowerCase()
      : tagCommit || (GIT_SHA_PATTERN.test(tag) ? tag.toLowerCase() : "local"),
    version: SEMVER_PATTERN.test(configuredVersion)
      ? configuredVersion
      : tagVersion || "local",
  };
}

export async function handleBuildInfoRequest({
  database,
  env,
  request,
}: {
  database: Database;
  env: BuildInfoEnv;
  request: Request;
}) {
  const url = new URL(request.url);

  if (url.pathname === "/api/build-info" && request.method === "GET") {
    const backendBuild = deployedBackendBuild(env);
    const [latestAgentState] = await database
      .select({ controllerState: conversationSession.controllerState })
      .from(conversationSession)
      .where(
        sql`json_type(${conversationSession.controllerState}, '$._buildInfo.agent') = 'object'`,
      )
      .orderBy(desc(conversationSession.updatedAt))
      .limit(1);
    const agent = latestAgentState
      ? parseAgentBuild(latestAgentState.controllerState)
      : null;
    return noStoreJson({
      backend: {
        commitSha: backendBuild.commitSha,
        details: {
          models: {
            lessonScript: LESSON_GENERATOR_MODEL,
          },
        },
        deploymentId: env.CF_VERSION_METADATA?.id ?? "local",
        deployedAt: env.CF_VERSION_METADATA?.timestamp ?? null,
        version: backendBuild.version,
      },
      components: agent
        ? [{ ...agent, component: "conversation-agent" }]
        : [],
    });
  }

  return noStoreJson({ error: "method_not_allowed" }, 405);
}
