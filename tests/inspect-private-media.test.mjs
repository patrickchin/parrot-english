import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPrivateMediaDirectory,
  parsePrivateMediaRows,
  privateMediaPrefix,
} from "../scripts/inspect-private-media.mjs";

describe("private-media operator directory", () => {
  it("maps human account and learner labels to encoded canonical prefixes", () => {
    const rows = parsePrivateMediaRows([
      {
        results: [
          {
            account_email: "guardian@example.test",
            learner_name: "Mary",
            learner_profile_id: "learner/two",
            user_id: "user/one",
          },
        ],
        success: true,
      },
    ]);

    assert.equal(
      privateMediaPrefix("user/one", "learner/two"),
      "accounts/user%2Fone/learners/learner%2Ftwo/recordings/",
    );
    assert.equal(
      formatPrivateMediaDirectory(rows),
      [
        '"guardian@example.test"',
        '  "Mary"',
        "    accounts/user%2Fone/learners/learner%2Ftwo/recordings/",
        "      lessons/",
        "      nursery-rhymes/",
      ].join("\n"),
    );
  });

  it("filters accounts without putting email addresses into R2 keys", () => {
    const rows = [
      {
        accountEmail: "first@example.test",
        learnerName: "Bob",
        learnerProfileId: "learner-a",
        userId: "user-a",
      },
      {
        accountEmail: "second@example.test",
        learnerName: "Mary",
        learnerProfileId: "learner-b",
        userId: "user-b",
      },
    ];

    assert.equal(
      formatPrivateMediaDirectory(rows, "SECOND@example.test"),
      [
        '"second@example.test"',
        '  "Mary"',
        "    accounts/user-b/learners/learner-b/recordings/",
        "      lessons/",
        "      nursery-rhymes/",
      ].join("\n"),
    );
    assert.equal(
      formatPrivateMediaDirectory(rows, "missing@example.test"),
      "No matching learner profiles.",
    );
  });

  it("escapes stored labels before writing them to an operator terminal", () => {
    const output = formatPrivateMediaDirectory([
      {
        accountEmail: "guardian@example.test",
        learnerName: "Mary\naccounts/fake/recordings/\u001b[2J",
        learnerProfileId: "learner-a",
        userId: "user-a",
      },
    ]);

    assert.match(output, /Mary\\naccounts\/fake\/recordings\/\\u001b\[2J/);
    assert.doesNotMatch(output, /Mary\naccounts/);
    assert.equal(output.includes("\u001b"), false);
  });
});
