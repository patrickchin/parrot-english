import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createBuildMetadata,
  resolveBuildCommitSha,
} from "../scripts/build-metadata.mjs";
import {
  ensureWorkersCiHistory,
  injectWorkersCiMetadata,
} from "../scripts/prepare-workers-ci-metadata.mjs";

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

  it("fetches missing Workers CI ancestry without historical file contents", () => {
    const gitCalls = [];

    assert.equal(
      ensureWorkersCiHistory({
        env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" },
        runGit(args) {
          gitCalls.push(args);
          return args[0] === "rev-parse" ? "true" : "";
        },
      }),
      true,
    );
    assert.deepEqual(gitCalls, [
      ["rev-parse", "--is-shallow-repository"],
      [
        "fetch",
        "--unshallow",
        "--filter=blob:none",
        "--no-tags",
        "origin",
        "refs/heads/main",
      ],
    ]);
  });

  it("turns a shallow checkout into a complete commit graph", (context) => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "parrot-build-history-"));
    const source = join(temporaryRoot, "source");
    const checkout = join(temporaryRoot, "checkout");
    context.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

    execFileSync("git", ["init", "--quiet", "--initial-branch=main", source]);
    execFileSync("git", ["config", "user.email", "test@example.test"], {
      cwd: source,
    });
    execFileSync("git", ["config", "user.name", "Parrot Test"], {
      cwd: source,
    });
    execFileSync("git", ["config", "uploadpack.allowFilter", "true"], {
      cwd: source,
    });
    for (let commit = 1; commit <= 3; commit += 1) {
      writeFileSync(join(source, "version.txt"), `${commit}\n`);
      execFileSync("git", ["add", "version.txt"], { cwd: source });
      execFileSync("git", ["commit", "--quiet", "-m", `commit ${commit}`], {
        cwd: source,
      });
    }
    execFileSync(
      "git",
      ["clone", "--quiet", "--depth=1", `file://${source}`, checkout],
    );

    assert.equal(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: checkout,
        encoding: "utf8",
      }).trim(),
      "1",
    );
    assert.equal(
      ensureWorkersCiHistory({
        cwd: checkout,
        env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" },
      }),
      true,
    );
    assert.equal(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: checkout,
        encoding: "utf8",
      }).trim(),
      "3",
    );
    assert.match(
      execFileSync("git", ["rev-list", "--objects", "--missing=print", "HEAD"], {
        cwd: checkout,
        encoding: "utf8",
      }),
      /^\?/m,
    );
  });

  it("does not fetch history outside a shallow Workers CI checkout", () => {
    let gitCallCount = 0;
    const runGit = () => {
      gitCallCount += 1;
      return "false";
    };

    assert.equal(ensureWorkersCiHistory({ env: {}, runGit }), false);
    assert.equal(
      ensureWorkersCiHistory({
        env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" },
        runGit,
      }),
      false,
    );
    assert.equal(gitCallCount, 1);
  });

  it("fails a shallow Workers build without an explicit branch", () => {
    assert.throws(
      () =>
        ensureWorkersCiHistory({
          env: { WORKERS_CI: "1" },
          runGit: () => "true",
        }),
      /Workers CI branch/,
    );
  });
});
