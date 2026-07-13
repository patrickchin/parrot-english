import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { synthesizeAcknowledgment } from "../worker/learner-profile-acknowledgment-audio.ts";

describe("onboarding acknowledgment audio", () => {
  it("documents the local Worker secret name without a real credential", () => {
    const example = readFileSync(
      new URL("../.dev.vars.example", import.meta.url),
      "utf8",
    );
    assert.match(
      example,
      /^ELEVENLABS_API_KEY=your_elevenlabs_api_key_here$/m,
    );
  });

  it("synthesizes only the server acknowledgment with the Peppa voice", async () => {
    let request;
    const audio = await synthesizeAcknowledgment({
      env: { ELEVENLABS_API_KEY: "test-key" },
      fetch: async (url, init) => {
        request = {
          url: String(url),
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        };
        return new Response(Uint8Array.from([1, 2, 3]), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
      text: "Dinosaurs are very stompy!",
    });

    assert.match(request.url, /Oqy85UMasXzUjUxF0ta5/);
    assert.match(request.url, /output_format=mp3_44100_128/);
    assert.deepEqual(request.headers, {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": "test-key",
    });
    assert.equal(request.body.model_id, "eleven_v3");
    assert.equal(
      request.body.text,
      "[bright and playful] Dinosaurs are very stompy!",
    );
    assert.deepEqual(audio, { contentType: "audio/mpeg", base64: "AQID" });
  });

  it("returns null without sending missing, blank, or excessive text", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return new Response(Uint8Array.from([1]));
    };

    assert.equal(
      await synthesizeAcknowledgment({ env: {}, fetch, text: "Hello!" }),
      null,
    );
    assert.equal(
      await synthesizeAcknowledgment({
        env: { ELEVENLABS_API_KEY: "test-key" },
        fetch,
        text: "   ",
      }),
      null,
    );
    assert.equal(
      await synthesizeAcknowledgment({
        env: { ELEVENLABS_API_KEY: "test-key" },
        fetch,
        text: "x".repeat(161),
      }),
      null,
    );
    assert.equal(calls, 0);
  });

  it("returns null for invalid or failed upstream audio", async () => {
    for (const fetch of [
      async () => new Response("secret trace", { status: 503 }),
      async () =>
        new Response(new Uint8Array(), {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      async () =>
        new Response("not audio", {
          headers: { "Content-Type": "application/json" },
        }),
      async () => {
        throw new Error("private provider failure");
      },
    ]) {
      assert.equal(
        await synthesizeAcknowledgment({
          env: { ELEVENLABS_API_KEY: "test-key" },
          fetch,
          text: "Hello!",
        }),
        null,
      );
    }
  });

  it("aborts and returns null when ElevenLabs does not finish", async () => {
    let aborted = false;
    const audio = await synthesizeAcknowledgment({
      env: {
        ELEVENLABS_API_KEY: "test-key",
        ELEVENLABS_REQUEST_TIMEOUT_MS: "10",
      },
      fetch: async (_url, init) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
      text: "Hello!",
    });

    assert.equal(audio, null);
    assert.equal(aborted, true);
  });
});
