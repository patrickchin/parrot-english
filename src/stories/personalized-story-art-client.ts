import { notifyGuardianAccessRequired } from "../auth/guardian-access-api.ts";

export const PERSONALIZED_STORY_ID = "the-red-ball";
export const PERSONALIZED_STORY_PAGE_ID = "my-red-ball";
export const PERSONALIZED_STORY_TITLE = "The Red Ball";
const NORMALIZED_CANVAS_SIZE = 480;

export type PersonalizedStoryArtwork = {
  alt: string;
  src: string;
};

export type PersonalizedStoryArtMetadata = {
  enabled?: boolean;
  guardianConsentVersion?: string;
  hasStoredArt?: boolean;
  stories: Record<
    string,
    {
      pages: Record<string, PersonalizedStoryArtwork>;
    }
  >;
  updatedAt?: string;
};

export type PersonalizedStoryArtRequestOptions = {
  fetch?: typeof globalThis.fetch;
  normalization?: PersonalizedStoryArtNormalizationDependencies;
  signal?: AbortSignal;
};

type CanvasImageSourceLike = {
  height: number;
  width: number;
};

type BitmapLike = CanvasImageSourceLike & {
  close?: () => void;
};

type CanvasLike = {
  getContext: (
    contextId: "2d",
  ) => {
    clearRect: (x: number, y: number, width: number, height: number) => void;
    drawImage: (
      image: CanvasImageSourceLike,
      sourceX: number,
      sourceY: number,
      sourceWidth: number,
      sourceHeight: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => void;
  } | null;
  toBlob?: (callback: BlobCallback, type?: string) => void;
  convertToBlob?: (options?: { type?: string }) => Promise<Blob>;
  height: number;
  width: number;
};

export type PersonalizedStoryArtNormalizationDependencies = {
  createCanvas?: (width: number, height: number) => CanvasLike | null;
  decodeImage?: (image: Blob) => Promise<BitmapLike>;
};

export class PersonalizedStoryArtApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PersonalizedStoryArtApiError";
    this.code = code;
    this.status = status;
  }
}

function emptyMetadata(): PersonalizedStoryArtMetadata {
  return { stories: {} };
}

function normalizeArtwork(
  value: unknown,
  storyId: string,
): PersonalizedStoryArtwork | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { alt?: unknown; src?: unknown };
  if (
    typeof candidate.alt !== "string" ||
    !candidate.alt.trim() ||
    typeof candidate.src !== "string" ||
    !candidate.src.trim()
  ) {
    return null;
  }
  const src = candidate.src.trim();
  const expectedPath = `/api/stories/${encodeURIComponent(storyId)}/personalized-art/asset`;
  const suffix = src.slice(expectedPath.length);
  if (!src.startsWith(expectedPath) || (suffix !== "" && !/^\?v=\d+$/.test(suffix))) {
    return null;
  }
  return { alt: candidate.alt.trim(), src };
}

export function parsePersonalizedStoryArtMetadata(
  payload: unknown,
): PersonalizedStoryArtMetadata {
  if (!payload || typeof payload !== "object") {
    return emptyMetadata();
  }

  const source = payload as {
    enabled?: unknown;
    guardianConsentVersion?: unknown;
    hasStoredArt?: unknown;
    stories?: unknown;
    updatedAt?: unknown;
  };
  const stories: PersonalizedStoryArtMetadata["stories"] = {};
  if (source.stories && typeof source.stories === "object") {
    for (const [storyId, storyValue] of Object.entries(source.stories)) {
      if (!storyValue || typeof storyValue !== "object") continue;
      const pageContainer = (storyValue as { pages?: unknown }).pages;
      if (!pageContainer || typeof pageContainer !== "object") continue;

      const pages: Record<string, PersonalizedStoryArtwork> = {};
      for (const [pageId, pageValue] of Object.entries(pageContainer)) {
        const artwork = normalizeArtwork(pageValue, storyId);
        if (artwork) pages[pageId] = artwork;
      }

      if (Object.keys(pages).length > 0) {
        stories[storyId] = { pages };
      }
    }
  }

  return {
    ...(typeof source.enabled === "boolean" ? { enabled: source.enabled } : {}),
    ...(typeof source.guardianConsentVersion === "string" &&
    source.guardianConsentVersion.trim()
      ? { guardianConsentVersion: source.guardianConsentVersion.trim() }
      : {}),
    ...(typeof source.hasStoredArt === "boolean"
      ? { hasStoredArt: source.hasStoredArt }
      : {}),
    stories,
    ...(typeof source.updatedAt === "string" && source.updatedAt.trim()
      ? { updatedAt: source.updatedAt.trim() }
      : {}),
  };
}

export function getPersonalizedStoryArtOverride(
  metadata: PersonalizedStoryArtMetadata | null | undefined,
  storyId: string,
  pageId: string,
) {
  return metadata?.stories[storyId]?.pages[pageId] ?? null;
}

function getStoryArtPath(storyId: string) {
  return `/api/stories/${encodeURIComponent(storyId)}/personalized-art`;
}

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  {
    fetch: request = globalThis.fetch,
    signal,
  }: PersonalizedStoryArtRequestOptions = {},
) {
  const response = await request(path, { ...init, signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown; message?: unknown })
        : {};
    const code =
      typeof error.error === "string" ? error.error : "request_failed";
    if (response.status === 403 && code === "guardian_required") {
      notifyGuardianAccessRequired();
    }
    throw new PersonalizedStoryArtApiError(
      response.status,
      code,
      typeof error.message === "string"
        ? error.message
        : "The story artwork request could not be completed.",
    );
  }
  return payload as Result;
}

export async function loadPersonalizedStoryArt(
  storyId: string,
  options?: PersonalizedStoryArtRequestOptions,
): Promise<PersonalizedStoryArtMetadata> {
  const payload = await requestJson<unknown>(
    getStoryArtPath(storyId),
    { method: "GET" },
    options,
  );
  return parsePersonalizedStoryArtMetadata(payload);
}

function defaultCreateCanvas(width: number, height: number): CanvasLike | null {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as CanvasLike;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as CanvasLike;
  }
  return null;
}

async function defaultDecodeImage(image: Blob): Promise<BitmapLike> {
  if (typeof globalThis.createImageBitmap === "function") {
    return globalThis.createImageBitmap(image) as Promise<BitmapLike>;
  }
  if (
    typeof document !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    const objectUrl = URL.createObjectURL(image);
    return new Promise<BitmapLike>((resolve, reject) => {
      const element = document.createElement("img");
      element.onload = () => {
        let closed = false;
        resolve({
          close() {
            if (!closed) URL.revokeObjectURL(objectUrl);
            closed = true;
          },
          height: element.naturalHeight,
          width: element.naturalWidth,
        });
      };
      element.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("The selected portrait could not be decoded."));
      };
      element.src = objectUrl;
    });
  }
  throw new Error("This browser cannot prepare a private story portrait.");
}

function sanitizePngFilename(name: string | undefined) {
  const baseName = (name?.trim() || "storybook-portrait").replace(
    /\.[A-Za-z0-9]+$/,
    "",
  );
  return `${baseName || "storybook-portrait"}.png`;
}

function maybeAsFile(source: Blob, bytes: BlobPart[], type: string) {
  if (typeof File === "function" && source instanceof File) {
    return new File(bytes, sanitizePngFilename(source.name), { type });
  }
  return new Blob(bytes, { type });
}

async function canvasToPngBlob(canvas: CanvasLike, source: Blob) {
  if (typeof canvas.convertToBlob === "function") {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return maybeAsFile(source, [blob], "image/png");
  }
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob?.((value) => {
        if (value) resolve(value);
        else reject(new Error("The portrait canvas did not produce a PNG blob."));
      }, "image/png");
    });
    return maybeAsFile(source, [blob], "image/png");
  }
  throw new Error("The portrait canvas could not export a PNG.");
}

export async function normalizePersonalizedStoryArtUpload(
  source: Blob,
  dependencies: PersonalizedStoryArtNormalizationDependencies = {},
) {
  const decodeImage = dependencies.decodeImage ?? defaultDecodeImage;
  const createCanvas = dependencies.createCanvas ?? defaultCreateCanvas;
  const bitmap = await decodeImage(source);
  const canvas = createCanvas(NORMALIZED_CANVAS_SIZE, NORMALIZED_CANVAS_SIZE);

  if (!bitmap || !canvas) {
    bitmap?.close?.();
    throw new Error("This browser cannot prepare a private story portrait.");
  }

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("This browser cannot prepare a private story portrait.");
  }
  if (
    !Number.isFinite(bitmap.width) ||
    !Number.isFinite(bitmap.height) ||
    bitmap.width < 1 ||
    bitmap.height < 1
  ) {
    bitmap.close?.();
    throw new Error("The selected portrait has invalid dimensions.");
  }

  context.clearRect?.(0, 0, canvas.width, canvas.height);
  const cropSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.round((bitmap.width - cropSize) / 2);
  const sourceY = Math.round((bitmap.height - cropSize) / 2);
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    NORMALIZED_CANVAS_SIZE,
    NORMALIZED_CANVAS_SIZE,
  );
  try {
    return await canvasToPngBlob(canvas, source);
  } finally {
    bitmap.close?.();
  }
}

export async function generatePersonalizedStoryArt(
  {
    guardianConsentVersion,
    photo,
    storyId,
  }: {
    guardianConsentVersion: string;
    photo: Blob;
    storyId: string;
  },
  options?: PersonalizedStoryArtRequestOptions,
) {
  const image = await normalizePersonalizedStoryArtUpload(
    photo,
    options?.normalization,
  );
  const body = new FormData();
  body.set("guardianConsentVersion", guardianConsentVersion);
  body.set("guardianConsentAccepted", "yes");
  body.set("source", image);

  const payload = await requestJson<unknown>(
    getStoryArtPath(storyId),
    {
      method: "POST",
      body,
    },
    options,
  );
  return parsePersonalizedStoryArtMetadata(payload);
}

export async function removePersonalizedStoryArt(
  {
    storyId,
  }: {
    storyId: string;
  },
  options?: PersonalizedStoryArtRequestOptions,
) {
  await requestJson<unknown>(
    getStoryArtPath(storyId),
    { method: "DELETE" },
    options,
  );
}
