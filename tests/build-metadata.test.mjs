/* global process */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createBuildMetadata,
  resolveBuildCommitSha,
} from "../scripts/build-metadata.mjs";
import {
  assertWorkersCiIsNotProduction,
  ensureWorkersCiHistory,
  injectWorkersCiMetadata,
  prepareWorkersCiMetadata,
} from "../scripts/prepare-workers-ci-metadata.mjs";

describe("deployment build metadata", () => {
  it("blocks ambiguous Workers builds in the configured prebuild before Git", (context) => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "parrot-prebuild-guard-"));
    const binDirectory = join(temporaryRoot, "bin");
    const gitMarker = join(temporaryRoot, "git-called");
    mkdirSync(binDirectory);
    writeFileSync(
      join(binDirectory, "git"),
      '#!/bin/sh\n: > "$PARROT_GIT_SENTINEL"\nexit 42\n',
      { mode: 0o755 },
    );
    context.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

    for (const branch of [undefined, "", "   ", "main", " main "]) {
      const env = {
        ...process.env,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
        PARROT_GIT_SENTINEL: gitMarker,
        WORKERS_CI: "1",
      };
      if (branch === undefined) delete env.WORKERS_CI_BRANCH;
      else env.WORKERS_CI_BRANCH = branch;

      assert.throws(
        () =>
          execFileSync("npm", ["run", "prebuild"], {
            cwd: fileURLToPath(new URL("../", import.meta.url)),
            encoding: "utf8",
            env,
            stdio: ["ignore", "pipe", "pipe"],
          }),
        (error) => {
          assert.match(error.stderr, /explicit non-production branch/i);
          return true;
        },
      );
      assert.equal(existsSync(gitMarker), false);
    }
  });

  it("preserves preview Workers builds and the guarded GitHub workflow", () => {
    assert.doesNotThrow(() =>
      assertWorkersCiIsNotProduction({
        env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "feature-preview" },
      }),
    );
    assert.equal(
      prepareWorkersCiMetadata({ env: { GITHUB_REF_NAME: "main" } }),
      false,
    );
  });

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
