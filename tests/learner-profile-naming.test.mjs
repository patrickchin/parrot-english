import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const activeSourceRoots = [
  ".maestro",
  "agent",
  "content",
  "lib",
  "public/assets/audio",
  "src",
  "tests",
  "worker",
];

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

test("active learner-profile files use the broader domain name", () => {
  const legacyNamedFiles = activeSourceRoots
    .flatMap((root) => listFiles(resolve(repositoryRoot, root)))
    .map((path) => relative(repositoryRoot, path))
    .filter((path) => /onboarding/i.test(path));

  assert.deepEqual(legacyNamedFiles, []);
});
