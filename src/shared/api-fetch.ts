/** Wake the idle China database with reads before sending a one-time proof or write. */
export function createChinaApiFetch(request: typeof globalThis.fetch): typeof globalThis.fetch {
  let readyUntil = 0;
  let pending: Promise<void> | undefined;
  async function wake() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await request("/api/china/readiness", {
        credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(12000),
      }).catch(() => null);
      const payload = response?.ok ? await response.json().catch(() => null) as { ready?: unknown } | null : null;
      if (payload?.ready === true) {
        readyUntil = Date.now() + 30000;
        return;
      }
      if (response && ![502, 503, 504].includes(response.status)) break;
    }
    throw new Error("The China backend is waking up. Please try again.");
  }
  return async (input, init) => {
    const origin = globalThis.location?.origin ?? "https://runtime.invalid";
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request(input, init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    signal?.throwIfAborted();
    if (Date.now() >= readyUntil) {
      pending ??= wake().finally(() => { pending = undefined; });
      let aborted: (() => void) | undefined;
      try {
        await (signal ? Promise.race([pending, new Promise<never>((_resolve, reject) => {
          aborted = () => reject(signal.reason);
          signal.addEventListener("abort", aborted, { once: true });
        })]) : pending);
      } finally {
        if (aborted) signal?.removeEventListener("abort", aborted);
      }
    }
    signal?.throwIfAborted();
    // Never retry the actual request: it may have consumed a CAPTCHA or committed a write.
    const response = await request(input, init);
    if ([502, 503, 504].includes(response.status)) readyUntil = 0;
    return response;
  };
}

export const apiFetch = import.meta.env?.VITE_ALIYUN_CAPTCHA_SCENE_ID
  ? createChinaApiFetch((input, init) => globalThis.fetch(input, init))
  : (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);
