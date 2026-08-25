import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPrivateStoryPreviewBuild } from "../scripts/build-private-story-preview.mjs";

describe("private story preview build wrapper", () => {
  it("spawns npm run build through Node with a child-only preview flag", () => {
    const environment = { PATH: "/synthetic/bin" };
    let invocation;

    const status = runPrivateStoryPreviewBuild({
      environment,
      nodeExecutable: "/synthetic/node",
      npmExecPath: "/synthetic/npm-cli.js",
      spawnSyncImplementation(command, args, options) {
        invocation = { args, command, options };
        return { status: 7 };
      },
    });

    assert.equal(status, 7);
    assert.deepEqual(invocation, {
      command: "/synthetic/node",
      args: ["/synthetic/npm-cli.js", "run", "build"],
      options: {
        env: {
          PATH: "/synthetic/bin",
          PARROT_PRIVATE_STORY_PREVIEW: "1",
        },
        stdio: "inherit",
      },
    });
    assert.deepEqual(environment, { PATH: "/synthetic/bin" });
  });

  it("fails before spawning when npm_execpath is unavailable", () => {
    let spawned = false;

    assert.throws(
      () =>
        runPrivateStoryPreviewBuild({
          environment: {},
          npmExecPath: "",
          spawnSyncImplementation() {
            spawned = true;
          },
        }),
      /must be run through npm/,
    );
    assert.equal(spawned, false);
  });

  it("propagates a child process error", () => {
    const childError = new Error("synthetic spawn failure");

    assert.throws(
      () =>
        runPrivateStoryPreviewBuild({
          npmExecPath: "/synthetic/npm-cli.js",
          spawnSyncImplementation() {
            return { error: childError, status: null };
          },
        }),
      (error) => error === childError,
    );
  });
});
