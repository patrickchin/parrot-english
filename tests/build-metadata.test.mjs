import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBuildMetadata,
  resolveBuildCommitSha,
} from "../scripts/build-metadata.mjs";
import { injectWorkersCiMetadata } from "../scripts/prepare-workers-ci-metadata.mjs";

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

  it("prefers the commit supplied by Cloudflare Workers Builds", () => {
    assert.equal(
      resolveBuildCommitSha(
        {
          GITHUB_SHA: "1111111111111111111111111111111111111111",
          WORKERS_CI_COMMIT_SHA: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        },
        "2222222222222222222222222222222222222222",
      ),
      "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    );
  });

  it("injects runtime metadata into the ephemeral Workers CI config", () => {
    const configured = JSON.parse(
      injectWorkersCiMetadata(
        JSON.stringify({
          name: "parrot-english",
          vars: { REALTIME_CONVERSATIONS_ENABLED: "1" },
        }),
        { commitSha: "abcdef1", version: "0.1.312" },
      ),
    );

    assert.deepEqual(configured.vars, {
      PARROT_BACKEND_COMMIT_SHA: "abcdef1",
      PARROT_BACKEND_VERSION: "0.1.312",
      REALTIME_CONVERSATIONS_ENABLED: "1",
    });
  });
});
