type RequestLessonDirectorPacketOptions = {
  fetch?: typeof globalThis.fetch;
  lesson: unknown;
  runtimeState: unknown;
  signal?: AbortSignal;
};

const ERROR_MESSAGES_BY_CODE: Record<string, string> = {
  method_not_allowed: "Lesson director request method is not allowed.",
  invalid_json: "Lesson director request body was not valid JSON.",
  invalid_request: "Lesson director request was incomplete or invalid.",
  rate_limited: "Too many lesson director requests. Please wait and try again.",
};

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    if (payload.message !== undefined) return payload.message;
    if (payload.error !== undefined) return ERROR_MESSAGES_BY_CODE[payload.error] ?? payload.error;
    return response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function requestLessonDirectorPacket({
  fetch: request = globalThis.fetch,
  lesson,
  runtimeState,
  signal,
}: RequestLessonDirectorPacketOptions) {
  const response = await request("/api/lesson-director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lesson, runtimeState }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  return response.json();
}
