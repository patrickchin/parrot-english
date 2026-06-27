import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleEvaluateSpeech } from "../worker/groq.ts";

const originalFetch = globalThis.fetch;

function createEvaluateSpeechRequest() {
  const formData = new FormData();
  formData.set("targetText", "Hi, Bella! How are you?");
  formData.set(
    "audio",
    new File(["child audio"], "child-response.webm", { type: "audio/webm" })
  );

  return new Request("https://example.test/api/evaluate-speech", {
    method: "POST",
    body: formData,
  });
}

describe("Groq speech evaluation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a timeout response when speech transcription does not finish", async () => {
    let upstreamAborted = false;
    let resolveFetchCalled;
    const fetchCalled = new Promise((resolve) => {
      resolveFetchCalled = resolve;
    });

    globalThis.fetch = async (_url, init) => {
      resolveFetchCalled();
      init?.signal?.addEventListener("abort", () => {
        upstreamAborted = true;
      });

      return new Promise(() => {});
    };

    const evaluation = handleEvaluateSpeech(createEvaluateSpeechRequest(), {
      GROQ_API_KEY: "test-key",
      GROQ_REQUEST_TIMEOUT_MS: "10",
    });

    const fetchState = await Promise.race([
      fetchCalled,
      new Promise((resolve) =>
        setTimeout(() => resolve("upstream-fetch-not-called"), 1000)
      ),
    ]);
    assert.notEqual(fetchState, "upstream-fetch-not-called");

    const response = await Promise.race([
      evaluation,
      new Promise((resolve) =>
        setTimeout(() => resolve("speech-evaluation-hung"), 1000)
      ),
    ]);

    assert.notEqual(
      response,
      "speech-evaluation-hung",
      "speech evaluation should return an error response instead of hanging"
    );
    assert.equal(response.status, 504);
    assert.equal(upstreamAborted, true);

    const payload = await response.json();
    assert.equal(payload.error, "stt_timeout");
  });
});
