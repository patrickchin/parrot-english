import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleLearnerProfileTranscription } from "../worker/groq.ts";

const originalFetch = globalThis.fetch;

function transcriptionRequest({
  audio = new File(["child audio"], "answer.webm", { type: "audio/webm" }),
  method = "POST",
} = {}) {
  const formData = new FormData();
  if (audio !== null) formData.set("audio", audio);
  return new Request("https://example.test/api/learner-profile/transcribe", {
    method,
    body: method === "POST" ? formData : undefined,
  });
}

describe("onboarding transcription", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("accepts POST only and requires configured Groq transcription", async () => {
    const wrongMethod = await handleLearnerProfileTranscription(
      transcriptionRequest({ method: "GET" }),
      { GROQ_API_KEY: "test-key" },
    );
    assert.equal(wrongMethod.status, 405);
    assert.deepEqual(await wrongMethod.json(), { error: "method_not_allowed" });

    const missingKey = await handleLearnerProfileTranscription(
      transcriptionRequest(),
      {},
    );
    assert.equal(missingKey.status, 503);
    assert.deepEqual(await missingKey.json(), {
      error: "transcription_unavailable",
    });
  });

  it("rejects missing, unsupported, and oversized audio before provider calls", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return Response.json({ text: "unexpected" });
    };

    const missing = await handleLearnerProfileTranscription(
      transcriptionRequest({ audio: null }),
      { GROQ_API_KEY: "test-key" },
    );
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: "audio_file_required" });

    const unsupported = await handleLearnerProfileTranscription(
      transcriptionRequest({
        audio: new File(["audio"], "answer.txt", { type: "text/plain" }),
      }),
      { GROQ_API_KEY: "test-key" },
    );
    assert.equal(unsupported.status, 415);
    assert.deepEqual(await unsupported.json(), {
      error: "unsupported_audio_type",
    });

    const empty = await handleLearnerProfileTranscription(
      transcriptionRequest({
        audio: new File([], "answer.webm", { type: "audio/webm" }),
      }),
      { GROQ_API_KEY: "test-key" },
    );
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { error: "audio_file_required" });

    const oversized = await handleLearnerProfileTranscription(
      transcriptionRequest({
        audio: new File([new Uint8Array(512 * 1024 + 1)], "answer.webm", {
          type: "audio/webm",
        }),
      }),
      { GROQ_API_KEY: "test-key" },
    );
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "audio_too_large" });
    assert.equal(fetchCalls, 0);
  });

  it("rejects an oversized multipart envelope before parsing it", async () => {
    const boundary = "bounded-learner-profile-audio";
    const request = new Request(
      "https://example.test/api/learner-profile/transcribe",
      {
        method: "POST",
        headers: {
          "Content-Length": String(512 * 1024 + 64 * 1024 + 1),
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: `--${boundary}--\r\n`,
      },
    );

    const response = await handleLearnerProfileTranscription(request, {
      GROQ_API_KEY: "test-key",
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "audio_too_large" });
  });

  it("forwards supported audio to English Whisper and returns transcript only", async () => {
    let providerForm;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, { Authorization: "Bearer test-key" });
      providerForm = init?.body;
      return Response.json({ text: "  Bluey  " });
    };

    const response = await handleLearnerProfileTranscription(
      transcriptionRequest({
        audio: new File(["audio"], "answer.mp4", { type: "audio/mp4" }),
      }),
      { GROQ_API_KEY: "test-key" },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { transcript: "Bluey" });
    assert.equal(providerForm.get("model"), "whisper-large-v3-turbo");
    assert.equal(providerForm.get("language"), "en");
    assert.equal(providerForm.get("response_format"), "json");
    assert.equal(providerForm.has("targetText"), false);
    assert.equal(providerForm.get("file").name, "answer.mp4");
  });

  it("maps provider failures and timeouts without leaking details", async () => {
    globalThis.fetch = async () =>
      new Response("secret provider trace", { status: 502 });
    const failed = await handleLearnerProfileTranscription(
      transcriptionRequest(),
      { GROQ_API_KEY: "test-key" },
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { error: "transcription_failed" });

    globalThis.fetch = async (_url, init) => {
      init?.signal?.addEventListener("abort", () => {});
      return new Promise(() => {});
    };
    const timedOut = await handleLearnerProfileTranscription(
      transcriptionRequest(),
      { GROQ_API_KEY: "test-key", GROQ_REQUEST_TIMEOUT_MS: "10" },
    );
    assert.equal(timedOut.status, 504);
    assert.deepEqual(await timedOut.json(), { error: "transcription_timeout" });
  });
});
