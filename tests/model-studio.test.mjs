import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handleLearnerProfileTranscription } from "../worker/groq.ts";
import { getModelStudioConfig } from "../worker/model-studio.ts";
import { enrichLearnerProfileAnswer } from "../worker/learner-profile-enrichment.ts";

const env = { DASHSCOPE_API_KEY: "test-only", DASHSCOPE_WORKSPACE_ID: "ws-test" };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function request(type = "audio/webm", size = 3) {
  const form = new FormData();
  form.set("audio", new File([new Uint8Array(size).fill(7)], "answer", { type }));
  return new Request("https://example.test/api/learner-profile/transcribe", { method: "POST", body: form });
}

test("China transcription sends bounded private audio inline to Beijing and returns only the transcript", async () => {
  for (const [type, format] of Object.entries({ "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" })) {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
      const body = JSON.parse(init.body);
      assert.equal(body.model, "qwen-audio-3.0-asr-flash");
      assert.deepEqual(body.parameters, { format, language_hints: ["en"] });
      const data = body.input.messages[0].content[0].input_audio.data;
      assert.equal(data, `data:${type};base64,BwcH`);
      return Response.json({ output: { text: "  Mary likes balls.  " }, usage: { duration: 2 }, request_id: "not-for-browser" });
    };
    const response = await handleLearnerProfileTranscription(request(type), env);
    assert.deepEqual(await response.json(), { transcript: "Mary likes balls." });
    assert.equal(calls, 1);
  }
});

test("China transcription keeps size/type checks and does not retry or fall back to foreign providers", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ secret: "private vendor details" }, { status: 500 }); };
  assert.equal((await handleLearnerProfileTranscription(request("audio/webm", 512 * 1024 + 1), env)).status, 413);
  assert.equal((await handleLearnerProfileTranscription(request("text/plain"), env)).status, 415);
  assert.equal(calls, 0);
  const response = await handleLearnerProfileTranscription(request(), { ...env, GROQ_API_KEY: "foreign-key" });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "transcription_failed" });
  assert.equal(calls, 1);
  globalThis.fetch = async () => Response.json({ text: "Wrong provider response shape" });
  const malformed = await handleLearnerProfileTranscription(request(), env);
  assert.equal(malformed.status, 502);
  assert.deepEqual(await malformed.json(), { error: "transcription_failed" });
});

test("workspace IDs cannot redirect API credentials and a disabled China key makes no calls", async () => {
  for (const workspace of [undefined, "ws-test@evil.test", "ws-test/../../", "ws-test.cn-beijing.maas.aliyuncs.com"]) {
    assert.throws(() => getModelStudioConfig({ ...env, DASHSCOPE_WORKSPACE_ID: workspace }), /workspace/);
  }
  globalThis.fetch = async () => { throw new Error("Unexpected paid call"); };
  assert.equal((await handleLearnerProfileTranscription(request(), { DASHSCOPE_WORKSPACE_ID: "ws-test" })).status, 503);
});

test("mainland profile summaries use the restricted text model and preserve privacy fallback", async () => {
  const question = { promptEn: "What do you like?", canonicalField: null, maxLength: 500 };
  let calls = 0;
  const fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "qwen3.7-flash-2026-07-15");
    assert.equal(body.enable_thinking, false);
    assert.equal(body.max_tokens, 512);
    assert.equal(body.response_format.type, "json_schema");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Likes red balls.", canonicalName: null, canonicalAge: null }) } }] });
  };
  const result = await enrichLearnerProfileAnswer({ env, fetch, question, rawAnswer: "I like red balls." });
  assert.equal(result.enrichmentStatus, "generated");
  assert.equal(result.summary, "Likes red balls.");
  const privateAnswer = await enrichLearnerProfileAnswer({ env, fetch, question, rawAnswer: "My address is 15 Main Street." });
  assert.equal(privateAnswer.errorCode, "private_profile_details");
  assert.equal(calls, 1);
});
