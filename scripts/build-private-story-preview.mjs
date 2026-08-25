import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function runPrivateStoryPreviewBuild({
  environment = process.env,
  nodeExecutable = process.execPath,
  npmExecPath = environment.npm_execpath,
  spawnSyncImplementation = spawnSync,
} = {}) {
  if (typeof npmExecPath !== "string" || !npmExecPath.trim()) {
    throw new Error("Private story preview builds must be run through npm");
  }

  const result = spawnSyncImplementation(
    nodeExecutable,
    [npmExecPath, "run", "build"],
    {
      env: { ...environment, PARROT_PRIVATE_STORY_PREVIEW: "1" },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPrivateStoryPreviewBuild();
}
