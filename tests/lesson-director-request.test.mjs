import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestLessonDirectorPacket } from "../src/lesson-director-request.ts";

describe("lesson director request", () => {
  it("posts lesson and runtime state to the Worker route", async () => {
    const calls = [];
    const packet = { schemaVersion: "lesson-director.response.v1", packetId: "p1" };
    const lesson = { lessonId: "l1" };
    const runtimeState = { currentSceneId: "greeting" };

    const result = await requestLessonDirectorPacket({
      lesson,
      runtimeState,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(packet), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(result.packetId, "p1");
    assert.equal(calls[0].url, "/api/lesson-director");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0].init.body), { lesson, runtimeState });
  });
});
