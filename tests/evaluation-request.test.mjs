import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSpeech } from "../src/evaluation-request.ts";

describe("speech evaluation request", () => {
  it("times out requests that do not finish", async () => {
    let aborted = false;
    const audio = new Blob(["child audio"], { type: "audio/webm" });

    await assert.rejects(
      evaluateSpeech({
        audio,
        fetch: async (_url, init) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
          });

          return new Promise(() => {});
        },
        setTimeout,
        clearTimeout,
        targetText: "Hi, Bella! How are you?",
        timeoutMs: 10,
      }),
      { name: "AbortError" }
    );

    assert.equal(aborted, true);
  });
});
