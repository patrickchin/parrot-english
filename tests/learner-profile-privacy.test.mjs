import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as privacy from "../lib/learner-profile-privacy.ts";

describe("learner profile privacy", () => {
  it("detects explicit private details in child profile prose", () => {
    for (const value of [
      "Mia attends Rainbow School.",
      "Mia goes to Rainbow Primary.",
      "Mia's school is Rainbow Primary.",
      "Mia lives at 14 River Road.",
      "Mia's home address is 14 River Road.",
      "Mia's phone number is +44 7700 900123.",
      "Contact Mia at mia@example.com.",
      "Mia's Instagram username is @mia123.",
      "Mia's password is dragon123.",
      "Mia's secret code is 1234.",
      "Mia's secret is dragon.",
      "My school: Rainbow Academy",
      "Phone: 12345",
      "Instagram: mia_8",
      "Password: dragon123",
      "小明的学校是彩虹小学。",
    ]) {
      assert.equal(
        privacy.containsPrivateLearnerProfileDetails(value),
        true,
        value,
      );
    }
  });

  it("allows harmless interests that contain privacy-adjacent words", () => {
    for (const value of [
      "Mia likes school buses.",
      "Mia likes secret-agent stories.",
      "Mia plays contact sports.",
      "Mia likes mobile games.",
      "Mia likes primary colours.",
      "Mia draws at home.",
    ]) {
      assert.equal(
        privacy.containsPrivateLearnerProfileDetails(value),
        false,
        value,
      );
    }
  });

  it("recognizes a likely multi-word full name only after canonical extraction", () => {
    assert.equal(typeof privacy.looksLikeFullLearnerName, "function");
    assert.equal(privacy.looksLikeFullLearnerName("Mia Smith"), true);
    assert.equal(privacy.looksLikeFullLearnerName("John van Doe"), true);
    assert.equal(privacy.looksLikeFullLearnerName("Иван Петров"), true);
    assert.equal(privacy.looksLikeFullLearnerName("محمد علي"), true);
    assert.equal(privacy.looksLikeFullLearnerName("王小明"), true);
    assert.equal(privacy.looksLikeFullLearnerName("欧阳娜娜"), true);
    assert.equal(privacy.looksLikeFullLearnerName("Mia"), false);
    assert.equal(privacy.looksLikeFullLearnerName("Mary-Jane"), false);
    assert.equal(privacy.looksLikeFullLearnerName("D'Angelo"), false);
    assert.equal(privacy.looksLikeFullLearnerName("小明"), false);
  });

  it("detects a surname retained only in the About summary", () => {
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "Mia",
        "Mia Smith likes pandas.",
      ),
      true,
    );
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "Mia",
        "Mia Smith and her cat play.",
      ),
      true,
    );
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "Harry",
        "Harry Potter stories are fun.",
      ),
      true,
    );
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "محمد",
        "محمد علي likes pandas.",
      ),
      true,
    );
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "小明",
        "王小明 likes pandas.",
      ),
      true,
    );
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "Mia",
        "Mia really likes school buses and contact sports.",
      ),
      false,
    );
    assert.equal(
      privacy.containsLikelyFullLearnerName(
        "Mia",
        "Mia dreams about friendly dragons.",
      ),
      false,
    );
  });
});
