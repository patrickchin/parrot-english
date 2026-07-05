export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readBoundedBytes(request: Request, maxBytes: number) {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(request: Request, maxBytes: number) {
  return new TextDecoder().decode(await readBoundedBytes(request, maxBytes));
}

export async function readBoundedFormData(
  request: Request,
  maxBytes: number,
) {
  const bytes = await readBoundedBytes(request, maxBytes);
  return new Response(bytes, {
    headers: {
      "Content-Type": request.headers.get("Content-Type") ?? "",
    },
  }).formData();
}
