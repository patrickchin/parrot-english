import type { Database } from "./database.ts";
import {
  accountDeletionTombstoneKey,
  isAccountDeletionPending,
} from "./account-deletion.ts";
import { createPersonalizedStoryArtGenerationLeaseRepository } from "./personalized-story-art-generation-lease.ts";
import {
  createPersonalizedStoryArtImage,
  detectRasterFormat,
  PersonalizedStoryArtImageError,
  ensureFile,
} from "./personalized-story-art-image.ts";
import { createPersonalizedStoryArtRepository } from "./personalized-story-art-repository.ts";
import {
  readBoundedBytes,
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const CURRENT_GUARDIAN_CONSENT_VERSION = "guardian-photo-cloudflare-v1";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
const MAX_SCENE_REFERENCE_BYTES = 2 * 1024 * 1024;
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
    sceneAssetUrl:
      "https://media.parrotbook.com/assets/v2/personalization/the-red-ball-scene-reference.webp",
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
  createObjectId: () => string;
  fetchMedia: typeof fetch;
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
                  src: `/api/stories/${encodeURIComponent(row.storyId)}/personalized-art/asset?v=${row.updatedAt.getTime()}`,
                },
              },
            },
          }
        : {},
    updatedAt: row.updatedAt.toISOString(),
  };
}

function objectKey(
  userId: string,
  storyId: string,
  objectId: string,
  extension: string,
) {
  return `personalized-story-art/${encodeURIComponent(userId)}/${encodeURIComponent(storyId)}/versions/${encodeURIComponent(objectId)}.${extension}`;
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

async function loadSceneReference(
  fetchMedia: typeof fetch,
  config: StoryConfig,
) {
  try {
    const response = await fetchMedia(new Request(config.sceneAssetUrl));
    if (!response.ok) throw sceneReferenceUnavailableError();
    const contentType = response.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    const extension =
      STORED_IMAGE_EXTENSIONS[
        contentType as keyof typeof STORED_IMAGE_EXTENSIONS
      ];
    if (!contentType || !extension) throw sceneReferenceUnavailableError();

    const bytes = await readBoundedBytes(response, MAX_SCENE_REFERENCE_BYTES);
    if (detectRasterFormat(bytes) !== contentType) {
      throw sceneReferenceUnavailableError();
    }
    return new File([bytes], `scene-reference.${extension}`, {
      type: contentType,
    });
  } catch (error) {
    if (error instanceof PersonalizedStoryArtApiError) throw error;
    throw sceneReferenceUnavailableError();
  }
}

function sceneReferenceUnavailableError() {
  return new PersonalizedStoryArtApiError(
    502,
    "scene_reference_unavailable",
    "The scene reference could not be loaded.",
  );
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

function accountDeletionPendingError() {
  return new PersonalizedStoryArtApiError(
    409,
    "account_deletion_pending",
    "Account deletion is in progress.",
  );
}

function generationInProgressError() {
  return new PersonalizedStoryArtApiError(409, "generation_in_progress");
}

function storageDeleteFailedError() {
  return new PersonalizedStoryArtApiError(502, "storage_delete_failed");
}

async function assertAccountDeletionNotPending(
  database: Database,
  userId: string,
) {
  if (await isAccountDeletionPending(database, userId)) {
    throw accountDeletionPendingError();
  }
}

async function deleteObjectOrThrow(bucket: R2Bucket, key: string) {
  try {
    await bucket.delete(key);
  } catch {
    throw storageDeleteFailedError();
  }
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
    now: overrides.now,
  });
  const leaseRepository =
    createPersonalizedStoryArtGenerationLeaseRepository(input.env.DB);
  const now = overrides.now ?? (() => new Date());
  const createId = overrides.createId ?? (() => crypto.randomUUID());
  const createObjectId =
    overrides.createObjectId ?? (() => crypto.randomUUID());
  const fetchMedia = overrides.fetchMedia ?? globalThis.fetch;
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

  async function recoverExpiredLease(storyId: string) {
    const recoveryToken = crypto.randomUUID();
    const claimed = await leaseRepository.claimExpired(
      input.identity.userId,
      storyId,
      recoveryToken,
      now().getTime(),
    );
    if (!claimed) return;

    const row = await repository.findOwnedStory(input.identity.userId, storyId);
    const cleanupKey =
      claimed.candidateR2ObjectKey &&
      row?.r2ObjectKey === claimed.candidateR2ObjectKey
        ? claimed.previousR2ObjectKey
        : claimed.candidateR2ObjectKey;
    if (cleanupKey && cleanupKey !== row?.r2ObjectKey) {
      await deleteObjectOrThrow(
        input.env.PERSONALIZED_STORY_ART_BUCKET,
        cleanupKey,
      );
    }
    await leaseRepository.release(
      input.identity.userId,
      storyId,
      recoveryToken,
    );
  }

  async function acquireLease(storyId: string) {
    await recoverExpiredLease(storyId);
    const token = crypto.randomUUID();
    const acquired = await leaseRepository.acquire(
      input.identity.userId,
      storyId,
      token,
      now().getTime(),
    );
    if (!acquired) throw generationInProgressError();
    return token;
  }

  async function releaseLease(storyId: string, token: string) {
    await leaseRepository.release(input.identity.userId, storyId, token);
  }

  async function cleanupCandidateAndRelease(
    storyId: string,
    token: string,
    candidateKey: string,
  ) {
    await deleteObjectOrThrow(
      input.env.PERSONALIZED_STORY_ART_BUCKET,
      candidateKey,
    );
    await releaseLease(storyId, token);
  }

  async function deleteOwnedArt(storyId: string) {
    const token = await acquireLease(storyId);
    try {
      const row = await repository.markDeleting(
        input.identity.userId,
        storyId,
      );
      if (!row) {
        return new Response(null, {
          headers: { "Cache-Control": "no-store" },
          status: 204,
        });
      }
      await deleteObjectOrThrow(
        input.env.PERSONALIZED_STORY_ART_BUCKET,
        row.r2ObjectKey,
      );
      await repository.deleteByIdIfDeleting(row.id);
      overrides.onAfterDeleteRow?.();
      return new Response(null, {
        headers: { "Cache-Control": "no-store" },
        status: 204,
      });
    } finally {
      await releaseLease(storyId, token);
    }
  }

  try {
    if (!route) throw new PersonalizedStoryArtApiError(404, "not_found");
    const config = storyConfig(route.storyId);
    if (!config) throw new PersonalizedStoryArtApiError(404, "not_found");

    if (
      (input.request.method === "GET" || input.request.method === "POST") &&
      (await isAccountDeletionPending(
        input.database,
        input.identity.userId,
      ))
    ) {
      if (input.request.method === "GET" && !route.asset) {
        return json(
          metadataPayload(
            false,
            await repository.findOwnedStory(
              input.identity.userId,
              route.storyId,
            ),
          ),
        );
      }
      if (input.request.method === "GET" && route.asset) {
        throw new PersonalizedStoryArtApiError(404, "not_found");
      }
      throw accountDeletionPendingError();
    }

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
        return await deleteOwnedArt(route.storyId);
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
      await assertAccountDeletionNotPending(
        input.database,
        input.identity.userId,
      );
      const token = await acquireLease(route.storyId);
      let existingRow;
      let tombstoneKey;
      try {
        await assertAccountDeletionNotPending(
          input.database,
          input.identity.userId,
        );
        tombstoneKey = await accountDeletionTombstoneKey(
          input.identity.userId,
        );
        existingRow = await repository.findOwnedStory(
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
      } catch (error) {
        await releaseLease(route.storyId, token);
        throw error;
      }

      let generated;
      let key;
      try {
        generated = await generateImage({
          prompt: config.prompt,
          sceneImage:
            overrides.generateImage
              ? new File([], "scene-placeholder.webp", { type: "image/webp" })
              : await loadSceneReference(fetchMedia, config),
          sourceImage,
          storyId: route.storyId,
        });
        validateGeneratedImage(generated);
        await assertAccountDeletionNotPending(
          input.database,
          input.identity.userId,
        );
        key = objectKey(
          input.identity.userId,
          route.storyId,
          createObjectId(),
          generated.extension,
        );
        if (existingRow?.r2ObjectKey === key) {
          throw new PersonalizedStoryArtApiError(
            500,
            "object_key_collision",
            "A unique storage key could not be created.",
          );
        }
      } catch (error) {
        await releaseLease(route.storyId, token);
        throw error;
      }

      let tracked;
      try {
        tracked = await leaseRepository.trackCandidate(
          input.identity.userId,
          route.storyId,
          token,
          key,
          now().getTime(),
        );
      } catch (error) {
        await releaseLease(route.storyId, token);
        throw error;
      }
      if (!tracked) {
        await releaseLease(route.storyId, token);
        throw generationInProgressError();
      }

      try {
        await input.env.PERSONALIZED_STORY_ART_BUCKET.put(key, generated.bytes, {
          customMetadata: {
            guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
          },
          httpMetadata: {
            contentType: generated.contentType,
          },
        });
      } catch (error) {
        await cleanupCandidateAndRelease(route.storyId, token, key);
        throw error;
      }

      try {
        await assertAccountDeletionNotPending(
          input.database,
          input.identity.userId,
        );
      } catch (error) {
        await cleanupCandidateAndRelease(route.storyId, token, key);
        throw error;
      }

      const finalizedAt = now().getTime();
      let finalized;
      try {
        finalized = await leaseRepository.finalizeReady(
          input.identity.userId,
          route.storyId,
          token,
          existingRow
            ? { id: existingRow.id, r2ObjectKey: existingRow.r2ObjectKey }
            : null,
          {
            accountDeletionTombstoneKey: tombstoneKey,
            contentType: generated.contentType,
            guardianConsentAt: finalizedAt,
            guardianConsentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
            id: createId(),
            promptVersion: config.promptVersion,
            provider: PROVIDER,
            r2ObjectKey: key,
            updatedAt: finalizedAt,
          },
        );
      } catch (error) {
        await cleanupCandidateAndRelease(route.storyId, token, key);
        throw error;
      }

      if (!finalized) {
        let pending = false;
        let pendingCheckError: unknown;
        try {
          pending = await isAccountDeletionPending(
            input.database,
            input.identity.userId,
          );
        } catch (error) {
          pendingCheckError = error;
        }
        await cleanupCandidateAndRelease(route.storyId, token, key);
        if (pendingCheckError) throw pendingCheckError;
        if (pending) throw accountDeletionPendingError();
        throw generationInProgressError();
      }

      const row = await repository.findOwnedStory(
        input.identity.userId,
        route.storyId,
      );
      if (!row || row.r2ObjectKey !== key || row.status !== "ready") {
        throw new Error("Finalized personalized story art could not be read.");
      }

      let deletionPendingAfterFinalize;
      try {
        deletionPendingAfterFinalize = await isAccountDeletionPending(
          input.database,
          input.identity.userId,
        );
      } catch (error) {
        try {
          await repository.markDeleting(
            input.identity.userId,
            route.storyId,
          );
        } catch {
          // Reads still fail closed while the account-deletion check errors.
        }
        await deleteObjectOrThrow(
          input.env.PERSONALIZED_STORY_ART_BUCKET,
          key,
        );
        throw error;
      }

      if (deletionPendingAfterFinalize) {
        let deletingRow;
        try {
          deletingRow = await repository.markDeleting(
            input.identity.userId,
            route.storyId,
          );
        } catch (error) {
          await deleteObjectOrThrow(
            input.env.PERSONALIZED_STORY_ART_BUCKET,
            key,
          );
          throw error;
        }
        await deleteObjectOrThrow(
          input.env.PERSONALIZED_STORY_ART_BUCKET,
          key,
        );
        if (deletingRow?.r2ObjectKey === key) {
          await repository.deleteByIdIfDeleting(deletingRow.id);
        }
        await releaseLease(route.storyId, token);
        throw accountDeletionPendingError();
      }

      if (existingRow?.r2ObjectKey && existingRow.r2ObjectKey !== key) {
        await deleteObjectOrThrow(
          input.env.PERSONALIZED_STORY_ART_BUCKET,
          existingRow.r2ObjectKey,
        );
      }
      await releaseLease(route.storyId, token);
      return json(metadataPayload(true, row), { status: 201 });
    }

    if (input.request.method === "DELETE" && !route.asset) {
      return await deleteOwnedArt(route.storyId);
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
