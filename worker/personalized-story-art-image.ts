const PNG_SIGNATURE = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
]);
const MAX_SOURCE_DIMENSION = 480;
const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024;
const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const APNG_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);
const ALLOWED_CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

export class PersonalizedStoryArtImageError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.code = code;
    this.name = "PersonalizedStoryArtImageError";
    this.status = status;
  }
}

type CreatePersonalizedStoryArtImageInput = {
  ai: Ai;
  prompt: string;
  sceneImage: File;
  sourceImage: File;
};

function isCriticalChunk(type: string) {
  return (type.charCodeAt(0) & 32) === 0;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function encodeUint32(value: number) {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function chunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crc = encodeUint32(crc32(crcInput));
  return [encodeUint32(data.length), typeBytes, data, crc];
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function bytesFromBase64(value: string) {
  const normalized = value.replace(/^data:[^,]+,/, "");
  if (
    normalized.length === 0 ||
    normalized.length > Math.ceil((MAX_GENERATED_IMAGE_BYTES * 4) / 3) + 4 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new PersonalizedStoryArtImageError(
      502,
      "generation_failed",
      "The image service returned invalid image data.",
    );
  }
  return Uint8Array.from(Buffer.from(normalized, "base64"));
}

export function detectRasterFormat(bytes: Uint8Array) {
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

function extensionForContentType(contentType: "image/jpeg" | "image/png" | "image/webp") {
  switch (contentType) {
    case "image/jpeg":
      return "jpg" as const;
    case "image/png":
      return "png" as const;
    case "image/webp":
      return "webp" as const;
  }
}

function ensureFile(value: FormDataEntryValue | null, field: string) {
  if (!(value instanceof File) || value.size === 0) {
    throw new PersonalizedStoryArtImageError(400, "invalid_source_image", `${field} is required.`);
  }
  return value;
}

function sanitizePng(file: File) {
  if (file.type !== "image/png") {
    throw new PersonalizedStoryArtImageError(
      415,
      "unsupported_source_image",
      "The learner image must be a PNG file.",
    );
  }

  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    if (
      bytes.length < PNG_SIGNATURE.length ||
      !PNG_SIGNATURE.every((value, index) => bytes[index] === value)
    ) {
      throw new PersonalizedStoryArtImageError(
        400,
        "invalid_source_image",
        "The learner image must be a valid PNG file.",
      );
    }

    const outputParts: Uint8Array[] = [PNG_SIGNATURE];
    let offset = PNG_SIGNATURE.length;
    let sawHeader = false;
    let sawData = false;
    let dataEnded = false;
    let sawEnd = false;
    let sawPalette = false;
    let colorType: number | null = null;

    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) {
        throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
      }
      const length = readUint32(bytes, offset);
      const typeBytes = bytes.subarray(offset + 4, offset + 8);
      const type = new TextDecoder().decode(typeBytes);
      if (!/^[A-Za-z]{4}$/.test(type)) {
        throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
      }
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const crcOffset = dataEnd;
      const nextOffset = crcOffset + 4;
      if (nextOffset > bytes.length) {
        throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
      }
      const data = bytes.subarray(dataStart, dataEnd);
      const expectedCrc = readUint32(bytes, crcOffset);
      const crcInput = new Uint8Array(typeBytes.length + data.length);
      crcInput.set(typeBytes, 0);
      crcInput.set(data, typeBytes.length);
      if (crc32(crcInput) !== expectedCrc) {
        throw new PersonalizedStoryArtImageError(
          400,
          "invalid_source_image",
          "The learner PNG is corrupt or has an invalid CRC checksum.",
        );
      }
      if (APNG_CHUNKS.has(type)) {
        throw new PersonalizedStoryArtImageError(
          400,
          "invalid_source_image",
          "Animated PNG files are not supported.",
        );
      }
      if (isCriticalChunk(type) && !ALLOWED_CRITICAL_CHUNKS.has(type)) {
        throw new PersonalizedStoryArtImageError(
          400,
          "invalid_source_image",
          `Unsupported PNG chunk: ${type}.`,
        );
      }
      if (!sawHeader && type !== "IHDR") {
        throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
      }
      if (type === "IHDR") {
        if (sawHeader || length !== 13) {
          throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
        }
        const width = readUint32(data, 0);
        const height = readUint32(data, 4);
        if (
          width < 1 ||
          height < 1 ||
          width > MAX_SOURCE_DIMENSION ||
          height > MAX_SOURCE_DIMENSION
        ) {
          throw new PersonalizedStoryArtImageError(
            400,
            "invalid_source_image",
            `The learner image must stay within ${MAX_SOURCE_DIMENSION}px on each side.`,
          );
        }
        const bitDepth = data[8];
        colorType = data[9];
        const validBitDepth =
          (colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth)) ||
          (colorType === 2 && [8, 16].includes(bitDepth)) ||
          (colorType === 3 && [1, 2, 4, 8].includes(bitDepth)) ||
          (colorType === 4 && [8, 16].includes(bitDepth)) ||
          (colorType === 6 && [8, 16].includes(bitDepth));
        if (
          !validBitDepth ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          (data[12] !== 0 && data[12] !== 1)
        ) {
          throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
        }
        sawHeader = true;
        outputParts.push(...chunk(type, data));
      } else if (type === "PLTE" || type === "IDAT" || type === "IEND") {
        if (!sawHeader) {
          throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
        }
        if (type === "PLTE") {
          if (
            sawPalette ||
            sawData ||
            sawEnd ||
            length === 0 ||
            length > 768 ||
            length % 3 !== 0
          ) {
            throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
          }
          sawPalette = true;
        }
        if (type === "IDAT") {
          if (sawEnd || dataEnded || (colorType === 3 && !sawPalette)) {
            throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
          }
          sawData = true;
        }
        if (type === "IEND") {
          if (!sawData || length !== 0) {
            throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
          }
          sawEnd = true;
          if (nextOffset !== bytes.length) {
            throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
          }
        }
        outputParts.push(...chunk(type, data));
      } else if (sawData) {
        dataEnded = true;
      }
      offset = nextOffset;
    }

    if (!sawHeader || !sawData || !sawEnd) {
      throw new PersonalizedStoryArtImageError(400, "invalid_source_image");
    }

    const totalBytes = outputParts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(totalBytes);
    let writeOffset = 0;
    for (const part of outputParts) {
      output.set(part, writeOffset);
      writeOffset += part.length;
    }
    return output;
  });
}

async function toMultipartPayload(formData: FormData) {
  const request = new Request("https://example.test/multipart", {
    method: "POST",
    body: formData,
  });
  return {
    body: new Uint8Array(await request.arrayBuffer()),
    contentType: request.headers.get("Content-Type") ?? "",
  };
}

export async function createPersonalizedStoryArtImage({
  ai,
  prompt,
  sceneImage,
  sourceImage,
}: CreatePersonalizedStoryArtImageInput) {
  const sanitizedSource = await sanitizePng(sourceImage);
  const formData = new FormData();
  formData.set("prompt", prompt);
  formData.set("width", "1152");
  formData.set("height", "768");
  formData.set("input_image_0", sceneImage);
  formData.set(
    "input_image_1",
    new File([sanitizedSource], "learner.png", {
      type: "image/png",
    }),
  );

  const multipart = await toMultipartPayload(formData);
  const result = await ai.run(MODEL, { multipart });
  const base64 =
    result && typeof result === "object" && typeof result.image === "string"
      ? result.image
      : null;
  if (!base64) {
    throw new PersonalizedStoryArtImageError(
      502,
      "generation_failed",
      "The image service returned an invalid response.",
    );
  }
  const bytes = bytesFromBase64(base64);
  if (bytes.byteLength > MAX_GENERATED_IMAGE_BYTES) {
    throw new PersonalizedStoryArtImageError(
      502,
      "generation_failed",
      "The provider returned an oversized image.",
    );
  }
  const format = detectRasterFormat(bytes);
  if (!format) {
    throw new PersonalizedStoryArtImageError(
      502,
      "generation_failed",
      "The provider must return a supported image.",
    );
  }

  return {
    bytes,
    contentType: format,
    extension: extensionForContentType(format),
  };
}

export { ensureFile };
