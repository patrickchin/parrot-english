import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RequestBodyTooLargeError,
  readBoundedFormData,
  readBoundedText,
} from "../worker/request-body.ts";

describe("bounded Worker request bodies", () => {
  it("rejects a declared oversized body before reading it", async () => {
    const body = new globalThis.ReadableStream({
      pull(controller) {
        controller.enqueue(new globalThis.TextEncoder().encode("small"));
        controller.close();
      },
    });
    const request = new Request("https://example.test/profile", {
      method: "POST",
      headers: { "Content-Length": "9" },
      body,
      duplex: "half",
    });

    await assert.rejects(
      readBoundedText(request, 8),
      RequestBodyTooLargeError,
    );
    assert.equal(request.bodyUsed, false);
  });

  it("stops a streamed body when it crosses the limit", async () => {
    const body = new globalThis.ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(3));
        controller.close();
      },
    });
    const request = new Request("https://example.test/profile", {
      method: "POST",
      body,
      duplex: "half",
    });

    await assert.rejects(
      readBoundedText(request, 8),
      RequestBodyTooLargeError,
    );
  });

  it("reads accepted text and multipart bodies", async () => {
    const text = await readBoundedText(
      new Request("https://example.test/profile", {
        method: "POST",
        body: '{"answer":"Bluey"}',
      }),
      64,
    );
    assert.equal(text, '{"answer":"Bluey"}');

    const source = new FormData();
    source.set("answer", "Bluey");
    const form = await readBoundedFormData(
      new Request("https://example.test/profile", {
        method: "POST",
        body: source,
      }),
      1024,
    );
    assert.equal(form.get("answer"), "Bluey");
  });
});
