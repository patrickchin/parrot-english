# Personalized Story Art

## Goal

Add one tightly bounded personalized-art slice for children’s story content without
turning Parrot English into a general photo-storage feature.

The first shippable slice is:

- one generated derivative for **The Red Ball** page 1 (`the-red-ball` / `my-red-ball`);
- the same derivative reused as the lesson **"You"** speaking portrait during user turns;
- one story only, one derivative only, one owner only;
- explicit guardian attestation required every time art is generated;
- original learner photo never stored.

This plan is grounded in the current story and lesson seams already referenced by:

- [src/stories/story-script-candidates.ts](../../src/stories/story-script-candidates.ts)
- [src/stories/StoryReader.tsx](../../src/stories/StoryReader.tsx)
- [src/stories/StoryArtwork.tsx](../../src/stories/StoryArtwork.tsx)
- [src/lessons/LessonPlayerUi.tsx](../../src/lessons/LessonPlayerUi.tsx)
- [tests/personalized-story-art-ui.test.mjs](../../tests/personalized-story-art-ui.test.mjs)
- [tests/personalized-story-art-client.test.mjs](../../tests/personalized-story-art-client.test.mjs)
- [tests/personalized-story-art-worker.test.mjs](../../tests/personalized-story-art-worker.test.mjs)
- [tests/e2e/personalized-story-art.spec.ts](../../tests/e2e/personalized-story-art.spec.ts)

## Why This Slice

The repository already treats stories and lessons as bounded presentation layers,
not general media stores:

- stories are durable route-backed reader content under `/stories/...`;
- learner lessons are owner-scoped JSON under `/api/lessons/my/*`;
- current public R2 media is only for approved non-personal background art, not
  for private learner media. See [background-media-r2.md](../deployment/background-media-r2.md).

The smallest useful personalized-art slice therefore is not "upload any photo
and use it everywhere". It is "generate one watercolor-style derivative for one
known story page, then reuse that derivative as the learner portrait in one
existing lesson seam."

## Investigated UI Seams

The current seam contracts already point to the intended first use sites:

1. **Story reader override**
   The tests expect page 1 of **The Red Ball** to prefer a private override image
   over the placeholder artwork, without mutating the checked-in story catalog.

2. **Lesson user portrait**
   The tests expect a learner speaking turn to render the same private image as
   an accessible storybook portrait for the `"user"` speaker path.

3. **Guardian-controlled opt-in panel**
   The tests expect a dedicated panel with:
   - a guardian consent checkbox;
   - learner photo upload;
   - generate state;
   - remove state.

These seams are sufficient for a vertical slice without inventing a new route
family or broad gallery UI.

## Exact Vertical Slice

### Scope

- Story: `the-red-ball`
- Page: `my-red-ball`
- Story alt text: `You holding a bright red ball`
- Lesson portrait alt text: `You in storybook style`
- Provider: Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`
- Base scene reference: `public/assets/personalization/the-red-ball-scene-reference.webp`
- Storage: one private R2 derivative per owner and story

### Concept Preview

The current synthetic concept preview is embedded below:

![Synthetic personalized story art preview](assets/personalized-story-art-preview.png)

This preview uses a **fully synthetic learner reference**, not a real learner
photo. It is only a design aid for the record. The intended checked-in base
scene input for the generated slice is:

- `public/assets/personalization/the-red-ball-scene-reference.webp`

### Out of Scope

- storing the original learner photo;
- multi-story support;
- multiple derivatives or history;
- admin review tooling;
- background jobs or queues;
- sharing across users or accounts;
- public URLs;
- account-deletion activation before purge proof exists.

## Data Flow

The intended first-pass flow is:

1. **Browser normalization**
   The browser accepts one learner photo and normalizes it to one metadata-free
   centered PNG before upload.

   Current contract anchor:

   - `480 x 480` centered PNG
   - EXIF, ICC, XMP, and IPTC removed

   This matches the current client test seam in
   [tests/personalized-story-art-client.test.mjs](../../tests/personalized-story-art-client.test.mjs).

2. **Authenticated upload**
   The browser `POST`s multipart form data to:

   - `/api/stories/the-red-ball/personalized-art`

   with:

   - normalized learner PNG
   - `guardianConsentAccepted=yes`
   - `guardianConsentVersion=<approved version string>`

3. **Worker critical-chunk sanitizer**
   The Worker must not trust the browser-normalized upload as final.

   The Worker revalidates the uploaded PNG signature, critical-chunk order,
   checksums, dimensions, and supported image structure, then rewrites only the
   required critical chunks. It rejects corrupt or ambiguous files and drops
   ancillary metadata rather than forwarding camera-roll chunks.

   Requirements:

   - enforce bounded multipart read through the shared request-body helper;
   - reject any source image whose dimensions exceed the provider input cap;
   - strip any remaining metadata again server-side;
   - never persist the uploaded original bytes;
   - never log the uploaded bytes, object URLs, or prompt payloads.

4. **Scene reference selection**
   The Worker loads one checked-in base watercolor reference for **The Red Ball**
   page 1 from:

   - `public/assets/personalization/the-red-ball-scene-reference.webp`

   This reference is product-owned art, not user content.

5. **Generation**
   The Worker sends only:

   - the sanitized learner PNG;
   - the checked-in scene reference;
   - the constrained prompt version for this slice

   to Cloudflare Workers AI FLUX.2 [klein] 4B.

   Current test seam:

   - provider model: `@cf/black-forest-labs/flux-2-klein-4b`
   - output dimensions: `1152 x 768`
   - returned artifact must pass server-side JPEG, PNG, or WebP signature checks

6. **Private derivative storage**
   The Worker stores only the generated derivative in private R2 under an
   owner-scoped key such as:

   - `personalized-story-art/<encoded_auth_user_id>/<encoded_story_id>/current`

   Regeneration overwrites this one deterministic private object so an older
   derivative cannot become an unreferenced retention leak.

   The original upload is discarded after generation.

7. **Authenticated metadata read**
   The browser `GET`s:

   - `/api/stories/the-red-ball/personalized-art`

   and receives owner-scoped metadata only.

8. **Authenticated asset read**
   The browser `GET`s:

   - `/api/stories/the-red-ball/personalized-art/asset`

   The Worker reads the private R2 object and returns it with:

   - `Cache-Control: private, no-store`
   - `X-Content-Type-Options: nosniff`

   Metadata adds the row update time as a same-origin `?v=` query so React
   reloads the one stable object immediately after regeneration. The browser
   rejects any artwork URL outside this authenticated route shape.

   This derivative is the only image used in the story page and lesson portrait.

## Storage Contract

The minimal storage contract should be one row per owner/story slice, with a
status-driven delete lifecycle.

Minimum row fields:

- `id`
- `auth_user_id`
- `story_id`
- `status`
  Allowed first-pass states:
  - `ready`
  - `deleting`
- `r2_object_key`
- `content_type`
- `guardian_consent_version`
- `guardian_consent_at`
- `provider`
- `prompt_version`
- `created_at`
- `updated_at`

The row exists to prove:

- who owns the derivative;
- which story it belongs to;
- which consent version authorized it;
- which provider and prompt version produced it;
- whether reads must be blocked during deletion.

The row must not contain:

- original image bytes;
- original image URL;
- EXIF or device metadata;
- face embeddings;
- biometric inferences;
- moderation prompt content;
- provider response payloads beyond the final derivative metadata.

## Consent Contract

Generation requires explicit guardian attestation every time.

The first-pass checkbox copy should remain close to the current test seam:

- `I confirm I am the child's guardian or have permission to use this photo.`

Rules:

- generation stays disabled until the box is checked;
- the Worker requires both the attestation and the current consent version;
- the consent version is stored with the derivative row and R2 object metadata;
- changing the approved consent copy or legal meaning requires a new
  `guardianConsentVersion`.

Important version note:

- the current tests use `2026-08-09` as a consent version string;
- treat it as a placeholder policy version label, not as proof of approval or
  an activation date.

Before activation, replace that placeholder with the actually approved legal
version string.

## Privacy Rules

### Original never stored

The original learner photo must never be persisted to:

- D1
- R2
- local build artifacts
- analytics
- logs
- error reporting payloads

The only persisted user-derived artifact is the final private derivative.

### No public delivery

Do not reuse the public immutable background-art pattern from
[background-media-r2.md](../deployment/background-media-r2.md). Personalized
story art is private learner media and must not use:

- public buckets;
- custom public domains;
- immutable cache headers;
- direct static URLs.

### No cross-user leakage

Metadata and asset reads must remain owner-scoped:

- other authenticated users should see empty metadata;
- other authenticated users should receive `404` for asset reads;
- anonymous requests should fail before static asset fallback.

## Deletion Contract

Delete must be a tombstone-plus-purge flow, not an optimistic row delete.

Required order:

1. mark row `deleting`
2. block reads immediately
3. purge the R2 object
4. delete the database row only after purge succeeds

If R2 purge fails:

- keep the row in `deleting`
- keep asset reads blocked
- allow a retry to finish the purge later

This matches the current worker test expectations and is the minimum safe
behavior for private learner media.

## Feature Flags and Release Gates

This feature must remain off by default.

Required flags:

- `PERSONALIZED_STORY_ART_ENABLED=0`
- `PERSONALIZED_STORY_ART_DATA_APPROVED=0`

Both flags must be `1` before the capability reports as enabled.

Rationale:

- `ENABLED` is a product-release gate
- `DATA_APPROVED` is a legal/privacy gate

Neither flag alone is sufficient.

Keep a dedicated upload limiter as part of the slice. The current infrastructure
test expects a strict low-volume limiter and a dedicated private R2 bucket.

## Provider Choice and Terms Review

### First-pass provider choice

Use Cloudflare Workers AI FLUX.2 [klein] 4B for the first slice because:

- the current repository test seam already targets that exact model;
- the model is positioned for fast interactive image generation/editing paths;
- it keeps the first implementation on one Worker-adjacent path with one private
  R2 store and one provider review packet.

Official references:

- Cloudflare Workers AI data usage:
  <https://developers.cloudflare.com/workers-ai/platform/data-usage/>
- Cloudflare FLUX.2 [klein] 4B model page:
  <https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/>
- Cloudflare R2 Workers API:
  <https://developers.cloudflare.com/r2/get-started/workers-api/>
- Cloudflare R2 object lifecycles:
  <https://developers.cloudflare.com/r2/buckets/object-lifecycles/>

### OpenAI comparison rationale

This is not a claim that OpenAI image generation is unusable. It is a first-pass
governance choice.

OpenAI’s official under-18 guidance says developers serving minors should add
extra safeguards, and that organizations should not use OpenAI services to
process personal data of children under 13 or the applicable age of digital
consent without first implementing Zero Data Retention.

Official references:

- OpenAI Under 18 API Guidance:
  <https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance>
- OpenAI data controls / Zero Data Retention:
  <https://developers.openai.com/api/docs/guides/your-data>
- OpenAI usage policies:
  <https://openai.com/policies/usage-policies/>

Cloudflare also exposes OpenAI image models with Zero Data Retention labeling,
including:

- <https://developers.cloudflare.com/ai/models/openai/gpt-image-1.5/>

Even so, the first slice should stay on the existing FLUX.2 [klein] 4B seam
unless and until a separate legal, privacy, and provider-terms review approves a
direct OpenAI or OpenAI-backed alternative for child-photo-derived content.

### Required provider review before activation

Activation must not proceed until the team reviews and signs off on:

- Cloudflare Workers AI data handling for inputs and outputs;
- Black Forest Labs license/terms for FLUX.2 [klein];
- Cloudflare R2 bucket configuration, access boundaries, and lifecycle rules;
- whether any additional internal vendor review is required for child-photo
  derivatives;
- whether moderation or abuse-detection obligations attach to this workflow.

## Logging and Metrics

This slice needs operational metrics, but not content logging.

Allowed metrics:

- upload attempts
- validation failures by reason
- generation attempts
- generation latency buckets
- provider failures by class
- delete attempts
- delete retry counts
- successful story reads
- successful portrait reads

Do not log:

- prompts
- source image bytes
- generated image bytes
- alt text containing learner identity
- object keys
- consent checkbox free-form notes
- raw provider request or response bodies

If request tracing is needed, use opaque IDs only.

## Known Blocker Before Activation

**No account-deletion path is a release blocker.**

Parrot English must not activate personalized story art until account deletion
or an equivalent authenticated data-erasure path can prove all of the following:

- the derivative row is discovered;
- reads are tombstoned;
- the private R2 derivative is purged;
- retries are possible if purge fails;
- no orphaned personalized-art objects remain.

Without that proof, the feature may be implemented behind flags for review, but
must not be enabled in production.

## Activation Checklist

Do not enable the feature until every item below is complete.

### Legal and policy

- guardian attestation copy approved
- consent version string approved
- privacy-policy and guardian-facing disclosure approved
- provider terms and data-handling review completed
- explicit decision recorded for under-13 handling and applicable age-of-digital-consent handling

### Infrastructure

- private R2 bucket exists for personalized story art
- Worker has the R2 binding
- Worker has the AI binding
- dedicated upload limiter exists
- lifecycle rules reviewed for abandoned multipart uploads and any delayed cleanup policy

### Product and code

- The Red Ball page 1 override works
- lesson `"user"` portrait reuse works
- owner-scoped metadata and private asset reads work
- original photo is never stored
- delete tombstone/purge/retry behavior works
- both release flags default to `0`

### Verification

- unit tests for client normalization pass
- unit tests for provider image pipeline pass
- worker tests for auth, ownership, delete, and retry pass
- e2e tests for story panel, story override, and lesson portrait pass
- observability confirms counters and latency without content logging

### Release decision

- account-deletion blocker resolved and tested
- legal/privacy sign-off recorded
- product sign-off recorded
- operations runbook recorded
- only then set:
  - `PERSONALIZED_STORY_ART_DATA_APPROVED=1`
  - `PERSONALIZED_STORY_ART_ENABLED=1`

## Follow-on Work After the First Slice

After the single-story synchronous slice is proven, the next steps can expand in
this order:

1. **Multi-story support**
   Add a controlled mapping for more story/page anchors, one approved scene
   reference per page.

2. **Async generation**
   Move generation off the blocking request path into a job model with explicit
   pending and failed states.

3. **Regeneration and versioning**
   Allow replacing one derivative while preserving safe delete semantics.

4. **Broader portrait reuse**
   Reuse the same derivative across more `"user"` speaking-turn contexts only
   after the initial story/lesson pair is stable.

5. **Admin tooling**
   Add orphan detection, purge verification, and support-safe diagnostics without
   exposing learner media.

6. **Account deletion integration**
   Make personalized-art purge a first-class part of the account-deletion flow,
   then remove the current activation blocker.

## Summary

The correct first move is not "store a child photo and use it everywhere." The
correct first move is:

- generate one private derivative for **The Red Ball** page 1;
- reuse that derivative as the lesson **"You"** portrait;
- never store the original;
- require explicit guardian attestation and versioning;
- keep release and data-approval flags off by default;
- block activation until deletion and provider/legal review are complete.
