import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

void app;

describe("lesson routing UI", () => {
  it("mounts the app inside React Router", () => {
    assert.equal(typeof packageManifest.dependencies["react-router"], "string");
    assert.match(main, /import \{ BrowserRouter \} from "react-router"/);
    assert.match(main, /<BrowserRouter>/);
    assert.match(main, /<App \/>/);
    assert.match(main, /<\/BrowserRouter>/);
  });
});
