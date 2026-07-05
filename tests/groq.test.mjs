import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleEvaluateSpeech } from "../worker/groq.ts";

const originalFetch = globalThis.fetch;

function createEvaluateSpeechRequest(targetText = "Hello, Peppa!") {
  const formData = new FormData();
  formData.set("targetText", targetText);
  formData.set(
    "audio",
    new File(["child audio"], "child-response.webm", { type: "audio/webm" })
  );

  return new Request("https://example.test/api/evaluate-speech", {
    method: "POST",
    body: formData,
  });
}

async function evaluateStubbedTranscript(transcript, targetText = "Hello, Peppa!") {
  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://api.groq.com/openai/v1/audio/transcriptions"
    );
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, { Authorization: "Bearer test-key" });

    return Response.json({ text: transcript });
  };

  const response = await handleEvaluateSpeech(
    createEvaluateSpeechRequest(targetText),
    {
      GROQ_API_KEY: "test-key",
    }
  );

  assert.equal(response.status, 200);
  return response.json();
}

describe("Groq speech evaluation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("passes a correct child transcript and returns success feedback", async () => {
    const payload = await evaluateStubbedTranscript("Hello Peppa");

    assert.equal(payload.transcript, "Hello Peppa");
    assert.equal(payload.passed, true);
    assert.equal(payload.similarity, 1);
    assert.equal(payload.feedbackText, "Great job!");
    assert.equal(payload.retryAllowed, false);
  });

  it("returns retry feedback for an incorrect transcript", async () => {
    const payload = await evaluateStubbedTranscript("yellow ball");

    assert.equal(payload.transcript, "yellow ball");
    assert.equal(payload.passed, false);
    assert.equal(payload.feedbackText, "Almost! Try again.");
    assert.equal(payload.retryAllowed, true);
    assert.ok(payload.similarity < 0.74);
  });

  it("returns no-speech retry feedback for an empty transcript", async () => {
    const payload = await evaluateStubbedTranscript("");

    assert.equal(payload.transcript, "");
    assert.equal(payload.passed, false);
    assert.equal(payload.similarity, 0);
    assert.equal(payload.feedbackText, "I couldn't hear you. Please try again.");
    assert.equal(payload.retryAllowed, true);
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
