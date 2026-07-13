import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the account About panel is wired to deployed component metadata", () => {
  const header = readFileSync(
    new URL("../src/app/AppHeader.tsx", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  const agent = readFileSync(
    new URL("../agent/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(header, />About</);
  assert.match(header, /About Parrot English/);
  assert.match(header, /\/api\/build-info/);
  assert.match(worker, /\/api\/build-info/);
  assert.match(agent, /reportBuild/);
});
