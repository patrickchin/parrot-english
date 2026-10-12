import assert from "node:assert/strict";
import { test } from "node:test";
import { createChinaApiFetch } from "../src/shared/api-fetch.ts";

test("China readiness retries only wake reads, shares concurrent wake-up, and sends each write once", async (t) => {
  let clock = 100000;
  t.mock.method(Date, "now", () => clock);
  const calls = [];
  let probes = 0;
  const request = createChinaApiFetch(async (url, options) => {
    calls.push({ url, options });
    if (url === "/api/china/readiness") {
      probes++;
      assert.equal(options.credentials, "omit");
      assert.equal(options.cache, "no-store");
      return probes === 1 ? new Response("Gateway timeout", { status: 504 }) : Response.json({ ready: true });
    }
    return Response.json({ ok: true });
  });
  const write = { method: "POST", body: "one-time-captcha", headers: { "x-captcha-response": "one-time" } };
  await Promise.all([request("/api/auth/sign-in/shared-guest", write), request("/api/learners", write)]);
  assert.equal(probes, 2);
  assert.deepEqual(calls.filter(c => c.url !== "/api/china/readiness").map(c => c.options), [write, write]);
  await request("/api/auth/get-session");
  assert.equal(probes, 2);
  clock += 30001;
  await request("/api/auth/get-session");
  assert.equal(probes, 3);
});

test("Failed readiness is bounded and never sends the protected write; actual 504 writes are not retried", async () => {
  let calls = 0;
  const unavailable = createChinaApiFetch(async url => {
    calls++;
    assert.equal(url, "/api/china/readiness");
    return new Response(null, { status: 504 });
  });
  await assert.rejects(unavailable("/api/auth/sign-up/email", { method: "POST" }), /waking up/);
  assert.equal(calls, 4);
  calls = 0;
  const failedWrite = createChinaApiFetch(async url => {
    calls++;
    return url === "/api/china/readiness" ? Response.json({ ready: true }) : new Response(null, { status: 504 });
  });
  assert.equal((await failedWrite("/api/auth/sign-up/email", { method: "POST" })).status, 504);
  assert.equal(calls, 2);
});

test("Cancelling one caller does not cancel another wake-up or submit the cancelled write", async () => {
  let finish;
  const probe = new Promise(resolve => { finish = resolve; });
  const writes = [];
  const request = createChinaApiFetch(async url => {
    if (url === "/api/china/readiness") return probe;
    writes.push(url);
    return Response.json({ ok: true });
  });
  const controller = new AbortController();
  const cancelled = request("/api/cancelled", { signal: controller.signal, method: "POST" });
  const active = request("/api/active", { method: "POST" });
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  finish(Response.json({ ready: true }));
  await active;
  assert.deepEqual(writes, ["/api/active"]);
});
