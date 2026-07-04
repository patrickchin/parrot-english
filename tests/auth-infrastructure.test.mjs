import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("authentication infrastructure", () => {
  it("configures Better Auth and a local-capable D1 binding", () => {
    const packageJson = JSON.parse(readProjectFile("package.json"));
    const wrangler = readProjectFile("wrangler.jsonc");
    const tsconfig = readProjectFile("tsconfig.json");
    const devVars = readProjectFile(".dev.vars.example");
    const workerTypes = readProjectFile("worker-configuration.d.ts");

    assert.match(packageJson.dependencies["better-auth"], /^\^1\.6\./);
    assert.equal(
      packageJson.scripts["db:migrate:local"],
      "wrangler d1 migrations apply parrot-english-auth --local"
    );
    assert.match(wrangler, /"nodejs_compat"/);
    assert.match(wrangler, /"binding"\s*:\s*"DB"/);
    assert.match(wrangler, /"database_name"\s*:\s*"parrot-english-auth"/);
    assert.match(wrangler, /"migrations_dir"\s*:\s*"migrations"/);
    assert.doesNotMatch(wrangler, /"database_id"\s*:/);
    assert.match(tsconfig, /worker-configuration\.d\.ts/);
    assert.equal(
      devVars,
      "GROQ_API_KEY=your_groq_api_key_here\n" +
        "BETTER_AUTH_SECRET=replace_with_at_least_32_random_characters\n" +
        "BETTER_AUTH_URL=http://localhost:3000\n"
    );
    assert.match(workerTypes, /\bDB:\s*D1Database;/);
    assert.match(workerTypes, /\bdeclare abstract class D1Database\b/);
    assert.match(workerTypes, /\btype Fetcher</);
  });
});
