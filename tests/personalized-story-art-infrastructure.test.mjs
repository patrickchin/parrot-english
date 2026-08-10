import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function projectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("personalized story art infrastructure", () => {
  it("declares private R2, Workers AI, a dedicated limiter, and both activation approvals", () => {
    const wrangler = JSON.parse(projectFile("wrangler.jsonc"));

    assert.equal(wrangler.ai?.binding, "AI");
    assert.ok(
      wrangler.r2_buckets?.some(
        ({ binding, bucket_name: bucketName }) =>
          binding === "PERSONALIZED_STORY_ART_BUCKET" &&
          bucketName === "parrot-english-personalized-story-art",
      ),
    );
    assert.ok(
      wrangler.ratelimits?.some(
        ({ name, namespace_id: namespaceId, simple }) =>
          name === "PERSONALIZED_STORY_ART_RATE_LIMITER" &&
          namespaceId === "104205" &&
          simple?.limit === 2 &&
          simple?.period === 60,
      ),
    );
    assert.equal(wrangler.vars?.PERSONALIZED_STORY_ART_ENABLED, "1");
    assert.equal(wrangler.vars?.PERSONALIZED_STORY_ART_DATA_APPROVED, "1");
  });

  it("uses a distinct preview bucket for personalized story art", () => {
    const wrangler = JSON.parse(projectFile("wrangler.jsonc"));
    const storyArtBucket = wrangler.r2_buckets?.find(
      ({ binding }) => binding === "PERSONALIZED_STORY_ART_BUCKET",
    );

    assert.equal(
      storyArtBucket?.preview_bucket_name,
      "parrot-english-personalized-story-art-preview",
    );
    assert.notEqual(
      storyArtBucket?.preview_bucket_name,
      storyArtBucket?.bucket_name,
    );
  });

  it("keeps generated Cloudflare binding types in sync with deployment config", () => {
    const workerTypes = projectFile("worker-configuration.d.ts");
    assert.match(workerTypes, /AI:\s*Ai;/);
    assert.match(workerTypes, /PERSONALIZED_STORY_ART_BUCKET:\s*R2Bucket;/);
    assert.match(workerTypes, /PERSONALIZED_STORY_ART_RATE_LIMITER:\s*RateLimit;/);
    assert.match(workerTypes, /PERSONALIZED_STORY_ART_ENABLED:\s*"1";/);
    assert.match(workerTypes, /PERSONALIZED_STORY_ART_DATA_APPROVED:\s*"1";/);
  });
});
