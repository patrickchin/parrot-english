import process from "node:process";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createDatabase } from "../worker/database.ts";
import { createLearnerProfileRepository } from "../worker/learner-profile-repository.ts";
import { prepareLearnerDeletion } from "../worker/learner-deletion.ts";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createPostgresBinding, postgresQuery } from "../backend/postgres.mjs";
import gateway from "../backend/esa-gateway.mjs";
import { createPrivateMediaBucket, createRateLimiter } from "../backend/private-media.mjs";

// Use only a disposable local/CI database. Each run creates and drops its own schema.
test("Alibaba backend preserves auth, learner access, atomic storage and SQL batches", { skip: !process.env.PARROT_TEST_DATABASE_URL }, async () => {
  const output = mkdtempSync(join(tmpdir(), "parrot-aliyun-test-"));
  await build({ entryPoints: ["backend/server.mjs"], outfile: join(output, "backend.cjs"), bundle: true, platform: "node", format: "cjs", target: "node24" });
  const { createBackendHandler, createHttpServer, startBackend } = createRequire(import.meta.url)(join(output, "backend.cjs"));
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgres://user:password@localhost/test?sslmode=disable";
    assert.throws(startBackend, /without query options/);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
  const connectionString = process.env.PARROT_TEST_DATABASE_URL;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname));
  const schema = `parrot_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 4 });
  const originalFetch = globalThis.fetch;
  let server;
  try {
    await pool.query(readFileSync(new URL("../backend/postgres-baseline.sql", import.meta.url), "utf8"));
    globalThis.fetch = async (input, init) => new URL(input).hostname === "challenges.cloudflare.com"
      ? Response.json({ success: true, action: "account_access" }) : originalFetch(input, init);
    const variables = { BETTER_AUTH_URL: "https://example.test", BETTER_AUTH_SECRET: "test-auth-secret-at-least-thirty-two-characters", TURNSTILE_SECRET_KEY: "test-key", PARROT_EDGE_SECRET: "test-edge-secret-at-least-thirty-two-characters" };
    const handler = createBackendHandler({ pool, variables });
    let cookie = "";
    const call = (path, method = "GET", body, extraHeaders = {}) => handler(new Request("https://backend.test/", {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "x-parrot-edge-secret": variables.PARROT_EDGE_SECRET, "x-parrot-original-path": path,
        "content-type": "application/json", origin: variables.BETTER_AUTH_URL,
        "cf-connecting-ip": "192.0.2.4", cookie, ...extraHeaders },
    }));
    assert.equal((await handler(new Request("https://backend.test"))).status, 401);
    assert.equal((await call("/api/../private")).status, 400);
    assert.equal((await call("/api/learner-profiles")).status, 401);
    const signup = await call("/api/auth/sign-up/email", "POST", { name: "Mary", email: "mary@example.test", password: "test-password-123" }, { "x-captcha-response": "test-proof" });
    assert.equal(signup.status, 200, await signup.clone().text());
    cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.match(cookie, /session_token=/);
    assert.equal((await call("/api/auth/get-session")).status, 200);
    assert.equal((await call("/api/learner-profiles", "POST", { name: "Mary" })).status, 403);
    assert.equal((await call("/api/guardian-access", "POST")).status, 200);
    const learner = await call("/api/learner-profiles", "POST", { name: "Mary" });
    assert.equal(learner.status, 200, await learner.clone().text());
    const roster = await call("/api/learner-profiles");
    assert.equal(roster.status, 200, await roster.clone().text());
    assert.match(await roster.text(), /Mary/);
    const duplicate = await call("/api/learner-profiles", "POST", { name: "Mary" });
    assert.equal(duplicate.status, 409, await duplicate.clone().text());
    await call("/api/auth/sign-out", "POST", {});
    assert.equal((await call("/api/learner-profiles")).status, 401);
    cookie = "";
    const signin = await call("/api/auth/sign-in/email", "POST", { email: "mary@example.test", password: "test-password-123" });
    assert.equal(signin.status, 200, await signin.clone().text());
    const signedInCookie = signin.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const guest = await call("/api/auth/sign-in/shared-guest", "POST", {}, { "x-captcha-response": "test-proof" });
    assert.equal(guest.status, 200, await guest.clone().text());
    assert.equal((await guest.json()).user.id, "shared-guest-user");

    const db = createPostgresBinding(pool);
    const account = (await pool.query('SELECT id FROM "user" WHERE email = $1', ["mary@example.test"])).rows[0];
    const session = (await pool.query("SELECT id FROM session WHERE user_id = $1 LIMIT 1", [account.id])).rows[0];
    const mary = (await pool.query("SELECT id FROM learner_profile WHERE auth_user_id = $1", [account.id])).rows[0];
    const database = createDatabase(db);
    const identity = { userId: account.id, userEmail: "mary@example.test", sessionId: session.id, learnerProfileId: mary.id, privateMediaName: "Mary" };
    const profiles = createLearnerProfileRepository(database);
    assert.deepEqual(await profiles.saveLessonRecordingConsent(identity, true), { enabled: true, generation: 1, cleanupBeforeGeneration: null });
    assert.deepEqual(await profiles.saveLessonRecordingConsent(identity, false), { enabled: false, generation: 2, cleanupBeforeGeneration: 2 });
    await profiles.clearLessonRecordingCleanup(identity, 1);
    assert.equal((await profiles.readLessonRecordingConsentState(identity)).cleanupBeforeGeneration, 2);
    await profiles.clearLessonRecordingCleanup(identity, 2);
    assert.equal((await profiles.readLessonRecordingConsentState(identity)).cleanupBeforeGeneration, null);
    await pool.query("INSERT INTO learner_profile (id,auth_user_id,name,private_media_name,name_key) VALUES ($1,$2,'Sam','Sam','sam')", ["learner-sam", account.id]);
    const deletionBucket = createPrivateMediaBucket(pool);
    const deleted = await Promise.allSettled([mary.id, "learner-sam"].map((profileId) => prepareLearnerDeletion({ database, identity, profileId, bucket: deletionBucket })));
    assert.equal(deleted.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(deleted.find(({ status }) => status === "rejected").reason.code, "last_learner");
    assert.equal((await pool.query("SELECT count(*) FROM learner_profile WHERE auth_user_id = $1", [account.id])).rows[0].count, "1");
    assert.equal(postgresQuery("SELECT '?' AS `?`, ? -- ?\n/* ? */"), "SELECT '?' AS \"?\", $1 -- ?\n/* ? */");
    await db.prepare("CREATE TABLE batch_test (id integer PRIMARY KEY, count integer NOT NULL)").run();
    await db.prepare("INSERT INTO batch_test VALUES (?, ?)").bind(1, 0).run();
    await assert.rejects(db.batch([db.prepare("UPDATE batch_test SET count = 99"), db.prepare("INSERT INTO batch_test VALUES (1, 0)")]));
    assert.equal(await db.prepare("SELECT count FROM batch_test").first("count"), 0);
    const claims = await Promise.all(Array.from({ length: 4 }, () => db.batch([
      db.prepare("UPDATE batch_test SET count = count + 1 WHERE count = 0 RETURNING count"),
    ])));
    assert.equal(claims.filter(([result]) => result.meta.changes === 1).length, 1);

    const bucket = createPrivateMediaBucket(pool);
    const first = await bucket.put("recording/test", Buffer.from("audio"), { onlyIf: { etagDoesNotMatch: "*" }, customMetadata: { consent: "1" }, httpMetadata: { contentType: "audio/webm" } });
    assert.ok(first.etag);
    assert.equal(await bucket.put("recording/test", Buffer.from("replacement"), { onlyIf: { etagDoesNotMatch: "*" } }), null);
    const updated = await bucket.put("recording/test", Buffer.from("second"), { onlyIf: { etagMatches: first.etag } });
    assert.ok(updated);
    assert.equal(await bucket.put("recording/test", Buffer.from("stale"), { onlyIf: { etagMatches: first.etag } }), null);
    assert.equal((await bucket.get("recording/test", { onlyIf: { etagMatches: first.etag } })).body, undefined);
    assert.equal(await (await bucket.get("recording/test", { range: { offset: 1, length: 3 } })).text(), "eco");
    assert.equal((await bucket.list({ prefix: "recording/" })).objects.length, 1);
    await bucket.delete("recording/test");
    assert.equal(await bucket.head("recording/test"), null);
    const limiter = createRateLimiter(pool, "test", 2);
    const limited = await Promise.all([limiter.limit({ key: "client" }), limiter.limit({ key: "client" }), limiter.limit({ key: "client" })]);
    assert.equal(limited.filter(({ success }) => success).length, 2);

    const gatewayVariables = { PARROT_BACKEND_URL: "https://pilot.cn-hangzhou.fcapp.run", PARROT_EDGE_SECRET: variables.PARROT_EDGE_SECRET };
    const captchaFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (new URL(input).hostname.endsWith(".cn-hangzhou.fcapp.run")) {
        assert.equal(init.headers.get("cf-connecting-ip"), "192.0.2.4");
        assert.equal(init.headers.get("x-forwarded-for"), null);
        assert.equal(init.headers.get("x-parrot-edge-secret"), variables.PARROT_EDGE_SECRET);
        return handler(new Request(input, init));
      }
      return captchaFetch(input, init);
    };
    const proxied = await gateway.fetch(new Request("https://example.test/api/learner-profiles", {
      headers: { cookie: signedInCookie, "Ali-Cdn-Real-Ip": "192.0.2.4", "cf-connecting-ip": "forged", "x-forwarded-for": "forged", "x-parrot-edge-secret": "forged" },
    }), {}, gatewayVariables);
    assert.equal(proxied.status, 200, await proxied.clone().text());
    assert.equal(proxied.headers.get("cache-control"), "private, no-store");
    assert.equal((await gateway.fetch(new Request("https://example.test/api/learner-profiles"), {}, gatewayVariables)).status, 503);
    globalThis.fetch = captchaFetch;

    cookie = signedInCookie;
    const deletion = await call("/api/auth/delete-user", "POST", { password: "test-password-123" });
    assert.equal(deletion.status, 200, await deletion.clone().text());
    assert.equal((await pool.query('SELECT count(*) FROM "user" WHERE id = $1', [account.id])).rows[0].count, "0");
    assert.equal((await pool.query("SELECT count(*) FROM account_deletion_tombstone")).rows[0].count, "1");

    server = createHttpServer(async () => new Response("ok", { headers: [["set-cookie", "one=1; Secure"], ["set-cookie", "two=2; Secure"]] }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual(response.headers.getSetCookie(), ["one=1; Secure", "two=2; Secure"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    rmSync(output, { recursive: true, force: true });
  }
});
