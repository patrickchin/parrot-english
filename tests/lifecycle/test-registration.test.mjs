import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

test("registers the lifecycle suite as a focused and full npm check", () => {
  assert.equal(
    packageJson.scripts["test:lifecycle"],
    "node --test tests/lifecycle/*.test.mjs",
  );
  assert.match(packageJson.scripts.test, /tests\/lifecycle\/\*\.test\.mjs/);
});
