type RequestLessonDirectorPacketOptions = {
  fetch?: typeof globalThis.fetch;
  lesson: unknown;
  runtimeState: unknown;
  signal?: AbortSignal;
};

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message ?? payload.error ?? response.statusText;
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
