import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createResponseLatencyTimer,
  formatResponseLatency,
} from "../src/conversation/response-latency.ts";

describe("client response latency timer", () => {
  it("measures from the learner ending their turn until Peppa starts speaking", () => {
    let now = 1_000;
    const timer = createResponseLatencyTimer(() => now);

    timer.start();
    now = 2_350;

    assert.equal(timer.finish(), 1_350);
    assert.equal(timer.finish(), null);
  });

  it("can discard an interrupted measurement and formats completed latency", () => {
    let now = 500;
    const timer = createResponseLatencyTimer(() => now);

    timer.start();
    now = 1_000;
    timer.reset();

    assert.equal(timer.finish(), null);
    assert.equal(formatResponseLatency(1_254), "1.25 s");
  });
});
