import { execFileSync } from "node:child_process";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DATABASE = "parrot-english";
const USAGE = `Usage: npm run inspect:private-media -- (--local | --remote) [--account]

Prints each account email and learner name beside the exact private R2 prefix.
This command is read-only, but its output contains private account data.`;

function parseArguments(arguments_) {
  let promptForAccount = false;
  let target;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--local" || argument === "--remote") {
      if (target) throw new Error("Choose exactly one of --local or --remote.");
      target = argument;
      continue;
    }
    if (argument === "--account") {
      promptForAccount = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!target) throw new Error("Choose exactly one of --local or --remote.");
  return { promptForAccount, target };
}

export function privateMediaPrefix(userId, learnerProfileId) {
  return `accounts/${encodeURIComponent(userId)}/learners/${encodeURIComponent(learnerProfileId)}/recordings/`;
}

export function parsePrivateMediaRows(payload) {
  if (!Array.isArray(payload) || payload.some(({ success }) => success !== true)) {
    throw new Error("Wrangler did not return a successful D1 result.");
  }
  return payload.flatMap(({ results }) => results ?? []).map((row) => {
    if (
      typeof row.account_email !== "string" ||
      typeof row.user_id !== "string" ||
      typeof row.learner_profile_id !== "string"
    ) {
      throw new Error("D1 returned an invalid private-media directory row.");
    }
    return {
      accountEmail: row.account_email,
      learnerName:
        typeof row.learner_name === "string" && row.learner_name.trim()
          ? row.learner_name.trim()
          : "(unnamed learner)",
      learnerProfileId: row.learner_profile_id,
      userId: row.user_id,
    };
  });
}

export function formatPrivateMediaDirectory(rows, accountEmail) {
  const selected = accountEmail
    ? rows.filter(
        (row) =>
          row.accountEmail.toLocaleLowerCase() ===
          accountEmail.toLocaleLowerCase(),
      )
    : rows;
  if (selected.length === 0) return "No matching learner profiles.";
  if (accountEmail && new Set(selected.map(({ userId }) => userId)).size !== 1) {
    throw new Error("The account email did not resolve to one account.");
  }

  const lines = [];
  let previousAccount;
  for (const row of selected) {
    if (row.accountEmail !== previousAccount) {
      if (lines.length > 0) lines.push("");
      lines.push(JSON.stringify(row.accountEmail));
      previousAccount = row.accountEmail;
    }
    lines.push(`  ${JSON.stringify(row.learnerName)}`);
    lines.push(
      `    ${privateMediaPrefix(row.userId, row.learnerProfileId)}`,
    );
    lines.push("      lessons/");
    lines.push("      nursery-rhymes/");
  }
  return lines.join("\n");
}

function loadDirectory(target) {
  const query = `SELECT
    account.email AS account_email,
    account.id AS user_id,
    learner.name AS learner_name,
    learner.id AS learner_profile_id
  FROM user AS account
  JOIN learner_profile AS learner ON learner.auth_user_id = account.id
  ORDER BY account.email COLLATE NOCASE, learner.name COLLATE NOCASE, learner.id`;
  const output = execFileSync(
    "wrangler",
    ["d1", "execute", DATABASE, target, "--json", "--command", query],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return parsePrivateMediaRows(JSON.parse(output));
}

async function promptForAccountEmail() {
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = (await prompts.question("Account email: ")).trim();
    if (!email) throw new Error("Account email is required.");
    return email;
  } finally {
    prompts.close();
  }
}

async function main() {
  try {
    const { promptForAccount, target } = parseArguments(process.argv.slice(2));
    const accountEmail = promptForAccount
      ? await promptForAccountEmail()
      : undefined;
    console.log(formatPrivateMediaDirectory(loadDirectory(target), accountEmail));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(`\n${USAGE}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
