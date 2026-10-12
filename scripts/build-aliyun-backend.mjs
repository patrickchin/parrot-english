import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync, unlinkSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { Buffer } from "node:buffer";

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Build with Node.js 24 or newer.");
const directory = "build/aliyun";
rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true });
await build({ entryPoints: ["backend/server.mjs"], outfile: `${directory}/backend.cjs`, bundle: true,
  platform: "node", format: "cjs", target: "node24", packages: "bundle", sourcemap: false,
});
copyFileSync("backend/mysql-baseline.sql", `${directory}/mysql-baseline.sql`);
if (process.argv.includes("--package-runtime")) {
  // CI packages the official Linux runtime; never upload a macOS node binary.
  const version = process.version;
  const name = `node-${version}-linux-x64.tar.xz`;
  const base = `https://nodejs.org/dist/${version}/`;
  const download = async (file) => {
    const response = await fetch(base + file);
    if (!response.ok) throw new Error(`Official Node download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const archive = await download(name);
  const checksums = (await download("SHASUMS256.txt")).toString("utf8");
  const expected = checksums.split("\n").find((line) => line.endsWith(`  ${name}`))?.split(" ")[0];
  if (!expected || createHash("sha256").update(archive).digest("hex") !== expected) throw new Error("Node archive checksum mismatch.");
  writeFileSync(`${directory}/${name}`, archive);
  mkdirSync(`${directory}/node/bin`, { recursive: true });
  execFileSync("tar", ["-xJf", `${directory}/${name}`, "--strip-components=2", "-C", `${directory}/node/bin`, `node-${version}-linux-x64/bin/node`]);
  unlinkSync(`${directory}/${name}`);
  const ca = process.env.RDS_CA_PATH;
  if (!ca || !readFileSync(ca, "utf8").includes("-----BEGIN CERTIFICATE-----")) throw new Error("RDS_CA_PATH must point to the database CA downloaded from the cluster console.");
  copyFileSync(ca, `${directory}/rds-ca.pem`);
  writeFileSync(`${directory}/bootstrap`, '#!/bin/sh\ncd /code\nexec /code/node/bin/node -e \'require("./backend.cjs").startBackend().catch(() => { console.error("Backend startup failed"); process.exit(1); })\'\n');
  chmodSync(`${directory}/bootstrap`, 0o755);
}
