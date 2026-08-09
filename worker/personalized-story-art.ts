import type { Database } from "./database.ts";
import {
  createPersonalizedStoryArtImage,
  detectRasterFormat,
  PersonalizedStoryArtImageError,
  ensureFile,
} from "./personalized-story-art-image.ts";
import { createPersonalizedStoryArtRepository } from "./personalized-story-art-repository.ts";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const CURRENT_GUARDIAN_CONSENT_VERSION = "2026-08-09";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024;
const PROVIDER = "cloudflare-workers-ai";
const STORED_IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const STORY_CONFIG = {
  "the-red-ball": {
    alt: "You holding a bright red ball",
    pageId: "my-red-ball",
    prompt:
      "Use image 0 for the exact composition and hand-painted style. Use image 1 only as the learner reference. Replace only the child with the learner. Preserve the red ball, action, background, and 3:2 crop. Soft hand-painted watercolor. No photo texture, no text, no logos, no extra people.",
    promptVersion: "red-ball-v1",
    sceneAssetPath: "/assets/personalization/the-red-ball-scene-reference.webp",
  },
} as const;

type StoryConfig = (typeof STORY_CONFIG)[keyof typeof STORY_CONFIG];

type AssetFetcher = {
  fetch(request: Request): Promise<Response>;
};

export type PersonalizedStoryArtEnv = {
  AI: Ai;
  ASSETS: AssetFetcher;
  DB: D1Database;
  PERSONALIZED_STORY_ART_BUCKET: R2Bucket;
  PERSONALIZED_STORY_ART_DATA_APPROVED?: string;
  PERSONALIZED_STORY_ART_ENABLED?: string;
};

export type PersonalizedStoryArtRequestInput = {
  database: Database;
  env: PersonalizedStoryArtEnv;
  identity: {
    sessionId: string;
    userId: string;
    userName: string | null;
  };
  request: Request;
};

type StoredImage = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
};

type HandlerDependencies = {
  createId: () => string;
  generateImage: (input: {
    prompt: string;
    sceneImage: File;
    sourceImage: File;
    storyId: string;
  }) => Promise<StoredImage>;
  now: () => Date;
  onAfterDeleteRow?: () => void;
};

class PersonalizedStoryArtApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.code = code;
    this.name = "PersonalizedStoryArtApiError";
    this.status = status;
  }
}

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

function isFeatureEnabled(env: PersonalizedStoryArtEnv) {
  return (
    env.PERSONALIZED_STORY_ART_ENABLED === "1" &&
    env.PERSONALIZED_STORY_ART_DATA_APPROVED === "1"
  );
}

function storyConfig(storyId: string): StoryConfig | null {
  return STORY_CONFIG[storyId as keyof typeof STORY_CONFIG] ?? null;
}

function metadataPayload(
  enabled: boolean,
  row:
    | {
        storyId: string;
        status: string;
        updatedAt: Date;
      }
    | null
    | undefined,
) {
  if (!row) {
    return {
      enabled,
      guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
      hasStoredArt: false,
      stories: {},
      updatedAt: null,
    };
  }
  const config = storyConfig(row.storyId);
  if (!config) {
    return {
      enabled,
      guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
      hasStoredArt: true,
      stories: {},
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  return {
    enabled,
    guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
    hasStoredArt: true,
    stories:
      enabled && row.status === "ready"
        ? {
            [row.storyId]: {
              pages: {
                [config.pageId]: {
                  alt: config.alt,
                  src: `/api/stories/${row.storyId}/personalized-art/asset`,
                },
              },
            },
          }
        : {},
    updatedAt: row.updatedAt.toISOString(),
  };
}

function objectKey(userId: string, storyId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/${encodeURIComponent(storyId)}/current`;
}

function parseStoryRoute(pathname: string) {
  const match = pathname.match(
    /^\/api\/stories\/([^/]+)\/personalized-art(?:\/(asset))?$/,
  );
  if (!match) return null;
  let storyId;
  try {
    storyId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return {
    asset: match[2] === "asset",
    storyId,
  };
}

async function loadSceneReference(env: PersonalizedStoryArtEnv, config: StoryConfig) {
  const response = await env.ASSETS.fetch(
    new Request(`https://assets.example${config.sceneAssetPath}`),
  );
  if (!response.ok) {
    throw new PersonalizedStoryArtApiError(
      502,
      "scene_reference_unavailable",
      "The scene reference could not be loaded.",
    );
  }
  const contentType = response.headers.get("Content-Type")?.split(";", 1)[0] ?? "image/webp";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new File([bytes], "scene-reference.webp", { type: contentType });
}

async function readUploadForm(request: Request) {
  try {
    return await readBoundedFormData(request, MAX_MULTIPART_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new PersonalizedStoryArtApiError(413, "payload_too_large");
    }
    throw error;
  }
}

function consentAccepted(formData: FormData) {
  const value = String(formData.get("guardianConsentAccepted") ?? "").trim().toLowerCase();
  return value === "yes" || value === "true" || value === "1";
}

function isTooLargeSource(file: File) {
  return file.size >= MAX_UPLOAD_BYTES;
}

function validateGeneratedImage(image: StoredImage) {
  const detectedContentType = detectRasterFormat(image.bytes);
  const expectedExtension =
    detectedContentType &&
    STORED_IMAGE_EXTENSIONS[
      detectedContentType as keyof typeof STORED_IMAGE_EXTENSIONS
    ];
  if (
    image.bytes.byteLength > MAX_GENERATED_IMAGE_BYTES ||
    !detectedContentType ||
    image.contentType !== detectedContentType ||
    image.extension !== expectedExtension
  ) {
    throw new PersonalizedStoryArtApiError(
      502,
      "generation_failed",
      "The image service returned an invalid response.",
    );
  }
}

function currentReadyRow<Row extends { status: string }>(row: Row | null) {
  return row && row.status === "ready" ? row : null;
}

function contentTypeFromObject(
  object: Response | R2ObjectBody,
  fallback: string,
) {
  if (object instanceof Response) {
    return object.headers.get("Content-Type")?.split(";", 1)[0] ?? fallback;
  }

  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }
  return headers.get("Content-Type")?.split(";", 1)[0] ?? fallback;
}

function binaryBodyFromR2Object(
  object: Response | R2ObjectBody,
  contentType: string,
) {
  const resolvedContentType = contentTypeFromObject(object, contentType);
  if (object instanceof Response) {
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": resolvedContentType,
        "X-Content-Type-Options": "nosniff",
      },
      status: 200,
    });
  }

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": resolvedContentType,
    "X-Content-Type-Options": "nosniff",
  });
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", resolvedContentType);
  }
  return new Response(object.body, { headers, status: 200 });
}

export async function handlePersonalizedStoryArtRequest(
  input: PersonalizedStoryArtRequestInput,
  overrides: Partial<HandlerDependencies> = {},
) {
  const url = new URL(input.request.url);
  const route = parseStoryRoute(url.pathname);
  const repository = createPersonalizedStoryArtRepository(input.database, {
    createId: overrides.createId,
    now: overrides.now,
  });
  const now = overrides.now ?? (() => new Date());
  const generateImage =
    overrides.generateImage ??
    (async ({
      prompt,
      sceneImage,
      sourceImage,
    }: {
      prompt: string;
      sceneImage: File;
      sourceImage: File;
      storyId: string;
    }) =>
      createPersonalizedStoryArtImage({
        ai: input.env.AI,
        prompt,
        sceneImage,
        sourceImage,
      }));

  try {
    if (!route) throw new PersonalizedStoryArtApiError(404, "not_found");
    const config = storyConfig(route.storyId);
    if (!config) throw new PersonalizedStoryArtApiError(404, "not_found");

    if (!isFeatureEnabled(input.env)) {
      if (input.request.method === "GET" && !route.asset) {
        return json(
          metadataPayload(
            false,
            await repository.findOwnedStory(input.identity.userId, route.storyId),
          ),
        );
      }
      if (input.request.method === "DELETE" && !route.asset) {
        const row = await repository.markDeleting(input.identity.userId, route.storyId);
        if (!row) {
          return new Response(null, {
            headers: { "Cache-Control": "no-store" },
            status: 204,
          });
        }
        try {
          await input.env.PERSONALIZED_STORY_ART_BUCKET.delete(row.r2ObjectKey);
        } catch {
          return json({ error: "storage_delete_failed" }, { status: 502 });
        }
        await repository.deleteByIdIfDeleting(row.id);
        overrides.onAfterDeleteRow?.();
        return new Response(null, {
          headers: { "Cache-Control": "no-store" },
          status: 204,
        });
      }
      throw new PersonalizedStoryArtApiError(404, "feature_disabled");
    }

    if (input.request.method === "GET" && !route.asset) {
      return json(
        metadataPayload(
          true,
          await repository.findOwnedStory(input.identity.userId, route.storyId),
        ),
      );
    }

    if (input.request.method === "GET" && route.asset) {
      const row = currentReadyRow(
        await repository.findOwnedStory(input.identity.userId, route.storyId),
      );
      if (!row) throw new PersonalizedStoryArtApiError(404, "not_found");
      const object = await input.env.PERSONALIZED_STORY_ART_BUCKET.get(row.r2ObjectKey);
      if (!object) throw new PersonalizedStoryArtApiError(404, "not_found");
      return binaryBodyFromR2Object(object, row.contentType);
    }

    if (input.request.method === "POST" && !route.asset) {
      const formData = await readUploadForm(input.request);
      if (
        !consentAccepted(formData) ||
        String(formData.get("guardianConsentVersion") ?? "").trim() !==
          CURRENT_GUARDIAN_CONSENT_VERSION
      ) {
        throw new PersonalizedStoryArtApiError(400, "guardian_consent_required");
      }
      const sourceImage = ensureFile(formData.get("source"), "source");
      if (isTooLargeSource(sourceImage)) {
        throw new PersonalizedStoryArtApiError(413, "payload_too_large");
      }
      const existingRow = await repository.findOwnedStory(
        input.identity.userId,
        route.storyId,
      );
      if (existingRow?.status === "deleting") {
        throw new PersonalizedStoryArtApiError(
          409,
          "deletion_pending",
          "Finish deleting the previous story art before generating it again.",
        );
      }
      const generated = await generateImage({
        prompt: config.prompt,
        sceneImage:
          overrides.generateImage
            ? new File([], "scene-placeholder.webp", { type: "image/webp" })
            : await loadSceneReference(input.env, config),
        sourceImage,
        storyId: route.storyId,
      });
      validateGeneratedImage(generated);
      const key = objectKey(input.identity.userId, route.storyId);
      await input.env.PERSONALIZED_STORY_ART_BUCKET.put(key, generated.bytes, {
        customMetadata: {
          guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
        },
        httpMetadata: {
          contentType: generated.contentType,
        },
      });
      let row;
      try {
        row = await repository.saveReady(input.identity.userId, route.storyId, {
          contentType: generated.contentType,
          guardianConsentAt: now(),
          guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
          promptVersion: config.promptVersion,
          provider: PROVIDER,
          r2ObjectKey: key,
        });
      } catch (error) {
        if (!existingRow) {
          try {
            await input.env.PERSONALIZED_STORY_ART_BUCKET.delete(key);
          } catch {
            // Best effort only; the original request error should be preserved.
          }
        }
        throw error;
      }
      return json(metadataPayload(true, row), { status: 201 });
    }

    if (input.request.method === "DELETE" && !route.asset) {
      const row = await repository.markDeleting(input.identity.userId, route.storyId);
      if (!row) {
        return new Response(null, {
          headers: { "Cache-Control": "no-store" },
          status: 204,
        });
      }
      try {
        await input.env.PERSONALIZED_STORY_ART_BUCKET.delete(row.r2ObjectKey);
      } catch {
        return json({ error: "storage_delete_failed" }, { status: 502 });
      }
      await repository.deleteByIdIfDeleting(row.id);
      overrides.onAfterDeleteRow?.();
      return new Response(null, {
        headers: { "Cache-Control": "no-store" },
        status: 204,
      });
    }

    throw new PersonalizedStoryArtApiError(404, "not_found");
  } catch (error) {
    if (error instanceof PersonalizedStoryArtApiError) {
      return json(
        {
          error: error.code,
          ...(error.message !== error.code ? { message: error.message } : {}),
        },
        { status: error.status },
      );
    }
    if (error instanceof PersonalizedStoryArtImageError) {
      return json(
        {
          error: error.code,
          ...(error.message !== error.code ? { message: error.message } : {}),
        },
        { status: error.status },
      );
    }
    return json(
      {
        error: "internal_error",
        message: "The personalized story art request failed.",
      },
      { status: 500 },
    );
  }
}
