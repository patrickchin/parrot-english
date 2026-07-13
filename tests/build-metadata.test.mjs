import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBuildMetadata } from "../scripts/build-metadata.mjs";

describe("deployment build metadata", () => {
  it("creates one semver version and short Git SHA for every deployed component", () => {
    assert.deepEqual(
      createBuildMetadata({
        commitCount: "315",
        commitSha: "ABCDEF1234567890",
        packageVersion: "2.4.0",
      }),
      {
        commitSha: "abcdef1",
        version: "2.4.315",
      },
    );
  });

  it("rejects placeholder or malformed deployment metadata", () => {
    assert.throws(
      () =>
        createBuildMetadata({
          commitCount: "315",
          commitSha: "local",
          packageVersion: "2.4.0",
        }),
      /Git commit SHA/,
    );
    assert.throws(
      () =>
        createBuildMetadata({
          commitCount: "shallow",
          commitSha: "abcdef1",
          packageVersion: "2.4.0",
        }),
      /commit count/,
    );
  });
});
