/* global process */

import assert from "node:assert/strict";
import test from "node:test";

test("the frontend build publishes supplied release metadata to the app", async () => {
  const previousVersion = process.env.PARROT_FRONTEND_VERSION;
  const previousCommit = process.env.PARROT_FRONTEND_COMMIT_SHA;
  process.env.PARROT_FRONTEND_VERSION = "7.8.9";
  process.env.PARROT_FRONTEND_COMMIT_SHA = "abcdef0";

  try {
    const { default: config } = await import(
      `../vite.config.ts?version-badge=${Date.now()}`
    );

    assert.equal(
      JSON.parse(config.define["import.meta.env.VITE_PARROT_APP_VERSION"]),
      "7.8.9",
    );
    assert.equal(
      JSON.parse(config.define["import.meta.env.VITE_PARROT_COMMIT_SHA"]),
      "abcdef0",
    );
  } finally {
    if (previousVersion === undefined) delete process.env.PARROT_FRONTEND_VERSION;
    else process.env.PARROT_FRONTEND_VERSION = previousVersion;
    if (previousCommit === undefined) delete process.env.PARROT_FRONTEND_COMMIT_SHA;
    else process.env.PARROT_FRONTEND_COMMIT_SHA = previousCommit;
  }
});
